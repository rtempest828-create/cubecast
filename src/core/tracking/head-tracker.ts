import { IDENTITY_QUAT, quatFromMatrix4, type Quat } from '../math/quat'
import { relativeHeadRotation } from './head-pose'
import { OneEuroFilter, oneEuroParamsFromSliders } from './one-euro'
import type { FaceTrackingResult, HeadRotation } from './types'

export interface HeadTrackerSettings {
  /** 0…1, siehe `oneEuroParamsFromSliders`. */
  readonly smoothing: number
  /** 0…1, siehe `oneEuroParamsFromSliders`. */
  readonly reaction: number
  /** Verstärkung der Kopfbewegung (1 = 1:1). */
  readonly intensity: number
  /** Figur verhält sich wie ein Spiegelbild. */
  readonly mirror: boolean
}

export const DEFAULT_HEAD_SETTINGS: HeadTrackerSettings = { smoothing: 0.5, reaction: 0.5, intensity: 1, mirror: true }

/** Maximale Ausschläge in Grad, damit der Kopf nie unnatürlich verdreht wird. */
export const HEAD_LIMITS: HeadRotation = { pitch: 60, yaw: 80, roll: 50 }

/** So lange (ms) darf das Gesicht fehlen, bevor der Kopf zur Mitte zurückkehrt. */
export const LOST_FACE_DELAY_MS = 400

/** Zeitkonstante (s) für die Rückkehr zur Mitte. */
export const RETURN_TIME_CONSTANT = 0.35

type Axis = keyof HeadRotation
const AXES: readonly Axis[] = ['pitch', 'yaw', 'roll']

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value))
}

/**
 * Wandelt Tracking-Ergebnisse in eine geglättete Kopfrotation um:
 * Kalibrierung → Spiegelung → One-Euro-Filter → Verstärkung → Begrenzung.
 * Ohne Gesicht kehrt der Kopf nach kurzer Zeit sanft zur Neutralhaltung zurück.
 */
export class HeadTracker {
  private settings: HeadTrackerSettings
  private readonly filters: Record<Axis, OneEuroFilter>
  private neutral: Quat = IDENTITY_QUAT
  private lastRaw: Quat | null = null
  private lastFrameId = -1
  private lastFaceTime = -Infinity
  private lastUpdate: number | null = null
  /** Gefilterte Rotation vor Verstärkung/Begrenzung. */
  private filtered: Record<Axis, number> = { pitch: 0, yaw: 0, roll: 0 }

  constructor(settings: HeadTrackerSettings = DEFAULT_HEAD_SETTINGS) {
    this.settings = settings
    const params = oneEuroParamsFromSliders(settings.smoothing, settings.reaction)
    this.filters = { pitch: new OneEuroFilter(params), yaw: new OneEuroFilter(params), roll: new OneEuroFilter(params) }
  }

  setSettings(settings: HeadTrackerSettings): void {
    const mirrorChanged = settings.mirror !== this.settings.mirror
    this.settings = settings
    const params = oneEuroParamsFromSliders(settings.smoothing, settings.reaction)
    for (const axis of AXES) {
      this.filters[axis].setParams(params)
      if (mirrorChanged) this.filters[axis].reset()
    }
  }

  /** Ob gerade (innerhalb der Toleranz) ein Gesicht erkannt wird. */
  hasFace(nowMs: number): boolean {
    return nowMs - this.lastFaceTime <= LOST_FACE_DELAY_MS
  }

  get isCalibrated(): boolean {
    return this.neutral !== IDENTITY_QUAT
  }

  /** Übernimmt die zuletzt gemessene Kopfhaltung als „geradeaus“. */
  calibrate(): boolean {
    if (!this.lastRaw) return false
    this.neutral = this.lastRaw
    for (const axis of AXES) this.filters[axis].reset()
    this.filtered = { pitch: 0, yaw: 0, roll: 0 }
    return true
  }

  resetCalibration(): void {
    this.neutral = IDENTITY_QUAT
    for (const axis of AXES) this.filters[axis].reset()
  }

  update(result: FaceTrackingResult | null, nowMs: number): HeadRotation {
    const dt = this.lastUpdate === null ? 0 : Math.max(0, (nowMs - this.lastUpdate) / 1000)
    this.lastUpdate = nowMs

    if (result && result.frameId !== this.lastFrameId) {
      this.lastFrameId = result.frameId
      if (result.faceFound && result.matrix) {
        const raw = quatFromMatrix4(result.matrix)
        this.lastRaw = raw
        this.lastFaceTime = nowMs
        const relative = relativeHeadRotation(raw, this.neutral, this.settings.mirror)
        const time = result.captureTime / 1000
        for (const axis of AXES) this.filtered[axis] = this.filters[axis].filter(relative[axis], time)
        return this.output()
      }
    }

    if (!this.hasFace(nowMs) && dt > 0) {
      // Sanft zur Mitte zurück; Filter mitführen, damit beim Wiederfinden nichts springt.
      const keep = Math.exp(-dt / RETURN_TIME_CONSTANT)
      for (const axis of AXES) {
        this.filtered[axis] *= keep
        this.filters[axis].setState(this.filtered[axis], nowMs / 1000)
      }
    }
    return this.output()
  }

  private output(): HeadRotation {
    const k = this.settings.intensity
    return {
      pitch: clamp(this.filtered.pitch * k, HEAD_LIMITS.pitch),
      yaw: clamp(this.filtered.yaw * k, HEAD_LIMITS.yaw),
      roll: clamp(this.filtered.roll * k, HEAD_LIMITS.roll)
    }
  }
}
