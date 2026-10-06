-- Figura-Vektoren (Vector2/3/4) mit Rechenoperatoren, Swizzles (v.xz, v.xyz) und Hilfsfunktionen.

local baseType = type
local VecMeta = {}
local Vec = {}
local NAMES = { 'Vector2', 'Vector3', 'Vector4' }
local AXIS = { x = 1, y = 2, z = 3, w = 4, r = 1, g = 2, b = 3, a = 4 }

local function isVec(v) return baseType(v) == 'table' and getmetatable(v) == VecMeta end
local function make(n, a, b, c, d)
  return setmetatable({ n = n, a or 0, b or 0, c or 0, d or 0 }, VecMeta)
end
_G.__isVec = isVec

local function comps(v) return v[1], v[2], v[3], v[4] end

VecMeta.__index = function(self, key)
  local method = Vec[key]
  if method then return method end
  if type(key) == 'number' then
    if key >= 1 and key <= rawget(self, 'n') then return rawget(self, key) end
    return nil
  end
  if type(key) ~= 'string' then return nil end
  local len = #key
  if len == 1 then
    local i = AXIS[key]
    if i and i <= rawget(self, 'n') then return rawget(self, i) end
    return nil
  end
  if len <= 4 then
    local out = {}
    for c in key:gmatch('.') do
      local i = AXIS[c]
      if not i or i > rawget(self, 'n') then return nil end
      out[#out + 1] = rawget(self, i)
    end
    return make(len, out[1], out[2], out[3], out[4])
  end
  return nil
end
VecMeta.__newindex = function(self, key, value)
  local i = type(key) == 'number' and key or AXIS[key]
  if i and i <= rawget(self, 'n') then rawset(self, i, value) return end
  error('Vektoren haben kein Feld „' .. tostring(key) .. '“', 2)
end

local function binop(op)
  return function(a, b)
    local va, vb = isVec(a), isVec(b)
    local n = va and rawget(a, 'n') or rawget(b, 'n')
    local r = make(n)
    for i = 1, n do
      local x = va and rawget(a, i) or a
      local y = vb and rawget(b, i) or b
      rawset(r, i, op(x, y))
    end
    return r
  end
end
VecMeta.__add = binop(function(x, y) return x + y end)
VecMeta.__sub = binop(function(x, y) return x - y end)
VecMeta.__mul = binop(function(x, y) return x * y end)
VecMeta.__div = binop(function(x, y) return x / y end)
VecMeta.__mod = binop(function(x, y) return x % y end)
VecMeta.__pow = binop(function(x, y) return x ^ y end)
VecMeta.__idiv = binop(function(x, y) return x // y end)
VecMeta.__unm = function(a) return a * -1 end
VecMeta.__len = function(a) return rawget(a, 'n') end
VecMeta.__eq = function(a, b)
  if rawget(a, 'n') ~= rawget(b, 'n') then return false end
  for i = 1, rawget(a, 'n') do if rawget(a, i) ~= rawget(b, i) then return false end end
  return true
end
VecMeta.__lt = function(a, b) return a:length() < b:length() end
VecMeta.__le = function(a, b) return a:length() <= b:length() end
VecMeta.__tostring = function(a)
  local parts = {}
  for i = 1, rawget(a, 'n') do parts[i] = tostring(rawget(a, i)) end
  return '{' .. table.concat(parts, ', ') .. '}'
end

-- type() soll „Vector2/3/4“ liefern
function type(v)
  if isVec(v) then return NAMES[rawget(v, 'n') - 1] end
  return baseType(v)
end

local function each(self, fn)
  for i = 1, rawget(self, 'n') do rawset(self, i, fn(rawget(self, i), i)) end
  return self
end
local function argsToVec(n, x, y, z, w)
  if isVec(x) then return x end
  return make(n, x, y, z, w)
end

function Vec.copy(self) return make(rawget(self, 'n'), comps(self)) end
function Vec.length(self) return math.sqrt(self:lengthSquared()) end
function Vec.lengthSquared(self)
  local s = 0
  for i = 1, rawget(self, 'n') do s = s + rawget(self, i) ^ 2 end
  return s
end
function Vec.normalize(self)
  local l = self:length()
  if l == 0 then return self end
  return each(self, function(v) return v / l end)
end
function Vec.normalized(self) return self:copy():normalize() end
function Vec.dot(self, o)
  local s = 0
  for i = 1, rawget(self, 'n') do s = s + rawget(self, i) * rawget(o, i) end
  return s
end
function Vec.cross(self, o)
  local a1, a2, a3 = comps(self)
  local b1, b2, b3 = comps(o)
  return make(3, a2 * b3 - a3 * b2, a3 * b1 - a1 * b3, a1 * b2 - a2 * b1)
end
function Vec.set(self, x, y, z, w)
  local o = argsToVec(rawget(self, 'n'), x, y, z, w)
  return each(self, function(_, i) return rawget(o, i) or 0 end)
end
function Vec.reset(self) return each(self, function() return 0 end) end
function Vec.add(self, x, y, z, w) local o = argsToVec(rawget(self, 'n'), x, y, z, w) return each(self, function(v, i) return v + (rawget(o, i) or 0) end) end
function Vec.sub(self, x, y, z, w) local o = argsToVec(rawget(self, 'n'), x, y, z, w) return each(self, function(v, i) return v - (rawget(o, i) or 0) end) end
function Vec.mul(self, x, y, z, w) local o = argsToVec(rawget(self, 'n'), x, y, z, w) return each(self, function(v, i) return v * (rawget(o, i) or 1) end) end
function Vec.div(self, x, y, z, w) local o = argsToVec(rawget(self, 'n'), x, y, z, w) return each(self, function(v, i) return v / (rawget(o, i) or 1) end) end
function Vec.scale(self, k) return each(self, function(v) return v * k end) end
function Vec.unpack(self) return table.unpack(self, 1, rawget(self, 'n')) end
function Vec.toRad(self) return self:copy():scale(math.pi / 180) end
function Vec.toDeg(self) return self:copy():scale(180 / math.pi) end
function Vec.floor(self) return self:copy():applyFunc(math.floor) end
function Vec.ceil(self) return self:copy():applyFunc(math.ceil) end
function Vec.applyFunc(self, fn) return each(self, function(v, i) return fn(v, i) end) end
function Vec.clamped(self, lo, hi)
  local l = self:length()
  if l == 0 then return self:copy() end
  return self:normalized() * math.clamp(l, lo, hi)
end
function Vec.clampLength(self, lo, hi)
  local c = self:clamped(lo, hi)
  return self:set(c)
end
function Vec.augmented(self, v)
  local n = rawget(self, 'n')
  local out = make(math.min(n + 1, 4), comps(self))
  rawset(out, n + 1, v or 1)
  return out
end
function Vec.reduce(self, divisor) return self:copy() end
function Vec.offset(self, k) return each(self, function(v) return v + k end) end
function Vec.transform(self, matrix) return matrix and matrix.apply and matrix:apply(self) or self end
function Vec.toString(self) return tostring(self) end

function vec(x, y, z, w)
  if w ~= nil then return make(4, x, y, z, w) end
  if z ~= nil then return make(3, x, y, z) end
  if y ~= nil then return make(2, x, y) end
  return make(3, x, x, x)
end

vectors = {}
function vectors.vec(...) return vec(...) end
function vectors.vec2(x, y) return make(2, x, y) end
function vectors.vec3(x, y, z) return make(3, x, y, z) end
function vectors.vec4(x, y, z, w) return make(4, x, y, z, w) end
function vectors.lerp(a, b, t) return a + (b - a) * t end
function vectors.angleToDir(pitch, yaw)
  if isVec(pitch) then pitch, yaw = pitch.x, pitch.y end
  local p, y = math.rad(pitch), math.rad(yaw)
  return make(3, -math.sin(y) * math.cos(p), -math.sin(p), math.cos(y) * math.cos(p))
end
function vectors.rotateAroundAxis(angle, v, axis)
  local a = math.rad(angle)
  local k = axis:normalized()
  local c, s = math.cos(a), math.sin(a)
  return v * c + k:cross(v) * s + k * (k:dot(v) * (1 - c))
end
function vectors.hsvToRGB(h, s, v)
  if isVec(h) then h, s, v = h.x, h.y, h.z end
  local i = math.floor(h * 6)
  local f = h * 6 - i
  local p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
  local row = ({ { v, t, p }, { q, v, p }, { p, v, t }, { p, q, v }, { t, p, v }, { v, p, q } })[i % 6 + 1]
  return make(3, row[1], row[2], row[3])
end
function vectors.rgbToHSV(r, g, b)
  if isVec(r) then r, g, b = r.x, r.y, r.z end
  local max, min = math.max(r, g, b), math.min(r, g, b)
  local d = max - min
  local h = 0
  if d ~= 0 then
    if max == r then h = ((g - b) / d) % 6 elseif max == g then h = (b - r) / d + 2 else h = (r - g) / d + 4 end
    h = h / 6
  end
  return make(3, h, max == 0 and 0 or d / max, max)
end
function vectors.hexToRGB(hex)
  if type(hex) == 'number' then return vectors.intToRGB(hex) end
  hex = tostring(hex):gsub('^#', '')
  if #hex == 3 then hex = hex:gsub('.', '%0%0') end
  local n = tonumber(hex, 16) or 0
  return vectors.intToRGB(n)
end
function vectors.intToRGB(n)
  return make(3, ((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
end
function vectors.rgbToInt(r, g, b)
  if isVec(r) then r, g, b = r.x, r.y, r.z end
  return (math.floor(r * 255 + 0.5) << 16) | (math.floor(g * 255 + 0.5) << 8) | math.floor(b * 255 + 0.5)
end
function vectors.rgbToHex(r, g, b) return string.format('%06x', vectors.rgbToInt(r, g, b)) end
function vectors.worldToScreenSpace() return make(4, 0, 0, 1, 0) end
function vectors.toCameraSpace(v) return v end

-- Matrizen: vereinfachte Attrappe (Einheitsmatrix), damit Skripte nicht abbrechen.
local MatMeta = { __type = 'Matrix4' }
local Mat = {}
MatMeta.__index = function(_, k)
  return Mat[k] or function(self) return self end
end
MatMeta.__mul = function(a, b) if isVec(b) then return b:copy() end return a end
function Mat.apply(self, x, y, z) if isVec(x) then return x:copy() end return make(3, x, y, z) end
function Mat.applyDir(self, x, y, z) return Mat.apply(self, x, y, z) end
function Mat.copy(self) return setmetatable({}, MatMeta) end
function Mat.invert(self) return self end
function Mat.inverted(self) return self:copy() end
function Mat.transpose(self) return self end
function Mat.transposed(self) return self:copy() end
function Mat.det() return 1 end
matrices = setmetatable({}, { __index = function() return function() return setmetatable({}, MatMeta) end end })
