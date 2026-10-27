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
function quatFromDir(v)
  local yaw=math.atan(-v.x,v.y)
  return {x=0,y=0,z=math.sin(yaw*0.5),w=math.cos(yaw*0.5)}
end
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
  getObjectOOBBCenterXYZ=function(self,id) return current.x+(current.oobbX or 0),current.y,current.z end,
  getObjectOOBBIsInitialized=function(self,id) return current.oobbAxes==true end,
  getObjectOOBBHalfAxisXYZ=function(self,id,axis)
    if axis==0 then return current.fx*2.9,current.fy*2.9,0 end
    if axis==1 then return -current.fy*1.05,current.fx*1.05,0 end
    return 0,0,0.8
  end
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
  obj.setPosRot=function(self,x,y,z,qx,qy,qz,qw)
    self.position={x=x,y=y,z=z}; self.rotation={x=qx,y=qy,z=qz,w=qw}
  end
  obj.setScale=function(self,scale) self.scale={x=scale.x,y=scale.y,z=scale.z} end
  obj.registerObject=function(self,name) self.name=name end
  obj.delete=function(self) self.deleted=true end
  objects[#objects+1]=obj
  return obj
end
function castRayStatic(origin,direction,maxLength) return origin.z end
function liveObjects()
  local live={}
  for _,obj in ipairs(objects) do if not obj.deleted then live[#live+1]=obj end end
  return live
end
function gateObjects()
  local gates={}
  for _,obj in ipairs(liveObjects()) do
    if string.find(obj.shapeName,'gate_',1,true) then gates[#gates+1]=obj end
  end
  return gates
end
`;
const script = mocks + `\nlocal M=assert(load(${JSON.stringify(source)},'@${file}'))()\nassert(M.onExtensionLoaded()==true)\nassert(M.uiState().settings.driftWidth==true)\nassert(M.uiState().settings.gates==true, 'Start / Finish gates default ON')\nM.setSetting('gates',false)\nM.setSetting('driftWidth',false)\nM.setSetting('smooth',false)\nM.setSetting('sides','left')\nassert(M.uiState().settings.sides==nil, 'side selector removed')\nM.setSetting('spacing',2)\nM.setSetting('width',4)\nM.setSetting('maxCones',100)\nM.start()\nassert(lastState().recording==true)\nfor i=1,8 do current.x=i; M.onUpdate(0.1) end\nlocal stopped=M.stop()\nassert(stopped.recording==false)\nassert(stopped.buildCount==1, 'one saved drive')\nassert(stopped.coneCount==8, '7 metre path / 2m spacing / both sides = 8 cones, got '..tostring(stopped.coneCount))\nassert(stopped.pathLength==7)\nassert(#objects==8)\nassert(math.abs(objects[1].position.y+2)<0.001 and math.abs(objects[2].position.y-2)<0.001, 'both cone lines outside minimum driving gap')\nfor i,obj in ipairs(objects) do\n  assert(obj.kind=='TSStatic')\n  assert(obj.deleted==false)\n  assert(obj.inMission==true)\n  assert(obj.collisionType=='None')\n  assert(string.find(obj.shapeName,'/art/shapes/driftsketch/cone.dae',1,true)==1)\n  assert(obj.position.z==0)\nend\n-- Replay does not call clear: meshes remain present and visible in the scene.\nfor i=1,10 do M.onUpdate(0.25) end\nfor i,obj in ipairs(objects) do assert(obj.deleted==false) end\nassert(M.uiState().coneCount==8)\nM.setSetting('mesh','pylon')\nM.rebuild()\nassert(M.uiState().coneCount==8)\nfor i,obj in ipairs(objects) do\n  if i<=8 then assert(obj.deleted==true) else assert(string.find(obj.shapeName,'pylon.dae',1,true)); assert(obj.deleted==false) end\nend\nM.setSetting('mesh','tire')\nM.rebuild()\nfor i,obj in ipairs(objects) do if not obj.deleted then assert(string.find(obj.shapeName,'tire.dae',1,true)) end end\nM.setSetting('mesh','tireStack')\nM.rebuild()\nfor i,obj in ipairs(objects) do if not obj.deleted then assert(string.find(obj.shapeName,'tire_stack.dae',1,true)) end end\nM.setSetting('mesh','cone')\nM.rebuild()\n-- A second drive with another line is kept as an independent build.\ncurrent.x=0; current.y=20; current.id=2\nM.start()\nfor i=1,8 do current.x=i; M.onUpdate(0.1) end\nM.stop()\nassert(M.uiState().buildCount==2)\nassert(M.uiState().coneCount==16)\nM.clear()\nassert(M.uiState().coneCount==0)\nassert(M.uiState().buildCount==0)\nfor i,obj in ipairs(objects) do assert(obj.deleted==true) end\n-- Density cap accounts for both sides and prevents runaway object counts.\nM.setSetting('spacing',1)\ncurrent.x=0; current.y=40\nM.start()\nfor i=1,100 do current.x=i; M.onUpdate(0.1) end\nM.stop()\nassert(M.uiState().coneCount>0 and M.uiState().coneCount<=100)\nM.clear()\n-- Manual width stays exact regardless of vehicle heading.\nM.setSetting('width',2.4)\nM.setSetting('spacing',2)\ncurrent.x=0; current.y=60; current.fx=0; current.fy=1\nM.start()\nfor i=1,8 do current.x=i; M.onUpdate(0.1) end\nM.stop()\nassert(M.uiState().coneCount==8)\nfor i=#objects-7,#objects do\n  assert(math.abs(math.abs(objects[i].position.y-60)-1.2)<0.001, 'manual width must remain exact')\nend\nM.clear()\ncurrent.fx=1; current.fy=0
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
for i=#objects-7,#objects do
  local lateral=math.abs(objects[i].position.y-100)
  assert(lateral>=2.989 and lateral<3.20, 'sideways car must include full length and rear clearance, got '..tostring(lateral))
end
M.setSetting('mesh','tire')
M.rebuild()
for i,obj in ipairs(objects) do
  if not obj.deleted then assert(math.abs(obj.position.y-100)>=3.19, 'tire radius must be included in drift clearance') end
end
M.setSetting('mesh','cone')
M.setSetting('driftWidth',false)
local fixedLive=0
for i,obj in ipairs(objects) do
  if not obj.deleted then fixedLive=fixedLive+1; assert(math.abs(math.abs(obj.position.y-100)-2)<0.001, 'Drift Widen OFF restores fixed width') end
end
assert(fixedLive==8)
M.clear()
-- Real OOBB half axes include extra rear-wing length when available.
M.setSetting('driftWidth',true)
M.setSetting('width',4)
M.setSetting('spacing',2)
M.setSetting('smooth',false)
current.oobbAxes=true; current.x=0; current.y=120; current.fx=0; current.fy=1
M.start()
for i=1,8 do current.x=i; M.onUpdate(0.1) end
M.stop()
for i=#objects-7,#objects do
  local lateral=math.abs(objects[i].position.y-120)
  assert(lateral>=3.48 and lateral<3.80, 'OOBB rear-wing extent must be included, got '..tostring(lateral))
end
M.clear(); current.oobbAxes=nil; M.setSetting('driftWidth',false)
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
-- Swept clearance: a drifting car on a bend must not meet cones from nearby poses.
M.setSetting('driftWidth',true)
M.setSetting('smooth',true)
M.setSetting('width',3.3)
M.setSetting('spacing',1)
M.setSetting('maxCones',400)
current.id=3; current.oobbX=0; current.x=10; current.y=220; current.z=0.6
local turnPoses={}
local lastTurnX,lastTurnY=nil,nil
local function recordTurnPose()
  if not lastTurnX or (current.x-lastTurnX)^2+(current.y-lastTurnY)^2>=0.75*0.75 then
    turnPoses[#turnPoses+1]={x=current.x,y=current.y,fx=current.fx,fy=current.fy}
    lastTurnX,lastTurnY=current.x,current.y
  end
  M.onUpdate(0.1)
end
local initialAngle=0
current.fx=math.cos(initialAngle+math.pi/2+math.rad(45)); current.fy=math.sin(initialAngle+math.pi/2+math.rad(45))
M.start(); recordTurnPose()
for i=1,90 do
  local angle=(math.pi*1.25)*i/90
  current.x=10*math.cos(angle); current.y=220+10*math.sin(angle)
  local heading=angle+math.pi/2+math.rad(45)*math.sin(angle*2)
  current.fx=math.cos(heading); current.fy=math.sin(heading)
  recordTurnPose()
end
M.stop()
assert(M.uiState().coneCount>20, 'drifting bend should still build both cone lines')
local function assertTurnPoseClear(p)
  local fx,fy=p.fx,p.fy
  local fl=math.sqrt(fx*fx+fy*fy); fx,fy=fx/fl,fy/fl
  local rx,ry=-fy,fx
  for _,obj in ipairs(objects) do
    if not obj.deleted then
      local dx,dy=obj.position.x-p.x,obj.position.y-p.y
      local along=dx*fx+dy*fy
      local lateral=dx*rx+dy*ry
      assert(math.abs(along)>2.4+0.59 or math.abs(lateral)>1.0+0.59,
        'cone entered swept car footprint at '..tostring(obj.position.x)..','..tostring(obj.position.y))
    end
  end
end
for i,p in ipairs(turnPoses) do
  assertTurnPoseClear(p)
  local q=turnPoses[i+1]
  if q then
    local fx,fy=p.fx+q.fx,p.fy+q.fy
    if fx*fx+fy*fy<0.0001 then fx,fy=p.fx,p.fy end
    assertTurnPoseClear({x=(p.x+q.x)/2,y=(p.y+q.y)/2,fx=fx,fy=fy})
  end
end
M.clear(); M.setSetting('driftWidth',false)
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
assert(M.uiState().coneCount==0)
-- Start / Finish gates: default-on real meshes, +Y alignment, adaptive width,
-- optional collision, setting rebuilds and two-object performance reservation.
M.clear()
M.setSetting('gates',true)
M.setSetting('driftWidth',false)
M.setSetting('smooth',false)
M.setSetting('collision',false)
M.setSetting('width',4)
M.setSetting('spacing',1)
M.setSetting('maxCones',100)
current.oobbAxes=nil; current.oobbX=0; current.x=0; current.y=300; current.fx=1; current.fy=0
M.start()
for i=0,120 do current.x=i; M.onUpdate(0.1) end
M.stop()
local live=liveObjects()
local gates=gateObjects()
assert(#live==100, 'two gates must be reserved inside the 100-object cap, got '..tostring(#live))
assert(#gates==2, 'one Start and one Finish gate expected')
local startGate,finishGate=nil,nil
local markerCount,leftMarkers,rightMarkers=0,0,0
for _,obj in ipairs(live) do
  if string.find(obj.shapeName,'gate_start.dae',1,true) then startGate=obj
  elseif string.find(obj.shapeName,'gate_finish.dae',1,true) then finishGate=obj
  else
    markerCount=markerCount+1
    if obj.position.y<300 then leftMarkers=leftMarkers+1 else rightMarkers=rightMarkers+1 end
  end
end
assert(markerCount==98 and leftMarkers==49 and rightMarkers==49 and startGate and finishGate)
assert(math.abs(startGate.position.x)<0.001 and math.abs(startGate.position.y-300)<0.001)
assert(math.abs(finishGate.position.x-120)<0.001 and math.abs(finishGate.position.y-300)<0.001)
for _,gate in ipairs(gates) do
  assert(gate.kind=='TSStatic' and gate.inMission and not gate.deleted)
  assert(gate.position.z==0 and gate.collisionType=='None')
  assert(gate.rotation and math.abs(gate.rotation.x)<0.001 and math.abs(gate.rotation.y)<0.001)
  assert(math.abs((-2*gate.rotation.z*gate.rotation.w)-1)<0.001, 'gate local +Y must face path tangent')
  assert(gate.scale.x>1.17 and gate.scale.y==1 and gate.scale.z==1)
  assert(gate.scale.x*2.54>=2.99, 'complete gate posts/feet must stay outside marker lines')
end
for i=1,10 do M.onUpdate(0.25) end
assert(#liveObjects()==100 and #gateObjects()==2, 'gates must remain during replay updates')
local reloadBeforeGates=collisionReloads
M.setSetting('collision',true)
assert(collisionReloads>reloadBeforeGates)
assert(#liveObjects()==100 and #gateObjects()==2)
for _,obj in ipairs(liveObjects()) do assert(obj.collisionType=='Visible Mesh Final') end
M.setSetting('gates',false)
assert(#gateObjects()==0, 'gate toggle OFF must remove both gates')
assert(#liveObjects()==100, 'without gates the full cap is available to markers')
M.setSetting('gates',true)
assert(#gateObjects()==2 and #liveObjects()==100)
M.setSetting('collision',false)
for _,mesh in ipairs({'pylon','tire','tireStack','cone'}) do
  M.setSetting('mesh',mesh)
  M.rebuild()
  assert(#liveObjects()==100 and #gateObjects()==2, 'gates must rebuild with '..mesh)
  for _,obj in ipairs(liveObjects()) do
    if not string.find(obj.shapeName,'gate_',1,true) then
      local expected=mesh=='tireStack' and 'tire_stack.dae' or (mesh..'.dae')
      assert(string.find(obj.shapeName,expected,1,true), 'wrong marker shape with gates: '..mesh)
    end
  end
end
-- A sideways car needs a wider gate even when the path itself is straight.
M.clear()
M.setSetting('driftWidth',true)
M.setSetting('spacing',2)
M.setSetting('maxCones',400)
current.x=0; current.y=360; current.fx=0; current.fy=1
M.start()
for i=0,8 do current.x=i; M.onUpdate(0.1) end
M.stop()
gates=gateObjects()
assert(#gates==2)
for _,gate in ipairs(gates) do
  assert(gate.scale.x*2.54>=3.98, 'sideways footprint must widen the complete gate posts')
end
for _,obj in ipairs(liveObjects()) do
  if not string.find(obj.shapeName,'gate_',1,true) then
    assert(math.abs(math.abs(obj.position.y-360)-2.99)<0.02, 'gate test must preserve drift marker clearance')
  end
end
-- Curved drifting path: gates use the path tangent (not the sideways car
-- heading), and their scaled inner feet clear nearby swept marker positions.
M.clear()
M.setSetting('smooth',true)
M.setSetting('width',3.3)
M.setSetting('spacing',1)
M.setSetting('maxCones',400)
current.x=10; current.y=420; current.z=0.6
M.start()
for i=0,60 do
  local angle=(math.pi/2)*i/60
  current.x=10*math.cos(angle); current.y=420+10*math.sin(angle)
  local heading=angle+math.pi/2+math.rad(45)
  current.fx=math.cos(heading); current.fy=math.sin(heading)
  M.onUpdate(0.1)
end
M.stop()
gates=gateObjects()
assert(#gates==2)
for _,gate in ipairs(gates) do
  local q=gate.rotation
  local tx,ty=-2*q.z*q.w,1-2*q.z*q.z
  local length=math.sqrt(tx*tx+ty*ty); tx,ty=tx/length,ty/length
  if string.find(gate.shapeName,'gate_start.dae',1,true) then
    assert(math.abs(tx)<0.06 and ty>0.998, 'curved Start must use path tangent, not sideways heading')
  else
    assert(tx<-0.998 and math.abs(ty)<0.06, 'curved Finish tangent is incorrect')
  end
  local nx,ny=-ty,tx
  for _,obj in ipairs(liveObjects()) do
    if not string.find(obj.shapeName,'gate_',1,true) then
      local dx,dy=obj.position.x-gate.position.x,obj.position.y-gate.position.y
      local along=dx*tx+dy*ty
      if math.abs(along)<=2.0 then
        local lateral=math.abs(dx*nx+dy*ny)
        assert(gate.scale.x*2.54>=lateral+0.995, 'curved gate foot entered marker clearance')
      end
    end
  end
end
M.clear()
assert(#gateObjects()==0, 'Clear must remove Start and Finish gates')
M.onExtensionUnloaded()\nprint('DriftSketch Lua assertions passed')\n`;
const status = lauxlib.luaL_dostring(L, to_luastring(script));
if (status !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
console.log('✓ DriftSketch Lua: any vehicle, persistent meshes, exact/adaptive width, swept curves, solid collision, oriented Start/Finish gates and cap reservation');
