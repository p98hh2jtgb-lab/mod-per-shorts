/* Execute the CreatorPack GE extension with mocked BeamNG APIs using Fengari.
 * Install fengari in your test environment or set FENGARI_PATH.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
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
speedValue = 0
vehicle = {
  JBeam = 'testcoupe',
  getVelocity = function(self)
    return { length = function(self) return speedValue / 3.6 end }
  end
}
be = {
  getPlayerVehicleID = function(self, index) return vehicleId end,
  getObject = function(self, id) return vehicle end,
  getObjectByID = function(self, id) return vehicle end,
  getPlayerVehicle = function(self, index) return vehicle end
}
map = { objects = { [1] = {damage=0}, [2] = {damage=0} } }
core_vehicles = {
  getCurrentVehicleDetails = function()
    return { model = {Brand='TestBrand', Name='Coupe'} }
  end
}
FS = {
  findFiles = function(dir, pattern, a, b, c)
    return {'/ui/modules/apps/CreatorPack/imazhet/mercedes.png'}
  end,
  readFile = function(path) return 'abc' end
}
function lastEvent(name)
  for i=#events,1,-1 do if events[i].name == name then return events[i].data end end
  return nil
end
function near(actual, expected, epsilon)
  assert(math.abs(actual-expected) <= epsilon, tostring(actual) .. ' ~= ' .. tostring(expected))
end
`;

const mainFile = 'CreatorPack/lua/ge/extensions/creatorpack.lua';
const mainSource = fs.readFileSync(path.join(ROOT, mainFile), 'utf8');
run('CreatorPack Lua actions/vehicle info/manual image bridge', mocks + `
local M = assert(load(${JSON.stringify(mainSource)}, '@${mainFile}'))()
assert(type(M.onExtensionLoaded) == 'function', 'BeamNG lifecycle must exist')
assert(M.onExtensionLoaded() == true, 'extension load must succeed')
assert(type(M.onExtensionUnloaded) == 'function')
assert(lastEvent('creatorpack.vehicle').brand == 'TestBrand')
M.onExtensionUnloaded()
assert(type(M.pfhudVehicle) == 'function')
assert(type(M.sendVehicleInfo) == 'function')
local info = M.pfhudVehicle()
assert(info.brand == 'TestBrand')
assert(info.model == 'testcoupe')
assert(info.name == 'TestBrand Coupe')
assert(lastEvent('creatorpack.vehicle').brand == 'TestBrand')
M.pfhudToggleShorts()
assert(lastEvent('pfhud.action').action == 'toggleShorts')
M.pfhudPass()
assert(lastEvent('pfhud.action').action == 'pass')
local list = M.pfhudListImages()
assert(list.ok == true)
assert(list.files[1] == '/ui/modules/apps/CreatorPack/imazhet/mercedes.png')
local logo = M.pfhudLogoData('Mercedes-Benz')
assert(logo.data == 'data:image/png;base64,YWJj')
local image = M.pfhudImageData('/ui/modules/apps/CreatorPack/imazhet/mercedes.png')
assert(image.data == 'data:image/png;base64,YWJj')
local denied = M.pfhudImageData('/ui/modules/apps/Other/secret.png')
assert(denied.err == 'rruga nuk lejohet')
assert(M.pfhudAutoPhoto == nil)
`);
