import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { BLENDSHAPE_NAMES } from '@core/tracking/blendshapes'
import { t } from '@shared/i18n'
import { Slider } from '../components/Slider'
import { ValueBar } from '../components/ValueBar'
import { calibrateNeutralPose, resetCalibration } from '../runtime/runtime'
import { pushToast } from '../state/app-state'
import { cameras, trackingClient, trackingDebug, trackingSettings, updateTrackingSettings } from '../state/tracking-state'
import { listCameras } from '../tracking/camera'
import type { TrackingFailure } from '../tracking/tracking-client'

const percent = (value: number): string => t('unit.percent', { value: Math.round(value * 100) })
const degrees = (value: number): string => t('unit.degrees', { value: value.toFixed(1) })

async function refreshCameras(): Promise<void> {
  try {
    cameras.value = await listCameras()
  } catch (error) {
    console.warn('[Kamera] Liste konnte nicht gelesen werden:', error)
  }
}

function failureText(failure: TrackingFailure): string {
  switch (failure.kind) {
    case 'ended':
      return t('tracking.error.ended')
    case 'model':
      return t('tracking.error.model', { message: failure.message })
    case 'camera':
      return failure.error.code === 'unknown'
        ? t('tracking.error.unknown', { message: failure.error.detail })
        : t(`tracking.error.${failure.error.code}`)
  }
}

async function startTracking(): Promise<void> {
  await trackingClient.start(trackingSettings.peek().deviceId)
  // Nach erteilter Berechtigung sind die Kameranamen lesbar.
  await refreshCameras()
}

/** Kleine, gespiegelte Vorschau des Kamerabilds. */
function CameraPreview({ stream, mirror }: { readonly stream: MediaStream | null; readonly mirror: boolean }): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    if (stream) void video.play().catch(() => undefined)
  }, [stream])

  return (
    <div class="camera-preview">
      {stream ? (
        <video ref={videoRef} muted playsInline class={mirror ? 'mirrored' : undefined} />
      ) : (
        <span class="muted">{t('tracking.noPreview')}</span>
      )}
    </div>
  )
}

function CameraCard(): JSX.Element {
  const settings = trackingSettings.value
  const status = trackingClient.status.value
  const failure = trackingClient.failure.value
  const active = status === 'running' || status === 'starting'

  const selectCamera = (deviceId: string): void => {
    updateTrackingSettings({ deviceId: deviceId || null })
    if (active) void startTracking()
  }

  let statusText: string
  if (status === 'error' && failure) statusText = failureText(failure)
  else if (status === 'starting') statusText = t('tracking.status.starting')
  else if (status === 'running') statusText = t('tracking.status.running', { delegate: trackingClient.delegate.value ?? '?' })
  else statusText = t('tracking.status.off')

  return (
    <section class="card">
      <h2 class="card-title">{t('tracking.section.camera')}</h2>
      <select value={settings.deviceId ?? ''} onChange={(event) => selectCamera(event.currentTarget.value)}>
        <option value="">{t('tracking.camera.default')}</option>
        {cameras.value.map((camera, index) => (
          <option key={camera.deviceId} value={camera.deviceId}>
            {camera.label || t('tracking.camera.unnamed', { index: index + 1 })}
          </option>
        ))}
      </select>
      <button
        type="button"
        class={active ? 'button' : 'button primary'}
        disabled={status === 'starting'}
        onClick={() => (active ? trackingClient.stop() : void startTracking())}
      >
        {active ? t('tracking.stop') : t('tracking.start')}
      </button>
      <p class={status === 'error' ? 'status-text error' : 'status-text'}>{statusText}</p>
      <CameraPreview stream={trackingClient.stream.value} mirror={settings.mirror} />
      <p class="hint">{t('tracking.privacy')}</p>
    </section>
  )
}

function CalibrationCard(): JSX.Element {
  const debug = trackingDebug.value
  const calibrate = (): void => {
    if (calibrateNeutralPose()) pushToast('success', t('tracking.calibration.success'))
    else pushToast('error', t('tracking.calibration.noFace'))
  }
  return (
    <section class="card">
      <h2 class="card-title">{t('tracking.section.calibration')}</h2>
      <p class="hint">{t('tracking.calibration.hint')}</p>
      <div class="button-row">
        <button type="button" class="button primary" disabled={!debug.faceFound} onClick={calibrate}>
          {t('tracking.calibrate')}
        </button>
        <button type="button" class="button" onClick={resetCalibration}>
          {t('tracking.calibration.reset')}
        </button>
      </div>
      <p class="status-text">{debug.calibrated ? t('tracking.calibration.done') : t('tracking.calibration.none')}</p>
    </section>
  )
}

function HeadSettingsCard(): JSX.Element {
  const settings = trackingSettings.value
  return (
    <section class="card">
      <h2 class="card-title">{t('tracking.section.head')}</h2>
      <Slider
        label={t('tracking.smoothing')}
        hint={t('tracking.smoothing.hint')}
        value={settings.smoothing}
        min={0}
        max={1}
        step={0.01}
        format={percent}
        onInput={(smoothing) => updateTrackingSettings({ smoothing })}
      />
      <Slider
        label={t('tracking.reaction')}
        hint={t('tracking.reaction.hint')}
        value={settings.reaction}
        min={0}
        max={1}
        step={0.01}
        format={percent}
        onInput={(reaction) => updateTrackingSettings({ reaction })}
      />
      <Slider
        label={t('tracking.intensity')}
        hint={t('tracking.intensity.hint')}
        value={settings.intensity}
        min={0.5}
        max={2}
        step={0.05}
        format={percent}
        onInput={(intensity) => updateTrackingSettings({ intensity })}
      />
      <label class="checkbox">
        <input type="checkbox" checked={settings.mirror} onChange={(event) => updateTrackingSettings({ mirror: event.currentTarget.checked })} />
        <span>{t('tracking.mirror')}</span>
      </label>
      <p class="hint">{t('tracking.mirror.hint')}</p>
    </section>
  )
}

function LiveValuesCard(): JSX.Element {
  const debug = trackingDebug.value
  const running = trackingClient.status.value === 'running'
  const none = t('tracking.live.none')
  const rows: readonly [string, string][] = [
    [t('tracking.live.renderFps'), t('unit.fps', { value: Math.round(debug.renderFps) })],
    [t('tracking.live.trackingFps'), running ? t('unit.fps', { value: debug.trackingFps }) : none],
    [t('tracking.live.latency'), running ? t('unit.ms', { value: Math.round(debug.latencyMs) }) : none],
    [t('tracking.live.processing'), running ? t('unit.ms', { value: debug.processingMs.toFixed(1) }) : none],
    [t('tracking.live.delegate'), running ? (trackingClient.delegate.value ?? none) : none],
    [t('tracking.live.face'), debug.faceFound ? t('tracking.live.yes') : t('tracking.live.no')]
  ]
  const blendshapes = debug.blendshapes

  return (
    <section class="card">
      <h2 class="card-title">{t('tracking.section.live')}</h2>
      <dl class="stats">
        {rows.map(([label, value]) => (
          <div key={label} class="stats-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <ValueBar label={t('tracking.live.yaw')} value={debug.head.yaw} min={-90} max={90} centered text={degrees(debug.head.yaw)} />
      <ValueBar label={t('tracking.live.pitch')} value={debug.head.pitch} min={-90} max={90} centered text={degrees(debug.head.pitch)} />
      <ValueBar label={t('tracking.live.roll')} value={debug.head.roll} min={-90} max={90} centered text={degrees(debug.head.roll)} />
      <details class="blendshapes">
        <summary>{t('tracking.live.blendshapes', { count: BLENDSHAPE_NAMES.length })}</summary>
        {BLENDSHAPE_NAMES.map((name, index) => {
          const value = blendshapes?.[index] ?? 0
          return <ValueBar key={name} label={name} value={value} min={0} max={1} text={value.toFixed(2)} />
        })}
      </details>
    </section>
  )
}

export function TrackingPanel(): JSX.Element {
  useEffect(() => {
    void refreshCameras()
    const devices = navigator.mediaDevices
    const onChange = (): void => void refreshCameras()
    devices?.addEventListener('devicechange', onChange)
    return () => devices?.removeEventListener('devicechange', onChange)
  }, [])

  return (
    <div class="panel-content">
      <h1 class="panel-title">{t('tab.tracking')}</h1>
      <CameraCard />
      <CalibrationCard />
      <HeadSettingsCard />
      <LiveValuesCard />
    </div>
  )
}
