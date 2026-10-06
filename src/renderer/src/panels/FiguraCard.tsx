import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { ALL_VANILLA, type VanillaId } from '@core/figura/vanilla-scan'
import { walkParts } from '@core/model/avatar-model'
import { t } from '@shared/i18n'
import { figuraEntries, figuraLoading, figuraSearching, loadFigura, openFiguraFolder, refreshFiguraList, unloadFigura } from '../figura/figura-loader'
import { loadedFigura, pushToast, vanillaHidden, vanillaOverride } from '../state/app-state'
import { confirmAllSuggestions, pendingSuggestions, updateVanillaHidden } from '../state/rig-state'

function AvatarPicker(): JSX.Element {
  const entries = figuraEntries.value
  const [selected, setSelected] = useState('')
  const current = entries.some((e) => e.key === selected) ? selected : (entries[0]?.key ?? '')
  const busy = figuraLoading.value

  return (
    <>
      {entries.length > 0 ? (
        <label class="field">
          <span class="field-label">{t('figura.found')}</span>
          <select value={current} onChange={(event) => setSelected(event.currentTarget.value)}>
            {entries.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.name} ({entry.location})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p class="status-text">{figuraSearching.value ? t('figura.searching') : t('figura.none')}</p>
      )}
      <div class="button-row">
        <button type="button" class="button primary" disabled={!current || busy} onClick={() => void loadFigura(current)}>
          {busy ? t('model.loading') : t('figura.load')}
        </button>
        <button type="button" class="button" disabled={busy} onClick={() => void openFiguraFolder()}>
          {t('figura.openFolder')}
        </button>
        <button type="button" class="button" disabled={figuraSearching.value} onClick={() => void refreshFiguraList()}>
          {figuraSearching.value ? t('figura.searching') : t('figura.search')}
        </button>
      </div>
    </>
  )
}

function VanillaToggles(): JSX.Element {
  const hidden = vanillaHidden.value
  const custom = vanillaOverride.value !== null
  const toggle = (id: VanillaId, visible: boolean): void => {
    const next = new Set(hidden)
    if (visible) next.delete(id)
    else next.add(id)
    updateVanillaHidden(ALL_VANILLA.filter((v) => next.has(v)))
  }
  return (
    <div class="figura-vanilla">
      <div class="slider-head">
        <span class="field-label">{t('figura.vanilla')}</span>
        <label class="checkbox">
          <input type="checkbox" checked={!custom} onChange={(event) => updateVanillaHidden(event.currentTarget.checked ? null : [...hidden])} />
          <span>{t('figura.vanilla.auto')}</span>
        </label>
      </div>
      <p class="hint">{t('figura.vanilla.hint')}</p>
      <div class="vanilla-grid">
        {ALL_VANILLA.map((id) => (
          <label key={id} class="checkbox">
            <input type="checkbox" checked={!hidden.has(id)} onChange={(event) => toggle(id, event.currentTarget.checked)} />
            <span>{t(`vanilla.${id}`)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function LoadedInfo(): JSX.Element | null {
  const figura = loadedFigura.value
  if (!figura) return null
  const { avatar } = figura
  let parts = 0
  for (const model of avatar.models) walkParts(model.root, () => parts++)
  const pending = pendingSuggestions.value

  return (
    <div class="figura-loaded">
      <ul class="info-list">
        <li>
          <strong style={avatar.color ? { color: avatar.color } : undefined}>{avatar.name}</strong>
          {avatar.authors.length > 0 && ` ${t('figura.authors', { authors: avatar.authors.join(', ') })}`}
        </li>
        <li>{figura.location}</li>
        <li>{t('figura.stats', { models: avatar.models.length, parts: parts - avatar.models.length, scripts: avatar.scripts.length })}</li>
        {avatar.description && <li class="hint">{avatar.description}</li>}
      </ul>
      {pending > 0 && (
        <div class="figura-suggestions">
          <p class="hint">{t('figura.suggestions', { count: pending })}</p>
          <button type="button" class="button primary" onClick={() => pushToast('success', t('figura.confirmed', { count: confirmAllSuggestions() }))}>
            {t('figura.confirmAll')}
          </button>
        </div>
      )}
      <VanillaToggles />
      {avatar.warnings.length > 0 && (
        <details class="figura-warnings">
          <summary>{t('figura.warnings', { count: avatar.warnings.length })}</summary>
          <ul>
            {avatar.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <div class="button-row">
        <button type="button" class="button" onClick={unloadFigura}>
          {t('figura.unload')}
        </button>
      </div>
    </div>
  )
}

/** Karte „Figura-Avatar“ im Modell-Panel. */
export function FiguraCard(): JSX.Element {
  useEffect(() => {
    if (figuraEntries.peek().length === 0) void refreshFiguraList()
  }, [])

  return (
    <section class="card">
      <h2 class="card-title">{t('figura.section')}</h2>
      <p class="hint">{t('figura.intro')}</p>
      <AvatarPicker />
      <LoadedInfo />
    </section>
  )
}
