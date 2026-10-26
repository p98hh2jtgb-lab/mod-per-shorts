-- CreatorPack Studio 6.0 — BeamNG GE extension
-- Manual photos/logos, vehicle information and input bindings only.
local M = {}

local function trigger(action)
  if guihooks == nil or guihooks.trigger == nil then return end
  guihooks.trigger('pfhud.action', { action = action })
end

local function pfhudPass()           trigger('pass') end
local function pfhudFail()           trigger('fail') end
local function pfhudNext()           trigger('next') end
local function pfhudPrev()           trigger('prev') end
local function pfhudReset()          trigger('reset') end
local function pfhudTogglePanel()    trigger('togglePanel') end
local function pfhudUndo()           trigger('undo') end
local function pfhudToggleGuides()   trigger('toggleGuides') end
local function pfhudToggleVehicles() trigger('toggleVehicles') end
local function pfhudToggleShorts()   trigger('toggleShorts') end

local function currentVehicle()
  local vehId = be:getPlayerVehicleID(0)
  if not vehId then return nil end
  local veh = nil
  if be.getObjectByID then
    local ok, v = pcall(be.getObjectByID, be, vehId)
    if ok then veh = v end
  end
  if not veh and be.getPlayerVehicle then
    local ok, v = pcall(be.getPlayerVehicle, be, 0)
    if ok then veh = v end
  end
  return veh
end

local function vehField(veh, field)
  if not veh then return nil end
  local ok, v = pcall(function() return veh[field] end)
  if ok and type(v) == 'string' and v ~= '' then return v end
  if veh.getField then
    ok, v = pcall(function() return veh:getField(field, '') end)
    if ok and type(v) == 'string' and v ~= '' then return v end
  end
  return nil
end

local function vehBrand(veh, model)
  local brand
  local okCur, cur = pcall(core_vehicles.getCurrentVehicleDetails)
  if okCur and cur and type(cur.model) == 'table' and type(cur.model.Brand) == 'string' and cur.model.Brand ~= '' then
    brand = cur.model.Brand
  end
  if (not brand or brand == '') and type(model) == 'string' then
    local pref = model:match('^([%a]+)[_%-]')
    if pref and #pref >= 2 then brand = pref end
  end
  if brand then brand = tostring(brand):gsub('^%s+', ''):gsub('%s+$', '') end
  return brand
end

local function vehicleInfo()
  local veh = currentVehicle()
  local model = vehField(veh, 'JBeam')
  local brand = vehBrand(veh, model)
  local name = model
  pcall(function()
    local okCur, cur = pcall(core_vehicles.getCurrentVehicleDetails)
    if okCur and cur and type(cur.model) == 'table' and cur.model.Name then
      name = ((cur.model.Brand and (cur.model.Brand .. ' ')) or '') .. cur.model.Name
    end
  end)
  return { brand = brand, model = model, name = name }
end

local function sendVehicleInfo()
  if guihooks == nil or guihooks.trigger == nil then return end
  local ok, info = pcall(vehicleInfo)
  if not ok or type(info) ~= 'table' then info = {} end
  guihooks.trigger('creatorpack.vehicle', info)
end

local function pfhudVehicle()
  local ok, info = pcall(vehicleInfo)
  if not ok or type(info) ~= 'table' then info = {} end
  if guihooks and guihooks.trigger then guihooks.trigger('creatorpack.vehicle', info) end
  return info
end


-- Folderi i imazheve brenda modit: logot e markave + fotot qe i ke shkarku.
local IMAGE_DIRS = {
  '/ui/modules/apps/CreatorPack/imazhet/',
  '/ui/modules/apps/CreatorPack/logot/',
  '/ui/modules/apps/CreatorPack/fotot/'
}

-- v5.11.2: FS:findFiles ndryshon si thirret ne versione te ndryshme te lojës.
-- Provohen KREJT firmat e njohura e bashkohen rezultatet — kshtu lista e
-- folderit (galeria) nuk del ma bosh pa arsye.
local EXT_PATS = { '*.png', '*.jpg', '*.jpeg', '*.webp' }

-- v5.11.3: KUJDES! Mod-et e lojës e thërrasin FS.findFiles(...) PA dy pika (dot-call).
-- Me dy pika (FS:findFiles) "self" hyn si argument i pare e te gjitha argumentet
-- zhvendosen -> lista del GJITH HERË bosh (ky ishte faji i vërtetë i galerisë!).
-- Provohen te dyja stilet, keshtu punon ne çdo version te lojës.
local function tryFind(d, pat, a1, a2, a3)
  local function call(style)
    return function()
      if style == 'dot' then
        if a1 == nil then return FS.findFiles(d, pat) end
        if a2 == nil then return FS.findFiles(d, pat, a1) end
        return FS.findFiles(d, pat, a1, a2, a3)
      else
        if a1 == nil then return FS:findFiles(d, pat) end
        if a2 == nil then return FS:findFiles(d, pat, a1) end
        return FS:findFiles(d, pat, a1, a2, a3)
      end
    end
  end
  for _, style in ipairs({ 'dot', 'colon' }) do
    local ok, res = pcall(call(style))
    if ok and type(res) == 'table' and #res > 0 then return res end
  end
  return nil
end
local function listInDir(dir)
  local out, seen = {}, {}
  if FS == nil then return out end
  -- v5.11.3: disa versione te lojës i kuptojne rruget VETEM relative (pa "/" ma te pare).
  local dirs = { dir }
  if string.sub(dir, 1, 1) == '/' then dirs[#dirs + 1] = string.sub(dir, 2) end
  for _, pat in ipairs(EXT_PATS) do
    local argSets = {
      { 0, false, false }, { 0, true, true }, { 0, true, false },
      { 0, false, true }, { 0 }, { 1, true, true }, { -1, false, true },
      { -1, false, false }, { -1 }, { 1000 }, { 1000, false, false }, {}
    }
    for _, d in ipairs(dirs) do
      for _, a in ipairs(argSets) do
        local res = tryFind(d, pat, a[1], a[2], a[3])
        if type(res) == 'table' and #res > 0 then
          for _, f in ipairs(res) do
            local path = tostring(f)
            if string.sub(path, 1, 1) ~= '/' then
              -- v5.11.3: disa firma kthejne rruge relative, te tjera vetem emrin
              local rel = (string.sub(dir, 1, 1) == '/') and string.sub(dir, 2) or dir
              if string.sub(path, 1, #rel) == rel then
                path = '/' .. path
              elseif string.find(path, '/', 1, true) then
                path = '/' .. path
              else
                path = dir .. path
              end
            end
            local low = string.lower(path)
            if not seen[low] then
              seen[low] = true
              out[#out + 1] = path
            end
          end
        end
      end
    end
    -- NUK ndalemi — duhen KREJT ekstensionet (png + jpg + webp …)
  end
  local clean = {}
  for _, f in ipairs(out) do
    local ext = string.lower(f):match('%.(%a+)$')
    if ext == 'png' or ext == 'jpg' or ext == 'jpeg' or ext == 'webp' then clean[#clean + 1] = f end
  end
  return clean
end

local function listImages()
  if FS == nil then return { err = 'FS mungon' } end
  local tried = {}
  for _, dir in ipairs(IMAGE_DIRS) do
    tried[#tried + 1] = dir
    local out = listInDir(dir)
    if #out > 0 then return { ok = true, dir = dir, files = out } end
  end
  return { err = 's\'ka imazhe ne folder', tried = tried, dir = IMAGE_DIRS[1] }
end

local function sendImageList()
  local ok, r = pcall(listImages)
  if not ok or type(r) ~= 'table' then r = { err = 'gabim gjate leximit' } end
  if guihooks and guihooks.trigger then guihooks.trigger('creatorpack.images', r) end
  return r
end

local function pfhudListImages() return sendImageList() end

-- =====================================================
-- v5.11.1: TE DHENAT E LOGOVE (base64) — rruga e SIGURT
-- Nese CEF-i s'e lexon dot file-in si URL (ndodh pas kthimit prej menuse),
-- UI-ja e kerkon foton prej Lua-s: e lexojme, e kthejme si base64 e s'ka
-- ma asnji varesi prej CEF-it. Rruga e shpejte (URL) mbetet e para.
-- =====================================================
local BRAND_ALIAS_LUA = {
  mercedesbenz = 'mercedes', volkswagen = 'vw', chevrolet = 'chevy',
  alfaromeo = 'alfa'
}

local function keyOf(str)
  local k = string.lower(tostring(str or '')):gsub('[^%a0-9]', '')
  return BRAND_ALIAS_LUA[k] or k
end

local function baseNameOf(path)
  local n = string.match(tostring(path or ''), '([^/]+)$')
  return n or ''
end

-- A i perket file-i (emri) markes se dhene?
local function fileMatchesBrand(path, key)
  if key == '' then return false end
  local name = baseNameOf(path):gsub('%.%a+$', '')     -- hiq ".png"
  local fn = keyOf(name)
  if fn == '' then return false end
  return (fn == key) or (fn == 'logo' .. key) or (fn == key .. 'logo')
      or (string.sub(fn, 1, 4) == 'logo' and string.sub(fn, 5) == key)
      or (string.sub(fn, 1, #key) == key)
      or (string.find(fn, 'logo' .. key, 1, true) ~= nil)
end

local function mimeOf(path)
  local ext = string.lower(string.match(tostring(path or ''), '%.(%a+)$') or '')
  if ext == 'jpg' or ext == 'jpeg' then return 'image/jpeg' end
  if ext == 'webp' then return 'image/webp' end
  return 'image/png'
end

local function readFileSafe(path)
  if FS == nil then return nil, 'FS mungon' end
  local tries = {
    function() return FS.readFile(path) end,
    function() return FS:readFile(path) end,
    function() return FS.readFile(path, 'r') end,
    function() return FS:readFile(path, 'r') end
  }
  for _, f in ipairs(tries) do
    local ok, data = pcall(f)
    if ok and type(data) == 'string' and #data > 0 then return data end
  end
  return nil, 'nuk u lexu file-i'
end

-- Base64 (implementim i vogel, pa varesi)
local B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local function base64Encode(data)
  local out, n = {}, 0
  local len = #data
  local i = 1
  while i <= len do
    local b1, b2, b3 = string.byte(data, i, i + 2)
    b1 = b1 or 0; b2 = b2 or 0; b3 = b3 or 0
    local c1 = math.floor(b1 / 4) + 1
    local c2 = (b1 % 4) * 16 + math.floor(b2 / 16) + 1
    local c3 = (b2 % 16) * 4 + math.floor(b3 / 64) + 1
    local c4 = (b3 % 64) + 1
    local chunk = string.sub(B64, c1, c1) .. string.sub(B64, c2, c2)
    if i + 1 <= len then chunk = chunk .. string.sub(B64, c3, c3) else chunk = chunk .. '=' end
    if i + 2 <= len then chunk = chunk .. string.sub(B64, c4, c4) else chunk = chunk .. '=' end
    out[n + 1] = chunk; n = n + 1
    i = i + 3
  end
  return table.concat(out)
end

local LOGO_MAX_BYTES = 900 * 1024

local function findFileForBrand(key)
  for _, dir in ipairs(IMAGE_DIRS) do
    for _, path in ipairs(listInDir(dir)) do
      if fileMatchesBrand(path, key) then return path end
    end
  end
  return nil
end

-- UI-ja e therret: logoja e markes si base64 (rruga e sigurt)
local function pfhudLogoData(brand)
  local key = keyOf(brand)
  local res = { brand = key }
  if key == '' then
    res.err = 'pa marke'
  else
    local path = findFileForBrand(key)
    if not path then
      res.err = 's\'ka file logo per ' .. key
    else
      local data, err = readFileSafe(path)
      if not data then
        res.err = err or 'nuk u lexu'
      elseif #data > LOGO_MAX_BYTES then
        res.err = 'file-i osht i madh (' .. math.floor(#data / 1024) .. ' KB)'
      else
        res.file = path
        res.data = 'data:' .. mimeOf(path) .. ';base64,' .. base64Encode(data)
      end
    end
  end
  if guihooks and guihooks.trigger then guihooks.trigger('creatorpack.logodata', res) end
  return res
end

-- UI-ja e therret per nje foto te caktuar te folderit (pa varesi prej CEF-it)
local function pfhudImageData(path)
  local p = tostring(path or '')
  local res = { path = p }
  local allowed = false
  for _, dir in ipairs(IMAGE_DIRS) do
    if string.sub(p, 1, #dir) == dir then allowed = true break end
  end
  if not allowed then
    res.err = 'rruga nuk lejohet'
  else
    local data, err = readFileSafe(p)
    if not data then
      res.err = err or 'nuk u lexu'
    elseif #data > LOGO_MAX_BYTES then
      res.err = 'file-i osht i madh (' .. math.floor(#data / 1024) .. ' KB)'
    else
      res.data = 'data:' .. mimeOf(p) .. ';base64,' .. base64Encode(data)
    end
  end
  if guihooks and guihooks.trigger then guihooks.trigger('creatorpack.imagedata', res) end
  return res
end

-- Shenim ne log-un e lojes (per diagnoze)
local function pfhudNote(txt)
  local msg = '[CreatorPack Studio v6.0.2] ' .. tostring(txt or '')
  pcall(print, msg)
  return msg
end


local function onVehicleSwitched(oldId, newId)
  pcall(sendVehicleInfo)
end

M.pfhudPass = pfhudPass
M.pfhudFail = pfhudFail
M.pfhudNext = pfhudNext
M.pfhudPrev = pfhudPrev
M.pfhudReset = pfhudReset
M.pfhudTogglePanel = pfhudTogglePanel
M.pfhudUndo = pfhudUndo
M.pfhudToggleGuides = pfhudToggleGuides
M.pfhudToggleVehicles = pfhudToggleVehicles
M.pfhudToggleShorts = pfhudToggleShorts
M.pfhudVehicle = pfhudVehicle
M.sendVehicleInfo = sendVehicleInfo
M.pfhudListImages = pfhudListImages
M.pfhudLogoData = pfhudLogoData
M.pfhudImageData = pfhudImageData
M.pfhudNote = pfhudNote
M.onVehicleSwitched = onVehicleSwitched

-- BeamNG's extension loader requires a valid lifecycle. Without this,
-- extensions.creatorpack can remain nil and every image/gallery call fails.
function M.onExtensionLoaded()
  pcall(sendVehicleInfo)
  return true
end

function M.onExtensionUnloaded()
end

return M
