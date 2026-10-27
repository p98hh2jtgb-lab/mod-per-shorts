/* DriftSketch GE/path/spawn smoke test with mocked BeamNG APIs and Fengari. */
'use strict';
const fs = require('fs');
const path = require('path');
let fengari;
try { fengari = require(process.env.FENGARI_PATH || 'fengari'); }
catch (error) { console.error('fengari is required: npm install --prefix /tmp/lua-test fengari'); process.exit(2); }
const { lua, lauxlib, lualib, to_luastring } = fengari;
const ROOT = path.resolve(__dirname, '..');
const L = lauxlib.luaL_newstate();
lualib.luaL_openlibs(L);
const file = 'DriftSketch/lua/ge/extensions/driftSketch.lua';
const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
const ASSET = '/art/shapes/driftsketch_v09/';

const mocks = `
objects = {}
groups = {}
named = {}
events = {}
logs = {}
collisionReloads = 0
materialLoads = 0
ASSET = '${ASSET}'
function log(level, tag, message) logs[#logs+1] = tostring(level)..' '..tostring(message) end
FS = {fileExists=function(self,path)
  assert(path==ASSET..'main.materials.json', 'unexpected material path '..tostring(path))
  return true
end}
function loadJsonMaterialsFile(path)
  assert(path==ASSET..'main.materials.json')
  materialLoads = materialLoads + 1
end
current = {x=0,y=0,z=0.6,id=1,fx=1,fy=0}
function vec3(x,y,z) return {x=x,y=y,z=z} end
function quatFromDir(v)
  local yaw=math.atan(-v.x,v.y)
  return {x=0,y=0,z=math.sin(yaw*0.5),w=math.cos(yaw*0.5),pitch=v.z or 0}
end
vehicle = {
  JBeam='testcar',
  getPosition=function(self) return vec3(current.x,current.y,current.z) end,
  getDirectionVector=function(self) return vec3(current.fx,current.fy,0) end,
  getInitialLength=function(self) return current.length or 4.8 end,
  getInitialWidth=function(self) return 2.0 end
}
be = {
  getPlayerVehicleID=function(self,index) return current.id end,
  getObjectByID=function(self,id) if current.id then return vehicle end return nil end,
  getPlayerVehicle=function(self,index) if current.id then return vehicle end return nil end,
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
missionGroup = {children={}, addObject=function(self,obj) self.children[#self.children+1]=obj; obj.inMission=true end}
scenetree = {MissionGroup=missionGroup, findObject=function(name)
  local obj = named[name]
  if obj and not obj.deleted then return obj end
  return nil
end}
local function register(self,name)
  assert(type(name)=='string')
  assert(not (named[name] and not named[name].deleted), 'duplicate object name '..name)
  self.name=name; named[name]=self
end
function createObject(kind)
  assert(materialLoads>=1, 'material JSON must load before the first scene object')
  if kind=='SimGroup' then
    local g={kind=kind,children={},deleted=false}
    g.registerObject=register
    g.addObject=function(self,obj) self.children[#self.children+1]=obj; obj.group=self end
    g.getCount=function(self)
      local n=0
      for _,c in ipairs(self.children) do if not c.deleted then n=n+1 end end
      return n
    end
    g.deleteAllObjects=function(self) for _,c in ipairs(self.children) do c.deleted=true end; self.children={} end
    groups[#groups+1]=g
    return g
  end
  assert(kind=='TSStatic', 'unexpected class '..tostring(kind))
  local obj={kind=kind,deleted=false,collisionType='',inMission=false}
  obj.setField=function(self,key,index,value) if key=='collisionType' then self.collisionType=value end end
  obj.setPosition=function(self,pos) self.position={x=pos.x,y=pos.y,z=pos.z} end
  obj.setPosRot=function(self,x,y,z,qx,qy,qz,qw)
    self.position={x=x,y=y,z=z}; self.rotation={x=qx,y=qy,z=qz,w=qw}
  end
  obj.setScale=function(self,scale) self.scale={x=scale.x,y=scale.y,z=scale.z} end
  obj.registerObject=register
  obj.delete=function(self) self.deleted=true end
  objects[#objects+1]=obj
  return obj
end
function castRayStatic(origin,direction,maxLength) return origin.z end
function liveObjects(pattern)
  local live={}
  for _,obj in ipairs(objects) do
    if not obj.deleted and (not pattern or string.find(obj.shapeName,pattern,1,true)) then live[#live+1]=obj end
  end
  return live
end
function gateObjects() return liveObjects('gate_') end
function ringObjects() return liveObjects('ring.dae') end
function markerObjects()
  local out={}
  for _,obj in ipairs(liveObjects()) do
    if not string.find(obj.shapeName,'gate_',1,true) and not string.find(obj.shapeName,'ring.dae',1,true) then out[#out+1]=obj end
  end
  return out
end
function heading(q) -- local +Y direction for the mock yaw quaternion
  local tx,ty=-2*q.z*q.w,1-2*q.z*q.z
  local length=math.sqrt(tx*tx+ty*ty)
  return tx/length,ty/length
end
function drive(x0,y,x1,step)
  for x=x0,x1,(step or 1) do current.x=x; current.y=y; M.onUpdate(0.1) end
end
-- Strict globals: any typo in the module becomes a test failure.
setmetatable(_G,{__index=function(_,key) error('undefined global '..tostring(key),2) end})
`;

const body = `
M=assert(load(SOURCE,'@${file}'))()
assert(M.version=='0.9.0')
assert(M.onExtensionLoaded()==true)
local s=M.uiState().settings
assert(s.driftWidth==true and s.gates==true, 'Drift widen and gates default ON')
assert(s.mesh=='cone' and s.tireColors=='rw' and s.spacing==1.0 and s.maxCones==2000)
assert(s.rings==false and s.ringCount==5 and s.ringSize==7.0 and s.ringGap==15.0 and s.ringLift==0)
assert(s.sides==nil, 'side selector removed')
-- Removed meshes map to the remaining ones; ranges clamp.
M.setSetting('mesh','pylon'); assert(M.uiState().settings.mesh=='cone', 'Tall Pylon removed')
M.setSetting('mesh','tire'); assert(M.uiState().settings.mesh=='tireStack', 'Single Tire removed')
M.setSetting('mesh','cone')
M.setSetting('spacing',0.2); assert(M.uiState().settings.spacing==0.5, 'cones may sit 0.5 m apart')
M.setSetting('spacing',0.7); assert(M.uiState().settings.spacing==0.7)
M.setSetting('maxCones',9000); assert(M.uiState().settings.maxCones==4000)
M.setSetting('ringCount',99); assert(M.uiState().settings.ringCount==50)
M.setSetting('ringCount','7'); assert(M.uiState().settings.ringCount==7)
M.setSetting('ringSize',1); assert(M.uiState().settings.ringSize==3)
M.setSetting('ringGap',500); assert(M.uiState().settings.ringGap==100)
M.setSetting('ringLift',-3); assert(M.uiState().settings.ringLift==0)
M.setSetting('tireColors','purple'); assert(M.uiState().settings.tireColors=='rw')
M.setSetting('ringCount',5); M.setSetting('ringSize',7); M.setSetting('ringGap',15)
M.setSetting('nonsense',1)

-- Basic cone build: both sides, exact width, v09 assets, grouped, explicit materials.
M.setSetting('gates',false)
M.setSetting('driftWidth',false)
M.setSetting('smooth',false)
M.setSetting('sides','left')
M.setSetting('spacing',2)
M.setSetting('width',4)
M.setSetting('maxCones',100)
M.start()
assert(lastState().recording==true)
drive(1,0,8)
local stopped=M.stop()
assert(stopped.recording==false and stopped.buildCount==1)
assert(stopped.coneCount==8, '7 m path / 2 m spacing / both sides = 8 cones, got '..tostring(stopped.coneCount))
assert(stopped.meshCount==8 and stopped.ringsBuilt==0)
assert(stopped.pathLength==7 and #objects==8)
assert(#groups==1 and groups[1].name=='DriftSketch_Objects' and groups[1].canSave==false and groups[1].inMission)
assert(math.abs(objects[1].position.y+2)<0.001 and math.abs(objects[2].position.y-2)<0.001)
for _,obj in ipairs(objects) do
  assert(obj.kind=='TSStatic' and not obj.deleted and obj.group==groups[1] and obj.canSave==false)
  assert(obj.collisionType=='None' and obj.useInstanceRenderData==true)
  assert(obj.shapeName==ASSET..'cone.dae')
  assert(obj.position.z==0 and obj.scale.x==1 and obj.scale.z==1)
  local tx,ty=heading(obj.rotation)
  assert(math.abs(tx)<0.001 and math.abs(math.abs(ty)-1)<0.001, 'cone base square to its line')
end
for i=1,10 do M.onUpdate(0.25) end
for _,obj in ipairs(objects) do assert(obj.deleted==false, 'replay updates keep meshes') end

-- One click on Tire Stack rebuilds the saved drive: red,red,white,white pairs.
M.setSetting('mesh','tireStack')
assert(M.uiState().coneCount==8)
for i=1,8 do assert(objects[i].deleted==true) end
local function colorsOnLine(sign)
  local list={}
  for _,obj in ipairs(markerObjects()) do
    if obj.position.y*sign>0 then list[#list+1]=obj end
  end
  table.sort(list,function(a,b) return a.position.x<b.position.x end)
  local out={}
  for i,obj in ipairs(list) do out[i]=string.match(obj.shapeName,'tire_stack_(%a+)%.dae') end
  return table.concat(out,',')
end
assert(colorsOnLine(1)=='red,red,white,white', colorsOnLine(1))
assert(colorsOnLine(-1)=='red,red,white,white', colorsOnLine(-1))
local yaws={}
for _,obj in ipairs(markerObjects()) do yaws[string.format('%.3f',obj.rotation.z)]=true end
local distinct=0; for _ in pairs(yaws) do distinct=distinct+1 end
assert(distinct>=3, 'tyre stacks get varied yaw')
M.setSetting('tireColors','rwb')
assert(M.uiState().settings.tireColors=='rwb')
M.setSetting('spacing',1)
M.rebuild()
assert(colorsOnLine(1)=='red,red,white,white,blue,blue,red,red', colorsOnLine(1))
M.setSetting('tireColors','rw')
local before=#objects
M.setSetting('tireColors','rw')
assert(#objects==before, 'unchanged colour does not rebuild')
M.setSetting('mesh','cone')
for _,obj in ipairs(markerObjects()) do assert(obj.shapeName==ASSET..'cone.dae') end
M.setSetting('spacing',2)
M.rebuild()

-- Keep builds: a second drive is an independent build. Clear removes everything.
current.x=0; current.y=20; current.id=2
M.start()
drive(1,20,8)
M.stop()
assert(M.uiState().buildCount==2 and M.uiState().coneCount==16)
M.clear()
assert(M.uiState().coneCount==0 and M.uiState().buildCount==0 and #liveObjects()==0)
-- Keep builds OFF: a new recording drops older runs.
M.setSetting('keepBuilds',false)
M.start(); drive(1,20,8); M.stop()
M.start(); drive(1,30,8); M.stop()
assert(M.uiState().buildCount==1 and #liveObjects()==8)
M.setSetting('keepBuilds',true)
M.clear()

-- Density cap accounts for both sides and prevents runaway object counts.
M.setSetting('spacing',1)
current.x=0; current.y=40
M.start(); drive(1,40,100); M.stop()
assert(M.uiState().coneCount>0 and M.uiState().coneCount<=100)
M.clear()
-- Manual width stays exact regardless of vehicle heading.
M.setSetting('width',2.4)
M.setSetting('spacing',2)
current.x=0; current.y=60; current.fx=0; current.fy=1
M.start(); drive(1,60,8); M.stop()
assert(M.uiState().coneCount==8)
for _,obj in ipairs(liveObjects()) do
  assert(math.abs(math.abs(obj.position.y-60)-1.2)<0.001, 'manual width must remain exact')
end
M.clear()
current.fx=1; current.fy=0
-- Drift Widen keeps the manual base while straight and expands for the rear when sideways.
M.setSetting('driftWidth',true)
M.setSetting('width',4)
current.x=0; current.y=80
M.start(); drive(1,80,8); M.stop()
for _,obj in ipairs(liveObjects()) do assert(math.abs(math.abs(obj.position.y-80)-2)<0.001, 'straight car keeps base width') end
M.clear()
current.x=0; current.y=100; current.fx=0; current.fy=1
M.start(); drive(1,100,8); M.stop()
for _,obj in ipairs(liveObjects()) do
  local lateral=math.abs(obj.position.y-100)
  assert(lateral>=2.989 and lateral<3.20, 'sideways car must include full length and rear clearance, got '..tostring(lateral))
end
M.setSetting('mesh','tireStack')
for _,obj in ipairs(liveObjects()) do
  assert(math.abs(obj.position.y-100)>=3.089, 'tyre stack radius must be included in drift clearance')
end
M.setSetting('mesh','cone')
M.setSetting('driftWidth',false)
local fixedLive=0
for _,obj in ipairs(liveObjects()) do
  fixedLive=fixedLive+1
  assert(math.abs(math.abs(obj.position.y-100)-2)<0.001, 'Drift Widen OFF restores fixed width')
end
assert(fixedLive==8)
M.clear()
-- Real OOBB half axes include extra rear-wing length when available.
M.setSetting('driftWidth',true)
current.oobbAxes=true; current.x=0; current.y=120; current.fx=0; current.fy=1
M.start(); drive(1,120,8); M.stop()
for _,obj in ipairs(liveObjects()) do
  local lateral=math.abs(obj.position.y-120)
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
for _,obj in ipairs(liveObjects()) do
  local radius=math.sqrt(obj.position.x^2+(obj.position.y-100)^2)
  if radius<10 then inner[#inner+1]=obj.position else outer[#outer+1]=obj.position end
end
assert(#inner>3 and #outer>#inner, 'outer arc needs more cones than inner arc')
for _,line in ipairs({inner,outer}) do
  for i=2,#line do
    local dx,dy=line[i].x-line[i-1].x,line[i].y-line[i-1].y
    local distance=math.sqrt(dx*dx+dy*dy)
    assert(distance>0.80 and distance<1.08, 'curve spacing must stay near 1 m, got '..tostring(distance))
  end
end
-- Solid collision is optional and rebuilds existing paths immediately.
local reloadBefore=collisionReloads
M.setSetting('collision',true)
assert(M.uiState().settings.collision==true and collisionReloads>reloadBefore)
for _,obj in ipairs(liveObjects()) do assert(obj.collisionType=='Visible Mesh Final') end
reloadBefore=collisionReloads
M.rebuild()
assert(collisionReloads>=reloadBefore+2, 'old solid shapes leave physics before the new ground rays')
M.setSetting('collision',false)
for _,obj in ipairs(liveObjects()) do assert(obj.collisionType=='None') end
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
current.fx=math.cos(math.pi/2+math.rad(45)); current.fy=math.sin(math.pi/2+math.rad(45))
M.start(); recordTurnPose()
for i=1,90 do
  local angle=(math.pi*1.25)*i/90
  current.x=10*math.cos(angle); current.y=220+10*math.sin(angle)
  local h=angle+math.pi/2+math.rad(45)*math.sin(angle*2)
  current.fx=math.cos(h); current.fy=math.sin(h)
  recordTurnPose()
end
M.stop()
assert(M.uiState().coneCount>20, 'drifting bend should still build both cone lines')
local function assertTurnPoseClear(p)
  local fx,fy=p.fx,p.fy
  local fl=math.sqrt(fx*fx+fy*fy); fx,fy=fx/fl,fy/fl
  local rx,ry=-fy,fx
  for _,obj in ipairs(markerObjects()) do
    local dx,dy=obj.position.x-p.x,obj.position.y-p.y
    local along=dx*fx+dy*fy
    local lateral=dx*rx+dy*ry
    assert(math.abs(along)>2.4+0.59 or math.abs(lateral)>1.0+0.59,
      'cone entered swept car footprint at '..tostring(obj.position.x)..','..tostring(obj.position.y))
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
local centered=liveObjects()
assert(#centered==8)
assert(math.abs(centered[1].position.x-0.75)<0.001 and math.abs(centered[2].position.x-0.75)<0.001, 'OOBB center must anchor the path')
M.clear(); current.oobbX=0
-- Rotating in place without translation must not create a false path.
M.start(); M.onUpdate(0.1)
for i=1,30 do current.fx=math.cos(i); current.fy=math.sin(i); M.onUpdate(0.1) end
assert(M.uiState().pointCount==1, 'stationary rotation must not add path points')
M.stop()
assert(M.uiState().statusError==true and M.uiState().coneCount==0)
current.fx=1; current.fy=0

-- Start / Finish gates: default-on real meshes, +Y alignment, uniform scale,
-- tower plates outside the marker lines, two-object cap reservation.
M.clear()
M.setSetting('gates',true)
M.setSetting('driftWidth',false)
M.setSetting('smooth',false)
M.setSetting('collision',false)
M.setSetting('width',4)
M.setSetting('spacing',1)
M.setSetting('maxCones',100)
current.oobbAxes=nil; current.oobbX=0; current.x=0; current.y=300; current.fx=1; current.fy=0
M.start(); drive(0,300,120); M.stop()
local live=liveObjects()
local gates=gateObjects()
assert(#live==100, 'two gates must be reserved inside the 100-object cap, got '..tostring(#live))
assert(#gates==2, 'one Start and one Finish gate expected')
local startGate,finishGate=nil,nil
local leftMarkers,rightMarkers=0,0
for _,obj in ipairs(live) do
  if obj.shapeName==ASSET..'gate_start.dae' then startGate=obj
  elseif obj.shapeName==ASSET..'gate_finish.dae' then finishGate=obj
  elseif obj.position.y<300 then leftMarkers=leftMarkers+1 else rightMarkers=rightMarkers+1 end
end
assert(leftMarkers==49 and rightMarkers==49 and startGate and finishGate)
assert(math.abs(startGate.position.x)<0.001 and math.abs(startGate.position.y-300)<0.001)
assert(math.abs(finishGate.position.x-120)<0.001 and math.abs(finishGate.position.y-300)<0.001)
for _,gate in ipairs(gates) do
  assert(gate.kind=='TSStatic' and gate.group==groups[#groups] and not gate.deleted)
  assert(gate.position.z==0 and gate.collisionType=='None')
  assert(math.abs(gate.rotation.x)<0.001 and math.abs(gate.rotation.y)<0.001)
  local tx,ty=heading(gate.rotation)
  assert(math.abs(tx-1)<0.001, 'gate local +Y must face the path tangent')
  assert(gate.scale.x==gate.scale.y and gate.scale.y==gate.scale.z, 'gates scale uniformly: no stretched banner')
  assert(gate.scale.x>=0.8 and gate.scale.x<=2.6)
  assert(4.35*gate.scale.x>=2.0+0.9, 'tower base plates stay outside the marker lines')
end
for i=1,10 do M.onUpdate(0.25) end
assert(#liveObjects()==100 and #gateObjects()==2, 'gates remain during replay updates')
local reloadBeforeGates=collisionReloads
M.setSetting('collision',true)
assert(collisionReloads>reloadBeforeGates and #liveObjects()==100 and #gateObjects()==2)
for _,obj in ipairs(liveObjects()) do assert(obj.collisionType=='Visible Mesh Final') end
M.setSetting('gates',false)
assert(#gateObjects()==0 and #liveObjects()==100, 'gates OFF returns their slots to markers')
M.setSetting('gates',true)
assert(#gateObjects()==2 and #liveObjects()==100)
M.setSetting('collision',false)
for _,mesh in ipairs({'tireStack','cone'}) do
  M.setSetting('mesh',mesh)
  assert(#liveObjects()==100 and #gateObjects()==2, 'gates rebuild with '..mesh)
end

-- Regression (0.8.1 black wall): a second leg 20 m away must not inflate the gate.
M.clear()
M.setSetting('maxCones',2000)
current.x=0; current.y=600; current.fx=1; current.fy=0
M.start()
drive(0,600,60)
for i=1,30 do
  local a=-math.pi/2+math.pi*i/30
  current.x=60+10*math.cos(a); current.y=610+10*math.sin(a)
  current.fx=-math.sin(a); current.fy=math.cos(a)
  M.onUpdate(0.1)
end
current.fx=-1; current.fy=0
for x=59,-2,-1 do current.x=x; current.y=620; M.onUpdate(0.1) end
M.stop()
gates=gateObjects()
assert(#gates==2, 'start and finish 20 m apart both exist')
for _,gate in ipairs(gates) do
  assert(gate.scale.x<=1.0, 'parallel leg inflated the gate: scale '..tostring(gate.scale.x))
end
-- Closed loop: a finish within 6 m of the start keeps a single gate.
M.clear()
current.x=10; current.y=700
M.start()
for i=0,64 do
  local a=2*math.pi*i/64*0.97
  current.x=10*math.cos(a); current.y=700+10*math.sin(a); current.fx=-math.sin(a); current.fy=math.cos(a)
  M.onUpdate(0.1)
end
M.stop()
assert(#gateObjects()==1, 'closed loop keeps only the START gate')
current.fx=1; current.fy=0

-- A sideways car needs a wider gate even when the path itself is straight.
M.clear()
M.setSetting('driftWidth',true)
M.setSetting('spacing',2)
M.setSetting('maxCones',400)
current.length=12; current.x=0; current.y=360; current.fx=0; current.fy=1
M.start()
for i=0,8 do current.x=i; M.onUpdate(0.1) end
M.stop()
gates=gateObjects()
assert(#gates==2)
for _,gate in ipairs(gates) do
  assert(4.35*gate.scale.x>=6.59+0.9-0.001 and gate.scale.x>1.0, 'sideways footprint widens the whole gate')
end
current.length=nil
-- Curved drifting path: gates use the path tangent (not the sideways heading) and
-- their plates clear nearby swept markers.
M.clear()
M.setSetting('smooth',true)
M.setSetting('width',3.3)
M.setSetting('spacing',1)
current.x=10; current.y=420; current.z=0.6
M.start()
for i=0,60 do
  local angle=(math.pi/2)*i/60
  current.x=10*math.cos(angle); current.y=420+10*math.sin(angle)
  local h=angle+math.pi/2+math.rad(45)
  current.fx=math.cos(h); current.fy=math.sin(h)
  M.onUpdate(0.1)
end
M.stop()
gates=gateObjects()
assert(#gates==2)
for _,gate in ipairs(gates) do
  local tx,ty=heading(gate.rotation)
  if gate.shapeName==ASSET..'gate_start.dae' then
    assert(math.abs(tx)<0.06 and ty>0.998, 'curved Start must use path tangent')
  else
    assert(tx<-0.998 and math.abs(ty)<0.06, 'curved Finish tangent is incorrect')
  end
  local nx,ny=-ty,tx
  for _,obj in ipairs(markerObjects()) do
    local dx,dy=obj.position.x-gate.position.x,obj.position.y-gate.position.y
    if math.abs(dx*tx+dy*ty)<=3.0 then
      local lateral=math.abs(dx*nx+dy*ny)
      assert(4.35*gate.scale.x>=lateral+0.899, 'curved gate plate entered marker clearance')
    end
  end
end
M.clear()
assert(#gateObjects()==0, 'Clear removes Start and Finish gates')
current.fx=1; current.fy=0

-- Rings on a drive: count, size (clear opening), gap and lift are all honoured.
M.setSetting('driftWidth',false)
M.setSetting('smooth',false)
M.setSetting('width',4)
M.setSetting('spacing',1)
M.setSetting('maxCones',2000)
M.setSetting('gates',true)
current.x=0; current.y=800; current.fx=1; current.fy=0
M.start(); drive(0,800,120); M.stop()
assert(#ringObjects()==0, 'rings are OFF by default')
local markersWithoutRings=#markerObjects()
M.setSetting('rings',true)
local rings=ringObjects()
assert(#rings==5, 'five rings by default, got '..tostring(#rings))
table.sort(rings,function(a,b) return a.position.x<b.position.x end)
for i,ring in ipairs(rings) do
  assert(math.abs(ring.position.x-15*i)<0.001 and math.abs(ring.position.y-800)<0.001, 'ring every 15 m from 15 m')
  assert(ring.position.z==0, 'Lift 0: opening starts at ground level')
  assert(math.abs(ring.scale.x-7/6)<1e-9 and ring.scale.x==ring.scale.z, 'Size 7 m opening = uniform 7/6')
  local tx,ty=heading(ring.rotation)
  assert(math.abs(tx-1)<0.001, 'ring faces along the drive')
  assert(ring.group==groups[#groups] and ring.collisionType=='None')
end
local function assertMarkersClearOfRings()
  for _,ring in ipairs(ringObjects()) do
    local s=ring.scale.x
    for _,obj in ipairs(markerObjects()) do
      local along=math.abs(obj.position.x-ring.position.x)
      local lateral=math.abs(obj.position.y-ring.position.y)
      assert(along>0.3*s+0.24 or lateral>3.6*s+0.24, 'marker cuts through a ring tube')
    end
  end
end
assertMarkersClearOfRings()
assert(#markerObjects()==markersWithoutRings-10, 'each ring opens a one-cone gap per side')
assert(M.uiState().ringsBuilt==5 and M.uiState().meshCount==#liveObjects())
-- Slider changes are debounced, then applied without pressing Rebuild.
M.setSetting('ringCount',3)
M.setSetting('ringSize',12)
M.setSetting('ringGap',20)
M.setSetting('ringLift',1.5)
assert(#ringObjects()==5, 'no rebuild while the slider is still moving')
M.onUpdate(0.1)
assert(#ringObjects()==5)
M.onUpdate(0.3)
rings=ringObjects()
assert(#rings==3, 'Count applies after the debounce')
table.sort(rings,function(a,b) return a.position.x<b.position.x end)
for i,ring in ipairs(rings) do
  assert(math.abs(ring.position.x-20*i)<0.001, 'Gap 20 m')
  assert(math.abs(ring.scale.x-2)<1e-9, 'Size 12 m opening = scale 2')
  assert(math.abs(ring.position.z-1.5)<1e-9, 'Lift 1.5 m')
end
assertMarkersClearOfRings()
-- A long gap runs out of track: rings stop before the finish zone.
M.setSetting('ringCount',50); M.setSetting('ringGap',30); M.setSetting('ringLift',0); M.setSetting('ringSize',7)
M.onUpdate(0.5)
assert(#ringObjects()==3, '120 m drive with 8 m gate zones fits rings at 30/60/90 m')
M.setSetting('gates',false)
assert(#ringObjects()==3 and #gateObjects()==0)
M.setSetting('gates',true)

-- Rings ahead of the car: a straight line that survives Rebuild and settings changes.
M.setSetting('rings',false)
assert(#ringObjects()==0 and #markerObjects()==markersWithoutRings, 'rings OFF gives the gaps back')
M.setSetting('ringCount',4); M.setSetting('ringGap',10)
M.onUpdate(0.5)
current.x=0; current.y=900; current.fx=0; current.fy=1
local placed=M.placeRings()
assert(placed.ringSetCount==1 and placed.ringsBuilt==4 and not placed.statusError, placed.status)
rings=ringObjects()
table.sort(rings,function(a,b) return a.position.y<b.position.y end)
for i,ring in ipairs(rings) do
  assert(math.abs(ring.position.x)<0.001 and math.abs(ring.position.y-(900+2.4+10*i))<0.001, 'first ring one gap past the bumper')
  local tx,ty=heading(ring.rotation)
  assert(math.abs(ty-1)<0.001, 'ahead rings face the car direction')
end
M.setSetting('ringSize',9)
M.onUpdate(0.5)
assert(#ringObjects()==4 and math.abs(ringObjects()[1].scale.x-1.5)<1e-9, 'placed rings follow the Size slider')
M.rebuild()
assert(#ringObjects()==4 and #gateObjects()==2, 'Rebuild keeps placed rings and the drive')
M.setSetting('collision',true)
for _,ring in ipairs(ringObjects()) do assert(ring.collisionType=='Visible Mesh Final') end
M.setSetting('collision',false)
current.id=nil
local noCar=M.placeRings()
assert(noCar.statusError==true and #ringObjects()==4, 'no vehicle: no rings')
current.id=4
-- Clear rings removes only rings.
local markerCount=#markerObjects()
local cleared=M.clearRings()
assert(cleared.ringSetCount==0 and cleared.ringsBuilt==0 and #ringObjects()==0)
assert(#markerObjects()==markerCount and #gateObjects()==2, 'Clear rings keeps cones and gates')
-- The total ring count is capped.
M.setSetting('ringCount',50)
current.x=0; current.y=1000; current.fx=1; current.fy=0
for i=1,7 do M.placeRings() end
assert(#ringObjects()==300 and lastState().statusError==true, 'ring cap is 300')
M.clear()
assert(#liveObjects()==0 and M.uiState().ringSetCount==0, 'Clear removes rings too')
M.setSetting('ringCount',5); M.setSetting('ringGap',15); M.setSetting('ringSize',7)

-- Lua reload: settings, drives and ring sets survive; old objects are swept and rebuilt.
M.setSetting('mesh','tireStack')
M.setSetting('rings',true)
current.x=0; current.y=1100; current.fx=1; current.fy=0
M.start(); drive(0,1100,90); M.stop()
current.x=0; current.y=1200
M.placeRings()
assert(materialLoads==1, 'all builds and rebuilds reuse the loaded material library')
local data=M.onSerialize()
assert(#data.savedPaths==1 and #data.ringSets==1 and data.settings.mesh=='tireStack' and data.settings.rings==true)
local oldLive=liveObjects()
assert(#oldLive>0)
local M2=assert(load(SOURCE,'@${file}'))()
assert(M2.onExtensionLoaded(data)==true)
for _,obj in ipairs(oldLive) do assert(obj.deleted, 'objects of the old Lua VM are swept') end
M2.onDeserialized(data)
M2.onUpdate(0.1)
local restoredState=M2.uiState()
assert(restoredState.buildCount==1 and restoredState.ringSetCount==1)
assert(restoredState.settings.mesh=='tireStack' and restoredState.coneCount==#liveObjects()-restoredState.ringsBuilt)
assert(#ringObjects()==restoredState.ringsBuilt and restoredState.ringsBuilt==5+5)
for _,obj in ipairs(markerObjects()) do assert(string.find(obj.shapeName,'tire_stack_',1,true)) end
M2.onClientEndMission()
assert(#liveObjects()==0 and M2.uiState().buildCount==0)
assert(materialLoads==2, 'materials load once per mission and again after the mission ends')
M.onExtensionUnloaded()
print('DriftSketch Lua assertions passed')
`;

const script = mocks + '\nSOURCE=' + JSON.stringify(source) + '\n' + body;
const status = lauxlib.luaL_dostring(L, to_luastring(script));
if (status !== lua.LUA_OK) throw new Error(lua.lua_tojsstring(L, -1));
console.log('✓ DriftSketch Lua: v09 assets, cones/tyre stacks, uniform gates, rings (count/size/gap/lift, ahead, debounce), groups and reload');
