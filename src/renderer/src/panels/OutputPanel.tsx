import type { JSX } from 'preact'
import type { BackgroundMode, CameraPreset } from '@core/output/protocol'
import { t } from '@shared/i18n'
import { Slider } from '../components/Slider'
import { pushToast } from '../state/app-state'
import {
  closeOutputWindow,
  copyOutputUrl,
  openOutputWindow,
  outputSettings,
  outputStatus,
  outputWindowSettings,
  updateOutputSettings,
  updateOutputWindowSettings,
  useCurrentViewForOutput
} from '../state/output-state'

const SIZES: readonly { label: string; width: number; height: number }[] = [
  { label: '720 × 720', width: 720, height: 720 },
  { label: '1280 × 720', width: 1280, height: 720 },
  { label: '1920 × 1080', width: 1920, height: 1080 },
  { label: '540 × 960', width: 540, height: 960 },
  { label: '400 × 400', width: 400, height: 400 }
]

function ObsCard(): JSX.Element {
  const status = outputStatus.value
  return (
    <section class="card">
      <h2 class="card-title">{t('output.obs')}</h2>
      {status.running ? (
        <>
          <p class="hint">{t('output.obs.hint')}</p>
          <div class="inline-form">
            <label class="field">
              <span class="field-label">{t('output.obs.url')}</span>
              <input type="text" readOnly value={status.url} onFocus={(e) => e.currentTarget.select()} />
            </label>
            <button
              type="button"
              class="button primary"
              onClick={() => void copyOutputUrl().then(() => pushToast('success', t('output.obs.copied')))}
            >
              {t('output.obs.copy')}
            </button>
          </div>
          <p class="status-text">{t('output.clients', { count: status.clients })}</p>
          <p class="hint">{t('output.obs.steps')}</p>
        </>
      ) : (
        <p class="status-text error">{t('output.notRunning')}</p>
      )}
    </section>
  )
}

function WindowCard(): JSX.Element {
  const status = outputStatus.value
  const win = outputWindowSettings.value
  const sizeKey = `${win.width}x${win.height}`
  return (
    <section class="card">
      <h2 class="card-title">{t('output.window')}</h2>
      <p class="hint">{t('output.window.hint')}</p>
      <label class="field">
        <span class="field-label">{t('output.window.size')}</span>
        <select
          value={sizeKey}
          onChange={(e) => {
            const [w, h] = e.currentTarget.value.split('x').map(Number)
            updateOutputWindowSettings({ width: w ?? 720, height: h ?? 720 })
          }}
        >
          {SIZES.map((s) => (
            <option key={s.label} value={`${s.width}x${s.height}`}>
              {s.label}
            </option>
          ))}
          {!SIZES.some((s) => `${s.width}x${s.height}` === sizeKey) && <option value={sizeKey}>{`${win.width} × ${win.height}`}</option>}
        </select>
      </label>
      <label class="checkbox">
        <input type="checkbox" checked={win.alwaysOnTop} onChange={(e) => updateOutputWindowSettings({ alwaysOnTop: e.currentTarget.checked })} />
        <span>{t('output.window.onTop')}</span>
      </label>
      <div class="button-row">
        <button type="button" class="button primary" disabled={!status.running} onClick={() => void openOutputWindow()}>
          {status.windowOpen ? t('output.window.apply') : t('output.window.open')}
        </button>
        <button type="button" class="button" disabled={!status.windowOpen} onClick={() => void closeOutputWindow()}>
          {t('output.window.close')}
        </button>
      </div>
    </section>
  )
}

function ViewCard(): JSX.Element {
  const s = outputSettings.value
  const backgrounds: readonly BackgroundMode[] = ['transparent', 'green', 'color']
  const cameras: readonly CameraPreset[] = ['full', 'half', 'head', 'custom']
  return (
    <section class="card">
      <h2 class="card-title">{t('output.view')}</h2>
      <span class="field-label">{t('output.background')}</span>
      <div class="radio-group" role="radiogroup">
        {backgrounds.map((mode) => (
          <label key={mode} class="radio">
            <input type="radio" name="output-bg" checked={s.background === mode} onChange={() => updateOutputSettings({ background: mode })} />
            <span>{t(`output.background.${mode}`)}</span>
          </label>
        ))}
      </div>
      {s.background === 'color' && (
        <label class="field">
          <span class="field-label">{t('output.color')}</span>
          <input type="color" value={s.color} onInput={(e) => updateOutputSettings({ color: e.currentTarget.value })} />
        </label>
      )}
      <span class="field-label">{t('output.camera')}</span>
      <div class="radio-group" role="radiogroup">
        {cameras.map((preset) => (
          <label key={preset} class="radio">
            <input
              type="radio"
              name="output-camera"
              checked={s.camera === preset}
              disabled={preset === 'custom' && !s.customCamera}
              onChange={() => updateOutputSettings({ camera: preset })}
            />
            <span>{t(`output.camera.${preset}`)}</span>
          </label>
        ))}
      </div>
      <div class="button-row">
        <button type="button" class="button" onClick={() => (useCurrentViewForOutput() ? pushToast('success', t('output.camera.taken')) : undefined)}>
          {t('output.camera.take')}
        </button>
      </div>
      <Slider label={t('output.zoom')} value={s.zoom} min={0.3} max={4} step={0.05} format={(v) => t('unit.factor', { value: v.toFixed(2) })} onInput={(zoom) => updateOutputSettings({ zoom })} />
      {s.camera !== 'custom' && (
        <Slider label={t('output.angle')} value={s.angle} min={-180} max={180} step={1} format={(v) => t('unit.degrees', { value: v })} onInput={(angle) => updateOutputSettings({ angle })} />
      )}
      <label class="checkbox">
        <input type="checkbox" checked={s.outerLayer} onChange={(e) => updateOutputSettings({ outerLayer: e.currentTarget.checked })} />
        <span>{t('model.outerLayer')}</span>
      </label>
    </section>
  )
}

/** Bereich „Ausgabe“: OBS-Browserquelle, Ausgabefenster, Kamera und Hintergrund. */
export function OutputPanel(): JSX.Element {
  return (
    <div class="panel-content">
      <h1 class="panel-title">{t('tab.output')}</h1>
      <ObsCard />
      <ViewCard />
      <WindowCard />
    </div>
  )
}
