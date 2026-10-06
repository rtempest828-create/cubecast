import { IDENTITY_QUAT, quatFromMatrix4, type Quat } from '../math/quat'
import type { Vec3 } from '../math/vec'
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

/** Maximale Kopfverschiebung gegenüber der Neutralhaltung (cm). */
export const POSITION_LIMIT_CM = 30

/** So lange (ms) darf das Gesicht fehlen, bevor der Kopf zur Mitte zurückkehrt. */
export const LOST_FACE_DELAY_MS = 400

/** Zeitkonstante (s) für die Rückkehr zur Mitte. */
export const RETURN_TIME_CONSTANT = 0.35

/** Kanäle: Rotation (Grad) und Position (cm). */
const CHANNELS = ['pitch', 'yaw', 'roll', 'x', 'y', 'z'] as const
type Channel = (typeof CHANNELS)[number]

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value))
}

/**
 * Wandelt Tracking-Ergebnisse in eine geglättete Kopfrotation und -position um:
 * Kalibrierung → Spiegelung → One-Euro-Filter → Verstärkung → Begrenzung.
 * Ohne Gesicht kehrt der Kopf nach kurzer Zeit sanft zur Neutralhaltung zurück.
 */
export class HeadTracker {
  private settings: HeadTrackerSettings
  private readonly filters: Record<Channel, OneEuroFilter>
  private neutral: Quat = IDENTITY_QUAT
  /** Neutrale Kopfposition (cm); ohne Kalibrierung die erste gemessene Position. */
  private neutralPosition: Vec3 | null = null
  private lastRaw: Quat | null = null
  private lastRawPosition: Vec3 | null = null
  private lastFrameId = -1
  private lastFaceTime = -Infinity
  private lastUpdate: number | null = null
  /** Gefilterte Werte vor Verstärkung/Begrenzung. */
  private filtered: Record<Channel, number> = { pitch: 0, yaw: 0, roll: 0, x: 0, y: 0, z: 0 }

  constructor(settings: HeadTrackerSettings = DEFAULT_HEAD_SETTINGS) {
    this.settings = settings
    const params = oneEuroParamsFromSliders(settings.smoothing, settings.reaction)
    this.filters = Object.fromEntries(CHANNELS.map((c) => [c, new OneEuroFilter(params)])) as Record<Channel, OneEuroFilter>
  }

  setSettings(settings: HeadTrackerSettings): void {
    const mirrorChanged = settings.mirror !== this.settings.mirror
    this.settings = settings
    const params = oneEuroParamsFromSliders(settings.smoothing, settings.reaction)
    for (const channel of CHANNELS) {
      this.filters[channel].setParams(params)
      if (mirrorChanged) this.filters[channel].reset()
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
    this.neutralPosition = this.lastRawPosition
    for (const channel of CHANNELS) {
      this.filters[channel].reset()
      this.filtered[channel] = 0
    }
    return true
  }

  resetCalibration(): void {
    this.neutral = IDENTITY_QUAT
    this.neutralPosition = null
    for (const channel of CHANNELS) this.filters[channel].reset()
  }

  /** Kopfverschiebung gegenüber der Neutralhaltung in cm (x zur linken Seite der Figur, y oben, z zur Kamera). */
  get position(): Vec3 {
    return [clamp(this.filtered.x, POSITION_LIMIT_CM), clamp(this.filtered.y, POSITION_LIMIT_CM), clamp(this.filtered.z, POSITION_LIMIT_CM)]
  }

  update(result: FaceTrackingResult | null, nowMs: number): HeadRotation {
    const dt = this.lastUpdate === null ? 0 : Math.max(0, (nowMs - this.lastUpdate) / 1000)
    this.lastUpdate = nowMs

    if (result && result.frameId !== this.lastFrameId) {
      this.lastFrameId = result.frameId
      if (result.faceFound && result.matrix) {
        const raw = quatFromMatrix4(result.matrix)
        const rawPosition: Vec3 = [result.matrix[12] ?? 0, result.matrix[13] ?? 0, result.matrix[14] ?? 0]
        this.lastRaw = raw
        this.lastRawPosition = rawPosition
        this.neutralPosition ??= rawPosition
        this.lastFaceTime = nowMs

        const rotation = relativeHeadRotation(raw, this.neutral, this.settings.mirror)
        const mirrorX = this.settings.mirror ? -1 : 1
        const values: Record<Channel, number> = {
          ...rotation,
          x: (rawPosition[0] - this.neutralPosition[0]) * mirrorX,
          y: rawPosition[1] - this.neutralPosition[1],
          z: rawPosition[2] - this.neutralPosition[2]
        }
        const time = result.captureTime / 1000
        for (const channel of CHANNELS) this.filtered[channel] = this.filters[channel].filter(values[channel], time)
        return this.output()
      }
    }

    if (!this.hasFace(nowMs) && dt > 0) {
      // Sanft zur Mitte zurück; Filter mitführen, damit beim Wiederfinden nichts springt.
      const keep = Math.exp(-dt / RETURN_TIME_CONSTANT)
      for (const channel of CHANNELS) {
        this.filtered[channel] *= keep
        this.filters[channel].setState(this.filtered[channel], nowMs / 1000)
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
