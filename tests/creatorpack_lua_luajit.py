#!/usr/bin/env python3
"""Run the CreatorPack GE extension inside real LuaJIT 2.1 (the VM BeamNG uses).

Requires: pip install lupa   (bundles LuaJIT 2.1 with string.buffer)

The BeamNG APIs are mocked to behave like the real game, based on BeamNG's own
Lua sources:
  * FS is an object with colon methods only (findFiles, fileExists, directoryExists,
    directoryCreate, stat, getUserPath). There is NO FS:readFile.
  * io.readFileToBuffer(path, buffer) reads any VFS file (mod "ZIP" or user folder).
  * io.open is sandboxed: absolute paths are rejected, relative paths live in the
    user folder (this is how jsonWriteFile('settings/...') behaves in the game).
  * Engine.Platform.exploreFolder(path) and guihooks.trigger(name, data) are recorded.
"""
import base64
import os
import random
import shutil
import sys
import tempfile

try:
    from lupa import luajit21
except ImportError:  # pragma: no cover
    print('lupa is required: pip install lupa')
    sys.exit(2)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
MOD_ROOT = os.path.join(ROOT, 'CreatorPack')
LUA_FILE = os.path.join(MOD_ROOT, 'lua', 'ge', 'extensions', 'creatorpack.lua')

passed = []


class T:
    """Read lupa tables (encoding=None) with normal str keys."""
    def __init__(self, t):
        self.t = t

    def __getitem__(self, k):
        return wrap(self.t[k.encode() if isinstance(k, str) else k])

    def values(self):
        return [wrap(v) for v in self.t.values()]

    def __len__(self):
        return len(self.t)

    def __bool__(self):
        return True


def wrap(v):
    if v is not None and type(v).__name__ == '_LuaTable':
        return T(v)
    return v


class Mod:
    """Calls into the Lua module return wrapped tables."""
    def __init__(self, m):
        self.m = m

    def __getattr__(self, name):
        f = getattr(self.m, name)
        if name == '_internal':
            return Mod(f)
        if callable(f):
            return lambda *a: wrap(f(*[x.encode('utf-8') if isinstance(x, str) else (x.t if isinstance(x, T) else x) for x in a]))
        return wrap(f)


def ok(name):
    passed.append(name)
    print('✓ ' + name)


def png_bytes(w=3, h=2, extra=0):
    """A real, valid PNG (optionally padded with an ancillary chunk to make it big)."""
    import struct
    import zlib

    def chunk(kind, data):
        c = struct.pack('>I', len(data)) + kind + data
        return c + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

    raw = b''.join(b'\x00' + bytes([(x * 40) % 256, (y * 90) % 256, 200, 255]) * 1 for y in range(h) for x in range(w))
    rows = b''
    for y in range(h):
        rows += b'\x00' + b''.join(bytes([(x * 40) % 256, (y * 90) % 256, 200, 255]) for x in range(w))
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
    if extra:
        rnd = random.Random(7)
        out += chunk(b'tEXt', b'pad\x00' + bytes(rnd.randrange(32, 127) for _ in range(extra)))
    out += chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
    return out


class LuaW:
    def __init__(self, lua):
        self.lua = lua

    def eval(self, code):
        return wrap(self.lua.eval(code.encode('utf-8') if isinstance(code, str) else code))

    def execute(self, code):
        return wrap(self.lua.execute(code.encode('utf-8') if isinstance(code, str) else code))


class World:
    def __init__(self):
        self.tmp = tempfile.mkdtemp(prefix='cp-luajit-')
        self.user = os.path.join(self.tmp, 'user')
        os.makedirs(self.user)
        self.explored = []

    # VFS: the user folder overrides the mod "ZIP" (read-only)
    def real(self, vpath, for_write=False):
        v = vpath.replace('\\', '/')
        if not v.startswith('/'):
            v = '/' + v
        u = os.path.join(self.user, v.lstrip('/'))
        if for_write or os.path.exists(u):
            return u
        m = os.path.join(MOD_ROOT, v.lstrip('/'))
        return m if os.path.exists(m) else u

    def find_files(self, d, pattern, depth):
        d = d.replace('\\', '/')
        if not d.startswith('/'):
            d = '/' + d
        if not d.endswith('/'):
            d += '/'
        names = {}
        for base in (MOD_ROOT, self.user):
            folder = os.path.join(base, d.lstrip('/'))
            if os.path.isdir(folder):
                for n in os.listdir(folder):
                    if os.path.isfile(os.path.join(folder, n)) and (pattern in ('*', '*.*') and ('.' in n or pattern == '*')):
                        names[n.lower()] = d + n
        return sorted(names.values(), key=str.lower)

    def read(self, vpath):
        p = self.real(vpath)
        if os.path.isfile(p):
            with open(p, 'rb') as fh:
                return fh.read()
        return None


def make_runtime(world):
    lua = luajit21.LuaRuntime(unpack_returned_tuples=True, encoding=None)
    g = lua.globals()
    py = lua.table()
    py.findFiles = lambda d, pat, depth, full, dirs: lua.table_from([s.encode() for s in world.find_files(d.decode(), pat.decode(), depth)])
    py.fileExists = lambda p: os.path.isfile(world.real(p.decode()))
    py.dirExists = lambda p: os.path.isdir(world.real(p.decode()))
    py.mkdir = lambda p: (os.makedirs(world.real(p.decode(), True), exist_ok=True) or True)
    py.read = lambda p: world.read(p.decode())
    py.size = lambda p: os.path.getsize(world.real(p.decode()))
    py.mtime = lambda p: int(os.path.getmtime(world.real(p.decode())))
    py.userRoot = (world.user.replace('\\', '/') + '/').encode()
    py.explore = lambda p: world.explored.append(p.decode())
    g.py = py
    lua.execute(b'''
      events = {}
      guihooks = { trigger = function(name, data) events[#events + 1] = { name = name, data = data } end }
      be = { getPlayerVehicleID = function() return nil end }
      core_vehicles = { getCurrentVehicleDetails = function() return {} end }
      Engine = { Platform = { exploreFolder = function(p) py.explore(p) end } }
      local FSobj = {}
      function FSobj:findFiles(d, pat, depth, full, dirs) return py.findFiles(d, pat, depth, full, dirs) end
      function FSobj:fileExists(p) return py.fileExists(p) end
      function FSobj:directoryExists(p) return py.dirExists(p) end
      function FSobj:directoryCreate(p, rec) return py.mkdir(p) and 0 or 1 end
      function FSobj:stat(p) if not py.fileExists(p) then return nil end return { filesize = py.size(p), modtime = py.mtime(p) } end
      function FSobj:getUserPath() return py.userRoot end
      FS = FSobj
      assert(FS.readFile == nil, 'the real FS has no readFile')
      io.readFileToBuffer = function(p, buf)
        local d = py.read(p)
        if d == nil then return false end
        buf:reset(); buf:put(d)
        return true
      end
      local realOpen = io.open
      io.open = function(p, mode)
        p = tostring(p)
        if p:sub(1, 1) == '/' or p:match('^%a:') then return nil, 'sandbox: absolute path rejected' end
        if mode and mode:find('[wa]') then
          local dir = (py.userRoot .. p):match('^(.*)/[^/]+$')
          if dir then os.execute('mkdir -p "' .. dir .. '"') end
        end
        return realOpen(py.userRoot .. p, mode)
      end
      function lastEvent(name)
        for i = #events, 1, -1 do if events[i].name == name then return events[i].data end end
      end
      function eventsNamed(name)
        local out = {}
        for i = 1, #events do if events[i].name == name then out[#out + 1] = events[i].data end end
        return out
      end
    ''')
    with open(LUA_FILE, 'rb') as fh:
        src = fh.read()
    M = lua.execute(b'local src = ...; return assert(loadstring(src, "@creatorpack.lua"))()', src)
    return LuaW(lua), Mod(M)


def collect_file(lua, M, req_id, max_frames=200):
    """Reassemble 'creatorpack.filedata' chunks for one request id (pumping onUpdate)."""
    parts, n, frames = {}, None, 0
    seen = 0
    while True:
        evs = lua.eval('eventsNamed("creatorpack.filedata")')
        count = len(evs)
        for i in range(seen + 1, count + 1):
            e = evs[i]
            if e['id'] != req_id:
                continue
            if e['err']:
                return None, e['err'].decode() if isinstance(e['err'], bytes) else e['err']
            n = int(e['n'])
            parts[int(e['i'])] = e['data']
        seen = count
        if n is not None and len(parts) == n:
            b64 = b''.join(parts[i] for i in range(1, n + 1))
            return base64.b64decode(b64), None
        frames += 1
        if frames > max_frames:
            return None, 'timeout (got %d/%s chunks)' % (len(parts), n)
        M.onUpdate(0.016)


def main():
    world = World()
    try:
        udir = os.path.join(world.user, 'CreatorPack', 'imazhet')
        os.makedirs(udir)
        files = {
            'foto (2).png': png_bytes(4, 3),
            'Makina ë ç.jpg': b'\xff\xd8\xff\xe0' + bytes(range(256)) * 4,
            'IMG_0001.JPG': b'\xff\xd8\xff\xe1' + b'x' * 100,
            'logo_bmw.jfif': b'\xff\xd8\xff\xdb' + b'y' * 64,
            'anim.gif': b'GIF89a' + b'z' * 30,
            "quote's #1 50%.png": png_bytes(2, 2),
            'big photo.png': png_bytes(8, 8, extra=2_500_000),
            'iphone.HEIC': b'\x00\x00\x00\x18ftypheic',
            'notes.txt': b'not an image',
        }
        for name, data in files.items():
            with open(os.path.join(udir, name), 'wb') as fh:
                fh.write(data)

        lua, M = make_runtime(world)
        assert M.onExtensionLoaded() is True
        ok('LuaJIT 2.1 loads the 6.3.0 extension with the real BeamNG API shape (no FS.readFile)')

        # --- base64 against Python, every remainder ---------------------------------
        rnd = random.Random(42)
        for length in list(range(0, 70)) + [4095, 4096, 4097, 12287, 12288, 30001]:
            raw = bytes(rnd.randrange(256) for _ in range(length))
            enc = M._internal.base64Encode(raw)
            assert enc == base64.b64encode(raw), length
            assert M._internal.base64Decode(enc) == raw, length
        ok('Lua base64 encode/decode match Python for every remainder and chunk boundary')

        # --- gallery list -------------------------------------------------------------
        r = M.pfhudListImages()
        assert r['ok'] is True
        names = [f['name'].decode() for f in r['files'].values()]
        users = [f['name'].decode() for f in r['files'].values() if f['user']]
        for n in ['foto (2).png', 'Makina ë ç.jpg', 'IMG_0001.JPG', 'logo_bmw.jfif', 'anim.gif', "quote's #1 50%.png", 'big photo.png']:
            assert n in users, ('missing user image', n, users)
        assert 'notes.txt' not in names and 'iphone.HEIC' not in names
        skipped = [s['name'].decode() for s in r['skipped'].values()]
        assert skipped == ['iphone.HEIC'], skipped
        assert 'volvo.png' in names and 'bmw.png' in names
        assert r['userCount'] == 7 and r['modCount'] >= 87, (r['userCount'], r['modCount'])
        assert r['userReal'].decode().endswith('/user/CreatorPack/imazhet/')
        assert lua.eval('lastEvent("creatorpack.images").ok') is True
        first = list(r['files'].values())[0]
        assert first['user'] and first['size'] > 0 and first['mtime'] > 0
        ok('Gallery merges your CreatorPack/imazhet (7 incl. spaces, ë, (2), .JPG, .jfif) with %d mod images; HEIC reported' % r['modCount'])

        # --- image data with a tricky name, from the user folder ----------------------
        target = '/CreatorPack/imazhet/foto (2).png'
        M.pfhudImageData(target, 'img:' + target)
        data, err = collect_file(lua, M, ('img:' + target).encode())
        assert err is None and data == files['foto (2).png'], err
        target2 = '/CreatorPack/imazhet/Makina ë ç.jpg'
        M.pfhudImageData(target2.encode('utf-8'), ('img:' + target2).encode('utf-8'))
        data, err = collect_file(lua, M, ('img:' + target2).encode('utf-8'))
        assert err is None and data == files['Makina ë ç.jpg'], err
        ok('Base64 bridge reads "foto (2).png" and "Makina ë ç.jpg" byte-for-byte (was impossible in 6.2.0)')

        # --- image data from inside the mod "ZIP" --------------------------------------
        mp = '/ui/modules/apps/CreatorPack/imazhet/volvo.png'
        M.pfhudImageData(mp, 'img:' + mp)
        data, err = collect_file(lua, M, ('img:' + mp).encode())
        with open(os.path.join(MOD_ROOT, mp.lstrip('/')), 'rb') as fh:
            assert err is None and data == fh.read(), err
        ok('Bundled volvo.png is read through io.readFileToBuffer, as in the game')

        # --- big file is chunked and paced over frames ---------------------------------
        bp = '/CreatorPack/imazhet/big photo.png'
        lua.execute('events = {}')
        res = M.pfhudImageData(bp, 'img:' + bp)
        assert res['n'] > 4, res['n']
        immediate = len(lua.eval('eventsNamed("creatorpack.filedata")'))
        assert immediate == 4, immediate
        assert M._internal.queued() == res['n'] - 4
        data, err = collect_file(lua, M, ('img:' + bp).encode())
        assert err is None and data == files['big photo.png'], err
        assert M._internal.queued() == 0
        ok('A %.1f MB photo travels in %d chunks (4 per frame) and reassembles exactly' % (len(files['big photo.png']) / 1048576, res['n']))

        # --- path security ---------------------------------------------------------------
        for bad, why in [
            ('/CreatorPack/imazhet/../../settings/x.png', 'rruga nuk lejohet'),
            ('/ui/modules/apps/Other/secret.png', 'rruga nuk lejohet'),
            ('/CreatorPack/imazhet/notes.txt', 'formati .txt nuk lexohet'),
            ('/CreatorPack/imazhet/sub/x.png', 'rruga nuk lejohet'),
            ('', 'rruga mungon'),
        ]:
            r2 = M.pfhudImageData(bad, 'bad')
            assert r2['err'].decode() == why, (bad, r2['err'])
        ok('Image reads stay inside the image folders (no "..", no other apps, images only)')

        # --- logos: your folder first ------------------------------------------------------
        lua.execute('events = {}')
        M.pfhudLogoData('BMW', 'logo:bmw')
        data, err = collect_file(lua, M, b'logo:bmw')
        assert err is None and data == files['logo_bmw.jfif'], err
        M.pfhudLogoData('Nonexistentbrand', 'logo:x')
        assert lua.eval('lastEvent("creatorpack.filedata").err') is not None
        ok('Brand logos are found by file name, your folder first (logo_bmw.jfif)')

        # --- upload: chunked base64 -> real file in the user folder --------------------------
        lua.execute('events = {}')
        up = png_bytes(16, 9)
        b64 = base64.b64encode(up).decode()
        parts = [b64[i:i + 50] for i in range(0, len(b64), 50)]
        for i, part in enumerate(parts):
            res = M.pfhudUploadChunk('up1', 'Fotoja ime (e re).png', i + 1, len(parts), part)
        assert res['ok'] is True, res
        saved = os.path.join(udir, 'Fotoja ime (e re).png')
        with open(saved, 'rb') as fh:
            assert fh.read() == up
        assert lua.eval('lastEvent("creatorpack.uploaded").ok') is True
        assert lua.eval('lastEvent("creatorpack.images").reason') == b'upload'
        for i, part in enumerate(parts):
            res = M.pfhudUploadChunk('up2', 'Fotoja ime (e re).png', i + 1, len(parts), part)
        assert res['path'].decode() == '/CreatorPack/imazhet/Fotoja ime (e re) (2).png', res['path']
        res = M.pfhudUploadChunk('up3', 'x.png', 1, 1, base64.b64encode(b'<script>no image</script>').decode())
        assert res['ok'] is False and res['err'].decode() == 'të dhënat nuk janë foto'
        res = M.pfhudUploadChunk('up4', '../../evil:name?.png', 1, 1, base64.b64encode(up).decode())
        assert res['ok'] is True and res['path'].decode() == '/CreatorPack/imazhet/evilname.png', res['path']
        ok('Uploads are written byte-for-byte to CreatorPack/imazhet with safe, unique names; non-images rejected')

        # --- an io.open that only accepts VFS paths with a leading "/" (like '/settings/x.json')
        lua.execute('''
          local strictOpen = io.open
          io.__saved = strictOpen
          io.open = function(p, mode)
            p = tostring(p)
            if p:sub(1, 1) ~= '/' then return nil, 'relative paths rejected in this variant' end
            return io.__saved(p:sub(2), mode)
          end
        ''')
        for i, part in enumerate(parts):
            res = M.pfhudUploadChunk('up5', 'vetem me slash.png', i + 1, len(parts), part)
        assert res['ok'] is True and res['path'].decode() == '/CreatorPack/imazhet/vetem me slash.png', res['err']
        with open(os.path.join(udir, 'vetem me slash.png'), 'rb') as fh:
            assert fh.read() == up
        lua.execute('io.open = io.__saved')
        ok('If io.open only accepts "/CreatorPack/..." the upload falls back to that form and still lands in the user folder')

        # --- open folder ------------------------------------------------------------------
        shutil.rmtree(udir)
        res = M.pfhudOpenImageFolder()
        assert res['ok'] is True and res['created'] is True
        assert world.explored == ['/CreatorPack/imazhet/'], world.explored
        assert os.path.isfile(os.path.join(udir, 'VENDOSI_FOTOT_KETU.txt'))
        assert lua.eval('lastEvent("creatorpack.folder").real').decode().endswith('/user/CreatorPack/imazhet/')
        ok('"Hap folderin" creates <user>/CreatorPack/imazhet (with a note) and opens it via Engine.Platform.exploreFolder')

        # --- automatic refresh when files change ------------------------------------------
        lua.execute('events = {}')
        with open(os.path.join(udir, 'e re.png'), 'wb') as fh:
            fh.write(png_bytes(2, 2))
        changed = lua.eval('{ { filename = "/CreatorPack/imazhet/e re.png" } }')
        M.onFilesChanged(changed)
        M.onUpdate(0.3)
        assert lua.eval('lastEvent("creatorpack.images")') is None
        M.onUpdate(0.4)
        r = lua.eval('lastEvent("creatorpack.images")')
        assert r is not None and r['reason'] == b'auto'
        assert 'e re.png' in [f['name'].decode() for f in r['files'].values()]
        M.onFilesChanged(lua.eval('{ { filename = "/levels/foo/info.json" } }'))
        lua.execute('events = {}')
        M.onUpdate(1.0)
        assert lua.eval('lastEvent("creatorpack.images")') is None
        ok('onFilesChanged refreshes the gallery by itself (debounced) when a photo is copied into the folder')

        print('\n%d LuaJIT checks passed.' % len(passed))
    finally:
        shutil.rmtree(world.tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
