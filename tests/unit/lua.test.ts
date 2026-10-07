import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { LuaFactory } from 'wasmoon'
import { crossedTimeline } from '@core/animation/player'
import { glfwCodeOf, keyFromBrowser } from '@core/lua/apply-lua'
import { loadFiguraAvatar, type FiguraFile } from '@core/figura/figura-avatar'
import { FiguraLuaRuntime, LuaError, type LuaLimits } from '@core/lua/figura-runtime'
import { encodePng } from '../helpers/png-encode'

const factory = new LuaFactory()
const encoder = new TextEncoder()

/** Kleines Modell: Head (Drehung 10° um Z) mit Würfel und Gruppe „Ohr“. */
const MODEL = {
  meta: { format_version: '4.10', model_format: 'free' },
  resolution: { width: 16, height: 16 },
  elements: [{ uuid: 'c1', type: 'cube', name: 'kopf', from: [-4, 24, -4], to: [4, 32, 4], origin: [0, 24, 0], faces: { north: { uv: [0, 0, 8, 8], texture: 0 } } }],
  outliner: [{ name: 'Head', uuid: 'g1', origin: [0, 24, 0], rotation: [0, 0, 10], children: ['c1', { name: 'Ohr', uuid: 'g2', origin: [2, 32, 0], children: [] }] }],
  textures: [{ name: 'tex.png', source: `data:image/png;base64,${Buffer.from(encodePng({ width: 16, height: 16, colorType: 6, bitDepth: 8, filter: 0, sample: () => [255, 0, 0, 255] })).toString('base64')}` }],
  animations: [{ name: 'winken', loop: 'loop', length: 1, animators: {} }]
}

interface Logged {
  level: string
  message: string
}

let runtimes: FiguraLuaRuntime[] = []
afterEach(() => {
  for (const r of runtimes) r.dispose()
  runtimes = []
})

async function runtimeFor(scripts: Record<string, string>, extra: { json?: Record<string, unknown>; configJson?: string; limits?: LuaLimits } = {}) {
  const files: FiguraFile[] = [
    { path: 'avatar.json', data: encoder.encode(JSON.stringify({ name: 'Test', ...extra.json })) },
    { path: 'model.bbmodel', data: encoder.encode(JSON.stringify(MODEL)) },
    ...Object.entries(scripts).map(([path, source]) => ({ path, data: encoder.encode(source) }))
  ]
  const avatar = await loadFiguraAvatar('Test', files)
  const log: Logged[] = []
  const animCalls: unknown[][] = []
  let savedConfig = ''
  const runtime = await FiguraLuaRuntime.create(factory, avatar, {
    host: {
      log: (level, message) => log.push({ level, message }),
      animation: (command, id, argument) => {
        animCalls.push([command, id, argument])
        return command === 'state' ? 'PLAYING' : command === 'getSpeed' ? 2 : null
      },
      saveConfig: (json) => (savedConfig = json)
    },
    playerName: 'Steve',
    slim: false,
    configJson: extra.configJson ?? '',
    ...(extra.limits ? { limits: extra.limits } : {})
  })
  runtimes.push(runtime)
  return { runtime, log, animCalls, config: () => savedConfig }
}

const printed = (log: Logged[]): string[] => log.filter((l) => l.level === 'info').map((l) => l.message)

describe('Lua-Sandbox', () => {
  it('führt Skripte aus, print landet im Log', async () => {
    const { runtime, log } = await runtimeFor({ 'script.lua': 'print("hallo", 1 + 1, nil)' })
    runtime.init()
    expect(printed(log)).toEqual(['hallo\t2\tnil'])
  })

  it('hat keinen Datei-, Netzwerk- oder Systemzugriff', async () => {
    const { runtime, log } = await runtimeFor({
      'script.lua': `
        print(io, debug, package, dofile, loadfile, loadstring, string.dump, os.execute, os.remove, os.getenv)
        print(pcall(load, string.char(27) .. "Lua"))
        print(load("return 1 + 1")())
        print(type(os.time()), collectgarbage("collect"))
      `
    })
    runtime.init()
    const lines = printed(log)
    expect(lines[0]).toBe(Array(10).fill('nil').join('\t'))
    expect(lines[1]).toMatch(/^true\tnil\t.*(binary|text)/)
    expect(lines[2]).toBe('2')
    expect(lines[3]).toBe('number\t0')
  })

  it('bricht Endlosschleifen ab – auch wenn pcall sie abfangen will', async () => {
    const { runtime } = await runtimeFor({
      'script.lua': `
        function events.tick() while true do end end
        function events.render() while true do pcall(function() while true do end end) end end
      `
    })
    runtime.init()
    expect(() => runtime.tick()).toThrow(LuaError)
    try {
      runtime.render(0)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(LuaError)
      expect((error as LuaError).limit).toBe(true)
    }
  })

  it('begrenzt den Speicher', async () => {
    const { runtime } = await runtimeFor(
      { 'script.lua': 'local s = "x" for i = 1, 40 do s = s .. s end' },
      { limits: { memoryBytes: 16 * 1024 * 1024, init: 50_000_000, tick: 1e6, render: 1e6, event: 1e6 } }
    )
    expect(() => runtime.init()).toThrow(/memory/i)
  })

  it('meldet Fehler mit Skriptname und Zeile', async () => {
    const { runtime } = await runtimeFor({ 'scripts/main.lua': 'local x = nil\n\nprint(x.y)' })
    expect(() => runtime.init()).toThrow(/scripts\/main\.lua:3/)
  })
})

describe('Figura-API', () => {
  it('models: Standardwerte aus Blockbench, setRot/setPos/setVisible werden umgerechnet', async () => {
    const { runtime, log } = await runtimeFor({
      'script.lua': `
        print(models.model.Head:getRot(), models.model.Head:getPivot(), models.model.Head:getName(), models.model.Head.Ohr:getParent():getName())
        print(type(models.model.Head), models.model.Head.kopf:getType(), #models.model.Head:getChildren())
        models.model.Head:setRot(0, 20, 10):setPos(1, 2, 3):setScale(2)
        models.model.Head.kopf:setVisible(false)
        models.model.Head.Ohr:setOffsetRot(vec(5, 0, 0))
      `
    })
    runtime.init()
    expect(printed(log)).toEqual(['{0, 0, 10}\t{0, 24, 0}\tHead\tHead', 'ModelPart\tCUBE\t2'])
    const poses = new Map(runtime.collect().map((p) => [p.partId, p]))
    const head = poses.get('figura.model.Head')!
    // Blockbench [0, 20, 10] minus Grundwert [0, 0, 10] → unser Raum [-0, 20, -0]
    expect(head.rotation.map((v) => v + 0)).toEqual([0, 20, 0])
    expect(head.position).toEqual([-1, 2, -3])
    expect(head.scale).toEqual([2, 2, 2])
    expect(poses.get('figura.model.Head/kopf')).toMatchObject({ kind: 'CUBE', visible: false })
    expect(poses.get('figura.model.Head.Ohr')!.rotation).toEqual([-5, 0, -0])
  })

  it('vanilla_model blendet Teile aus', async () => {
    const { runtime } = await runtimeFor({ 'script.lua': 'vanilla_model.PLAYER:setVisible(false) vanilla_model.HEAD:setVisible(true) vanilla_model.RIGHT_ITEM:setVisible(false)' })
    runtime.init()
    const poses = runtime.collect().filter((p) => p.kind === 'VANILLA')
    expect(poses).toHaveLength(12)
    expect(poses.find((p) => p.partId === 'vanilla.head')!.visible).toBe(true)
    expect(poses.find((p) => p.partId === 'vanilla.body')!.visible).toBe(false)
  })

  it('events: Registrieren, Entfernen, Reihenfolge und ENTITY_INIT', async () => {
    const { runtime, log } = await runtimeFor({
      'script.lua': `
        function events.entity_init() print("init") end
        events.TICK:register(function() print("tick a") end, "a")
        events.tick = function() print("tick b") end
        function events.render(delta, ctx) print("render", delta, ctx) end
        print(events.TICK:getRegisteredCount(), #events.tick)
      `
    })
    runtime.init()
    runtime.tick()
    runtime.render(0.5)
    expect(printed(log)).toEqual(['2\t2', 'init', 'tick a', 'tick b', 'render\t0.5\tRENDER'])
  })

  it('pings laufen sofort, events.TICK:remove entfernt per Name', async () => {
    const { runtime, log } = await runtimeFor({
      'script.lua': `
        function pings.hallo(x, y) print("ping", x, y) end
        pings.hallo(1, "zwei")
        events.TICK:register(function() print("weg") end, "x")
        print(events.TICK:remove("x"))
      `
    })
    runtime.init()
    runtime.tick()
    expect(printed(log)).toEqual(['ping\t1\tzwei', '1'])
  })

  it('animations steuert den Player der App', async () => {
    const { runtime, log, animCalls } = await runtimeFor({
      'script.lua': `
        animations.model.winken:play():setSpeed(2)
        print(animations.model.winken:isPlaying(), animations.model.winken:getSpeed(), animations.model.winken:getName())
        animations.model.winken:setLoop("HOLD"):setPlaying(false)
        print(#animations:getAnimations())
      `
    })
    runtime.init()
    expect(printed(log)).toEqual(['true\t2\twinken', '1'])
    expect(animCalls).toContainEqual(['play', 'model.winken', null])
    expect(animCalls).toContainEqual(['speed', 'model.winken', 2])
    expect(animCalls).toContainEqual(['loop', 'model.winken', 'hold'])
    expect(animCalls).toContainEqual(['stop', 'model.winken', null])
  })

  it('keybinds und KEY_PRESS', async () => {
    const { runtime, log } = await runtimeFor({
      'script.lua': `
        local kb = keybinds:newKeybind("Winken", "key.keyboard.b")
        kb.press = function() print("B gedrückt", kb:isPressed()) end
        kb:setOnRelease(function() print("B los") end)
        local jump = keybinds:fromVanilla("key.jump")
        jump.press = function() print("Sprung") return true end
        function events.key_press(key, action) print("taste", key, action) end
      `
    })
    runtime.init()
    expect(runtime.key('key.keyboard.b', 66, true)).toBe(false)
    runtime.key('key.keyboard.b', 66, false)
    expect(runtime.key('key.keyboard.space', 32, true)).toBe(true)
    expect(printed(log)).toEqual(['taste\t66\t1', 'B gedrückt\ttrue', 'taste\t66\t0', 'B los', 'taste\t32\t1', 'Sprung'])
    expect(runtime.keybinds()).toEqual([
      { name: 'Winken', key: 'key.keyboard.b' },
      { name: 'key.jump', key: 'key.keyboard.space' }
    ])
  })

  it('action_wheel: Seiten, Klicks, Umschalter, Scrollen', async () => {
    const { runtime, log } = await runtimeFor({
      'script.lua': `
        local page = action_wheel:newPage("Haupt")
        action_wheel:setPage(page)
        page:newAction():title("Winken"):item("minecraft:apple"):color(1, 0, 0):onLeftClick(function() print("links") end):onRightClick(function() print("rechts") end)
        page:newAction():title("Licht: aus"):toggleTitle("Licht: an"):onToggle(function(on) print("toggle", on) end)
        page:newAction():title("Größe"):onScroll(function(dir) print("scroll", dir) end)
      `
    })
    runtime.init()
    let wheel = runtime.wheel()
    expect(wheel.title).toBe('Haupt')
    expect(wheel.actions.map((a) => [a.title, a.item, a.color ?? null, a.toggleable])).toEqual([
      ['Winken', 'minecraft:apple', 'ff0000', false],
      ['Licht: aus', '', null, true],
      ['Größe', '', null, false]
    ])
    runtime.wheelClick(1, false)
    runtime.wheelClick(1, true)
    runtime.wheelClick(2, false)
    runtime.wheelScroll(3, -1)
    wheel = runtime.wheel()
    expect(wheel.actions[1]).toMatchObject({ title: 'Licht: an', toggled: true })
    runtime.wheelClick(2, false)
    expect(printed(log)).toEqual(['links', 'rechts', 'toggle\ttrue', 'scroll\t-1', 'toggle\tfalse'])
  })

  it('config speichert und lädt', async () => {
    const first = await runtimeFor({ 'script.lua': 'config:setName("Fuchs") config:save("farbe", "rot") config:save("pos", vec(1, 2, 3))' })
    first.runtime.init()
    const json = first.config()
    expect(JSON.parse(json)).toEqual({ Fuchs: { farbe: 'rot', pos: { __vec: [1, 2, 3] } } })
    const second = await runtimeFor({ 'script.lua': 'config:setName("Fuchs") print(config:load("farbe"), config:load("pos"), type(config:load("pos")))' }, { configJson: json })
    second.runtime.init()
    expect(printed(second.log)).toEqual(['rot\t{1, 2, 3}\tVector3'])
  })

  it('Vektoren, math-Erweiterungen und Lua-5.2-Kompatibilität', async () => {
    const { runtime, log } = await runtimeFor({
      'script.lua': `
        local v = vec(3, 0, 4)
        print(v:length(), v.xz:length(), type(v.xz), v + 1, v * 2, -v, v.x, v[3], #v)
        print(math.lerp(vec(0, 0, 0), vec(10, 10, 10), 0.5), math.lerp(0, 10, 0.25), math.clamp(5, 0, 2), math.round(2.5))
        print(unpack({1, 2}), bit32.band(12, 10), bit32.lshift(1, 4), math.pow(2, 3), math.log10(100))
        print(vectors.hexToRGB("#ff0000"), vectors.rgbToHex(vec(0, 1, 0)), vec(1, 2):dot(vec(3, 4)))
        print(toJson({a = 1, b = {true, "x"}}), parseJson('{"x":[1,2,{"y":null}]}').x[2])
      `
    })
    runtime.init()
    expect(printed(log)).toEqual([
      '5.0\t5.0\tVector2\t{4, 1, 5}\t{6, 0, 8}\t{-3, 0, -4}\t3\t4\t3',
      '{5.0, 5.0, 5.0}\t2.5\t2\t3',
      '1\t8\t16\t8.0\t2.0', // unpack mitten in der Argumentliste liefert nur einen Wert
      '{1.0, 0.0, 0.0}\t00ff00\t11',
      expect.stringMatching(/^\{("a":1,"b":\[true,"x"\]|"b":\[true,"x"\],"a":1)\}\t2$/)
    ])
  })

  it('require: relativ, mit Punkt oder Schrägstrich, einmalig; autoScripts', async () => {
    const { runtime, log } = await runtimeFor(
      {
        'main.lua': 'local a = require("libs/helfer") local b = require("libs.helfer") print(a == b, a.wert)',
        'libs/helfer.lua': 'print("helfer geladen") local nachbar = require("./nachbar") return { wert = nachbar }',
        'libs/nachbar.lua': 'return 42',
        'nicht.lua': 'print("sollte nicht laufen")'
      },
      { json: { autoScripts: ['main'] } }
    )
    runtime.init()
    expect(printed(log)).toEqual(['helfer geladen', 'true\t42'])
  })

  it('player/world/host-Attrappen folgen dem Spielzustand; Unbekanntes warnt einmal', async () => {
    const { runtime, log } = await runtimeFor({
      'script.lua': `
        function events.tick()
          print(player:getName(), player:isCrouching(), player:getPose(), player:getHealth(), player:getVelocity().xz:length() > 0.03, host:isHost(), world.getTime())
        end
        print(player:gibtsNicht(), player:gibtsNicht(), renderer:setShadowRadius(0) == renderer)
      `
    })
    runtime.init()
    runtime.setState({ pitch: 10, yaw: 20, crouch: true, sprint: false, walk: true, sleep: false, health: 14 })
    runtime.tick()
    expect(printed(log)).toEqual(['nil\tnil\ttrue', 'Steve\ttrue\tCROUCHING\t14\ttrue\ttrue\t1'])
    expect(log.filter((l) => l.level === 'warn' && l.message.includes('gibtsNicht'))).toHaveLength(1)
  })

  it('Timeline-Skripte aus Animationen', async () => {
    const { runtime, log } = await runtimeFor({ 'script.lua': 'zaehler = 0' })
    runtime.init()
    runtime.timeline('zaehler = zaehler + 1 print("timeline", zaehler)')
    expect(printed(log)).toEqual(['timeline\t1'])
  })
})

describe('Tastencodes', () => {
  it('Minecraft-Tastennamen und GLFW-Codes passen in beide Richtungen', () => {
    for (const code of ['KeyB', 'Digit7', 'F5', 'Space', 'ShiftLeft', 'ArrowUp', 'Numpad3']) {
      const key = keyFromBrowser(code)!
      expect(glfwCodeOf(key.name)).toBe(key.glfw)
    }
    expect(glfwCodeOf('key.keyboard.gibtsnicht')).toBe(-1)
  })
})

describe('crossedTimeline', () => {
  const clip = {
    id: 'c', name: 'c', modelPath: 'm', length: 1, loop: 'loop' as const, override: false, startDelay: 0, loopDelay: 0, blend: 1, tracks: [], effectCount: 0,
    timeline: [{ time: 0, script: 'start' }, { time: 0.5, script: 'mitte' }]
  }
  it('feuert beim Überschreiten, auch über Schleifen hinweg', () => {
    expect(crossedTimeline(clip, 'loop', 0, 0.1)).toEqual(['start'])
    expect(crossedTimeline(clip, 'loop', 0.1, 0.6)).toEqual(['mitte'])
    expect(crossedTimeline(clip, 'loop', 0.6, 1.2)).toEqual(['start'])
    expect(crossedTimeline(clip, 'once', 0.6, 1.2)).toEqual([])
    expect(crossedTimeline(clip, 'loop', 0.4, 2.6)).toEqual(['mitte', 'start', 'mitte', 'start', 'mitte'])
  })
})

// ---------------------------------------------------------------------------
// Echte Avatare (nur lokal vorhanden)

const FIXTURES = join(__dirname, '..', 'fixtures', 'user-avatars')
const avatars = existsSync(FIXTURES) ? readdirSync(FIXTURES).filter((name) => statSync(join(FIXTURES, name)).isDirectory()) : []

function readFolder(dir: string): FiguraFile[] {
  const files: FiguraFile[] = []
  const visit = (d: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name)
      if (statSync(full).isDirectory()) visit(full)
      else files.push({ path: relative(dir, full).split(sep).join('/'), data: new Uint8Array(readFileSync(full)) })
    }
  }
  visit(dir)
  return files
}

describe.skipIf(avatars.length === 0)('Skripte echter Avatare', () => {
  it.each(avatars)('%s läuft 200 Ticks ohne Fehler', async (name) => {
    const avatar = await loadFiguraAvatar(name, readFolder(join(FIXTURES, name)))
    const log: Logged[] = []
    const runtime = await FiguraLuaRuntime.create(factory, avatar, {
      host: { log: (level, message) => log.push({ level, message }), animation: () => null, saveConfig: () => undefined },
      playerName: 'Steve',
      slim: false,
      configJson: ''
    })
    runtimes.push(runtime)
    runtime.init()
    for (let i = 0; i < 200; i++) {
      runtime.setState({ pitch: 0, yaw: 0, crouch: false, sprint: i > 100, walk: i > 50, sleep: false, health: i === 150 ? 14 : 20 })
      runtime.tick()
      runtime.render(0.5)
      if (i === 120) runtime.chat('Hallo Welt')
    }
    const wheel = runtime.wheel()
    for (const action of wheel.actions) runtime.wheelClick(action.index, false)
    runtime.tick()
    const poses = runtime.collect()
    expect(poses.length).toBeGreaterThan(0)
    expect(poses.filter((p) => p.kind === 'VANILLA').every((p) => p.visible === false)).toBe(true)
    expect(wheel.actions.length).toBeGreaterThan(0)
    expect(log.filter((l) => l.level === 'error')).toEqual([])
    expect(runtime.getStats().tickInstructions).toBeLessThan(200_000)
  })
})
