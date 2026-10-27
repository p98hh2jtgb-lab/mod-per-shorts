-- CreatorPack Studio 6.3.0 — BeamNG GE extension
-- Gallery photos/logos (mod folder + your own CreatorPack/imazhet folder), uploads
-- from the panel, "open folder", vehicle information and input bindings.
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


-- =====================================================================
-- v6.3.0 — FOTOT DHE LOGOT
--
-- Dy vende për imazhet:
--   1) Folderi YT:  <BeamNG user folder>/CreatorPack/imazhet/
--      Jashtë ZIP-it, prandaj fotot nuk humbin kur përditëson modin.
--      Butoni "Hap folderin" në panel e krijon dhe e hap në Windows.
--   2) Folderi i modit: /ui/modules/apps/CreatorPack/imazhet/ (brenda ZIP-it).
--
-- Rregullat e BeamNG që ndiqen këtu (nga kodi zyrtar Lua i lojës):
--   * FS:findFiles(dir, '*.*', 0, true, false) liston një folder (edhe në ZIP).
--   * io.readFileToBuffer(path, buffer) lexon çdo file të VFS-it (edhe në ZIP).
--     FS:readFile NUK ekziston — prandaj rruga base64 e vjetër s'punonte kurrë.
--   * io.open(relativePath, 'wb') shkruan në user folder.
--   * Engine.Platform.exploreFolder(path) hap folderin në Windows Explorer.
--   * onFilesChanged(files) thirret kur ndryshojnë file-t (galeria rifreskohet vetë).
-- =====================================================================
local VERSION = '6.3.0'

local USER_DIR = '/CreatorPack/imazhet/'
local MOD_DIRS = {
  '/ui/modules/apps/CreatorPack/imazhet/',
  '/ui/modules/apps/CreatorPack/logot/',
  '/ui/modules/apps/CreatorPack/fotot/'
}
local SCAN_DIRS = { USER_DIR, MOD_DIRS[1], MOD_DIRS[2], MOD_DIRS[3] }
local USER_NOTE = 'VENDOSI_FOTOT_KETU.txt'
local USER_NOTE_TEXT = table.concat({
  'CreatorPack Studio - fotot dhe logot e tua',
  '',
  'Kopjo ketu PNG, JPG, JFIF, WEBP, GIF, BMP ose AVIF.',
  'Ne loje: H -> Fotot. Galeria rifreskohet vete; ose shtyp "Rifresko".',
  'Fotot qe i ngarkon me "Ngarko nga kompjuteri" ruhen po ashtu ketu.',
  'Ky folder eshte jashte ZIP-it te modit, prandaj fotot nuk humbin',
  'kur e perditeson CreatorPack-un.',
  '',
  'Emri i file-it e tregon logon e markes: bmw.png, logo_audi.png, ...',
  'HEIC (foto iPhone) nuk lexohet nga loja - ruaje si JPG/PNG.',
  ''
}, '\r\n')

local MIME = {
  png = 'image/png', jpg = 'image/jpeg', jpeg = 'image/jpeg', jpe = 'image/jpeg',
  jfif = 'image/jpeg', pjpeg = 'image/jpeg', pjp = 'image/jpeg', webp = 'image/webp',
  gif = 'image/gif', bmp = 'image/bmp', avif = 'image/avif', svg = 'image/svg+xml'
}
-- Formatet që shfaqen si "nuk lexohen" që përdoruesi ta dijë pse mungojnë.
local UNSUPPORTED = { heic = true, heif = true, tif = true, tiff = true, psd = true }

local MAX_FILE_BYTES = 24 * 1024 * 1024   -- 24 MB për një foto
local CHUNK_CHARS = 196608                -- 192 KB base64 për çdo event drejt UI-së
local CHUNKS_PER_FRAME = 4
local MAX_UPLOAD_PARTS = 400
local UPLOAD_TTL = 120                    -- sekonda para se një ngarkim i papërfunduar të fshihet

local floor = math.floor
local unpack = table.unpack or unpack

local function emit(name, data)
  if guihooks == nil or guihooks.trigger == nil then return end
  guihooks.trigger(name, data)
end

local function lower(s) return string.lower(tostring(s or '')) end

local function extOf(p)
  return lower(string.match(tostring(p or ''), '%.([%w]+)$') or '')
end

local function baseNameOf(path)
  return string.match(tostring(path or ''), '([^/]+)$') or ''
end

local function startsWithI(s, prefix)
  return lower(string.sub(s, 1, #prefix)) == lower(prefix)
end

local function isUserPath(p) return startsWithI(tostring(p or ''), USER_DIR) end

local function nowSeconds()
  local ok, t = pcall(os.clock)
  return ok and t or 0
end

-- ---------------------------------------------------------------------
-- Base64 (pa varësi; punon në LuaJIT të lojës dhe në Lua 5.3 të testeve)
-- ---------------------------------------------------------------------
local B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local ENC, DEC = {}, {}
for i = 0, 63 do
  local c = string.byte(B64, i + 1)
  ENC[i] = c
  DEC[c] = i
end

local function base64Encode(data)
  data = tostring(data or '')
  local len = #data
  local parts, np, t, k = {}, 0, {}, 0
  local i = 1
  while i <= len - 2 do
    local a, b, c = string.byte(data, i, i + 2)
    local v = a * 65536 + b * 256 + c
    t[k + 1] = ENC[floor(v / 262144)]
    t[k + 2] = ENC[floor(v / 4096) % 64]
    t[k + 3] = ENC[floor(v / 64) % 64]
    t[k + 4] = ENC[v % 64]
    k = k + 4
    if k >= 4096 then
      np = np + 1; parts[np] = string.char(unpack(t, 1, k)); k = 0
    end
    i = i + 3
  end
  local rem = len - i + 1
  if rem == 1 then
    local v = string.byte(data, i) * 65536
    t[k + 1] = ENC[floor(v / 262144)]; t[k + 2] = ENC[floor(v / 4096) % 64]
    t[k + 3] = 61; t[k + 4] = 61; k = k + 4
  elseif rem == 2 then
    local a, b = string.byte(data, i, i + 1)
    local v = a * 65536 + b * 256
    t[k + 1] = ENC[floor(v / 262144)]; t[k + 2] = ENC[floor(v / 4096) % 64]
    t[k + 3] = ENC[floor(v / 64) % 64]; t[k + 4] = 61; k = k + 4
  end
  if k > 0 then np = np + 1; parts[np] = string.char(unpack(t, 1, k)) end
  return table.concat(parts)
end

local function base64Decode(s)
  s = string.gsub(tostring(s or ''), '[^%w%+/]', '')
  local len = #s
  local parts, np, t, k = {}, 0, {}, 0
  local i = 1
  while i <= len - 3 do
    local a, b, c, d = string.byte(s, i, i + 3)
    local v = DEC[a] * 262144 + DEC[b] * 4096 + DEC[c] * 64 + DEC[d]
    t[k + 1] = floor(v / 65536); t[k + 2] = floor(v / 256) % 256; t[k + 3] = v % 256
    k = k + 3
    if k >= 4095 then
      np = np + 1; parts[np] = string.char(unpack(t, 1, k)); k = 0
    end
    i = i + 4
  end
  local rem = len - i + 1
  if rem == 2 then
    local a, b = string.byte(s, i, i + 1)
    t[k + 1] = floor((DEC[a] * 262144 + DEC[b] * 4096) / 65536); k = k + 1
  elseif rem == 3 then
    local a, b, c = string.byte(s, i, i + 2)
    local v = DEC[a] * 262144 + DEC[b] * 4096 + DEC[c] * 64
    t[k + 1] = floor(v / 65536); t[k + 2] = floor(v / 256) % 256; k = k + 2
  end
  if k > 0 then np = np + 1; parts[np] = string.char(unpack(t, 1, k)) end
  return table.concat(parts)
end

-- ---------------------------------------------------------------------
-- File system helpers
-- ---------------------------------------------------------------------
local function fileExists(p)
  if FS == nil then return false end
  local ok, res = pcall(function() return FS:fileExists(p) end)
  return ok and res == true
end

local function directoryExists(p)
  if FS == nil then return false end
  local ok, res = pcall(function() return FS:directoryExists(p) end)
  return ok and res == true
end

local function statOf(p)
  if FS == nil then return nil end
  local ok, st = pcall(function() return FS:stat(p) end)
  if ok and type(st) == 'table' then return st end
  return nil
end

local function relPath(p) return (string.gsub(tostring(p or ''), '^/+', '')) end

local okStringBuffer, stringBuffer = pcall(require, 'string.buffer')

-- Lexon bytes të një file-i të VFS-it (ZIP i modit ose user folder).
local function readBinary(p)
  if io and type(io.readFileToBuffer) == 'function' and okStringBuffer and stringBuffer then
    local ok, data = pcall(function()
      local buf = stringBuffer.new()
      if io.readFileToBuffer(p, buf) then return buf:tostring() end
      return nil
    end)
    if ok and type(data) == 'string' and #data > 0 then return data end
  end
  if io and type(io.open) == 'function' then
    for _, q in ipairs({ relPath(p), p }) do
      local ok, data = pcall(function()
        local f = io.open(q, 'rb')
        if not f then return nil end
        local d = f:read('*a')
        f:close()
        return d
      end)
      if ok and type(data) == 'string' and #data > 0 then return data end
    end
  end
  if type(readFile) == 'function' then
    local ok, data = pcall(readFile, p)
    if ok and type(data) == 'string' and #data > 0 then return data end
  end
  return nil, 'nuk u lexu file-i'
end

-- Shkruan bytes në user folder. Kodi i BeamNG-së i shkruan file-t e përdoruesit
-- si 'settings/x.json' (trackBuilder, scenarios) dhe si '/settings/x.json'
-- (screenshotCreator, mirror) — provohet e para relative, pastaj me "/".
local function writeBinary(p, data)
  if not (io and type(io.open) == 'function') then return false, 'io.open mungon' end
  local lastErr = nil
  for _, q in ipairs({ relPath(p), p }) do
    local ok, err = pcall(function()
      local f, e = io.open(q, 'wb')
      if not f then error(e or 'nuk u hap file-i') end
      f:write(data)
      f:close()
    end)
    if ok then
      if FS == nil or fileExists(p) then return true end
      lastErr = 'file-i nuk u gjet pas ruajtjes'
    else
      lastErr = tostring(err)
    end
  end
  return false, lastErr or 'nuk u shkrua file-i'
end

local function writeText(p, text)
  return writeBinary(p, text)
end

local function userRealPath()
  local real = nil
  pcall(function()
    local up = FS:getUserPath()
    if type(up) == 'string' and up ~= '' then
      up = string.gsub(up, '\\', '/')
      if string.sub(up, -1) ~= '/' then up = up .. '/' end
      real = up .. string.sub(USER_DIR, 2)
    end
  end)
  return real
end

local function ensureUserDir()
  local dir = string.sub(USER_DIR, 1, -2)
  if not directoryExists(dir) and not directoryExists(USER_DIR) then
    pcall(function() FS:directoryCreate(dir, true) end)
  end
  local exists = directoryExists(dir) or directoryExists(USER_DIR)
  if exists and not fileExists(USER_DIR .. USER_NOTE) then
    pcall(writeText, USER_DIR .. USER_NOTE, USER_NOTE_TEXT)
  end
  return exists
end

local function normalizeListed(dir, f)
  local p = string.gsub(tostring(f or ''), '\\', '/')
  if p == '' then return nil end
  if string.sub(p, 1, 1) ~= '/' then
    local rel = string.sub(dir, 2)
    if startsWithI(p, rel) or string.find(p, '/', 1, true) then p = '/' .. p
    else p = dir .. p end
  end
  return p
end

-- Lista e file-ave direkt në një folder (pa nënfoldera).
local function listDir(dir)
  local out, seen = {}, {}
  if FS == nil then return out end
  local tries = {
    function() return FS:findFiles(dir, '*.*', 0, true, false) end,
    function() return FS:findFiles(string.sub(dir, 2), '*.*', 0, true, false) end,
    function() return FS:findFiles(dir, '*', 0, true, false) end,
    function() return FS.findFiles(dir, '*.*', 0, true, false) end
  }
  for _, try in ipairs(tries) do
    local ok, res = pcall(try)
    if ok and type(res) == 'table' and #res > 0 then
      for _, f in ipairs(res) do
        local p = normalizeListed(dir, f)
        if p and startsWithI(p, dir) then
          local rest = string.sub(p, #dir + 1)
          if rest ~= '' and not string.find(rest, '/', 1, true) then
            local key = lower(p)
            if not seen[key] then seen[key] = true; out[#out + 1] = p end
          end
        end
      end
      break
    end
  end
  return out
end

local function listImages()
  local files, skipped, seen = {}, {}, {}
  local userCount, modCount = 0, 0
  if FS == nil then return { ok = false, err = 'FS mungon', files = files, skipped = skipped } end
  for _, dir in ipairs(SCAN_DIRS) do
    for _, p in ipairs(listDir(dir)) do
      local ext = extOf(p)
      if MIME[ext] then
        local key = lower(p)
        if not seen[key] then
          seen[key] = true
          local st = statOf(p)
          local user = isUserPath(p)
          if user then userCount = userCount + 1 else modCount = modCount + 1 end
          files[#files + 1] = {
            path = p, name = baseNameOf(p), user = user,
            size = st and tonumber(st.filesize) or nil,
            mtime = st and tonumber(st.modtime or st.createtime or st.filetime) or nil
          }
        end
      elseif UNSUPPORTED[ext] then
        skipped[#skipped + 1] = { path = p, name = baseNameOf(p), ext = ext }
      end
    end
  end
  return {
    ok = true, version = VERSION, dir = USER_DIR, userDir = USER_DIR, userReal = userRealPath(),
    dirs = SCAN_DIRS, files = files, skipped = skipped,
    userCount = userCount, modCount = modCount
  }
end

local function sendImageList(reason)
  local ok, r = pcall(listImages)
  if not ok or type(r) ~= 'table' then r = { ok = false, err = 'gabim gjatë leximit: ' .. tostring(r) } end
  r.reason = reason
  emit('creatorpack.images', r)
  return r
end

local function pfhudListImages(reason) return sendImageList(reason or 'manual') end

-- Rruga lejohet vetëm brenda folderave të imazheve, pa "..", vetëm imazhe.
local function checkImagePath(p)
  if type(p) ~= 'string' or p == '' then return false, 'rruga mungon' end
  p = string.gsub(p, '\\', '/')
  if string.find(p, '\0', 1, true) then return false, 'rruga nuk lejohet' end
  for seg in string.gmatch(p, '[^/]+') do
    if seg == '..' or seg == '.' then return false, 'rruga nuk lejohet' end
  end
  for _, dir in ipairs(SCAN_DIRS) do
    if startsWithI(p, dir) then
      local rest = string.sub(p, #dir + 1)
      if rest == '' or string.find(rest, '/', 1, true) then return false, 'rruga nuk lejohet' end
      local ext = extOf(rest)
      if not MIME[ext] then return false, 'formati .' .. ext .. ' nuk lexohet' end
      return true, p
    end
  end
  return false, 'rruga nuk lejohet'
end

-- ---------------------------------------------------------------------
-- Dërgimi i fotove drejt UI-së në copa (pa kufi 900 KB si më parë)
-- ---------------------------------------------------------------------
-- Radhë FIFO me indekse head/tail (jo "#": me vrima në tabelë "#" s'është i sigurt).
local sendQueue, sendHead, sendTail = {}, 1, 0

local function queueEvent(name, payload)
  sendTail = sendTail + 1
  sendQueue[sendTail] = { name, payload }
end

local function flushQueue(maxEvents)
  local n = 0
  while sendHead <= sendTail and n < maxEvents do
    local e = sendQueue[sendHead]
    sendQueue[sendHead] = nil
    sendHead = sendHead + 1
    emit(e[1], e[2])
    n = n + 1
  end
  if sendHead > sendTail then sendQueue, sendHead, sendTail = {}, 1, 0 end
end

local function sendFileData(p, id, extra)
  local res = { id = id, path = p }
  if type(extra) == 'table' then for k, v in pairs(extra) do res[k] = v end end
  local data, err = readBinary(p)
  if not data then
    res.err = err or 'nuk u lexu file-i'
    emit('creatorpack.filedata', res)
    return res
  end
  if #data > MAX_FILE_BYTES then
    res.err = 'file-i është shumë i madh (' .. floor(#data / 1048576 + 0.5) .. ' MB, max 24 MB)'
    emit('creatorpack.filedata', res)
    return res
  end
  local b64 = base64Encode(data)
  local n = math.max(1, math.ceil(#b64 / CHUNK_CHARS))
  local mime = MIME[extOf(p)] or 'image/png'
  for i = 1, n do
    local part = {
      id = id, path = p, i = i, n = n, mime = mime, bytes = #data,
      data = string.sub(b64, (i - 1) * CHUNK_CHARS + 1, i * CHUNK_CHARS)
    }
    if type(extra) == 'table' then for k, v in pairs(extra) do part[k] = v end end
    if i <= CHUNKS_PER_FRAME then emit('creatorpack.filedata', part) else queueEvent('creatorpack.filedata', part) end
  end
  res.n = n
  res.bytes = #data
  return res
end

-- UI-ja e thërret për një foto të caktuar kur CEF-i s'e hap dot si URL.
local function pfhudImageData(path, id)
  local okPath, p = checkImagePath(path)
  local reqId = tostring(id or ('img:' .. tostring(path or '')))
  if not okPath then
    local res = { id = reqId, path = tostring(path or ''), err = p }
    emit('creatorpack.filedata', res)
    return res
  end
  return sendFileData(p, reqId)
end

-- ---------------------------------------------------------------------
-- Logot e markave sipas emrit të file-it (bmw.png, logo_audi.png, ...)
-- ---------------------------------------------------------------------
local BRAND_ALIAS_LUA = {
  mercedesbenz = 'mercedes', volkswagen = 'vw', chevrolet = 'chevy',
  alfaromeo = 'alfa'
}

local function keyOf(str)
  local k = string.gsub(lower(str), '[^%a0-9]', '')
  return BRAND_ALIAS_LUA[k] or k
end

local function fileMatchesBrand(path, key)
  if key == '' then return false end
  local name = string.gsub(baseNameOf(path), '%.%w+$', '')
  local fn = keyOf(name)
  if fn == '' then return false end
  return (fn == key) or (fn == 'logo' .. key) or (fn == key .. 'logo')
      or (string.sub(fn, 1, 4) == 'logo' and string.sub(fn, 5) == key)
      or (string.sub(fn, 1, #key) == key)
      or (string.find(fn, 'logo' .. key, 1, true) ~= nil)
end

local function findFileForBrand(key)
  for _, dir in ipairs(SCAN_DIRS) do
    for _, path in ipairs(listDir(dir)) do
      if MIME[extOf(path)] and fileMatchesBrand(path, key) then return path end
    end
  end
  return nil
end

local function pfhudLogoData(brand, id)
  local key = keyOf(brand)
  local reqId = tostring(id or ('logo:' .. key))
  if key == '' then
    local res = { id = reqId, brand = key, err = 'pa markë' }
    emit('creatorpack.filedata', res)
    return res
  end
  local path = findFileForBrand(key)
  if not path then
    local res = { id = reqId, brand = key, err = 's\'ka file logo për ' .. key }
    emit('creatorpack.filedata', res)
    return res
  end
  return sendFileData(path, reqId, { brand = key })
end

-- ---------------------------------------------------------------------
-- "Ngarko nga kompjuteri": UI-ja e dërgon foton në copa base64, Lua e ruan
-- në folderin tënd dhe e rifreskon galerinë.
-- ---------------------------------------------------------------------
local uploads = {}

local function looksLikeImage(bin)
  local h = string.sub(bin, 1, 12)
  return string.sub(h, 1, 8) == '\137PNG\r\n\026\n'
      or string.sub(h, 1, 3) == '\255\216\255'
      or string.sub(h, 1, 4) == 'GIF8'
      or (string.sub(h, 1, 4) == 'RIFF' and string.sub(h, 9, 12) == 'WEBP')
      or string.sub(h, 1, 2) == 'BM'
end

local function trimUtf8(s, maxBytes)
  if #s <= maxBytes then return s end
  s = string.sub(s, 1, maxBytes)
  local i = #s
  while i > 0 do
    local b = string.byte(s, i)
    if b < 0x80 then break end
    if b >= 0xC0 then
      local need = (b >= 0xF0 and 4) or (b >= 0xE0 and 3) or 2
      if #s - i + 1 < need then s = string.sub(s, 1, i - 1) end
      break
    end
    i = i - 1
  end
  return s
end

local function safeFileName(name, ext)
  local base = baseNameOf(string.gsub(tostring(name or ''), '\\', '/'))
  base = string.gsub(base, '%.[%w]+$', '')
  base = string.gsub(base, '[%c<>:"/\\|%?%*]', '')
  base = string.gsub(base, '^[%s%.]+', '')
  base = string.gsub(base, '[%s%.]+$', '')
  base = trimUtf8(base, 64)
  if base == '' then base = 'foto' end
  return base .. '.' .. ext
end

local function uniqueUserPath(fileName)
  local base, ext = string.match(fileName, '^(.*)%.([%w]+)$')
  base = base or fileName
  ext = ext or 'png'
  local p = USER_DIR .. fileName
  local n = 2
  while fileExists(p) and n < 1000 do
    p = USER_DIR .. base .. ' (' .. n .. ').' .. ext
    n = n + 1
  end
  return p
end

local function dropStaleUploads()
  local now = nowSeconds()
  for id, u in pairs(uploads) do
    if (now - (u.t or now)) > UPLOAD_TTL then uploads[id] = nil end
  end
end

local function uploadFail(id, err)
  local res = { id = id, ok = false, err = err }
  emit('creatorpack.uploaded', res)
  return res
end

local function pfhudUploadChunk(id, name, i, n, data)
  id = tostring(id or '')
  i = tonumber(i) or 0
  n = tonumber(n) or 0
  if id == '' or n < 1 or i < 1 or i > n or n > MAX_UPLOAD_PARTS then
    return uploadFail(id, 'ngarkim i pavlefshëm')
  end
  dropStaleUploads()
  local u = uploads[id]
  if not u then
    u = { name = tostring(name or 'foto'), n = n, parts = {}, got = 0, t = nowSeconds() }
    uploads[id] = u
  end
  if u.parts[i] == nil then
    u.parts[i] = tostring(data or '')
    u.got = u.got + 1
  end
  if u.got < u.n then return { id = id, got = u.got, n = u.n } end
  uploads[id] = nil

  local b64 = table.concat(u.parts)
  local mime, payload = string.match(b64, '^data:([%w/%+%-%.]+);base64,(.*)$')
  if payload then b64 = payload end
  local ext = ({ ['image/png'] = 'png', ['image/jpeg'] = 'jpg', ['image/webp'] = 'webp', ['image/gif'] = 'gif', ['image/bmp'] = 'bmp' })[mime or '']
  if not ext then
    ext = extOf(u.name)
    if ext == 'jpeg' or ext == 'jfif' or ext == 'jpe' then ext = 'jpg' end
    if not MIME[ext] or ext == 'svg' or ext == 'avif' then ext = 'png' end
  end
  local bin = base64Decode(b64)
  if #bin < 16 or not looksLikeImage(bin) then return uploadFail(id, 'të dhënat nuk janë foto') end
  if #bin > MAX_FILE_BYTES then return uploadFail(id, 'fotoja është shumë e madhe') end
  if not ensureUserDir() then return uploadFail(id, 'folderi CreatorPack/imazhet nuk u krijua') end
  local target = uniqueUserPath(safeFileName(u.name, ext))
  local okW, errW = writeBinary(target, bin)
  if not okW then return uploadFail(id, errW or 'fotoja nuk u ruajt') end
  local res = { id = id, ok = true, path = target, name = baseNameOf(target), bytes = #bin }
  emit('creatorpack.uploaded', res)
  sendImageList('upload')
  return res
end

-- ---------------------------------------------------------------------
-- "Hap folderin": krijon <user folder>/CreatorPack/imazhet/ dhe e hap.
-- ---------------------------------------------------------------------
local function pfhudOpenImageFolder()
  local created = ensureUserDir()
  local opened, err = false, nil
  local explore = Engine and Engine.Platform and Engine.Platform.exploreFolder
  if type(explore) == 'function' then
    local ok, e = pcall(explore, USER_DIR)
    if not ok then ok, e = pcall(explore, string.sub(USER_DIR, 2)) end
    opened = ok
    if not ok then err = tostring(e) end
  else
    err = 'exploreFolder mungon në këtë version të lojës'
  end
  local res = { ok = opened, created = created, dir = USER_DIR, real = userRealPath(), err = err }
  emit('creatorpack.folder', res)
  return res
end

local function pfhudFolderInfo()
  local res = { ok = true, dir = USER_DIR, real = userRealPath(), exists = directoryExists(string.sub(USER_DIR, 1, -2)) }
  emit('creatorpack.folder', res)
  return res
end

-- Shënim në log-un e lojës (për diagnozë)
local function pfhudNote(txt)
  local msg = '[CreatorPack Studio v' .. VERSION .. '] ' .. tostring(txt or '')
  pcall(print, msg)
  return msg
end

-- ---------------------------------------------------------------------
-- Rifreskimi automatik kur shton/fshin foto në folder
-- ---------------------------------------------------------------------
local rescanIn = nil

local function onFilesChanged(files)
  if type(files) ~= 'table' then return end
  for _, v in pairs(files) do
    local fn = (type(v) == 'table') and v.filename or v
    if type(fn) == 'string' then
      fn = string.gsub(fn, '\\', '/')
      if string.sub(fn, 1, 1) ~= '/' then fn = '/' .. fn end
      for _, dir in ipairs(SCAN_DIRS) do
        if startsWithI(fn, dir) then rescanIn = 0.6; return end
      end
    end
  end
end

local function onUpdate(dtReal)
  if sendHead <= sendTail then flushQueue(CHUNKS_PER_FRAME) end
  if rescanIn then
    rescanIn = rescanIn - (tonumber(dtReal) or 0.016)
    if rescanIn <= 0 then
      rescanIn = nil
      sendImageList('auto')
    end
  end
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
M.pfhudUploadChunk = pfhudUploadChunk
M.pfhudOpenImageFolder = pfhudOpenImageFolder
M.pfhudFolderInfo = pfhudFolderInfo
M.pfhudNote = pfhudNote
M.onVehicleSwitched = onVehicleSwitched
M.onFilesChanged = onFilesChanged
M.onUpdate = onUpdate

-- Për testet: helper-at e brendshëm.
M._internal = {
  base64Encode = base64Encode, base64Decode = base64Decode, listImages = listImages,
  checkImagePath = checkImagePath, safeFileName = safeFileName, USER_DIR = USER_DIR,
  SCAN_DIRS = SCAN_DIRS, CHUNK_CHARS = CHUNK_CHARS, flushQueue = flushQueue,
  queued = function() return sendTail - sendHead + 1 end
}

-- BeamNG's extension loader requires a valid lifecycle. Without this,
-- extensions.creatorpack can remain nil and every image/gallery call fails.
function M.onExtensionLoaded()
  pcall(sendVehicleInfo)
  return true
end

function M.onExtensionUnloaded()
  uploads = {}
  sendQueue, sendHead, sendTail = {}, 1, 0
end

return M
