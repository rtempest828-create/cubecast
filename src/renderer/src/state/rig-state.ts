import { computed, effect, signal } from '@preact/signals'
import type { Emotion } from '@core/face/emotions'
import { NEUTRAL_FACE_STATE, type FaceState } from '@core/face/face-compose'
import { analyzeFace, type FaceLayout } from '@core/face/face-layout'
import { extractFaceSource } from '@core/face/face-source'
import { generateFaceVariants } from '@core/face/face-variants'
import type { RgbaImage } from '@core/image/rgba-image'
import { logger } from '@core/log/logger'
import { createDefaultRig, parseRig, rerunAutoDetection, type AvatarRig, type FaceRigSettings } from '@core/roles/rig'
import { avatarModel, loadedSkin } from './app-state'

/**
 * Rollen-Zuordnung und Gesichts-Overlay des aktuellen Avatars.
 * Wird pro Avatar als JSON gespeichert (`userData/avatars/<Schlüssel>.json`).
 */

export const faceSource = computed(() => extractFaceSource(loadedSkin.value.skin))
export const faceAnalysis = computed(() => analyzeFace(faceSource.value.grid))

export const rig = signal<AvatarRig>(createDefaultRig(avatarModel.peek()))
export const rigWarnings = signal<readonly string[]>([])
/** Schlüssel des aktuellen Avatars (null, bis er berechnet ist). */
export const avatarKey = signal<string | null>(null)

/** Wirksames Layout: vom Nutzer angepasst oder automatisch erkannt. */
export const faceLayout = computed<FaceLayout>(() => rig.value.face.layout ?? faceAnalysis.value.layout)
export const faceVariants = computed(() => generateFaceVariants(faceSource.value.grid, faceAnalysis.value, faceLayout.value))

/** Manuell gewählte Emotion (null = automatisch bzw. neutral). */
export const manualEmotion = signal<Emotion | null>(null)
/** Aktuell angezeigte Emotion und Gesichtszustand (für die Oberfläche, ca. 10 × pro Sekunde). */
export const currentEmotion = signal<Emotion>('neutral')
export const currentFaceState = signal<FaceState>(NEUTRAL_FACE_STATE)

const SAVE_DELAY_MS = 400
let saveTimer: ReturnType<typeof setTimeout> | null = null
let loadToken = 0

/** Schlüssel aus dem Bildinhalt: derselbe Skin bekommt immer dieselbe Zuordnung. */
async function skinKey(image: RgbaImage): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(image.data))
  const hex = Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
  return `skin-${hex}`
}

function hasBridge(): boolean {
  return typeof window !== 'undefined' && 'vtuber' in window
}

// Beim Wechsel des Skins die gespeicherte Zuordnung laden.
effect(() => {
  const skin = loadedSkin.value.skin
  const token = ++loadToken
  avatarKey.value = null
  void (async () => {
    const key = await skinKey(skin.image)
    const stored = hasBridge() ? await window.vtuber.avatarConfig.load(key) : null
    if (token !== loadToken) return
    const { rig: parsed, warnings } = parseRig(stored, avatarModel.peek())
    for (const warning of warnings) logger.warn('Rollen', warning)
    rigWarnings.value = warnings
    rig.value = parsed
    avatarKey.value = key
  })().catch((error: unknown) => logger.error('Rollen', `Zuordnung konnte nicht geladen werden: ${String(error)}`))
})

function scheduleSave(): void {
  const key = avatarKey.peek()
  if (!key || !hasBridge()) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void window.vtuber.avatarConfig.save(key, rig.peek()).then((ok) => {
      if (!ok) logger.warn('Rollen', 'Die Zuordnung konnte nicht gespeichert werden.')
    })
  }, SAVE_DELAY_MS)
}

/** Ändert die Zuordnung und speichert sie (verzögert). */
export function updateRig(next: AvatarRig): void {
  rig.value = next
  scheduleSave()
}

export function updateFaceSettings(patch: Partial<FaceRigSettings>): void {
  updateRig({ ...rig.peek(), face: { ...rig.peek().face, ...patch } })
}

export function resetRig(): void {
  updateRig(createDefaultRig(avatarModel.peek()))
}

export function rerunRoleDetection(): void {
  updateRig(rerunAutoDetection(rig.peek(), avatarModel.peek()))
}
