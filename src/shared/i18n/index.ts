import { de } from './de'

export type MessageKey = keyof typeof de
export type Messages = Readonly<Record<MessageKey, string>>
export type MessageParams = Readonly<Record<string, string | number>>

/** Registrierte Sprachen; neue Sprachen hier eintragen. */
const catalogs: Readonly<Record<string, Messages>> = { de }

let current: Messages = de

export function setLanguage(language: string): void {
  current = catalogs[language] ?? de
}

/** Übersetzt einen Schlüssel und ersetzt Platzhalter wie {name}. */
export function t(key: MessageKey, params?: MessageParams): string {
  const template = current[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}
