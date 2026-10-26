-- DriftSketch 0.4.0 — record a drive, build real low-poly mesh cones, keep them for replay.
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

local function vehiclePathPoint(veh, pos)
  local p = {
    x=pos.x, y=pos.y, z=pos.z,
    carHalfLength=vehicleNumber(veh, 'getInitialLength', 4.8, 1.0, 20.0) * 0.5,
    carHalfWidth=vehicleNumber(veh, 'getInitialWidth', 2.0, 0.6, 6.0) * 0.5
  }
  if veh and veh.getDirectionVector then
    local ok, forward = pcall(veh.getDirectionVector, veh)
    if ok and forward then
      local length = math.sqrt(forward.x * forward.x + forward.y * forward.y)
      if length > 0.001 then p.fx, p.fy = forward.x / length, forward.y / length end
    end
  end
  return p
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
      samples[#samples + 1] = {
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = a.z + (b.z - a.z) * t
      }
    end
  end
  return samples
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
  return math.max(baseOffset, footprint + 0.35 + 0.24 * SETTINGS.scale)
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
          z = p.z
        }
      end
    end
  end
  local maxSamples = math.max(2, math.floor(SETTINGS.maxCones / 2))
  return {
    resampleLine(raw[1], spacing, maxSamples),
    resampleLine(raw[2], spacing, maxSamples)
  }
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
  return '/art/shapes/driftsketch/' .. (SETTINGS.mesh == 'pylon' and 'pylon.dae' or 'cone.dae')
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
  status = created > 0 and ('Built ' .. tostring(created) .. ' cones. Open BeamNG replay — they stay in the scene.') or 'No cones could be created.'
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
  status = #savedPaths > 0 and ('Rebuilt ' .. tostring(#spawned) .. ' cones with current settings.') or 'No saved drive yet. Press Start first.'
  return sendState()
end

function M.clear()
  clearAll()
  statusError = false
  status = 'Generated cones and saved drives cleared.'
  return sendState()
end

function M.setSetting(key, value)
  if key == 'mesh' then
    SETTINGS.mesh = value == 'pylon' and 'pylon' or 'cone'
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
        local p = vehiclePathPoint(veh, pos)
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
