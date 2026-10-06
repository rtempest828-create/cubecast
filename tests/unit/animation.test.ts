import { describe, expect, it } from 'vitest'
import { parseAnimations, sampleTrack, type AnimationClip, type Keyframe, type Track } from '@core/animation/clip'
import { compileExpression, ExpressionError } from '@core/animation/expression'
import { AnimationPlayer, clipTime, DEFAULT_ANIMATION_SETTINGS, evaluateTriggers, parseAnimationSettings, type AnimationSettings } from '@core/animation/player'
import { loadFiguraAvatar } from '@core/figura/figura-avatar'
import { PoseBuilder } from '@core/pipeline/pose'

const vars = { animTime: 0, lifeTime: 0 }
const lua = (s: string, animTime = 0): number => compileExpression(s, 'lua').evaluate({ animTime, lifeTime: 0 })

describe('Keyframe-Ausdrücke', () => {
  it('rechnet mit Vorrang und Klammern', () => {
    expect(lua('1 + 2 * 3')).toBe(7)
    expect(lua('(1 + 2) * 3')).toBe(9)
    expect(lua('-2 ^ 2')).toBe(-4) // Lua: Potenz bindet stärker als das Minus
    expect(lua('2 ^ 3 ^ 2')).toBe(512) // rechtsassoziativ
    expect(lua('7 % 3')).toBe(1)
    expect(lua('-7 % 3')).toBe(2) // Lua-Modulo
    expect(lua('return 5;')).toBe(5)
  })

  it('Lua rechnet Winkel im Bogenmaß, Molang in Grad', () => {
    expect(lua('math.sin(math.pi / 2)')).toBeCloseTo(1)
    expect(compileExpression('math.sin(90)', 'molang').evaluate(vars)).toBeCloseTo(1)
    expect(lua('math.clamp(5, 0, 2)')).toBe(2)
    expect(lua('math.lerp(0, 10, 0.25)')).toBe(2.5)
  })

  it('kennt die Animationszeit', () => {
    expect(lua('time * 2', 1.5)).toBe(3)
    expect(compileExpression('q.anim_time + query.anim_time', 'molang').evaluate({ animTime: 2, lifeTime: 0 })).toBe(4)
    expect(compileExpression('time', 'lua').constant).toBeNull()
    expect(compileExpression('1 + 2', 'lua').constant).toBe(3)
  })

  it('logische Operatoren nach Lua- bzw. Molang-Regeln', () => {
    expect(lua('0 and 5')).toBe(5) // in Lua ist 0 „wahr“
    expect(compileExpression('0 && 5', 'molang').evaluate(vars)).toBe(0)
    expect(lua('false or 3')).toBe(3)
    expect(lua('1 < 2 and 10 or 20')).toBe(10)
    expect(lua('1 > 2 ? 10 : 20')).toBe(20)
    expect(lua('1 ~= 2 and 1 or 0')).toBe(1)
  })

  it('unbekannte Namen werden 0 und gemeldet, Syntaxfehler werfen', () => {
    // Lua-Methodenaufrufe kommen erst mit der Lua-Laufzeit (M5c)
    expect(() => compileExpression('player:getPos()', 'lua')).toThrow(ExpressionError)
    const unknown = compileExpression('foo * 2 + bar.baz(1)', 'lua')
    expect(unknown.evaluate(vars)).toBe(0)
    expect(unknown.unknown).toEqual(['foo', 'bar.baz()'])
    expect(() => compileExpression('1 +', 'lua')).toThrow(ExpressionError)
    expect(() => compileExpression('(1', 'lua')).toThrow(ExpressionError)
  })

  it('liefert nie NaN oder Unendlich', () => {
    expect(lua('1 / 0')).toBe(0)
    expect(lua('math.sqrt(-1)')).toBe(0)
  })
})

// ---------------------------------------------------------------------------

function kf(time: number, value: number | [number, number, number], extra: Partial<Keyframe> = {}, post?: number): Keyframe {
  const v: [number, number, number] = typeof value === 'number' ? [value, value, value] : value
  const expr = (n: number) => compileExpression(n, 'lua')
  const pre = [expr(v[0]), expr(v[1]), expr(v[2])] as const
  const postV = post === undefined ? pre : ([expr(post), expr(post), expr(post)] as const)
  return {
    time,
    interpolation: 'linear',
    pre,
    post: postV,
    bezierLeftTime: [-0.1, -0.1, -0.1],
    bezierLeftValue: [0, 0, 0],
    bezierRightTime: [0.1, 0.1, 0.1],
    bezierRightValue: [0, 0, 0],
    ...extra
  }
}
const track = (...keyframes: Keyframe[]): Track => ({ partId: 'p', channel: 'rotation', keyframes })
const at = (t: Track, time: number): number => sampleTrack(t, time, vars)[0]

describe('Interpolation', () => {
  it('linear, vor dem ersten und nach dem letzten Keyframe', () => {
    const t = track(kf(1, 0), kf(2, 10))
    expect(at(t, 0)).toBe(0)
    expect(at(t, 1.5)).toBe(5)
    expect(at(t, 3)).toBe(10)
  })

  it('Stufe hält den Wert bis zum nächsten Keyframe', () => {
    const t = track(kf(0, 0, { interpolation: 'step' }), kf(1, 10))
    expect(at(t, 0.99)).toBe(0)
    expect(at(t, 1)).toBe(10)
  })

  it('Sprung mit Vor-/Nachwert', () => {
    const t = track(kf(0, 0), kf(1, 10, {}, 20), kf(2, 20))
    expect(at(t, 0.5)).toBe(5)
    expect(at(t, 1)).toBe(20)
    expect(at(t, 1.5)).toBe(20)
  })

  it('Catmull-Rom läuft durch die Keyframes und ist glatt', () => {
    const t = track(kf(0, 0, { interpolation: 'catmullrom' }), kf(1, 10, { interpolation: 'catmullrom' }), kf(2, 0, { interpolation: 'catmullrom' }))
    expect(at(t, 0)).toBeCloseTo(0)
    expect(at(t, 1)).toBeCloseTo(10)
    // Über dem linearen Wert, weil die Kurve zur Spitze hin gewölbt ist
    expect(at(t, 0.75)).toBeGreaterThan(7.5)
  })

  it('Bézier ohne Griffe entspricht linear, mit Griffen nicht', () => {
    const flat = { bezierLeftTime: [0, 0, 0] as [number, number, number], bezierRightTime: [0, 0, 0] as [number, number, number] }
    const t = track(kf(0, 0, { interpolation: 'bezier', ...flat }), kf(1, 10, { interpolation: 'bezier', ...flat }))
    expect(at(t, 0.3)).toBeCloseTo(3, 3)
    const eased = track(kf(0, 0, { interpolation: 'bezier', bezierRightTime: [0.5, 0.5, 0.5] }), kf(1, 10, { interpolation: 'bezier', bezierLeftTime: [-0.5, -0.5, -0.5] }))
    expect(at(eased, 0.2)).toBeLessThan(2)
    expect(at(eased, 0.5)).toBeCloseTo(5, 3)
  })
})

// ---------------------------------------------------------------------------

/** Blockbench-Animation wie in einer .bbmodel-Datei. */
function rawAnimation(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'winken',
    loop: 'loop',
    length: 1,
    override: false,
    animators: {
      'uuid-arm': {
        name: 'RightArm',
        type: 'bone',
        keyframes: [
          { channel: 'rotation', time: 0, interpolation: 'linear', data_points: [{ x: '0', y: 0, z: 0 }] },
          { channel: 'rotation', time: 0.5, interpolation: 'linear', data_points: [{ x: 'math.sin(time) * 0 + 90', y: '10', z: '-20' }] },
          { channel: 'position', time: 0, data_points: [{ x: 1, y: 2, z: 3 }] },
          { channel: 'scale', time: 0, data_points: [{ x: 2, y: '', z: 1 }] }
        ]
      },
      'uuid-weg': { name: 'Gibtsnicht', type: 'bone', keyframes: [{ channel: 'rotation', time: 0, data_points: [{ x: 1, y: 0, z: 0 }] }] },
      'uuid-kopf': { name: 'Head', type: 'bone', keyframes: [{ channel: 'rotation', time: 2, data_points: [{ x: 'kaputt +', y: 0, z: 0 }] }] },
      effects: { name: 'Effects', type: 'effect', keyframes: [{ channel: 'timeline', time: 0, data_points: [{ script: 'print(1)' }] }] }
    },
    ...extra
  }
}

const parseOptions = {
  modelPath: 'model',
  partIdByUuid: new Map([['uuid-arm', 'figura.model.RightArm']]),
  partIdByName: new Map([['Head', 'figura.model.Head']]),
  dialect: 'lua' as const
}

describe('parseAnimations', () => {
  it('liest Spuren, ordnet Gruppen per UUID oder Name zu und meldet Probleme', () => {
    const { clips, warnings } = parseAnimations([rawAnimation()], parseOptions)
    const clip = clips[0]!
    expect(clip.id).toBe('model.winken')
    expect(clip.loop).toBe('loop')
    expect(clip.length).toBe(2) // letzter Keyframe liegt hinter „length“
    expect(clip.effectCount).toBe(0)
    expect(clip.timeline).toEqual([{ time: 0, script: 'print(1)' }])
    expect(clip.tracks.map((t) => `${t.partId}:${t.channel}`)).toEqual([
      'figura.model.RightArm:rotation',
      'figura.model.RightArm:position',
      'figura.model.RightArm:scale',
      'figura.model.Head:rotation'
    ])
    // leerer Skalierungswert = 1
    expect(sampleTrack(clip.tracks[2]!, 0, vars)).toEqual([2, 1, 1])
    expect(warnings.some((w) => w.includes('Gibtsnicht'))).toBe(true)
    expect(warnings.some((w) => w.includes('kaputt'))).toBe(true)
  })

  it('übersteht Unsinn und doppelte Namen', () => {
    const { clips } = parseAnimations([null, 5, { animators: 'x' }, rawAnimation(), rawAnimation({ loop: 'quatsch', start_delay: '0.5', loop_delay: 'math.random()' })], parseOptions)
    expect(clips.map((c) => c.id)).toEqual(['model.animation1', 'model.winken', 'model.winken~2'])
    expect(clips[2]!.loop).toBe('once')
    expect(clips[2]!.startDelay).toBe(0.5)
    expect(clips[2]!.loopDelay).toBe(0)
  })
})

// ---------------------------------------------------------------------------

function simpleClip(extra: Partial<AnimationClip> = {}): AnimationClip {
  return {
    id: 'c',
    name: 'c',
    modelPath: 'model',
    length: 1,
    loop: 'loop',
    override: false,
    startDelay: 0,
    loopDelay: 0,
    blend: 1,
    tracks: [track(kf(0, 0), kf(1, 10))],
    timeline: [],
    effectCount: 0,
    ...extra
  }
}
const settings = (patch: Partial<AnimationSettings> = {}) => (): AnimationSettings => ({ ...DEFAULT_ANIMATION_SETTINGS, ...patch })

function rotationAfter(player: AnimationPlayer, clip: AnimationClip, seconds: number, s = settings()): number {
  player.update(seconds, [clip], s)
  const pose = new PoseBuilder()
  player.apply(pose, [clip], s, 0)
  return pose.peek('p')?.rotation[0] ?? Number.NaN
}

describe('AnimationPlayer', () => {
  it('Loop, Once und Hold', () => {
    expect(clipTime(simpleClip(), 'loop', 1.25).time).toBeCloseTo(0.25)
    expect(clipTime(simpleClip(), 'once', 1.25)).toEqual({ time: null, finished: true })
    expect(clipTime(simpleClip(), 'hold', 5)).toEqual({ time: 1, finished: false })
    expect(clipTime(simpleClip({ startDelay: 0.5 }), 'loop', 0.25).time).toBeNull()
    // Loop-Pause: hält das Ende, bis die Verzögerung vorbei ist
    expect(clipTime(simpleClip({ loopDelay: 1 }), 'loop', 1.5).time).toBe(1)
    expect(clipTime(simpleClip({ loopDelay: 1 }), 'loop', 2.25).time).toBeCloseTo(0.25)
  })

  it('spielt ab, pausiert, stoppt; „once“ endet von selbst', () => {
    const player = new AnimationPlayer()
    const clip = simpleClip({ loop: 'once' })
    player.play('c')
    expect(rotationAfter(player, clip, 0.5)).toBeCloseTo(5)
    player.pause('c')
    expect(rotationAfter(player, clip, 0.3)).toBeCloseTo(5)
    player.play('c')
    expect(rotationAfter(player, clip, 0.25)).toBeCloseTo(7.5)
    player.update(1, [clip], settings())
    expect(player.stateOf('c')).toBe('stopped')
  })

  it('Tempo, Stärke und eigener Loop-Modus aus den Einstellungen', () => {
    const player = new AnimationPlayer()
    const clip = simpleClip({ blend: 0.5 })
    player.play('c')
    expect(rotationAfter(player, clip, 0.25, settings({ speed: 2, blend: 0.5 }))).toBeCloseTo(5 * 0.25)
    const once = new AnimationPlayer()
    once.play('c')
    once.update(2, [clip], settings({ loop: 'once' }))
    expect(once.stateOf('c')).toBe('stopped')
  })

  it('rechnet Blockbench-Werte in unseren Raum um', () => {
    const player = new AnimationPlayer()
    const [clip] = parseAnimations([rawAnimation()], parseOptions).clips
    player.play(clip!.id)
    player.update(0.5, [clip!], settings())
    const pose = new PoseBuilder()
    player.apply(pose, [clip!], settings(), 0)
    const arm = pose.peek('figura.model.RightArm')!
    expect(arm.rotation).toEqual([90, -10, 20])
    expect(arm.position).toEqual([1, 2, -3])
    expect(arm.scale).toEqual([2, 1, 1])
  })

  it('Override ersetzt Tracking statt es zu ergänzen', () => {
    const pose = new PoseBuilder()
    pose.part('p').rotation[0] = 30
    const player = new AnimationPlayer()
    player.play('c')
    player.update(0.5, [simpleClip({ override: true })], settings())
    player.apply(pose, [simpleClip({ override: true })], settings(), 0)
    expect(pose.peek('p')!.rotation[0]).toBeCloseTo(5)

    const additive = new PoseBuilder()
    additive.part('p').rotation[0] = 30
    player.apply(additive, [simpleClip()], settings(), 0)
    expect(additive.peek('p')!.rotation[0]).toBeCloseTo(35)
  })

  it('vergisst Animationen eines anderen Avatars', () => {
    const player = new AnimationPlayer()
    player.play('alt')
    player.update(0.1, [simpleClip()], settings())
    expect(player.activeIds()).toEqual([])
  })
})

describe('Auslöser', () => {
  const clip = simpleClip()
  it('„solange“: läuft über der Schwelle, stoppt mit Hysterese darunter', () => {
    const player = new AnimationPlayer()
    const memory = new Map<string, boolean>()
    const s = settings({ trigger: { source: 'mouth.smile', threshold: 0.6, mode: 'while' } })
    evaluateTriggers(player, [clip], s, { 'mouth.smile': 0.7 }, memory)
    expect(player.stateOf('c')).toBe('playing')
    evaluateTriggers(player, [clip], s, { 'mouth.smile': 0.58 }, memory)
    expect(player.stateOf('c')).toBe('playing')
    evaluateTriggers(player, [clip], s, { 'mouth.smile': 0.4 }, memory)
    expect(player.stateOf('c')).toBe('stopped')
  })

  it('„starten“: beginnt bei jedem Überschreiten neu', () => {
    const player = new AnimationPlayer()
    const memory = new Map<string, boolean>()
    const s = settings({ trigger: { source: 'mouth.open', threshold: 0.5, mode: 'start' } })
    evaluateTriggers(player, [clip], s, { 'mouth.open': 0.9 }, memory)
    player.update(0.4, [clip], s)
    evaluateTriggers(player, [clip], s, { 'mouth.open': 0.9 }, memory)
    expect(player.status(clip, s()).time).toBeCloseTo(0.4)
    evaluateTriggers(player, [clip], s, { 'mouth.open': 0 }, memory)
    evaluateTriggers(player, [clip], s, { 'mouth.open': 0.9 }, memory)
    expect(player.status(clip, s()).time).toBe(0)
  })

  it('gespeicherte Einstellungen werden robust gelesen', () => {
    const parsed = parseAnimationSettings({
      'model.a': { autoplay: true, speed: 99, blend: -1, loop: 'hold', trigger: { source: 'mouth.smile', threshold: 0.7, mode: 'start' } },
      'model.b': { loop: 'quatsch', trigger: 'nein' },
      'model.c': 5
    })
    expect(parsed['model.a']).toEqual({ autoplay: true, speed: 4, blend: 0, loop: 'hold', trigger: { source: 'mouth.smile', threshold: 0.7, mode: 'start' } })
    expect(parsed['model.b']).toEqual({ ...DEFAULT_ANIMATION_SETTINGS })
    expect(parsed['model.c']).toBeUndefined()
    expect(parseAnimationSettings('kaputt')).toEqual({})
  })
})

describe('Figura-Avatar mit Animationen', () => {
  it('liest Animationen beim Laden und ordnet sie den Gruppen zu', async () => {
    const model = {
      meta: { format_version: '4.10', model_format: 'free' },
      resolution: { width: 16, height: 16 },
      elements: [],
      outliner: [{ name: 'RightArm', uuid: 'uuid-arm', origin: [-5, 22, 0], children: [] }, { name: 'Head', uuid: 'uuid-kopf', origin: [0, 24, 0], children: [] }],
      textures: [],
      animations: [rawAnimation()]
    }
    const avatar = await loadFiguraAvatar('A', [{ path: 'model.bbmodel', data: new TextEncoder().encode(JSON.stringify(model)) }])
    expect(avatar.animations.map((a) => a.id)).toEqual(['model.winken'])
    expect(avatar.animations[0]!.tracks[0]!.partId).toBe('figura.model.RightArm')
    expect(avatar.animations[0]!.timeline).toHaveLength(1)
  })
})
