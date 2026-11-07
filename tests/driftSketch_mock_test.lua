-- DriftSketch 0.9.23 rig-aware mock test --------------------------------------
-- Runs the real lua/ge/extensions/driftSketch.lua in a plain Lua VM with a mocked
-- BeamNG GE environment. Set EXTENSION_PATH (or pass the path as arg[1]).
--
-- Proves that a trailer glued to the car with World Editor (fixed relative pose,
-- NO coupler / NO L key) is detected and that the cone corridor is computed for
-- BOTH vehicles together. A parked/unlinked car is never adopted. Also covers
-- manual World Editor selection, coupler hooks, no per-frame scans, rebuild,
-- serialization and settings migration.

local EXT_PATH = EXTENSION_PATH or (arg and arg[1]) or 'lua/ge/extensions/driftSketch.lua'
local total, failed = 0, 0
local function check(cond, msg)
  total = total + 1
  if not cond then failed = failed + 1; print('FAIL: ' .. msg)
  else print('ok  : ' .. msg) end
end
local function eq(a, b, msg)
  check(a == b, msg .. ' (got ' .. tostring(a) .. ', expected ' .. tostring(b) .. ')')
end
local function vec3(x, y, z) return {x = x, y = y, z = z} end

local function setup()
  local ctx = {sceneByName = {}, sceneById = {}, byId = {}, list = {},
    cones = {}, serial = 0, enumCalls = 0, reloads = 0}

  function ctx.newObject(kind, name)
    ctx.serial = ctx.serial + 1
    local o = {kind = kind, name = name or (kind .. '_' .. ctx.serial),
      simId = 5000 + ctx.serial, fields = {}, pos = vec3(0, 0, 0), children = {},
      deleted = false}
    o.fields.name = o.name
    function o:getClassName() return self.kind end
    function o:getName() return self.name end
    function o:getID() return self.id or self.simId end
    function o:getId() return self.simId end
    function o:getField(field, default)
      if self.fields[field] ~= nil then return self.fields[field] end
      return default
    end
    function o:setField(field, _index, value) self.fields[field] = value; return true end
    function o:setPosRot(x, y, z, qx, qy, qz, qw)
      self.pos = vec3(x, y, z)
      self.rot = {x = qx, y = qy, z = qz, w = qw}
      if kind == 'TSStatic' then ctx.cones[#ctx.cones + 1] = self.pos end
    end
    function o:setPosition(p) self.pos = p end
    function o:setScale(s) self.scale = s end
    function o:registerObject(n)
      self.name = n; self.fields.name = n
      ctx.sceneByName[n] = self; ctx.sceneById[self.simId] = self
      return true
    end
    function o:delete()
      self.deleted = true
      if ctx.sceneByName[self.name] == self then ctx.sceneByName[self.name] = nil end
    end
    function o:addObject(child) self.children[#self.children + 1] = child; return true end
    function o:add(child) return self:addObject(child) end
    function o:getCount() return #self.children end
    function o:deleteAllObjects() self.children = {} end
    ctx.sceneById[o.simId] = o
    if name then ctx.sceneByName[name] = o end
    return o
  end

  function ctx.addVehicle(id, name, x, y, z)
    local v = ctx.newObject('BeamNGVehicle', name)
    v.id = id; v.pos = vec3(x, y, z); v.JBeam = 'mock_' .. name
    function v:getDirectionVector() return vec3(1, 0, 0) end
    function v:getInitialLength() return 4.8 end
    function v:getInitialWidth() return 2.0 end
    function v:getPosition() return vec3(self.pos.x, self.pos.y, self.pos.z) end
    ctx.byId[id] = v
    ctx.sceneById[v.simId] = v
    ctx.sceneByName[name] = v
    ctx.list[#ctx.list + 1] = v
    return v
  end

  ctx.playerId = 101
  ctx.player = ctx.addVehicle(101, 'Kerri', 0, 0, 0.5)
  ctx.trailer = ctx.addVehicle(202, 'Rimorkio_WE', -3, 1.2, 0.5)
  ctx.parked = ctx.addVehicle(303, 'Makine_e_parkuar', 5, 4, 0.5)

  _G.vec3 = vec3
  _G.quatFromDir = function(_d) return {x = 0, y = 0, z = 0, w = 1} end
  _G.castRayStatic = nil
  _G.loadJsonMaterialsFile = nil
  _G.FS = nil
  _G.log = function() end
  _G.createObject = function(kind) return ctx.newObject(kind) end
  _G.guihooks = {trigger = function(_name, _data) end}
  _G.editor = {selection = {object = {}}}
  ctx.editor = _G.editor
  _G.scenetree = {
    findObject = function(name) return ctx.sceneByName[name] end,
    findObjectById = function(id) return ctx.sceneById[tonumber(id)] end,
    findClassObjects = function(_class) return {} end
  }
  _G.scenetree.MissionGroup = ctx.newObject('SimGroup', 'MissionGroup')
  _G.be = {
    getPlayerVehicleID = function(_s, _i) return ctx.playerId end,
    getPlayerVehicle = function(_s, _i) return ctx.byId[ctx.playerId] end,
    getObjectByID = function(_s, id) return ctx.byId[tonumber(id)] end,
    getObjectCount = function(_s) ctx.enumCalls = ctx.enumCalls + 1; return #ctx.list end,
    getObject = function(_s, i) return ctx.list[i + 1] end,
    getObjectOOBBCenterXYZ = function(_s, id)
      local v = ctx.byId[tonumber(id)]
      if v then return v.pos.x, v.pos.y, v.pos.z end
    end,
    getObjectOOBBIsInitialized = function(_s, _id) return true end,
    getObjectOOBBHalfAxisXYZ = function(_s, _id, axis)
      if axis == 0 then return 2.4, 0, 0 end
      if axis == 1 then return 0, 1.0, 0 end
      return 0, 0, 0.6
    end,
    reloadCollision = function(_s) ctx.reloads = ctx.reloads + 1 end
  }

  ctx.M = dofile(EXT_PATH)
  return ctx
end

-- Straight 20 m drive along +x. `glued` moves the trailer rigidly with the car;
-- the parked car never moves, so its relative pose drifts every sample.
local function drive(ctx, glued)
  ctx.M.start()
  for x = 0, 20, 1 do
    ctx.player.pos = vec3(x, 0, 0.5)
    if glued then ctx.trailer.pos = vec3(x - 3, 1.2, 0.5) end
    ctx.M.onUpdate(0.05)
  end
  ctx.M.stop()
end

-- Widest lateral distance of any cone from the driven centre line (y = 0).
local function corridorWidth(ctx)
  local width = 0
  for _, p in ipairs(ctx.cones) do
    if math.abs(p.y) > width then width = math.abs(p.y) end
  end
  return width
end

print('== 1. baseline: no attached vehicle ==')
local a = setup()
eq(a.M.version, '0.9.23', 'module version is 0.9.23')
eq(a.M.uiState().settings.rigAware, true, 'auto detection ON by default')
eq(a.M.uiState().settings.rigMargin, 0.25, 'default extra clearance 0.25 m')
eq(a.M.uiState().settings.collision, false, 'physical collision OFF by default')
eq(a.M.uiState().settings.mesh, 'cone', 'Traffic Cone mesh by default')
eq(a.M.uiState().toppledCount, nil, 'no topple counter in state')
drive(a, false)
local baseline = corridorWidth(a)
check(baseline > 0.5, 'cones built along the path (' .. #a.cones .. ')')
eq(a.M.uiState().rigCount, 0, 'parked / unlinked car is NOT adopted')
check(baseline < 2.0, 'baseline corridor is tight (' .. string.format('%.2f', baseline) .. ' m)')
local idleEnums = a.enumCalls
for _ = 1, 5 do a.M.onUpdate(0.05) end
eq(a.enumCalls, idleEnums, 'NO vehicle enumeration while idle (no per-frame cost)')

-- Even while recording, a frame that produces no new path point must not scan.
local k = setup()
k.M.start()
for x = 0, 5, 1 do
  k.player.pos = vec3(x, 0, 0.5)
  k.M.onUpdate(0.05)
  k.M.onUpdate(0.05)  -- same pose, no new point
  k.M.onUpdate(0.05)  -- same pose, no new point
end
k.M.stop()
eq(k.enumCalls, 6, 'enumeration happens once per recorded point, not per frame')

print('== 2. World Editor-glued trailer: BOTH vehicles computed together ==')
local b = setup()
drive(b, true)
local rigWidth = corridorWidth(b)
check(rigWidth > baseline + 0.8,
  string.format('corridor widens for car + trailer (%.2f m vs %.2f m baseline)', rigWidth, baseline))
check(b.M.uiState().rigCount >= 1, 'trailer was detected automatically')
local foundTrailer, foundParked = false, false
for _, entry in ipairs(b.M.uiState().rigVehicles) do
  if entry.id == b.trailer.id then foundTrailer = true end
  if entry.id == b.parked.id then foundParked = true end
end
check(foundTrailer, 'detected rig contains the World Editor-glued trailer')
check(not foundParked, 'parked car is NOT in the rig list')
check(b.M.uiState().rigVehicles[1].source == 'Auto', 'detected by Auto (no coupler, no L key)')
check(b.M.uiState().coneCount > 0, 'cones still built with the rig')
-- All cones must clear the trailer envelope (|lat| 1.2 + halfWidth 1.0 = 2.2 m).
check(rigWidth >= 2.2, 'cones are outside the trailer envelope')

print('== 2b. World Editor selection at FILLO is a hint, not blind trust ==')
local bh = setup()
bh.editor.selection.object = {bh.trailer.simId}
drive(bh, true)
check(bh.M.uiState().rigCount >= 1, 'selected glued trailer detected via hint')
check(corridorWidth(bh) > baseline + 0.8, 'hint path also widens the corridor')
local bp = setup()
bp.editor.selection.object = {bp.parked.simId}
drive(bp, false)
eq(bp.M.uiState().rigCount, 0, 'a selected but unlinked parked car is still rejected')
check(corridorWidth(bp) < 2.0, 'hint on an unlinked car does not widen cones')

print('== 3. manual World Editor selection (auto detection OFF) ==')
local c = setup()
c.M.setSetting('rigAware', false)
eq(c.M.uiState().settings.rigAware, false, 'auto detection switched off')
c.editor.selection.object = {c.trailer.simId}  -- editor.selection.object = id array
local st = c.M.useSelectedVehicle()
eq(st.rigCount, 1, 'selected trailer registered manually')
eq(st.statusError, false, 'manual registration succeeds')
eq(st.rigVehicles[1].id, c.trailer.id, 'registered id is the vehicle id')
check(st.rigVehicles[1].source == 'World Editor', 'source is World Editor')
drive(c, true)
check(corridorWidth(c) > baseline + 0.8, 'manual registration widens the corridor too')
-- non-vehicle selection is refused
local coneSimId = nil
for id, obj in pairs(c.sceneById) do
  if obj.kind == 'TSStatic' then coneSimId = id break end
end
check(coneSimId ~= nil, 'a TSStatic cone exists in the scene')
c.editor.selection.object = {coneSimId}
eq(c.M.useSelectedVehicle().rigCount, 1, 'TSStatic cone is NOT registered as a vehicle')
eq(c.M.uiState().statusError, true, 'non-vehicle selection is reported')

print('== 4. unregister / coupler / rebuild / migration ==')
c.editor.selection.object = {c.trailer.simId}
eq(c.M.unregisterSelectedVehicle().rigCount, 0, 'selected vehicle unregistered')
eq(c.M.clearSelectedVehicles().rigCount, 0, 'clear-all leaves no rig')
c.editor.selection.object = {c.trailer.simId}
c.M.useSelectedVehicle()
eq(c.M.unregisterVehicle(c.trailer.id).rigCount, 0, 'per-row x unregisters')
c.M.clearSelectedVehicles()

local d = setup()
d.M.onCouplerAttached(d.player.id, d.trailer.id)
check(d.M.uiState().rigCount >= 1, 'coupler/hitch event also adds the trailer')
d.M.onCouplerDetached(d.player.id, d.trailer.id)
eq(d.M.uiState().rigCount, 0, 'coupler detach removes it')

local e = setup()
drive(e, true)
local wide = corridorWidth(e)
e.M.rebuild()
check(math.abs(corridorWidth(e) - wide) < 0.35, 'Rebuild keeps the rig-sized corridor')
local serialized = e.M.onSerialize()
eq(serialized.settings.rigAware, true, 'rigAware serialized')
local hasRigWidth = false
for _, path in ipairs(serialized.savedPaths) do
  for _, p in ipairs(path) do
    if (tonumber(p.rigHalfWidth) or 0) > 0 then hasRigWidth = true end
  end
end
check(hasRigWidth, 'saved drives keep the recorded rig clearance')
local f = setup()
f.M.onDeserialized(serialized)
check(f.M.uiState().buildCount >= 1, 'saved drives restored on reload')
eq(f.M.uiState().settings.rigAware, true, 'rig setting restored')

local g = setup()
g.M.onDeserialized{settings = {mesh = 'cone', spacing = 2.0, gap = 0.5,
  maxCones = 400, smooth = false, collision = false}, savedPaths = {}}
eq(g.M.uiState().settings.spacing, 2.0, '0.9.4-style spacing preserved')
eq(g.M.uiState().settings.maxCones, 400, 'cone cap preserved')
eq(g.M.uiState().settings.collision, false, 'collision stays OFF')

local h = setup()
h.M.onDeserialized{settings = {spacing = 1.5, topple = true, coneCollision = true,
  hudCard = true, soundVolume = 3.0}, savedPaths = {}}
eq(h.M.uiState().settings.spacing, 1.5, '0.9.2x core setting preserved')
eq(h.M.uiState().settings.topple, nil, 'topple NOT brought back')
eq(h.M.uiState().settings.coneCollision, nil, 'physical cone collision NOT brought back')
eq(h.M.uiState().settings.hudCard, nil, 'HUD card NOT brought back')

print(string.format('== RESULT: %d checks, %d failed ==', total, failed))
TEST_TOTAL = total
TEST_FAILED = failed
