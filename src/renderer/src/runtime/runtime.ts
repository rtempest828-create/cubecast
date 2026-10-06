import { effect } from '@preact/signals'
import { poseFromHead } from '@core/pipeline/pose'
import { HeadTracker } from '@core/tracking/head-tracker'
import type { Viewport } from '@render/viewport'
import { trackingClient, trackingDebug, trackingSettings } from '../state/tracking-state'

/**
 * Laufzeit pro Frame: Tracking-Ergebnis → Kopf-Tracker → Pose → 3D-Ansicht.
 * Ab M3 kommen hier Gesicht, Rollen, Animationen, Lua und Physik dazu.
 */
export const headTracker = new HeadTracker(trackingSettings.peek())
effect(() => headTracker.setSettings(trackingSettings.value))

const DEBUG_INTERVAL_MS = 100

export function attachRuntime(viewport: Viewport): () => void {
  let lastDebug = 0
  viewport.setFrameCallback((nowMs) => {
    const running = trackingClient.status.peek() === 'running'
    const result = running ? trackingClient.latest : null
    const head = headTracker.update(result, nowMs)
    viewport.applyPose(poseFromHead(head))

    if (nowMs - lastDebug >= DEBUG_INTERVAL_MS) {
      lastDebug = nowMs
      const stats = trackingClient.getStats(nowMs)
      const faceFound = running && headTracker.hasFace(nowMs)
      trackingDebug.value = {
        renderFps: viewport.renderFps,
        trackingFps: running ? stats.fps : 0,
        latencyMs: running ? stats.latencyMs : 0,
        processingMs: running ? stats.processingMs : 0,
        faceFound,
        calibrated: headTracker.isCalibrated,
        head,
        blendshapes: faceFound ? (result?.blendshapes ?? null) : null
      }
    }
  })
  return () => viewport.setFrameCallback(null)
}

/** „Neutrale Pose setzen“: aktuelle Kopfhaltung gilt als geradeaus. */
export function calibrateNeutralPose(): boolean {
  return headTracker.calibrate()
}

export function resetCalibration(): void {
  headTracker.resetCalibration()
}
