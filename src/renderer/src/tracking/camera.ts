/** Zugriff auf Webcams (Auswahl, Start, verständliche Fehlercodes). */

export interface CameraInfo {
  readonly deviceId: string
  readonly label: string
}

export type CameraErrorCode = 'permission' | 'not-found' | 'in-use' | 'constraints' | 'unknown'

export class CameraError extends Error {
  constructor(
    readonly code: CameraErrorCode,
    readonly detail: string
  ) {
    super(`Kamera: ${code} (${detail})`)
    this.name = 'CameraError'
  }
}

/** Ordnet die Fehler von `getUserMedia` (DOMException-Namen) unseren Codes zu. */
export function cameraErrorCode(error: unknown): CameraErrorCode {
  const name = error instanceof DOMException || error instanceof Error ? error.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'permission'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'not-found'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'in-use'
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'constraints'
    default:
      return 'unknown'
  }
}

/** Listet Kameras. Namen sind erst sichtbar, nachdem einmal Kamerazugriff erteilt wurde. */
export async function listCameras(): Promise<CameraInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'videoinput' && d.deviceId).map((d) => ({ deviceId: d.deviceId, label: d.label }))
}

/** Öffnet die Kamera mit für Face-Tracking passender Auflösung (640×480 genügt und spart Rechenzeit). */
export async function openCamera(deviceId: string | null): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraError('not-found', 'mediaDevices nicht verfügbar')
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 60 }
      }
    })
  } catch (error) {
    throw new CameraError(cameraErrorCode(error), error instanceof Error ? error.message : String(error))
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}
