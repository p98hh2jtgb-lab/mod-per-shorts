/* Execute the CreatorPack GE extension with mocked BeamNG APIs using Fengari (Lua 5.3).
 * Install fengari in your test environment or set FENGARI_PATH.
 *
 * The mocks follow the real BeamNG API shape (see tests/creatorpack_lua_luajit.py for
 * the LuaJIT version): FS has colon methods only and NO readFile; files are read with
 * io.readFileToBuffer(path, string.buffer); io.open only accepts relative paths
 * (they live in the user folder). The old mock had FS.readFile, which hid the bug that
 * the base64 fallback could never read a file inside the game.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let fengari;
try {
  fengari = require(process.env.FENGARI_PATH || 'fengari');
} catch (error) {
  console.error('fengari is required: npm install --prefix /tmp/lua-test fengari');
  process.exit(2);
}
const { lua, lauxlib, lualib, to_luastring } = fengari;

function run(name, source) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  const status = lauxlib.luaL_dostring(L, to_luastring(source));
  if (status !== lua.LUA_OK) {
    const message = lua.lua_tojsstring(L, -1);
    throw new Error(name + ': ' + message);
  }
  console.log('✓ ' + name);
}

const mocks = `
events = {}
guihooks = { trigger = function(name, data) table.insert(events, {name=name, data=data}) end }
vehicleId = 1
vehicle = { JBeam = 'testcoupe' }
be = {
  getPlayerVehicleID = function(self, index) return vehicleId end,
  getObjectByID = function(self, id) return vehicle end,
  getPlayerVehicle = function(self, index) return vehicle end
}
core_vehicles = {
  getCurrentVehicleDetails = function()
    return { model = {Brand='TestBrand', Name='Coupe'} }
  end
}
explored = {}
Engine = { Platform = { exploreFolder = function(p) table.insert(explored, p) end } }

-- In-memory VFS: mod ZIP files + user folder files (keys are VFS paths)
vfs = {
  ['/ui/modules/apps/CreatorPack/imazhet/mercedes.png'] = 'abc',
  ['/ui/modules/apps/CreatorPack/imazhet/README.txt'] = 'text',
  ['/CreatorPack/imazhet/foto (2).png'] = '\\137PNG\\r\\n\\026\\nfoto2',
  ['/CreatorPack/imazhet/Makina ë.JPG'] = '\\255\\216\\255jpeg'
}
dirs = { ['/CreatorPack'] = true, ['/CreatorPack/imazhet'] = true }
local function norm(p) p = tostring(p):gsub('\\\\', '/'); if p:sub(1,1) ~= '/' then p = '/' .. p end; return p end
local FSobj = {}
function FSobj:findFiles(dir, pattern, depth, full, addDirs)
  dir = norm(dir); if dir:sub(-1) ~= '/' then dir = dir .. '/' end
  local out = {}
  for p in pairs(vfs) do
    if p:sub(1, #dir) == dir and not p:sub(#dir + 1):find('/', 1, true) then out[#out + 1] = p end
  end
  table.sort(out)
  return out
end
function FSobj:fileExists(p) return vfs[norm(p)] ~= nil end
function FSobj:directoryExists(p) p = norm(p):gsub('/$', ''); return dirs[p] == true end
function FSobj:directoryCreate(p, rec) p = norm(p):gsub('/$', ''); dirs[p] = true; dirs['/CreatorPack'] = true; return 0 end
function FSobj:stat(p) local d = vfs[norm(p)]; if not d then return nil end; return { filesize = #d, modtime = 1700000000 } end
function FSobj:getUserPath() return 'C:/Users/Test/AppData/Local/BeamNG/BeamNG.drive/current/' end
FS = FSobj

-- Minimal LuaJIT string.buffer (Fengari is Lua 5.3 and has none)
package.loaded['string.buffer'] = (function()
  local B = {}; B.__index = B
  function B:put(x) self.s = self.s .. x; return self end
  function B:reset() self.s = ''; return self end
  function B:tostring() return self.s end
  return { new = function() return setmetatable({ s = '' }, B) end }
end)()
io.readFileToBuffer = function(p, buf)
  local d = vfs[norm(p)]
  if d == nil then return false end
  buf:reset(); buf:put(d)
  return true
end
io.open = function(p, mode)
  p = tostring(p)
  if p:sub(1, 1) == '/' then return nil, 'sandbox: absolute path' end
  local key = '/' .. p
  if mode and mode:find('w') then
    return { write = function(self, d) vfs[key] = (vfs[key] or '') .. d end, close = function() end }
  end
  if not vfs[key] then return nil, 'missing' end
  return { read = function() return vfs[key] end, close = function() end }
end

function lastEvent(name)
  for i=#events,1,-1 do if events[i].name == name then return events[i].data end end
  return nil
end
function joinChunks(id)
  local parts, n = {}, 0
  for _, e in ipairs(events) do
    if e.name == 'creatorpack.filedata' and e.data.id == id then
      assert(not e.data.err, tostring(e.data.err))
      parts[e.data.i] = e.data.data; n = e.data.n
    end
  end
  assert(n > 0 and #parts == n, 'missing chunks for ' .. id)
  return table.concat(parts)
end
`;

const mainFile = 'CreatorPack/lua/ge/extensions/creatorpack.lua';
const mainSource = fs.readFileSync(path.join(ROOT, mainFile), 'utf8');
run('CreatorPack Lua actions, vehicle info, gallery, base64 bridge, upload and open-folder (Lua 5.3)', mocks + `
local M = assert(load(${JSON.stringify(mainSource)}, '@${mainFile}'))()
assert(type(M.onExtensionLoaded) == 'function', 'BeamNG lifecycle must exist')
assert(M.onExtensionLoaded() == true, 'extension load must succeed')
assert(type(M.onExtensionUnloaded) == 'function')
assert(lastEvent('creatorpack.vehicle').brand == 'TestBrand')
local info = M.pfhudVehicle()
assert(info.brand == 'TestBrand' and info.model == 'testcoupe' and info.name == 'TestBrand Coupe')
M.pfhudToggleShorts()
assert(lastEvent('pfhud.action').action == 'toggleShorts')
M.pfhudPass()
assert(lastEvent('pfhud.action').action == 'pass')

-- Gallery: your folder + the mod folder, images only
local list = M.pfhudListImages()
assert(list.ok == true)
local byName = {}
for _, f in ipairs(list.files) do byName[f.name] = f end
assert(byName['mercedes.png'] and byName['mercedes.png'].user == false)
assert(byName['foto (2).png'] and byName['foto (2).png'].user == true)
assert(byName['Makina ë.JPG'] and byName['Makina ë.JPG'].user == true)
assert(byName['README.txt'] == nil)
assert(list.userCount == 2 and list.modCount == 1)
assert(list.userReal == 'C:/Users/Test/AppData/Local/BeamNG/BeamNG.drive/current/CreatorPack/imazhet/')
assert(lastEvent('creatorpack.images').files[1] ~= nil)

-- Base64 bridge (events in chunks), including spaces/parentheses and ë in names
M.pfhudImageData('/ui/modules/apps/CreatorPack/imazhet/mercedes.png', 'img:a')
assert(joinChunks('img:a') == 'YWJj')
M.pfhudImageData('/CreatorPack/imazhet/foto (2).png', 'img:b')
assert(M._internal.base64Decode(joinChunks('img:b')) == vfs['/CreatorPack/imazhet/foto (2).png'])
M.pfhudImageData('/CreatorPack/imazhet/Makina ë.JPG', 'img:c')
assert(M._internal.base64Decode(joinChunks('img:c')) == vfs['/CreatorPack/imazhet/Makina ë.JPG'])
M.pfhudLogoData('Mercedes-Benz', 'logo:m')
assert(joinChunks('logo:m') == 'YWJj')
local denied = M.pfhudImageData('/ui/modules/apps/Other/secret.png', 'x')
assert(denied.err == 'rruga nuk lejohet')
assert(M.pfhudImageData('/CreatorPack/imazhet/../x.png', 'y').err == 'rruga nuk lejohet')

-- Upload -> file in the user folder, name collisions get " (2)"
local png = '\\137PNG\\r\\n\\026\\n' .. string.rep('p', 40)
local b64 = M._internal.base64Encode(png)
local half = math.floor(#b64 / 2)
M.pfhudUploadChunk('u1', 'Foto e re.png', 1, 2, b64:sub(1, half))
local res = M.pfhudUploadChunk('u1', 'Foto e re.png', 2, 2, b64:sub(half + 1))
assert(res.ok == true and res.path == '/CreatorPack/imazhet/Foto e re.png', tostring(res.path))
assert(vfs['/CreatorPack/imazhet/Foto e re.png'] == png)
res = M.pfhudUploadChunk('u2', 'Foto e re.png', 1, 1, b64)
assert(res.path == '/CreatorPack/imazhet/Foto e re (2).png')
assert(M.pfhudUploadChunk('u3', 'x.png', 1, 1, M._internal.base64Encode('hello')).ok == false)
assert(lastEvent('creatorpack.images').reason == 'upload')

-- Open folder
local opened = M.pfhudOpenImageFolder()
assert(opened.ok == true and explored[1] == '/CreatorPack/imazhet/')
assert(vfs['/CreatorPack/imazhet/VENDOSI_FOTOT_KETU.txt'] ~= nil)

-- Auto refresh after files change
events = {}
M.onFilesChanged({ { filename = '/CreatorPack/imazhet/new.png' } })
M.onUpdate(0.7)
assert(lastEvent('creatorpack.images').reason == 'auto')
assert(M.pfhudAutoPhoto == nil)
`);
