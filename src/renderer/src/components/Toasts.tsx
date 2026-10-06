import type { JSX } from 'preact'
import { t } from '@shared/i18n'
import { dismissToast, toasts } from '../state/app-state'

export function Toasts(): JSX.Element {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((toast) => (
        <div key={toast.id} class={`toast toast-${toast.kind}`}>
          <span>{toast.message}</span>
          <button type="button" class="toast-close" aria-label={t('toast.close')} onClick={() => dismissToast(toast.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
