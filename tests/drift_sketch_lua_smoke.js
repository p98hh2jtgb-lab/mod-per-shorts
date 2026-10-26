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
collisionReloads = 0
current = {x=0,y=0,z=0.6,id=1,fx=1,fy=0}
function vec3(x,y,z) return {x=x,y=y,z=z} end
vehicle = {
  JBeam='testcar',
  getPosition=function(self) return vec3(current.x,current.y,current.z) end,
  getDirectionVector=function(self) return vec3(current.fx,current.fy,0) end,
  getInitialLength=function(self) return 4.8 end,
  getInitialWidth=function(self) return 2.0 end
}
be = {
  getPlayerVehicleID=function(self,index) return current.id end,
  getObjectByID=function(self,id) return vehicle end,
  getPlayerVehicle=function(self,index) return vehicle end,
  reloadCollision=function(self) collisionReloads=collisionReloads+1 end,
  getObjectOOBBCenterXYZ=function(self,id) return current.x+(current.oobbX or 0),current.y,current.z end
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
const script = mocks + `\nlocal M=assert(load(${JSON.stringify(source)},'@${file}'))()\nassert(M.onExtensionLoaded()==true)\nassert(M.uiState().settings.driftWidth==true)\nM.setSetting('driftWidth',false)\nM.setSetting('smooth',false)\nM.setSetting('sides','left')\nassert(M.uiState().settings.sides==nil, 'side selector removed')\nM.setSetting('spacing',2)\nM.setSetting('width',4)\nM.setSetting('maxCones',100)\nM.start()\nassert(lastState().recording==true)\nfor i=1,8 do current.x=i; M.onUpdate(0.1) end\nlocal stopped=M.stop()\nassert(stopped.recording==false)\nassert(stopped.buildCount==1, 'one saved drive')\nassert(stopped.coneCount==8, '7 metre path / 2m spacing / both sides = 8 cones, got '..tostring(stopped.coneCount))\nassert(stopped.pathLength==7)\nassert(#objects==8)\nassert(math.abs(objects[1].position.y+2)<0.001 and math.abs(objects[2].position.y-2)<0.001, 'both cone lines outside minimum driving gap')\nfor i,obj in ipairs(objects) do\n  assert(obj.kind=='TSStatic')\n  assert(obj.deleted==false)\n  assert(obj.inMission==true)\n  assert(obj.collisionType=='None')\n  assert(string.find(obj.shapeName,'/art/shapes/driftsketch/cone.dae',1,true)==1)\n  assert(obj.position.z==0)\nend\n-- Replay does not call clear: meshes remain present and visible in the scene.\nfor i=1,10 do M.onUpdate(0.25) end\nfor i,obj in ipairs(objects) do assert(obj.deleted==false) end\nassert(M.uiState().coneCount==8)\nM.setSetting('mesh','pylon')\nM.rebuild()\nassert(M.uiState().coneCount==8)\nfor i,obj in ipairs(objects) do\n  if i<=8 then assert(obj.deleted==true) else assert(string.find(obj.shapeName,'pylon.dae',1,true)); assert(obj.deleted==false) end\nend\n-- A second drive with another line is kept as an independent build.\ncurrent.x=0; current.y=20; current.id=2\nM.start()\nfor i=1,8 do current.x=i; M.onUpdate(0.1) end\nM.stop()\nassert(M.uiState().buildCount==2)\nassert(M.uiState().coneCount==16)\nM.clear()\nassert(M.uiState().coneCount==0)\nassert(M.uiState().buildCount==0)\nfor i,obj in ipairs(objects) do assert(obj.deleted==true) end\n-- Density cap accounts for both sides and prevents runaway object counts.\nM.setSetting('spacing',1)\ncurrent.x=0; current.y=40\nM.start()\nfor i=1,100 do current.x=i; M.onUpdate(0.1) end\nM.stop()\nassert(M.uiState().coneCount>0 and M.uiState().coneCount<=100)\nM.clear()\n-- Manual width stays exact regardless of vehicle heading.\nM.setSetting('width',2.4)\nM.setSetting('spacing',2)\ncurrent.x=0; current.y=60; current.fx=0; current.fy=1\nM.start()\nfor i=1,8 do current.x=i; M.onUpdate(0.1) end\nM.stop()\nassert(M.uiState().coneCount==8)\nfor i=#objects-7,#objects do\n  assert(math.abs(math.abs(objects[i].position.y-60)-1.2)<0.001, 'manual width must remain exact')\nend\nM.clear()\ncurrent.fx=1; current.fy=0
-- Drift Widen keeps the manual base while straight and expands for the rear when sideways.
M.setSetting('driftWidth',true)
M.setSetting('width',4)
M.setSetting('spacing',2)
M.setSetting('smooth',false)
current.x=0; current.y=80; current.fx=1; current.fy=0
M.start()
for i=1,8 do current.x=i; M.onUpdate(0.1) end
M.stop()
for i=#objects-7,#objects do assert(math.abs(math.abs(objects[i].position.y-80)-2)<0.001, 'straight car keeps base width') end
M.clear()
current.x=0; current.y=100; current.fx=0; current.fy=1
M.start()
for i=1,8 do current.x=i; M.onUpdate(0.1) end
M.stop()
for i=#objects-7,#objects do assert(math.abs(math.abs(objects[i].position.y-100)-2.99)<0.01, 'sideways car must include full length and rear clearance') end
M.setSetting('driftWidth',false)
local fixedLive=0
for i,obj in ipairs(objects) do
  if not obj.deleted then fixedLive=fixedLive+1; assert(math.abs(math.abs(obj.position.y-100)-2)<0.001, 'Drift Widen OFF restores fixed width') end
end
assert(fixedLive==8)
M.clear()
current.fx=1; current.fy=0
-- A curved drive resamples inner and outer arcs independently.
M.setSetting('width',4)
M.setSetting('spacing',1)
M.setSetting('smooth',true)
M.start()
for i=0,60 do
  local angle=(math.pi/2)*i/60
  current.x=10*math.cos(angle); current.y=100+10*math.sin(angle)
  M.onUpdate(0.1)
end
M.stop()
local inner,outer={},{}
for i,obj in ipairs(objects) do
  if not obj.deleted then
    local radius=math.sqrt(obj.position.x^2+(obj.position.y-100)^2)
    if radius<10 then inner[#inner+1]=obj.position else outer[#outer+1]=obj.position end
  end
end
assert(#inner>3 and #outer>#inner, 'outer arc needs more cones than inner arc, got '..tostring(#outer)..' / '..tostring(#inner))
for _,line in ipairs({inner,outer}) do
  for i=2,#line do
    local dx,dy=line[i].x-line[i-1].x,line[i].y-line[i-1].y
    local distance=math.sqrt(dx*dx+dy*dy)
    assert(distance>0.80 and distance<1.08, 'curve spacing must stay near 1m, got '..tostring(distance))
  end
end
-- Solid collision is optional and rebuilds existing paths immediately.
local reloadBefore=collisionReloads
M.setSetting('collision',true)
assert(M.uiState().settings.collision==true)
assert(collisionReloads>reloadBefore)
for i,obj in ipairs(objects) do if not obj.deleted then assert(obj.collisionType=='Visible Mesh Final') end end
M.setSetting('collision',false)
for i,obj in ipairs(objects) do if not obj.deleted then assert(obj.collisionType=='None') end end
M.clear()
-- The recorded path must prefer the real OOBB center over getPosition().
current.oobbX=0.75; current.x=0; current.y=140; current.fx=1; current.fy=0
M.start(); M.onUpdate(0.1)
for i=1,3 do current.x=i; M.onUpdate(0.1) end
M.stop()
local centeredLive={}
for i,obj in ipairs(objects) do if not obj.deleted then centeredLive[#centeredLive+1]=obj end end
assert(#centeredLive==8)
assert(math.abs(centeredLive[1].position.x-0.75)<0.001 and math.abs(centeredLive[2].position.x-0.75)<0.001, 'OOBB center must anchor the path')
M.clear(); current.oobbX=0
-- Rotating in place without translation must not create a false path.
M.start(); M.onUpdate(0.1)
for i=1,30 do current.fx=math.cos(i); current.fy=math.sin(i); M.onUpdate(0.1) end
assert(M.uiState().pointCount==1, 'stationary rotation must not add path points')
M.stop()
assert(M.uiState().statusError==true)
assert(M.uiState().coneCount==0)\nM.onExtensionUnloaded()\nprint('DriftSketch Lua assertions passed')\n`;
const status = lauxlib.luaL_dostring(L, to_luastring(script));
if (status !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
console.log('✓ DriftSketch records any vehicle, builds real TSStatic meshes, keeps replay objects, always builds both sides, preserves base width straight, widens for sideways rear clearance, spaces curves and toggles solid collision');
