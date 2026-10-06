/**
 * Zentrales Protokoll für Warnungen und Fehler (Debug-Panel „Log“).
 * `warnOnce` meldet eine Sache nur einmal – wichtig für Dinge, die pro Frame
 * auftreten könnten (z. B. später nicht unterstützte Figura-Funktionen).
 */
export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  readonly id: number
  readonly time: number
  readonly level: LogLevel
  /** Herkunft, z. B. „Rollen“, „Gesicht“, „Lua“. */
  readonly source: string
  readonly message: string
}

type Listener = (entry: LogEntry) => void

export const MAX_LOG_ENTRIES = 500

export class Logger {
  private readonly entries: LogEntry[] = []
  private readonly onceKeys = new Set<string>()
  private readonly listeners = new Set<Listener>()
  private nextId = 1

  log(level: LogLevel, source: string, message: string): void {
    const entry: LogEntry = { id: this.nextId++, time: Date.now(), level, source, message }
    this.entries.push(entry)
    if (this.entries.length > MAX_LOG_ENTRIES) this.entries.shift()
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
    consoleMethod(`[${source}] ${message}`)
    for (const listener of this.listeners) listener(entry)
  }

  info(source: string, message: string): void {
    this.log('info', source, message)
  }

  warn(source: string, message: string): void {
    this.log('warn', source, message)
  }

  error(source: string, message: string): void {
    this.log('error', source, message)
  }

  /** Meldet eine Warnung pro Schlüssel nur ein einziges Mal. */
  warnOnce(key: string, source: string, message: string): void {
    if (this.onceKeys.has(key)) return
    this.onceKeys.add(key)
    this.warn(source, message)
  }

  getEntries(): readonly LogEntry[] {
    return this.entries
  }

  clear(): void {
    this.entries.length = 0
    this.onceKeys.clear()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const logger = new Logger()
