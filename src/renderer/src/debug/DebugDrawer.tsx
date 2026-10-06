import type { JSX } from 'preact'
import { t } from '@shared/i18n'
import { debugMode, debugOptions, debugTab, logEntries, selection, showAllParts, soloParts, soloSelection, type DebugTab } from '../state/debug-state'
import { LogView } from './LogView'
import { PartTree } from './PartTree'
import { RoleEditor } from './RoleEditor'
import { SimulatorView } from './SimulatorView'

/** Seitenleiste des Debug-Modus (F12). */
export function DebugDrawer(): JSX.Element {
  const tab = debugTab.value
  const options = debugOptions.value
  const tabs: readonly [DebugTab, string][] = [
    ['parts', t('debug.tab.parts')],
    ['simulator', t('debug.tab.simulator')],
    ['log', t('debug.tab.log', { count: logEntries.value.length })]
  ]

  return (
    <aside class="debug-drawer">
      <header class="debug-header">
        <h2>{t('debug.title')}</h2>
        <button type="button" class="toast-close" aria-label={t('debug.close')} onClick={() => (debugMode.value = false)}>
          ×
        </button>
      </header>
      <div class="debug-toolbar">
        <label class="checkbox">
          <input type="checkbox" checked={options.wireframe} onChange={(e) => (debugOptions.value = { ...options, wireframe: e.currentTarget.checked })} />
          <span>{t('debug.wireframe')}</span>
        </label>
        <label class="checkbox">
          <input type="checkbox" checked={options.pivots} onChange={(e) => (debugOptions.value = { ...options, pivots: e.currentTarget.checked })} />
          <span>{t('debug.pivots')}</span>
        </label>
        <button
          type="button"
          class={soloParts.value.size > 0 ? 'button small primary' : 'button small'}
          disabled={selection.value.parts.size === 0 && soloParts.value.size === 0}
          onClick={soloSelection}
        >
          {t('debug.solo')}
        </button>
        <button type="button" class="button small" onClick={showAllParts}>
          {t('debug.showAll')}
        </button>
      </div>
      <nav class="segmented">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" class={tab === id ? 'active' : ''} onClick={() => (debugTab.value = id)}>
            {label}
          </button>
        ))}
      </nav>
      <div class="debug-content">
        {tab === 'parts' && (
          <>
            <PartTree />
            <RoleEditor />
          </>
        )}
        {tab === 'simulator' && <SimulatorView />}
        {tab === 'log' && <LogView />}
      </div>
    </aside>
  )
}
