import { effect, signal } from '@preact/signals'
import type { RgbaImage } from '@core/image/rgba-image'
import { DEFAULT_OUTPUT_SETTINGS, parseOutputSettings, serializeImage, serializeModel, serializePose, type CameraState, type OutputMessage, type OutputSettings } from '@core/output/protocol'
import type { Pose } from '@core/pipeline/pose'
import type { OutputStatus } from '@shared/ipc'
import { avatarModel } from './app-state'
import { isRecord, loadSetting, numberIn, saveSetting } from './persist'

/**
 * Ausgabe für OBS (Browserquelle) und das Ausgabefenster: Die App schickt Modell,
 * Texturen, Pose und Einstellungen an den lokalen Ausgabe-Server im Hauptprozess.
 */

export interface OutputWindowSettings {
  readonly width: number
  readonly height: number
  readonly alwaysOnTop: boolean
}

const SETTINGS_KEY = 'vtuber.output'
const WINDOW_KEY = 'vtuber.outputWindow'

export const outputSettings = signal<OutputSettings>(loadSetting(SETTINGS_KEY, DEFAULT_OUTPUT_SETTINGS, (v) => parseOutputSettings(v)))
export const outputWindowSettings = signal<OutputWindowSettings>(
  loadSetting(WINDOW_KEY, { width: 720, height: 720, alwaysOnTop: false }, (v) =>
    isRecord(v) ? { width: numberIn(v['width'], 160, 3840, 720), height: numberIn(v['height'], 160, 3840, 720), alwaysOnTop: v['alwaysOnTop'] === true } : null
  )
)
export const outputStatus = signal<OutputStatus>({ running: false, url: '', clients: 0, windowOpen: false })

const hasBridge = (): boolean => typeof window !== 'undefined' && 'vtuber' in window

function send(message: OutputMessage): void {
  if (hasBridge()) window.vtuber.output.publish(message)
}

export function updateOutputSettings(patch: Partial<OutputSettings>): void {
  outputSettings.value = { ...outputSettings.peek(), ...patch }
}

export function updateOutputWindowSettings(patch: Partial<OutputWindowSettings>): void {
  outputWindowSettings.value = { ...outputWindowSettings.peek(), ...patch }
}

effect(() => {
  const settings = outputSettings.value
  saveSetting(SETTINGS_KEY, settings)
  send({ type: 'settings', settings })
})
effect(() => saveSetting(WINDOW_KEY, outputWindowSettings.value))

// Neues Modell → an die Ausgabe (auch ohne verbundene Ausgabe; der Server merkt es sich für später).
effect(() => {
  const model = avatarModel.value
  send({ type: 'model', model: serializeModel(model) })
})

if (hasBridge()) {
  void window.vtuber.output.status().then((s) => {
    if (s) outputStatus.value = s
  })
  window.vtuber.output.onStatus((s) => (outputStatus.value = s))
}

const POSE_INTERVAL_MS = 1000 / 60
let lastPose = 0

/** Pose eines Bildes weitergeben (nur wenn jemand zuschaut, max. 60 × pro Sekunde). */
export function publishPose(pose: Pose, nowMs: number): void {
  const status = outputStatus.peek()
  if (status.clients === 0) return
  if (nowMs - lastPose < POSE_INTERVAL_MS - 2) return
  lastPose = nowMs
  send({ type: 'pose', parts: serializePose(pose) })
}

/** Geänderte Textur (Gesicht, Skin) weitergeben. */
export function publishTexture(id: string, image: RgbaImage): void {
  send({ type: 'texture', id, ...serializeImage(image) })
}

// Kamera der 3D-Ansicht (für „Aktuelle Ansicht übernehmen“)
let cameraProvider: (() => CameraState) | null = null
export function setCameraProvider(provider: (() => CameraState) | null): void {
  cameraProvider = provider
}

export function useCurrentViewForOutput(): boolean {
  const camera = cameraProvider?.()
  if (!camera) return false
  updateOutputSettings({ camera: 'custom', customCamera: camera, zoom: 1 })
  return true
}

export async function openOutputWindow(): Promise<boolean> {
  if (!hasBridge()) return false
  return window.vtuber.output.openWindow(outputWindowSettings.peek())
}

export async function closeOutputWindow(): Promise<void> {
  if (hasBridge()) await window.vtuber.output.closeWindow()
}

export async function toggleOutputWindow(): Promise<void> {
  if (outputStatus.peek().windowOpen) await closeOutputWindow()
  else await openOutputWindow()
}

export async function copyOutputUrl(): Promise<void> {
  if (hasBridge()) await window.vtuber.output.copyUrl()
}
