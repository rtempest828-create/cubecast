import type { JSX } from 'preact'
import { t } from '@shared/i18n'
import { clearLog, logEntries } from '../state/debug-state'

function time(ms: number): string {
  return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Warnungen und Fehler (ab M5c auch aus Lua-Skripten). */
export function LogView(): JSX.Element {
  const entries = logEntries.value
  return (
    <div class="log-view">
      <button type="button" class="button small" disabled={entries.length === 0} onClick={clearLog}>
        {t('debug.log.clear')}
      </button>
      {entries.length === 0 && <p class="hint">{t('debug.log.empty')}</p>}
      {[...entries].reverse().map((entry) => (
        <div key={entry.id} class={`log-entry ${entry.level}`}>
          <span class="log-time">{time(entry.time)}</span>
          <span class="log-source">{entry.source}</span>
          <span class="log-message">{entry.message}</span>
        </div>
      ))}
    </div>
  )
}
