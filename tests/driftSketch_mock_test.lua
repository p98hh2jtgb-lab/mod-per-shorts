-- DriftSketch 0.9.24 rig-aware mock test --------------------------------------
-- Runs the real lua/ge/extensions/driftSketch.lua in a plain Lua VM with a mocked
-- BeamNG GE environment. Set EXTENSION_PATH (or pass the path as arg[1]).
--
-- The regression that 0.9.23 missed: a drive saved by 0.9.4 has NO rig data, so
-- Rebuild kept the narrow cone lines and the glued trailer still clipped them.
-- 0.9.24 applies the trailer width at BUILD time. These checks prove that:
--   * an old saved drive widens on restore / Rebuild / slider change,
--   * a hitch-less World Editor-glued trailer is still auto-detected,
--   * World Editor selection sizes the corridor and rebuilds immediately,
--     including a TSStatic prop trailer (not just a BeamNGVehicle),
--   * detection during replay works, but never scans per frame,
--   * toppling / counter / sound / physical cones never come back.

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

  -- A trailer glued as a plain World Editor prop (TSStatic), NOT a vehicle.
  function ctx.addProp(name, x, y, z)
    local o = ctx.newObject('TSStatic', name)
    o.pos = vec3(x, y, z)
    function o:getPosition() return vec3(self.pos.x, self.pos.y, self.pos.z) end
    function o:getScale() return vec3(1, 1, 1) end
    return o
  end

  ctx.playerId = 101
  ctx.player = ctx.addVehicle(101, 'Kerri', 0, 0, 0.5)
  ctx.trailer = ctx.addVehicle(202, 'Rimorkio_WE', -3, 1.2, 0.5)
  ctx.parked = ctx.addVehicle(303, 'Makine_e_parkuar', 5, 4, 0.5)
  ctx.prop = ctx.addProp('Rimorkio_Prop_TSStatic', -3, 1.2, 0.5)

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
-- Callers clear ctx.cones before a build so only that build is measured.
local function corridorWidth(ctx)
  local width = 0
  for _, p in ipairs(ctx.cones) do
    if math.abs(p.y) > width then width = math.abs(p.y) end
  end
  return width
end

print('== 1. defaults & no per-frame scanning ==')
local a = setup()
eq(a.M.version, '0.9.24', 'module version is 0.9.24')
eq(a.M.uiState().settings.rigPad, 2.0, 'build-time Trailer width defaults to 2.0 m')
eq(a.M.uiState().settings.rigAware, true, 'auto detection ON by default')
eq(a.M.uiState().settings.rigMargin, 0.25, 'safety margin defaults to 0.25 m')
eq(a.M.uiState().settings.collision, false, 'physical collision OFF by default')
eq(a.M.uiState().settings.mesh, 'cone', 'Traffic Cone mesh by default')
eq(a.M.uiState().toppledCount, nil, 'no topple counter in state')

-- Auto detection OFF + zero pad reproduces the exact 0.9.4 corridor.
local idle = setup()
idle.M.setSetting('rigPad', 0)
idle.M.setSetting('rigAware', false)
drive(idle, false)
local baseline = corridorWidth(idle)
check(baseline > 0.5 and baseline < 2.0,
  '0.9.4-style narrow corridor (' .. string.format('%.2f', baseline) .. ' m)')
eq(idle.M.uiState().rigCount, 0, 'parked / unlinked car is NOT adopted')
local enums = idle.enumCalls
for _ = 1, 20 do idle.M.onUpdate(0.05) end
eq(idle.enumCalls, enums, 'NO vehicle enumeration per frame when detection is off')

-- Even while recording, a frame that produces no new path point must not scan.
local k = setup()
k.M.setSetting('rigPad', 0)
k.M.setSetting('rigAware', false)
k.M.start()
for x = 0, 5, 1 do
  k.player.pos = vec3(x, 0, 0.5)
  k.M.onUpdate(0.05)
  k.M.onUpdate(0.05)  -- same pose, no new point
  k.M.onUpdate(0.05)  -- same pose, no new point
end
k.M.stop()
eq(k.enumCalls, 0, 'recording samples only at path points')

print('== 2. THE REGRESSION: an old 0.9.4 saved drive must widen on rebuild ==')
local old = setup()
old.M.setSetting('rigPad', 0)
old.M.setSetting('rigAware', false)
drive(old, false)                    -- saved drive has NO rig data at all
local narrow = corridorWidth(old)
local data = old.M.onSerialize()
data.settings.rigPad = nil           -- 0.9.4 settings had no such key
data.settings.rigAware = nil
for _, path in ipairs(data.savedPaths) do
  for _, p in ipairs(path) do p.rigHalfWidth = nil end
end
local restored = setup()
restored.M.onDeserialized(data)
restored.cones = {}
restored.M.onUpdate(0.05)            -- pendingRestore -> rebuildEverything()
local widened = corridorWidth(restored)
check(widened > narrow + 1.0,
  string.format('restored OLD drive widens automatically (%.2f m vs %.2f m)', widened, narrow))
eq(restored.M.uiState().buildCount, 1, 'the old drive is still there')

-- Moving the slider rebuilds the existing drive with the new width.
local rb = setup()
rb.M.setSetting('rigPad', 0)
rb.M.setSetting('rigAware', false)
drive(rb, false)
rb.cones = {}
rb.M.setSetting('rigPad', 2.5)
rb.M.onUpdate(0.4)                  -- deferred path rebuild fires
check(corridorWidth(rb) > narrow + 2.0,
  'Trailer width slider rebuilds the saved drive wide, no new recording')
rb.cones = {}
rb.M.setSetting('rigPad', 0)
rb.M.rebuild()
check(math.abs(corridorWidth(rb) - narrow) < 0.35,
  'setting 0 m restores the tight 0.9.4 lines (no trailer)')

print('== 3. auto-detection of a hitch-less glued trailer (pad = 0) ==')
local b = setup()
b.M.setSetting('rigPad', 0)
drive(b, true)
local rigWidth = corridorWidth(b)
check(rigWidth > baseline + 0.8,
  string.format('car + trailer corridor (%.2f m vs %.2f m baseline)', rigWidth, baseline))
check(b.M.uiState().rigCount >= 1, 'trailer was detected automatically')
local foundTrailer, foundParked = false, false
for _, entry in ipairs(b.M.uiState().rigVehicles) do
  if entry.id == b.trailer.id then foundTrailer = true end
  if entry.id == b.parked.id then foundParked = true end
end
check(foundTrailer, 'detected rig contains the World Editor-glued trailer')
check(not foundParked, 'parked car is NOT in the rig list')
check(b.M.uiState().rigVehicles[1].source == 'Auto', 'detected by Auto (no coupler, no L key)')
check(rigWidth >= 2.2, 'cones are outside the trailer envelope')

print('== 3b. World Editor selection at FILLO is a hint, not blind trust ==')
local bh = setup()
bh.M.setSetting('rigPad', 0)
bh.editor.selection.object = {bh.trailer.simId}
drive(bh, true)
check(bh.M.uiState().rigCount >= 1, 'selected glued trailer detected via hint')
check(corridorWidth(bh) > baseline + 0.8, 'hint path also widens the corridor')
local bp = setup()
bp.M.setSetting('rigPad', 0)
bp.editor.selection.object = {bp.parked.simId}
drive(bp, false)
eq(bp.M.uiState().rigCount, 0, 'a selected but unlinked parked car is still rejected')
check(corridorWidth(bp) < 2.0, 'hint on an unlinked car does not widen cones')

print('== 4. World Editor selection SIZES the corridor and rebuilds NOW ==')
local m = setup()
m.M.setSetting('rigPad', 0)
m.M.setSetting('rigAware', false)
drive(m, false)                      -- existing narrow saved drive
local before = corridorWidth(m)
m.trailer.pos = vec3(m.player.pos.x - 3, 1.2, 0.5)
m.cones = {}
m.editor.selection.object = {m.trailer.simId}
local st = m.M.useSelectedVehicle()
eq(st.rigCount, 1, 'selected trailer registered manually')
eq(st.statusError, false, 'manual registration succeeds')
eq(st.rigVehicles[1].id, m.trailer.id, 'registered id is the vehicle id')
check(st.rigVehicles[1].source == 'World Editor', 'source is World Editor')
check(m.M.uiState().settings.rigPad > 0, 'trailer width auto-sized from the selected object')
check(corridorWidth(m) > before + 0.8, 'existing drive rebuilds WIDE immediately, no new run')

-- A World Editor prop trailer (TSStatic) is accepted too.
local pr = setup()
pr.M.setSetting('rigPad', 0)
drive(pr, false)                     -- generate real DriftSketch cones
pr.prop.pos = vec3(pr.player.pos.x - 3, 1.2, 0.5)
pr.editor.selection.object = {pr.prop.simId}
eq(pr.M.useSelectedVehicle().rigCount, 1, 'TSStatic prop trailer is accepted')
check(pr.M.uiState().settings.rigPad > 0, 'prop trailer also sizes the corridor')

-- Our OWN generated cones must never be mistaken for a trailer.
local coneSimId = nil
for id, obj in pairs(pr.sceneById) do
  if obj.kind == 'TSStatic' and tostring(obj.name):lower():find('driftsketch', 1, true) then
    coneSimId = id break
  end
end
check(coneSimId ~= nil, 'a generated DriftSketch cone exists in the scene')
pr.editor.selection.object = {coneSimId}
eq(pr.M.useSelectedVehicle().rigCount, 1, 'a generated cone is NOT registered as a trailer')

print('== 5. replay / idle detection (old drive, car moving in replay) ==')
local o = setup()
o.M.setSetting('rigPad', 0)
drive(o, false)                      -- saved drive, no rig data
local replayEnums = o.enumCalls
for _ = 1, 3 do o.M.onUpdate(0.05) end
check(o.enumCalls - replayEnums <= 1, 'replay observer is throttled, not per frame')
for i = 1, 14 do
  o.player.pos = vec3(30 + i * 2, 0, 0.5)
  o.trailer.pos = vec3(30 + i * 2 - 3, 1.2, 0.5)  -- fixed relative pose
  o.M.onUpdate(0.35)
end
check(o.M.uiState().rigCount >= 1, 'trailer auto-detected during replay, no new recording')
check(o.M.uiState().settings.rigPad > 0, 'observer sets the trailer width')

print('== 6. unregister / coupler / serialize / migration ==')
local c = setup()
c.M.setSetting('rigPad', 0)
c.editor.selection.object = {c.trailer.simId}
c.M.useSelectedVehicle()
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
e.M.setSetting('rigPad', 0)
drive(e, true)
local wide = corridorWidth(e)
e.cones = {}
e.M.rebuild()
check(math.abs(corridorWidth(e) - wide) < 0.35, 'Rebuild keeps the rig-sized corridor')
local serialized = e.M.onSerialize()
eq(serialized.settings.rigAware, true, 'rigAware serialized')
eq(serialized.settings.rigPad, 0, 'rigPad serialized')
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

local g = setup()
g.M.onDeserialized{settings = {mesh = 'cone', spacing = 2.0, gap = 0.5,
  maxCones = 400, smooth = false, collision = false}, savedPaths = {}}
eq(g.M.uiState().settings.spacing, 2.0, '0.9.4-style spacing preserved')
eq(g.M.uiState().settings.maxCones, 400, 'cone cap preserved')
eq(g.M.uiState().settings.collision, false, 'collision stays OFF')
eq(g.M.uiState().settings.rigPad, 2.0, 'old save without rigPad keeps the safe 2.0 m default')

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
