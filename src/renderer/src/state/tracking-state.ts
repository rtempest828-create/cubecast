import { effect, signal } from '@preact/signals'
import { DEFAULT_HEAD_SETTINGS, type HeadTrackerSettings } from '@core/tracking/head-tracker'
import { ZERO_HEAD_ROTATION, type HeadRotation } from '@core/tracking/types'
import type { CameraInfo } from '../tracking/camera'
import { TrackingClient } from '../tracking/tracking-client'
import { isRecord, loadSetting, numberIn, saveSetting } from './persist'

export interface TrackingSettings extends HeadTrackerSettings {
  /** Gewählte Kamera oder null für die Standardkamera. */
  readonly deviceId: string | null
}

const STORAGE_KEY = 'vtuber.tracking'
const DEFAULTS: TrackingSettings = { ...DEFAULT_HEAD_SETTINGS, deviceId: null }

function validate(value: unknown): TrackingSettings | null {
  if (!isRecord(value)) return null
  return {
    deviceId: typeof value['deviceId'] === 'string' ? value['deviceId'] : null,
    smoothing: numberIn(value['smoothing'], 0, 1, DEFAULTS.smoothing),
    reaction: numberIn(value['reaction'], 0, 1, DEFAULTS.reaction),
    intensity: numberIn(value['intensity'], 0.5, 2, DEFAULTS.intensity),
    mirror: typeof value['mirror'] === 'boolean' ? value['mirror'] : DEFAULTS.mirror
  }
}

export const trackingSettings = signal<TrackingSettings>(loadSetting(STORAGE_KEY, DEFAULTS, validate))
effect(() => saveSetting(STORAGE_KEY, trackingSettings.value))

export function updateTrackingSettings(patch: Partial<TrackingSettings>): void {
  trackingSettings.value = { ...trackingSettings.value, ...patch }
}

export const trackingClient = new TrackingClient()
window.addEventListener('beforeunload', () => trackingClient.dispose())

export const cameras = signal<readonly CameraInfo[]>([])

/** Live-Werte für das Debug-Panel (ca. 10× pro Sekunde aktualisiert). */
export interface TrackingDebug {
  readonly renderFps: number
  readonly trackingFps: number
  readonly latencyMs: number
  readonly processingMs: number
  readonly faceFound: boolean
  readonly calibrated: boolean
  readonly head: HeadRotation
  readonly blendshapes: Float32Array | null
}

export const trackingDebug = signal<TrackingDebug>({
  renderFps: 0,
  trackingFps: 0,
  latencyMs: 0,
  processingMs: 0,
  faceFound: false,
  calibrated: false,
  head: ZERO_HEAD_ROTATION,
  blendshapes: null
})
