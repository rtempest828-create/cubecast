import { signal } from '@preact/signals'
import { logger, type LogEntry } from '@core/log/logger'
import type { DriverValue } from '@core/roles/rig'
import type { Signals } from '@core/tracking/signals'
import type { SignalSourceMode } from '@core/tracking/simulator'
import type { DebugDisplayOptions } from '@render/avatar-object'

/** Debug-Modus (F12): Teilauswahl, Rollen, Tracking-Simulator, Log. */
export const debugMode = signal(false)

export type DebugTab = 'parts' | 'simulator' | 'log'
export const debugTab = signal<DebugTab>('parts')

export interface Selection {
  readonly parts: ReadonlySet<string>
  readonly cubes: ReadonlySet<string>
}

const EMPTY: ReadonlySet<string> = new Set()

export const selection = signal<Selection>({ parts: EMPTY, cubes: EMPTY })
export const debugHidden = signal<ReadonlySet<string>>(EMPTY)
export const soloParts = signal<ReadonlySet<string>>(EMPTY)
export const debugOptions = signal<DebugDisplayOptions>({ wireframe: false, pivots: false })

function toggled(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** Wählt ein Teil aus; mit `additive` (Strg/Umschalt) wird es zur Auswahl hinzugefügt bzw. entfernt. */
export function selectPart(id: string, additive: boolean): void {
  const current = selection.peek()
  selection.value = additive ? { parts: toggled(current.parts, id), cubes: current.cubes } : { parts: new Set([id]), cubes: EMPTY }
}

export function selectCube(id: string, additive: boolean): void {
  const current = selection.peek()
  selection.value = additive ? { parts: current.parts, cubes: toggled(current.cubes, id) } : { parts: EMPTY, cubes: new Set([id]) }
}

export function clearSelection(): void {
  selection.value = { parts: EMPTY, cubes: EMPTY }
}

export function toggleHidden(id: string): void {
  debugHidden.value = toggled(debugHidden.peek(), id)
}

export function showAllParts(): void {
  debugHidden.value = EMPTY
  soloParts.value = EMPTY
}

export function soloSelection(): void {
  const { parts } = selection.peek()
  soloParts.value = soloParts.peek().size > 0 || parts.size === 0 ? EMPTY : new Set(parts)
}

// ---------------------------------------------------------------------------
// Tracking-Simulator

export const signalMode = signal<SignalSourceMode>('webcam')
export const manualSignals = signal<Readonly<Record<string, number>>>({})
export const overriddenSignals = signal<ReadonlySet<string>>(EMPTY)

export function setManualSignal(name: string, value: number): void {
  manualSignals.value = { ...manualSignals.peek(), [name]: value }
  if (!overriddenSignals.peek().has(name)) overriddenSignals.value = new Set([...overriddenSignals.peek(), name])
}

export function releaseSignal(name: string): void {
  const next = new Set(overriddenSignals.peek())
  next.delete(name)
  overriddenSignals.value = next
  const values = { ...manualSignals.peek() }
  delete values[name]
  manualSignals.value = values
}

export function resetSimulator(): void {
  manualSignals.value = {}
  overriddenSignals.value = EMPTY
}

/** Zuletzt verwendete Signale und Treiberwerte (ca. 10 × pro Sekunde, nur im Debug-Modus). */
export const liveSignals = signal<Signals>({})
export const driverValues = signal<ReadonlyMap<string, DriverValue>>(new Map())

// ---------------------------------------------------------------------------
// Log

export const logEntries = signal<readonly LogEntry[]>([])
let logUpdateQueued = false
logger.subscribe(() => {
  // Mehrere Meldungen pro Frame zu einer Aktualisierung zusammenfassen.
  if (logUpdateQueued) return
  logUpdateQueued = true
  queueMicrotask(() => {
    logUpdateQueued = false
    logEntries.value = [...logger.getEntries()]
  })
})

export function clearLog(): void {
  logger.clear()
  logEntries.value = []
}
