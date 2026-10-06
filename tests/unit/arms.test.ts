import { describe, expect, it } from 'vitest'
import { quatFromEulerZYX, quatRotate } from '@core/math/quat'
import type { Vec3 } from '@core/math/vec'
import { ArmTracker, armRotationFor, armTargetsFromPose, POSE_FLOATS, POSE_POINTS, type PosePoint } from '@core/tracking/arms'

/** Wendet die berechnete Rotation auf den hängenden Arm (−Y) an. */
function pointsTo(rotation: Vec3): Vec3 {
  return quatRotate(quatFromEulerZYX(rotation[0], rotation[1], rotation[2]), [0, -1, 0])
}

function packed(points: Partial<Record<PosePoint, [number, number, number, number]>>): Float32Array {
  const array = new Float32Array(POSE_FLOATS)
  for (const [name, value] of Object.entries(points)) array.set(value, POSE_POINTS.indexOf(name as PosePoint) * 4)
  return array
}

describe('Arm-Rotation', () => {
  it.each([
    [[0, -1, 0]],
    [[1, 0, 0]],
    [[-1, 0, 0]],
    [[0, 0, 1]],
    [[0, 1, 0.01]],
    [[0.5, -0.5, 0.7]]
  ] as const)('zeigt in Richtung %o', (direction) => {
    const rotation = armRotationFor(direction as unknown as Vec3)!
    const result = pointsTo(rotation)
    const length = Math.hypot(...direction)
    result.forEach((v, i) => expect(v).toBeCloseTo(direction[i]! / length, 4))
  })

  it('kann aus einem Nullvektor keine Richtung bilden', () => {
    expect(armRotationFor([0, 0, 0])).toBeNull()
  })
})

describe('Arme aus dem Pose-Modell', () => {
  // MediaPipe: x rechts im Bild, y nach unten, z von der Kamera weg.
  // Person hebt den linken Arm seitlich (im unverspiegelten Bild nach rechts = +x).
  const pose = packed({
    leftShoulder: [0.2, -0.5, 0, 1],
    leftWrist: [0.75, -0.5, 0, 1],
    rightShoulder: [-0.2, -0.5, 0, 1],
    rightWrist: [-0.2, 0.05, 0, 1]
  })

  it('ohne Spiegeln hebt die Figur ihren linken Arm zur Seite', () => {
    const targets = armTargetsFromPose(pose, false)
    const left = pointsTo(targets.left!)
    expect(left[0]).toBeCloseTo(1, 3) // zur linken Seite der Figur (+X)
    const right = pointsTo(targets.right!)
    expect(right[1]).toBeCloseTo(-1, 3) // hängt
  })

  it('gespiegelt hebt die Figur ihren rechten Arm (wie ein Spiegelbild)', () => {
    const targets = armTargetsFromPose(pose, true)
    const right = pointsTo(targets.right!)
    expect(right[0]).toBeCloseTo(-1, 3) // zur rechten Seite der Figur (−X)
    expect(pointsTo(targets.left!)[1]).toBeCloseTo(-1, 3)
  })

  it('nach vorne gestreckt (zur Kamera, z kleiner)', () => {
    const forward = packed({ leftShoulder: [0, 0, 0, 1], leftWrist: [0, 0, -0.5, 1] })
    expect(pointsTo(armTargetsFromPose(forward, false).left!)[2]).toBeCloseTo(1, 3)
  })

  it('unsichtbare Schulter → kein Ziel; verdecktes Handgelenk → Ellbogen', () => {
    expect(armTargetsFromPose(packed({ leftShoulder: [0, 0, 0, 0.1], leftWrist: [1, 0, 0, 1] }), false).left).toBeNull()
    const elbowOnly = packed({ leftShoulder: [0, 0, 0, 1], leftElbow: [0.3, 0, 0, 1], leftWrist: [0, 0, 0, 0.1] })
    expect(pointsTo(armTargetsFromPose(elbowOnly, false).left!)[0]).toBeCloseTo(1, 3)
  })

  it('Tracker blendet weich zwischen Tracking und Leerlauf', () => {
    const tracker = new ArmTracker()
    let state = tracker.update({ left: [0, 0, 90], right: null }, 0, 1 / 30)
    for (let i = 1; i < 30; i++) state = tracker.update({ left: [0, 0, 90], right: null }, i / 30, 1 / 30)
    expect(state.left.weight).toBeGreaterThan(0.9)
    expect(state.left.rotation[2]).toBeCloseTo(90, 0)
    expect(state.right.weight).toBe(0)
    for (let i = 30; i < 60; i++) state = tracker.update(null, i / 30, 1 / 30)
    expect(state.left.weight).toBeLessThan(0.1)
  })
})
