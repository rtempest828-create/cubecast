import type { FaceTrackingResult } from '@core/tracking/types'

/** Nachrichten zwischen App und Tracking-Worker. */

export type TrackingDelegate = 'GPU' | 'CPU'

export interface InitMessage {
  readonly type: 'init'
  /** Absolute URLs (der Worker liegt in einem anderen Ordner als die Seite). */
  readonly wasmLoaderUrl: string
  readonly wasmBinaryUrl: string
  readonly modelUrl: string
  readonly poseModelUrl: string
  readonly preferGpu: boolean
}

export interface FrameMessage {
  readonly type: 'frame'
  readonly frameId: number
  /** `performance.now()` des Hauptthreads beim Aufnehmen. */
  readonly captureTime: number
  readonly bitmap: ImageBitmap
}

/** Arm-Tracking (Pose Landmarker) ein-/ausschalten; das Modell wird erst bei Bedarf geladen. */
export interface PoseMessage {
  readonly type: 'set-pose'
  readonly enabled: boolean
}

export type ToWorkerMessage = InitMessage | FrameMessage | PoseMessage

export type FromWorkerMessage =
  | { readonly type: 'ready'; readonly delegate: TrackingDelegate }
  | { readonly type: 'init-error'; readonly message: string }
  | { readonly type: 'pose-ready'; readonly delegate: TrackingDelegate }
  | { readonly type: 'pose-error'; readonly message: string }
  | { readonly type: 'result'; readonly result: FaceTrackingResult }
  | { readonly type: 'frame-error'; readonly frameId: number; readonly message: string }
