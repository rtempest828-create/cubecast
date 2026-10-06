import { isValidCellRect, type FaceLayout } from '../face/face-layout'
import { walkParts, type AvatarModel, type PartNode } from '../model/avatar-model'
import { PoseBuilder, type Pose } from '../pipeline/pose'
import type { Signals } from '../tracking/signals'
import {
  AXES,
  createDriver,
  DEFAULT_MOUTH_THRESHOLDS,
  DRIVER_MODES,
  driverInput,
  driverOutput,
  frameIndex,
  mouthFrame,
  type Axis,
  type DriverConfig,
  type DriverMode,
  type DriverSmoother
} from './drivers'
import { defaultDriversForRole, isRoleId, suggestRole, type RoleId } from './roles'
import { MOUTH_FRAMES } from '../face/face-variants'
import { NO_COSMETICS, type CosmeticSettings } from '../model/cosmetics'
import { parentTypeOf } from '../figura/parent-types'
import { suggestExpression } from './expressions'
import { ALL_VANILLA, type VanillaId } from '../figura/vanilla-scan'
import { parseAnimationSettings, type AnimationSettings } from '../animation/player'

/** Feste IDs der (virtuellen) Teile des Gesichts-Overlays. */
export const FACE_PART_IDS = {
  overlay: 'face.overlay',
  rightEye: 'face.eye.right',
  leftEye: 'face.eye.left',
  rightPupil: 'face.pupil.right',
  leftPupil: 'face.pupil.left',
  rightBrow: 'face.brow.right',
  leftBrow: 'face.brow.left',
  mouth: 'face.mouth'
} as const

export interface FaceRigSettings {
  /** Gesichts-Overlay an (sonst bewegt sich nur der Kopf, das Gesicht bleibt statisch). */
  readonly enabled: boolean
  /** Vom Nutzer angepasstes Layout oder null = automatisch erkannt. */
  readonly layout: FaceLayout | null
  /** Links/Rechts der Mimik zusätzlich vertauschen. */
  readonly swapSides: boolean
  /** Emotionen automatisch aus der Mimik erkennen. */
  readonly autoEmotion: boolean
}

export const DEFAULT_FACE_SETTINGS: FaceRigSettings = { enabled: true, layout: null, swapSides: false, autoEmotion: true }

export interface RoleAssignment {
  readonly partId: string
  readonly role: RoleId
  /** false = nur ein Vorschlag der Auto-Erkennung (noch ohne Wirkung). */
  readonly confirmed: boolean
  readonly drivers: readonly DriverConfig[]
}

/** Zuordnung pro Avatar; wird als JSON gespeichert, die Avatar-Dateien bleiben unverändert. */
export interface AvatarRig {
  readonly version: 1
  readonly assignments: readonly RoleAssignment[]
  readonly face: FaceRigSettings
  /** Eingebautes Test-Zubehör (Fuchsohren, Schwanz, Headset). */
  readonly cosmetics: CosmeticSettings
  /** Ausgeblendete Teile des Minecraft-Körpers; null/fehlend = wie im Figura-Skript. */
  readonly vanillaHidden?: readonly VanillaId[] | null
  /** Einstellungen pro Blockbench-Animation (Autostart, Tempo, Auslöser …). */
  readonly animations?: Readonly<Record<string, AnimationSettings>>
  /** Lua-Skripte des Figura-Avatars ausführen (Standard: ja). */
  readonly luaEnabled?: boolean
}

/** Zuordnungen von Zubehör-Teilen bleiben erhalten, auch wenn das Zubehör gerade aus ist. */
const isCosmeticId = (id: string): boolean => id.startsWith('cosmetic.')

const VANILLA_ROLES: Readonly<Record<string, RoleId>> = {
  head: 'head',
  body: 'body',
  rightArm: 'rightArm',
  leftArm: 'leftArm',
  rightLeg: 'rightLeg',
  leftLeg: 'leftLeg'
}

/** Treiber der Overlay-Merkmale (Einheiten: Zellen bzw. Bildnummern). */
function faceAssignment(partId: string): RoleAssignment | null {
  const side = partId.endsWith('.left') ? 'left' : 'right'
  const confirmed = true
  switch (partId) {
    case FACE_PART_IDS.rightEye:
    case FACE_PART_IDS.leftEye:
      return {
        partId,
        role: side === 'left' ? 'leftEye' : 'rightEye',
        confirmed,
        drivers: [createDriver('textureSwap', { id: 'blink', source: `blink.${side}`, thresholds: [0.35, 0.65] })]
      }
    case FACE_PART_IDS.rightPupil:
    case FACE_PART_IDS.leftPupil:
      return {
        partId,
        role: side === 'left' ? 'leftPupil' : 'rightPupil',
        confirmed,
        drivers: [
          createDriver('position', { id: 'gaze-x', source: 'gaze.x', axis: 'x', inputMin: -0.6, inputMax: 0.6, outputMin: -1, outputMax: 1 }),
          createDriver('position', { id: 'gaze-y', source: 'gaze.y', axis: 'y', inputMin: -0.6, inputMax: 0.6, outputMin: -1, outputMax: 1 })
        ]
      }
    case FACE_PART_IDS.rightBrow:
    case FACE_PART_IDS.leftBrow:
      return {
        partId,
        role: side === 'left' ? 'leftBrow' : 'rightBrow',
        confirmed,
        drivers: [createDriver('position', { id: 'brow', source: `brow.${side}`, axis: 'y', inputMin: -0.8, inputMax: 0.8, outputMin: -1, outputMax: 1 })]
      }
    case FACE_PART_IDS.mouth:
      return { partId, role: 'mouth', confirmed, drivers: [createDriver('faceMouth', { id: 'mouth', thresholds: DEFAULT_MOUTH_THRESHOLDS })] }
    default:
      return null
  }
}

/** Standard-Zuordnung eines Teils: Vanilla/Gesicht fest, sonst Vorschlag anhand des Namens. */
export function defaultAssignmentFor(part: PartNode): RoleAssignment | null {
  if (part.origin === 'vanilla' && part.vanillaId) {
    const role = VANILLA_ROLES[part.vanillaId]
    return role ? { partId: part.id, role, confirmed: true, drivers: defaultDriversForRole(role) } : null
  }
  if (part.origin === 'face-overlay') return faceAssignment(part.id)
  if (part.origin === 'cosmetic') {
    // Eingebautes Zubehör: Rolle steht fest, daher gleich bestätigt.
    const role = suggestRole(part.name)
    return role ? { partId: part.id, role, confirmed: true, drivers: defaultDriversForRole(role) } : null
  }
  if (part.origin === 'bbmodel') {
    // Figura-Parent-Types („Head“, „LeftArm“ …) hängen fest am Spielermodell – wie in Figura.
    const parentRole = part.figuraParent ? parentTypeOf(part.figuraParent)?.role : null
    if (parentRole) return { partId: part.id, role: parentRole, confirmed: true, drivers: defaultDriversForRole(parentRole) }
    const expression = suggestExpression(part.name)
    if (expression) return { partId: part.id, role: expression.role, confirmed: false, drivers: [...expression.drivers] }
    // Ausgeblendete Gruppen sind meist Varianten („MundZunge“) – ohne passendes Signal kein Vorschlag.
    if (!part.visible) return null
    const role = suggestRole(part.name)
    return role ? { partId: part.id, role, confirmed: false, drivers: defaultDriversForRole(role) } : null
  }
  return null
}

export function createDefaultRig(model: AvatarModel): AvatarRig {
  const assignments: RoleAssignment[] = []
  walkParts(model.root, (part) => {
    const assignment = defaultAssignmentFor(part)
    if (assignment) assignments.push(assignment)
  })
  return { version: 1, assignments, face: DEFAULT_FACE_SETTINGS, cosmetics: NO_COSMETICS }
}

/** Ergänzt Standard-Zuordnungen für Teile, die noch keine haben (z. B. neu eingeschaltetes Zubehör). */
export function withDefaults(rig: AvatarRig, model: AvatarModel): AvatarRig {
  const existing = new Set(rig.assignments.map((a) => a.partId))
  const added: RoleAssignment[] = []
  walkParts(model.root, (part) => {
    if (existing.has(part.id)) return
    const assignment = defaultAssignmentFor(part)
    if (assignment) added.push(assignment)
  })
  return added.length === 0 ? rig : { ...rig, assignments: [...rig.assignments, ...added] }
}

/** Bestätigte Zuordnungen bleiben, Vorschläge werden neu berechnet, neue Teile ergänzt. */
export function rerunAutoDetection(rig: AvatarRig, model: AvatarModel): AvatarRig {
  const confirmed = new Map(rig.assignments.filter((a) => a.confirmed).map((a) => [a.partId, a]))
  const assignments: RoleAssignment[] = []
  walkParts(model.root, (part) => {
    const kept = confirmed.get(part.id)
    if (kept) assignments.push(kept)
    else {
      const fresh = defaultAssignmentFor(part)
      if (fresh) assignments.push(fresh)
    }
  })
  return { ...rig, assignments }
}

// ---------------------------------------------------------------------------
// Laden aus JSON (robust gegen alte oder kaputte Dateien)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const finite = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)

function parseDriver(value: unknown): DriverConfig | null {
  if (!isRecord(value) || !DRIVER_MODES.includes(value['mode'] as DriverMode)) return null
  const mode = value['mode'] as DriverMode
  const defaults = createDriver(mode, { id: typeof value['id'] === 'string' ? value['id'].slice(0, 40) : undefined })
  const physics = isRecord(value['physics']) ? value['physics'] : {}
  const axes = Array.isArray(physics['axes']) ? physics['axes'].filter((a): a is Axis => AXES.includes(a as Axis)) : defaults.physics.axes
  return {
    ...defaults,
    source: typeof value['source'] === 'string' ? value['source'].slice(0, 60) : defaults.source,
    axis: AXES.includes(value['axis'] as Axis) ? (value['axis'] as Axis) : defaults.axis,
    inputMin: finite(value['inputMin'], defaults.inputMin),
    inputMax: finite(value['inputMax'], defaults.inputMax),
    outputMin: finite(value['outputMin'], defaults.outputMin),
    outputMax: finite(value['outputMax'], defaults.outputMax),
    invert: value['invert'] === true,
    sensitivity: Math.max(0, Math.min(10, finite(value['sensitivity'], 1))),
    smoothing: Math.max(0, Math.min(1, finite(value['smoothing'], 0))),
    thresholds: Array.isArray(value['thresholds'])
      ? value['thresholds'].filter((t): t is number => typeof t === 'number' && Number.isFinite(t)).slice(0, 8)
      : defaults.thresholds,
    physics: {
      strength: Math.max(0, Math.min(1, finite(physics['strength'], defaults.physics.strength))),
      damping: Math.max(0, Math.min(1, finite(physics['damping'], defaults.physics.damping))),
      axes
    }
  }
}

/** Liest die eigene Vanilla-Auswahl (null = wie im Skript); wird vor dem Modellaufbau gebraucht. */
export function parseVanillaHidden(value: unknown): VanillaId[] | null {
  if (!Array.isArray(value)) return null
  return ALL_VANILLA.filter((id) => value.includes(id))
}

/** Liest nur die Zubehör-Einstellungen (wird vor dem Modellaufbau gebraucht). */
export function parseCosmetics(value: unknown): CosmeticSettings {
  if (!isRecord(value)) return NO_COSMETICS
  return { foxEars: value['foxEars'] === true, foxTail: value['foxTail'] === true, headset: value['headset'] === true }
}

function parseLayout(value: unknown): FaceLayout | null {
  if (!isRecord(value)) return null
  const rect = (key: string) => (isValidCellRect(value[key]) ? value[key] : null)
  return { rightEye: rect('rightEye'), leftEye: rect('leftEye'), rightBrow: rect('rightBrow'), leftBrow: rect('leftBrow'), mouth: rect('mouth') }
}

/**
 * Liest eine gespeicherte Zuordnung. Unbekanntes wird verworfen (mit Warnung),
 * fehlende Teile ergänzt – das Programm stürzt bei kaputten Dateien nie ab.
 */
export function parseRig(value: unknown, model: AvatarModel): { rig: AvatarRig; warnings: string[] } {
  const defaults = createDefaultRig(model)
  const warnings: string[] = []
  if (!isRecord(value) || value['version'] !== 1) {
    if (value !== null && value !== undefined) warnings.push('Unbekanntes Format der gespeicherten Zuordnung – Standardwerte werden verwendet.')
    return { rig: defaults, warnings }
  }

  const partIds = new Set<string>()
  walkParts(model.root, (part) => partIds.add(part.id))

  const assignments = new Map<string, RoleAssignment>()
  for (const entry of Array.isArray(value['assignments']) ? value['assignments'] : []) {
    if (!isRecord(entry) || typeof entry['partId'] !== 'string' || !isRoleId(entry['role'])) {
      warnings.push('Ungültiger Eintrag in der Zuordnung übersprungen.')
      continue
    }
    if (!partIds.has(entry['partId']) && !isCosmeticId(entry['partId'])) {
      warnings.push(`Teil „${entry['partId']}“ gibt es in diesem Modell nicht – Zuordnung übersprungen.`)
      continue
    }
    const drivers = (Array.isArray(entry['drivers']) ? entry['drivers'] : []).map(parseDriver)
    if (drivers.some((d) => d === null)) warnings.push(`Ungültiger Treiber bei „${entry['partId']}“ übersprungen.`)
    assignments.set(entry['partId'], {
      partId: entry['partId'],
      role: entry['role'],
      confirmed: entry['confirmed'] === true,
      drivers: drivers.filter((d): d is DriverConfig => d !== null)
    })
  }
  // Neue Teile (oder neue Standard-Merkmale) ergänzen
  for (const fallback of defaults.assignments) if (!assignments.has(fallback.partId)) assignments.set(fallback.partId, fallback)

  const face = isRecord(value['face']) ? value['face'] : {}
  return {
    rig: {
      version: 1,
      assignments: [...assignments.values()],
      face: {
        enabled: face['enabled'] !== false,
        layout: parseLayout(face['layout']),
        swapSides: face['swapSides'] === true,
        autoEmotion: face['autoEmotion'] !== false
      },
      cosmetics: parseCosmetics(value['cosmetics']),
      ...(Array.isArray(value['vanillaHidden']) ? { vanillaHidden: parseVanillaHidden(value['vanillaHidden']) } : {}),
      ...(isRecord(value['animations']) ? { animations: parseAnimationSettings(value['animations']) } : {}),
      ...(typeof value['luaEnabled'] === 'boolean' ? { luaEnabled: value['luaEnabled'] } : {})
    },
    warnings
  }
}

// ---------------------------------------------------------------------------
// Auswertung pro Frame

export interface DriverValue {
  /** Normierter Eingang 0…1 nach Glättung. */
  readonly input: number
  /** Ausgabewert (Grad, Pixel, Faktor oder Bildnummer). */
  readonly output: number
}

export interface RigOutput {
  readonly pose: Pose
  /** Live-Werte pro Treiber („partId/driverId“) für den Rollen-Editor. */
  readonly driverValues: ReadonlyMap<string, DriverValue>
}

const AXIS_INDEX: Readonly<Record<Axis, 0 | 1 | 2>> = { x: 0, y: 1, z: 2 }

export function evaluateRig(rig: AvatarRig, signals: Signals, dtSec: number, smoother: DriverSmoother): RigOutput {
  const pose = new PoseBuilder()
  const driverValues = new Map<string, DriverValue>()

  for (const assignment of rig.assignments) {
    if (!assignment.confirmed) continue
    for (const driver of assignment.drivers) {
      const key = `${assignment.partId}/${driver.id}`
      const part = pose.part(assignment.partId)
      const axis = AXIS_INDEX[driver.axis]
      switch (driver.mode) {
        case 'headRotation':
          part.rotation[0] += signals['head.pitch'] ?? 0
          part.rotation[1] += signals['head.yaw'] ?? 0
          part.rotation[2] += signals['head.roll'] ?? 0
          driverValues.set(key, { input: 0, output: signals['head.yaw'] ?? 0 })
          continue
        case 'faceMouth': {
          const frame = MOUTH_FRAMES.indexOf(mouthFrame(signals, driver.thresholds, driver.sensitivity))
          part.frame = frame
          driverValues.set(key, { input: signals['mouth.open'] ?? 0, output: frame })
          continue
        }
        case 'physics':
          // Physik folgt in Meilenstein M4.
          continue
        default:
          break
      }

      const t = smoother.smooth(key, driverInput(driver, signals), driver.smoothing, dtSec)
      const output = driverOutput(driver, t)
      switch (driver.mode) {
        case 'rotation':
          part.rotation[axis] += output
          break
        case 'position':
          part.position[axis] += output
          break
        case 'scale':
          part.scale[axis] *= output
          break
        case 'visibility': {
          // Treiber blendet ein (auch Teile, die im Modell ausgeblendet sind) und aus.
          const on = t >= (driver.thresholds[0] ?? 0.5)
          part.visible = part.visible && on
          if (on) part.shown = true
          break
        }
        case 'uvOffset':
          part.uvOffset[driver.axis === 'x' ? 0 : 1] += output
          break
        case 'textureSwap':
          part.frame = frameIndex(t, driver.thresholds)
          driverValues.set(key, { input: t, output: part.frame })
          continue
      }
      driverValues.set(key, { input: t, output })
    }
  }
  return { pose: pose.build(), driverValues }
}

/** Ersetzt die Zuordnung eines Teils (oder entfernt sie mit null). */
export function withAssignment(rig: AvatarRig, partId: string, assignment: RoleAssignment | null): AvatarRig {
  const others = rig.assignments.filter((a) => a.partId !== partId)
  return { ...rig, assignments: assignment ? [...others, assignment] : others }
}

export function assignmentOf(rig: AvatarRig, partId: string): RoleAssignment | undefined {
  return rig.assignments.find((a) => a.partId === partId)
}
