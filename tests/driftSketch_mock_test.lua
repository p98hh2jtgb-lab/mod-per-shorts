-- DriftSketch 0.9.22 clean-rollback mock test ---------------------------------
-- Runs the real lua/ge/extensions/driftSketch.lua in a plain Lua VM with a
-- mocked BeamNG GE environment. Set EXTENSION_PATH (or pass the path as arg[1]).
--
-- Proves: cones are static TSStatic with collision=None; driving through a cone
-- never topples/animates/replaces it; no hit/counter events exist; there is no
-- per-frame cone scan; 0.9.20/0.9.21 settings migrate without bringing back
-- topple/counter/physics/HUD; recording/build/rebuild/clear still work.

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
  local ctx = {sceneByName = {}, sceneById = {}, cones = {}, hits = {}, states = {},
    serial = 0, reloads = 0, oobbCalls = 0, players = {}}

  function ctx.newObject(kind, name)
    ctx.serial = ctx.serial + 1
    local o = {kind = kind, name = name or (kind .. '_' .. ctx.serial),
      simId = 5000 + ctx.serial, fields = {}, pos = vec3(0, 0, 0), children = {},
      deleted = false, setPosRotCalls = 0}
    o.fields.name = o.name
    function o:getClassName() return self.kind end
    function o:getName() return self.name end
    function o:getID() return self.simId end
    function o:getId() return self.simId end
    function o:getField(field, default)
      if self.fields[field] ~= nil then return self.fields[field] end
      return default
    end
    function o:setField(field, _index, value) self.fields[field] = value; return true end
    function o:setPosRot(x, y, z, qx, qy, qz, qw)
      self.pos = vec3(x, y, z)
      self.rot = {x = qx, y = qy, z = qz, w = qw}
      self.setPosRotCalls = self.setPosRotCalls + 1
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

  local function vehicle(id, name, x, y, z)
    local v = ctx.newObject('BeamNGVehicle', name)
    v.id = id; v.pos = vec3(x, y, z); v.JBeam = 'mock_car'
    function v:getDirectionVector() return vec3(1, 0, 0) end
    function v:getInitialLength() return 4.8 end
    function v:getInitialWidth() return 2.0 end
    function v:getPosition() return vec3(self.pos.x, self.pos.y, self.pos.z) end
    ctx.players[id] = v
    return v
  end

  ctx.playerId = 101
  ctx.player = vehicle(101, 'Kerri', 0, 0, 0.5)

  _G.vec3 = vec3
  _G.quatFromDir = function(_d) return {x = 0, y = 0, z = 0, w = 1} end
  _G.castRayStatic = nil
  _G.loadJsonMaterialsFile = nil
  _G.FS = nil
  _G.log = function() end
  _G.createObject = function(kind) return ctx.newObject(kind) end
  _G.guihooks = {trigger = function(name, data)
    if name == 'driftSketch.hit' then ctx.hits[#ctx.hits + 1] = data end
    if name == 'driftSketch.state' then ctx.states[#ctx.states + 1] = data end
  end}
  _G.scenetree = {
    findObject = function(name) return ctx.sceneByName[name] end,
    findObjectById = function(id) return ctx.sceneById[tonumber(id)] end
  }
  _G.scenetree.MissionGroup = ctx.newObject('SimGroup', 'MissionGroup')
  _G.be = {
    getPlayerVehicleID = function(_s, _i) return ctx.playerId end,
    getPlayerVehicle = function(_s, _i) return ctx.players[ctx.playerId] end,
    getObjectByID = function(_s, id) return ctx.players[tonumber(id)] end,
    getObjectOOBBCenterXYZ = function(_s, id)
      ctx.oobbCalls = ctx.oobbCalls + 1
      local v = ctx.players[tonumber(id)]
      if v then return v.pos.x, v.pos.y, v.pos.z end
    end,
    getObjectOOBBIsInitialized = function(_s, _id) return true end,
    getObjectOOBBHalfAxisXYZ = function(_s, _id, axis)
      ctx.oobbCalls = ctx.oobbCalls + 1
      if axis == 0 then return 2.4, 0, 0 end
      if axis == 1 then return 0, 1.0, 0 end
      return 0, 0, 0.6
    end,
    getObjectCount = function(_s) return 0 end,
    getObject = function(_s, _i) return nil end,
    reloadCollision = function(_s) ctx.reloads = ctx.reloads + 1 end
  }

  ctx.M = dofile(EXT_PATH)
  return ctx
end

local function buildCones(ctx)
  ctx.M.start()
  for x = 0, 20, 1 do
    ctx.player.pos = vec3(x, 0, 0.5)
    ctx.M.onUpdate(0.05)
  end
  ctx.M.stop()
  local out = {}
  for _, obj in pairs(ctx.sceneByName) do
    if obj.kind == 'TSStatic' then out[#out + 1] = obj end
  end
  return out
end

print('== 1. clean rollback: static cones, no topple, no counter ==')
local c = setup()
eq(c.M.version, '0.9.22', 'module version is 0.9.22')
local st = c.M.uiState()
local forbidden = {topple = true, coneCollision = true, hudTotal = true, hudLabel = true,
  hudSize = true, hudStyle = true, hudCard = true, hudOutline = true, hudGlow = true,
  hudShadow = true, soundEnabled = true, soundVolume = true}
local badKeys = 0
for key in pairs(st.settings) do if forbidden[key] then badKeys = badKeys + 1 end end
eq(badKeys, 0, 'no topple / collision / HUD / sound settings')
eq(st.settings.topple, nil, 'topple setting does not exist')
eq(st.settings.soundVolume, nil, 'sound gain setting does not exist')
eq(st.settings.maxCones, 2000, 'cone cap still 2000')
eq(st.toppledCount, nil, 'no toppled counter in state')
eq(st.displayTotal, nil, 'no HUD display total in state')
eq(st.extraVehicles, nil, 'no World Editor vehicle list in state')

local cones = buildCones(c)
check(#cones >= 4, 'Stop & Build created traffic cones (' .. #cones .. ')')
eq(c.M.uiState().coneCount, #cones, 'cone count reported by Lua')
eq(c.M.uiState().buildCount, 1, 'one drive saved')
local allStatic, allNoCollision = true, true
for _, obj in ipairs(cones) do
  if obj.kind ~= 'TSStatic' then allStatic = false end
  if obj.fields.collisionType ~= 'None' then allNoCollision = false end
end
check(allStatic, 'every cone is a TSStatic (no JBeam vehicle per cone)')
check(allNoCollision, 'every cone has collisionType=None (no physics)')

-- Drive the car straight through a cone: nothing may topple, move or be replaced.
local target = cones[1]
local originalName, originalCalls = target.name, target.setPosRotCalls
local ox, oy, oz = target.pos.x, target.pos.y, target.pos.z
c.player.pos = vec3(ox, oy, oz)
local beforeOobb = c.oobbCalls
for _ = 1, 6 do c.M.onUpdate(0.05) end
check(not target.deleted, 'cone is not deleted when the car drives through it')
check(target.name == originalName, 'cone is not replaced by a "movable" clone')
eq(target.setPosRotCalls, originalCalls, 'cone is never animated/rotated')
check(math.abs(target.pos.x - ox) < 0.0001 and math.abs(target.pos.y - oy) < 0.0001
  and math.abs(target.pos.z - oz) < 0.0001, 'cone stays at its original position')
eq(#c.hits, 0, 'no cone-hit / counter event is ever fired')
eq(c.M.uiState().toppledCount, nil, 'still no toppled counter after contact')
eq(c.oobbCalls, beforeOobb, 'no per-frame cone/vehicle OOBB scan while idle')

print('== 2. path lifecycle unchanged ==')
c.M.rebuild()
eq(c.M.uiState().coneCount, #cones, 'Rebuild restores the same number of cones')
check(c.M.uiState().buildCount == 1, 'Rebuild keeps the saved drive')
local beforeClear = c.reloads
c.M.clear()
eq(c.M.uiState().coneCount, 0, 'Clear removes all cones')
eq(c.M.uiState().buildCount, 0, 'Clear removes saved drives')
check(c.reloads > beforeClear, 'Clear still refreshes the collision world')
c.M.start()
for x = 0, 20, 1 do c.player.pos = vec3(x, 0, 0.5); c.M.onUpdate(0.05) end
c.M.stop()
check(c.M.uiState().coneCount > 0, 'Start / Stop & Build still works after Clear')
eq(c.M.setSetting('spacing', 2.0).settings.spacing, 2.0, 'spacing setting still works')
eq(c.M.setSetting('topple', true).settings.topple, nil, 'setting removed keys is ignored')

print('== 3. migration from 0.9.20 / 0.9.21 ==')
local m = setup()
m.M.onDeserialized{
  version = '0.9.21',
  settings = {
    spacing = 2.0, gap = 0.5, groundOffset = -0.4, maxCones = 400,
    smooth = false, keepBuilds = false, driftWidth = true,
    -- everything below must be ignored:
    topple = true, coneCollision = true, hudTotal = 5000, hudLabel = 'CONES DOWN',
    hudSize = 1.8, hudStyle = 'neon', hudCard = true, hudOutline = true,
    hudGlow = true, hudShadow = true, soundEnabled = true, soundVolume = 3.0
  },
  savedPaths = {}, removedConePositions = {}
}
local got = m.M.uiState().settings
eq(got.spacing, 2.0, '0.9.21 spacing preserved')
eq(got.gap, 0.5, '0.9.21 gap preserved')
eq(got.groundOffset, -0.4, '0.9.21 ground offset preserved')
eq(got.maxCones, 400, '0.9.21 cone cap preserved (no legacy 500 reset)')
eq(got.smooth, false, '0.9.21 smooth switch preserved')
eq(got.keepBuilds, false, '0.9.21 keep-builds switch preserved')
eq(got.driftWidth, true, '0.9.21 drift-width switch preserved')
eq(got.topple, nil, 'topple NOT restored from 0.9.21')
eq(got.coneCollision, nil, 'physical collision NOT restored from 0.9.21')
eq(got.hudCard, nil, 'photo-card NOT restored from 0.9.21')
eq(got.soundVolume, nil, 'sound gain NOT restored from 0.9.21')
for key in pairs(got) do
  check(not forbidden[key], 'only core settings survive migration: ' .. key)
end
eq(m.M.onSerialize().version, '0.9.22', 'serialization writes 0.9.22')

local m20 = setup()
m20.M.onDeserialized{version = '0.9.20', settings = {maxCones = 350, spacing = 1.5}, savedPaths = {}}
eq(m20.M.uiState().settings.maxCones, 350, '0.9.20 cone cap preserved')
eq(m20.M.uiState().settings.spacing, 1.5, '0.9.20 spacing preserved')

local old = setup()
old.M.onDeserialized{version = '0.9.5', settings = {maxCones = 500, spacing = 1.0}, savedPaths = {}}
eq(old.M.uiState().settings.maxCones, 2000, 'legacy 0.9.5 cap of 500 is reset to 2000')

print(string.format('== RESULT: %d checks, %d failed ==', total, failed))
TEST_TOTAL = total
TEST_FAILED = failed
