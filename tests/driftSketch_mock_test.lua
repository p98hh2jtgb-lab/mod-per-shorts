-- DriftSketch 0.9.21 mock test -------------------------------------------------
-- Runs the real lua/ge/extensions/driftSketch.lua inside a plain Lua VM with a
-- mocked BeamNG GE environment (be, scenetree, editor, guihooks, TSStatic...).
-- No game needed. Set EXTENSION_PATH before running, then read TEST_FAILED.
--
--   lua driftSketch_mock_test.lua lua/ge/extensions/driftSketch.lua
--
-- Covered:
--   * editor.selection.object is a list of numeric scene-object IDs (BeamNG API)
--   * only vehicles are registered; a TSStatic cone is rejected
--   * a World Editor-parented (no coupler) trailer topples + counts a cone
--   * an unlinked/unrelated car never topples a cone (no map-wide scan)
--   * unregister by selection / by id / clear all
--   * the 0.9.20 coupler detection still works
--   * 0.9.20 settings migrate verbatim; 0.9.9 legacy migration still applies
--   * defaults preserved, Clear still refreshes the collision world (0.9.19)

local EXT_PATH = EXTENSION_PATH or (arg and arg[1]) or 'lua/ge/extensions/driftSketch.lua'

local total, failed = 0, 0
local function check(condition, message)
  total = total + 1
  if not condition then
    failed = failed + 1
    print('FAIL: ' .. message)
  else
    print('ok  : ' .. message)
  end
end
local function eq(actual, expected, message)
  check(actual == expected,
    message .. ' (got ' .. tostring(actual) .. ', expected ' .. tostring(expected) .. ')')
end

local function vec3(x, y, z) return {x = x, y = y, z = z} end

local function setup()
  local ctx = {
    sceneByName = {}, sceneById = {}, vehiclesById = {},
    cones = {}, hits = {}, states = {}, reloads = 0, serial = 0
  }

  function ctx.newSimObject(kind, name)
    ctx.serial = ctx.serial + 1
    local o = {
      kind = kind, name = name or (kind .. '_' .. ctx.serial),
      simId = 5000 + ctx.serial, fields = {}, deleted = false,
      pos = vec3(0, 0, 0), children = {}
    }
    o.fields.name = o.name
    o.fields.JBeam = (kind == 'BeamNGVehicle') and 'mock_trailer' or nil
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
    function o:getPosition() return vec3(self.pos.x, self.pos.y, self.pos.z) end
    function o:setScale(s) self.scale = s end
    function o:registerObject(n)
      self.name = n
      self.fields.name = n
      ctx.sceneByName[n] = self
      ctx.sceneById[self.simId] = self
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

  function ctx.addVehicle(opts)
    local v = ctx.newSimObject(opts.class or 'BeamNGVehicle', opts.name)
    v.id = opts.id
    v.pos = vec3(opts.x or 0, opts.y or 0, opts.z or 0)
    function v:getDirectionVector() return vec3(1, 0, 0) end
    function v:getInitialLength() return 4.8 end
    function v:getInitialWidth() return 2.0 end
    v.fields.JBeam = opts.jbeam or 'mock_trailer'
    if opts.inBe ~= false then ctx.vehiclesById[v.id] = v end
    return v
  end

  -- Globals seen by the extension.
  _G.vec3 = vec3
  _G.quatFromDir = function(_dir) return {x = 0, y = 0, z = 0, w = 1} end
  _G.castRayStatic = nil
  _G.loadJsonMaterialsFile = nil
  _G.FS = nil
  _G.log = function() end
  _G.createObject = function(kind) return ctx.newSimObject(kind) end
  _G.guihooks = {trigger = function(name, data)
    if name == 'driftSketch.hit' then ctx.hits[#ctx.hits + 1] = data end
    if name == 'driftSketch.state' then ctx.states[#ctx.states + 1] = data end
  end}
  _G.scenetree = {
    findObject = function(name) return ctx.sceneByName[name] end,
    findObjectById = function(id) return ctx.sceneById[tonumber(id)] end
  }
  _G.scenetree.MissionGroup = ctx.newSimObject('SimGroup', 'MissionGroup')
  _G.editor = {selection = {object = {}}}
  ctx.editor = _G.editor
  _G.be = {
    getPlayerVehicleID = function(_self, _idx) return ctx.playerId end,
    getPlayerVehicle = function(_self, _idx) return ctx.vehiclesById[ctx.playerId] end,
    getObjectByID = function(_self, id) return ctx.vehiclesById[tonumber(id)] end,
    getObjectOOBBCenterXYZ = function(_self, id)
      local v = ctx.vehiclesById[tonumber(id)]
      if v then return v.pos.x, v.pos.y, v.pos.z end
    end,
    getObjectOOBBIsInitialized = function(_self, _id) return true end,
    getObjectOOBBHalfAxisXYZ = function(_self, _id, axis)
      if axis == 0 then return 2.4, 0, 0 end
      if axis == 1 then return 0, 1.0, 0 end
      return 0, 0, 0.6
    end,
    getObjectCount = function(_self) return 0 end,
    getObject = function(_self, _index) return nil end,
    reloadCollision = function(_self) ctx.reloads = ctx.reloads + 1 end
  }

  ctx.playerId = 101
  ctx.player = ctx.addVehicle{id = 101, name = 'Kerri', x = 0, y = 0, z = 0.5}
  ctx.trailer = ctx.addVehicle{id = 202, name = 'Rimorkio_WE', x = 900, y = 900, z = 0.5}
  ctx.stranger = ctx.addVehicle{id = 303, name = 'Makine_e_palidhur', x = 900, y = 900, z = 0.5}
  ctx.M = dofile(EXT_PATH)
  return ctx
end

local function farAway(ctx)
  ctx.player.pos = vec3(5000, 5000, 0.5)
  ctx.trailer.pos = vec3(5000, 5000, 0.5)
  ctx.stranger.pos = vec3(5000, 5000, 0.5)
end

local function moveTo(vehicle, cone)
  vehicle.pos = vec3(cone.x, cone.y, cone.z)
end

local function buildCones(ctx)
  ctx.M.start()
  for x = 0, 20, 1 do
    ctx.player.pos = vec3(x, 0, 0.5)
    ctx.M.onUpdate(0.05)
  end
  ctx.M.stop()
  local snapshot = {}
  for i, p in ipairs(ctx.cones) do snapshot[i] = {x = p.x, y = p.y, z = p.z} end
  return snapshot
end

local function scan(ctx, times)
  for _ = 1, times or 1 do ctx.M.onUpdate(0.05) end
end

print('== 1. defaults / World Editor selection / topple / unlink ==')
local c = setup()
eq(c.M.version, '0.9.21', 'module version is 0.9.21')
local defaults = c.M.uiState().settings
eq(defaults.topple, true, 'topple ON by default')
eq(defaults.coneCollision, false, 'physical collision OFF by default')
eq(defaults.hudCard, false, 'photo-card OFF by default')
eq(defaults.soundVolume, 3.0, 'sound gain 300% retained')
eq(defaults.hudStyle, 'outline', 'OUTLINE preset retained')
eq(defaults.hudLabel, 'CONES DOWN', 'default HUD label retained')
eq(defaults.maxCones, 2000, 'cone cap retained')

local cones = buildCones(c)
check(#cones >= 4, 'Stop & Build created traffic cones (' .. #cones .. ')')
eq(c.M.uiState().buildCount, 1, 'one drive saved')
local conePos = cones[1]
check(conePos ~= nil, 'first cone position available')

-- The player is parked far away; only an UNLINKED car sits on the cone.
farAway(c)
moveTo(c.stranger, conePos)
scan(c, 3)
eq(c.M.uiState().toppledCount, 0, 'unlinked car does NOT topple cones')
eq(#c.hits, 0, 'unlinked car does NOT fire counter hit events')
eq(c.M.uiState().extraVehicleCount, 0, 'no vehicle registered yet')

-- Empty selection: rejected with a helpful status.
c.editor.selection.object = {}
local st = c.M.useSelectedVehicle()
eq(st.statusError, true, 'empty World Editor selection is reported')
eq(st.extraVehicleCount, 0, 'empty selection registers nothing')

-- A TSStatic cone selected in World Editor must be rejected (not a vehicle).
local coneSimId = nil
for id, obj in pairs(c.sceneById) do
  if obj.kind == 'TSStatic' then coneSimId = id break end
end
check(coneSimId ~= nil, 'a TSStatic cone object exists in the mocked scene')
c.editor.selection.object = {coneSimId}
st = c.M.useSelectedVehicle()
eq(st.extraVehicleCount, 0, 'TSStatic cone is NOT registered as a vehicle')
eq(st.statusError, true, 'non-vehicle selection is reported as an error')

-- editor.selection.object = {scene-object ID} (real BeamNG World Editor shape).
-- trailer.simId differs from the vehicle id, just like in the game.
c.editor.selection.object = {c.trailer.simId}
st = c.M.useSelectedVehicle()
eq(st.extraVehicleCount, 1, 'selected World Editor trailer is registered')
eq(st.statusError, false, 'registration status is not an error')
eq(st.extraVehicles[1].id, c.trailer.id, 'registered id is the vehicle id')
eq(st.extraVehicles[1].name, 'Rimorkio_WE', 'registered vehicle name shown in panel')
check(c.trailer.simId ~= c.trailer.id, 'mock uses distinct scene id and vehicle id')

-- Registered parented trailer (NO coupler) hits a cone -> animation + counter.
farAway(c)
moveTo(c.trailer, conePos)
scan(c, 1)
local afterHit = c.M.uiState()
check(afterHit.toppledCount >= 1, 'World Editor-selected trailer topples a cone')
check(#c.hits >= 1, 'hit event fired for the HUD counter')
if #c.hits >= 1 then eq(c.hits[1].count, 1, 'counter event reports count 1')
else check(false, 'counter event reports count 1') end
eq(afterHit.coneCount, st.coneCount, 'cone count unchanged (only cones are created/animated)')

-- Rebuild still works as before, restoring cones and resetting the counter.
c.M.rebuild()
eq(c.M.uiState().toppledCount, 0, 'Rebuild resets the counter')
check(c.M.uiState().coneCount > 0, 'Rebuild restores the saved cones')
-- Unregister the selected trailer, then it must no longer topple cones.
c.editor.selection.object = {c.trailer.simId}
st = c.M.unregisterSelectedVehicle()
eq(st.extraVehicleCount, 0, 'selected trailer is unregistered')
farAway(c)
moveTo(c.trailer, conePos)
scan(c, 2)
eq(c.M.uiState().toppledCount, 0, 'unregistered trailer does NOT topple cones')

-- Register again, then remove by list row id and by "Hiq të gjitha".
c.editor.selection.object = {c.trailer.simId}
eq(c.M.useSelectedVehicle().extraVehicleCount, 1, 're-register works')
eq(c.M.unregisterVehicle(c.trailer.id).extraVehicleCount, 0, 'per-row unregister works')
c.editor.selection.object = {c.trailer.simId}
c.M.useSelectedVehicle()
eq(c.M.clearSelectedVehicles().extraVehicleCount, 0, 'clear-all unregisters every trailer')

-- Coupler detection from 0.9.20 is untouched.
c.M.onCouplerAttached(c.player.id, c.trailer.id)
farAway(c)
moveTo(c.trailer, conePos)
scan(c, 1)
check(c.M.uiState().toppledCount >= 1, 'coupler-linked trailer still topples cones')
c.M.onCouplerDetached(c.player.id, c.trailer.id)
c.M.rebuild()
farAway(c)
moveTo(c.trailer, conePos)
scan(c, 1)
eq(c.M.uiState().toppledCount, 0, 'detached coupler link no longer topples cones')

-- Clear must refresh the collision world (0.9.19 fix) and keep registrations.
c.editor.selection.object = {c.trailer.simId}
c.M.useSelectedVehicle()
local before = c.reloads
eq(c.M.clear().extraVehicleCount, 1, 'Clear keeps the registered trailer list')
check(c.M.uiState().coneCount == 0 and c.M.uiState().buildCount == 0, 'Clear removes cones and drives')
check(c.reloads > before, 'Clear refreshes the collision world')

-- Settings toggles keep their existing behaviour.
eq(c.M.setSetting('coneCollision', false).settings.coneCollision, false, 'collision setting still toggleable')
eq(c.M.setSetting('topple', false).settings.topple, false, 'topple setting still toggleable')
check(tostring(c.M.uiState().status):find('OFF') ~= nil, 'panel explains topple OFF blocks animation/counting')

print('== 2. fallback selection shapes + be-less parented vehicle ==')
local d = setup()
local conesD = buildCones(d)
farAway(d)
d.editor.selection.object = nil
d.editor.selection.objects = {d.trailer.simId} -- .objects fallback
eq(d.M.useSelectedVehicle().extraVehicleCount, 1, 'editor.selection.objects fallback registers vehicle')
moveTo(d.trailer, conesD[1])
scan(d, 1)
check(d.M.uiState().toppledCount >= 1, '.objects selection topples a cone')
d.editor.selection.objects = nil
d.editor.selection.object = {d.trailer} -- object (not id) selection
eq(d.M.useSelectedVehicle().extraVehicleCount, 1, 'object-table selection is accepted')

-- A vehicle that `be` cannot resolve still works through its scene object.
local e = setup()
local conesE = buildCones(e)
e.vehiclesById[e.trailer.id] = nil
farAway(e)
e.editor.selection.object = {e.trailer.simId}
eq(e.M.useSelectedVehicle().extraVehicleCount, 1, 'parented vehicle registers even without be lookup')
moveTo(e.trailer, conesE[1])
scan(e, 1)
check(e.M.uiState().toppledCount >= 1, 'be-less parented vehicle still topples a cone')

print('== 3. migration of 0.9.20 settings ==')
local m = setup()
local saved = {
  version = '0.9.20',
  settings = {
    spacing = 2.0, gap = 0.5, groundOffset = -0.4, maxCones = 400,
    smooth = false, keepBuilds = false, topple = false, coneCollision = false,
    hudTotal = 5000, hudLabel = 'CONES DOWN', hudSize = 1.8, hudStyle = 'outline',
    hudCard = false, hudOutline = true, hudGlow = false, hudShadow = true,
    soundEnabled = false, soundVolume = 3.0, driftWidth = true
  },
  savedPaths = {}, removedConePositions = {}
}
m.M.onDeserialized(saved)
local got = m.M.uiState().settings
for key, value in pairs(saved.settings) do
  eq(got[key], value, '0.9.20 setting preserved: ' .. key)
end
eq(m.M.onSerialize().version, '0.9.21', 'serialization writes the new version')
eq(m.M.onSerialize().settings.soundVolume, 3.0, 'serialization keeps 300% gain')

-- 0.9.19 migration still preserved.
local m19 = setup()
m19.M.onDeserialized{version = '0.9.19', settings = {hudSize = 1.8, soundVolume = 3.0, topple = false, maxCones = 400}, savedPaths = {}}
eq(m19.M.uiState().settings.hudSize, 1.8, '0.9.19 HUD size not rescaled')
eq(m19.M.uiState().settings.topple, false, '0.9.19 topple switch preserved')

-- Legacy 0.9.9 conversion still applies (unchanged behaviour).
local old = setup()
old.M.onDeserialized{version = '0.9.9', settings = {hudSize = 1.0, soundVolume = 0.55, hudLabel = 'TOUCHED'}, savedPaths = {}}
eq(old.M.uiState().settings.hudLabel, 'CONES DOWN', 'legacy TOUCHED label migrated')
check(math.abs(old.M.uiState().settings.hudSize - 1.25) < 0.001, 'legacy HUD size scaled by 1.25')
check(math.abs(old.M.uiState().settings.soundVolume - 3.0) < 0.001, 'legacy volume mapped to 300%')

print(string.format('== RESULT: %d checks, %d failed ==', total, failed))
TEST_TOTAL = total
TEST_FAILED = failed
