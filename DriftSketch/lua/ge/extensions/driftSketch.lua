-- DriftSketch 0.9.1 — record a drive, build real low-poly meshes on both sides, keep them for replay.
-- Markers: orange traffic cones or red/white(/blue) four-tyre stacks. Optional START/FINISH truss
-- gates and red/white stunt rings. Every shape is an original COLLADA file with flat PBR materials
-- (no texture files), loaded explicitly from this mod before the first TSStatic is created.
-- 0.9.1: smooth marker lines and a tight corridor (real car width + Gap per side).
local M = {}
M.version = '0.9.1'

local ASSET_DIR = '/art/shapes/driftsketch_v09/'
local MATERIAL_FILE = ASSET_DIR .. 'main.materials.json'
local GROUP_NAME = 'DriftSketch_Objects'

-- Shape dimensions at scale 1 (see tests/make_driftsketch_assets.py).
local CONE_RADIUS, CONE_HEIGHT = 0.24, 0.66
local TIRE_RADIUS, TIRE_HEIGHT = 0.34, 0.85
local GATE_CLEAR_HALF = 4.35      -- inner edge of both tower base plates
local GATE_FOOT_OUTER = 5.25      -- outer edge of the base plates
local GATE_FOOT_ALONG = 0.45      -- base plate half depth along the path
local GATE_TOWER_CENTER = 4.8
local GATE_MIN_SCALE, GATE_MAX_SCALE = 0.8, 2.6
local RING_OPENING, RING_TUBE = 6.0, 0.3   -- clear opening diameter, tube radius
local RING_MAX_TOTAL = 300

local TIRE_PATTERNS = {
  rw = {'red', 'red', 'white', 'white'},
  rwb = {'red', 'red', 'white', 'white', 'blue', 'blue'}
}

local SETTINGS = {
  mesh = 'cone',
  tireColors = 'rw',
  spacing = 1.0,
  gap = 0.3,          -- metres between the car side and the marker, per side
  scale = 1.0,
  groundOffset = -0.55,
  maxCones = 2000,
  smooth = true,
  keepBuilds = true,
  collision = false,
  driftWidth = false,
  gates = true,
  rings = false,
  ringCount = 5,
  ringSize = 7.0,
  ringGap = 15.0,
  ringLift = 0.0
}

local recording = false
local points = {}
local activeVehicleId = nil
local activeVehicleName = 'No vehicle'
local savedPaths = {}
local ringSets = {}
local spawned = {}        -- path markers and gates
local ringObjects = {}    -- rings (path rings and rings placed ahead of the car)
local status = 'Ready. Press Start and drive.'
local statusError = false
local uiClock = 0
local clockTotal = 0
local objectSerial = 0
local session = tostring((os and os.time and os.time() or 0) % 1000000)
local collisionDirty = false
local markersSolid = false
local ringsSolid = false
local ringRebuildAt = nil
local pathRebuildAt = nil
local pendingRestore = false
local restored = false

local function clamp(value, minimum, maximum)
  return math.max(minimum, math.min(maximum, value))
end

local function truthy(value)
  return not (value == false or value == 'false' or value == 0 or value == nil)
end

local function copyPoints(source)
  local out = {}
  for i, p in ipairs(source) do
    out[i] = {
      x=p.x, y=p.y, z=p.z, fx=p.fx, fy=p.fy,
      carHalfLength=p.carHalfLength, carHalfWidth=p.carHalfWidth
    }
  end
  return out
end

local function pathLength(path)
  local total = 0
  for i = 2, #path do
    local a, b = path[i - 1], path[i]
    local dx, dy = b.x - a.x, b.y - a.y
    total = total + math.sqrt(dx * dx + dy * dy)
  end
  return total
end

local function currentVehicle()
  if not be or not be.getPlayerVehicleID then return nil, nil end
  local id = be:getPlayerVehicleID(0)
  if not id then return nil, nil end
  local veh
  if be.getObjectByID then
    local ok, value = pcall(be.getObjectByID, be, id)
    if ok then veh = value end
  end
  if not veh and be.getPlayerVehicle then
    local ok, value = pcall(be.getPlayerVehicle, be, 0)
    if ok then veh = value end
  end
  return veh, id
end

local function vehicleName(veh, id)
  local name
  if core_vehicles and core_vehicles.getCurrentVehicleDetails then
    local ok, details = pcall(core_vehicles.getCurrentVehicleDetails)
    if ok and details and details.model then
      name = ((details.model.Brand and (details.model.Brand .. ' ')) or '') .. tostring(details.model.Name or '')
    end
  end
  if (not name or name == '') and veh then
    local ok, model = pcall(function() return veh.JBeam end)
    if ok and model then name = tostring(model) end
  end
  return (name and name ~= '') and name or ('Vehicle ' .. tostring(id or '?'))
end

local function vehicleNumber(veh, method, fallback, minimum, maximum)
  if not veh or not veh[method] then return fallback end
  local ok, value = pcall(veh[method], veh)
  if not ok or type(value) ~= 'number' or value <= 0 then return fallback end
  return math.max(minimum, math.min(maximum, value))
end

-- Prefer the real OOBB center over the JBeam reference node. This keeps long
-- front/rear overhangs centered inside the generated corridor.
local function vehiclePosition(veh, id)
  if be and be.getObjectOOBBCenterXYZ and id then
    local ok, x, y, z = pcall(be.getObjectOOBBCenterXYZ, be, id)
    if ok and type(x) == 'number' and type(y) == 'number' and type(z) == 'number' then
      return vec3(x, y, z)
    end
  end
  if veh and veh.getPosition then
    local ok, pos = pcall(veh.getPosition, veh)
    if ok then return pos end
  end
  return nil
end

local function vehicleFootprint(veh, id, fx, fy)
  local halfLength = vehicleNumber(veh, 'getInitialLength', 4.8, 1.0, 20.0) * 0.5
  local halfWidth = vehicleNumber(veh, 'getInitialWidth', 2.0, 0.6, 6.0) * 0.5
  if not be or not id or not be.getObjectOOBBHalfAxisXYZ then return halfLength, halfWidth end

  local initialized = true
  if be.getObjectOOBBIsInitialized then
    local ok, value = pcall(be.getObjectOOBBIsInitialized, be, id)
    initialized = ok and not (value == false or value == nil or value == 0)
  end
  if not initialized then return halfLength, halfWidth end

  -- Project all three real OOBB half axes onto the planar vehicle basis.
  -- This includes accessories such as a rear wing without guessing axis order.
  local axes = {}
  for axis = 0, 2 do
    local ok, x, y, z = pcall(be.getObjectOOBBHalfAxisXYZ, be, id, axis)
    if not ok or type(x) ~= 'number' or type(y) ~= 'number' or type(z) ~= 'number' then
      return halfLength, halfWidth
    end
    axes[#axes + 1] = {x=x, y=y}
  end
  local rightX, rightY = -fy, fx
  local obbLength, obbWidth = 0, 0
  for _, axis in ipairs(axes) do
    obbLength = obbLength + math.abs(axis.x * fx + axis.y * fy)
    obbWidth = obbWidth + math.abs(axis.x * rightX + axis.y * rightY)
  end
  if obbLength > 0.1 and obbWidth > 0.1 then
    halfLength = math.max(halfLength, math.max(0.5, math.min(10.0, obbLength)))
    halfWidth = math.max(halfWidth, math.max(0.3, math.min(3.0, obbWidth)))
  end
  return halfLength, halfWidth
end

local function vehiclePathPoint(veh, pos, id)
  local fx, fy = 1, 0
  if veh and veh.getDirectionVector then
    local ok, forward = pcall(veh.getDirectionVector, veh)
    if ok and forward then
      local length = math.sqrt(forward.x * forward.x + forward.y * forward.y)
      if length > 0.001 then fx, fy = forward.x / length, forward.y / length end
    end
  end
  local halfLength, halfWidth = vehicleFootprint(veh, id, fx, fy)
  return {
    x=pos.x, y=pos.y, z=pos.z, fx=fx, fy=fy,
    carHalfLength=halfLength, carHalfWidth=halfWidth
  }
end


local function publicState()
  local out = {
    recording = recording,
    pointCount = #points,
    pathLength = pathLength(points),
    buildCount = #savedPaths,
    coneCount = #spawned,
    ringsBuilt = #ringObjects,
    ringSetCount = #ringSets,
    meshCount = #spawned + #ringObjects,
    vehicleName = activeVehicleName,
    status = status,
    statusError = statusError,
    version = M.version,
    settings = {}
  }
  for k, v in pairs(SETTINGS) do out.settings[k] = v end
  return out
end

local function sendState()
  if guihooks and guihooks.trigger then guihooks.trigger('driftSketch.state', publicState()) end
  return publicState()
end

local function deleteList(list)
  for _, obj in ipairs(list) do
    if obj and obj.delete then pcall(function() obj:delete() end) end
  end
end

local function removeMarkers()
  if markersSolid then collisionDirty = true end
  markersSolid = false
  deleteList(spawned)
  spawned = {}
end

local function removeRings()
  if ringsSolid then collisionDirty = true end
  ringsSolid = false
  deleteList(ringObjects)
  ringObjects = {}
end

local function removeObjects()
  removeMarkers()
  removeRings()
end

local function reloadCollision()
  if not collisionDirty then return end
  if be and be.reloadCollision then pcall(be.reloadCollision, be) end
  collisionDirty = false
end

-- All generated objects live in one SimGroup. After a Lua reload the previous VM's
-- objects are still in the scene; the group lets the new VM find and remove them.
local function findGroup()
  if not scenetree or not scenetree.findObject then return nil end
  local ok, group = pcall(scenetree.findObject, GROUP_NAME)
  if ok and group then return group end
  return nil
end

local function objectGroup()
  local group = findGroup()
  if group or not createObject then return group end
  local ok, created = pcall(createObject, 'SimGroup')
  if not ok or not created then return nil end
  ok = pcall(function()
    created.canSave = false
    created:registerObject(GROUP_NAME)
    local mission = scenetree and scenetree.MissionGroup
    if mission then
      if mission.addObject then mission:addObject(created) else mission:add(created) end
    end
  end)
  return ok and created or nil
end

local function sweepGroup()
  local group = findGroup()
  if not group then return 0 end
  local count = 0
  pcall(function() count = group:getCount() end)
  if count > 0 then
    pcall(function() group:deleteAllObjects() end)
    collisionDirty = true
  end
  return count
end

local function clearAll()
  recording = false
  points = {}
  savedPaths = {}
  ringSets = {}
  ringRebuildAt = nil
  pathRebuildAt = nil
  pendingRestore = false
  removeObjects()
  sweepGroup()
  reloadCollision()
end

local function markerRadius()
  return (SETTINGS.mesh == 'tireStack' and TIRE_RADIUS or CONE_RADIUS) * SETTINGS.scale
end

local function markerHeight()
  return (SETTINGS.mesh == 'tireStack' and TIRE_HEIGHT or CONE_HEIGHT) * SETTINGS.scale
end

-- Path shaping (0.9.1) -------------------------------------------------------------
-- The recorded centre line is resampled every PATH_STEP metres and, with Smooth path
-- ON, Gaussian-filtered over a few metres: steering corrections and drift wobble no
-- longer reach the marker lines. The corridor is the real car width plus Gap on each
-- side; any change of that width is eased along the path, never point by point.

local PATH_STEP = 0.25
local PATH_MAX_SAMPLES = 24000
local SMOOTH_SIGMA = 2.0       -- metres along the path (Smooth path ON)
local WIDTH_SIGMA = 2.0        -- metres: corridor width changes are eased with this
local DRIFT_EXTRA_MAX = 2.0    -- Drift widen adds at most this per side

local function median(values, fallback)
  if #values == 0 then return fallback end
  local sorted = {}
  for i, value in ipairs(values) do sorted[i] = value end
  table.sort(sorted)
  return sorted[math.floor((#sorted + 1) / 2)]
end

-- Real car size of one drive: the median of all samples, so a single OOBB spike
-- (a crash, a door) cannot make one stretch of the corridor wider.
local function driveCarSize(source)
  local widths, lengths = {}, {}
  for _, p in ipairs(source) do
    if type(p.carHalfWidth) == 'number' then widths[#widths + 1] = p.carHalfWidth end
    if type(p.carHalfLength) == 'number' then lengths[#lengths + 1] = p.carHalfLength end
  end
  return median(widths, 1.0), median(lengths, 2.4)
end

-- Samples every <= PATH_STEP metres along the recorded drive. Every recorded point
-- is kept as a sample, so the corridor sees the real extremes of the driven line.
local function resampleCenter(source)
  local out = {}
  local total = pathLength(source)
  if #source < 2 or total < 0.05 then
    for i, p in ipairs(source) do out[i] = {x = p.x, y = p.y, z = p.z, fx = p.fx, fy = p.fy} end
    return out, PATH_STEP
  end
  local step = math.max(PATH_STEP, total / PATH_MAX_SAMPLES)
  local function sample(a, b, t)
    local q = {x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t}
    if a.fx and a.fy and b.fx and b.fy then
      local fx, fy = a.fx + (b.fx - a.fx) * t, a.fy + (b.fy - a.fy) * t
      local size = math.sqrt(fx * fx + fy * fy)
      if size > 0.001 then q.fx, q.fy = fx / size, fy / size else q.fx, q.fy = b.fx, b.fy end
    end
    return q
  end
  out[1] = sample(source[1], source[1], 0)
  for i = 1, #source - 1 do
    local a, b = source[i], source[i + 1]
    local dx, dy = b.x - a.x, b.y - a.y
    local length = math.sqrt(dx * dx + dy * dy)
    if length > 0.000001 then
      local parts = math.max(1, math.ceil(length / step - 0.0001))
      for k = 1, parts do out[#out + 1] = sample(a, b, k / parts) end
    end
  end
  if #out < 2 then return out, PATH_STEP end
  return out, total / (#out - 1)
end

-- Value at sample `from` of the least-squares line through `count` samples going
-- in direction `dir` (+1 from the start, -1 from the end).
local function fittedEnd(values, from, dir, count)
  local sx, sy, sxx, sxy = 0, 0, 0, 0
  for k = 0, count - 1 do
    local v = values[from + dir * k]
    sx, sy, sxx, sxy = sx + k, sy + v, sxx + k * k, sxy + k * v
  end
  local den = count * sxx - sx * sx
  if math.abs(den) < 1e-9 then return values[from] end
  return (sy * sxx - sx * sxy) / den
end

-- Gaussian filter. anchored = true (positions): the ends are mirrored through a
-- straight fit of the first and last few metres, so the line keeps its end heading,
-- starts and finishes where the car was (minus the wobble) and is filtered right up
-- to the ends. anchored = false (corridor widths): the window shrinks near the
-- ends, so the result never drops below what the running maximum asked for.
local function smoothValues(values, sigma, step, anchored)
  local n = #values
  if sigma <= 0 or n < 3 then return values end
  -- Never wider than the drive itself: a mirror must not run past the other end.
  local radius = math.min(n - 1, math.max(1, math.floor(3 * sigma / step + 0.5)))
  local weights = {}
  for k = 0, radius do weights[k] = math.exp(-0.5 * (k * step / sigma) ^ 2) end
  local first, last = values[1], values[n]
  if anchored then
    local count = math.max(2, math.min(n, math.floor(1.5 * sigma / step + 0.5) + 1))
    first, last = fittedEnd(values, 1, 1, count), fittedEnd(values, n, -1, count)
  end
  local function at(index)
    if index < 1 then return 2 * first - values[math.min(n, 2 - index)] end
    if index > n then return 2 * last - values[math.max(1, 2 * n - index)] end
    return values[index]
  end
  local out = {}
  for i = 1, n do
    local reach = anchored and radius or math.min(radius, i - 1, n - i)
    local sum, weight = values[i] * weights[0], weights[0]
    for k = 1, reach do
      sum = sum + (at(i - k) + at(i + k)) * weights[k]
      weight = weight + 2 * weights[k]
    end
    out[i] = sum / weight
  end
  return out
end

-- Smoothed centre line. rx/ry keep where the car really was at that sample.
local function smoothPath(source)
  local path, step = resampleCenter(source)
  local xs, ys, zs = {}, {}, {}
  for i, p in ipairs(path) do xs[i], ys[i], zs[i] = p.x, p.y, p.z end
  if SETTINGS.smooth then
    xs = smoothValues(xs, SMOOTH_SIGMA, step, true)
    ys = smoothValues(ys, SMOOTH_SIGMA, step, true)
    zs = smoothValues(zs, SMOOTH_SIGMA, step, true)
  end
  for i, p in ipairs(path) do
    p.rx, p.ry = p.x, p.y
    p.x, p.y, p.z = xs[i], ys[i], zs[i]
  end
  -- Tangents over +-1 m of the (already smooth) line.
  local reach = math.max(1, math.floor(1.0 / step + 0.5))
  for i, p in ipairs(path) do
    local a, b = path[math.max(1, i - reach)], path[math.min(#path, i + reach)]
    local dx, dy = b.x - a.x, b.y - a.y
    local size = math.sqrt(dx * dx + dy * dy)
    if size > 0.0001 then
      p.tx, p.ty = dx / size, dy / size
    elseif i > 1 then
      p.tx, p.ty = path[i - 1].tx, path[i - 1].ty
    else
      p.tx, p.ty = p.fx or 1, p.fy or 0
    end
  end
  return path, step
end

-- Distance from the smoothed line to the marker centres on each side. The base is
-- car half width + Gap + marker radius. Every real car position nearby must stay at
-- least that far from the marker (where the car ran beside the smoothed line, that
-- side opens by the difference). Drift widen also keeps the whole car rectangle,
-- turned to its real heading, clear for every pose within one car length.
local function corridorNeeds(path, step, halfWidth, halfLength)
  local margin = SETTINGS.gap + markerRadius()
  local base = halfWidth + margin
  local drift = SETTINGS.driftWidth
  local reachClear = math.floor((base + 1.0) / step + 0.5)
  local reachDrift = drift and math.floor((halfLength + margin + 0.5) / step + 0.5) or 0
  local reach = math.max(reachClear, reachDrift)
  local left, right = {}, {}
  for i, c in ipairs(path) do
    local tx, ty = c.tx, c.ty
    local nx, ny = -ty, tx
    local needLeft, needRight = base, base
    for j = math.max(1, i - reach), math.min(#path, i + reach) do
      local q = path[j]
      local dx, dy = q.rx - c.x, q.ry - c.y
      local lateral = dx * nx + dy * ny
      local along = dx * tx + dy * ty
      if math.abs(along) < base then
        -- Circle of radius base around the real car position.
        local half = math.sqrt(base * base - along * along)
        needLeft = math.max(needLeft, lateral + half)
        needRight = math.max(needRight, half - lateral)
      end
      if drift and math.abs(i - j) <= reachDrift then
        -- Reach of the car rectangle (grown by the margin) across the path here.
        local fx, fy = q.fx or q.tx, q.fy or q.ty
        local extent = base * math.abs(fx * ny - fy * nx) + (halfLength + margin) * math.abs(fx * nx + fy * ny)
        extent = math.min(math.max(extent, base), base + DRIFT_EXTRA_MAX)
        needLeft = math.max(needLeft, lateral + extent)
        needRight = math.max(needRight, extent - lateral)
      end
    end
    left[i], right[i] = needLeft, needRight
  end
  return left, right, base
end

-- Running maximum, then a Gaussian no wider than that window: the eased width is
-- never below what any sample needs, and it changes gently.
local function easeNeeds(values, step)
  local radius = math.max(1, math.floor(3 * WIDTH_SIGMA / step + 0.5))
  local maxed = {}
  for i = 1, #values do
    local high = values[i]
    for j = math.max(1, i - radius), math.min(#values, i + radius) do
      if values[j] > high then high = values[j] end
    end
    maxed[i] = high
  end
  return smoothValues(maxed, radius * step / 3, step, false)
end

-- On the inside of a turn tighter than the corridor the offset line folds back over
-- itself. A point that lies inside the corridor of any other sample is dropped.
-- Smooth path OFF follows the raw line, whose small wobble may come a little closer
-- to a neighbouring sample: there only a deep intrusion (a real fold) is dropped.
local function markFolds(line, path, offsetsLeft, offsetsRight)
  local depth = SETTINGS.smooth and 1.0 or 0.8
  local largest = 0
  for i = 1, #path do largest = math.max(largest, offsetsLeft[i], offsetsRight[i]) end
  local cell = math.max(2.0, largest)
  local grid = {}
  for index, c in ipairs(path) do
    local key = math.floor(c.x / cell) * 1000000 + math.floor(c.y / cell)
    local bucket = grid[key]
    if not bucket then bucket = {}; grid[key] = bucket end
    bucket[#bucket + 1] = index
  end
  for _, q in ipairs(line) do
    local gx, gy = math.floor(q.x / cell), math.floor(q.y / cell)
    local blocked = false
    for ox = -1, 1 do
      for oy = -1, 1 do
        local bucket = grid[(gx + ox) * 1000000 + gy + oy]
        if bucket then
          for _, index in ipairs(bucket) do
            local c = path[index]
            local dx, dy = q.x - c.x, q.y - c.y
            local side = (dx * -c.ty + dy * c.tx) >= 0 and offsetsLeft[index] or offsetsRight[index]
            local limit = math.min(q.offset, side) * depth - 0.03
            if dx * dx + dy * dy < limit * limit then blocked = true; break end
          end
        end
        if blocked then break end
      end
      if blocked then break end
    end
    q.blocked = blocked
  end
end

-- Resample one offset polyline by its own arc length. Inner and outer curves have
-- different lengths, so each gets independent physical spacing.
local function resampleLine(path, spacing)
  if #path < 2 then return {} end
  local total = pathLength(path)
  if total < 0.05 then return {} end
  local count = math.floor(total / spacing + 0.0001) + 1
  local samples = {}
  local segment, segmentStart, segmentLength = 1, 0, 0
  local function updateSegment()
    local a, b = path[segment], path[segment + 1]
    local dx, dy = b.x - a.x, b.y - a.y
    segmentLength = math.sqrt(dx * dx + dy * dy)
  end
  updateSegment()
  for index = 0, count - 1 do
    local distance = math.min(total, index * spacing)
    while segment < #path - 1 and distance > segmentStart + segmentLength do
      segmentStart = segmentStart + segmentLength
      segment = segment + 1
      updateSegment()
    end
    local a, b = path[segment], path[segment + 1]
    local t = 0
    if segmentLength > 0.0001 then t = math.max(0, math.min(1, (distance - segmentStart) / segmentLength)) end
    local nx, ny = a.nx + (b.nx - a.nx) * t, a.ny + (b.ny - a.ny) * t
    local size = math.sqrt(nx * nx + ny * ny)
    if size > 0.001 then nx, ny = nx / size, ny / size else nx, ny = a.nx, a.ny end
    samples[#samples + 1] = {
      x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t, nx = nx, ny = ny
    }
  end
  return samples
end

-- Markers every `spacing` metres along the kept runs of one line (a folded stretch
-- is a break, never a chord across the corridor), within the object cap.
local function placeAlong(line, spacing, maxSamples)
  local runs, run = {}, nil
  for _, q in ipairs(line) do
    if q.blocked then
      run = nil
    else
      if not run then run = {}; runs[#runs + 1] = run end
      run[#run + 1] = q
    end
  end
  local total = 0
  for _, part in ipairs(runs) do total = total + pathLength(part) end
  local step = spacing
  if total / step + #runs > maxSamples then step = total / math.max(1, maxSamples - #runs) end
  local out = {}
  for _, part in ipairs(runs) do
    for _, q in ipairs(resampleLine(part, step)) do
      if #out >= maxSamples then return out end
      out[#out + 1] = q
    end
  end
  return out
end

-- Two clean marker lines (right, left) for one drive, and the corridor half width.
local function buildOffsetLines(source, spacing, reserveObjects)
  local path, step = smoothPath(source)
  if #path < 2 then return {{}, {}}, 0 end
  local halfWidth, halfLength = driveCarSize(source)
  local needLeft, needRight, base = corridorNeeds(path, step, halfWidth, halfLength)
  local offsetsLeft, offsetsRight = easeNeeds(needLeft, step), easeNeeds(needRight, step)
  local right, left = {}, {}
  for i, c in ipairs(path) do
    local nx, ny = -c.ty, c.tx
    left[i] = {x = c.x + nx * offsetsLeft[i], y = c.y + ny * offsetsLeft[i], z = c.z,
      nx = nx, ny = ny, offset = offsetsLeft[i]}
    right[i] = {x = c.x - nx * offsetsRight[i], y = c.y - ny * offsetsRight[i], z = c.z,
      nx = -nx, ny = -ny, offset = offsetsRight[i]}
  end
  markFolds(left, path, offsetsLeft, offsetsRight)
  markFolds(right, path, offsetsLeft, offsetsRight)
  local maxSamples = math.max(2, math.floor((SETTINGS.maxCones - (reserveObjects or 0)) / 2))
  return {placeAlong(right, spacing, maxSamples), placeAlong(left, spacing, maxSamples)}, base
end

local function castDown(x, y, fromZ, maxLength)
  if not castRayStatic then return nil end
  local ok, distance = pcall(castRayStatic, vec3(x, y, fromZ), vec3(0, 0, -1), maxLength)
  if ok and type(distance) == 'number' and distance >= 0 and distance < maxLength then
    return fromZ - distance
  end
  return nil
end

-- Ground under a recorded path point. The short ray stays below bridges and trees.
local function groundZ(x, y, recordedZ)
  return castDown(x, y, recordedZ + 4, 12) or (recordedZ + SETTINGS.groundOffset)
end

-- Ground away from the recorded line (gate towers, rings ahead of the car): short ray
-- first, then a long one for hills. The second value reports whether a ray hit.
local function groundAt(x, y, zHint)
  local z = castDown(x, y, zHint + 4, 14)
  if z then return z, true end
  z = castDown(x, y, zHint + 60, 140)
  if z then return z, true end
  return zHint + SETTINGS.groundOffset, false
end

local materialsLoaded = false

-- Runtime-created TSStatic shapes do not reliably cause a mod-root material
-- library to be loaded. Load it explicitly once, before the first shape is
-- created; retry on the next build if the VFS was not ready on the first try.
local function ensureMaterials()
  if materialsLoaded then return true end
  if type(loadJsonMaterialsFile) ~= 'function' then return false end
  if FS and FS.fileExists then
    local ok, exists = pcall(FS.fileExists, FS, MATERIAL_FILE)
    if not ok or not exists then return false end
  end
  local ok, err = pcall(loadJsonMaterialsFile, MATERIAL_FILE)
  if not ok then
    if log then log('E', 'driftSketch', 'Cannot load materials: ' .. tostring(err)) end
    return false
  end
  materialsLoaded = true
  if log then log('I', 'driftSketch', 'Loaded ' .. MATERIAL_FILE) end
  return true
end

-- BeamNG convention: local +Y is forward. quatFromDir maps +Y onto dir (and keeps
-- +Z up), which is exactly what TSStatic setPosRot expects.
local function rotationFromDir(dx, dy, dz)
  if not quatFromDir then return nil end
  local ok, q = pcall(quatFromDir, vec3(dx, dy, dz or 0))
  if ok and q then return q end
  return nil
end

local function addToScene(obj, group)
  if group then
    local ok = pcall(function() group:addObject(obj) end)
    if ok then return true end
  end
  local mission = scenetree and scenetree.MissionGroup
  if mission then
    return pcall(function()
      if mission.addObject then mission:addObject(obj) else mission:add(obj) end
    end)
  end
  return false
end

local function spawnMesh(x, y, z, options)
  if not createObject then return nil end
  local ok, obj = pcall(createObject, 'TSStatic')
  if not ok or not obj then return nil end
  objectSerial = objectSerial + 1
  obj.shapeName = options.shapeName
  obj.canSave = false
  obj.useInstanceRenderData = true
  if obj.setField then
    obj:setField('collisionType', 0, SETTINGS.collision and 'Visible Mesh Final' or 'None')
    obj:setField('decalType', 0, 'None')
  end
  local rotation = options.rotation
  if rotation and obj.setPosRot then
    obj:setPosRot(x, y, z, rotation.x, rotation.y, rotation.z, rotation.w)
  else
    obj:setPosition(vec3(x, y, z))
  end
  local scale = options.scale or SETTINGS.scale
  if type(scale) == 'number' then scale = vec3(scale, scale, scale) end
  obj:setScale(scale)
  obj:registerObject(string.format('%s%s_%d', options.prefix or 'driftSketch_', session, objectSerial))
  addToScene(obj, options.group)
  local list = options.list or spawned
  list[#list + 1] = obj
  if SETTINGS.collision then
    collisionDirty = true
    if list == ringObjects then ringsSolid = true else markersSolid = true end
  end
  return obj
end

local function objectNoun()
  if SETTINGS.gates or SETTINGS.rings or #ringSets > 0 then return 'objects' end
  if SETTINGS.mesh == 'tireStack' then return 'tire stacks' end
  return 'cones'
end

-- Path markers ------------------------------------------------------------------

local GOLDEN_ANGLE = 2.399963229728653

local function markerShape(index)
  if SETTINGS.mesh == 'tireStack' then
    local pattern = TIRE_PATTERNS[SETTINGS.tireColors] or TIRE_PATTERNS.rw
    return ASSET_DIR .. 'tire_stack_' .. pattern[((index - 1) % #pattern) + 1] .. '.dae'
  end
  return ASSET_DIR .. 'cone.dae'
end

local function markerRotation(q, index)
  if SETTINGS.mesh == 'tireStack' then
    -- Tyre stacks are round: a golden-angle yaw breaks up the repeated tread.
    local angle = index * GOLDEN_ANGLE
    return rotationFromDir(math.cos(angle), math.sin(angle), 0)
  end
  -- Square cone bases sit square to their line, like hand-placed cones.
  if q.nx and q.ny and (q.nx * q.nx + q.ny * q.ny) > 0.000001 then
    return rotationFromDir(q.nx, q.ny, 0)
  end
  return nil
end

-- Gates -------------------------------------------------------------------------

local function pathTangent(source, index)
  local a = source[math.max(1, index - 1)]
  local b = source[math.min(#source, index + 1)]
  local dx, dy = b.x - a.x, b.y - a.y
  local length = math.sqrt(dx * dx + dy * dy)
  if length > 0.001 then return dx / length, dy / length end
  local p = source[index]
  if p and p.fx and p.fy then return p.fx, p.fy end
  return 1, 0
end

-- A gate is scaled uniformly (no stretched banner) so its tower base plates stay at
-- least ~1 m outside the marker lines next to it. Only markers close to the gate
-- count: another leg of the track tens of metres away must not inflate the gate.
local function gateScale(p, tx, ty, lines, base)
  local nx, ny = -ty, tx
  local need = base + 1.0
  local limit = base + 4.0
  for _, line in ipairs(lines or {}) do
    for _, q in ipairs(line) do
      local dx, dy = q.x - p.x, q.y - p.y
      if math.abs(dx * tx + dy * ty) <= 3.0 then
        local lateral = math.abs(dx * nx + dy * ny)
        if lateral <= limit then need = math.max(need, lateral + 0.9) end
      end
    end
  end
  return clamp(need / GATE_CLEAR_HALF, GATE_MIN_SCALE, GATE_MAX_SCALE)
end

-- Markers can never stand inside a tower footprint (wide drift corridors at the
-- maximum gate scale, or a second leg passing next to a tower).
local function trimGateFootprint(lines, p, tx, ty, scale)
  local nx, ny = -ty, tx
  local inner = GATE_CLEAR_HALF * scale - markerRadius() - 0.15
  local outer = GATE_FOOT_OUTER * scale + markerRadius() + 0.25
  local along = GATE_FOOT_ALONG * scale + markerRadius() + 0.25
  for index, line in ipairs(lines) do
    local kept = {}
    for _, q in ipairs(line) do
      local dx, dy = q.x - p.x, q.y - p.y
      local lateral = math.abs(dx * nx + dy * ny)
      if not (math.abs(dx * tx + dy * ty) <= along and lateral >= inner and lateral <= outer) then
        kept[#kept + 1] = q
      end
    end
    lines[index] = kept
  end
end

local function spawnGate(gate, group)
  local p, tx, ty, scale = gate.p, gate.tx, gate.ty, gate.scale
  local nx, ny = -ty, tx
  -- Stand on the lowest of centre and both towers: no tower floats on a slope.
  local z = groundZ(p.x, p.y, p.z)
  local reach = GATE_TOWER_CENTER * scale
  for _, side in ipairs({-1, 1}) do
    local towerZ = groundAt(p.x + nx * reach * side, p.y + ny * reach * side, p.z)
    if towerZ < z then z = towerZ end
  end
  return spawnMesh(p.x, p.y, z, {
    shapeName = ASSET_DIR .. (gate.kind == 'finish' and 'gate_finish.dae' or 'gate_start.dae'),
    scale = scale,
    rotation = rotationFromDir(tx, ty, 0),
    list = spawned,
    group = group,
    prefix = 'driftSketch_gate_'
  })
end

-- Rings -------------------------------------------------------------------------

local function pointAtDistance(path, distance)
  local walked = 0
  for i = 2, #path do
    local a, b = path[i - 1], path[i]
    local dx, dy = b.x - a.x, b.y - a.y
    local segment = math.sqrt(dx * dx + dy * dy)
    if segment > 0.0001 and walked + segment >= distance then
      local t = math.max(0, math.min(1, (distance - walked) / segment))
      return a.x + dx * t, a.y + dy * t, a.z + (b.z - a.z) * t
    end
    walked = walked + segment
  end
  local last = path[#path]
  return last.x, last.y, last.z
end

-- Rings on a recorded drive: centred on the line, every Ring gap metres, up to
-- Ring count. With gates ON the first and last 8 m stay free for the gates.
local function pathRingFrames(path)
  local frames = {}
  local line = smoothPath(path)
  if #line < 2 then return frames end
  local total = pathLength(line)
  local margin = SETTINGS.gates and 8.0 or 1.0
  local gap = SETTINGS.ringGap
  local distance = math.max(gap, margin)
  while #frames < SETTINGS.ringCount and distance <= total - margin + 0.001 do
    local x, y, z = pointAtDistance(line, distance)
    local ax, ay = pointAtDistance(line, math.max(0, distance - 2.0))
    local bx, by = pointAtDistance(line, math.min(total, distance + 2.0))
    local tx, ty = bx - ax, by - ay
    local size = math.sqrt(tx * tx + ty * ty)
    if size > 0.001 then
      frames[#frames + 1] = {x = x, y = y, z = z, tx = tx / size, ty = ty / size}
    end
    distance = distance + gap
  end
  return frames
end

-- A straight line of rings in front of where the car stood when it was placed.
local function aheadRingFrames(set)
  local frames = {}
  local lead = (set.halfLength or 2.4) + SETTINGS.ringGap
  for k = 0, SETTINGS.ringCount - 1 do
    local distance = lead + k * SETTINGS.ringGap
    frames[#frames + 1] = {
      x = set.x + set.fx * distance, y = set.y + set.fy * distance, z = set.z, tx = set.fx, ty = set.fy
    }
  end
  return frames
end

-- Markers whose footprint meets a ring hoop on the same drive are left out, so the
-- tube never cuts through a cone or tyre stack. A ring lifted clear of the markers
-- needs no gap.
local function trimRingCrossings(lines, frames)
  local scale = SETTINGS.ringSize / RING_OPENING
  if SETTINGS.ringLift - 2 * RING_TUBE * scale > markerHeight() + 0.1 then return lines end
  local halfSpan = (RING_OPENING * 0.5 + 2 * RING_TUBE) * scale + markerRadius() + 0.3
  local halfDepth = RING_TUBE * scale + markerRadius() + 0.25
  for index, line in ipairs(lines) do
    local kept = {}
    for _, q in ipairs(line) do
      local blocked = false
      for _, frame in ipairs(frames) do
        local dx, dy = q.x - frame.x, q.y - frame.y
        if math.abs(dx * frame.tx + dy * frame.ty) <= halfDepth
          and math.abs(dy * frame.tx - dx * frame.ty) <= halfSpan then
          blocked = true
          break
        end
      end
      if not blocked then kept[#kept + 1] = q end
    end
    lines[index] = kept
  end
  return lines
end

-- The ring origin is the lowest point of its clear opening: with Ring lift 0 the
-- opening starts at ground level and the bottom tube is buried, so cars drive
-- straight through even with Solid ON. The hoop follows the road slope.
local function spawnRing(frame, group)
  if #ringObjects >= RING_MAX_TOTAL then return nil end
  local scale = SETTINGS.ringSize / RING_OPENING
  local z = groundAt(frame.x, frame.y, frame.z)
  local probe = math.max(1.5, SETTINGS.ringSize * 0.2)
  local zf, hitF = groundAt(frame.x + frame.tx * probe, frame.y + frame.ty * probe, z)
  local zb, hitB = groundAt(frame.x - frame.tx * probe, frame.y - frame.ty * probe, z)
  local slope = 0
  if hitF and hitB then slope = clamp((zf - zb) / (2 * probe), -0.36, 0.36) end
  return spawnMesh(frame.x, frame.y, z + SETTINGS.ringLift, {
    shapeName = ASSET_DIR .. 'ring.dae',
    scale = scale,
    rotation = rotationFromDir(frame.tx, frame.ty, slope),
    list = ringObjects,
    group = group,
    prefix = 'driftSketch_ring_'
  })
end

local function buildRingSets(group)
  for _, set in ipairs(ringSets) do
    for _, frame in ipairs(aheadRingFrames(set)) do spawnRing(frame, group) end
  end
end

-- Builds ------------------------------------------------------------------------

local function buildPath(path, group)
  local reserveObjects = SETTINGS.gates and 2 or 0
  local lines, base = buildOffsetLines(path, math.max(0.5, SETTINGS.spacing), reserveObjects)
  local before = #spawned
  local gates = {}
  if SETTINGS.gates and #path >= 2 then
    local sx, sy = pathTangent(path, 1)
    gates[1] = {kind = 'start', p = path[1], tx = sx, ty = sy}
    local a, b = path[1], path[#path]
    local dx, dy = b.x - a.x, b.y - a.y
    -- A closed loop ending near its start keeps one gate instead of two overlapping.
    if dx * dx + dy * dy > 6.0 * 6.0 then
      local ex, ey = pathTangent(path, #path)
      gates[2] = {kind = 'finish', p = b, tx = ex, ty = ey}
    end
    for _, gate in ipairs(gates) do
      gate.scale = gateScale(gate.p, gate.tx, gate.ty, lines, base)
      trimGateFootprint(lines, gate.p, gate.tx, gate.ty, gate.scale)
    end
  end
  local rings = SETTINGS.rings and pathRingFrames(path) or {}
  if #rings > 0 then trimRingCrossings(lines, rings) end
  local count = math.max(#lines[1], #lines[2])
  for index = 1, count do
    for _, line in ipairs(lines) do
      local q = line[index]
      if q then
        spawnMesh(q.x, q.y, groundZ(q.x, q.y, q.z), {
          shapeName = markerShape(index),
          rotation = markerRotation(q, index),
          list = spawned,
          group = group,
          prefix = 'driftSketch_'
        })
      end
    end
  end
  for _, gate in ipairs(gates) do spawnGate(gate, group) end
  for _, frame in ipairs(rings) do spawnRing(frame, group) end
  return #spawned - before
end

local function rebuildEverything()
  removeObjects()
  -- Old solid shapes must leave the physics world before the new ground rays.
  reloadCollision()
  ensureMaterials()
  local group = objectGroup()
  for _, path in ipairs(savedPaths) do buildPath(path, group) end
  buildRingSets(group)
  reloadCollision()
end

local function rebuildRingsOnly()
  removeRings()
  reloadCollision()
  ensureMaterials()
  buildRingSets(objectGroup())
  reloadCollision()
end

local function ringSummary()
  return string.format('%d rings · %.1f m opening · %.0f m apart', #ringObjects, SETTINGS.ringSize, SETTINGS.ringGap)
end

-- Ring sliders rebuild only the rings (a short debounce keeps dragging smooth).
-- Rings on a drive also open gaps in its marker lines, so those need a full rebuild.
local function applyRingSettings()
  if recording then return end
  if SETTINGS.rings and #savedPaths > 0 then rebuildEverything() else rebuildRingsOnly() end
  statusError = false
  status = 'Rings updated: ' .. ringSummary() .. '.'
end

local function scheduleRings()
  if recording then return end
  if #ringSets > 0 or (SETTINGS.rings and #savedPaths > 0) then
    ringRebuildAt = clockTotal + 0.35
  end
end

-- Public API ----------------------------------------------------------------------

function M.start()
  if recording then return sendState() end
  if not SETTINGS.keepBuilds then
    savedPaths = {}
    removeObjects()
    reloadCollision()
    if #ringSets > 0 then
      ensureMaterials()
      buildRingSets(objectGroup())
      reloadCollision()
    end
  end
  local veh, id = currentVehicle()
  activeVehicleId = id
  activeVehicleName = vehicleName(veh, id)
  points = {}
  recording = true
  statusError = false
  status = id and ('Recording ' .. activeVehicleName .. '…') or 'Recording armed. Enter a vehicle.'
  return sendState()
end

function M.stop()
  if not recording then return sendState() end
  recording = false
  if #points < 2 or pathLength(points) < 1.0 then
    statusError = true
    status = 'Drive at least 1 metre before Stop & Build.'
    return sendState()
  end
  savedPaths[#savedPaths + 1] = copyPoints(points)
  ensureMaterials()
  local ringsBefore = #ringObjects
  local created = buildPath(points, objectGroup())
  reloadCollision()
  local rings = #ringObjects - ringsBefore
  statusError = created == 0
  if created > 0 then
    status = 'Built ' .. tostring(created) .. ' ' .. objectNoun()
      .. (rings > 0 and (' + ' .. tostring(rings) .. ' rings') or '')
      .. '. Open BeamNG replay — they stay in the scene.'
  else
    status = 'No objects could be created.'
  end
  return sendState()
end

function M.rebuild()
  if recording then
    statusError = true
    status = 'Stop recording before Rebuild.'
    return sendState()
  end
  ringRebuildAt = nil
  pathRebuildAt = nil
  if #savedPaths == 0 and #ringSets == 0 then
    removeObjects()
    reloadCollision()
    statusError = false
    status = 'No saved drive yet. Press Start first.'
    return sendState()
  end
  rebuildEverything()
  statusError = false
  status = 'Rebuilt ' .. tostring(#spawned + #ringObjects) .. ' ' .. objectNoun() .. ' with current settings.'
  return sendState()
end

function M.clear()
  clearAll()
  statusError = false
  status = 'Generated objects, rings and saved drives cleared.'
  return sendState()
end

function M.placeRings()
  local veh, id = currentVehicle()
  local pos = veh and vehiclePosition(veh, id)
  if not pos then
    statusError = true
    status = 'Enter a vehicle to place rings ahead of it.'
    return sendState()
  end
  local p = vehiclePathPoint(veh, pos, id)
  if #ringObjects >= RING_MAX_TOTAL then
    statusError = true
    status = 'Ring limit reached (' .. tostring(RING_MAX_TOTAL) .. '). Clear rings first.'
    return sendState()
  end
  local set = {x = p.x, y = p.y, z = p.z, fx = p.fx, fy = p.fy, halfLength = p.carHalfLength}
  ringSets[#ringSets + 1] = set
  ensureMaterials()
  local group = objectGroup()
  local before = #ringObjects
  for _, frame in ipairs(aheadRingFrames(set)) do spawnRing(frame, group) end
  reloadCollision()
  local created = #ringObjects - before
  statusError = created == 0
  status = created > 0 and string.format('Placed %d rings ahead: %.1f m opening, %.0f m apart.',
    created, SETTINGS.ringSize, SETTINGS.ringGap) or 'No rings could be created.'
  return sendState()
end

function M.clearRings()
  ringRebuildAt = nil
  local hadPathRings = SETTINGS.rings
  ringSets = {}
  SETTINGS.rings = false
  if hadPathRings and #savedPaths > 0 and not recording then
    rebuildEverything()   -- gives the marker gaps back to the lines
  else
    removeRings()
    reloadCollision()
  end
  statusError = false
  status = 'All rings removed. Cones, tyres and gates stay.'
  return sendState()
end

local function normalizeSetting(key, value)
  local number = tonumber(value)
  if key == 'mesh' then return (value == 'tireStack' or value == 'tire') and 'tireStack' or 'cone' end
  if key == 'tireColors' then return value == 'rwb' and 'rwb' or 'rw' end
  if key == 'spacing' then return clamp(number or SETTINGS.spacing, 0.5, 10.0) end
  if key == 'gap' then return clamp(number or SETTINGS.gap, 0.0, 3.0) end
  if key == 'scale' then return clamp(number or SETTINGS.scale, 0.5, 2.0) end
  if key == 'groundOffset' then return clamp(number or SETTINGS.groundOffset, -2.0, 1.0) end
  if key == 'maxCones' then return math.floor(clamp(number or SETTINGS.maxCones, 100, 4000)) end
  if key == 'ringCount' then return math.floor(clamp(number or SETTINGS.ringCount, 1, 50) + 0.5) end
  if key == 'ringSize' then return clamp(number or SETTINGS.ringSize, 3.0, 30.0) end
  if key == 'ringGap' then return clamp(number or SETTINGS.ringGap, 2.0, 100.0) end
  if key == 'ringLift' then return clamp(number or SETTINGS.ringLift, 0.0, 10.0) end
  if key == 'smooth' or key == 'keepBuilds' or key == 'collision' or key == 'driftWidth'
    or key == 'gates' or key == 'rings' then
    return truthy(value)
  end
  return nil
end

function M.setSetting(key, value)
  local normalized = normalizeSetting(key, value)
  if normalized == nil then return sendState() end
  local changed = SETTINGS[key] ~= normalized
  SETTINGS[key] = normalized
  local idle = not recording
  if key == 'mesh' or key == 'tireColors' then
    -- One click on a mesh / colour button updates saved drives right away.
    if changed and idle and #savedPaths > 0 and (key == 'mesh' or SETTINGS.mesh == 'tireStack') then
      return M.rebuild()
    end
  elseif key == 'collision' then
    if idle and (#savedPaths > 0 or #ringSets > 0) then return M.rebuild() end
  elseif key == 'driftWidth' or key == 'smooth' or key == 'gates' or key == 'rings' then
    if idle and #savedPaths > 0 then return M.rebuild() end
    if key == 'rings' and normalized then
      statusError = false
      status = 'Rings ON: they will follow your next drive. PLACE RINGS AHEAD works right now.'
    end
  elseif key == 'ringCount' or key == 'ringSize' or key == 'ringGap' or key == 'ringLift' then
    if changed then scheduleRings() end
  elseif key == 'gap' or key == 'spacing' then
    -- Dragging Gap / Spacing reshapes saved drives once the slider rests.
    if changed and idle and #savedPaths > 0 then pathRebuildAt = clockTotal + 0.35 end
  end
  return sendState()
end

function M.uiState() return sendState() end

function M.onUpdate(dtReal)
  local dt = tonumber(dtReal) or 0
  uiClock = uiClock + dt
  clockTotal = clockTotal + dt
  if pendingRestore then
    pendingRestore = false
    if not recording and (#savedPaths > 0 or #ringSets > 0) then
      rebuildEverything()
      statusError = false
      status = 'Restored ' .. tostring(#savedPaths) .. ' saved drive(s) after a Lua reload.'
      sendState()
    end
  end
  if ringRebuildAt and clockTotal >= ringRebuildAt then
    ringRebuildAt = nil
    applyRingSettings()
    sendState()
  end
  if pathRebuildAt and clockTotal >= pathRebuildAt then
    pathRebuildAt = nil
    if not recording and #savedPaths > 0 then
      M.rebuild()
      status = string.format('Rebuilt: gap %.2f m, spacing %.1f m.', SETTINGS.gap, SETTINGS.spacing)
      sendState()
    end
  end
  if recording then
    local veh, id = currentVehicle()
    if veh and id then
      if activeVehicleId ~= id then
        activeVehicleId = id
        activeVehicleName = vehicleName(veh, id)
        points = {}
        status = 'Vehicle changed. Recording restarted for ' .. activeVehicleName .. '.'
      end
      local pos = vehiclePosition(veh, id)
      if pos then
        local p = vehiclePathPoint(veh, pos, id)
        local last = points[#points]
        if not last then
          points[1] = p
        else
          local dx, dy = p.x - last.x, p.y - last.y
          if dx * dx + dy * dy >= 0.75 * 0.75 then points[#points + 1] = p end
        end
      end
    end
  end
  if uiClock >= 0.25 then
    uiClock = 0
    sendState()
  end
end

-- Lua reload support: keep settings, saved drives and ring sets; the objects of the
-- old VM are swept from the group and rebuilt on the next update.
local function validPoint(p)
  return type(p) == 'table' and type(p.x) == 'number' and type(p.y) == 'number' and type(p.z) == 'number'
end

local function restoreState(data)
  if restored or type(data) ~= 'table' then return end
  restored = true
  if type(data.settings) == 'table' then
    for key, value in pairs(data.settings) do
      if SETTINGS[key] ~= nil then
        local normalized = normalizeSetting(key, value)
        if normalized ~= nil then SETTINGS[key] = normalized end
      end
    end
  end
  savedPaths = {}
  for _, path in ipairs(type(data.savedPaths) == 'table' and data.savedPaths or {}) do
    if type(path) == 'table' and #path >= 2 then
      local ok = true
      for _, p in ipairs(path) do if not validPoint(p) then ok = false break end end
      if ok then savedPaths[#savedPaths + 1] = copyPoints(path) end
    end
  end
  ringSets = {}
  for _, set in ipairs(type(data.ringSets) == 'table' and data.ringSets or {}) do
    if validPoint(set) and type(set.fx) == 'number' and type(set.fy) == 'number' then
      ringSets[#ringSets + 1] = {x = set.x, y = set.y, z = set.z, fx = set.fx, fy = set.fy,
        halfLength = tonumber(set.halfLength) or 2.4}
    end
  end
  pendingRestore = #savedPaths > 0 or #ringSets > 0
end

function M.onSerialize()
  local settings = {}
  for k, v in pairs(SETTINGS) do settings[k] = v end
  return {settings = settings, savedPaths = savedPaths, ringSets = ringSets}
end

function M.onDeserialized(data)
  restoreState(data)
end

function M.onExtensionLoaded(data)
  sweepGroup()
  reloadCollision()
  status = 'Ready. Press Start and drive.'
  restoreState(data)
  sendState()
  return true
end

function M.onClientEndMission()
  materialsLoaded = false
  clearAll()
end

function M.onExtensionUnloaded()
  clearAll()
end

return M
