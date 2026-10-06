import { describe, expect, it } from 'vitest'
import { findPart, walkParts } from '@core/model/avatar-model'
import { buildVanillaAvatar } from '@core/model/vanilla-avatar'
import { PhysicsSystem, physicsParams } from '@core/physics/physics'
import { PoseBuilder } from '@core/pipeline/pose'
import { assignmentOf, createDefaultRig, withDefaults } from '@core/roles/rig'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin } from '@core/skin/skin'

const skin = normalizeSkin(createPlaceholderSkin())
const cosmetics = { foxEars: true, foxTail: true, headset: true }
const model = buildVanillaAvatar(skin, 'classic', cosmetics)
const rig = { ...createDefaultRig(model), cosmetics }
const settings = { enabled: true, strength: 1 }

/** Simuliert n Frames à 1/60 s; `headYaw(t)` und `bodyX(t)` bewegen Kopf bzw. Körper. */
function simulate(frames: number, headYaw: (t: number) => number, bodyX: (t: number) => number = () => 0): { physics: PhysicsSystem; history: number[][] } {
  const physics = new PhysicsSystem()
  const history: number[][] = []
  for (let i = 0; i < frames; i++) {
    const t = i / 60
    const pose = new PoseBuilder()
    pose.part('vanilla.head').rotation[1] = headYaw(t)
    pose.part('vanilla.head').rotation[2] = headYaw(t) // Neigen bewegt aufrechte Ohren
    pose.part('vanilla.body').position[0] = bodyX(t)
    physics.step(model, rig, pose, i === 0 ? 0 : 1 / 60, t, settings)
    history.push([...physics.angleOf('cosmetic.ear.left'), ...physics.angleOf('cosmetic.tail.1'), ...physics.angleOf('cosmetic.tail.3')])
  }
  return { physics, history }
}

describe('Test-Zubehör', () => {
  it('baut Ohren, dreiteiligen Schwanz und Headset an Kopf bzw. Körper', () => {
    expect(findPart(model.root, 'vanilla.head')!.children.map((c) => c.id)).toEqual(expect.arrayContaining(['cosmetic.ear.left', 'cosmetic.ear.right', 'cosmetic.headset']))
    expect(findPart(model.root, 'cosmetic.tail.1')!.children[0]!.children[0]!.id).toBe('cosmetic.tail.3')
    expect(model.textures.has('cosmetics')).toBe(true)
  })

  it('bekommt automatisch bestätigte Rollen mit Physik', () => {
    expect(assignmentOf(rig, 'cosmetic.ear.left')).toMatchObject({ role: 'leftEar', confirmed: true })
    expect(assignmentOf(rig, 'cosmetic.tail.2')?.drivers[0]?.physics.axes).toEqual(['x', 'y'])
    expect(assignmentOf(rig, 'cosmetic.headset')?.role).toBe('accessory')
  })

  it('ohne Zubehör keine Zubehör-Teile; Einschalten ergänzt Rollen', () => {
    const plain = buildVanillaAvatar(skin, 'classic')
    let count = 0
    walkParts(plain.root, (p) => {
      if (p.origin === 'cosmetic') count++
    })
    expect(count).toBe(0)
    const plainRig = createDefaultRig(plain)
    expect(assignmentOf(withDefaults(plainRig, model), 'cosmetic.tail.1')?.role).toBe('tail')
  })
})

describe('Physik', () => {
  it('in Ruhe bleibt alles in Ruhe (bis auf leichtes Schwanzwedeln)', () => {
    const { history } = simulate(120, () => 0)
    const last = history.at(-1)!
    expect(Math.abs(last[0]!) + Math.abs(last[2]!)).toBeLessThan(1e-6) // Ohr
    expect(Math.abs(last[4]!)).toBeLessThan(0.15) // Schwanz wedelt minimal um Y
  })

  it('Ohren schwingen nach einer Kopfbewegung nach und kommen wieder zur Ruhe', () => {
    const step = (t: number): number => (t < 0.5 ? 0 : 25)
    const { history } = simulate(240, step)
    const earZ = history.map((h) => h[2]!)
    const peak = Math.max(...earZ.slice(30, 90).map(Math.abs))
    expect(peak).toBeGreaterThan(0.05)
    expect(Math.abs(earZ.at(-1)!)).toBeLessThan(peak / 5)
  })

  it('Seitliche Körperbewegung lässt den Schwanz zurückbleiben', () => {
    const move = (t: number): number => (t < 0.3 ? 0 : Math.min(8, (t - 0.3) * 40))
    const { history } = simulate(60, () => 0, move)
    // Körper beschleunigt nach +X → Schwanz (zeigt nach −Z) schwingt per Y-Drehung zur −X-Seite
    const tailY = history.slice(20, 40).map((h) => h[4]!)
    expect(Math.max(...tailY)).toBeGreaterThan(0.02)
  })

  it('Kettenglieder reagieren auch (Peitscheneffekt)', () => {
    const move = (t: number): number => Math.sin(t * 6) * 4
    const { history } = simulate(180, () => 0, move)
    const tipY = history.map((h) => h[7]!)
    expect(Math.max(...tipY.map(Math.abs))).toBeGreaterThan(0.01)
  })

  it('bleibt bei extremen Sprüngen stabil und endlich', () => {
    const { history } = simulate(120, (t) => (Math.floor(t * 30) % 2 === 0 ? -80 : 80), (t) => (Math.floor(t * 30) % 2) * 100)
    for (const values of history) for (const v of values) expect(Number.isFinite(v) && Math.abs(v) <= 1.1).toBe(true)
  })

  it('ausgeschaltet: keine Auslenkung', () => {
    const physics = new PhysicsSystem()
    const pose = new PoseBuilder()
    pose.part('vanilla.head').rotation[2] = 40
    physics.step(model, rig, pose, 1 / 60, 0, { enabled: false, strength: 1 })
    expect(pose.peek('cosmetic.ear.left')).toBeUndefined()
  })

  it('Parameter: mehr Stärke = weicher und stärker angeregt, mehr Dämpfung = stärker gedämpft', () => {
    expect(physicsParams(1, 0.5).stiffness).toBeLessThan(physicsParams(0, 0.5).stiffness)
    expect(physicsParams(1, 0.5).gain).toBeGreaterThan(physicsParams(0, 0.5).gain)
    expect(physicsParams(0.5, 1).damping).toBeGreaterThan(physicsParams(0.5, 0).damping)
  })
})
