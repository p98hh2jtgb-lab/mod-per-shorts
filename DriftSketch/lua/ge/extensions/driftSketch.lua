-- DriftSketch 0.2.0 — record a drive, build real low-poly mesh cones, keep them for replay.
local M = {}

local SETTINGS = {
  mesh = 'cone',
  spacing = 2.4,
  width = 6.0,
  scale = 1.0,
  groundOffset = -0.55,
  maxCones = 1200,
  smooth = true,
  keepBuilds = true
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

local function copyPoints(source)
  local out = {}
  for i, p in ipairs(source) do out[i] = {x=p.x, y=p.y, z=p.z} end
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
  for _, obj in ipairs(spawned) do
    if obj and obj.delete then pcall(function() obj:delete() end) end
  end
  spawned = {}
end

local function clearAll()
  recording = false
  points = {}
  savedPaths = {}
  removeObjects()
end

local function smoothPath(source)
  if not SETTINGS.smooth or #source < 3 then return copyPoints(source) end
  local out = copyPoints(source)
  for i = 2, #source - 1 do
    local a, b, c = source[i - 1], source[i], source[i + 1]
    out[i] = {
      x = a.x * 0.25 + b.x * 0.50 + c.x * 0.25,
      y = a.y * 0.25 + b.y * 0.50 + c.y * 0.25,
      z = a.z * 0.25 + b.z * 0.50 + c.z * 0.25
    }
  end
  return out
end

-- Return evenly spaced center-line samples with a horizontal tangent.
local function samplePath(source, spacing)
  local path = smoothPath(source)
  if #path < 2 then return {} end
  local total = pathLength(path)
  if total < 0.05 then return {} end
  spacing = math.max(0.5, tonumber(spacing) or SETTINGS.spacing)
  local maxSamples = math.max(2, math.floor(SETTINGS.maxCones / 2))
  local estimated = (math.floor(total / spacing) + 1) * 2
  if estimated > SETTINGS.maxCones then
    spacing = total / math.max(1, maxSamples - 1)
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

  local distance = 0
  local guard = 0
  while distance <= total + 0.0001 and guard < maxSamples do
    while segment < #path - 1 and distance > segmentStart + segmentLength do
      segmentStart = segmentStart + segmentLength
      segment = segment + 1
      updateSegment()
    end
    local a, b = path[segment], path[segment + 1]
    if segmentLength > 0.0001 then
      local t = math.max(0, math.min(1, (distance - segmentStart) / segmentLength))
      local tx, ty = (b.x - a.x) / segmentLength, (b.y - a.y) / segmentLength
      samples[#samples + 1] = {
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = a.z + (b.z - a.z) * t,
        tx = tx, ty = ty
      }
    end
    distance = distance + spacing
    guard = guard + 1
  end
  return samples
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
    obj:setField('collisionType', 0, 'None')
    obj:setField('decalType', 0, 'None')
  end
  obj:setPosition(vec3(x, y, z))
  local scale = SETTINGS.scale
  obj:setScale(vec3(scale, scale, scale))
  obj:registerObject('driftSketch_' .. tostring(objectSerial))
  if scenetree and scenetree.MissionGroup then scenetree.MissionGroup:add(obj) end
  spawned[#spawned + 1] = obj
  return obj
end

local function buildPath(path)
  local samples = samplePath(path, SETTINGS.spacing)
  local halfWidth = SETTINGS.width * 0.5
  local before = #spawned
  for _, p in ipairs(samples) do
    local nx, ny = -p.ty, p.tx
    for _, sign in ipairs({-1, 1}) do
      local x, y = p.x + nx * halfWidth * sign, p.y + ny * halfWidth * sign
      spawnMesh(x, y, groundZ(x, y, p.z))
    end
  end
  return #spawned - before
end

function M.start()
  if recording then return sendState() end
  if not SETTINGS.keepBuilds then
    savedPaths = {}
    removeObjects()
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
      local ok, pos = pcall(veh.getPosition, veh)
      if ok and pos then
        local p = {x=pos.x, y=pos.y, z=pos.z}
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
