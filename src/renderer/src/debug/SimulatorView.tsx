import type { JSX } from 'preact'
import { HEAD_SIGNALS } from '@core/tracking/signals'
import { SIMULATOR_CHANNELS, type SignalSourceMode } from '@core/tracking/simulator'
import { t } from '@shared/i18n'
import { liveSignals, manualSignals, overriddenSignals, releaseSignal, resetSimulator, setManualSignal, signalMode } from '../state/debug-state'

const MODES: readonly SignalSourceMode[] = ['webcam', 'manual', 'mixed']

function range(name: string): [number, number, number] {
  if ((HEAD_SIGNALS as readonly string[]).includes(name)) return [-60, 60, 1]
  if (name.startsWith('gaze.')) return [-1, 1, 0.01]
  return [0, 1, 0.01]
}

function ChannelRow({ name }: { readonly name: string }): JSX.Element {
  const [min, max, step] = range(name)
  const overridden = overriddenSignals.value.has(name)
  const live = liveSignals.value[name] ?? 0
  const value = overridden ? (manualSignals.value[name] ?? 0) : live
  const livePercent = ((live - min) / (max - min)) * 100

  return (
    <div class={overridden ? 'sim-row overridden' : 'sim-row'}>
      <span class="sim-name" title={name}>
        {name}
      </span>
      <span class="sim-slider">
        <span class="sim-live" style={{ left: `${Math.max(0, Math.min(100, livePercent))}%` }} />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onInput={(e) => {
            // Ein bewegter Regler im Webcam-Modus schaltet auf „Gemischt“.
            if (signalMode.peek() === 'webcam') signalMode.value = 'mixed'
            setManualSignal(name, Number(e.currentTarget.value))
          }}
        />
      </span>
      <span class="sim-value">{step >= 1 ? Math.round(value) : value.toFixed(2)}</span>
      <button type="button" class="sim-release" disabled={!overridden} title={t('debug.sim.release')} onClick={() => releaseSignal(name)}>
        {overridden ? '●' : '○'}
      </button>
    </div>
  )
}

/** Tracking-Simulator: alle Kanäle als Regler, mit Live-Markierung der echten Werte. */
export function SimulatorView(): JSX.Element {
  const head = SIMULATOR_CHANNELS.filter((n) => n.startsWith('head.'))
  const gaze = SIMULATOR_CHANNELS.filter((n) => n.startsWith('gaze.'))
  const blendshapes = SIMULATOR_CHANNELS.filter((n) => !n.includes('.'))

  return (
    <div class="simulator">
      <div class="segmented">
        {MODES.map((mode) => (
          <button key={mode} type="button" class={signalMode.value === mode ? 'active' : ''} onClick={() => (signalMode.value = mode)}>
            {t(`debug.sim.${mode}`)}
          </button>
        ))}
      </div>
      <p class="hint">{t('debug.sim.hint')}</p>
      <button type="button" class="button small" onClick={resetSimulator}>
        {t('debug.sim.reset')}
      </button>
      <h4 class="card-title">{t('debug.sim.head')}</h4>
      {head.map((name) => (
        <ChannelRow key={name} name={name} />
      ))}
      <h4 class="card-title">{t('debug.sim.gaze')}</h4>
      {gaze.map((name) => (
        <ChannelRow key={name} name={name} />
      ))}
      <h4 class="card-title">{t('debug.sim.blendshapes')}</h4>
      {blendshapes.map((name) => (
        <ChannelRow key={name} name={name} />
      ))}
    </div>
  )
}
