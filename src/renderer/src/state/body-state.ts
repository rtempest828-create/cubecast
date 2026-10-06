import { effect, signal } from '@preact/signals'
import { DEFAULT_BODY_SETTINGS, type BodySettings } from '@core/pipeline/body'
import { DEFAULT_PHYSICS_SETTINGS } from '@core/physics/physics'
import { DEFAULT_LIPSYNC_SETTINGS } from '@core/tracking/lipsync'
import { LipSyncClient, type MicrophoneInfo } from '../audio/lipsync-client'
import { isRecord, loadSetting, numberIn, saveSetting } from './persist'
import { trackingClient } from './tracking-state'

/** Einstellungen für Körper, Physik, Arm-Tracking und Lip-Sync (pro Rechner gespeichert). */
export interface BodyState extends BodySettings {
  readonly physicsEnabled: boolean
  readonly physicsStrength: number
  readonly armTracking: boolean
  readonly micDeviceId: string | null
  readonly micGain: number
  readonly micGateDb: number
}

const STORAGE_KEY = 'vtuber.body'
const DEFAULTS: BodyState = {
  ...DEFAULT_BODY_SETTINGS,
  physicsEnabled: DEFAULT_PHYSICS_SETTINGS.enabled,
  physicsStrength: DEFAULT_PHYSICS_SETTINGS.strength,
  armTracking: false,
  micDeviceId: null,
  micGain: DEFAULT_LIPSYNC_SETTINGS.gain,
  micGateDb: DEFAULT_LIPSYNC_SETTINGS.gateDb
}

function validate(value: unknown): BodyState | null {
  if (!isRecord(value)) return null
  const bool = (key: keyof BodyState, fallback: boolean): boolean => (typeof value[key] === 'boolean' ? (value[key] as boolean) : fallback)
  return {
    follow: numberIn(value['follow'], 0, 2, DEFAULTS.follow),
    breathing: numberIn(value['breathing'], 0, 1, DEFAULTS.breathing),
    sway: numberIn(value['sway'], 0, 1, DEFAULTS.sway),
    armIdle: bool('armIdle', DEFAULTS.armIdle),
    physicsEnabled: bool('physicsEnabled', DEFAULTS.physicsEnabled),
    physicsStrength: numberIn(value['physicsStrength'], 0, 2, DEFAULTS.physicsStrength),
    armTracking: bool('armTracking', DEFAULTS.armTracking),
    micDeviceId: typeof value['micDeviceId'] === 'string' ? value['micDeviceId'] : null,
    micGain: numberIn(value['micGain'], 0.25, 6, DEFAULTS.micGain),
    micGateDb: numberIn(value['micGateDb'], -80, -20, DEFAULTS.micGateDb)
  }
}

export const bodyState = signal<BodyState>(loadSetting(STORAGE_KEY, DEFAULTS, validate))
effect(() => saveSetting(STORAGE_KEY, bodyState.value))

export function updateBodyState(patch: Partial<BodyState>): void {
  bodyState.value = { ...bodyState.value, ...patch }
}

// Arm-Tracking an den Tracking-Worker weitergeben (Modell wird erst bei Bedarf geladen).
effect(() => trackingClient.setPoseEnabled(bodyState.value.armTracking))

/** Mikrofon für Lip-Sync. Wird nie automatisch gestartet, nur per Knopf. */
export const lipSyncClient = new LipSyncClient()
export const microphones = signal<readonly MicrophoneInfo[]>([])
/** Aktueller Pegel 0…1 für die Anzeige (ca. 10 × pro Sekunde). */
export const micLevel = signal(0)

window.addEventListener('beforeunload', () => lipSyncClient.stop())
