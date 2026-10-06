import { effect, signal } from '@preact/signals'
import { applyEmotion, detectEmotion, type Emotion } from '@core/face/emotions'
import { composeFace, faceStateFromPose, faceStateKey, roundFaceState } from '@core/face/face-compose'
import { FACE_TEXTURE_ID, SKIN_TEXTURE_ID } from '@core/model/vanilla-avatar'
import { PhysicsSystem } from '@core/physics/physics'
import { applyBody } from '@core/pipeline/body'
import { PoseBuilder, type PartPose } from '@core/pipeline/pose'
import { DriverSmoother } from '@core/roles/drivers'
import { evaluateRig, FACE_PART_IDS } from '@core/roles/rig'
import { ArmTracker, armTargetsFromPose, type ArmTargets } from '@core/tracking/arms'
import { HeadTracker } from '@core/tracking/head-tracker'
import { avatarBlendshapes } from '@core/tracking/signals'
import { composeSignals } from '@core/tracking/simulator'
import type { Viewport } from '@render/viewport'
import { avatarModel, loadedSkin } from '../state/app-state'
import { bodyState, lipSyncClient, micLevel } from '../state/body-state'
import { debugMode, driverValues, liveSignals, manualSignals, overriddenSignals, signalMode } from '../state/debug-state'
import { currentEmotion, currentFaceState, faceLayout, faceSource, faceVariants, manualEmotion, rig } from '../state/rig-state'
import { trackingClient, trackingDebug, trackingSettings } from '../state/tracking-state'

/**
 * Laufzeit pro Frame:
 *   Tracking → Kopf-Tracker + Blendshapes (aus Sicht der Figur, Ruhewerte abgezogen)
 *   → Simulator (Webcam/Manuell/Gemischt) → Rollen-Treiber → Pose
 *   → Körper (Leerlauf, Mitbewegung, Arm-Tracking) → Physik
 *   → Gesichtszustand + Emotion → Gesichts-Textur → 3D-Ansicht
 * Ab M5b/M5c kommen Animationen und Lua dazu (vor Körper/Physik).
 */
export const headTracker = new HeadTracker(trackingSettings.peek())
effect(() => headTracker.setSettings(trackingSettings.value))

const smoother = new DriverSmoother()
const physics = new PhysicsSystem()
const armTracker = new ArmTracker()
let lastPoseFrame = -1
let lastPoseTime = -Infinity
let lastArmTargets: ArmTargets | null = null
const DEBUG_INTERVAL_MS = 100
/** So lange muss eine erkannte Emotion anliegen, bevor sie angezeigt wird (gegen Flackern). */
const EMOTION_HOLD_MS = 150

/** Ruhewerte der Mimik aus „Neutrale Pose setzen“. */
let blendshapeBaseline: Float32Array | null = null

const HIDDEN_OVERLAY: PartPose = { rotation: [0, 0, 0], position: [0, 0, 0], scale: [1, 1, 1], visible: false, shown: false, uvOffset: [0, 0], frame: 0 }

export function attachRuntime(viewport: Viewport): () => void {
  let lastDebug = 0
  let lastNow: number | null = null
  // Merkt, was zuletzt an Texturen gesendet wurde – neu zeichnen nur bei Änderungen.
  let faceKey = ''
  let faceInputs: readonly unknown[] = []
  let skinTextureKey = ''
  let skinTextureSource: unknown = null
  // Emotions-Entprellung
  let shownEmotion: Emotion = 'neutral'
  let candidateEmotion: Emotion = 'neutral'
  let candidateSince = 0

  viewport.setFrameCallback((nowMs) => {
    const dt = lastNow === null ? 0 : Math.min(0.1, (nowMs - lastNow) / 1000)
    lastNow = nowMs

    // 1. Tracking
    const running = trackingClient.status.peek() === 'running'
    const result = running ? trackingClient.latest : null
    const head = headTracker.update(result, nowMs)
    const settings = trackingSettings.peek()
    const currentRig = rig.peek()
    const faceVisible = running && headTracker.hasFace(nowMs)
    const liveBlend =
      faceVisible && result?.blendshapes
        ? avatarBlendshapes(result.blendshapes, { mirror: settings.mirror, swapSides: currentRig.face.swapSides, baseline: blendshapeBaseline })
        : null

    // Mikrofon (nur wenn per Knopf gestartet)
    const body = bodyState.peek()
    const audio = lipSyncClient.read(dt, { gain: body.micGain, gateDb: body.micGateDb })

    // 2. Simulator + Rollen
    const signals = composeSignals(
      { blendshapes: liveBlend, head, position: faceVisible ? headTracker.position : [0, 0, 0], audio },
      manualSignals.peek(),
      overriddenSignals.peek(),
      signalMode.peek()
    )
    const output = evaluateRig(currentRig, signals, dt, smoother)

    // 3. Körper (Leerlauf, Mitbewegung, Arme) und Physik
    const builder = PoseBuilder.from(output.pose)
    const model = avatarModel.peek()
    let armTargets: ArmTargets | null = null
    if (body.armTracking && running) {
      if (result?.pose && result.frameId !== lastPoseFrame) {
        lastPoseFrame = result.frameId
        lastPoseTime = nowMs
        lastArmTargets = armTargetsFromPose(result.pose, settings.mirror)
      }
      // Kurze Aussetzer überbrücken, erst danach zurück in den Leerlauf.
      if (nowMs - lastPoseTime < 300) armTargets = lastArmTargets
    }
    const arms = armTracker.update(armTargets, nowMs / 1000, dt)
    applyBody(builder, model, currentRig, body, { timeSec: nowMs / 1000, signals, arms })
    physics.step(model, currentRig, builder, dt, nowMs / 1000, { enabled: body.physicsEnabled, strength: body.physicsStrength })
    const pose = new Map(builder.build())

    // 3. Gesicht
    let emotion: Emotion = 'neutral'
    const manual = manualEmotion.peek()
    if (manual) {
      emotion = manual
    } else if (currentRig.face.autoEmotion) {
      const detected = detectEmotion(signals)
      if (detected !== candidateEmotion) {
        candidateEmotion = detected
        candidateSince = nowMs
      }
      if (nowMs - candidateSince >= EMOTION_HOLD_MS) shownEmotion = candidateEmotion
      emotion = shownEmotion
    }

    const source = faceSource.peek()
    const faceState = roundFaceState(applyEmotion(faceStateFromPose(pose), emotion))
    if (currentRig.face.enabled) {
      const inputs = [source, faceVariants.peek(), faceLayout.peek(), viewport.avatarVersion]
      const key = faceStateKey(faceState)
      if (key !== faceKey || inputs.some((value, i) => value !== faceInputs[i])) {
        viewport.updateTexture(FACE_TEXTURE_ID, composeFace(source, faceVariants.peek(), faceLayout.peek(), faceState))
        faceKey = key
        faceInputs = inputs
      }
    } else {
      pose.set(FACE_PART_IDS.overlay, HIDDEN_OVERLAY)
    }

    // Lag ein Teil des Gesichts auf der Hut-Ebene, wird es ins Overlay übernommen und dort entfernt.
    const useCleared = currentRig.face.enabled && source.skinWithoutHatFront !== null
    const textureKey = `${viewport.avatarVersion}|${useCleared}`
    if (textureKey !== skinTextureKey || skinTextureSource !== source) {
      const skin = loadedSkin.peek().skin
      viewport.updateTexture(SKIN_TEXTURE_ID, useCleared && source.skinWithoutHatFront ? source.skinWithoutHatFront : skin.image)
      skinTextureKey = textureKey
      skinTextureSource = source
    }

    viewport.applyPose(pose)

    // 4. Live-Werte für die Oberfläche
    if (nowMs - lastDebug >= DEBUG_INTERVAL_MS) {
      lastDebug = nowMs
      const stats = trackingClient.getStats(nowMs)
      trackingDebug.value = {
        renderFps: viewport.renderFps,
        trackingFps: running ? stats.fps : 0,
        latencyMs: running ? stats.latencyMs : 0,
        processingMs: running ? stats.processingMs : 0,
        faceFound: faceVisible,
        calibrated: headTracker.isCalibrated,
        head,
        blendshapes: faceVisible ? (result?.blendshapes ?? null) : null
      }
      micLevel.value = audio?.level ?? 0
      physicsPartCount.value = currentRig.assignments.filter((a) => a.confirmed && a.drivers.some((d) => d.mode === 'physics')).length
      armTrackingActive.value = arms.left.weight > 0.5 || arms.right.weight > 0.5
      if (currentEmotion.peek() !== emotion) currentEmotion.value = emotion
      if (faceStateKey(currentFaceState.peek()) !== faceStateKey(faceState)) currentFaceState.value = faceState
      if (debugMode.peek()) {
        liveSignals.value = signals
        driverValues.value = output.driverValues
      }
    }
  })
  return () => viewport.setFrameCallback(null)
}

/** Anzahl der Teile mit aktiver Physik (für Anzeige). */
export const physicsPartCount = signal(0)
/** Ob die Arme gerade dem Kamerabild folgen. */
export const armTrackingActive = signal(false)

/** Physik zurücksetzen (z. B. nach Modellwechsel oder wenn etwas „hängt“). */
export function resetPhysics(): void {
  physics.reset()
}

/** „Neutrale Pose setzen“: Kopfhaltung und Mimik-Ruhewerte übernehmen. */
export function calibrateNeutralPose(): boolean {
  if (!headTracker.calibrate()) return false
  const blendshapes = trackingClient.latest?.blendshapes
  blendshapeBaseline = blendshapes ? new Float32Array(blendshapes) : null
  return true
}

export function resetCalibration(): void {
  headTracker.resetCalibration()
  blendshapeBaseline = null
}
