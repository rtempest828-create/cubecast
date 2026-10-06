import { describe, expect, it } from 'vitest'
import {
  matrix4FromQuat,
  quatConjugate,
  quatFromEulerZYX,
  quatFromMatrix4,
  quatMirrorX,
  quatMultiply,
  quatToEulerZYX,
  type Quat
} from '@core/math/quat'
import { relativeHeadRotation } from '@core/tracking/head-pose'

function expectQuatClose(a: Quat, b: Quat): void {
  // q und −q beschreiben dieselbe Rotation.
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1
  a.forEach((v, i) => expect(v).toBeCloseTo(sign * b[i]!, 6))
}

function rotate(q: Quat, v: readonly [number, number, number]): number[] {
  const p: Quat = [v[0], v[1], v[2], 0]
  const r = quatMultiply(quatMultiply(q, p), quatConjugate(q))
  return [r[0], r[1], r[2]]
}

describe('Quaternionen', () => {
  it.each([
    [0, 0, 0],
    [20, 0, 0],
    [0, -35, 0],
    [0, 0, 15],
    [-25, 40, 10],
    [60, -70, -30]
  ])('Euler ZYX (%i°, %i°, %i°) überlebt den Hin- und Rückweg', (x, y, z) => {
    const euler = quatToEulerZYX(quatFromEulerZYX(x, y, z))
    expect(euler[0]).toBeCloseTo(x, 6)
    expect(euler[1]).toBeCloseTo(y, 6)
    expect(euler[2]).toBeCloseTo(z, 6)
  })

  it('positives Nicken (x) dreht die Blickrichtung +Z nach unten', () => {
    const forward = rotate(quatFromEulerZYX(30, 0, 0), [0, 0, 1])
    expect(forward[1]).toBeLessThan(0)
  })

  it('liest die Rotation aus einer spaltenweisen 4×4-Matrix, auch mit Skalierung und Verschiebung', () => {
    const q = quatFromEulerZYX(-12, 33, 7)
    const m = matrix4FromQuat(q, [1, 2, -40])
    for (let i = 0; i < 11; i++) if (i % 4 !== 3) m[i] = m[i]! * 1.7
    expectQuatClose(quatFromMatrix4(m), q)
  })

  it('findet für alle Zweige der Matrix-Umrechnung die richtige Quaternion', () => {
    for (const q of [quatFromEulerZYX(170, 0, 0), quatFromEulerZYX(0, 170, 0), quatFromEulerZYX(0, 0, 170), quatFromEulerZYX(10, 20, 30)]) {
      expectQuatClose(quatFromMatrix4(matrix4FromQuat(q)), q)
    }
  })

  it('Spiegelung kehrt Drehen und Neigen um, Nicken bleibt', () => {
    const [x, y, z] = quatToEulerZYX(quatMirrorX(quatFromEulerZYX(15, 25, -10)))
    expect(x).toBeCloseTo(15, 6)
    expect(y).toBeCloseTo(-25, 6)
    expect(z).toBeCloseTo(10, 6)
  })
})

describe('relativeHeadRotation', () => {
  it('liefert die Rotation relativ zur kalibrierten Neutralhaltung', () => {
    const neutral = quatFromEulerZYX(10, 0, 0) // Kamera steht etwas tiefer
    const current = quatMultiply(quatFromEulerZYX(0, 30, 0), neutral)
    const rotation = relativeHeadRotation(current, neutral, false)
    expect(rotation.yaw).toBeCloseTo(30, 5)
    expect(rotation.pitch).toBeCloseTo(0, 5)
    expect(rotation.roll).toBeCloseTo(0, 5)
  })

  it('spiegelt auf Wunsch', () => {
    const neutral = quatFromEulerZYX(0, 0, 0)
    const rotation = relativeHeadRotation(quatFromEulerZYX(5, 30, 12), neutral, true)
    expect(rotation.pitch).toBeCloseTo(5, 5)
    expect(rotation.yaw).toBeCloseTo(-30, 5)
    expect(rotation.roll).toBeCloseTo(-12, 5)
  })
})
