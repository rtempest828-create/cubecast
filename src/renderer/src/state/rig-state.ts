import { computed, effect, signal } from '@preact/signals'
import type { Emotion } from '@core/face/emotions'
import { NEUTRAL_FACE_STATE, type FaceState } from '@core/face/face-compose'
import { analyzeFace, type FaceLayout } from '@core/face/face-layout'
import { extractFaceSource } from '@core/face/face-source'
import { applyCustomVariants } from '@core/face/face-custom'
import { generateFaceVariants } from '@core/face/face-variants'
import type { RgbaImage } from '@core/image/rgba-image'
import { logger } from '@core/log/logger'
import type { CosmeticSettings } from '@core/model/cosmetics'
import type { VanillaId } from '@core/figura/vanilla-scan'
import { createDefaultRig, parseCosmetics, parseRig, parseVanillaHidden, rerunAutoDetection, withDefaults, type AvatarRig, type FaceRigSettings } from '@core/roles/rig'
import { parseChibiSettings, type ChibiSettings } from '@core/chibi/chibi'
import { avatarModel, chibiSettings, cosmeticSettings, loadedFigura, loadedSkin, vanillaOverride } from './app-state'

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
/** Automatisch erzeugte Varianten (Grundlage für den Face-Editor). */
export const generatedFaceVariants = computed(() => generateFaceVariants(faceSource.value.grid, faceAnalysis.value, faceLayout.value))
/** Wirksame Varianten: automatisch erzeugt, ggf. durch eigene aus dem Face-Editor ersetzt. */
export const faceVariants = computed(() => applyCustomVariants(generatedFaceVariants.value, rig.value.face.custom ?? {}))

/** Manuell gewählte Emotion (null = automatisch bzw. neutral). */
export const manualEmotion = signal<Emotion | null>(null)
/** Aktuell angezeigte Emotion und Gesichtszustand (für die Oberfläche, ca. 10 × pro Sekunde). */
export const currentEmotion = signal<Emotion>('neutral')
export const currentFaceState = signal<FaceState>(NEUTRAL_FACE_STATE)

const SAVE_DELAY_MS = 400
let saveTimer: ReturnType<typeof setTimeout> | null = null
/** Ausstehendes Speichern (wird beim Avatarwechsel sofort ausgeführt). */
let pendingSave: (() => void) | null = null
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

// Beim Wechsel des Skins bzw. Figura-Avatars die gespeicherte Zuordnung laden.
// Ein Figura-Avatar hat seine eigene Zuordnung (pro Ordner), unabhängig vom Skin.
effect(() => {
  const skin = loadedSkin.value.skin
  const figuraKey = loadedFigura.value?.key ?? null
  const token = ++loadToken
  flushSave()
  avatarKey.value = null
  void (async () => {
    const key = figuraKey ?? (await skinKey(skin.image))
    const stored = hasBridge() ? await window.vtuber.avatarConfig.load(key) : null
    if (token !== loadToken) return
    // Zubehör und Vanilla-Auswahl zuerst setzen, damit das Modell (und damit die Teile) schon stimmt.
    const record = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {}
    cosmeticSettings.value = parseCosmetics(record['cosmetics'])
    vanillaOverride.value = parseVanillaHidden(record['vanillaHidden'])
    chibiSettings.value = parseChibiSettings(record['chibi'])
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
  pendingSave = () => {
    void window.vtuber.avatarConfig.save(key, rig.peek()).then((ok) => {
      if (!ok) logger.warn('Rollen', 'Die Zuordnung konnte nicht gespeichert werden.')
    })
  }
  saveTimer = setTimeout(flushSave, SAVE_DELAY_MS)
}

/** Speichert ausstehende Änderungen sofort (z. B. bevor ein anderer Avatar geladen wird). */
function flushSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  const save = pendingSave
  pendingSave = null
  save?.()
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
  updateRig({
    ...createDefaultRig(avatarModel.peek()),
    cosmetics: rig.peek().cosmetics,
    vanillaHidden: rig.peek().vanillaHidden ?? null,
    animations: rig.peek().animations ?? {},
    chibi: chibiSettings.peek()
  })
}

/** Chibi-Modus ändern (Modell wird neu gebaut; Teil-IDs und Rollen bleiben). */
export function updateChibi(patch: Partial<ChibiSettings>): void {
  const next = { ...chibiSettings.peek(), ...patch }
  chibiSettings.value = next
  updateRig({ ...rig.peek(), chibi: next })
}

export function toggleChibi(): void {
  updateChibi({ enabled: !chibiSettings.peek().enabled })
}

/** Vanilla-Teile ein-/ausblenden (null = wie im Figura-Skript). */
export function updateVanillaHidden(hidden: readonly VanillaId[] | null): void {
  vanillaOverride.value = hidden
  updateRig(withDefaults({ ...rig.peek(), vanillaHidden: hidden }, avatarModel.peek()))
}

/** Unbestätigte Vorschläge der Auto-Erkennung. */
export const pendingSuggestions = computed(() => rig.value.assignments.filter((a) => !a.confirmed).length)

/** Bestätigt alle Vorschläge auf einmal. Gibt die Anzahl zurück. */
export function confirmAllSuggestions(): number {
  const count = pendingSuggestions.peek()
  if (count > 0) updateRig({ ...rig.peek(), assignments: rig.peek().assignments.map((a) => (a.confirmed ? a : { ...a, confirmed: true })) })
  return count
}

/** Test-Zubehör ein-/ausschalten (Modell wird neu aufgebaut, Rollen ergänzt). */
export function updateCosmetics(patch: Partial<CosmeticSettings>): void {
  const next = { ...rig.peek().cosmetics, ...patch }
  cosmeticSettings.value = next
  updateRig(withDefaults({ ...rig.peek(), cosmetics: next }, avatarModel.peek()))
}

// Neue Teile im Modell (z. B. Zubehör) bekommen automatisch ihre Standard-Rolle.
effect(() => {
  const model = avatarModel.value
  const current = rig.peek()
  const next = withDefaults(current, model)
  if (next !== current) rig.value = next
})

export function rerunRoleDetection(): void {
  updateRig(rerunAutoDetection(rig.peek(), avatarModel.peek()))
}
