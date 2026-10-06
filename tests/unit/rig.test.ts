import { describe, expect, it } from 'vitest'
import type { AvatarModel, PartNode } from '@core/model/avatar-model'
import { buildVanillaAvatar } from '@core/model/vanilla-avatar'
import { createDriver, DriverSmoother } from '@core/roles/drivers'
import { assignmentOf, createDefaultRig, evaluateRig, FACE_PART_IDS, parseRig, rerunAutoDetection, withAssignment } from '@core/roles/rig'
import { buildSignals } from '@core/tracking/signals'
import { createPlaceholderSkin } from '@core/skin/placeholder-skin'
import { normalizeSkin } from '@core/skin/skin'

const vanilla = buildVanillaAvatar(normalizeSkin(createPlaceholderSkin()), 'classic')

/** Modell mit zusätzlichen Figura-artigen Teilen (wie ab M5a). */
function withCustomParts(names: string[]): AvatarModel {
  const extra: PartNode[] = names.map((name) => ({ id: `bb.${name}`, name, origin: 'bbmodel', pivot: [0, 24, 0], rotation: [0, 0, 0], visible: true, cubes: [], children: [] }))
  return { ...vanilla, root: { ...vanilla.root, children: [...vanilla.root.children, ...extra] } }
}

describe('Standard-Zuordnung', () => {
  it('ordnet Vanilla-Teile und Gesichtsmerkmale fest zu', () => {
    const rig = createDefaultRig(vanilla)
    expect(assignmentOf(rig, 'vanilla.head')?.role).toBe('head')
    expect(assignmentOf(rig, 'vanilla.head')?.drivers[0]?.mode).toBe('headRotation')
    expect(assignmentOf(rig, FACE_PART_IDS.leftEye)?.role).toBe('leftEye')
    expect(assignmentOf(rig, FACE_PART_IDS.mouth)?.drivers[0]?.mode).toBe('faceMouth')
    expect(rig.assignments.every((a) => a.confirmed)).toBe(true)
    // Außenschicht und Overlay-Ebene selbst haben keine Rolle
    expect(assignmentOf(rig, 'vanilla.hat')).toBeUndefined()
  })

  it('schlägt Rollen für eigene Teile nur vor (unbestätigt)', () => {
    const rig = createDefaultRig(withCustomParts(['LeftEar', 'tail', 'Cube']))
    expect(assignmentOf(rig, 'bb.LeftEar')).toMatchObject({ role: 'leftEar', confirmed: false })
    expect(assignmentOf(rig, 'bb.tail')?.role).toBe('tail')
    expect(assignmentOf(rig, 'bb.Cube')).toBeUndefined()
  })

  it('Auto-Erkennung neu ausführen behält Bestätigtes', () => {
    const model = withCustomParts(['LeftEar'])
    let rig = createDefaultRig(model)
    rig = withAssignment(rig, 'bb.LeftEar', { partId: 'bb.LeftEar', role: 'hair', confirmed: true, drivers: [] })
    expect(assignmentOf(rerunAutoDetection(rig, model), 'bb.LeftEar')?.role).toBe('hair')
  })
})

describe('Laden gespeicherter Zuordnungen', () => {
  it('übersteht Unsinn und liefert Standardwerte', () => {
    for (const garbage of [null, 42, 'x', [], { version: 99 }]) {
      const { rig } = parseRig(garbage, vanilla)
      expect(rig.assignments.length).toBe(createDefaultRig(vanilla).assignments.length)
    }
    expect(parseRig({ version: 99 }, vanilla).warnings.length).toBe(1)
    expect(parseRig(null, vanilla).warnings).toEqual([])
  })

  it('verwirft unbekannte Teile, ungültige Rollen und Treiber mit Warnung', () => {
    const { rig, warnings } = parseRig(
      {
        version: 1,
        assignments: [
          { partId: 'gibtsnicht', role: 'head', confirmed: true, drivers: [] },
          { partId: 'vanilla.body', role: 'quatsch', confirmed: true, drivers: [] },
          { partId: 'vanilla.leftArm', role: 'custom:Winken', confirmed: true, drivers: [{ mode: 'rotation', axis: 'z', outputMax: 90, sensitivity: 999 }, { mode: 'teleport' }] }
        ],
        face: { enabled: false, layout: { rightEye: { x: 1, y: 4, w: 2, h: 1 }, mouth: { x: 7, y: 7, w: 5, h: 1 } } }
      },
      vanilla
    )
    expect(warnings.length).toBe(3)
    const arm = assignmentOf(rig, 'vanilla.leftArm')
    expect(arm?.role).toBe('custom:Winken')
    expect(arm?.drivers).toHaveLength(1)
    expect(arm?.drivers[0]).toMatchObject({ mode: 'rotation', axis: 'z', outputMax: 90, sensitivity: 10 })
    expect(rig.face.enabled).toBe(false)
    expect(rig.face.layout?.rightEye).toEqual({ x: 1, y: 4, w: 2, h: 1 })
    expect(rig.face.layout?.mouth).toBeNull() // ragt aus dem Gesicht
    // Fehlende Standard-Zuordnungen werden ergänzt
    expect(assignmentOf(rig, 'vanilla.head')?.role).toBe('head')
  })

  it('übersteht JSON-Rundreise unverändert', () => {
    const rig = createDefaultRig(vanilla)
    expect(parseRig(JSON.parse(JSON.stringify(rig)), vanilla).rig).toEqual(rig)
  })
})

describe('Auswertung pro Frame', () => {
  it('Kopf folgt den Kopfwinkeln, Gesichtsmerkmale bekommen Bildnummern', () => {
    const rig = createDefaultRig(vanilla)
    const signals = buildSignals({ eyeBlinkLeft: 0.9, jawOpen: 0.6, eyeLookOutLeft: 1, eyeLookInRight: 1 }, { pitch: 10, yaw: -20, roll: 3 })
    const { pose } = evaluateRig(rig, signals, 0.016, new DriverSmoother())
    expect(pose.get('vanilla.head')?.rotation).toEqual([10, -20, 3])
    expect(pose.get(FACE_PART_IDS.leftEye)?.frame).toBe(2)
    expect(pose.get(FACE_PART_IDS.rightEye)?.frame).toBe(0)
    expect(pose.get(FACE_PART_IDS.mouth)?.frame).toBe(2) // „open“
    expect(pose.get(FACE_PART_IDS.leftPupil)?.position[0]).toBeCloseTo(1)
  })

  it('wendet Rotation, Position, Skalierung und Sichtbarkeit an; Vorschläge wirken nicht', () => {
    let rig = createDefaultRig(withCustomParts(['LeftEar']))
    rig = withAssignment(rig, 'vanilla.leftArm', {
      partId: 'vanilla.leftArm',
      role: 'leftArm',
      confirmed: true,
      drivers: [
        createDriver('rotation', { id: 'r', source: 'mouth.open', axis: 'z', outputMin: 0, outputMax: 90 }),
        createDriver('position', { id: 'p', source: 'mouth.open', axis: 'y', outputMin: 0, outputMax: 2 }),
        createDriver('scale', { id: 's', source: 'mouth.open', axis: 'x', outputMin: 1, outputMax: 3 }),
        createDriver('visibility', { id: 'v', source: 'mouth.open', thresholds: [0.8] })
      ]
    })
    const { pose, driverValues } = evaluateRig(rig, buildSignals({ jawOpen: 0.5 }, { pitch: 0, yaw: 0, roll: 0 }), 0.016, new DriverSmoother())
    const arm = pose.get('vanilla.leftArm')
    expect(arm?.rotation[2]).toBeCloseTo(45)
    expect(arm?.position[1]).toBeCloseTo(1)
    expect(arm?.scale[0]).toBeCloseTo(2)
    expect(arm?.visible).toBe(false)
    expect(driverValues.get('vanilla.leftArm/r')?.output).toBeCloseTo(45)
    expect(pose.has('bb.LeftEar')).toBe(false)
  })
})
