-- DriftSketch 0.6.0 — record a drive, build real low-poly mesh objects, keep them for replay.
local M = {}

local SETTINGS = {
  mesh = 'cone',
  spacing = 2.4,
  width = 4.2,
  scale = 1.0,
  groundOffset = -0.55,
  maxCones = 1200,
  smooth = true,
  keepBuilds = true,
  collision = false,
  driftWidth = true
}

local recording = false
local points = {}
local activeVehicleId = nil
local activeVehicleName = 'No vehicle'
local savedPaths = {}
local spawned = {}
local status = 'Ready. Press Start and drive.'
local statusError = false
local uiClock = 0
local objectSerial = 0
local collisionDirty = false
local collisionWasSolid = false

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
    vehicleName = activeVehicleName,
    status = status,
    statusError = statusError,
    settings = {}
  }
  for k, v in pairs(SETTINGS) do out.settings[k] = v end
  return out
end

local function sendState()
  if guihooks and guihooks.trigger then guihooks.trigger('driftSketch.state', publicState()) end
  return publicState()
end

local function removeObjects()
  if collisionWasSolid then collisionDirty = true end
  collisionWasSolid = false
  for _, obj in ipairs(spawned) do
    if obj and obj.delete then pcall(function() obj:delete() end) end
  end
  spawned = {}
end

local function reloadCollision()
  if not collisionDirty then return end
  if be and be.reloadCollision then pcall(be.reloadCollision, be) end
  collisionDirty = false
end

local function clearAll()
  recording = false
  points = {}
  savedPaths = {}
  removeObjects()
  reloadCollision()
end

local function smoothPath(source)
  if not SETTINGS.smooth or #source < 3 then return copyPoints(source) end
  local out = copyPoints(source)
  for i = 2, #source - 1 do
    local a, b, c = source[i - 1], source[i], source[i + 1]
    out[i].x = a.x * 0.25 + b.x * 0.50 + c.x * 0.25
    out[i].y = a.y * 0.25 + b.y * 0.50 + c.y * 0.25
    out[i].z = a.z * 0.25 + b.z * 0.50 + c.z * 0.25
    if a.fx and a.fy and b.fx and b.fy and c.fx and c.fy then
      local fx = a.fx * 0.25 + b.fx * 0.50 + c.fx * 0.25
      local fy = a.fy * 0.25 + b.fy * 0.50 + c.fy * 0.25
      local length = math.sqrt(fx * fx + fy * fy)
      if length > 0.001 then out[i].fx, out[i].fy = fx / length, fy / length end
    end
  end
  return out
end

-- Resample one already-offset line by its own arc length. Inner and outer
-- curves have different lengths, so each gets independent physical spacing.
local function resampleLine(path, spacing, maxSamples)
  if #path < 2 then return {} end
  local total = pathLength(path)
  if total < 0.05 then return {} end
  local count = math.floor(total / spacing) + 1
  local step = spacing
  if count > maxSamples then
    count = maxSamples
    step = total / math.max(1, count - 1)
  end

  local samples = {}
  local segment = 1
  local segmentStart = 0
  local segmentLength = 0
  local function updateSegment()
    local a, b = path[segment], path[segment + 1]
    local dx, dy = b.x - a.x, b.y - a.y
    segmentLength = math.sqrt(dx * dx + dy * dy)
  end
  updateSegment()

  for index = 0, count - 1 do
    local distance = math.min(total, index * step)
    while segment < #path - 1 and distance > segmentStart + segmentLength do
      segmentStart = segmentStart + segmentLength
      segment = segment + 1
      updateSegment()
    end
    local a, b = path[segment], path[segment + 1]
    if segmentLength > 0.0001 then
      local t = math.max(0, math.min(1, (distance - segmentStart) / segmentLength))
      local nx, ny
      if a.nx and a.ny and b.nx and b.ny then
        nx = a.nx + (b.nx - a.nx) * t
        ny = a.ny + (b.ny - a.ny) * t
        local normalLength = math.sqrt(nx * nx + ny * ny)
        if normalLength > 0.001 then nx, ny = nx / normalLength, ny / normalLength end
      end
      samples[#samples + 1] = {
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = a.z + (b.z - a.z) * t,
        nx = nx or a.nx,
        ny = ny or a.ny,
        pathIndex = (t < 0.5 and a.pathIndex or b.pathIndex) or a.pathIndex
      }
    end
  end
  return samples
end

local function objectMargin()
  local radius = (SETTINGS.mesh == 'tire' or SETTINGS.mesh == 'tireStack') and 0.45 or 0.24
  return 0.35 + radius * SETTINGS.scale
end

-- Base Width is the manual minimum. Drift Widen expands only when the actual
-- oriented car rectangle needs more lateral room, including its rear overhang.
local function driftOffset(p, nx, ny, baseOffset)
  if not SETTINGS.driftWidth then return baseOffset end
  local halfLength, halfWidth = p.carHalfLength or 2.4, p.carHalfWidth or 1.0
  local footprint
  if p.fx and p.fy then
    local rightX, rightY = -p.fy, p.fx
    footprint = halfWidth * math.abs(nx * rightX + ny * rightY)
              + halfLength * math.abs(nx * p.fx + ny * p.fy)
  else
    footprint = math.sqrt(halfLength * halfLength + halfWidth * halfWidth)
  end
  return math.max(baseOffset, footprint + objectMargin())
end

-- Return a stable planar heading even for old recordings that have no heading.
local function pathHeading(source, index)
  local p = source[index]
  if p.fx and p.fy then
    local length = math.sqrt(p.fx * p.fx + p.fy * p.fy)
    if length > 0.001 then return p.fx / length, p.fy / length end
  end
  local a = source[math.max(1, index - 1)]
  local b = source[math.min(#source, index + 1)]
  local dx, dy = b.x - a.x, b.y - a.y
  local length = math.sqrt(dx * dx + dy * dy)
  if length > 0.001 then return dx / length, dy / length end
  return 1, 0
end

-- Add intermediate poses between recorded points. A cone can be clear at both
-- endpoints and still intersect the car between them during a fast turn.
local function makeSweepPoses(source, margin)
  local poses = {}
  local headingsX, headingsY = {}, {}
  for i = 1, #source do headingsX[i], headingsY[i] = pathHeading(source, i) end

  local function addPose(x, y, fx, fy, halfLength, halfWidth)
    local length = math.sqrt(fx * fx + fy * fy)
    if length < 0.001 then fx, fy = 1, 0 else fx, fy = fx / length, fy / length end
    halfLength, halfWidth = halfLength or 2.4, halfWidth or 1.0
    local alongLimit, lateralLimit = halfLength + margin, halfWidth + margin
    poses[#poses + 1] = {
      x=x, y=y, fx=fx, fy=fy, rightX=-fy, rightY=fx,
      alongLimit=alongLimit, lateralLimit=lateralLimit,
      radiusSq=(alongLimit * alongLimit) + (lateralLimit * lateralLimit)
    }
  end

  for i, a in ipairs(source) do
    local ax, ay = headingsX[i], headingsY[i]
    addPose(a.x, a.y, ax, ay, a.carHalfLength, a.carHalfWidth)
    local b = source[i + 1]
    if b then
      local bx, by = headingsX[i + 1], headingsY[i + 1]
      local distance = math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y))
      local steps = math.max(1, math.min(8, math.ceil(distance / 0.5)))
      for step = 1, steps - 1 do
        local t = step / steps
        local fx, fy = ax + (bx - ax) * t, ay + (by - ay) * t
        if fx * fx + fy * fy < 0.0001 then fx, fy = ax, ay end
        addPose(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, fx, fy,
          (a.carHalfLength or 2.4) + ((b.carHalfLength or 2.4) - (a.carHalfLength or 2.4)) * t,
          (a.carHalfWidth or 1.0) + ((b.carHalfWidth or 1.0) - (a.carHalfWidth or 1.0)) * t)
      end
    end
  end
  return poses
end

-- A small spatial grid keeps the swept-clearance pass inexpensive on long runs.
local function makePoseGrid(poses)
  local grid, cell = {}, 16.0
  for _, p in ipairs(poses) do
    local key = math.floor(p.x / cell) * 1000000 + math.floor(p.y / cell)
    local bucket = grid[key]
    if not bucket then bucket = {}; grid[key] = bucket end
    bucket[#bucket + 1] = p
  end
  return grid, cell
end

local function slabExit(value, direction, limit)
  if direction > 0.000001 then return (limit - value) / direction end
  if direction < -0.000001 then return (-limit - value) / direction end
  return math.huge
end

-- Move one cone along its outward normal until it is outside every nearby
-- oriented vehicle rectangle. This is a 2D ray/slab test, not a physics query.
local function pushConeOutside(q, grid, cell)
  if not q.nx or not q.ny then return q end
  local normalLength = math.sqrt(q.nx * q.nx + q.ny * q.ny)
  if normalLength < 0.001 then return q end
  local dx, dy = q.nx / normalLength, q.ny / normalLength
  local startX, startY, distance = q.x, q.y, 0
  -- Beyond a few metres, skipping is cleaner than folding the line back
  -- through the inside of a very tight turn.
  local maxPush = 4.0

  for _ = 1, 48 do
    local x, y = startX + dx * distance, startY + dy * distance
    local gx, gy = math.floor(x / cell), math.floor(y / cell)
    local baseKey = gx * 1000000 + gy
    local farthestExit = nil
    for ox = -1, 1 do
      local rowKey = baseKey + ox * 1000000
      for oy = -1, 1 do
        local bucket = grid[rowKey + oy]
        if bucket then
          for _, p in ipairs(bucket) do
            local px, py = x - p.x, y - p.y
            if px * px + py * py <= p.radiusSq then
              local along = px * p.fx + py * p.fy
              if math.abs(along) <= p.alongLimit then
                local lateral = px * p.rightX + py * p.rightY
                if math.abs(lateral) <= p.lateralLimit then
                  local alongExit = slabExit(along, dx * p.fx + dy * p.fy, p.alongLimit)
                  local lateralExit = slabExit(lateral, dx * p.rightX + dy * p.rightY, p.lateralLimit)
                  local exitDistance = math.min(alongExit, lateralExit)
                  if exitDistance < 0 then exitDistance = 0 end
                  if exitDistance < math.huge and (not farthestExit or exitDistance > farthestExit) then
                    farthestExit = exitDistance
                  end
                end
              end
            end
          end
        end
      end
    end
    if not farthestExit then
      q.x, q.y, q.nx, q.ny = x, y, dx, dy
      return q
    end
    distance = distance + farthestExit + 0.035
    if distance > maxPush then return nil end
  end
  return nil
end

-- With Drift Widen OFF, exact manual width is intentional, so do not move
-- cones. With it ON, protect the whole swept car footprint during turns.
local function sweptClearLines(lines, source, spacing)
  if not SETTINGS.driftWidth or #source < 2 then return lines end
  local margin = objectMargin()
  local minimumGap = math.max(0.35, spacing * 0.40)
  local grid, cell = makePoseGrid(makeSweepPoses(source, margin))
  for lineIndex, line in ipairs(lines) do
    local safe = {}
    for _, q in ipairs(line) do
      local pushed = pushConeOutside(q, grid, cell)
      if pushed then
        local last = safe[#safe]
        if not last or (pushed.x - last.x) * (pushed.x - last.x)
          + (pushed.y - last.y) * (pushed.y - last.y) >= minimumGap * minimumGap then
          safe[#safe + 1] = pushed
        end
      end
    end
    lines[lineIndex] = safe
  end
  return lines
end

-- Build two smooth offset polylines using a centered, two-point lookahead.
-- This avoids the abrupt one-segment normals that made tight turns jagged.
local function buildOffsetLines(source, halfWidth, spacing)
  local path = smoothPath(source)
  if #path < 2 then return {{}, {}} end
  local raw = {{}, {}}
  local signs = {-1, 1}
  for i, p in ipairs(path) do
    local a, b = path[math.max(1, i - 2)], path[math.min(#path, i + 2)]
    local dx, dy = b.x - a.x, b.y - a.y
    local length = math.sqrt(dx * dx + dy * dy)
    if length < 0.0001 then
      a, b = path[math.max(1, i - 1)], path[math.min(#path, i + 1)]
      dx, dy = b.x - a.x, b.y - a.y
      length = math.sqrt(dx * dx + dy * dy)
    end
    if length > 0.0001 then
      local nx, ny = -dy / length, dx / length
      local offset = driftOffset(p, nx, ny, halfWidth)
      for lineIndex, sign in ipairs(signs) do
        raw[lineIndex][#raw[lineIndex] + 1] = {
          x = p.x + nx * offset * sign,
          y = p.y + ny * offset * sign,
          z = p.z,
          nx = nx * sign,
          ny = ny * sign,
          pathIndex = i
        }
      end
    end
  end
  local maxSamples = math.max(2, math.floor(SETTINGS.maxCones / 2))
  local lines = {
    resampleLine(raw[1], spacing, maxSamples),
    resampleLine(raw[2], spacing, maxSamples)
  }
  return sweptClearLines(lines, source, spacing)
end

local function groundZ(x, y, recordedZ)
  local origin = vec3(x, y, recordedZ + 4)
  if castRayStatic then
    local ok, distance = pcall(castRayStatic, origin, vec3(0, 0, -1), 12)
    if ok and type(distance) == 'number' and distance >= 0 and distance < 12 then
      return recordedZ + 4 - distance
    end
  end
  return recordedZ + SETTINGS.groundOffset
end

local function shapePath()
  -- Mod-root virtual path: works both unpacked and directly from the ZIP.
  local file = 'cone.dae'
  if SETTINGS.mesh == 'pylon' then file = 'pylon.dae'
  elseif SETTINGS.mesh == 'tire' then file = 'tire.dae'
  elseif SETTINGS.mesh == 'tireStack' then file = 'tire_stack.dae' end
  return '/art/shapes/driftsketch/' .. file
end

local function objectNoun()
  if SETTINGS.mesh == 'tire' then return 'tires' end
  if SETTINGS.mesh == 'tireStack' then return 'tire stacks' end
  return 'cones'
end

local function spawnMesh(x, y, z)
  if not createObject then return nil end
  local ok, obj = pcall(createObject, 'TSStatic')
  if not ok or not obj then return nil end
  objectSerial = objectSerial + 1
  obj.shapeName = shapePath()
  obj.canSave = false
  obj.useInstanceRenderData = true
  if obj.setField then
    obj:setField('collisionType', 0, SETTINGS.collision and 'Visible Mesh Final' or 'None')
    obj:setField('decalType', 0, 'None')
  end
  if SETTINGS.collision then collisionWasSolid = true; collisionDirty = true end
  obj:setPosition(vec3(x, y, z))
  local scale = SETTINGS.scale
  obj:setScale(vec3(scale, scale, scale))
  obj:registerObject('driftSketch_' .. tostring(objectSerial))
  if scenetree and scenetree.MissionGroup then scenetree.MissionGroup:add(obj) end
  spawned[#spawned + 1] = obj
  return obj
end

local function buildPath(path)
  local lines = buildOffsetLines(path, SETTINGS.width * 0.5, math.max(0.5, SETTINGS.spacing))
  local before = #spawned
  local count = math.max(#lines[1], #lines[2])
  for index = 1, count do
    for _, line in ipairs(lines) do
      local p = line[index]
      if p then spawnMesh(p.x, p.y, groundZ(p.x, p.y, p.z)) end
    end
  end
  return #spawned - before
end

function M.start()
  if recording then return sendState() end
  if not SETTINGS.keepBuilds then
    savedPaths = {}
    removeObjects()
    reloadCollision()
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
  local created = buildPath(points)
  reloadCollision()
  statusError = created == 0
  status = created > 0 and ('Built ' .. tostring(created) .. ' ' .. objectNoun() .. '. Open BeamNG replay — they stay in the scene.') or 'No objects could be created.'
  return sendState()
end

function M.rebuild()
  if recording then
    statusError = true
    status = 'Stop recording before Rebuild.'
    return sendState()
  end
  removeObjects()
  for _, path in ipairs(savedPaths) do buildPath(path) end
  reloadCollision()
  statusError = false
  status = #savedPaths > 0 and ('Rebuilt ' .. tostring(#spawned) .. ' ' .. objectNoun() .. ' with current settings.') or 'No saved drive yet. Press Start first.'
  return sendState()
end

function M.clear()
  clearAll()
  statusError = false
  status = 'Generated objects and saved drives cleared.'
  return sendState()
end

function M.setSetting(key, value)
  if key == 'mesh' then
    if value == 'pylon' or value == 'tire' or value == 'tireStack' then SETTINGS.mesh = value
    else SETTINGS.mesh = 'cone' end
  elseif key == 'spacing' then
    SETTINGS.spacing = math.max(1.0, math.min(10.0, tonumber(value) or SETTINGS.spacing))
  elseif key == 'width' then
    SETTINGS.width = math.max(1.5, math.min(12.0, tonumber(value) or SETTINGS.width))
  elseif key == 'scale' then
    SETTINGS.scale = math.max(0.5, math.min(2.0, tonumber(value) or SETTINGS.scale))
  elseif key == 'groundOffset' then
    SETTINGS.groundOffset = math.max(-2.0, math.min(1.0, tonumber(value) or SETTINGS.groundOffset))
  elseif key == 'maxCones' then
    SETTINGS.maxCones = math.max(100, math.min(3000, math.floor(tonumber(value) or SETTINGS.maxCones)))
  elseif key == 'collision' or key == 'driftWidth' then
    SETTINGS[key] = not (value == false or value == 'false' or value == 0)
    if not recording and #savedPaths > 0 then return M.rebuild() end
  elseif key == 'smooth' or key == 'keepBuilds' then
    SETTINGS[key] = not (value == false or value == 'false' or value == 0)
  end
  return sendState()
end

function M.uiState() return sendState() end

function M.onUpdate(dtReal)
  uiClock = uiClock + (tonumber(dtReal) or 0)
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

function M.onExtensionLoaded()
  status = 'Ready. Press Start and drive.'
  sendState()
  return true
end

function M.onClientEndMission()
  clearAll()
end

function M.onExtensionUnloaded()
  clearAll()
end

return M
