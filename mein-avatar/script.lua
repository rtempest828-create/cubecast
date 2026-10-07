-- ==========================================================================
-- Polarfuchs – Figura-Avatar
-- Geschrieben für die Figura-API 0.1.x (Lua 5.2 / LuaJ). Nur gängige Funktionen,
-- die es seit 0.1.0 gibt; unsichere Stellen sind mit "PRÜFEN" markiert.
-- ==========================================================================

-- --------------------------------------------------------------------------
-- Einstellungen
-- --------------------------------------------------------------------------
local RICHTUNG = 1            -- schwingt alles verkehrt herum? dann -1 eintragen
local PHYSIK_STAERKE = 1.0    -- 0 = steif, 1 = normal, 1.5 = sehr lebhaft
local BLINZELN_MIN = 50       -- Ticks zwischen zwei Blinzlern (20 Ticks = 1 Sekunde)
local BLINZELN_MAX = 130
local SYNC_INTERVALL = 200    -- alle 10 s den Zustand an andere Spieler senden (für Nachzügler)

-- --------------------------------------------------------------------------
-- Modellteile
-- --------------------------------------------------------------------------
local M = models.model
local KOPF, KOERPER = M.Head, M.Body

local EMOTIONEN = { "neutral", "froehlich", "ueberrascht", "wuetend", "schlaefrig" }
local TITEL = { neutral = "Neutral", froehlich = "Fröhlich", ueberrascht = "Überrascht", wuetend = "Wütend", schlaefrig = "Schläfrig" }
local SYMBOLE = { neutral = "minecraft:snowball", froehlich = "minecraft:sweet_berries", ueberrascht = "minecraft:egg",
                  wuetend = "minecraft:fire_charge", schlaefrig = "minecraft:white_bed" }

local gesichter = {}
for _, e in ipairs(EMOTIONEN) do
  gesichter[e] = { offen = KOPF.Gesicht["Gesicht_" .. e .. "_offen"], zu = KOPF.Gesicht["Gesicht_" .. e .. "_zu"] }
end

-- Ein- und ausblendbare Ebenen (Bit-Werte für die Übertragung per Ping)
local EBENEN = {
  { bit = 1,  titel = "Haarschicht",        symbol = "minecraft:white_wool",       teile = { KOPF.Kopf_Haarschicht } },
  { bit = 2,  titel = "Mantel",             symbol = "minecraft:leather_chestplate", teile = { KOERPER.Jacke } },
  { bit = 4,  titel = "Ärmel",              symbol = "minecraft:blue_wool",        teile = { M.RightArm.Aermel_R, M.LeftArm.Aermel_L } },
  { bit = 8,  titel = "Stiefel-Fell",       symbol = "minecraft:leather_boots",    teile = { M.RightLeg.Hose_R, M.LeftLeg.Hose_L } },
  { bit = 16, titel = "Schal",              symbol = "minecraft:light_blue_wool",  teile = { KOERPER.Schal } },
  { bit = 32, titel = "Schleife",           symbol = "minecraft:light_blue_dye",   teile = { KOPF.Schleife } },
  { bit = 64, titel = "Rock",               symbol = "minecraft:blue_banner",      teile = { KOERPER.Rock } },
}
local ALLE_EBENEN = 127
local BIT_HELM = 128
local BIT_PHYSIK_AUS = 256

-- --------------------------------------------------------------------------
-- Vanilla-Modell: eigener Körper statt Skin, Umhang aus (kollidiert mit dem Schwanz)
-- --------------------------------------------------------------------------
vanilla_model.PLAYER:setVisible(false)
vanilla_model.CAPE:setVisible(false)
-- Rüstung (außer Helm) und Elytren bleiben sichtbar; der Helm ist per Action Wheel schaltbar.

-- --------------------------------------------------------------------------
-- Zustand
-- --------------------------------------------------------------------------
local emo = 1                  -- Index in EMOTIONEN
local maske = ALLE_EBENEN      -- sichtbare Ebenen + Helm + Physik-Schalter
local augenZu = false
local blinzelTimer = 40
local blinzelRest = 0

local function hatBit(wert, bit) return math.floor(wert / bit) % 2 == 1 end
local function mitBit(wert, bit, an)
  if hatBit(wert, bit) == an then return wert end
  return an and wert + bit or wert - bit
end

local function gesichtAnwenden()
  local aktuell = EMOTIONEN[emo]
  for name, teile in pairs(gesichter) do
    teile.offen:setVisible(name == aktuell and not augenZu)
    teile.zu:setVisible(name == aktuell and augenZu)
  end
end

local function anwenden()
  for _, ebene in ipairs(EBENEN) do
    for _, teil in ipairs(ebene.teile) do teil:setVisible(hatBit(maske, ebene.bit)) end
  end
  vanilla_model.HELMET:setVisible(hatBit(maske, BIT_HELM))
  gesichtAnwenden()
end

-- Pings laufen bei allen Spielern, die den Avatar sehen (auch beim Besitzer selbst).
function pings.zustand(neueEmo, neueMaske)
  emo = math.max(1, math.min(#EMOTIONEN, neueEmo or 1))
  maske = neueMaske or ALLE_EBENEN
  anwenden()
end

anwenden()

-- --------------------------------------------------------------------------
-- Physik: gedämpfte Federn, pro Tick gerechnet, pro Bild weich interpoliert
-- --------------------------------------------------------------------------
local function feder(k, d) return { w = 0, v = 0, alt = 0, k = k, d = d } end

local function schritt(f, ziel)
  f.alt = f.w
  f.v = (f.v + (ziel - f.w) * f.k) * f.d
  f.w = f.w + f.v
end

local function wert(f, delta) return f.alt + (f.w - f.alt) * delta end
local function klemme(x, lo, hi) if x < lo then return lo elseif x > hi then return hi end return x end
local function winkelDiff(a, b) return (b - a + 180) % 360 - 180 end

local F = {
  schwanzX = feder(0.12, 0.82), schwanzY = feder(0.10, 0.84),
  mitteX = feder(0.10, 0.80),   mitteY = feder(0.09, 0.82),
  spitzeX = feder(0.08, 0.80),  spitzeY = feder(0.07, 0.82),
  ohrRX = feder(0.25, 0.70),    ohrRZ = feder(0.22, 0.70),
  ohrLX = feder(0.25, 0.70),    ohrLZ = feder(0.22, 0.70),
  haarX = feder(0.14, 0.78),    straehneX = feder(0.18, 0.75), ponyX = feder(0.25, 0.70),
  schalX = feder(0.12, 0.80),
  rockV = feder(0.35, 0.60),    rockH = feder(0.35, 0.60),    rockS = feder(0.30, 0.60),
}

local letzterYaw = nil
local zeit = 0
local naechstesZucken = 100

local function physikTick()
  if not player:isLoaded() then return end
  local vel = player:getVelocity()
  local yaw = player:getBodyYaw()
  local r = math.rad(yaw)
  local s, c = math.sin(r), math.cos(r)
  local vorw = -vel.x * s + vel.z * c          -- Blöcke/Tick nach vorne
  local seit = -vel.x * c - vel.z * s          -- nach rechts (aus Sicht der Figur)
  local hoch = vel.y
  local dreh = letzterYaw and winkelDiff(letzterYaw, yaw) or 0
  letzterYaw = yaw
  local hocke = player:isCrouching()
  local pitch = player:getRot().x                -- positiv = schaut nach unten
  local p = PHYSIK_STAERKE * RICHTUNG

  if hatBit(maske, BIT_PHYSIK_AUS) then vorw, seit, hoch, dreh, p = 0, 0, 0, 0, 0 end

  -- Schwanz: hebt sich beim Rennen, schwingt bei Drehungen nach außen, wedelt im Stand
  local tempo = math.sqrt(vorw * vorw + seit * seit)
  local wedelStaerke = (EMOTIONEN[emo] == "froehlich") and 14 or 5
  local wedelTempo = (EMOTIONEN[emo] == "froehlich") and 0.55 or 0.16
  local wedeln = math.sin(zeit * wedelTempo) * wedelStaerke * math.max(0, 1 - tempo * 6)
  if hatBit(maske, BIT_PHYSIK_AUS) then wedeln = 0 end
  schritt(F.schwanzX, p * klemme(-vorw * 140 + hoch * 45, -55, 20) + (hocke and -12 or 0))
  schritt(F.schwanzY, p * klemme(dreh * 2.5 - seit * 90, -45, 45) + wedeln)
  schritt(F.mitteX, F.schwanzX.w * 0.6)
  schritt(F.mitteY, F.schwanzY.w * 0.7)
  schritt(F.spitzeX, F.mitteX.w * 0.6)
  schritt(F.spitzeY, F.mitteY.w * 0.7)

  -- Ohren: Fahrtwind legt sie nach hinten, beim Schleichen leicht angelegt, ab und zu ein Zucken
  local ohrX = p * klemme(vorw * 90 - hoch * 25, -10, 30) + (hocke and 14 or 0)
  schritt(F.ohrRX, ohrX)
  schritt(F.ohrLX, ohrX)
  schritt(F.ohrRZ, p * klemme(-dreh * 0.6 + seit * 40, -15, 15))
  schritt(F.ohrLZ, p * klemme(-dreh * 0.6 + seit * 40, -15, 15))
  naechstesZucken = naechstesZucken - 1
  if naechstesZucken <= 0 and not hatBit(maske, BIT_PHYSIK_AUS) then
    -- Zucken nach außen: rechtes Ohr Richtung +X (negativ um Z), linkes Richtung -X
    if math.random() < 0.5 then F.ohrRZ.v = F.ohrRZ.v - 9 else F.ohrLZ.v = F.ohrLZ.v + 9 end
    naechstesZucken = math.random(80, 220)
  end

  -- Haare: hängen nach unten, auch wenn der Kopf nach oben schaut
  local gegenNeigung = klemme(pitch * 0.8, -60, 0)
  schritt(F.haarX, p * klemme(-vorw * 90 + hoch * 30, -60, 10) + gegenNeigung)
  schritt(F.straehneX, p * klemme(-vorw * 70 + hoch * 25, -45, 10) + gegenNeigung * 0.5)
  schritt(F.ponyX, p * klemme(-vorw * 15, -10, 4))
  schritt(F.schalX, p * klemme(-vorw * 110 + hoch * 30, -70, 8))

  -- Rock: öffnet sich mit den Beinen (Laufen, Sitzen) – Vorzeichen egal, nur der Ausschlag zählt
  -- PRÜFEN: getOriginRot() liefert Grad; falls der Rock im Spiel kaum reagiert, sind es Bogenmaß.
  local rb = vanilla_model.RIGHT_LEG:getOriginRot()
  local lb = vanilla_model.LEFT_LEG:getOriginRot()
  local bein = math.max(math.abs(rb.x), math.abs(lb.x))
  local spreiz = math.max(math.abs(rb.z), math.abs(lb.z))
  schritt(F.rockV, klemme(bein * 0.75 + math.max(0, vorw) * 40, 0, 75))
  schritt(F.rockH, klemme(bein * 0.55 + math.max(0, -vorw) * 40, 0, 50))
  schritt(F.rockS, klemme(spreiz * 0.8 + bein * 0.15, 0, 35))
end

-- --------------------------------------------------------------------------
-- Blinzeln (läuft bei jedem Zuschauer lokal, muss nicht synchronisiert werden)
-- --------------------------------------------------------------------------
local function blinzelTick()
  if blinzelRest > 0 then
    blinzelRest = blinzelRest - 1
    if blinzelRest == 0 then augenZu = false gesichtAnwenden() end
    return
  end
  blinzelTimer = blinzelTimer - 1
  if blinzelTimer <= 0 then
    augenZu = true
    blinzelRest = (EMOTIONEN[emo] == "schlaefrig") and 8 or 3
    blinzelTimer = math.random(BLINZELN_MIN, BLINZELN_MAX)
    if math.random() < 0.15 then blinzelTimer = 6 end   -- manchmal doppelt blinzeln
    gesichtAnwenden()
  end
end

-- --------------------------------------------------------------------------
-- Ereignisse
-- --------------------------------------------------------------------------
local syncTimer = 20

function events.tick()
  zeit = zeit + 1
  physikTick()
  blinzelTick()
  if host:isHost() then
    syncTimer = syncTimer - 1
    if syncTimer <= 0 then
      syncTimer = SYNC_INTERVALL
      pings.zustand(emo, maske)
    end
  end
end

function events.render(delta)
  KOERPER.Schwanz:setOffsetRot(wert(F.schwanzX, delta), wert(F.schwanzY, delta), 0)
  KOERPER.Schwanz.Schwanz_Mitte:setOffsetRot(wert(F.mitteX, delta), wert(F.mitteY, delta), 0)
  KOERPER.Schwanz.Schwanz_Mitte.Schwanz_Spitze:setOffsetRot(wert(F.spitzeX, delta), wert(F.spitzeY, delta), 0)
  KOPF.Ohr_R:setOffsetRot(wert(F.ohrRX, delta), 0, wert(F.ohrRZ, delta))
  KOPF.Ohr_L:setOffsetRot(wert(F.ohrLX, delta), 0, wert(F.ohrLZ, delta))
  KOPF.Haare_Hinten:setOffsetRot(wert(F.haarX, delta), 0, 0)
  local st = wert(F.straehneX, delta)
  KOPF.Straehne_R:setOffsetRot(st, 0, 0)
  KOPF.Straehne_L:setOffsetRot(st, 0, 0)
  KOPF.Pony:setOffsetRot(wert(F.ponyX, delta), 0, 0)
  KOERPER.Schal.Schal_Ende:setOffsetRot(wert(F.schalX, delta), 0, 0)
  local rs = wert(F.rockS, delta)
  KOERPER.Rock.Rock_Vorne:setOffsetRot(wert(F.rockV, delta), 0, 0)
  KOERPER.Rock.Rock_Hinten:setOffsetRot(-wert(F.rockH, delta), 0, 0)
  KOERPER.Rock.Rock_R:setOffsetRot(0, 0, rs)
  KOERPER.Rock.Rock_L:setOffsetRot(0, 0, -rs)
end

-- --------------------------------------------------------------------------
-- Action Wheel und gespeicherte Einstellungen (nur beim Besitzer)
-- --------------------------------------------------------------------------
if host:isHost() then
  config:setName("Polarfuchs")
  emo = config:load("emotion") or emo
  maske = config:load("maske") or maske
  anwenden()

  local function senden()
    config:save("emotion", emo)
    config:save("maske", maske)
    pings.zustand(emo, maske)
  end

  local haupt = action_wheel:newPage("Polarfuchs")
  local ebenenSeite = action_wheel:newPage("Ebenen")
  action_wheel:setPage(haupt)

  local emoAktionen = {}
  local function titelAktualisieren()
    for i, e in ipairs(EMOTIONEN) do
      emoAktionen[i]:setTitle((i == emo and "» " or "") .. "Ausdruck: " .. TITEL[e])
    end
  end
  for i, e in ipairs(EMOTIONEN) do
    emoAktionen[i] = haupt:newAction()
      :setItem(SYMBOLE[e])
      :setOnLeftClick(function()
        emo = i
        titelAktualisieren()
        senden()
      end)
  end
  titelAktualisieren()

  haupt:newAction()
    :setTitle("Helm anzeigen")
    :setItem("minecraft:iron_helmet")
    :setToggled(hatBit(maske, BIT_HELM))
    :setOnToggle(function(an)
      maske = mitBit(maske, BIT_HELM, an)
      senden()
    end)

  haupt:newAction()
    :setTitle("Physik")
    :setItem("minecraft:feather")
    :setToggled(not hatBit(maske, BIT_PHYSIK_AUS))
    :setOnToggle(function(an)
      maske = mitBit(maske, BIT_PHYSIK_AUS, not an)
      senden()
    end)

  haupt:newAction()
    :setTitle("Ebenen & Accessoires …")
    :setItem("minecraft:armor_stand")
    :setOnLeftClick(function() action_wheel:setPage(ebenenSeite) end)

  for _, ebene in ipairs(EBENEN) do
    ebenenSeite:newAction()
      :setTitle(ebene.titel)
      :setItem(ebene.symbol)
      :setToggled(hatBit(maske, ebene.bit))
      :setOnToggle(function(an)
        maske = mitBit(maske, ebene.bit, an)
        senden()
      end)
  end
  ebenenSeite:newAction()
    :setTitle("Zurück")
    :setItem("minecraft:arrow")
    :setOnLeftClick(function() action_wheel:setPage(haupt) end)
end
