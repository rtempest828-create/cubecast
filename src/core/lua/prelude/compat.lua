-- Kompatibilität: Figura nutzt LuaJ (Lua 5.2) und ergänzt eigene Funktionen.
-- Diese Datei gleicht die wichtigsten Unterschiede zu Lua 5.4 aus.

unpack = unpack or table.unpack
table.unpack = table.unpack or unpack

math.pow = math.pow or function(a, b) return a ^ b end
math.log10 = math.log10 or function(x) return math.log(x, 10) end
math.ldexp = math.ldexp or function(m, e) return m * 2.0 ^ e end
math.frexp = math.frexp or function(x)
  if x == 0 then return 0.0, 0 end
  local e = math.floor(math.log(math.abs(x), 2)) + 1
  return x / 2.0 ^ e, e
end
math.cosh = math.cosh or function(x) return (math.exp(x) + math.exp(-x)) / 2 end
math.sinh = math.sinh or function(x) return (math.exp(x) - math.exp(-x)) / 2 end
math.tanh = math.tanh or function(x) local a, b = math.exp(x), math.exp(-x) return (a - b) / (a + b) end

-- Figura-Erweiterungen von math (funktionieren auch mit Vektoren, siehe vectors.lua)
function math.lerp(a, b, t)
  return a + (b - a) * t
end
function math.clamp(v, lo, hi)
  if v < lo then return lo end
  if v > hi then return hi end
  return v
end
function math.round(x)
  return math.floor(x + 0.5)
end
function math.map(v, a1, b1, a2, b2)
  return a2 + (v - a1) * (b2 - a2) / (b1 - a1)
end
function math.sign(x)
  if x > 0 then return 1 elseif x < 0 then return -1 end
  return 0
end
function math.shortAngle(a, b)
  return ((b - a + 180) % 360) - 180
end
function math.lerpAngle(a, b, t)
  return a + math.shortAngle(a, b) * t
end
math.playerScale = 0.9375
math.worldScale = 1

-- bit32 aus Lua 5.2 (mit 32-Bit-Ganzzahlen)
do
  local MASK = 0xFFFFFFFF
  local function u(x) return math.floor(x) & MASK end
  bit32 = {}
  function bit32.band(...) local r = MASK for _, v in ipairs({...}) do r = r & u(v) end return r end
  function bit32.bor(...) local r = 0 for _, v in ipairs({...}) do r = r | u(v) end return r end
  function bit32.bxor(...) local r = 0 for _, v in ipairs({...}) do r = r ~ u(v) end return r end
  function bit32.bnot(x) return (~u(x)) & MASK end
  function bit32.btest(...) return bit32.band(...) ~= 0 end
  function bit32.lshift(x, n) if n >= 32 or n <= -32 then return 0 end if n < 0 then return u(x) >> -n end return (u(x) << n) & MASK end
  function bit32.rshift(x, n) if n >= 32 or n <= -32 then return 0 end if n < 0 then return (u(x) << -n) & MASK end return u(x) >> n end
  function bit32.arshift(x, n)
    x = u(x)
    if n <= 0 then return bit32.lshift(x, -n) end
    if x & 0x80000000 == 0 then return x >> n end
    if n >= 32 then return MASK end
    return ((x >> n) | ~(MASK >> n)) & MASK
  end
  function bit32.lrotate(x, n) n = n % 32 x = u(x) return ((x << n) | (x >> (32 - n))) & MASK end
  function bit32.rrotate(x, n) return bit32.lrotate(x, -n) end
  function bit32.extract(x, f, w) w = w or 1 return (u(x) >> f) & ((1 << w) - 1) end
  function bit32.replace(x, v, f, w)
    w = w or 1
    local m = ((1 << w) - 1) << f
    return (u(x) & ~m | ((u(v) << f) & m)) & MASK
  end
end

-- type(): Figura meldet eigene Typen („Vector3“, „ModelPart“ …).
do
  local rawtype = type
  local getmt = getmetatable
  function type(v)
    local t = rawtype(v)
    if t == 'table' then
      local mt = getmt(v)
      if rawtype(mt) == 'table' and rawtype(rawget(mt, '__type')) == 'string' then return rawget(mt, '__type') end
    end
    return t
  end
end
