/* DriftSketch GE/path/spawn smoke test with mocked BeamNG APIs and Fengari. */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..');
let fengari;
try { fengari = require(process.env.FENGARI_PATH || 'fengari'); }
catch (error) { console.error('fengari is required: npm install --prefix /tmp/lua-test fengari'); process.exit(2); }
const { lua, lauxlib, lualib, to_luastring } = fengari;
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const file = 'DriftSketch/lua/ge/extensions/driftSketch.lua';
const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
const mocks = `
objects = {}
events = {}
current = {x=0,y=0,z=0.6,id=1}
function vec3(x,y,z) return {x=x,y=y,z=z} end
vehicle = {
  JBeam='testcar',
  getPosition=function(self) return vec3(current.x,current.y,current.z) end
}
be = {
  getPlayerVehicleID=function(self,index) return current.id end,
  getObjectByID=function(self,id) return vehicle end,
  getPlayerVehicle=function(self,index) return vehicle end
}
core_vehicles = {getCurrentVehicleDetails=function() return {model={Brand='Test',Name='Any Car'}} end}
guihooks = {trigger=function(name,data) events[#events+1]={name=name,data=data} end}
function lastState()
  for i=#events,1,-1 do if events[i].name=='driftSketch.state' then return events[i].data end end
  return nil
end
scenetree = {MissionGroup={add=function(self,obj) obj.inMission=true end}}
function createObject(kind)
  assert(kind=='TSStatic')
  local obj={kind=kind,deleted=false,collisionType='',inMission=false}
  obj.setField=function(self,key,index,value) if key=='collisionType' then self.collisionType=value end end
  obj.setPosition=function(self,pos) self.position={x=pos.x,y=pos.y,z=pos.z} end
  obj.setScale=function(self,scale) self.scale=scale.x end
  obj.registerObject=function(self,name) self.name=name end
  obj.delete=function(self) self.deleted=true end
  objects[#objects+1]=obj
  return obj
end
function castRayStatic(origin,direction,maxLength) return origin.z end
`;
const script = mocks + `\nlocal M=assert(load(${JSON.stringify(source)},'@${file}'))()\nassert(M.onExtensionLoaded()==true)\nM.setSetting('smooth',false)\nM.setSetting('spacing',2)\nM.setSetting('width',4)\nM.setSetting('maxCones',100)\nM.start()\nassert(lastState().recording==true)\nfor i=1,8 do current.x=i; M.onUpdate(0.1) end\nlocal stopped=M.stop()\nassert(stopped.recording==false)\nassert(stopped.buildCount==1, 'one saved drive')\nassert(stopped.coneCount==8, '7 metre path / 2m spacing / both sides = 8 cones, got '..tostring(stopped.coneCount))\nassert(stopped.pathLength==7)\nassert(#objects==8)\nfor i,obj in ipairs(objects) do\n  assert(obj.kind=='TSStatic')\n  assert(obj.deleted==false)\n  assert(obj.inMission==true)\n  assert(obj.collisionType=='None')\n  assert(string.find(obj.shapeName,'/art/shapes/driftsketch/cone.dae',1,true)==1)\n  assert(obj.position.z==0)\nend\n-- Replay does not call clear: meshes remain present and visible in the scene.\nfor i=1,10 do M.onUpdate(0.25) end\nfor i,obj in ipairs(objects) do assert(obj.deleted==false) end\nassert(M.uiState().coneCount==8)\nM.setSetting('mesh','pylon')\nM.rebuild()\nassert(M.uiState().coneCount==8)\nfor i,obj in ipairs(objects) do\n  if i<=8 then assert(obj.deleted==true) else assert(string.find(obj.shapeName,'pylon.dae',1,true)); assert(obj.deleted==false) end\nend\n-- A second drive with another line is kept as an independent build.\ncurrent.x=0; current.y=20; current.id=2\nM.start()\nfor i=1,8 do current.x=i; M.onUpdate(0.1) end\nM.stop()\nassert(M.uiState().buildCount==2)\nassert(M.uiState().coneCount==16)\nM.clear()\nassert(M.uiState().coneCount==0)\nassert(M.uiState().buildCount==0)\nfor i,obj in ipairs(objects) do assert(obj.deleted==true) end\n-- Density cap accounts for both sides and prevents runaway object counts.\nM.setSetting('spacing',1)\ncurrent.x=0; current.y=40\nM.start()\nfor i=1,100 do current.x=i; M.onUpdate(0.1) end\nM.stop()\nassert(M.uiState().coneCount>0 and M.uiState().coneCount<=100)\nM.clear()\n-- Too-short recordings fail cleanly without spawning anything.\nM.start(); M.onUpdate(0.1); M.stop()\nassert(M.uiState().statusError==true)\nassert(M.uiState().coneCount==0)\nM.onExtensionUnloaded()\nprint('DriftSketch Lua assertions passed')\n`;
const status = lauxlib.luaL_dostring(L, to_luastring(script));
if (status !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
console.log('✓ DriftSketch records any vehicle, builds real TSStatic meshes, keeps replay objects, rebuilds and clears safely');
