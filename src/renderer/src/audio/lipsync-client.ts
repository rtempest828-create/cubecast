import { signal } from '@preact/signals'
import { LipSyncEnvelope, levelFromDb, rmsDb, roundnessFromSpectrum, type LipSyncSettings } from '@core/tracking/lipsync'
import type { LipSyncValues } from '@core/tracking/signals'
import { cameraErrorCode, stopStream, type CameraErrorCode } from '../tracking/camera'

export interface MicrophoneInfo {
  readonly deviceId: string
  readonly label: string
}

export async function listMicrophones(): Promise<MicrophoneInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications').map((d) => ({ deviceId: d.deviceId, label: d.label }))
}

/**
 * Mikrofon-Lip-Sync: misst Lautstärke und Klangfarbe pro Frame. Das Audio wird nur
 * analysiert, nicht aufgezeichnet oder abgespielt.
 */
export class LipSyncClient {
  readonly status = signal<'off' | 'starting' | 'running' | 'error'>('off')
  readonly errorCode = signal<CameraErrorCode | null>(null)

  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private timeData: Float32Array<ArrayBuffer> = new Float32Array(0)
  private freqData: Float32Array<ArrayBuffer> = new Float32Array(0)
  private readonly envelope = new LipSyncEnvelope()
  private token = 0

  async start(deviceId: string | null): Promise<void> {
    this.stop()
    const token = ++this.token
    this.status.value = 'starting'
    this.errorCode.value = null
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        // Ohne automatische Pegelanpassung, damit die Lautstärke ehrlich bleibt.
        audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: false, noiseSuppression: true, autoGainControl: false }
      })
      if (token !== this.token) {
        stopStream(stream)
        return
      }
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.3
      context.createMediaStreamSource(stream).connect(analyser)
      await context.resume()
      this.stream = stream
      this.context = context
      this.analyser = analyser
      this.timeData = new Float32Array(analyser.fftSize)
      this.freqData = new Float32Array(analyser.frequencyBinCount)
      this.status.value = 'running'
    } catch (error) {
      if (token !== this.token) return
      this.status.value = 'error'
      this.errorCode.value = cameraErrorCode(error)
    }
  }

  stop(): void {
    this.token++
    stopStream(this.stream)
    this.stream = null
    void this.context?.close().catch(() => undefined)
    this.context = null
    this.analyser = null
    if (this.status.peek() !== 'error') this.status.value = 'off'
  }

  /** Aktuelle Werte (mit Hüllkurve) oder null, wenn das Mikrofon aus ist. */
  read(dtSec: number, settings: LipSyncSettings): LipSyncValues | null {
    const analyser = this.analyser
    const context = this.context
    if (!analyser || !context) return null
    analyser.getFloatTimeDomainData(this.timeData)
    analyser.getFloatFrequencyData(this.freqData)
    const level = levelFromDb(rmsDb(this.timeData), settings)
    const round = level > 0.05 ? roundnessFromSpectrum(this.freqData, context.sampleRate / analyser.fftSize) : 0
    return this.envelope.update({ level, round }, dtSec)
  }
}
