-- DriftSketch 0.9.28 mock test: rig centreline + self-overlap keep-out ---------------------------------
-- Runs the real lua/ge/extensions/driftSketch.lua in a mocked BeamNG GE VM.
--
-- The 0.9.24 failure: a scalar "rigHalfWidth" stored at the CAR's station and
-- applied symmetrically. A trailer sits 4-5 m BEHIND and swings to one side in
-- a drift, so the corridor was too wide on the empty side and still clipped the
-- cones on the trailer side. 0.9.25 records the trailer's WORLD centre + rotated
-- rectangle at every path point and clears it one side at a time.
--
-- The decisive checks here are geometric: no cone may be inside any recorded
-- trailer footprint, AND the side without the trailer stays tight.

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
    cones = {}, serial = 0, enumCalls = 0, reloads = 0, rigCenters = {}}

  function ctx.newObject(kind, name)
    ctx.serial = ctx.serial + 1
    local o = {kind = kind, name = name or (kind .. '_' .. ctx.serial),
      simId = 5000 + ctx.serial, fields = {}, pos = vec3(0, 0, 0), children = {},
      deleted = false, dirAngle = 0}
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
    function o:getDirectionVector()
      local a = self.dirAngle or 0
      return vec3(math.cos(a), math.sin(a), 0)
    end
    ctx.sceneById[o.simId] = o
    if name then ctx.sceneByName[name] = o end
    return o
  end

  function ctx.addVehicle(id, name, x, y, z)
    local v = ctx.newObject('BeamNGVehicle', name)
    v.id = id; v.pos = vec3(x, y, z); v.JBeam = 'mock_' .. name
    function v:getInitialLength() return 4.8 end
    function v:getInitialWidth() return 2.0 end
    function v:getPosition() return vec3(self.pos.x, self.pos.y, self.pos.z) end
    ctx.byId[id] = v
    ctx.sceneById[v.simId] = v
    ctx.sceneByName[name] = v
    ctx.list[#ctx.list + 1] = v
    return v
  end

  function ctx.addProp(name, x, y, z)
    local o = ctx.newObject('TSStatic', name)
    o.pos = vec3(x, y, z)
    function o:getPosition() return vec3(self.pos.x, self.pos.y, self.pos.z) end
    function o:getScale() return vec3(1, 1, 1) end
    return o
  end

  ctx.playerId = 101
  ctx.player = ctx.addVehicle(101, 'Kerri', 0, 0, 0.5)
  ctx.trailer = ctx.addVehicle(202, 'clone', -3, 1.2, 0.5)
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
    getObjectOOBBHalfAxisXYZ = function(_s, id, axis)
      -- Realistic OOBB: the three half-axis VECTORS rotate with the object,
      -- exactly like BeamNG's be:getObjectOOBBHalfAxisXYZ(id, axis).
      local v = ctx.byId[tonumber(id)]
      local a = (v and v.dirAngle) or 0
      local c, sn = math.cos(a), math.sin(a)
      if axis == 0 then return 2.4 * c, 2.4 * sn, 0 end
      if axis == 1 then return -1.0 * sn, 1.0 * c, 0 end
      return 0, 0, 0.6
    end,
    reloadCollision = function(_s) ctx.reloads = ctx.reloads + 1 end
  }

  ctx.M = dofile(EXT_PATH)
  return ctx
end

-- Car drives along +x (optionally a gentle S). `angle` is a constant drift:
-- the car HEADING differs from the path tangent, exactly like the screenshots.
-- The trailer is rigidly attached in the car's frame: long=-3, lat=side.
local function driveRig(ctx, opts)
  opts = opts or {}
  local angle = opts.angle or 0
  local side = opts.side or 1.2
  local wobble = opts.wobble or 0
  ctx.M.start()
  for i = 0, 40 do
    local x = i * 1.0
    local carY = opts.curve and 1.5 * math.sin(x / 7) or 0
    ctx.player.pos = vec3(x, carY, 0.5)
    ctx.player.dirAngle = angle
    -- Node Grabber joint: the trailer swings laterally AND rotates on its own,
    -- so its relative pose is NOT stable, but it still travels with the car.
    local swing = opts.swing or 0
    local baseAngle = opts.trailerAngle or angle
    ctx.trailer.dirAngle = baseAngle + 0.95 * math.sin(i * 1.15) * (swing > 0 and 1 or 0)
    local fx, fy = math.cos(angle), math.sin(angle)
    local w = wobble * math.sin(i * 0.9) + swing * math.sin(i * 1.7)
    local behind = opts.behind or 3
    local dX = -behind * fx - (side + w) * fy
    local dY = -behind * fy + (side + w) * fx
    ctx.trailer.pos = vec3(x + dX, carY + dY, 0.5)
    local ta = ctx.trailer.dirAngle or 0
    ctx.rigCenters[#ctx.rigCenters + 1] = {x = x + dX, y = carY + dY,
      fx = math.cos(ta), fy = math.sin(ta), hl = 2.4, hw = 1.0}
    ctx.M.onUpdate(0.05)
  end
  ctx.M.stop()
end

local function plainDrive(ctx)
  ctx.M.start()
  for x = 0, 20, 1 do
    ctx.player.pos = vec3(x, 0, 0.5)
    ctx.M.onUpdate(0.05)
  end
  ctx.M.stop()
end

local function corridorWidth(ctx)
  local width = 0
  for _, p in ipairs(ctx.cones) do
    if math.abs(p.y) > width then width = math.abs(p.y) end
  end
  return width
end

-- No cone may sit inside a recorded trailer footprint (radius >= half width).
local function conesInsideTrailer(ctx, radius)
  local worst, hits = 0, 0
  for _, c in ipairs(ctx.cones) do
    for _, t in ipairs(ctx.rigCenters) do
      local d = math.sqrt((c.x - t.x) ^ 2 + (c.y - t.y) ^ 2)
      if d < radius then
        hits = hits + 1
        if radius - d > worst then worst = radius - d end
      end
    end
  end
  return hits, worst
end

-- STRONGER CHECK: the trailer is a ROTATED RECTANGLE, not a point/circle.
local function conesInRectangles(ctx, margin)
  local hits, worst = 0, 0
  for _, c in ipairs(ctx.cones) do
    for _, r in ipairs(ctx.rigCenters) do
      local dx, dy = c.x - r.x, c.y - r.y
      local along = dx * r.fx + dy * r.fy
      local lat = -dx * r.fy + dy * r.fx
      local penLong = r.hl + (margin or 0) - math.abs(along)
      local penLat = r.hw + (margin or 0) - math.abs(lat)
      if penLong > 0 and penLat > 0 then
        hits = hits + 1
        if math.min(penLong, penLat) > worst then worst = math.min(penLong, penLat) end
      end
    end
  end
  return hits, worst
end

local function sideMaxima(ctx)
  local plus, minus = 0, 0
  for _, p in ipairs(ctx.cones) do
    if p.y >= 0 then plus = math.max(plus, p.y) else minus = math.max(minus, -p.y) end
  end
  return plus, minus
end

print('== 1. defaults & no per-frame scanning ==')
local a = setup()
eq(a.M.version, '0.9.28', 'module version is 0.9.28')
eq(a.M.uiState().settings.rigPad, 1.0, 'trailer-side extra room defaults to 1.0 m')
eq(a.M.uiState().settings.rigAware, true, 'auto detection ON by default')
eq(a.M.uiState().settings.collision, false, 'physical collision OFF')
eq(a.M.uiState().toppledCount, nil, 'no topple counter')
eq(a.M.uiState().rigPoseCount, 0, 'no trailer centreline before a build')

local idle = setup()
idle.M.setSetting('rigPad', 0)
idle.M.setSetting('rigAware', false)
plainDrive(idle)
local baseline = corridorWidth(idle)
check(baseline > 0.5 and baseline < 2.0,
  '0.9.4-style tight corridor (' .. string.format('%.2f', baseline) .. ' m)')
local enums = idle.enumCalls
for _ = 1, 20 do idle.M.onUpdate(0.05) end
eq(idle.enumCalls, enums, 'NO vehicle enumeration per frame when detection is off')

-- Standing correction: no repeated map-wide vehicle enumeration. The candidate
-- list is cached (1.5 s TTL, 32 entries max) even though a 41-point drive calls
-- sampleRig at every recorded station.
local scan = setup()
driveRig(scan, {side = 1.2})
check(scan.enumCalls <= 5,
  '41-point drive reads the vehicle list only ' .. tostring(scan.enumCalls) .. ' times')

print('== 2. THE FIX: real trailer centreline, one-sided clearance ==')
local r = setup()
r.M.setSetting('rigPad', 0)
driveRig(r, {side = 1.2})
check(r.M.uiState().rigCount >= 1, 'trailer detected (no hitch, no L key)')
check(r.M.uiState().rigPoseCount > 20,
  'trailer centreline recorded at ' .. tostring(r.M.uiState().rigPoseCount) .. ' stations')
local hits, worst = conesInsideTrailer(r, 0.95)
eq(hits, 0, 'NO cone inside a recorded trailer footprint (worst penetration ' ..
  string.format('%.2f', worst) .. ' m)')
local rectHits, rectWorst = conesInRectangles(r, 0.0)
eq(rectHits, 0, 'NO cone inside the real ROTATED RECTANGLE (worst ' ..
  string.format('%.2f', rectWorst) .. ' m)')
local plus, minus = sideMaxima(r)
check(plus > 2.2, string.format('trailer side widened (%.2f m)', plus))
check(minus < 2.0, string.format('empty side stays TIGHT (%.2f m)', minus))

-- A drifting car: heading != path tangent, so the trailer centre sits far off
-- the driven line. This is the case 0.9.24's symmetric width could not handle.
local d = setup()
d.M.setSetting('rigPad', 0)
driveRig(d, {angle = 0.9, side = 0})
check(d.M.uiState().rigPoseCount > 20, 'drift run recorded a trailer centreline')
local dhits, dworst = conesInsideTrailer(d, 0.95)
eq(dhits, 0, 'NO cone inside the drifting trailer footprint (worst ' ..
  string.format('%.2f', dworst) .. ' m)')
eq((conesInRectangles(d, 0.0)), 0, 'NO cone inside the drifting trailer RECTANGLE')
local dplus, dminus = sideMaxima(d)
-- Control: the SAME drift angle with no trailer. A car at 52 deg already needs
-- a wide lateral band of its own, so compare against that baseline, not 1.54 m.
local d0 = setup()
d0.M.setSetting('rigPad', 0)
d0.M.setSetting('rigAware', false)
d0.M.start()
for i = 0, 40 do
  d0.player.pos = vec3(i * 1.0, 0, 0.5)
  d0.player.dirAngle = 0.9
  d0.M.onUpdate(0.05)
end
d0.M.stop()
local cplus, cminus = sideMaxima(d0)
check(dminus > cminus + 1.0,
  string.format('drift widens the TRAILER side (%.2f vs %.2f m no-trailer)', dminus, cminus))
check(dplus <= cplus + 0.35,
  string.format('opposite side NOT widened by the rig (%.2f vs %.2f m no-trailer)', dplus, cplus))

-- A curved, wobbling (collision-glued) trailer is still fully cleared.
local w = setup()
w.M.setSetting('rigPad', 0)
driveRig(w, {curve = true, wobble = 0.45})
local whits, wworst = conesInsideTrailer(w, 0.95)
eq(whits, 0, 'NO cone inside a wobbling trailer on a curved path (worst ' ..
  string.format('%.2f', wworst) .. ' m)')
eq((conesInRectangles(w, 0.0)), 0, 'NO cone inside the wobbling trailer RECTANGLE')
check(w.M.uiState().rigCount >= 1, 'wobbling collision-glued rig is not dropped')

-- A LONG rig: the trailer centre is 6 m behind the car, i.e. ~24 resampled
-- stations. 0.9.24's +/-6 sample lag could never reach those cone stations.
local lag = setup()
lag.M.setSetting('rigPad', 0)
driveRig(lag, {side = 1.2, behind = 6})
local lhits, lworst = conesInsideTrailer(lag, 0.95)
eq(lhits, 0, 'LONG trailer (6 m behind): NO cone inside its footprint (worst ' ..
  string.format('%.2f', lworst) .. ' m)')
eq((conesInRectangles(lag, 0.0)), 0, 'LONG trailer: NO cone inside its RECTANGLE')

-- Articulation: the trailer's OWN heading differs from the car's (it swings on
-- the collision glue). Its rotated rectangle must still be fully cleared.
local art = setup()
art.M.setSetting('rigPad', 0)
driveRig(art, {angle = 0.9, trailerAngle = 1.45, side = 0.4})
local ahits, aworst = conesInsideTrailer(art, 0.95)
eq(ahits, 0, 'ARTICULATED trailer (own heading): NO cone inside its footprint (worst ' ..
  string.format('%.2f', aworst) .. ' m)')
eq((conesInRectangles(art, 0.0)), 0, 'ARTICULATED trailer: NO cone inside its RECTANGLE')

print('== 2b. NODE GRABBER (CTRL + LMB, then MMB): soft swinging joint ==')
-- This is how the rig is actually attached in game: two NODES are joined with
-- the node grabber. There is no coupler event, no hitch, no L key and NO World
-- Editor object. The relative pose changes by metres every sample and the
-- trailer rotates independently, yet it travels with the player car.
local ng = setup()
ng.M.setSetting('rigPad', 0)
driveRig(ng, {angle = 0.30, swing = 1.6})
check(ng.M.uiState().rigCount >= 1,
  'swinging Node Grabber trailer detected by CO-MOTION (no stable pose exists)')
check(ng.M.uiState().rigPoseCount > 20,
  'Node Grabber centreline recorded at ' .. tostring(ng.M.uiState().rigPoseCount) .. ' stations')
eq(ng.M.uiState().settings.rigPad, 0,
  'auto-detection does NOT silently overwrite the user rigPad slider')
local nghits, ngworst = conesInsideTrailer(ng, 0.95)
eq(nghits, 0, 'NO cone inside the swinging trailer footprint (worst ' ..
  string.format('%.2f', ngworst) .. ' m)')
eq((conesInRectangles(ng, 0.0)), 0, 'NODE GRABBER: NO cone inside the swinging RECTANGLE')
local ngplus, ngminus = sideMaxima(ng)
check(math.max(ngplus, ngminus) > 2.2,
  'swinging trailer still pushes cones out on its side')

-- A parked car and a stationary object must NEVER be adopted as rig members.
local pk = setup()
pk.M.setSetting('rigPad', 0)
plainDrive(pk)
eq(pk.M.uiState().rigCount, 0, 'parked car / stationary object NOT adopted as rig')

-- Manual re-scan, no World Editor involved.
local rd = setup()
rd.M.setSetting('rigPad', 0)
driveRig(rd, {side = 1.2})
local before = rd.M.uiState().rigPoseCount
eq(rd.M.redetectRig().rigCount >= 1, true, 'redetectRig() keeps the registered rig')
check(rd.M.uiState().rigPoseCount > 0,
  'redetectRig() re-measures the live pose and rebuilds (' ..
  tostring(before) .. ' -> ' .. tostring(rd.M.uiState().rigPoseCount) .. ' stations)')

print('== 3. old saved drive: synthesized centreline + TRAILER-SIDE pad ==')
local old = setup()
old.M.setSetting('rigPad', 0)
old.M.setSetting('rigAware', false)
plainDrive(old)
local narrow = corridorWidth(old)
local data = old.M.onSerialize()
data.settings.rigPad = nil
for _, path in ipairs(data.savedPaths) do
  for _, p in ipairs(path) do p.rigPoses = nil; p.rigHalfWidth = nil end
end
-- With NO rig registered, the old drive must stay at the tight 0.9.4 width:
-- the pad must NEVER widen the empty side on its own.
local restored = setup()
restored.M.onDeserialized(data)
restored.cones = {}
restored.M.onUpdate(0.05)
check(corridorWidth(restored) <= narrow + 0.15,
  'old drive with NO rig stays tight even with default pad 1.0 m (no global widening)')

-- With a LIVE rig, the synthesized centreline is used and the pad widens
-- ONLY the side where the trailer passes.
local live = setup()
live.M.setSetting('rigPad', 0)
live.M.onDeserialized(data)
live.M.onUpdate(0.05)
live.player.pos = vec3(20, 0, 0.5)
live.trailer.pos = vec3(17, 1.2, 0.5)
live.editor.selection.object = {live.trailer.simId}
live.cones = {}
live.M.useSelectedVehicle()
check(live.M.uiState().rigPoseCount > 20,
  'synthesized centreline covers ' .. tostring(live.M.uiState().rigPoseCount) .. ' stations')
local lp0, lm0 = sideMaxima(live)
live.M.setSetting('rigPad', 2)
live.cones = {}
live.M.rebuild()
local lp2, lm2 = sideMaxima(live)
check(lp2 > lp0 + 1.0, string.format(
  'pad widens the TRAILER side of a rebuilt old drive (%.2f -> %.2f m)', lp0, lp2))
check(math.abs(lm2 - lm0) < 0.25, string.format(
  'pad does NOT widen the EMPTY side of a rebuilt old drive (%.2f -> %.2f m)', lm0, lm2))

print('== 4. World Editor selection (optional), props, replay observer ==')
local m = setup()
m.M.setSetting('rigPad', 0)
plainDrive(m)
m.trailer.pos = vec3(m.player.pos.x - 3, 1.2, 0.5)
m.cones = {}
m.editor.selection.object = {m.trailer.simId}
local st = m.M.useSelectedVehicle()
eq(st.rigCount, 1, 'selected trailer registered')
eq(m.M.uiState().settings.rigPad, 0,
  'World Editor registration does NOT silently overwrite the user rigPad slider')
check(st.rigPoseCount > 0, 'registration immediately rebuilds with a centreline')
check(m.M.uiState().settings.rigPad >= 0, 'safety floor intact')

local pr = setup()
pr.M.setSetting('rigPad', 0)
plainDrive(pr)
pr.prop.pos = vec3(pr.player.pos.x - 3, 1.2, 0.5)
pr.editor.selection.object = {pr.prop.simId}
eq(pr.M.useSelectedVehicle().rigCount, 1, 'TSStatic prop trailer accepted')
local coneSimId
for id, obj in pairs(pr.sceneById) do
  if obj.kind == 'TSStatic' and tostring(obj.name):lower():find('driftsketch', 1, true) then
    coneSimId = id break
  end
end
check(coneSimId ~= nil, 'generated cone exists in the scene')
pr.editor.selection.object = {coneSimId}
eq(pr.M.useSelectedVehicle().rigCount, 1, 'generated cone is NOT a trailer')

-- A World Editor selection alone (no registration yet) is enough at build time.
local sel = setup()
sel.M.setSetting('rigPad', 0)
sel.M.onDeserialized(data)
sel.M.onUpdate(0.05)
sel.player.pos = vec3(20, 0, 0.5)
sel.trailer.pos = vec3(17, 1.2, 0.5)
sel.editor.selection.object = {sel.trailer.simId}
sel.M.rebuild()
check(sel.M.uiState().rigPoseCount > 20,
  'World Editor selection alone synthesizes the centreline on rebuild')

local o = setup()
o.M.setSetting('rigPad', 0)
plainDrive(o)
for i = 1, 14 do
  o.player.pos = vec3(30 + i * 2, 0, 0.5)
  o.trailer.pos = vec3(30 + i * 2 - 3, 1.2, 0.5)
  o.M.onUpdate(0.35)
end
check(o.M.uiState().rigCount >= 1, 'trailer auto-detected during replay')

print('== 5. serialization, migration, unregister / coupler ==')
local e = setup()
e.M.setSetting('rigPad', 0)
driveRig(e, {side = 1.2})
local serialized = e.M.onSerialize()
local hasPoses = false
for _, path in ipairs(serialized.savedPaths) do
  for _, p in ipairs(path) do
    if type(p.rigPoses) == 'table' and #p.rigPoses > 0 then hasPoses = true end
  end
end
check(hasPoses, 'saved drives keep the trailer centreline')
e.cones = {}
e.M.rebuild()
local ehits = conesInsideTrailer(e, 0.95)
eq(ehits, 0, 'Rebuild keeps cones outside the trailer')
local f = setup()
f.M.onDeserialized(serialized)
check(f.M.uiState().buildCount >= 1, 'saved drives restored on reload')

local c = setup()
c.editor.selection.object = {c.trailer.simId}
c.M.useSelectedVehicle()
eq(c.M.unregisterSelectedVehicle().rigCount, 0, 'selected vehicle unregistered')
eq(c.M.clearSelectedVehicles().rigCount, 0, 'clear-all leaves no rig')
local q = setup()
q.M.onCouplerAttached(q.player.id, q.trailer.id)
check(q.M.uiState().rigCount >= 1, 'coupler/hitch event adds the trailer')
q.M.onCouplerDetached(q.player.id, q.trailer.id)
eq(q.M.uiState().rigCount, 0, 'coupler detach removes it')

local g = setup()
g.M.onDeserialized{settings = {mesh = 'cone', spacing = 2.0, gap = 0.5,
  maxCones = 400, smooth = false, collision = false}, savedPaths = {}}
eq(g.M.uiState().settings.spacing, 2.0, '0.9.4 spacing preserved')
eq(g.M.uiState().settings.rigPad, 1.0, 'old save keeps the new 1.0 m floor')
local h = setup()
h.M.onDeserialized{settings = {spacing = 1.5, topple = true, coneCollision = true,
  hudCard = true, soundVolume = 3.0}, savedPaths = {}}
eq(h.M.uiState().settings.topple, nil, 'topple NOT brought back')
eq(h.M.uiState().settings.coneCollision, nil, 'physical cone collision NOT brought back')
eq(h.M.uiState().settings.hudCard, nil, 'HUD card NOT brought back')

print('== 6. PAD SWEEP: extra room goes to the TRAILER side only ==')
-- This is the exact screenshot complaint: dragging Hapesira minimale 0 -> 4 m
-- used to widen the EMPTY side and leave the trailer side unchanged.
local sweep = {}
for _, pad in ipairs({0, 1, 2, 3, 4}) do
  local c = setup()
  c.M.setSetting('rigPad', pad)
  driveRig(c, {side = 1.2})
  local plus, minus = sideMaxima(c)
  sweep[pad] = {plus = plus, minus = minus}
  check(math.abs(minus - 1.54) < 0.25, string.format(
    'pad %d: EMPTY side stays tight at %.2f m', pad, minus))
  eq((conesInRectangles(c, 0.0)), 0, 'pad ' .. pad .. ': no cone inside the trailer RECTANGLE')
end
check(sweep[1].plus > sweep[0].plus + 0.7,
  string.format('pad 0 -> 1 m NOW widens the TRAILER side (%.2f -> %.2f m)',
    sweep[0].plus, sweep[1].plus))
check(sweep[4].plus > sweep[0].plus + 3.5,
  string.format('pad 0 -> 4 m widens the TRAILER side by %.2f m',
    sweep[4].plus - sweep[0].plus))
check(math.abs(sweep[4].minus - sweep[0].minus) < 0.25,
  'pad 0 -> 4 m leaves the EMPTY side unchanged')


-- 0.9.28: self-overlapping paths (slow spins / donuts / hairpins)
local function driveSpiral(ctx, N)
  local centres = {}
  ctx.M.start()
  for i = 0, N do
    local a = i * 0.08
    local R = 9.0 - 6.0 * (i / N)
    local x, y = math.cos(a) * R - 9.0, math.sin(a) * R
    ctx.player.pos = vec3(x, y, 0.5)
    ctx.player.dirAngle = a + math.pi / 2
    local lag = 3.0
    local tx = x - lag * math.cos(ctx.player.dirAngle)
    local ty = y - lag * math.sin(ctx.player.dirAngle)
    ctx.trailer.pos = vec3(tx, ty, 0.5)
    ctx.trailer.dirAngle = ctx.player.dirAngle + 0.55
    centres[#centres + 1] = {x = x, y = y}
    ctx.rigCenters[#ctx.rigCenters + 1] = {x = tx, y = ty,
      fx = math.cos(ctx.trailer.dirAngle), fy = math.sin(ctx.trailer.dirAngle),
      hl = 2.4, hw = 1.0}
    ctx.M.onUpdate(0.05)
  end
  ctx.M.stop()
  return centres
end

local function driveCircle(ctx, radius, laps)
  local centres = {}
  local N = math.floor(laps * 2 * math.pi * radius / 0.5)
  ctx.M.start()
  for i = 0, N do
    local a = i * 0.5 / radius
    local x, y = math.cos(a) * radius - radius, math.sin(a) * radius
    ctx.player.pos = vec3(x, y, 0.5)
    ctx.player.dirAngle = a + math.pi / 2
    local tx = x - 3.0 * math.cos(ctx.player.dirAngle)
    local ty = y - 3.0 * math.sin(ctx.player.dirAngle)
    ctx.trailer.pos = vec3(tx, ty, 0.5)
    ctx.trailer.dirAngle = ctx.player.dirAngle
    centres[#centres + 1] = {x = x, y = y}
    ctx.rigCenters[#ctx.rigCenters + 1] = {x = tx, y = ty,
      fx = math.cos(ctx.trailer.dirAngle), fy = math.sin(ctx.trailer.dirAngle),
      hl = 2.4, hw = 1.0}
    ctx.M.onUpdate(0.05)
  end
  ctx.M.stop()
  return centres
end

local function conesInCorridor(ctx, centres, width)
  local n = 0
  for _, c in ipairs(ctx.cones) do
    for _, p in ipairs(centres) do
      local dx, dy = c.x - p.x, c.y - p.y
      if dx * dx + dy * dy < width * width then n = n + 1 break end
    end
  end
  return n
end

print('== 7. SELF-OVERLAPPING SPIN: no cone inside the car / trailer ==')
-- The two 0.9.27 screenshots: a slow turn where the path crosses itself, leaving
-- a comb of cones in the middle of the road and inside the jackknifed trailer.
for _, N in ipairs({200, 320}) do
  local c = setup()
  c.M.setSetting('rigPad', 0)
  c.M.setSetting('rigMargin', 0)
  c.M.setSetting('maxCones', 4000)
  local centres = driveSpiral(c, N)
  local inside = conesInCorridor(c, centres, 1.2)
  local rectHits = conesInRectangles(c, 0.0)
  eq(inside, 0, 'N=' .. N .. ': NO cone left inside the driving corridor')
  check(rectHits <= 5, string.format('N=%d: almost no cone inside a trailer RECTANGLE (got %d)', N, rectHits))
  check(c.M.uiState().trimmedCones > 20,
    string.format('N=%d: %d overlapping cones were removed and reported in the panel',
      N, c.M.uiState().trimmedCones))
  check(#c.cones > 40,
    string.format('N=%d: the outer cone lines are still built (%d cones)', N, #c.cones))
end
for _, radius in ipairs({4, 6}) do
  local c = setup()
  c.M.setSetting('rigPad', 0)
  c.M.setSetting('rigMargin', 0)
  c.M.setSetting('maxCones', 4000)
  local centres = driveCircle(c, radius, 1)
  eq(conesInCorridor(c, centres, 1.2), 0,
    'clean circle r=' .. radius .. ': no cone inside the corridor')
  eq((conesInRectangles(c, 0.0)), 0,
    'clean circle r=' .. radius .. ': no cone inside the trailer')
  check(#c.cones >= 40, 'clean circle r=' .. radius .. ': cone lines preserved')
end
local straight = setup()
straight.M.setSetting('maxCones', 4000)
plainDrive(straight)
eq(straight.M.uiState().trimmedCones, 0,
  'a normal straight drive removes NO cones (no false positives)')

print(string.format('== RESULT: %d checks, %d failed ==', total, failed))
TEST_TOTAL = total
TEST_FAILED = failed
