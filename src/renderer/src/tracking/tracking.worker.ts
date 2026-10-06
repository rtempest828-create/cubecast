import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { blendshapesFromCategories } from '@core/tracking/blendshapes'
import type { FaceTrackingResult } from '@core/tracking/types'
import type { FromWorkerMessage, InitMessage, ToWorkerMessage, TrackingDelegate } from './protocol'

/**
 * Tracking-Worker: führt MediaPipe in einem eigenen Thread aus, damit die
 * 3D-Darstellung nie auf die Gesichtserkennung warten muss.
 */

// Typisierte Sicht auf den Worker-Kontext (die DOM-Typen beschreiben `self` als Fenster).
const scope = self as unknown as {
  postMessage(message: FromWorkerMessage, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorkerMessage>) => void): void
}

let landmarker: FaceLandmarker | null = null
let lastTimestamp = -Infinity

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function init(message: InitMessage): Promise<void> {
  const fileset = { wasmLoaderPath: message.wasmLoaderUrl, wasmBinaryPath: message.wasmBinaryUrl }
  const delegates: TrackingDelegate[] = message.preferGpu ? ['GPU', 'CPU'] : ['CPU']
  let lastError: unknown = null

  for (const delegate of delegates) {
    try {
      landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: message.modelUrl, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
      scope.postMessage({ type: 'ready', delegate })
      return
    } catch (error) {
      lastError = error
      console.warn(`[Tracking] ${delegate}-Berechnung nicht verfügbar:`, error)
    }
  }
  scope.postMessage({ type: 'init-error', message: errorText(lastError) })
}

function detect(frameId: number, captureTime: number, bitmap: ImageBitmap): void {
  try {
    if (!landmarker) return
    // MediaPipe verlangt streng steigende Zeitstempel.
    const timestamp = Math.max(captureTime, lastTimestamp + 1)
    lastTimestamp = timestamp
    const start = performance.now()
    const output = landmarker.detectForVideo(bitmap, timestamp)
    const processingMs = performance.now() - start

    const categories = output.faceBlendshapes[0]?.categories
    const matrixData = output.facialTransformationMatrixes?.[0]?.data
    const blendshapes = categories ? blendshapesFromCategories(categories) : null
    const matrix = matrixData && matrixData.length >= 16 ? Float32Array.from(matrixData) : null

    const result: FaceTrackingResult = {
      frameId,
      captureTime,
      faceFound: output.faceLandmarks.length > 0 && matrix !== null,
      blendshapes,
      matrix,
      processingMs
    }
    const transfer: Transferable[] = []
    if (blendshapes) transfer.push(blendshapes.buffer)
    if (matrix) transfer.push(matrix.buffer)
    scope.postMessage({ type: 'result', result }, transfer)
  } catch (error) {
    scope.postMessage({ type: 'frame-error', frameId, message: errorText(error) })
  } finally {
    bitmap.close()
  }
}

scope.addEventListener('message', (event) => {
  const message = event.data
  if (message.type === 'init') void init(message)
  else if (message.type === 'frame') detect(message.frameId, message.captureTime, message.bitmap)
})
