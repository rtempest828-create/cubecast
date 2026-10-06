import { angularVelocity, IDENTITY_QUAT, quatConjugate, quatFromEulerZYX, quatMultiply, quatRotate, type Quat } from '../math/quat'
import type { Vec3 } from '../math/vec'
import type { AvatarModel, PartNode } from '../model/avatar-model'
import type { PoseBuilder } from '../pipeline/pose'
import type { DriverConfig } from '../roles/drivers'
import type { AvatarRig } from '../roles/rig'

/**
 * Feder-/Pendelphysik für Ohren, Schwänze, Haare, Flügel.
 *
 * Jedes Physik-Teil ist ein gedämpftes Drehpendel um seinen Drehpunkt:
 *   θ'' = −k·θ − c·θ' − (d × a)/|d|² − α
 * - a: Beschleunigung des Drehpunkts (Trägheit: das Teil „bleibt zurück“)
 * - α: Winkelbeschleunigung des Elternteils (Drehung des Kopfes)
 * - d: Richtung vom Drehpunkt zur Mitte des Teils
 * Ketten (Schwanz aus mehreren Gliedern) entstehen von selbst, weil jedes Glied auf
 * die Bewegung seines (bereits simulierten) Elternglieds reagiert.
 */
export interface PhysicsSettings {
  readonly enabled: boolean
  /** Globaler Faktor auf die Stärke aller Teile (0…2). */
  readonly strength: number
}

export const DEFAULT_PHYSICS_SETTINGS: PhysicsSettings = { enabled: true, strength: 1 }

/** Interner Rechentakt (Hz) für stabile Ergebnisse unabhängig von der Bildrate. */
const SUBSTEP_HZ = 240
/** Maximaler Ausschlag (rad). */
const MAX_ANGLE = 1.1
/** Größere Sprünge (Teleport, Modellwechsel) werden ignoriert. */
const MAX_DT = 0.1

interface PartState {
  theta: [number, number, number]
  omega: [number, number, number]
  prevParent: Quat | null
  prevAngular: Vec3 | null
  prevPosition: Vec3 | null
  prevVelocity: Vec3 | null
}

export interface PhysicsParams {
  readonly stiffness: number
  readonly damping: number
  readonly gain: number
}

/** Übersetzt Stärke/Dämpfung (0…1) in Pendel-Parameter. */
export function physicsParams(strength: number, damping: number): PhysicsParams {
  const s = Math.max(0, Math.min(2, strength))
  const frequency = Math.max(0.8, 4 - 1.6 * s) // Hz: stärker = weicher
  const omega = 2 * Math.PI * frequency
  const zeta = 0.05 + 0.95 * Math.max(0, Math.min(1, damping))
  return { stiffness: omega * omega, damping: 2 * zeta * omega, gain: 0.25 + 1.2 * s }
}

/** Mittelpunkt aller Würfel eines Teils (inkl. Kinder) relativ zum Drehpunkt. */
function centerOffset(part: PartNode): Vec3 {
  let sum: [number, number, number] = [0, 0, 0]
  let count = 0
  const visit = (node: PartNode): void => {
    for (const cube of node.cubes) {
      sum = [sum[0] + (cube.from[0] + cube.to[0]) / 2, sum[1] + (cube.from[1] + cube.to[1]) / 2, sum[2] + (cube.from[2] + cube.to[2]) / 2]
      count++
    }
    node.children.forEach(visit)
  }
  visit(part)
  if (count === 0) return [0, -1, 0]
  return [sum[0] / count - part.pivot[0], sum[1] / count - part.pivot[1], sum[2] / count - part.pivot[2]]
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const finite = (v: Vec3): boolean => v.every(Number.isFinite)

export class PhysicsSystem {
  private readonly states = new Map<string, PartState>()

  reset(): void {
    this.states.clear()
  }

  /** Zustand eines Teils (für Tests und Debug). */
  angleOf(partId: string): Vec3 {
    return this.states.get(partId)?.theta ?? [0, 0, 0]
  }

  /**
   * Simuliert alle Teile mit bestätigter Physik-Rolle und addiert ihre Auslenkung zur Pose.
   * Muss nach allen anderen Bewegungen (Tracking, Körper, Animationen) laufen.
   */
  step(model: AvatarModel, rig: AvatarRig, pose: PoseBuilder, dtSec: number, timeSec: number, settings: PhysicsSettings): void {
    const drivers = new Map<string, { driver: DriverConfig; role: string }>()
    for (const assignment of rig.assignments) {
      if (!assignment.confirmed) continue
      const driver = assignment.drivers.find((d) => d.mode === 'physics')
      if (driver) drivers.set(assignment.partId, { driver, role: assignment.role })
    }
    if (!settings.enabled || drivers.size === 0) {
      this.states.clear()
      return
    }
    const validDt = dtSec > 0 && dtSec <= MAX_DT

    // Vorwärtskinematik in Baumreihenfolge, Eltern vor Kindern.
    const visit = (node: PartNode, parentQ: Quat, parentPos: Vec3, parentPivot: Vec3): void => {
      const partPose = pose.peek(node.id)
      const local = sub(node.pivot, parentPivot)
      const offset = partPose?.position ?? [0, 0, 0]
      const position: Vec3 = (() => {
        const moved: Vec3 = [local[0] + offset[0], local[1] + offset[1], local[2] + offset[2]]
        const r = quatRotate(parentQ, moved)
        return [parentPos[0] + r[0], parentPos[1] + r[1], parentPos[2] + r[2]]
      })()

      const physics = drivers.get(node.id)
      if (physics) {
        const theta = this.simulate(node, physics.driver, physics.role, parentQ, position, validDt ? dtSec : 0, timeSec, settings)
        const part = pose.part(node.id)
        part.rotation[0] += (theta[0] * 180) / Math.PI
        part.rotation[1] += (theta[1] * 180) / Math.PI
        part.rotation[2] += (theta[2] * 180) / Math.PI
      }

      const rotation = pose.peek(node.id)?.rotation ?? [0, 0, 0]
      const localQ = quatFromEulerZYX(node.rotation[0] + rotation[0], node.rotation[1] + rotation[1], node.rotation[2] + rotation[2])
      const worldQ = quatMultiply(parentQ, localQ)
      for (const child of node.children) visit(child, worldQ, position, node.pivot)
    }
    visit(model.root, IDENTITY_QUAT, [0, 0, 0], [0, 0, 0])

    // Zustände entfernter Teile aufräumen
    for (const id of this.states.keys()) if (!drivers.has(id)) this.states.delete(id)
  }

  private simulate(node: PartNode, driver: DriverConfig, role: string, parentQ: Quat, position: Vec3, dt: number, timeSec: number, settings: PhysicsSettings): Vec3 {
    let state = this.states.get(node.id)
    if (!state) {
      state = { theta: [0, 0, 0], omega: [0, 0, 0], prevParent: null, prevAngular: null, prevPosition: null, prevVelocity: null }
      this.states.set(node.id, state)
    }
    const params = physicsParams(driver.physics.strength * settings.strength, driver.physics.damping)
    const axes = [driver.physics.axes.includes('x'), driver.physics.axes.includes('y'), driver.physics.axes.includes('z')]

    // Äußere Anregung im Bezugssystem des Elternteils
    let excitation: Vec3 = [0, 0, 0]
    if (dt > 0) {
      const inverse = quatConjugate(parentQ)
      const angular = state.prevParent ? quatRotate(inverse, angularVelocity(state.prevParent, parentQ, dt)) : null
      const velocity = state.prevPosition ? scale(sub(position, state.prevPosition), 1 / dt) : null
      if (angular && state.prevAngular) {
        const alpha = scale(sub(angular, state.prevAngular), 1 / dt)
        excitation = sub(excitation, alpha)
      }
      if (velocity && state.prevVelocity) {
        const accel = quatRotate(inverse, scale(sub(velocity, state.prevVelocity), 1 / dt))
        const rest = quatFromEulerZYX(node.rotation[0], node.rotation[1], node.rotation[2])
        const d = quatRotate(rest, centerOffset(node))
        const lengthSq = Math.max(1, d[0] * d[0] + d[1] * d[1] + d[2] * d[2])
        excitation = sub(excitation, scale(cross(d, accel), 1 / lengthSq))
      }
      excitation = scale(excitation, params.gain)
      // Schwänze wedeln im Leerlauf ganz leicht
      if (role === 'tail') excitation = [excitation[0], excitation[1] + Math.sin(2 * Math.PI * 0.45 * timeSec) * 4 * params.gain, excitation[2]]
      state.prevAngular = angular
      state.prevVelocity = velocity
    } else {
      state.prevAngular = null
      state.prevVelocity = null
    }
    state.prevParent = parentQ
    state.prevPosition = position
    if (!finite(excitation)) excitation = [0, 0, 0]

    // Gedämpfte Feder, in kleinen festen Schritten integriert (semi-implizites Euler-Verfahren)
    const steps = Math.max(1, Math.ceil(dt * SUBSTEP_HZ))
    const h = dt / steps
    for (let s = 0; s < steps && dt > 0; s++) {
      for (let i = 0; i < 3; i++) {
        if (!axes[i]) {
          state.theta[i] = 0
          state.omega[i] = 0
          continue
        }
        const theta = state.theta[i] ?? 0
        const omega = state.omega[i] ?? 0
        const acc = (excitation[i] ?? 0) - params.stiffness * theta - params.damping * omega
        const nextOmega = omega + acc * h
        const nextTheta = theta + nextOmega * h
        if (Math.abs(nextTheta) > MAX_ANGLE) {
          state.theta[i] = Math.sign(nextTheta) * MAX_ANGLE
          state.omega[i] = 0
        } else {
          state.theta[i] = nextTheta
          state.omega[i] = nextOmega
        }
      }
    }
    if (!finite(state.theta) || !finite(state.omega)) {
      state.theta = [0, 0, 0]
      state.omega = [0, 0, 0]
    }
    return state.theta
  }
}
