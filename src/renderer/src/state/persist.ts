/**
 * Kleine Einstellungen pro Rechner im `localStorage` (z. B. gewählte Kamera).
 * Fehler beim Lesen/Schreiben werden abgefangen; dann gelten die Standardwerte.
 * Profile und Avatar-Zuordnungen werden ab M3/M6 als JSON-Dateien gespeichert.
 */
export function loadSetting<T>(key: string, fallback: T, validate: (value: unknown) => T | null): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return validate(JSON.parse(raw)) ?? fallback
  } catch {
    return fallback
  }
}

export function saveSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Speicher voll oder gesperrt – Einstellung gilt dann nur bis zum Neustart.
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Zahl im Bereich [min, max] oder der Standardwert. */
export function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
