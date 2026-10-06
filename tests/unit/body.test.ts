import { describe, expect, it } from 'vitest'
import { matrix4FromQuat, quatFromEulerZYX } from '@core/math/quat'
import { buildVanillaAvatar } from '@core/model/vanilla-avatar'
import { applyBody, DEFAULT_BODY_SETTINGS, rotateGroup, type BodySettings } from '@core/pipeline/body'
import { PoseBuilder } from '@core/pipeline/pose'
import { createDefaultRig } from '@core/roles/rig'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin } from '@core/skin/skin'
import { HeadTracker } from '@core/tracking/head-tracker'
import { buildSignals } from '@core/tracking/signals'

const model = buildVanillaAvatar(normalizeSkin(createPlaceholderSkin()), 'classic')
const rig = createDefaultRig(model)
const still: BodySettings = { follow: 1, breathing: 0, sway: 0, armIdle: false }
const neutral = { pitch: 0, yaw: 0, roll: 0 }

function run(settings: BodySettings, signals = buildSignals(null, neutral), timeSec = 0, arms: Parameters<typeof applyBody>[4]['arms'] = null): PoseBuilder {
  const pose = new PoseBuilder()
  applyBody(pose, model, rig, settings, { timeSec, signals, arms })
  return pose
}

describe('Körper', () => {
  it('ohne Bewegung und ohne Leerlauf bleibt alles in Ruhe', () => {
    const pose = run(still)
    for (const id of ['vanilla.body', 'vanilla.leftArm', 'vanilla.head']) {
      const p = pose.peek(id)
      if (p) {
        p.rotation.forEach((v) => expect(v).toBeCloseTo(0, 6))
        p.position.forEach((v) => expect(v).toBeCloseTo(0, 6))
      }
    }
  })

  it('Arme wippen im Leerlauf nach außen (wie Minecraft)', () => {
    const pose = run({ ...still, armIdle: true })
    expect(pose.peek('vanilla.leftArm')!.rotation[2]).toBeGreaterThan(0) // linker Arm (+X) nach außen
    expect(pose.peek('vanilla.rightArm')!.rotation[2]).toBeLessThan(0)
  })

  it('Kopf zur Seite → Oberkörper neigt sich um die Hüfte, Beine bleiben stehen', () => {
    const pose = run(still, buildSignals(null, neutral, [10, 0, 0]))
    const body = pose.peek('vanilla.body')!
    expect(body.rotation[2]).toBeLessThan(0) // Neigung zur linken Seite der Figur (+X)
    expect(body.position[0]).toBeGreaterThan(0) // Hals wandert mit
    expect(pose.peek('vanilla.leftLeg')).toBeUndefined()
    // Kopf wird mitbewegt, behält aber seine getrackte Ausrichtung
    const head = pose.peek('vanilla.head')!
    expect(head.position[0]).toBeGreaterThan(0)
    expect(head.rotation[2]).toBeCloseTo(0, 6)
  })

  it('die Neigung ist begrenzt', () => {
    const pose = run({ ...still, follow: 2 }, buildSignals(null, { pitch: 0, yaw: 0, roll: 50 }, [30, 0, 0]))
    expect(Math.abs(pose.peek('vanilla.body')!.rotation[2])).toBeLessThanOrEqual(12.0001)
  })

  it('Arm-Tracking überblendet den Leerlauf', () => {
    const arms = { left: { rotation: [0, 0, 90] as const, weight: 1 }, right: { rotation: [0, 0, 0] as const, weight: 0 } }
    const pose = run({ ...still, armIdle: true }, buildSignals(null, neutral), 0, arms)
    expect(pose.peek('vanilla.leftArm')!.rotation[2]).toBeCloseTo(90, 3)
    expect(pose.peek('vanilla.rightArm')!.rotation[2]).toBeLessThan(0) // rechts weiter Leerlauf
  })

  it('Atmen und Schwanken bewegen sich über die Zeit', () => {
    const settings = { ...DEFAULT_BODY_SETTINGS, follow: 0 }
    const a = run(settings, buildSignals(null, neutral), 0)
    const b = run(settings, buildSignals(null, neutral), 1.2)
    expect(a.peek('vanilla.head')!.position[1]).not.toBeCloseTo(b.peek('vanilla.head')!.position[1], 4)
  })

  it('Gruppendrehung um einen Punkt verschiebt den Drehpunkt korrekt', () => {
    const pose = new PoseBuilder()
    // Teil mit Drehpunkt 10 über dem Zentrum, 90° um Z → landet 10 links (−X)
    rotateGroup(pose, new Map([['a', [0, 10, 0] as const]]), ['a'], [0, 0, 0], [0, 0, 90])
    expect(pose.peek('a')!.position[0]).toBeCloseTo(-10)
    expect(pose.peek('a')!.position[1]).toBeCloseTo(-10)
    expect(pose.peek('a')!.rotation[2]).toBeCloseTo(90)
  })
})

describe('Kopfposition', () => {
  let frameId = 0
  const frame = (t: number, x: number, z: number) => ({
    frameId: ++frameId,
    captureTime: t,
    faceFound: true,
    blendshapes: null,
    matrix: Float32Array.from(matrix4FromQuat(quatFromEulerZYX(0, 0, 0), [x, 0, -50 + z])),
    processingMs: 1
  })

  it('misst die Verschiebung gegenüber der ersten Position; Spiegeln kehrt x um', () => {
    const plain = new HeadTracker({ smoothing: 0, reaction: 1, intensity: 1, mirror: false })
    const mirrored = new HeadTracker({ smoothing: 0, reaction: 1, intensity: 1, mirror: true })
    for (const tracker of [plain, mirrored]) {
      tracker.update(frame(0, 0, 0), 0)
      for (let i = 1; i < 60; i++) tracker.update(frame(i * 33, 6, 4), i * 33)
    }
    expect(plain.position[0]).toBeCloseTo(6, 0)
    expect(plain.position[2]).toBeCloseTo(4, 0)
    expect(mirrored.position[0]).toBeCloseTo(-6, 0)
  })
})
