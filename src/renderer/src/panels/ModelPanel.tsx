import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import type { SkinModelType } from '@core/skin/skin'
import { t } from '@shared/i18n'
import { PLAYER_NAME_PATTERN } from '@shared/ipc'
import { SkinPreview } from '../components/SkinPreview'
import { FiguraCard } from './FiguraCard'
import { downloadPlayerSkin, openSkinFileDialog } from '../skin/skin-loader'
import { autoModel, loadedSkin, modelChoice, showOuterLayer, type LoadedSkin, type ModelChoice } from '../state/app-state'

function sourceLabel(loaded: LoadedSkin): string {
  switch (loaded.source.kind) {
    case 'placeholder': return t('model.source.placeholder')
    case 'file': return t('model.source.file', { name: loaded.source.fileName })
    case 'player': return t('model.source.player', { name: loaded.source.name })
  }
}

function modelName(model: SkinModelType): string {
  return t(model === 'slim' ? 'model.type.name.slim' : 'model.type.name.classic')
}

function PlayerNameForm(): JSX.Element {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = PLAYER_NAME_PATTERN.test(name.trim())

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    try {
      await downloadPlayerSkin(name.trim())
    } finally {
      setBusy(false)
    }
  }

  return (
    <form class="inline-form" onSubmit={submit}>
      <label class="field">
        <span class="field-label">{t('model.playerName')}</span>
        <input
          type="text"
          value={name}
          maxLength={16}
          placeholder={t('model.playerNamePlaceholder')}
          spellcheck={false}
          onInput={(event) => setName(event.currentTarget.value)}
        />
      </label>
      <button type="submit" class="button primary" disabled={!valid || busy}>
        {busy ? t('model.loading') : t('model.loadPlayer')}
      </button>
    </form>
  )
}

export function ModelPanel(): JSX.Element {
  const loaded = loadedSkin.value
  const { skin } = loaded
  const choices: readonly { value: ModelChoice; label: string }[] = [
    { value: 'auto', label: t('model.type.auto', { detected: modelName(autoModel.value) }) },
    { value: 'classic', label: t('model.type.classic') },
    { value: 'slim', label: t('model.type.slim') }
  ]

  return (
    <div class="panel-content">
      <h1 class="panel-title">{t('tab.model')}</h1>

      <section class="card">
        <h2 class="card-title">{t('model.section.load')}</h2>
        <button type="button" class="dropzone" onClick={() => void openSkinFileDialog()}>
          {t('model.dropHint')}
        </button>
        <PlayerNameForm />
        <p class="hint">{t('model.downloadNote')}</p>
      </section>

      <FiguraCard />

      <section class="card">
        <h2 class="card-title">{t('model.section.current')}</h2>
        <div class="skin-info">
          <SkinPreview image={skin.image} />
          <ul class="info-list">
            <li>{sourceLabel(loaded)}</li>
            <li>{t('model.info.size', { width: skin.originalWidth, height: skin.originalHeight })}</li>
            {skin.legacy && <li>{t('model.info.legacy')}</li>}
            {skin.scale > 1 && <li>{t('model.info.hd', { scale: skin.scale })}</li>}
          </ul>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">{t('model.section.type')}</h2>
        <div class="radio-group" role="radiogroup">
          {choices.map((choice) => (
            <label key={choice.value} class="radio">
              <input
                type="radio"
                name="model-type"
                checked={modelChoice.value === choice.value}
                onChange={() => (modelChoice.value = choice.value)}
              />
              <span>{choice.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">{t('model.section.layers')}</h2>
        <label class="checkbox">
          <input type="checkbox" checked={showOuterLayer.value} onChange={(event) => (showOuterLayer.value = event.currentTarget.checked)} />
          <span>{t('model.outerLayer')}</span>
        </label>
      </section>
    </div>
  )
}
