import { signal } from '@preact/signals'
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url'
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url'
import faceModelUrl from '@resources/mediapipe/face_landmarker.task?url'
import poseModelUrl from '@resources/mediapipe/pose_landmarker_lite.task?url'
import type { FaceTrackingResult } from '@core/tracking/types'
import { CameraError, openCamera, stopStream } from './camera'
import type { FromWorkerMessage, ToWorkerMessage, TrackingDelegate } from './protocol'

export type TrackingStatus = 'off' | 'starting' | 'running' | 'error'

/** Fehler, die die Oberfläche übersetzt anzeigt. */
export type TrackingFailure =
  | { readonly kind: 'camera'; readonly error: CameraError }
  | { readonly kind: 'model'; readonly message: string }
  | { readonly kind: 'ended' }

export interface TrackingStats {
  readonly fps: number
  readonly latencyMs: number
  readonly processingMs: number
}

/** Gleitender Mittelwert für ruhige Anzeigen. */
function ema(previous: number, value: number, factor = 0.1): number {
  return previous === 0 ? value : previous + (value - previous) * factor
}

function absoluteUrl(url: string): string {
  return new URL(url, document.baseURI).href
}

/**
 * Verbindet Kamera und Tracking-Worker:
 * Kamerabild → ImageBitmap → Worker → Ergebnis. Es ist immer höchstens ein Bild
 * unterwegs („Gegendruck“), damit sich bei langsamer Erkennung keine Warteschlange aufbaut.
 */
export class TrackingClient {
  readonly status = signal<TrackingStatus>('off')
  readonly failure = signal<TrackingFailure | null>(null)
  readonly delegate = signal<TrackingDelegate | null>(null)
  readonly stream = signal<MediaStream | null>(null)
  /** Arm-Tracking (Pose-Modell): aus, lädt, bereit oder Fehler. */
  readonly poseStatus = signal<'off' | 'loading' | 'ready' | 'error'>('off')
  readonly poseError = signal<string | null>(null)
  private poseEnabled = false
  private poseLoaded = false

  /** Letztes Ergebnis; wird pro Render-Frame gelesen (bewusst kein Signal). */
  latest: FaceTrackingResult | null = null

  private worker: Worker | null = null
  private workerReady: Promise<void> | null = null
  private pendingInit: { resolve: () => void; reject: (error: Error) => void } | null = null
  private video: HTMLVideoElement | null = null
  private runToken = 0
  private frameCounter = 0
  private busy = false
  private resultTimes: number[] = []
  private latencyMs = 0
  private processingMs = 0

  async start(deviceId: string | null): Promise<void> {
    this.stop()
    const token = ++this.runToken
    this.status.value = 'starting'
    this.failure.value = null

    let stream: MediaStream | null = null
    try {
      const [opened] = await Promise.all([openCamera(deviceId), this.ensureWorker()])
      stream = opened
      if (token !== this.runToken) {
        stopStream(stream)
        return
      }
      const video = document.createElement('video')
      video.className = 'tracking-source-video'
      video.muted = true
      video.playsInline = true
      video.srcObject = stream
      // Im Dokument halten: abgehängte Videos liefern keine Frame-Callbacks.
      document.body.append(video)
      await video.play()
      if (token !== this.runToken) {
        video.remove()
        stopStream(stream)
        return
      }

      for (const track of stream.getVideoTracks()) {
        track.addEventListener('ended', () => {
          if (token !== this.runToken) return
          this.stop()
          this.status.value = 'error'
          this.failure.value = { kind: 'ended' }
        })
      }

      this.video = video
      this.stream.value = stream
      this.status.value = 'running'
      this.pump(token)
    } catch (error) {
      stopStream(stream)
      if (token !== this.runToken) return
      this.status.value = 'error'
      this.failure.value =
        error instanceof CameraError ? { kind: 'camera', error } : { kind: 'model', message: error instanceof Error ? error.message : String(error) }
    }
  }

  stop(): void {
    this.runToken++
    stopStream(this.stream.peek())
    this.video?.remove()
    this.video = null
    this.stream.value = null
    this.latest = null
    this.busy = false
    this.resultTimes = []
    this.latencyMs = 0
    this.processingMs = 0
    if (this.status.peek() !== 'error') this.status.value = 'off'
  }

  /** Beendet auch den Worker (z. B. beim Schließen des Fensters). */
  dispose(): void {
    this.stop()
    this.worker?.terminate()
    this.worker = null
    this.workerReady = null
  }

  /** Arm-Tracking ein-/ausschalten. Das Pose-Modell wird beim ersten Einschalten geladen. */
  setPoseEnabled(enabled: boolean): void {
    this.poseEnabled = enabled
    this.poseStatus.value = !enabled ? 'off' : this.poseLoaded ? 'ready' : 'loading'
    if (!enabled) this.poseError.value = null
    this.worker?.postMessage({ type: 'set-pose', enabled } satisfies ToWorkerMessage)
  }

  getStats(nowMs: number): TrackingStats {
    // Ergebnisse der letzten Sekunde zählen.
    while (this.resultTimes.length > 0 && nowMs - this.resultTimes[0]! > 1000) this.resultTimes.shift()
    return { fps: this.resultTimes.length, latencyMs: this.latencyMs, processingMs: this.processingMs }
  }

  private ensureWorker(): Promise<void> {
    if (this.workerReady) return this.workerReady
    const worker = new Worker(new URL('./tracking.worker.ts', import.meta.url), { type: 'module', name: 'tracking' })
    this.worker = worker
    this.workerReady = new Promise<void>((resolve, reject) => {
      this.pendingInit = { resolve, reject }
    })
    worker.addEventListener('message', (event: MessageEvent<FromWorkerMessage>) => this.onWorkerMessage(event.data))
    worker.addEventListener('error', (event) => {
      const message = event.message || 'Worker konnte nicht gestartet werden'
      console.error('[Tracking] Worker-Fehler:', message)
      const wasRunning = this.status.peek() === 'running'
      this.failInit(message)
      if (wasRunning) {
        this.stop()
        this.status.value = 'error'
        this.failure.value = { kind: 'model', message }
      }
    })
    const init: ToWorkerMessage = {
      type: 'init',
      wasmLoaderUrl: absoluteUrl(wasmLoaderUrl),
      wasmBinaryUrl: absoluteUrl(wasmBinaryUrl),
      modelUrl: absoluteUrl(faceModelUrl),
      poseModelUrl: absoluteUrl(poseModelUrl),
      preferGpu: true
    }
    worker.postMessage(init)
    worker.postMessage({ type: 'set-pose', enabled: this.poseEnabled } satisfies ToWorkerMessage)
    return this.workerReady
  }

  private failInit(message: string): void {
    this.pendingInit?.reject(new Error(message))
    this.pendingInit = null
    // Beim nächsten Start neu versuchen.
    this.worker?.terminate()
    this.worker = null
    this.workerReady = null
    this.poseLoaded = false
  }

  private onWorkerMessage(message: FromWorkerMessage): void {
    switch (message.type) {
      case 'ready':
        this.delegate.value = message.delegate
        this.pendingInit?.resolve()
        this.pendingInit = null
        break
      case 'init-error':
        this.failInit(message.message)
        break
      case 'pose-ready':
        this.poseLoaded = true
        if (this.poseEnabled) this.poseStatus.value = 'ready'
        break
      case 'pose-error':
        this.poseStatus.value = 'error'
        this.poseError.value = message.message
        break
      case 'result': {
        this.busy = false
        if (this.status.peek() !== 'running') return
        const now = performance.now()
        this.latest = message.result
        this.resultTimes.push(now)
        this.latencyMs = ema(this.latencyMs, now - message.result.captureTime)
        this.processingMs = ema(this.processingMs, message.result.processingMs)
        break
      }
      case 'frame-error':
        this.busy = false
        console.warn(`[Tracking] Bild ${message.frameId} fehlgeschlagen:`, message.message)
        break
    }
  }

  /** Schickt neue Kamerabilder an den Worker, sobald er frei ist. */
  private pump(token: number): void {
    const video = this.video
    if (token !== this.runToken || !video || !this.worker) return

    if (!this.busy && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      this.busy = true
      const frameId = ++this.frameCounter
      const captureTime = performance.now()
      createImageBitmap(video)
        .then((bitmap) => {
          if (token !== this.runToken || !this.worker) {
            bitmap.close()
            this.busy = false
            return
          }
          const message: ToWorkerMessage = { type: 'frame', frameId, captureTime, bitmap }
          this.worker.postMessage(message, [bitmap])
        })
        .catch(() => {
          this.busy = false
        })
    }

    if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(() => this.pump(token))
    else setTimeout(() => this.pump(token), 16)
  }
}
