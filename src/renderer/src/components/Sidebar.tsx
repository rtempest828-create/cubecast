import type { JSX } from 'preact'
import { t, type MessageKey } from '@shared/i18n'
import { activeTab, type TabId } from '../state/app-state'

/** Einfache Strich-Icons (24×24, Farbe über `currentColor`). */
const ICONS: Readonly<Record<TabId, JSX.Element>> = {
  model: <path d="M12 2.5 3.5 7.25v9.5L12 21.5l8.5-4.75v-9.5L12 2.5zM3.5 7.25 12 12l8.5-4.75M12 12v9.5" />,
  tracking: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  face: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M8 9.5h1.5M14.5 9.5H16M8.5 15h7" />
    </>
  ),
  physics: <path d="M3 12c2-4.5 4-4.5 6 0s4 4.5 6 0 4-4.5 6 0" />,
  output: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16.5V20" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
      <circle cx="15" cy="6.5" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17.5" r="2" />
    </>
  )
}

const TABS: readonly { readonly id: TabId; readonly label: MessageKey }[] = [
  { id: 'model', label: 'tab.model' },
  { id: 'tracking', label: 'tab.tracking' },
  { id: 'face', label: 'tab.face' },
  { id: 'physics', label: 'tab.physics' },
  { id: 'output', label: 'tab.output' },
  { id: 'settings', label: 'tab.settings' }
]

export function Sidebar(): JSX.Element {
  return (
    <nav class="sidebar">
      <div class="brand" title={t('app.title')}>
        <span class="brand-mark" aria-hidden="true" />
        <span class="brand-name">{t('app.title')}</span>
      </div>
      {TABS.map((tab) => {
        const active = activeTab.value === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            class={active ? 'nav-item active' : 'nav-item'}
            aria-current={active ? 'page' : undefined}
            onClick={() => (activeTab.value = tab.id)}
          >
            <svg viewBox="0 0 24 24" class="nav-icon" aria-hidden="true">
              {ICONS[tab.id]}
            </svg>
            <span>{t(tab.label)}</span>
          </button>
        )
      })}
    </nav>
  )
}
