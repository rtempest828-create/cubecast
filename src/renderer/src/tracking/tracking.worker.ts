import { FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { MEDIAPIPE_POSE_INDICES, POSE_FLOATS } from '@core/tracking/arms'
import { blendshapesFromCategories } from '@core/tracking/blendshapes'
import type { FaceTrackingResult } from '@core/tracking/types'
import type { FromWorkerMessage, InitMessage, ToWorkerMessage, TrackingDelegate } from './protocol'

/**
 * Tracking-Worker: führt MediaPipe in einem eigenen Thread aus, damit die
 * 3D-Darstellung nie auf die Erkennung warten muss. Gesicht immer, Körper (Arme) optional.
 */

// Typisierte Sicht auf den Worker-Kontext (die DOM-Typen beschreiben `self` als Fenster).
const scope = self as unknown as {
  postMessage(message: FromWorkerMessage, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (event: MessageEvent<ToWorkerMessage>) => void): void
}

type Fileset = { wasmLoaderPath: string; wasmBinaryPath: string }

let fileset: Fileset | null = null
let preferGpu = true
let poseModelUrl = ''
let landmarker: FaceLandmarker | null = null
let poseLandmarker: PoseLandmarker | null = null
let poseLoading = false
let poseEnabled = false
let lastTimestamp = -Infinity

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * MediaPipe setzt `self.ModuleFactory` nach jedem erzeugten Modell wieder zurück und lädt
 * den WASM-Loader für das nächste Modell per `import()` – das liefert aber das bereits
 * geladene Modul, ohne es erneut auszuführen. Daher die Fabrik vorher selbst setzen.
 */
async function ensureModuleFactory(): Promise<void> {
  const global = self as unknown as { ModuleFactory?: unknown }
  if (global.ModuleFactory || !fileset) return
  const loader = (await import(/* @vite-ignore */ fileset.wasmLoaderPath)) as { default?: unknown }
  if (loader.default) global.ModuleFactory = loader.default
}

/** Versucht GPU, dann CPU. */
async function withDelegates<T>(create: (delegate: TrackingDelegate) => Promise<T>): Promise<{ value: T; delegate: TrackingDelegate }> {
  const delegates: TrackingDelegate[] = preferGpu ? ['GPU', 'CPU'] : ['CPU']
  let lastError: unknown = null
  for (const delegate of delegates) {
    try {
      await ensureModuleFactory()
      return { value: await create(delegate), delegate }
    } catch (error) {
      lastError = error
      console.warn(`[Tracking] ${delegate}-Berechnung nicht verfügbar:`, error)
    }
  }
  throw lastError ?? new Error('Keine Berechnung verfügbar')
}

async function init(message: InitMessage): Promise<void> {
  fileset = { wasmLoaderPath: message.wasmLoaderUrl, wasmBinaryPath: message.wasmBinaryUrl }
  preferGpu = message.preferGpu
  poseModelUrl = message.poseModelUrl
  try {
    const files = fileset
    const { value, delegate } = await withDelegates((d) =>
      FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: message.modelUrl, delegate: d },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
    )
    landmarker = value
    scope.postMessage({ type: 'ready', delegate })
    if (poseEnabled) void ensurePose()
  } catch (error) {
    scope.postMessage({ type: 'init-error', message: errorText(error) })
  }
}

async function ensurePose(): Promise<void> {
  if (poseLandmarker || poseLoading || !fileset) return
  poseLoading = true
  try {
    const files = fileset
    const { value, delegate } = await withDelegates((d) =>
      PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: poseModelUrl, delegate: d },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      })
    )
    poseLandmarker = value
    scope.postMessage({ type: 'pose-ready', delegate })
  } catch (error) {
    scope.postMessage({ type: 'pose-error', message: errorText(error) })
  } finally {
    poseLoading = false
  }
}

/** Packt die Arm-relevanten Weltpunkte in ein kompaktes Array. */
function packPose(points: readonly { x: number; y: number; z: number; visibility?: number }[]): Float32Array {
  const packed = new Float32Array(POSE_FLOATS)
  MEDIAPIPE_POSE_INDICES.forEach((index, i) => {
    const p = points[index]
    if (!p) return
    packed.set([p.x, p.y, p.z, p.visibility ?? 0], i * 4)
  })
  return packed
}

function detect(frameId: number, captureTime: number, bitmap: ImageBitmap): void {
  try {
    if (!landmarker) return
    // MediaPipe verlangt streng steigende Zeitstempel.
    const timestamp = Math.max(captureTime, lastTimestamp + 1)
    lastTimestamp = timestamp
    const start = performance.now()
    const output = landmarker.detectForVideo(bitmap, timestamp)

    let pose: Float32Array | null = null
    if (poseEnabled && poseLandmarker) {
      const poseOutput = poseLandmarker.detectForVideo(bitmap, timestamp)
      const world = poseOutput.worldLandmarks[0]
      if (world) pose = packPose(world)
    }
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
      processingMs,
      pose
    }
    const transfer: Transferable[] = []
    if (blendshapes) transfer.push(blendshapes.buffer)
    if (matrix) transfer.push(matrix.buffer)
    if (pose) transfer.push(pose.buffer)
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
  else if (message.type === 'set-pose') {
    poseEnabled = message.enabled
    if (poseEnabled) void ensurePose()
  }
})
