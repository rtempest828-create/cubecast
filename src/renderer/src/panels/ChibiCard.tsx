import type { JSX } from 'preact'
import { CHIBI_PRESETS, type ChibiPartAdjust, type ChibiPreset, type ChibiTextureMode } from '@core/chibi/chibi'
import type { Vec3 } from '@core/math/vec'
import { findPart } from '@core/model/avatar-model'
import { t } from '@shared/i18n'
import { Slider } from '../components/Slider'
import { baseAvatarModel, chibiSettings } from '../state/app-state'
import { debugMode, selection } from '../state/debug-state'
import { updateChibi } from '../state/rig-state'

const factor = (v: number): string => t('unit.factor', { value: v.toFixed(2) })
const NO_ADJUST: ChibiPartAdjust = { scale: [1, 1, 1], offset: [0, 0, 0], pivot: [0, 0, 0] }

/** Feinanpassung des im Debug-Modus gewählten Teils. */
function PartAdjust(): JSX.Element | null {
  const settings = chibiSettings.value
  const id = [...selection.value.parts][0]
  if (!debugMode.value || !id) return <p class="hint">{t('chibi.adjust.hint')}</p>
  const part = findPart(baseAvatarModel.value.root, id)
  if (!part) return null
  const adjust = settings.parts[id] ?? NO_ADJUST
  const set = (patch: Partial<ChibiPartAdjust>): void => updateChibi({ parts: { ...settings.parts, [id]: { ...adjust, ...patch } } })
  const axisSliders = (key: 'scale' | 'offset' | 'pivot', min: number, max: number, step: number): JSX.Element[] =>
    (['x', 'y', 'z'] as const).map((axis, i) => (
      <Slider
        key={`${key}${axis}`}
        label={`${t(`chibi.adjust.${key}`)} ${axis.toUpperCase()}`}
        value={adjust[key][i]!}
        min={min}
        max={max}
        step={step}
        format={(v) => (key === 'scale' ? factor(v) : v.toFixed(1))}
        onInput={(v) => {
          const next = [...adjust[key]] as [number, number, number]
          next[i] = v
          set({ [key]: next as Vec3 })
        }}
      />
    ))
  return (
    <div class="chibi-adjust">
      <p class="field-label">{t('chibi.adjust.part', { name: part.name })}</p>
      {axisSliders('scale', 0.2, 3, 0.05)}
      {axisSliders('offset', -16, 16, 0.5)}
      {axisSliders('pivot', -16, 16, 0.5)}
      <div class="button-row">
        <button
          type="button"
          class="button"
          disabled={!settings.parts[id]}
          onClick={() => {
            const rest = { ...settings.parts }
            delete rest[id]
            updateChibi({ parts: rest })
          }}
        >
          {t('chibi.adjust.reset')}
        </button>
      </div>
    </div>
  )
}

/** Karte „Chibi-Modus“ im Bereich Modell. */
export function ChibiCard(): JSX.Element {
  const s = chibiSettings.value
  const presets: readonly ChibiPreset[] = ['kid', 'chibi', 'sd', 'custom']
  const modes: readonly ChibiTextureMode[] = ['resample', 'crop', 'scale']
  const setSize = (patch: Partial<Record<'head' | 'body' | 'arms' | 'legs', number>>): void => updateChibi({ ...patch, preset: 'custom' })
  return (
    <section class="card">
      <h2 class="card-title">{t('chibi.section')}</h2>
      <label class="checkbox">
        <input type="checkbox" checked={s.enabled} onChange={(e) => updateChibi({ enabled: e.currentTarget.checked })} />
        <span>{t('chibi.enabled')}</span>
      </label>
      <p class="hint">{t('chibi.hint')}</p>
      <span class="field-label">{t('chibi.preset')}</span>
      <div class="radio-group" role="radiogroup">
        {presets.map((preset) => (
          <label key={preset} class="radio">
            <input
              type="radio"
              name="chibi-preset"
              checked={s.preset === preset}
              onChange={() => updateChibi(preset === 'custom' ? { preset } : { preset, ...CHIBI_PRESETS[preset] })}
            />
            <span>{t(`chibi.preset.${preset}`)}</span>
          </label>
        ))}
      </div>
      <Slider label={t('chibi.head')} value={s.head} min={0.5} max={3} step={0.05} format={factor} onInput={(head) => setSize({ head })} />
      <Slider label={t('chibi.body')} value={s.body} min={0.2} max={1.5} step={0.05} format={factor} onInput={(body) => setSize({ body })} />
      <Slider label={t('chibi.arms')} value={s.arms} min={0.2} max={1.5} step={0.05} format={factor} onInput={(arms) => setSize({ arms })} />
      <Slider label={t('chibi.legs')} value={s.legs} min={0.1} max={1.5} step={0.05} format={factor} onInput={(legs) => setSize({ legs })} />
      <span class="field-label">{t('chibi.texture')}</span>
      <div class="radio-group" role="radiogroup">
        {modes.map((mode) => (
          <label key={mode} class="radio">
            <input type="radio" name="chibi-texture" checked={s.textureMode === mode} onChange={() => updateChibi({ textureMode: mode })} />
            <span>{t(`chibi.texture.${mode}`)}</span>
          </label>
        ))}
      </div>
      <details class="figura-warnings">
        <summary>{t('chibi.adjust')}</summary>
        <PartAdjust />
      </details>
    </section>
  )
}
