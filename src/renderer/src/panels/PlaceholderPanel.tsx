import type { JSX } from 'preact'
import { t, type MessageKey } from '@shared/i18n'

/** Platzhalter für Bereiche, die in späteren Meilensteinen gebaut werden. */
export function PlaceholderPanel({ title, milestone }: { readonly title: MessageKey; readonly milestone: string }): JSX.Element {
  return (
    <div class="panel-content">
      <h1 class="panel-title">{t(title)}</h1>
      <p class="muted">{t('placeholder.comingSoon', { milestone })}</p>
    </div>
  )
}
