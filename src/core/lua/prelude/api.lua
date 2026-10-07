-- Nachbildung der Figura-API (0.1.x) für die VTuber-App.
-- Eingaben aus JavaScript: __vt_js (Rückruf-Funktionen) und __vt_setup (Teile, Animationen, Skripte …).
-- Einstiegspunkte für JavaScript liegen in __vt.

local js = __vt_js
local setup = __vt_setup
__vt_js, __vt_setup = nil, nil

local traceback = debug.traceback
local rawpcall, rawxpcall = pcall, xpcall
local coresume, cocreate = coroutine.resume, coroutine.create
local LIMIT = 'Instruktionslimit'
local isVec = __isVec
__isVec = nil

local vt = {}
__vt = vt

-- ---------------------------------------------------------------------------
-- Hilfen

local warned = {}
local function warnOnce(key, message)
  if not warned[key] then
    warned[key] = true
    js.log('warn', message)
  end
end

local function isLimit(err) return rawequal(type(err), 'string') and err:find(LIMIT, 1, true) ~= nil end

-- pcall & Co. dürfen das Instruktionslimit nicht verschlucken.
function pcall(f, ...)
  local r = table.pack(rawpcall(f, ...))
  if not r[1] and isLimit(r[2]) then error(r[2], 0) end
  return table.unpack(r, 1, r.n)
end
function xpcall(f, handler, ...)
  local limitErr
  local r = table.pack(rawxpcall(f, function(e)
    if isLimit(e) then limitErr = e return e end
    return handler(e)
  end, ...))
  if limitErr then error(limitErr, 0) end
  return table.unpack(r, 1, r.n)
end
function coroutine.resume(co, ...)
  local r = table.pack(coresume(co, ...))
  if not r[1] and isLimit(r[2]) then error(r[2], 0) end
  return table.unpack(r, 1, r.n)
end
function coroutine.wrap(f)
  local co = cocreate(f)
  return function(...)
    local r = table.pack(coroutine.resume(co, ...))
    if not r[1] then error(r[2], 0) end
    return table.unpack(r, 2, r.n)
  end
end

local function guard(fn, ...)
  local r = table.pack(rawxpcall(fn, function(e) return traceback(tostring(e), 2) end, ...))
  if not r[1] then error(r[2], 0) end
  return table.unpack(r, 2, r.n)
end

local function join(...)
  local n = select('#', ...)
  local parts = {}
  for i = 1, n do parts[i] = tostring((select(i, ...))) end
  return table.concat(parts, '\t')
end
function print(...) js.log('info', join(...)) end
log = print

--- JSON (für toJson/parseJson, config und die Oberfläche)
local encode
local function encodeString(s)
  return '"' .. s:gsub('[%c"\\]', function(c)
    local map = { ['"'] = '\\"', ['\\'] = '\\\\', ['\n'] = '\\n', ['\r'] = '\\r', ['\t'] = '\\t' }
    return map[c] or string.format('\\u%04x', c:byte())
  end) .. '"'
end
encode = function(v, depth)
  depth = depth or 0
  if depth > 32 then return 'null' end
  local t = type(v)
  if v == nil then return 'null' end
  if t == 'boolean' then return tostring(v) end
  if t == 'number' then
    if v ~= v or v == math.huge or v == -math.huge then return 'null' end
    if math.type(v) == 'integer' then return tostring(v) end
    return string.format('%.17g', v)
  end
  if t == 'string' then return encodeString(v) end
  if isVec(v) then
    local out = {}
    for i = 1, #v do out[i] = encode(v[i], depth + 1) end
    return '{"__vec":[' .. table.concat(out, ',') .. ']}'
  end
  if t == 'function' or t == 'thread' or t == 'userdata' then return 'null' end
  if next(v) == nil then return '[]' end
  local n = #v
  local isArray = n > 0
  if isArray then for k in pairs(v) do if math.type(k) ~= 'integer' or k < 1 or k > n then isArray = false break end end end
  local out = {}
  if isArray then
    for i = 1, n do out[i] = encode(v[i], depth + 1) end
    return '[' .. table.concat(out, ',') .. ']'
  end
  for k, val in pairs(v) do
    local tv = type(val)
    if tv ~= 'function' and tv ~= 'thread' and tv ~= 'userdata' then out[#out + 1] = encodeString(tostring(k)) .. ':' .. encode(val, depth + 1) end
  end
  return '{' .. table.concat(out, ',') .. '}'
end

local function decode(s)
  local pos = 1
  local function ws() pos = s:find('[^ \t\r\n]', pos) or #s + 1 end
  local value
  local function str()
    local out = {}
    pos = pos + 1
    while true do
      local c = s:sub(pos, pos)
      if c == '' then error('JSON: Text nicht abgeschlossen') end
      if c == '"' then pos = pos + 1 break end
      if c == '\\' then
        local e = s:sub(pos + 1, pos + 1)
        local map = { b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }
        if e == 'u' then
          out[#out + 1] = utf8.char(tonumber(s:sub(pos + 2, pos + 5), 16) or 63)
          pos = pos + 6
        else
          out[#out + 1] = map[e] or e
          pos = pos + 2
        end
      else
        out[#out + 1] = c
        pos = pos + 1
      end
    end
    return table.concat(out)
  end
  value = function()
    ws()
    local c = s:sub(pos, pos)
    if c == '{' then
      local obj = {}
      pos = pos + 1
      ws()
      if s:sub(pos, pos) == '}' then pos = pos + 1 return obj end
      while true do
        ws()
        local k = str()
        ws()
        pos = pos + 1 -- ':'
        obj[k] = value()
        ws()
        local d = s:sub(pos, pos)
        pos = pos + 1
        if d == '}' then break end
      end
      if type(obj.__vec) == 'table' then return vec(table.unpack(obj.__vec)) end
      return obj
    elseif c == '[' then
      local arr = {}
      pos = pos + 1
      ws()
      if s:sub(pos, pos) == ']' then pos = pos + 1 return arr end
      while true do
        arr[#arr + 1] = value()
        ws()
        local d = s:sub(pos, pos)
        pos = pos + 1
        if d == ']' then break end
      end
      return arr
    elseif c == '"' then
      return str()
    elseif s:sub(pos, pos + 3) == 'true' then pos = pos + 4 return true
    elseif s:sub(pos, pos + 4) == 'false' then pos = pos + 5 return false
    elseif s:sub(pos, pos + 3) == 'null' then pos = pos + 4 return nil
    else
      local num = s:match('^-?%d+%.?%d*[eE]?[-+]?%d*', pos)
      if not num or num == '' then error('JSON: unerwartetes Zeichen bei ' .. pos) end
      pos = pos + #num
      return tonumber(num)
    end
  end
  return value()
end

function toJson(v) return encode(v) end
function parseJson(s) return decode(s) end
function printJson(s) print(s) end
logJson = printJson
function printTable(t, maxDepth, silent)
  maxDepth = maxDepth or 1
  local lines = {}
  local function walk(v, indent, depth)
    for k, val in pairs(v) do
      if type(val) == 'table' and depth < maxDepth then
        lines[#lines + 1] = indent .. tostring(k) .. ' = {'
        walk(val, indent .. '  ', depth + 1)
        lines[#lines + 1] = indent .. '}'
      else
        lines[#lines + 1] = indent .. tostring(k) .. ' = ' .. tostring(val)
      end
    end
  end
  if type(t) == 'table' then walk(t, '', 0) else lines[1] = tostring(t) end
  local text = table.concat(lines, '\n')
  if not silent then print(text) end
  return text
end
logTable = printTable

--- Platzhalter-Objekte: unbekannte Methoden warnen einmal und tun nichts.
local function stub(typeName, label, base)
  local obj = base or {}
  return setmetatable(obj, {
    __type = typeName,
    __index = function(_, key)
      if type(key) ~= 'string' then return nil end
      return function(self, ...)
        warnOnce(label .. ':' .. key, label .. ':' .. key .. '() wird nicht unterstützt und hat keine Wirkung.')
        local k = key:lower()
        if k:find('^set') or k:find('^add') or k:find('^remove') or k:find('^clear') or k:find('^reset') or k:find('^play') or k:find('^stop') then return self end
        if k:find('^is') or k:find('^has') or k:find('^can') or k:find('^should') then return false end
        return nil
      end
    end
  })
end

local function args3(x, y, z, default)
  if isVec(x) then return x[1] or default, x[2] or default, x[3] or default end
  if type(x) == 'table' then return x[1] or x.x or default, x[2] or x.y or default, x[3] or x.z or default end
  return x or default, y or default, z or default
end
local function args2(x, y, default)
  if isVec(x) or type(x) == 'table' then return x[1] or x.x or default, x[2] or x.y or default end
  return x or default, y or default
end
local function v3(t) return vec(t[1], t[2], t[3]) end

-- ---------------------------------------------------------------------------
-- Zustand der Spielfigur (kommt aus dem Tracking und der Oberfläche)

local state = {
  pitch = 0, yaw = 0, crouch = false, sprint = false, walk = false, sleep = false,
  health = 20, ticks = 0, delta = 0, lifeTime = 0
}
local avatarVars = {}

-- ---------------------------------------------------------------------------
-- ModelPart

local S = setmetatable({}, { __mode = 'k' })
local touched = {}
local allParts = {}
local Part = {}
local PartMeta = { __type = 'ModelPart' }
PartMeta.__index = function(self, key)
  local method = Part[key]
  if method ~= nil then return method end
  local st = S[self]
  return st and st.byName[key]
end
PartMeta.__tostring = function(self) return 'ModelPart(' .. S[self].name .. ')' end

local function newPart(info)
  local obj = setmetatable({}, PartMeta)
  local rot = info.rot or { 0, 0, 0 }
  local st = {
    obj = obj, idx = info.idx or 0, id = info.id, name = info.name or '', kind = info.kind or 'GROUP',
    parent = nil, children = {}, byName = {},
    defRot = { rot[1] or 0, rot[2] or 0, rot[3] or 0 }, rot = { rot[1] or 0, rot[2] or 0, rot[3] or 0 },
    pos = { 0, 0, 0 }, scale = { 1, 1, 1 }, offRot = { 0, 0, 0 }, offScale = { 1, 1, 1 },
    pivot = { table.unpack(info.pivot or { 0, 0, 0 }) }, offPivot = { 0, 0, 0 },
    visible = nil, defVisible = info.visible ~= false,
    uv = { 0, 0 }, uvSize = { info.uvw or 16, info.uvh or 16 },
    color = { 1, 1, 1 }, opacity = 1, light = nil, overlay = nil, tasks = {},
    parentType = info.parentType or 'NONE', vanilla = info.vanilla,
    touched = false
  }
  S[obj] = st
  return obj, st
end

local function addChild(parentSt, childObj)
  local childSt = S[childObj]
  childSt.parent = parentSt.obj
  parentSt.children[#parentSt.children + 1] = childObj
  if parentSt.byName[childSt.name] == nil then parentSt.byName[childSt.name] = childObj end
end

local function touch(st)
  if not st.touched then
    st.touched = true
    touched[#touched + 1] = st
  end
end

local function setter(field, default, uniform)
  return function(self, x, y, z)
    local st = S[self]
    if uniform and type(x) == 'number' and y == nil and z == nil then
      st[field] = { x, x, x }
    else
      local a, b, c = args3(x, y, z, default)
      st[field] = { a, b, c }
    end
    touch(st)
    return self
  end
end
local function getter(field)
  return function(self) return v3(S[self][field]) end
end

Part.setPos = setter('pos', 0)
Part.getPos = getter('pos')
Part.setRot = setter('rot', 0)
Part.getRot = getter('rot')
Part.setOffsetRot = setter('offRot', 0)
Part.getOffsetRot = getter('offRot')
Part.setScale = setter('scale', 1, true)
Part.getScale = getter('scale')
Part.setOffsetScale = setter('offScale', 1, true)
Part.getOffsetScale = getter('offScale')
function Part.setPivot(self, x, y, z)
  warnOnce('pivot', 'ModelPart:setPivot()/setOffsetPivot() verschiebt hier nur den gespeicherten Wert, nicht den Drehpunkt.')
  local st = S[self]
  st.pivot = { args3(x, y, z, 0) }
  return self
end
Part.getPivot = getter('pivot')
function Part.setOffsetPivot(self, x, y, z)
  warnOnce('pivot', 'ModelPart:setPivot()/setOffsetPivot() verschiebt hier nur den gespeicherten Wert, nicht den Drehpunkt.')
  S[self].offPivot = { args3(x, y, z, 0) }
  return self
end
Part.getOffsetPivot = getter('offPivot')
function Part.getAnimPos() return vec(0, 0, 0) end
function Part.getAnimRot() return vec(0, 0, 0) end
function Part.getAnimScale() return vec(1, 1, 1) end
function Part.getTruePos(self) return v3(S[self].pos) end
function Part.getTrueRot(self) local st = S[self] return v3(st.rot) + v3(st.offRot) end
function Part.getTrueScale(self) local st = S[self] return v3(st.scale) * v3(st.offScale) end
function Part.getTruePivot(self) local st = S[self] return v3(st.pivot) + v3(st.offPivot) end

function Part.setVisible(self, visible)
  local st = S[self]
  if visible == nil then st.visible = nil else st.visible = visible and true or false end
  touch(st)
  return self
end
function Part.getVisible(self)
  local st = S[self]
  if st.visible == nil then return st.defVisible end
  return st.visible
end

function Part.setUV(self, u, v)
  local st = S[self]
  local a, b = args2(u, v, 0)
  st.uv = { a * st.uvSize[1], b * st.uvSize[2] }
  touch(st)
  return self
end
function Part.getUV(self) local st = S[self] return vec(st.uv[1] / st.uvSize[1], st.uv[2] / st.uvSize[2]) end
function Part.setUVPixels(self, u, v)
  local st = S[self]
  st.uv = { args2(u, v, 0) }
  touch(st)
  return self
end
function Part.getUVPixels(self) local st = S[self] return vec(st.uv[1], st.uv[2]) end

local function stored(field, warnKey, warnText)
  return function(self, ...)
    if warnKey then warnOnce(warnKey, warnText) end
    local st = S[self]
    local n = select('#', ...)
    if n <= 1 then st[field] = (...) else st[field] = { ... } end
    return self
  end
end
local function read(field) return function(self) return S[self][field] end end
local LOOK = 'Farbe, Deckkraft, Licht und Render-Typen werden gespeichert, aber (noch) nicht dargestellt.'
Part.setColor = stored('color', 'look', LOOK)
Part.getColor = function(self) local c = S[self].color if type(c) == 'table' and not isVec(c) then return vec(c[1] or 1, c[2] or 1, c[3] or 1) end return c end
Part.setPrimaryColor = Part.setColor
Part.getPrimaryColor = Part.getColor
Part.setSecondaryColor = stored('secondaryColor', 'look', LOOK)
Part.getSecondaryColor = read('secondaryColor')
Part.setOpacity = stored('opacity', 'look', LOOK)
Part.getOpacity = read('opacity')
Part.setLight = stored('light', nil)
Part.getLight = read('light')
Part.setOverlay = stored('overlay', nil)
Part.getOverlay = read('overlay')
Part.setPrimaryTexture = stored('primaryTexture', 'texture', 'ModelPart:setPrimaryTexture()/setSecondaryTexture() wird (noch) nicht unterstützt.')
Part.getPrimaryTexture = read('primaryTexture')
Part.setSecondaryTexture = stored('secondaryTexture', 'texture', 'ModelPart:setPrimaryTexture()/setSecondaryTexture() wird (noch) nicht unterstützt.')
Part.getSecondaryTexture = read('secondaryTexture')
Part.setPrimaryRenderType = stored('primaryRenderType', 'look', LOOK)
Part.getPrimaryRenderType = read('primaryRenderType')
Part.setSecondaryRenderType = stored('secondaryRenderType', 'look', LOOK)
Part.getSecondaryRenderType = read('secondaryRenderType')
Part.setParentType = stored('parentType', 'parentType', 'ModelPart:setParentType() wird gespeichert, ändert hier aber nicht, woran das Teil hängt.')
Part.getParentType = read('parentType')
Part.setUVMatrix = stored('uvMatrix', 'uvMatrix', 'ModelPart:setUVMatrix() wird nicht unterstützt.')
Part.setMatrix = stored('matrix', 'matrix', 'ModelPart:setMatrix() wird nicht unterstützt.')
function Part.getPositionMatrix() return matrices.mat4() end
function Part.getNormalMatrix() return matrices.mat3() end
function Part.partToWorldMatrix() return matrices.mat4() end
function Part.getTextures() return {} end
function Part.getVertices() return {} end
function Part.setPreRender(self, fn) S[self].preRender = fn return self end
function Part.setMidRender(self, fn) S[self].midRender = fn return self end
function Part.setPostRender(self, fn) S[self].postRender = fn return self end
function Part.getName(self) return S[self].name end
function Part.getType(self) return S[self].kind end
function Part.getParent(self) return S[self].parent end
function Part.getChildren(self)
  local out = {}
  for i, c in ipairs(S[self].children) do out[i] = c end
  return out
end
function Part.isChildOf(self, other)
  local p = S[self].parent
  while p do
    if p == other then return true end
    p = S[p].parent
  end
  return false
end
function Part.moveTo(self) warnOnce('moveTo', 'ModelPart:moveTo() wird nicht unterstützt.') return self end
function Part.remove(self) return Part.setVisible(self, false) end
function Part.copy(self, name)
  warnOnce('copy', 'ModelPart:copy() erzeugt hier eine unsichtbare Kopie (wird nicht dargestellt).')
  local obj = newPart({ name = name or S[self].name, kind = S[self].kind })
  return obj
end
function Part.newPart(self, name)
  warnOnce('newPart', 'ModelPart:newPart() erzeugt hier eine unsichtbare Gruppe (wird nicht dargestellt).')
  local obj = newPart({ name = name, kind = 'GROUP' })
  addChild(S[self], obj)
  return obj
end

local function task(kind)
  return function(self, name)
    warnOnce('tasks', 'Render-Tasks (Text, Items, Blöcke, Sprites) werden nicht angezeigt.')
    local t = stub(kind, kind, { name = name })
    S[self].tasks[name or (#S[self].tasks + 1)] = t
    return t
  end
end
Part.newText = task('TextTask')
Part.newItem = task('ItemTask')
Part.newBlock = task('BlockTask')
Part.newSprite = task('SpriteTask')
Part.newEntity = task('EntityTask')
function Part.addTask(self, t) return t end
function Part.getTask(self, name) if name == nil then return S[self].tasks end return S[self].tasks[name] end
function Part.removeTask(self, name) if name then S[self].tasks[name] = nil else S[self].tasks = {} end return self end

-- Kurzformen wie in Figura (part:pos(…), part:rot(…) …)
for alias, target in pairs({
  pos = 'setPos', rot = 'setRot', scale = 'setScale', offsetRot = 'setOffsetRot', offsetScale = 'setOffsetScale',
  pivot = 'setPivot', offsetPivot = 'setOffsetPivot', visible = 'setVisible', color = 'setColor', primaryColor = 'setPrimaryColor',
  secondaryColor = 'setSecondaryColor', opacity = 'setOpacity', light = 'setLight', overlay = 'setOverlay',
  primaryTexture = 'setPrimaryTexture', secondaryTexture = 'setSecondaryTexture', primaryRenderType = 'setPrimaryRenderType',
  secondaryRenderType = 'setSecondaryRenderType', parentType = 'setParentType', uv = 'setUV', uvPixels = 'setUVPixels',
  uvMatrix = 'setUVMatrix', matrix = 'setMatrix', preRender = 'setPreRender', midRender = 'setMidRender', postRender = 'setPostRender'
}) do Part[alias] = Part[target] end

-- Teilebaum aus dem Modell
local byIndex = {}
local vanillaParts = {}
models = newPart({ name = 'models', kind = 'GROUP' })
local modelsSt = S[models]
for i, info in ipairs(setup.parts) do
  info.idx = i
  local obj, st = newPart(info)
  byIndex[i] = st
  allParts[#allParts + 1] = st
  if info.vanilla then
    vanillaParts[info.vanilla] = obj
  elseif info.parent and info.parent > 0 then
    addChild(byIndex[info.parent], obj)
  end
end
-- Modelle unter models.<pfad> (Unterordner werden zu Gruppen)
for _, m in ipairs(setup.models) do
  local parentSt = modelsSt
  local segments = {}
  for seg in tostring(m.path):gmatch('[^%.]+') do segments[#segments + 1] = seg end
  for i = 1, #segments - 1 do
    local seg = segments[i]
    local folder = parentSt.byName[seg]
    if not folder then
      folder = newPart({ name = seg, kind = 'GROUP' })
      addChild(parentSt, folder)
    end
    parentSt = S[folder]
  end
  local root = byIndex[m.root]
  root.name = segments[#segments] or m.path
  addChild(parentSt, root.obj)
end

-- ---------------------------------------------------------------------------
-- vanilla_model

local VANILLA_GROUPS = {
  HEAD = { 'head' }, BODY = { 'body' }, LEFT_ARM = { 'leftArm' }, RIGHT_ARM = { 'rightArm' }, LEFT_LEG = { 'leftLeg' }, RIGHT_LEG = { 'rightLeg' },
  HAT = { 'hat' }, JACKET = { 'jacket' }, LEFT_SLEEVE = { 'leftSleeve' }, RIGHT_SLEEVE = { 'rightSleeve' }, LEFT_PANTS = { 'leftPants' }, RIGHT_PANTS = { 'rightPants' },
  INNER_LAYER = { 'head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg' },
  OUTER_LAYER = { 'hat', 'jacket', 'leftSleeve', 'rightSleeve', 'leftPants', 'rightPants' },
}
VANILLA_GROUPS.PLAYER = {}
for _, id in ipairs(VANILLA_GROUPS.INNER_LAYER) do table.insert(VANILLA_GROUPS.PLAYER, id) end
for _, id in ipairs(VANILLA_GROUPS.OUTER_LAYER) do table.insert(VANILLA_GROUPS.PLAYER, id) end
VANILLA_GROUPS.ALL = VANILLA_GROUPS.PLAYER

local VGroup = {}
local VGroupMeta = { __type = 'VanillaGroupPart', __index = function(_, k) return VGroup[k] end }
local function members(self) return rawget(self, '__members') end
function VGroup.setVisible(self, v) for _, p in ipairs(members(self)) do Part.setVisible(p, v) end return self end
function VGroup.getVisible(self)
  local m = members(self)
  if #m == 0 then return true end
  for _, p in ipairs(m) do if not Part.getVisible(p) then return false end end
  return true
end
for _, name in ipairs({ 'setRot', 'setPos', 'setOffsetRot', 'setScale', 'setOffsetScale' }) do
  VGroup[name] = function(self, ...) for _, p in ipairs(members(self)) do Part[name](p, ...) end return self end
end
VGroup.visible = VGroup.setVisible
VGroup.rot = VGroup.setRot
VGroup.pos = VGroup.setPos
function VGroup.getRot(self) local m = members(self)[1] return m and Part.getRot(m) or vec(0, 0, 0) end
function VGroup.getPos(self) local m = members(self)[1] return m and Part.getPos(m) or vec(0, 0, 0) end
function VGroup.getOriginRot(self)
  if members(self)[1] == vanillaParts.head then return vec(state.pitch, state.yaw, 0) end
  return vec(0, 0, 0)
end
function VGroup.getOriginPos() return vec(0, 0, 0) end
function VGroup.getOriginScale() return vec(1, 1, 1) end
function VGroup.getOriginVisible() return true end
function VGroup.getChildren(self) return { table.unpack(members(self)) } end
function VGroup.getChildrenCount(self) return #members(self) end

vanilla_model = setmetatable({}, {
  __type = 'VanillaModelAPI',
  __index = function(t, key)
    if type(key) ~= 'string' then return nil end
    local ids = VANILLA_GROUPS[key]
    local list = {}
    for _, id in ipairs(ids or {}) do if vanillaParts[id] then list[#list + 1] = vanillaParts[id] end end
    -- Unbekannte Gruppen (Rüstung, Items, Umhang …) gibt es hier nicht: leere Gruppe ohne Wirkung.
    local g = setmetatable({ __members = list }, VGroupMeta)
    rawset(t, key, g)
    return g
  end
})

-- ---------------------------------------------------------------------------
-- events

local eventHandlers = {}
local Event = {}
local EventMeta = { __type = 'Event' }
EventMeta.__index = Event
EventMeta.__len = function(self) return #eventHandlers[rawget(self, '__name')] end
local eventObjects = {}
local function eventObject(name)
  name = name:upper()
  if not eventObjects[name] then
    eventHandlers[name] = eventHandlers[name] or {}
    eventObjects[name] = setmetatable({ __name = name }, EventMeta)
  end
  return eventObjects[name]
end
function Event.register(self, fn, name)
  if type(fn) ~= 'function' then error('events:register erwartet eine Funktion', 2) end
  local list = eventHandlers[rawget(self, '__name')]
  list[#list + 1] = { fn = fn, name = name }
  return self
end
function Event.remove(self, what)
  local list = eventHandlers[rawget(self, '__name')]
  local removed = 0
  for i = #list, 1, -1 do
    if list[i].fn == what or (what ~= nil and list[i].name == what) then table.remove(list, i) removed = removed + 1 end
  end
  return removed
end
function Event.clear(self) eventHandlers[rawget(self, '__name')] = {} return self end
function Event.getRegisteredCount(self, name)
  local list = eventHandlers[rawget(self, '__name')]
  if name == nil then return #list end
  local n = 0
  for _, h in ipairs(list) do if h.name == name then n = n + 1 end end
  return n
end

events = setmetatable({}, {
  __type = 'EventsAPI',
  __index = function(_, key)
    if type(key) ~= 'string' then return nil end
    if key == 'getEvents' then return function() local out = {} for k, v in pairs(eventObjects) do out[k] = v end return out end end
    return eventObject(key)
  end,
  __newindex = function(_, key, fn)
    if type(fn) == 'function' then Event.register(eventObject(key), fn) end
  end
})

--- Ruft alle Funktionen eines Ereignisses auf; true, wenn eine davon true zurückgibt (abbrechen).
local function fire(name, ...)
  local list = eventHandlers[name]
  if not list or #list == 0 then return false end
  local cancel = false
  for _, h in ipairs({ table.unpack(list) }) do
    if h.fn(...) == true then cancel = true end
  end
  return cancel
end

-- ---------------------------------------------------------------------------
-- pings (werden lokal sofort ausgeführt)

local pingHandlers = {}
pings = setmetatable({}, {
  __type = 'PingAPI',
  __newindex = function(_, key, fn) pingHandlers[key] = fn end,
  __index = function(_, key)
    local fn = pingHandlers[key]
    if not fn then return nil end
    return function(...) return fn(...) end
  end
})

-- ---------------------------------------------------------------------------
-- animations

local Anim = {}
local AnimMeta = { __type = 'Animation' }
AnimMeta.__index = function(self, key) return Anim[key] end
AnimMeta.__tostring = function(self) return 'Animation(' .. rawget(self, '__name') .. ')' end
local function call(self, cmd, arg) return js.anim(cmd, rawget(self, '__id'), arg) end
function Anim.play(self) call(self, 'play') return self end
function Anim.stop(self) call(self, 'stop') return self end
function Anim.pause(self) call(self, 'pause') return self end
function Anim.restart(self) call(self, 'restart') return self end
function Anim.setPlaying(self, playing) if playing then Anim.play(self) else Anim.stop(self) end return self end
function Anim.getPlayState(self) return call(self, 'state') end
function Anim.isPlaying(self) return call(self, 'state') == 'PLAYING' end
function Anim.isPaused(self) return call(self, 'state') == 'PAUSED' end
function Anim.isStopped(self) return call(self, 'state') == 'STOPPED' end
function Anim.setSpeed(self, v) call(self, 'speed', v or 1) return self end
function Anim.getSpeed(self) return call(self, 'getSpeed') end
function Anim.setLoop(self, v) call(self, 'loop', tostring(v or 'ONCE'):lower()) return self end
function Anim.getLoop(self) return tostring(call(self, 'getLoop')):upper() end
function Anim.setBlend(self, v) call(self, 'blend', v or 1) return self end
function Anim.getBlend(self) return call(self, 'getBlend') end
function Anim.setTime(self, v) call(self, 'time', v or 0) return self end
function Anim.getTime(self) return call(self, 'getTime') end
function Anim.setOverride(self, v) call(self, 'override', v and true or false) return self end
function Anim.getOverride(self) return call(self, 'getOverride') end
function Anim.getLength(self) return call(self, 'getLength') end
function Anim.getName(self) return rawget(self, '__name') end
function Anim.setPriority(self, v) rawset(self, '__priority', v) return self end
function Anim.getPriority(self) return rawget(self, '__priority') or 0 end
for _, name in ipairs({ 'setLength', 'setOffset', 'setStartDelay', 'setLoopDelay', 'setOverrideRot', 'setOverridePos', 'setOverrideScale', 'newCode' }) do
  Anim[name] = function(self)
    warnOnce('anim:' .. name, 'Animation:' .. name .. '() wird nicht unterstützt.')
    return self
  end
end
function Anim.getOffset() return 0 end
function Anim.getStartDelay() return 0 end
function Anim.getLoopDelay() return 0 end
for alias, target in pairs({ playing = 'setPlaying', speed = 'setSpeed', loop = 'setLoop', blend = 'setBlend', time = 'setTime', override = 'setOverride', priority = 'setPriority', length = 'setLength', offset = 'setOffset', startDelay = 'setStartDelay', loopDelay = 'setLoopDelay' }) do
  Anim[alias] = Anim[target]
end

animations = setmetatable({}, { __type = 'AnimationAPI' })
local animList = {}
for _, a in ipairs(setup.animations) do
  local obj = setmetatable({ __id = a.id, __name = a.name }, AnimMeta)
  animList[#animList + 1] = obj
  local group = rawget(animations, a.model)
  if not group then
    group = {}
    rawset(animations, a.model, group)
  end
  group[a.name] = obj
end
rawset(animations, 'getAnimations', function() return { table.unpack(animList) } end)
rawset(animations, 'getPlaying', function()
  local out = {}
  for _, a in ipairs(animList) do if Anim.isPlaying(a) then out[#out + 1] = a end end
  return out
end)
rawset(animations, 'stopAll', function() for _, a in ipairs(animList) do Anim.stop(a) end return animations end)

-- ---------------------------------------------------------------------------
-- keybinds

local VANILLA_KEYS = {
  ['key.jump'] = 'key.keyboard.space', ['key.sneak'] = 'key.keyboard.left.shift', ['key.sprint'] = 'key.keyboard.left.control',
  ['key.forward'] = 'key.keyboard.w', ['key.back'] = 'key.keyboard.s', ['key.left'] = 'key.keyboard.a', ['key.right'] = 'key.keyboard.d',
  ['key.inventory'] = 'key.keyboard.e', ['key.drop'] = 'key.keyboard.q', ['key.chat'] = 'key.keyboard.t', ['key.command'] = 'key.keyboard.slash',
  ['key.swapOffhand'] = 'key.keyboard.f', ['key.playerlist'] = 'key.keyboard.tab', ['key.attack'] = 'key.mouse.left', ['key.use'] = 'key.mouse.right',
  ['key.pickItem'] = 'key.mouse.middle', ['key.togglePerspective'] = 'key.keyboard.f5', ['key.screenshot'] = 'key.keyboard.f2',
  ['figura.config.action_wheel_button'] = 'key.keyboard.b'
}
local keybindList = {}
local Keybind = {}
local KeybindMeta = { __type = 'Keybind' }
KeybindMeta.__index = function(self, key) return Keybind[key] end
local function newKeybind(name, key, gui)
  local kb = setmetatable({ __name = tostring(name or ''), __key = key or 'key.keyboard.unknown', __default = key, __enabled = true, __pressed = false, __gui = gui and true or false }, KeybindMeta)
  keybindList[#keybindList + 1] = kb
  return kb
end
function Keybind.setOnPress(self, fn) rawset(self, 'press', fn) return self end
function Keybind.setOnRelease(self, fn) rawset(self, 'release', fn) return self end
Keybind.onPress = Keybind.setOnPress
Keybind.onRelease = Keybind.setOnRelease
function Keybind.isPressed(self) return rawget(self, '__pressed') end
function Keybind.getKey(self) return rawget(self, '__key') end
function Keybind.setKey(self, key) rawset(self, '__key', key) return self end
Keybind.key = Keybind.setKey
function Keybind.getKeyName(self) return (rawget(self, '__key'):gsub('^key%.keyboard%.', ''):upper()) end
function Keybind.getName(self) return rawget(self, '__name') end
function Keybind.getID(self) return rawget(self, '__key') end
function Keybind.isDefault(self) return rawget(self, '__key') == rawget(self, '__default') end
function Keybind.setEnabled(self, v) rawset(self, '__enabled', v and true or false) return self end
Keybind.enabled = Keybind.setEnabled
function Keybind.isEnabled(self) return rawget(self, '__enabled') end
function Keybind.setGUI(self, v) rawset(self, '__gui', v and true or false) return self end
Keybind.gui = Keybind.setGUI
function Keybind.isGuiEnabled(self) return rawget(self, '__gui') end

keybinds = setmetatable({}, { __type = 'KeybindAPI' })
function keybinds.newKeybind(_, name, key, gui) return newKeybind(name, key, gui) end
function keybinds.of(_, name, key, gui) return newKeybind(name, key, gui) end
function keybinds.fromVanilla(_, id) return newKeybind(id, VANILLA_KEYS[id] or 'key.keyboard.unknown', false) end
function keybinds.getVanillaKey(_, id) return VANILLA_KEYS[id] end
function keybinds.getKeybinds() local out = {} for _, kb in ipairs(keybindList) do out[rawget(kb, '__name')] = kb end return out end

-- ---------------------------------------------------------------------------
-- action_wheel

local Action = {}
local ActionMeta = { __type = 'Action' }
ActionMeta.__index = function(self, key) return Action[key] end
local function newAction()
  return setmetatable({ __title = '', __toggled = false }, ActionMeta)
end
local function field(name)
  return function(self, v) rawset(self, name, v) return self end
end
local function getField(name) return function(self) return rawget(self, name) end end
Action.setTitle = field('__title')
Action.getTitle = getField('__title')
Action.setToggleTitle = field('__toggleTitle')
Action.getToggleTitle = getField('__toggleTitle')
Action.setItem = field('__item')
Action.setToggleItem = field('__toggleItem')
Action.setHoverItem = field('__hoverItem')
Action.setColor = function(self, r, g, b) rawset(self, '__color', isVec(r) and r or (r and vec(r, g, b))) return self end
Action.getColor = getField('__color')
Action.setHoverColor = function(self, r, g, b) rawset(self, '__hoverColor', isVec(r) and r or (r and vec(r, g, b))) return self end
Action.getHoverColor = getField('__hoverColor')
Action.setToggleColor = function(self, r, g, b) rawset(self, '__toggleColor', isVec(r) and r or (r and vec(r, g, b))) return self end
Action.getToggleColor = getField('__toggleColor')
Action.setTexture = function(self) warnOnce('actionTexture', 'Action:setTexture() wird nicht angezeigt (nur Titel und Item-Name).') return self end
Action.setHoverTexture = Action.setTexture
Action.setToggleTexture = Action.setTexture
Action.setToggled = function(self, v) rawset(self, '__toggled', v and true or false) return self end
Action.isToggled = getField('__toggled')
Action.setOnLeftClick = function(self, fn) rawset(self, 'leftClick', fn) return self end
Action.setOnRightClick = function(self, fn) rawset(self, 'rightClick', fn) return self end
Action.setOnToggle = function(self, fn) rawset(self, 'toggle', fn) return self end
Action.setOnUntoggle = function(self, fn) rawset(self, 'untoggle', fn) return self end
Action.setOnScroll = function(self, fn) rawset(self, 'scroll', fn) return self end
for alias, target in pairs({
  title = 'setTitle', toggleTitle = 'setToggleTitle', item = 'setItem', toggleItem = 'setToggleItem', hoverItem = 'setHoverItem',
  color = 'setColor', hoverColor = 'setHoverColor', toggleColor = 'setToggleColor', texture = 'setTexture', hoverTexture = 'setHoverTexture',
  toggleTexture = 'setToggleTexture', toggled = 'setToggled', onLeftClick = 'setOnLeftClick', onRightClick = 'setOnRightClick',
  onToggle = 'setOnToggle', onUntoggle = 'setOnUntoggle', onScroll = 'setOnScroll'
}) do Action[alias] = Action[target] end

local Page = {}
local PageMeta = { __type = 'Page' }
PageMeta.__index = function(self, key) return Page[key] end
local pages = {}
local currentPage = nil
local function newPage(title)
  local p = setmetatable({ __title = title, __actions = {}, __shift = 1, __keep = true }, PageMeta)
  if title then pages[title] = p end
  return p
end
function Page.newAction(self, index)
  local a = newAction()
  local list = rawget(self, '__actions')
  index = index or (#list + 1)
  list[index] = a
  return a
end
function Page.getAction(self, i) return rawget(self, '__actions')[i] end
function Page.setAction(self, i, a)
  local list = rawget(self, '__actions')
  if i == -1 then i = #list + 1 end
  list[i] = a
  return self
end
function Page.getActions(self) return { table.unpack(rawget(self, '__actions')) } end
function Page.getTitle(self) return rawget(self, '__title') end
function Page.setKeepSlots(self, v) rawset(self, '__keep', v) return self end
function Page.shouldKeepSlots(self) return rawget(self, '__keep') end
function Page.setSlotsShift(self, v) rawset(self, '__shift', v) return self end
function Page.getSlotsShift(self) return rawget(self, '__shift') end
Page.keepSlots = Page.setKeepSlots
Page.slotsShift = Page.setSlotsShift

action_wheel = setmetatable({}, { __type = 'ActionWheelAPI' })
function action_wheel.newPage(_, title) return newPage(title) end
function action_wheel.newAction() return newAction() end
function action_wheel.setPage(_, page)
  if type(page) == 'string' then page = pages[page] end
  currentPage = page
  return action_wheel
end
function action_wheel.getCurrentPage() return currentPage end
function action_wheel.getPage(_, title) if title == nil then return pages end return pages[title] end
function action_wheel.isEnabled() return false end
function action_wheel.getSelected() return 0 end
function action_wheel.getSelectedAction() return nil end
function action_wheel.execute(_, index, right)
  vt.wheelClick(index or 1, right and true or false)
  return action_wheel
end

local function clickAction(a, right)
  if not a then return end
  if right then
    local fn = rawget(a, 'rightClick')
    if fn then fn(a) end
    return
  end
  local toggle, untoggle = rawget(a, 'toggle'), rawget(a, 'untoggle')
  if toggle or untoggle then
    local on = not rawget(a, '__toggled')
    rawset(a, '__toggled', on)
    if on then
      if toggle then toggle(true, a) end
    else
      local fn = untoggle or toggle
      if fn then fn(false, a) end
    end
    return
  end
  local fn = rawget(a, 'leftClick')
  if fn then fn(a) end
end

-- ---------------------------------------------------------------------------
-- config (gespeichert pro Avatar)

local configData = {}
if type(setup.configJson) == 'string' and setup.configJson ~= '' then
  local ok, data = rawpcall(decode, setup.configJson)
  if ok and type(data) == 'table' then configData = data end
end
local configName = setup.avatar.name or 'avatar'
config = setmetatable({}, { __type = 'ConfigAPI' })
function config.setName(_, name) configName = tostring(name) return config end
config.name = config.setName
function config.getName() return configName end
function config.save(_, key, value)
  configData[configName] = configData[configName] or {}
  configData[configName][tostring(key)] = value
  js.configSave(encode(configData))
  return config
end
function config.load(_, key)
  local data = configData[configName]
  if key == nil then return data or {} end
  return data and data[tostring(key)]
end

-- ---------------------------------------------------------------------------
-- Spielwelt-Attrappen: host, player, world, client, renderer, nameplate …

local function itemStub()
  return stub('ItemStack', 'ItemStack', {
    id = 'minecraft:air', count = 0, tag = {},
    getID = function() return 'minecraft:air' end, getCount = function() return 0 end, getName = function() return 'Luft' end,
    isEmpty = function() return true end, getUseAction = function() return 'NONE' end, getTag = function() return {} end,
    toStackString = function() return 'minecraft:air' end, getRarity = function() return 'COMMON' end,
    getDamage = function() return 0 end, getMaxDamage = function() return 0 end, getMaxCount = function() return 64 end,
    isBlockItem = function() return false end, isFood = function() return false end, isEnchantable = function() return false end
  })
end

host = stub('HostAPI', 'host', {
  isHost = function() return true end,
  isCursorUnlocked = function() return false end,
  getScreen = function() return nil end,
  isChatOpen = function() return false end,
  getChatText = function() return '' end,
  isFlying = function() return false end,
  isJumping = function() return false end,
  getReachDistance = function() return 4.5 end,
  getAttackCharge = function() return 1 end,
  getStatusEffects = function() return {} end,
  getSlot = function() return itemStub() end,
  getClipboard = function() return '' end,
  isAvatarUploaded = function() return false end,
  setActionbar = function(self, text) print('[Aktionsleiste] ' .. tostring(text)) return self end,
  setTitle = function(self, text) print('[Titel] ' .. tostring(text)) return self end,
  setSubtitle = function(self, text) print('[Untertitel] ' .. tostring(text)) return self end,
  sendChatMessage = function(self, text) warnOnce('chat', 'host:sendChatMessage()/sendChatCommand(): Es wird nichts gesendet.') print('[Chat] ' .. tostring(text)) return self end,
  sendChatCommand = function(self, text) warnOnce('chat', 'host:sendChatMessage()/sendChatCommand(): Es wird nichts gesendet.') return self end,
  setClipboard = function(self) warnOnce('clipboard', 'host:setClipboard() ist aus Sicherheitsgründen deaktiviert.') return self end
})

local function pose()
  if state.sleep then return 'SLEEPING' end
  if state.crouch then return 'CROUCHING' end
  return 'STANDING'
end

player = stub('PlayerAPI', 'player', {
  getName = function() return setup.playerName or 'Spieler' end,
  getUUID = function() return '00000000-0000-0000-0000-000000000000' end,
  getType = function() return 'minecraft:player' end,
  isLoaded = function() return true end,
  isAlive = function() return state.health > 0 end,
  getPos = function() return vec(0, 64, 0) end,
  getVelocity = function()
    if state.sprint then return vec(0.28, 0, 0) end
    if state.walk then return vec(0.1, 0, 0) end
    return vec(0, 0, 0)
  end,
  getRot = function() return vec(state.pitch, state.yaw) end,
  getHeadYaw = function() return state.yaw end,
  getBodyYaw = function() return 0 end,
  getLookDir = function() return vectors.angleToDir(state.pitch, state.yaw) end,
  getEyeHeight = function() return state.crouch and 1.27 or 1.62 end,
  getEyePos = function() return vec(0, 64 + (state.crouch and 1.27 or 1.62), 0) end,
  getBoundingBox = function() return vec(0.6, state.crouch and 1.5 or 1.8, 0.6) end,
  getPose = pose,
  isCrouching = function() return state.crouch end,
  isSneaking = function() return state.crouch end,
  isSprinting = function() return state.sprint end,
  isMoving = function() return state.sprint or state.walk end,
  isOnGround = function() return true end,
  isInWater = function() return false end,
  isUnderwater = function() return false end,
  isInLava = function() return false end,
  isWet = function() return false end,
  isOnFire = function() return false end,
  isInRain = function() return false end,
  isGlowing = function() return false end,
  isInvisible = function() return false end,
  isSilent = function() return false end,
  isFlying = function() return false end,
  isGliding = function() return false end,
  isSwimming = function() return false end,
  isClimbing = function() return false end,
  isVisuallySwimming = function() return false end,
  isSleeping = function() return state.sleep end,
  isUsingItem = function() return false end,
  isBlocking = function() return false end,
  isSwingingArm = function() return false end,
  isLeftHanded = function() return false end,
  isCreative = function() return false end,
  hasAvatar = function() return true end,
  isSkinLayerVisible = function() return true end,
  getHealth = function() return state.health end,
  getMaxHealth = function() return 20 end,
  getArmor = function() return 0 end,
  getFood = function() return 20 end,
  getSaturation = function() return 5 end,
  getExhaustion = function() return 0 end,
  getAir = function() return 300 end,
  getMaxAir = function() return 300 end,
  getExperienceLevel = function() return 0 end,
  getExperienceProgress = function() return 0 end,
  getGamemode = function() return 'SURVIVAL' end,
  getActiveItem = function() return itemStub() end,
  getHeldItem = function() return itemStub() end,
  getItem = function() return itemStub() end,
  getActiveHand = function() return 'MAIN_HAND' end,
  getSwingTime = function() return 0 end,
  getSwingArm = function() return nil end,
  getActiveItemTime = function() return 0 end,
  getVehicle = function() return nil end,
  getPassengers = function() return {} end,
  getNbt = function() return {} end,
  getStatusEffects = function() return {} end,
  getDimensionName = function() return 'minecraft:overworld' end,
  getFrozenTicks = function() return 0 end,
  getDeathTime = function() return state.health > 0 and 0 or 1 end,
  getStuckArrowCount = function() return 0 end,
  getModelType = function() return setup.modelType or 'DEFAULT' end,
  getVariable = function(_, key) if key == nil then return avatarVars end return avatarVars[key] end,
  getTargetedBlock = function() return nil end,
  getTargetedEntity = function() return nil end,
  getCooldownPercent = function() return 0 end,
  getChargedAttackDelay = function() return 0 end,
  getPermissionLevel = function() return 0 end,
  getShoulderEntity = function() return nil end,
  getTeamInfo = function() return nil end
})
user = player

world = stub('WorldAPI', 'world', {
  exists = function() return true end,
  getTime = function(_, delta) return state.ticks + (delta or 0) end,
  getTimeOfDay = function(_, delta) return 6000 + state.ticks + (delta or 0) end,
  getDayTime = function(_, delta) return (6000 + state.ticks + (delta or 0)) % 24000 end,
  getDay = function() return math.floor((6000 + state.ticks) / 24000) end,
  getMoonPhase = function() return 0 end,
  getDimension = function() return 'minecraft:overworld' end,
  isRaining = function() return false end,
  isThundering = function() return false end,
  getRainGradient = function() return 0 end,
  getLightLevel = function() return 15 end,
  getSkyLightLevel = function() return 15 end,
  getBlockLightLevel = function() return 0 end,
  isOpenSky = function() return true end,
  getHeight = function() return 64 end,
  getBuildHeight = function() return 320 end,
  getSpawnPoint = function() return vec(0, 64, 0) end,
  getPlayers = function() return { [setup.playerName or 'Spieler'] = player } end,
  getEntity = function() return nil end,
  avatarVars = function() return { [player:getUUID()] = avatarVars } end,
  getBlockState = function()
    return stub('BlockState', 'BlockState', {
      id = 'minecraft:air', properties = {},
      getID = function() return 'minecraft:air' end, isAir = function() return true end, isSolidBlock = function() return false end,
      isOpaque = function() return false end, hasCollision = function() return false end, getProperties = function() return {} end
    })
  end,
  getBiome = function()
    return stub('Biome', 'Biome', {
      id = 'minecraft:plains', getID = function() return 'minecraft:plains' end, getTemperature = function() return 0.8 end,
      getPrecipitation = function() return 'RAIN' end, isHot = function() return false end, isCold = function() return false end
    })
  end
})

client = stub('ClientAPI', 'client', {
  getSystemTime = function() return js.now() end,
  getFPS = function() return 60 end,
  getFPSString = function() return '60 fps' end,
  isPaused = function() return false end,
  getVersion = function() return '1.21.1' end,
  getVersionName = function() return '1.21.1' end,
  getClientBrand = function() return 'fabric' end,
  getServerBrand = function() return 'Minecraft VTuber' end,
  getScaledWindowSize = function() return vec(960, 540) end,
  getWindowSize = function() return vec(1920, 1080) end,
  getGuiScale = function() return 2 end,
  getMousePos = function() return vec(0, 0) end,
  isWindowFocused = function() return true end,
  isHudEnabled = function() return true end,
  isDebugOverlayEnabled = function() return false end,
  getCameraPos = function() return vec(0, 65.62, 3) end,
  getCameraRot = function() return vec(0, 180, 0) end,
  getCameraDir = function() return vec(0, 0, -1) end,
  getViewer = function() return player end,
  getCameraEntity = function() return player end,
  getFrameTime = function() return state.delta end,
  getActiveLang = function() return 'de_de' end,
  isModLoaded = function() return false end,
  hasShaderPack = function() return false end,
  hasIris = function() return false end,
  getShaderPackName = function() return '' end,
  getJavaVersion = function() return '21' end,
  isSingleplayer = function() return true end,
  getTextWidth = function(_, text) return #tostring(text or '') * 6 end,
  getTextHeight = function() return 9 end,
  getDate = function() return os.date('*t') end,
  getTabList = function() return {} end
})

renderer = stub('RendererAPI', 'renderer', {
  isFirstPerson = function() return false end,
  isCameraBackwards = function() return false end,
  getShadowRadius = function() return 0.5 end
})

nameplate = { ALL = stub('NameplateGroup', 'nameplate'), CHAT = stub('NameplateCustomization', 'nameplate'), ENTITY = stub('EntityNameplateCustomization', 'nameplate'), LIST = stub('NameplateCustomization', 'nameplate') }

local function soundStub() return stub('Sound', 'sound') end
sounds = setmetatable({}, {
  __type = 'SoundAPI',
  __index = function(_, key)
    if key == 'playSound' then return function() warnOnce('sounds', 'Sounds werden nicht abgespielt.') return soundStub() end end
    if key == 'isPresent' then return function() return false end end
    if key == 'getCustomSounds' then return function() return {} end end
    if key == 'stopSound' or key == 'newSound' then return function() return soundStub() end end
    warnOnce('sounds', 'Sounds werden nicht abgespielt.')
    return soundStub()
  end
})
particles = setmetatable({}, {
  __type = 'ParticleAPI',
  __index = function(_, key)
    if key == 'newParticle' or key == 'addParticle' then return function() warnOnce('particles', 'Partikel werden nicht angezeigt.') return stub('Particle', 'particle') end end
    if key == 'removeParticles' then return function() return particles end end
    if key == 'isPresent' then return function() return false end end
    warnOnce('particles', 'Partikel werden nicht angezeigt.')
    return stub('Particle', 'particle')
  end
})
local function textureStub(name)
  return stub('Texture', 'texture', {
    getName = function() return name end,
    getDimensions = function() return vec(64, 64) end,
    getPixel = function() return vec(0, 0, 0, 0) end,
    setPixel = function(self) warnOnce('textures', 'Texturen per Lua bearbeiten wird nicht unterstützt.') return self end,
    update = function(self) return self end
  })
end
textures = setmetatable({}, {
  __type = 'TextureAPI',
  __index = function(_, key)
    if key == 'newTexture' or key == 'read' or key == 'copy' or key == 'fromVanilla' then return function(_, name) return textureStub(name) end end
    if key == 'getTextures' then return function() return {} end end
    return textureStub(key)
  end
})

avatar = stub('AvatarAPI', 'avatar', {
  getName = function() return setup.avatar.name end,
  getEntityName = function() return setup.playerName or 'Spieler' end,
  getAuthors = function() return setup.avatar.authors or '' end,
  getColor = function() return setup.avatar.color end,
  setColor = function(self, c) setup.avatar.color = c return self end,
  getVersion = function() return '0.1.5' end,
  getSize = function() return 0 end,
  getComplexity = function() return 0 end,
  getUUID = function() return player:getUUID() end,
  isLoaded = function() return true end,
  hasTexture = function() return true end,
  hasScriptError = function() return false end,
  getPermissionLevel = function() return 'MAX' end,
  canEditVanillaModel = function() return true end,
  canEditNameplate = function() return true end,
  canRenderOffscreen = function() return true end,
  canUseCustomSounds = function() return false end,
  canHaveCustomSkull = function() return false end,
  store = function(self, key, value) avatarVars[key] = value return self end,
  getNBT = function() return {} end,
  getCurrentInstructions = function() return js.instructions() end,
  getMaxInstructions = function() return 0 end,
  getMaxTickCount = function() return 0 end,
  getMaxRenderCount = function() return 0 end,
  getRemainingParticles = function() return 0 end,
  getRemainingSounds = function() return 0 end
})

-- Erweiterung der VTuber-App (nicht in Figura)
vtuber = {
  isChibi = function() return js.chibi() == true end,
  isApp = function() return true end
}

json = stub('JsonAPI', 'json')
data = stub('DataAPI', 'data')
raycast = stub('RaycastAPI', 'raycast')
figuraMetatables = {}

-- ---------------------------------------------------------------------------
-- Skripte: require und listFiles

local scripts = setup.scripts or {}
local scriptPaths = {}
for path in pairs(scripts) do scriptPaths[#scriptPaths + 1] = path end
table.sort(scriptPaths)
local loaded, loading = {}, {}

local function normalize(name, from)
  name = tostring(name):gsub('\\', '/'):gsub('%.lua$', '')
  local candidates = {}
  if name:find('^%.%.?/') and from then
    local dir = from:match('^(.*)/[^/]*$') or ''
    local parts = {}
    for seg in (dir .. '/' .. name):gmatch('[^/]+') do
      if seg == '..' then table.remove(parts) elseif seg ~= '.' then parts[#parts + 1] = seg end
    end
    candidates[#candidates + 1] = table.concat(parts, '/')
  end
  candidates[#candidates + 1] = name
  candidates[#candidates + 1] = (name:gsub('%.', '/'))
  return candidates
end

local currentScript = nil
local function runScript(path)
  if loaded[path] ~= nil then return loaded[path] end
  if loading[path] then error('require: Schleife beim Laden von „' .. path .. '“', 3) end
  loading[path] = true
  local chunk, err = load(scripts[path], '=' .. path .. '.lua', 't', _ENV)
  if not chunk then loading[path] = nil error(err, 0) end
  local previous = currentScript
  currentScript = path
  local result = chunk(path:gsub('/', '.'), path)
  currentScript = previous
  loading[path] = nil
  if result == nil then result = true end
  loaded[path] = result
  return result
end

function require(name)
  for _, candidate in ipairs(normalize(name, currentScript)) do
    if scripts[candidate] then return runScript(candidate) end
  end
  error('require: Skript „' .. tostring(name) .. '“ nicht gefunden', 2)
end

function listFiles(folder, subfolders)
  local prefix = folder and tostring(folder):gsub('[%./\\]', '/') or ''
  if prefix ~= '' and not prefix:find('/$') then prefix = prefix .. '/' end
  local out = {}
  for _, path in ipairs(scriptPaths) do
    if path:sub(1, #prefix) == prefix then
      local rest = path:sub(#prefix + 1)
      if subfolders or not rest:find('/') then out[#out + 1] = (path:gsub('/', '.')) end
    end
  end
  return out
end

-- ---------------------------------------------------------------------------
-- Einstiegspunkte für JavaScript

function vt.init()
  guard(function()
    local list = setup.autoScripts
    if type(list) ~= 'table' or #list == 0 then list = scriptPaths end
    for _, name in ipairs(list) do
      local found = false
      for _, candidate in ipairs(normalize(name)) do
        if scripts[candidate] then runScript(candidate) found = true break end
      end
      if not found then warnOnce('auto:' .. tostring(name), 'autoScripts: Skript „' .. tostring(name) .. '“ nicht gefunden.') end
    end
    fire('ENTITY_INIT')
  end)
end

function vt.state(pitch, yaw, crouch, sprint, walk, sleep, health)
  state.pitch, state.yaw = pitch, yaw
  state.crouch, state.sprint, state.walk, state.sleep = crouch, sprint, walk, sleep
  state.health = health
end

function vt.tick()
  state.ticks = state.ticks + 1
  guard(function()
    fire('WORLD_TICK')
    fire('TICK')
  end)
end

function vt.render(delta)
  state.delta = delta
  guard(function()
    for _, st in ipairs(allParts) do
      if st.preRender then st.preRender(delta, 'RENDER', st.obj) end
    end
    fire('WORLD_RENDER', delta)
    fire('RENDER', delta, 'RENDER', matrices.mat4())
    fire('POST_RENDER', delta, 'RENDER', matrices.mat4())
    fire('POST_WORLD_RENDER', delta)
    for _, st in ipairs(allParts) do
      if st.postRender then st.postRender(delta, 'RENDER', st.obj) end
    end
  end)
end

--- Veränderte Teile als flache Zahlenliste (13 Werte pro Teil, durch Komma getrennt).
function vt.collect()
  local out = {}
  for _, st in ipairs(touched) do
    if st.idx > 0 then
      local v = st.visible
      local n = #out
      out[n + 1] = st.idx
      out[n + 2] = st.rot[1] - st.defRot[1] + st.offRot[1]
      out[n + 3] = st.rot[2] - st.defRot[2] + st.offRot[2]
      out[n + 4] = st.rot[3] - st.defRot[3] + st.offRot[3]
      out[n + 5] = st.pos[1]
      out[n + 6] = st.pos[2]
      out[n + 7] = st.pos[3]
      out[n + 8] = st.scale[1] * st.offScale[1]
      out[n + 9] = st.scale[2] * st.offScale[2]
      out[n + 10] = st.scale[3] * st.offScale[3]
      out[n + 11] = v == nil and -1 or (v and 1 or 0)
      out[n + 12] = st.uv[1]
      out[n + 13] = st.uv[2]
    end
  end
  for i = 1, #out do
    local x = out[i]
    if x ~= x or x == math.huge or x == -math.huge then out[i] = 0 end
  end
  return table.concat(out, ',')
end

function vt.key(name, code, down)
  return guard(function()
    local cancel = fire('KEY_PRESS', code, down and 1 or 0, 0)
    for _, kb in ipairs(keybindList) do
      if rawget(kb, '__key') == name and rawget(kb, '__enabled') then
        rawset(kb, '__pressed', down)
        local fn = rawget(kb, down and 'press' or 'release')
        if fn and fn(0, kb) == true then cancel = true end
      end
    end
    return cancel
  end)
end

function vt.chat(message)
  guard(function()
    fire('CHAT_SEND_MESSAGE', message)
    fire('CHAT_RECEIVE_MESSAGE', message, encode({ text = message }))
  end)
end

function vt.timeline(script)
  guard(function()
    local chunk, err = load(script, '=Animation (Timeline)', 't', _ENV)
    if not chunk then error(err, 0) end
    chunk()
  end)
end

--- Zustand des Aktionsrads für die Oberfläche (JSON).
function vt.wheel()
  local page = currentPage
  if not page then return encode({ title = nil, actions = {} }) end
  local actions = {}
  for i, a in pairs(rawget(page, '__actions')) do
    if math.type(i) == 'integer' then
      local toggled = rawget(a, '__toggled')
      local color = (toggled and rawget(a, '__toggleColor')) or rawget(a, '__color')
      actions[#actions + 1] = {
        index = i,
        title = tostring((toggled and rawget(a, '__toggleTitle')) or rawget(a, '__title') or ''),
        item = tostring((toggled and rawget(a, '__toggleItem')) or rawget(a, '__item') or ''),
        color = color and vectors.rgbToHex(color) or nil,
        toggled = toggled,
        toggleable = rawget(a, 'toggle') ~= nil or rawget(a, 'untoggle') ~= nil,
        scrollable = rawget(a, 'scroll') ~= nil,
        rightClick = rawget(a, 'rightClick') ~= nil
      }
    end
  end
  table.sort(actions, function(x, y) return x.index < y.index end)
  return encode({ title = rawget(page, '__title'), actions = actions })
end

function vt.wheelClick(index, right)
  guard(function()
    if currentPage then clickAction(rawget(currentPage, '__actions')[index], right) end
  end)
end

function vt.wheelScroll(index, dir)
  guard(function()
    if not currentPage then return end
    local a = rawget(currentPage, '__actions')[index]
    local fn = a and rawget(a, 'scroll')
    if fn then fn(dir, a) end
  end)
end

function vt.keybinds()
  local out = {}
  for _, kb in ipairs(keybindList) do out[#out + 1] = { name = rawget(kb, '__name'), key = rawget(kb, '__key') } end
  return encode(out)
end
