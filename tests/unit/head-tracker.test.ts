import { describe, expect, it } from 'vitest'
import { matrix4FromQuat, quatFromEulerZYX } from '@core/math/quat'
import { blendshapeIndex, blendshapesFromCategories, BLENDSHAPE_COUNT } from '@core/tracking/blendshapes'
import { HEAD_LIMITS, HeadTracker, LOST_FACE_DELAY_MS } from '@core/tracking/head-tracker'
import type { FaceTrackingResult } from '@core/tracking/types'

let frameId = 0

/** Simuliertes Tracking-Ergebnis mit gegebener Kopfrotation (Grad, unverspiegelt). */
function frame(timeMs: number, pitch: number, yaw: number, roll: number, faceFound = true): FaceTrackingResult {
  return {
    frameId: ++frameId,
    captureTime: timeMs,
    faceFound,
    blendshapes: null,
    matrix: faceFound ? Float32Array.from(matrix4FromQuat(quatFromEulerZYX(pitch, yaw, roll), [0, 0, -45])) : null,
    processingMs: 5
  }
}

/** Führt den Tracker mit 30 Hz über `seconds` Sekunden mit konstanter Kopfhaltung. */
function hold(tracker: HeadTracker, startMs: number, seconds: number, pitch: number, yaw: number, roll: number): { end: number; last: ReturnType<HeadTracker['update']> } {
  let last = tracker.update(null, startMs)
  let t = startMs
  for (let i = 0; i < seconds * 30; i++) {
    t = startMs + (i * 1000) / 30
    last = tracker.update(frame(t, pitch, yaw, roll), t)
  }
  return { end: t, last }
}

const unmirrored = { smoothing: 0.3, reaction: 0.5, intensity: 1, mirror: false }

describe('HeadTracker', () => {
  it('folgt einer festen Kopfhaltung (ohne Spiegelung)', () => {
    const tracker = new HeadTracker(unmirrored)
    const { last } = hold(tracker, 0, 3, 10, 25, -5)
    expect(last.pitch).toBeCloseTo(10, 1)
    expect(last.yaw).toBeCloseTo(25, 1)
    expect(last.roll).toBeCloseTo(-5, 1)
  })

  it('spiegelt Drehen und Neigen', () => {
    const tracker = new HeadTracker({ ...unmirrored, mirror: true })
    const { last } = hold(tracker, 0, 3, 10, 25, -5)
    expect(last.pitch).toBeCloseTo(10, 1)
    expect(last.yaw).toBeCloseTo(-25, 1)
    expect(last.roll).toBeCloseTo(5, 1)
  })

  it('Kalibrierung macht die aktuelle Haltung zu „geradeaus“', () => {
    const tracker = new HeadTracker(unmirrored)
    const { end } = hold(tracker, 0, 1, 15, 5, 0)
    expect(tracker.isCalibrated).toBe(false)
    expect(tracker.calibrate()).toBe(true)
    expect(tracker.isCalibrated).toBe(true)
    const { last } = hold(tracker, end + 33, 2, 15, 5, 0)
    expect(Math.abs(last.pitch)).toBeLessThan(0.5)
    expect(Math.abs(last.yaw)).toBeLessThan(0.5)
  })

  it('kann ohne Gesicht nicht kalibrieren', () => {
    expect(new HeadTracker(unmirrored).calibrate()).toBe(false)
  })

  it('verstärkt die Bewegung und begrenzt sie', () => {
    const tracker = new HeadTracker({ ...unmirrored, intensity: 2 })
    const { last } = hold(tracker, 0, 3, 5, 70, 0)
    expect(last.pitch).toBeCloseTo(10, 0)
    expect(last.yaw).toBe(HEAD_LIMITS.yaw)
  })

  it('kehrt ohne Gesicht sanft zur Mitte zurück', () => {
    const tracker = new HeadTracker(unmirrored)
    const { end } = hold(tracker, 0, 2, 0, 30, 0)
    // Kurz nach dem Verlust: noch ausgelenkt (Toleranz gegen kurze Aussetzer)
    let rotation = tracker.update(frame(end + 100, 0, 0, 0, false), end + 100)
    expect(rotation.yaw).toBeGreaterThan(25)
    expect(tracker.hasFace(end + 100)).toBe(true)
    // Nach zwei Sekunden: fast in der Mitte
    for (let t = end + 133; t <= end + 2400; t += 33) rotation = tracker.update(null, t)
    expect(tracker.hasFace(end + 2400)).toBe(false)
    expect(Math.abs(rotation.yaw)).toBeLessThan(1)
    expect(end + LOST_FACE_DELAY_MS).toBeLessThan(end + 2400)
  })

  it('wertet dasselbe Ergebnis nicht doppelt aus', () => {
    const tracker = new HeadTracker(unmirrored)
    const result = frame(0, 0, 20, 0)
    const first = tracker.update(result, 0)
    const second = tracker.update(result, 16)
    expect(second).toEqual(first)
  })
})

describe('Blendshapes', () => {
  it('ordnet MediaPipe-Kategorien über den Namen zu und ignoriert Unbekanntes', () => {
    const values = blendshapesFromCategories([
      { categoryName: 'jawOpen', score: 0.8 },
      { categoryName: 'eyeBlinkLeft', score: 1.2 },
      { categoryName: 'tongueOut', score: 0.5 }
    ])
    expect(values.length).toBe(BLENDSHAPE_COUNT)
    expect(values[blendshapeIndex('jawOpen')]).toBeCloseTo(0.8)
    expect(values[blendshapeIndex('eyeBlinkLeft')]).toBe(1)
    expect(BLENDSHAPE_COUNT).toBe(52)
  })
})
