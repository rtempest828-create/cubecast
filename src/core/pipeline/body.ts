import { quatFromEulerZYX, quatMultiply, quatRotate, quatToEulerZYX } from '../math/quat'
import type { Vec3 } from '../math/vec'
import { walkParts, type AvatarModel, type PartNode } from '../model/avatar-model'
import type { RoleId } from '../roles/roles'
import type { AvatarRig } from '../roles/rig'
import type { Signals } from '../tracking/signals'
import type { PoseBuilder } from './pose'

/**
 * Körper-Bewegung: Leerlauf (Atmen, Schwanken, Arm-Wippen) und Mitbewegung des
 * Oberkörpers mit dem Kopf. Arbeitet über Rollen, damit es auch mit eigenen
 * Figura-Teilen (Rollen „Körper“, „Arm“ usw.) funktioniert.
 */
export interface BodySettings {
  /** Mitbewegung des Oberkörpers mit dem Kopf (0 = aus, 1 = normal, 2 = stark). */
  readonly follow: number
  /** Atmen 0…1 (0 = aus). */
  readonly breathing: number
  /** Leichtes Schwanken 0…1 (0 = aus). */
  readonly sway: number
  /** Arm-Wippen im Leerlauf wie in Minecraft. */
  readonly armIdle: boolean
}

export const DEFAULT_BODY_SETTINGS: BodySettings = { follow: 1, breathing: 0.5, sway: 0.5, armIdle: true }

/** Begrenzung der Oberkörperneigung in Grad. */
export const MAX_LEAN = 12
/** Abstand Hüfte–Kopf beim Menschen (cm), für die Umrechnung Kopfverschiebung → Neigung. */
const TORSO_LENGTH_CM = 45

const DEG = 180 / Math.PI

export interface ArmPose {
  readonly rotation: Vec3
  /** 0 = Leerlauf, 1 = Tracking. */
  readonly weight: number
}

export interface BodyInputs {
  readonly timeSec: number
  readonly signals: Signals
  readonly arms?: { readonly left: ArmPose; readonly right: ArmPose } | null
}

/** Erstes bestätigtes Teil mit dieser Rolle. */
export function partWithRole(rig: AvatarRig, role: RoleId): string | null {
  return rig.assignments.find((a) => a.confirmed && a.role === role)?.partId ?? null
}

/** Drehpunkte und Hüfthöhe (Unterkante des Körpers) aus dem Modell. */
export function bodyGeometry(model: AvatarModel, bodyId: string | null): { pivots: Map<string, Vec3>; hip: Vec3 } {
  const pivots = new Map<string, Vec3>()
  let body: PartNode | null = null
  walkParts(model.root, (part) => {
    pivots.set(part.id, part.pivot)
    if (part.id === bodyId) body = part
  })
  const found = body as PartNode | null
  const bottom = found && found.cubes.length > 0 ? Math.min(...found.cubes.map((c) => Math.min(c.from[1], c.to[1]))) : 12
  return { pivots, hip: [found?.pivot[0] ?? 0, bottom, found?.pivot[2] ?? 0] }
}

/**
 * Dreht eine Gruppe von Teilen gemeinsam um einen Punkt (z. B. Oberkörper um die Hüfte).
 * Teile in `positionOnly` werden mitbewegt, behalten aber ihre Ausrichtung (Kopf schaut weiter dorthin, wohin du schaust).
 */
export function rotateGroup(pose: PoseBuilder, pivots: ReadonlyMap<string, Vec3>, ids: readonly string[], center: Vec3, euler: Vec3, positionOnly: ReadonlySet<string> = new Set()): void {
  if (euler[0] === 0 && euler[1] === 0 && euler[2] === 0) return
  const q = quatFromEulerZYX(euler[0], euler[1], euler[2])
  for (const id of ids) {
    const pivot = pivots.get(id)
    if (!pivot) continue
    const part = pose.part(id)
    const p: Vec3 = [pivot[0] + part.position[0] - center[0], pivot[1] + part.position[1] - center[1], pivot[2] + part.position[2] - center[2]]
    const r = quatRotate(q, p)
    part.position[0] += r[0] - p[0]
    part.position[1] += r[1] - p[1]
    part.position[2] += r[2] - p[2]
    if (positionOnly.has(id)) continue
    const combined = quatToEulerZYX(quatMultiply(q, quatFromEulerZYX(part.rotation[0], part.rotation[1], part.rotation[2])))
    part.rotation[0] = combined[0]
    part.rotation[1] = combined[1]
    part.rotation[2] = combined[2]
  }
}

const clamp = (v: number, limit: number): number => Math.max(-limit, Math.min(limit, v))

export function applyBody(pose: PoseBuilder, model: AvatarModel, rig: AvatarRig, settings: BodySettings, inputs: BodyInputs): void {
  const ids = {
    head: partWithRole(rig, 'head'),
    body: partWithRole(rig, 'body'),
    leftArm: partWithRole(rig, 'leftArm'),
    rightArm: partWithRole(rig, 'rightArm')
  }
  const { pivots, hip } = bodyGeometry(model, ids.body)
  const t = inputs.timeSec
  const s = inputs.signals
  const sig = (name: string): number => s[name] ?? 0

  // --- Arme: Leerlauf-Wippen (Minecraft `bobArms`) und Tracking ---
  const ticks = t * 20
  const bobZ = (Math.cos(ticks * 0.09) * 0.05 + 0.05) * DEG
  const bobX = Math.sin(ticks * 0.067) * 0.05 * DEG
  const breath = Math.sin((2 * Math.PI * t) / 4.5) * settings.breathing
  for (const side of ['left', 'right'] as const) {
    const id = side === 'left' ? ids.leftArm : ids.rightArm
    if (!id) continue
    const part = pose.part(id)
    const outward = side === 'left' ? 1 : -1
    const idleWeight = settings.armIdle ? 1 : 0
    const tracked = inputs.arms?.[side]
    const w = tracked ? Math.max(0, Math.min(1, tracked.weight)) : 0
    // Leerlauf (ausgeblendet, sobald Tracking übernimmt)
    part.rotation[2] += (outward * bobZ + outward * breath * 1.2) * idleWeight * (1 - w)
    part.rotation[0] += (side === 'left' ? -bobX : bobX) * idleWeight * (1 - w)
    if (tracked && w > 0) {
      part.rotation[0] += tracked.rotation[0] * w
      part.rotation[1] += tracked.rotation[1] * w
      part.rotation[2] += tracked.rotation[2] * w
    }
  }

  // --- Atmen: Schultern und Kopf heben sich minimal ---
  if (settings.breathing > 0) {
    const lift = (breath + settings.breathing) * 0.06
    for (const id of [ids.head, ids.leftArm, ids.rightArm]) if (id) pose.part(id).position[1] += lift
  }

  // --- Oberkörper neigt sich mit der Kopfposition und schwankt leicht ---
  const f = settings.follow
  const swayRoll = Math.sin((2 * Math.PI * t) / 7) * 1.2 * settings.sway
  const swayPitch = Math.sin((2 * Math.PI * t) / 9.3) * 0.6 * settings.sway
  const leanRoll = clamp(-Math.atan2(sig('head.x'), TORSO_LENGTH_CM) * DEG * f + sig('head.roll') * 0.12 * f + swayRoll, MAX_LEAN)
  const leanPitch = clamp(Math.atan2(sig('head.z'), TORSO_LENGTH_CM) * DEG * 0.6 * f + sig('head.pitch') * 0.08 * f + swayPitch, MAX_LEAN)
  const upper = [ids.body, ids.leftArm, ids.rightArm, ids.head].filter((id): id is string => id !== null)
  // Der Kopf wird mitbewegt, behält aber die getrackte Ausrichtung.
  const headOnly = new Set(ids.head ? [ids.head] : [])
  rotateGroup(pose, pivots, upper, hip, [leanPitch, 0, leanRoll], headOnly)

  // Schultern drehen leicht mit, wenn du den Kopf drehst.
  const torsoYaw = clamp(sig('head.yaw') * 0.2 * f, MAX_LEAN)
  rotateGroup(pose, pivots, [ids.body, ids.leftArm, ids.rightArm].filter((id): id is string => id !== null), hip, [0, torsoYaw, 0])
}
