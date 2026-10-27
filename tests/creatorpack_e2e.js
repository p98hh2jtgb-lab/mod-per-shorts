/* CreatorPack 6.3 end-to-end: real Chromium UI  <->  real creatorpack.lua (Fengari Lua VM).
 *
 *   node tests/creatorpack_e2e.js
 *   env: BROWSER_TEST_MODULES=<dir with playwright-core, @sparticuz/chromium, angular, fengari>
 *        AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x   (sandbox chromium only)
 *        CREATORPACK_SHOTS=/tmp                    (screenshots)
 *
 * The BeamNG side is simulated the way the game behaves:
 *   - bngApi.engineLua(cmd, cb): with a callback BeamNG sends
 *       guihooks.trigger("onBNGAPICallback", id, <cmd>)
 *     so cmd must be one expression; invalid Lua is dropped (as in the game) and fails the test.
 *   - guihooks.trigger(name, data) becomes $rootScope.$broadcast(name, data) in the page.
 *   - A 16 ms game loop calls extensions.creatorpack.onUpdate(dt).
 *   - FS:findFiles / fileExists / directoryCreate / stat / getUserPath, io.readFileToBuffer,
 *     a sandboxed io.open (relative paths only -> user folder), Engine.Platform.exploreFolder.
 *   - VFS = mod folder (the ZIP) + a temporary user folder.
 * Two passes: (A) CEF serves user-folder URLs; (B) "strict" CEF that refuses them, so every
 * user photo must come through the Lua base64 bridge.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const assert = require('assert');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const MOD_ROOT = path.join(ROOT, 'CreatorPack');
const MODULES = process.env.BROWSER_TEST_MODULES || path.join(__dirname, 'node_modules');
const SHOTS = process.env.CREATORPACK_SHOTS || os.tmpdir();
const { chromium: playwright } = require(path.join(MODULES, 'playwright-core'));
const fengari = require(process.env.FENGARI_PATH || path.join(MODULES, 'fengari'));
const { lua, lauxlib, lualib, to_luastring } = fengari;
const bundled = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, 'ui/modules/apps/CreatorPack/gallery.json'), 'utf8'));
const LUA_SOURCE = fs.readFileSync(path.join(MOD_ROOT, 'lua/ge/extensions/creatorpack.lua'), 'utf8');

const results = [];
function ok(name) { results.push(name); console.log('✓ ' + name); }

// ---------------------------------------------------------------- test images
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function makePng(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 1 })), pngChunk('IEND', Buffer.alloc(0))]);
}
function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

// ---------------------------------------------------------------- simulated BeamNG Lua side
function makeBeamNG(userRoot) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const events = [];
  const explored = [];
  const syntaxErrors = [];
  const toVfs = p => { p = String(p).replace(/\\/g, '/'); return p.startsWith('/') ? p : '/' + p; };
  const real = (vpath, forWrite) => {
    const v = toVfs(vpath).replace(/^\/+/, '');
    const u = path.join(userRoot, v);
    if (forWrite || fs.existsSync(u)) return u;
    const m = path.join(MOD_ROOT, v);
    return fs.existsSync(m) ? m : u;
  };
  function fn(name, impl) { lua.lua_pushcfunction(L, impl); lua.lua_setglobal(L, to_luastring(name)); }
  const str = i => lua.lua_tojsstring(L, i);
  fn('__findFiles', L2 => {
    let dir = toVfs(str(1)); if (!dir.endsWith('/')) dir += '/';
    const names = new Map();
    for (const base of [MOD_ROOT, userRoot]) {
      const folder = path.join(base, dir.replace(/^\/+/, ''));
      if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) continue;
      for (const n of fs.readdirSync(folder)) if (fs.statSync(path.join(folder, n)).isFile() && n.includes('.')) names.set(n.toLowerCase(), dir + n);
    }
    lua.lua_newtable(L);
    [...names.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).forEach((p, i) => {
      lua.lua_pushstring(L, to_luastring(p)); lua.lua_rawseti(L, -2, i + 1);
    });
    return 1;
  });
  fn('__fileExists', () => { lua.lua_pushboolean(L, fs.existsSync(real(str(1))) && fs.statSync(real(str(1))).isFile()); return 1; });
  fn('__dirExists', () => { const p = real(str(1).replace(/\/$/, '')); lua.lua_pushboolean(L, fs.existsSync(p) && fs.statSync(p).isDirectory()); return 1; });
  fn('__mkdir', () => { fs.mkdirSync(real(str(1), true), { recursive: true }); lua.lua_pushnumber(L, 0); return 1; });
  fn('__stat', () => {
    const p = real(str(1));
    if (!fs.existsSync(p)) { lua.lua_pushnil(L); return 1; }
    const st = fs.statSync(p);
    lua.lua_newtable(L);
    lua.lua_pushnumber(L, st.size); lua.lua_setfield(L, -2, to_luastring('filesize'));
    lua.lua_pushnumber(L, Math.floor(st.mtimeMs / 1000)); lua.lua_setfield(L, -2, to_luastring('modtime'));
    return 1;
  });
  fn('__userPath', () => { lua.lua_pushstring(L, to_luastring(userRoot.replace(/\\/g, '/') + '/')); return 1; });
  fn('__read', () => {
    const p = real(str(1));
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) { lua.lua_pushnil(L); return 1; }
    lua.lua_pushstring(L, new Uint8Array(fs.readFileSync(p)));
    return 1;
  });
  fn('__writeRel', () => {
    const rel = str(1);
    if (rel.startsWith('/') || /^[a-z]:/i.test(rel)) { lua.lua_pushboolean(L, false); return 1; }   // sandbox
    const target = path.join(userRoot, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(lua.lua_tostring(L, 2)));
    lua.lua_pushboolean(L, true);
    return 1;
  });
  fn('__explore', () => { explored.push(str(1)); return 0; });
  fn('__emit', () => { events.push({ name: str(1), data: JSON.parse(str(2)) }); return 0; });
  fn('__src', () => { lua.lua_pushstring(L, to_luastring(LUA_SOURCE)); return 1; });

  run(`
    local function esc(s)
      return '"' .. s:gsub('[%c"\\\\]', function(c)
        local map = { ['"'] = '\\\\"', ['\\\\'] = '\\\\\\\\', ['\\n'] = '\\\\n', ['\\r'] = '\\\\r', ['\\t'] = '\\\\t' }
        return map[c] or string.format('\\\\u%04x', c:byte())
      end) .. '"'
    end
    function jsonEncode(v)
      local t = type(v)
      if t == 'nil' then return 'null' end
      if t == 'boolean' then return v and 'true' or 'false' end
      if t == 'number' then return (v ~= v or v == math.huge or v == -math.huge) and 'null' or string.format('%.14g', v) end
      if t == 'string' then return esc(v) end
      if t == 'table' then
        local n = #v
        local isArray = n > 0
        if isArray then for k in pairs(v) do if type(k) ~= 'number' or k < 1 or k > n or k % 1 ~= 0 then isArray = false break end end end
        local out = {}
        if isArray then
          for i = 1, n do out[i] = jsonEncode(v[i]) end
          return '[' .. table.concat(out, ',') .. ']'
        end
        for k, x in pairs(v) do out[#out + 1] = esc(tostring(k)) .. ':' .. jsonEncode(x) end
        return '{' .. table.concat(out, ',') .. '}'
      end
      return 'null'
    end
    guihooks = { trigger = function(name, data) __emit(name, jsonEncode(data)) end }
    be = { getPlayerVehicleID = function() return 1 end, getObjectByID = function() return { JBeam = 'pickup' } end }
    core_vehicles = { getCurrentVehicleDetails = function() return { model = { Brand = 'Gavril', Name = 'D-Series' } } end }
    Engine = { Platform = { exploreFolder = function(p) __explore(p) end } }
    local FSobj = {}
    function FSobj:findFiles(d, pat, depth, full, dirs) return __findFiles(d, pat, depth) end
    function FSobj:fileExists(p) return __fileExists(p) end
    function FSobj:directoryExists(p) return __dirExists(p) end
    function FSobj:directoryCreate(p, rec) return __mkdir(p) end
    function FSobj:stat(p) return __stat(p) end
    function FSobj:getUserPath() return __userPath() end
    FS = FSobj
    package.loaded['string.buffer'] = (function()
      local B = {}; B.__index = B
      function B:put(x) self.s = self.s .. x; return self end
      function B:reset() self.s = ''; return self end
      function B:tostring() return self.s end
      return { new = function() return setmetatable({ s = '' }, B) end }
    end)()
    io = io or {}
    io.readFileToBuffer = function(p, buf) local d = __read(p); if d == nil then return false end; buf:reset(); buf:put(d); return true end
    io.open = function(p, mode)
      p = tostring(p)
      if p:sub(1, 1) == '/' or p:match('^%a:') then return nil, 'sandbox: absolute path rejected' end
      if mode and mode:find('w') then
        local acc = {}
        return { write = function(self, d) acc[#acc + 1] = d end, close = function() assert(__writeRel(p, table.concat(acc)), 'write failed') end }
      end
      local d = __read('/' .. p)
      if d == nil then return nil, 'missing' end
      return { read = function() return d end, close = function() end }
    end
    extensions = {}
    function extensions.load(name)
      if name == 'creatorpack' and not extensions.creatorpack then
        extensions.creatorpack = assert(load(__src(), '@creatorpack.lua'))()
        extensions.creatorpack.onExtensionLoaded()
      end
    end
  `);

  function run(code) {
    if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== lua.LUA_OK) throw new Error('Lua load: ' + str(-1));
    if (lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) throw new Error('Lua run: ' + str(-1));
  }
  return {
    events, explored, syntaxErrors,
    // What BeamNG does with bngApi.engineLua(cmd[, callback])
    engineLua(cmd, hasCallback) {
      const chunk = hasCallback ? 'guihooks.trigger("onBNGAPICallback",1,' + cmd + ')' : cmd;
      if (lauxlib.luaL_loadstring(L, to_luastring(chunk)) !== lua.LUA_OK) {
        syntaxErrors.push(str(-1) + '  <-  ' + cmd.slice(0, 160));
        lua.lua_pop(L, 1);
        return;                                       // the game drops it with a console error
      }
      if (lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) { syntaxErrors.push('runtime: ' + str(-1)); lua.lua_pop(L, 1); }
    },
    tick() { run('if extensions.creatorpack then extensions.creatorpack.onUpdate(0.016) end'); },
    filesChanged(vpath) {
      run('if extensions.creatorpack then extensions.creatorpack.onFilesChanged({ { filename = ' +
        JSON.stringify(vpath) + ' } }) end');
    }
  };
}

// ---------------------------------------------------------------- web server (CEF)
async function makeServer(userRoot, strict) {
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg', '.webp': 'image/webp',
    '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    requests.push(url.pathname);
    if (url.pathname === '/angular.js') { res.writeHead(200, { 'Content-Type': mime['.js'] }); fs.createReadStream(path.join(MODULES, 'angular/angular.min.js')).pipe(res); return; }
    if (url.pathname === '/preview') {
      res.writeHead(200, { 'Content-Type': mime['.html'] });
      res.end(`<!doctype html><html ng-app="beamng.apps"><head><meta charset="utf-8"><style>
        html,body{margin:0;width:100%;height:100%;overflow:hidden;background:radial-gradient(circle at 70% 15%,#617d91 0,#344d5f 32%,#1b2a38 72%,#101923 100%)}
      </style><script src="/angular.js"></script><script>
        angular.module('beamng.apps', []);
        window.__cbCommands = [];
        window.bngApi = { engineLua: function (cmd, cb) { if (cb) window.__cbCommands.push(cmd); window.__engineLua(cmd, !!cb); } };
        window.__broadcast = function (name, data) {
          angular.element(document.documentElement).injector().get('$rootScope').$broadcast(name, data);
        };
      </script><script src="/ui/modules/apps/CreatorPack/app.js"></script></head>
      <body><creatorpack-panel></creatorpack-panel></body></html>`);
      return;
    }
    let vpath;
    try { vpath = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); res.end(); return; }
    const isUser = vpath.toLowerCase().startsWith('/creatorpack/');
    if (strict && (isUser || url.pathname.includes('%'))) { res.writeHead(404); res.end('strict CEF'); return; }
    const base = isUser ? userRoot : MOD_ROOT;
    const file = path.normalize(path.join(base, vpath));
    if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, requests, url: `http://127.0.0.1:${server.address().port}/preview` };
}

async function openPanel(browser, userRoot, strict, errors) {
  const dbg = m => { if (process.env.E2E_DEBUG) console.log('  … ' + m); };
  const beam = makeBeamNG(userRoot); dbg('lua ready');
  const env = await makeServer(userRoot, strict); dbg('server ' + env.url);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => errors.push((strict ? 'B: ' : 'A: ') + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errors.push((strict ? 'B console: ' : 'A console: ') + m.text()); });
  let delivering = Promise.resolve();
  const deliver = () => {
    delivering = delivering.then(async () => {
      while (beam.events.length) {
        const e = beam.events.shift();
        try { await page.evaluate(([n, d]) => window.__broadcast(n, d), [e.name, e.data]); } catch (err) { /* page closing */ }
      }
    });
    return delivering;
  };
  dbg('page'); await page.exposeFunction('__engineLua', (cmd, hasCallback) => { beam.engineLua(cmd, hasCallback); return deliver(); });
  const loop = setInterval(() => { try { beam.tick(); } catch (e) { errors.push('tick: ' + e.message); } deliver(); }, 16);
  await page.goto(env.url, { waitUntil: 'networkidle' }); dbg('loaded');
  await page.waitForSelector('.cp-panel', { state: 'visible' });
  const scope = fnBody => page.evaluate(new Function('return (function(scope){' + fnBody + '})(angular.element(document.querySelector(".cp-panel")).scope());'));
  return { beam, env, page, scope, deliver, close: async () => { clearInterval(loop); await page.goto('about:blank'); env.server.close(); } };   // no page.close(): --single-process
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-e2e-'));
  const userRoot = path.join(tmp, 'user');
  const userDir = path.join(userRoot, 'CreatorPack', 'imazhet');
  fs.mkdirSync(userDir, { recursive: true });
  const { default: chromium } = await import(pathToFileURL(path.join(MODULES, '@sparticuz', 'chromium', 'build', 'index.js')).href);
  const browser = await playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true });
  const errors = [];
  try {
    // --- test photos: real PNGs and real JPEGs (encoded by Chromium) --------------
    const jpegPage = await browser.newPage();
    const jpeg = Buffer.from(await jpegPage.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 300; c.height = 200;
      const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 300, 200);
      gr.addColorStop(0, '#e63946'); gr.addColorStop(1, '#1d3557'); g.fillStyle = gr; g.fillRect(0, 0, 300, 200);
      g.fillStyle = '#fff'; g.font = 'bold 60px sans-serif'; g.fillText('JPG', 80, 120);
      return c.toDataURL('image/jpeg', 0.9).split(',')[1];
    }), 'base64');
    // keep jpegPage open: the sandbox Chromium runs --single-process and exits when its last page closes
    let seed = 2463534242;
    const noise = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed & 255; };
    const photos = {
      'foto (2).png': makePng(240, 160, (x, y) => [40 + x % 200, 120, 200 - y % 150, 255]),
      'Makina ë ç.jpg': jpeg,
      'IMG_0001.JPG': jpeg,
      'logo_gavril.jfif': jpeg,
      "it's #1 50%.png": makePng(120, 120, (x, y) => [(x * 2) & 255, (y * 2) & 255, 90, x < 60 ? 255 : 120]),
      'big photo.png': makePng(900, 900, () => [noise(), noise(), noise(), 255]),
      'iphone.HEIC': Buffer.from('0000001866747970686569630000', 'hex')
    };
    for (const [name, data] of Object.entries(photos)) fs.writeFileSync(path.join(userDir, name), data);
    assert(photos['big photo.png'].length > 2 * 1024 * 1024, 'big photo must exceed the old 900 KB limit');
    const userImages = Object.keys(photos).filter(n => !/heic$/i.test(n));

    // ======================= PASS A: CEF serves the user folder ======================
    let A = await openPanel(browser, userRoot, false, errors);
    await A.page.click('.cp-nav button:has-text("Fotot")');
    await A.page.waitForFunction(n => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      return s.galleryLuaOk && s.gallery.length === n && document.querySelectorAll('.cp-gallery button').length === n;
    }, bundled.files.length + userImages.length, { timeout: 15000 });
    let state = await A.scope(`return { names: scope.gallery.slice(0, 6).map(g => g.name), user: scope.galleryUserCount,
      skipped: scope.gallerySkipped, info: scope.galleryInfo, folder: scope.userFolderLabel(), tags: document.querySelectorAll('.cp-gallery .cp-tag').length };`);
    assert.deepStrictEqual(state.names.slice().sort(), userImages.slice().sort(), 'your photos come first: ' + JSON.stringify(state.names));
    assert.strictEqual(state.user, 6);
    assert.strictEqual(state.tags, 6);
    assert.deepStrictEqual(state.skipped, ['iphone.HEIC']);
    assert(state.folder.endsWith(path.join('user', 'CreatorPack', 'imazhet').replace(/\//g, '\\')) || state.folder.includes('CreatorPack\\imazhet'), state.folder);
    assert.deepStrictEqual(await A.page.evaluate(() => window.__cbCommands), []);
    ok(`Opening Fotot lists ${bundled.files.length} mod images + your 6 new photos first (spaces, ë/ç, (2), .JPG, .jfif, #/%/'), HEIC reported`);

    await A.page.evaluate(() => { document.querySelector('.cp-gallery').scrollTop = 0; });
    await A.page.waitForFunction(names => names.every(n => {
      const b = [...document.querySelectorAll('.cp-gallery button')].find(x => x.title.startsWith(n + ' ·'));
      const img = b && b.querySelector('img');
      return img && img.complete && img.naturalWidth > 0;
    }), userImages, { timeout: 20000 });
    ok('All 6 new thumbnails load in the panel');
    await A.page.screenshot({ path: path.join(SHOTS, 'creatorpack63-fotot.png') });

    // "Zgjidh foto nga galeria" in Rrethet really opens the gallery for that circle
    await A.page.click('.cp-nav button:has-text("Rrethet")');
    await A.page.locator('.pf-editor').nth(2).locator('button:has-text("Zgjidh foto nga galeria")').click();
    await A.page.waitForSelector('.cp-photos', { state: 'visible' });
    state = await A.scope('return { tab: scope.ui.tab, selected: scope.selected };');
    assert.deepStrictEqual(state, { tab: 'fotot', selected: 2 });
    ok('"Zgjidh foto nga galeria" (circle #3) opens the Fotot gallery with circle #3 selected — fixed');

    await A.page.locator('.cp-gallery button[title^="Makina ë ç.jpg ·"]').click();
    await A.page.waitForFunction(() => String(angular.element(document.querySelector('.cp-panel')).scope().cfg.items[2].image).startsWith('data:image/png'), null, { timeout: 15000 });
    state = await A.page.evaluate(() => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      const col = document.querySelectorAll('.pf-hud .pf-item-col')[2];            // circle #3 in the HUD
      const el = col && col.querySelector('.pf-item-image');
      return { file: s.cfg.items[2].imageFile, bg: el ? getComputedStyle(el).backgroundImage.slice(0, 26) : 'missing' };
    });
    assert.strictEqual(state.file, '/CreatorPack/imazhet/Makina ë ç.jpg');
    assert.strictEqual(state.bg, 'url("data:image/png;base64');
    ok('Clicking "Makina ë ç.jpg" puts it in circle #3 and stores it as base64');

    // Hap folderin
    await A.page.click('.cp-photos button:has-text("Hap folderin")');
    await A.page.waitForFunction(() => /U hap/.test(angular.element(document.querySelector('.cp-panel')).scope().folderNote), null, { timeout: 8000 });
    assert.deepStrictEqual(A.beam.explored, ['/CreatorPack/imazhet/']);
    assert(fs.existsSync(path.join(userDir, 'VENDOSI_FOTOT_KETU.txt')));
    ok('"Hap folderin" opens <user folder>/CreatorPack/imazhet through Engine.Platform.exploreFolder and shows the path');

    // Ngarko nga kompjuteri — a real click opens the file chooser
    const upA = path.join(tmp, 'Fotoja ime.png');
    fs.writeFileSync(upA, makePng(1600, 900, (x, y) => [x % 256, y % 256, 160, (x + y) % 3 ? 255 : 0]));
    const upB = path.join(tmp, 'pamje nga rruga.jpg');
    fs.writeFileSync(upB, jpeg);
    await A.page.evaluate(() => { const s = angular.element(document.querySelector('.cp-panel')).scope(); s.select(0); s.$apply(); });
    const [chooser] = await Promise.all([
      A.page.waitForEvent('filechooser', { timeout: 5000 }),
      A.page.click('.cp-photos label.cp-upload')
    ]);
    assert(chooser.isMultiple(), 'Fotot upload accepts several photos');
    await chooser.setFiles([upA, upB]);
    await A.page.waitForFunction(() => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      return s.uploadBusy === 0 && /u ruajtën/.test(s.uploadNote);
    }, null, { timeout: 30000 });
    state = await A.scope('return { note: scope.uploadNote, img: String(scope.cfg.items[0].image).slice(0, 22), file: scope.cfg.items[0].imageFile };');
    assert.strictEqual(state.img, 'data:image/png;base64,');
    assert.strictEqual(state.file, '/CreatorPack/imazhet/Fotoja ime.png');
    assert(state.note.includes('rrethin #1') && state.note.includes('2 foto u ruajtën'), state.note);
    const savedPng = fs.readFileSync(path.join(userDir, 'Fotoja ime.png'));
    const savedJpg = fs.readFileSync(path.join(userDir, 'pamje nga rruga.jpg'));
    assert.deepStrictEqual(pngSize(savedPng), { w: 1024, h: 576 }, 'stored at most 1024 px, aspect kept');
    assert.deepStrictEqual(jpegSize(savedJpg), { w: 300, h: 200 });
    await A.page.waitForFunction(() => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      return s.gallery.some(g => g.name === 'Fotoja ime.png' && g.user) && s.gallery.some(g => g.name === 'pamje nga rruga.jpg');
    }, null, { timeout: 8000 });
    ok('Real click on "Ngarko nga kompjuteri" opens the file chooser; photo → circle #1, both saved to CreatorPack/imazhet (1024 px) and shown in the gallery');

    // per-circle upload in Rrethet
    await A.page.click('.cp-nav button:has-text("Rrethet")');
    const [chooser2] = await Promise.all([
      A.page.waitForEvent('filechooser', { timeout: 5000 }),
      A.page.locator('.pf-editor').nth(4).locator('label.cp-upload').click()
    ]);
    await chooser2.setFiles([upB]);
    await A.page.waitForFunction(() => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      return s.selected === 4 && String(s.cfg.items[4].image).startsWith('data:image/png') && s.uploadBusy === 0;
    }, null, { timeout: 20000 });
    assert(fs.existsSync(path.join(userDir, 'pamje nga rruga (2).jpg')), 'second copy gets a unique name');
    ok('Per-circle "Ngarko nga kompjuteri" (circle #5) works and never overwrites an existing photo');

    // copy a photo into the folder "from Windows Explorer": gallery updates by itself
    await A.page.click('.cp-nav button:has-text("Fotot")');
    fs.writeFileSync(path.join(userDir, 'kopjuar nga Explorer.png'), makePng(64, 64, () => [250, 200, 0, 255]));
    A.beam.filesChanged('/CreatorPack/imazhet/kopjuar nga Explorer.png');
    await A.page.waitForFunction(() => angular.element(document.querySelector('.cp-panel')).scope().gallery[0].name === 'kopjuar nga Explorer.png', null, { timeout: 8000 });
    ok('A photo copied into the folder appears at the top of the gallery by itself (onFilesChanged)');
    await A.page.screenshot({ path: path.join(SHOTS, 'creatorpack63-uploaded.png') });
    assert.deepStrictEqual(A.beam.syntaxErrors, [], 'every engineLua command must be valid Lua as BeamNG runs it');
    await A.close();

    // ======================= PASS B: strict CEF, Lua base64 only ======================
    let B = await openPanel(browser, userRoot, true, errors);
    await B.page.click('.cp-nav button:has-text("Fotot")');
    await B.page.waitForFunction(() => angular.element(document.querySelector('.cp-panel')).scope().galleryLuaOk, null, { timeout: 15000 });
    const all = await B.scope('return scope.gallery.filter(g => g.user).map(g => g.name);');
    await B.page.evaluate(() => { document.querySelector('.cp-gallery').scrollTop = 0; });
    await B.page.waitForFunction(names => names.every(n => {
      const b = [...document.querySelectorAll('.cp-gallery button')].find(x => x.title.startsWith(n + ' ·'));
      const img = b && b.querySelector('img');
      return img && img.complete && img.naturalWidth > 0 && img.src.startsWith('data:image/');
    }), all.slice(0, 8), { timeout: 60000 });
    assert(B.env.requests.some(p => p.toLowerCase().startsWith('/creatorpack/')), 'URLs were tried first');
    ok('With a CEF that refuses user-folder URLs, thumbnails come through the Lua base64 bridge');

    await B.page.evaluate(() => { const s = angular.element(document.querySelector('.cp-panel')).scope(); s.select(1); s.$apply(); });
    await B.page.locator('.cp-gallery button[title^="big photo.png ·"]').click();
    await B.page.waitForFunction(() => String(angular.element(document.querySelector('.cp-panel')).scope().cfg.items[1].image).startsWith('data:image/png'), null, { timeout: 60000 });
    const big = await B.page.evaluate(() => new Promise(resolve => {
      const s = angular.element(document.querySelector('.cp-panel')).scope();
      const im = new Image(); im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight, kb: Math.round(s.cfg.items[1].image.length / 1024) }); im.src = s.cfg.items[1].image;
    }));
    assert.deepStrictEqual([big.w, big.h], [320, 320]);
    ok(`The ${(photos['big photo.png'].length / 1048576).toFixed(1)} MB "big photo.png" (over the old 900 KB limit) arrives in chunks and is stored as a 320 px photo (${big.kb} KB)`);
    await B.page.screenshot({ path: path.join(SHOTS, 'creatorpack63-strict.png') });
    assert.deepStrictEqual(B.beam.syntaxErrors, [], 'every engineLua command must be valid Lua as BeamNG runs it');
    await B.close();

    assert.deepStrictEqual(errors, [], 'No JavaScript errors');
    ok('No JavaScript errors and every engineLua command compiled the way BeamNG runs it');
    console.log('\n' + results.length + ' end-to-end checks passed. Screenshots: ' + path.join(SHOTS, 'creatorpack63-*.png'));
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
