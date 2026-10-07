import { signal } from '@preact/signals'
import { parseOutputSettings, serializeImage, deserializeImage } from '@core/output/protocol'
import { normalizeSkin } from '@core/skin/skin'
import { t } from '@shared/i18n'
import type { ProfileSummary } from '@shared/ipc'
import { loadFigura, unloadFigura } from '../figura/figura-loader'
import { loadedFigura, loadedSkin, modelChoice, pushToast, showOuterLayer, type ModelChoice, type SkinSource } from './app-state'
import { bodyState } from './body-state'
import { outputSettings, outputWindowSettings } from './output-state'
import { isRecord, loadSetting, saveSetting } from './persist'
import { trackingSettings } from './tracking-state'

/**
 * Profile: Skin, Figura-Avatar und alle Einstellungen (Tracking, Körper, Ausgabe) unter einem
 * Namen. Rollen-Zuordnungen bleiben pro Avatar gespeichert und gehören nicht ins Profil.
 */

export const profiles = signal<readonly ProfileSummary[]>([])
export const autoProfile = signal<string | null>(loadSetting<string | null>('vtuber.autoProfile', null, (v) => (typeof v === 'string' ? v : null)))
/** Zuletzt geladenes oder gespeichertes Profil. */
export const currentProfile = signal<string | null>(null)

const hasBridge = (): boolean => typeof window !== 'undefined' && 'vtuber' in window

export function setAutoProfile(name: string | null): void {
  autoProfile.value = name
  saveSetting('vtuber.autoProfile', name)
}

export async function refreshProfiles(): Promise<void> {
  if (hasBridge()) profiles.value = await window.vtuber.profiles.list()
}

function snapshot(): Record<string, unknown> {
  const skin = loadedSkin.peek()
  const figura = loadedFigura.peek()
  return {
    version: 1,
    skin: { ...serializeImage(skin.skin.image), source: skin.source, officialModel: skin.officialModel },
    modelChoice: modelChoice.peek(),
    showOuterLayer: showOuterLayer.peek(),
    figura: figura ? { key: figura.key, location: figura.location } : null,
    tracking: trackingSettings.peek(),
    body: bodyState.peek(),
    output: outputSettings.peek(),
    outputWindow: outputWindowSettings.peek()
  }
}

export async function saveProfile(name: string): Promise<boolean> {
  if (!hasBridge()) return false
  const ok = await window.vtuber.profiles.save(name, snapshot())
  pushToast(ok ? 'success' : 'error', t(ok ? 'profile.toast.saved' : 'profile.toast.saveFailed', { name }))
  if (ok) {
    currentProfile.value = name
    await refreshProfiles()
  }
  return ok
}

const SOURCE_KINDS = new Set(['placeholder', 'file', 'player'])

function parseSource(value: unknown): SkinSource {
  if (!isRecord(value) || !SOURCE_KINDS.has(String(value['kind']))) return { kind: 'placeholder' }
  if (value['kind'] === 'file') return { kind: 'file', fileName: String(value['fileName'] ?? '').slice(0, 200) }
  if (value['kind'] === 'player') return { kind: 'player', name: String(value['name'] ?? '').slice(0, 16) }
  return { kind: 'placeholder' }
}

/** Lädt ein Profil; einzelne kaputte Teile werden übersprungen (mit Hinweis). */
export async function loadProfile(name: string): Promise<boolean> {
  if (!hasBridge()) return false
  const data = await window.vtuber.profiles.load(name)
  if (!isRecord(data)) {
    pushToast('error', t('profile.toast.loadFailed', { name }))
    return false
  }
  let problems = 0
  const skin = data['skin']
  if (isRecord(skin) && typeof skin['data'] === 'string') {
    try {
      const image = deserializeImage(Number(skin['width']), Number(skin['height']), skin['data'])
      loadedSkin.value = {
        skin: normalizeSkin(image),
        source: parseSource(skin['source']),
        officialModel: skin['officialModel'] === 'slim' || skin['officialModel'] === 'classic' ? skin['officialModel'] : null
      }
    } catch {
      problems++
    }
  }
  if (['auto', 'classic', 'slim'].includes(String(data['modelChoice']))) modelChoice.value = data['modelChoice'] as ModelChoice
  if (typeof data['showOuterLayer'] === 'boolean') showOuterLayer.value = data['showOuterLayer']
  // Einstellungen über ihre Prüffunktionen übernehmen (unbekannte Felder fallen weg).
  if (isRecord(data['tracking'])) trackingSettings.value = { ...trackingSettings.peek(), ...pick(trackingSettings.peek(), data['tracking']) }
  if (isRecord(data['body'])) bodyState.value = { ...bodyState.peek(), ...pick(bodyState.peek(), data['body']) }
  if (isRecord(data['output'])) outputSettings.value = parseOutputSettings(data['output'])
  if (isRecord(data['outputWindow'])) outputWindowSettings.value = { ...outputWindowSettings.peek(), ...pick(outputWindowSettings.peek(), data['outputWindow']) }

  const figura = data['figura']
  if (isRecord(figura) && typeof figura['key'] === 'string') await loadFigura(figura['key'])
  else unloadFigura()

  currentProfile.value = name
  pushToast(problems === 0 ? 'success' : 'error', t(problems === 0 ? 'profile.toast.loaded' : 'profile.toast.partial', { name }))
  return true
}

/** Übernimmt nur Felder, die es im aktuellen Zustand gibt und die denselben Typ haben. */
function pick<T extends object>(current: T, incoming: Record<string, unknown>): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(current)) {
    const next = incoming[key]
    if (next !== undefined && typeof next === typeof value && (typeof next !== 'number' || Number.isFinite(next))) out[key] = next
  }
  return out as Partial<T>
}

export async function removeProfile(name: string): Promise<void> {
  if (!hasBridge()) return
  if (await window.vtuber.profiles.remove(name)) {
    if (autoProfile.peek() === name) setAutoProfile(null)
    if (currentProfile.peek() === name) currentProfile.value = null
    await refreshProfiles()
  }
}

/** Beim Start: Profil automatisch laden (falls eingestellt). */
export async function loadAutoProfile(): Promise<void> {
  await refreshProfiles()
  const name = autoProfile.peek()
  if (name && profiles.peek().some((p) => p.name === name)) await loadProfile(name)
}
