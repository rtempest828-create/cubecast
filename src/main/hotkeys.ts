import { globalShortcut } from 'electron'
import { ACCELERATOR_PATTERN, type HotkeyBinding, type HotkeyResult } from '../shared/ipc'

const MAX_HOTKEYS = 64

/** Prüft Eingaben aus dem Renderer (Anzahl, ID, Tastenkürzel). */
export function validBindings(value: unknown): HotkeyBinding[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_HOTKEYS)
    .filter(
      (b): b is HotkeyBinding =>
        typeof b === 'object' &&
        b !== null &&
        typeof (b as HotkeyBinding).id === 'string' &&
        (b as HotkeyBinding).id.length <= 200 &&
        typeof (b as HotkeyBinding).accelerator === 'string' &&
        ACCELERATOR_PATTERN.test((b as HotkeyBinding).accelerator)
    )
}

/**
 * Registriert globale Tastenkürzel neu. Kürzel, die ein anderes Programm schon belegt,
 * werden als `ok: false` gemeldet.
 */
export function applyHotkeys(bindings: readonly HotkeyBinding[], onTrigger: (id: string) => void): HotkeyResult[] {
  globalShortcut.unregisterAll()
  const used = new Set<string>()
  return bindings.map((binding) => {
    if (used.has(binding.accelerator)) return { id: binding.id, ok: false }
    let ok: boolean
    try {
      ok = globalShortcut.register(binding.accelerator, () => onTrigger(binding.id))
    } catch {
      ok = false
    }
    if (ok) used.add(binding.accelerator)
    return { id: binding.id, ok }
  })
}

export function clearHotkeys(): void {
  globalShortcut.unregisterAll()
}
