import type { FaceTrackingResult } from '@core/tracking/types'

/** Nachrichten zwischen App und Tracking-Worker. */

export type TrackingDelegate = 'GPU' | 'CPU'

export interface InitMessage {
  readonly type: 'init'
  /** Absolute URLs (der Worker liegt in einem anderen Ordner als die Seite). */
  readonly wasmLoaderUrl: string
  readonly wasmBinaryUrl: string
  readonly modelUrl: string
  readonly preferGpu: boolean
}

export interface FrameMessage {
  readonly type: 'frame'
  readonly frameId: number
  /** `performance.now()` des Hauptthreads beim Aufnehmen. */
  readonly captureTime: number
  readonly bitmap: ImageBitmap
}

export type ToWorkerMessage = InitMessage | FrameMessage

export type FromWorkerMessage =
  | { readonly type: 'ready'; readonly delegate: TrackingDelegate }
  | { readonly type: 'init-error'; readonly message: string }
  | { readonly type: 'result'; readonly result: FaceTrackingResult }
  | { readonly type: 'frame-error'; readonly frameId: number; readonly message: string }
