import type { JSX } from 'preact'
import { LOOP_MODES, type AnimationClip, type LoopMode } from '@core/animation/clip'
import type { AnimationSettings, AnimationTrigger } from '@core/animation/player'
import { SIGNAL_CATALOG, signalInfo } from '@core/tracking/signals'
import { t } from '@shared/i18n'
import { Slider } from '../components/Slider'
import {
  animationClips,
  animationStatus,
  pauseAnimation,
  playAnimation,
  restartAnimation,
  settingsOf,
  stopAllAnimations,
  stopAnimation,
  updateAnimationSettings
} from '../state/animation-state'
import { activeTab, loadedFigura } from '../state/app-state'
import { rig } from '../state/rig-state'

const seconds = (value: number): string => t('unit.seconds', { value: value.toFixed(2) })
const factor = (value: number): string => t('unit.factor', { value: value.toFixed(2) })
const percent = (value: number): string => t('unit.percent', { value: Math.round(value * 100) })

const DEFAULT_TRIGGER: AnimationTrigger = { source: 'mouth.smile', threshold: 0.6, mode: 'while' }

function TriggerEditor({ clip, settings }: { clip: AnimationClip; settings: AnimationSettings }): JSX.Element {
  const trigger = settings.trigger
  const info = trigger ? signalInfo(trigger.source) : undefined
  const set = (patch: Partial<AnimationTrigger> | null): void =>
    updateAnimationSettings(clip.id, { trigger: patch === null ? null : { ...(trigger ?? DEFAULT_TRIGGER), ...patch } })

  return (
    <div class="anim-trigger">
      <label class="field">
        <span class="field-label">{t('anim.trigger')}</span>
        <select value={trigger ? trigger.mode : 'none'} onChange={(e) => (e.currentTarget.value === 'none' ? set(null) : set({ mode: e.currentTarget.value as AnimationTrigger['mode'] }))}>
          <option value="none">{t('anim.trigger.none')}</option>
          <option value="while">{t('anim.trigger.while')}</option>
          <option value="start">{t('anim.trigger.start')}</option>
        </select>
      </label>
      {trigger && (
        <>
          <label class="field">
            <span class="field-label">{t('anim.trigger.source')}</span>
            <select value={trigger.source} onChange={(e) => set({ source: e.currentTarget.value })}>
              {SIGNAL_CATALOG.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Slider
            label={t('anim.trigger.threshold')}
            value={trigger.threshold}
            min={info?.min ?? 0}
            max={info?.max ?? 1}
            step={(info?.max ?? 1) - (info?.min ?? 0) > 10 ? 1 : 0.05}
            format={(v) => v.toFixed(2)}
            onInput={(threshold) => set({ threshold })}
          />
        </>
      )}
    </div>
  )
}

function ClipRow({ clip }: { clip: AnimationClip }): JSX.Element {
  // `rig.value` lesen, damit Änderungen an den Einstellungen neu zeichnen.
  void rig.value
  const settings = settingsOf(clip.id)
  const status = animationStatus.value.get(clip.id)
  const state = status?.state ?? 'stopped'
  const progress = clip.length > 0 && status ? Math.min(1, status.time / clip.length) : 0
  const loop = settings.loop ?? clip.loop

  return (
    <li class="anim-clip">
      <div class="anim-head">
        <div class="anim-title">
          <strong title={clip.id}>{clip.name}</strong>
          <span class="hint">
            {seconds(clip.length)} · {t(`anim.loop.${loop}`)}
            {clip.override && ` · ${t('anim.override')}`}
            {settings.autoplay && ` · ${t('anim.autoplay.short')}`}
            {settings.trigger && ` · ${t('anim.trigger.short', { source: settings.trigger.source })}`}
          </span>
        </div>
        <div class="anim-buttons">
          {state === 'playing' ? (
            <button type="button" class="button" title={t('anim.pause')} onClick={() => pauseAnimation(clip.id)}>
              ❚❚
            </button>
          ) : (
            <button type="button" class="button primary" title={t('anim.play')} onClick={() => playAnimation(clip.id)}>
              ▶
            </button>
          )}
          <button type="button" class="button" title={t('anim.restart')} onClick={() => restartAnimation(clip.id)}>
            ↺
          </button>
          <button type="button" class="button" title={t('anim.stop')} disabled={state === 'stopped'} onClick={() => stopAnimation(clip.id)}>
            ■
          </button>
        </div>
      </div>
      <div class="anim-progress" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <details class="anim-details">
        <summary>{t('anim.settings')}</summary>
        <label class="checkbox">
          <input type="checkbox" checked={settings.autoplay} onChange={(e) => updateAnimationSettings(clip.id, { autoplay: e.currentTarget.checked })} />
          <span>{t('anim.autoplay')}</span>
        </label>
        <label class="field">
          <span class="field-label">{t('anim.loop')}</span>
          <select value={settings.loop ?? 'file'} onChange={(e) => updateAnimationSettings(clip.id, { loop: e.currentTarget.value === 'file' ? null : (e.currentTarget.value as LoopMode) })}>
            <option value="file">{t('anim.loop.file', { mode: t(`anim.loop.${clip.loop}`) })}</option>
            {LOOP_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {t(`anim.loop.${mode}`)}
              </option>
            ))}
          </select>
        </label>
        <Slider label={t('anim.speed')} value={settings.speed} min={0} max={4} step={0.05} format={factor} onInput={(speed) => updateAnimationSettings(clip.id, { speed })} />
        <Slider label={t('anim.blend')} value={settings.blend} min={0} max={1} step={0.05} format={percent} onInput={(blend) => updateAnimationSettings(clip.id, { blend })} />
        <TriggerEditor clip={clip} settings={settings} />
      </details>
    </li>
  )
}

/** Bereich „Animationen“: Blockbench-Animationen des Figura-Avatars abspielen und einstellen. */
export function AnimationPanel(): JSX.Element {
  const clips = animationClips.value
  const groups = new Map<string, AnimationClip[]>()
  for (const clip of clips) groups.set(clip.modelPath, [...(groups.get(clip.modelPath) ?? []), clip])

  return (
    <div class="panel-content">
      <h1 class="panel-title">{t('tab.animations')}</h1>
      {clips.length === 0 ? (
        <section class="card">
          <p class="hint">{loadedFigura.value ? t('anim.none.avatar') : t('anim.none.figura')}</p>
          {!loadedFigura.value && (
            <button type="button" class="button" onClick={() => (activeTab.value = 'model')}>
              {t('anim.toModel')}
            </button>
          )}
        </section>
      ) : (
        <>
          <section class="card">
            <p class="hint">{t('anim.intro')}</p>
            <div class="button-row">
              <button type="button" class="button" onClick={stopAllAnimations}>
                {t('anim.stopAll')}
              </button>
            </div>
          </section>
          {[...groups].map(([model, list]) => (
            <section key={model} class="card">
              <h2 class="card-title">{t('anim.model', { model })}</h2>
              <ul class="anim-list">
                {list.map((clip) => (
                  <ClipRow key={clip.id} clip={clip} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
