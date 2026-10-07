import type { JSX } from 'preact'
import { useCallback, useMemo, useState } from 'preact/hooks'
import { EMOTIONS } from '@core/face/emotions'
import { composeFace } from '@core/face/face-compose'
import { FACE_FEATURES, type CellRect, type FaceFeature } from '@core/face/face-layout'
import { MOUTH_THRESHOLD_LABELS, type DriverConfig } from '@core/roles/drivers'
import { assignmentOf, FACE_PART_IDS, withAssignment } from '@core/roles/rig'
import { t, type MessageKey } from '@shared/i18n'
import { FaceGrid, FEATURE_COLORS } from '../components/FaceGrid'
import { PixelCanvas } from '../components/PixelCanvas'
import { Slider } from '../components/Slider'
import { FaceEditorCard } from './FaceEditorCard'
import {
  currentEmotion,
  currentFaceState,
  faceAnalysis,
  faceLayout,
  faceSource,
  faceVariants,
  manualEmotion,
  rig,
  updateFaceSettings,
  updateRig
} from '../state/rig-state'

const percent = (value: number): string => t('unit.percent', { value: Math.round(value * 100) })

/** Ändert einen Treiber eines Gesichtsteils (z. B. Schwellwerte). */
function patchFaceDriver(partId: string, driverId: string, patch: Partial<DriverConfig>): void {
  const current = rig.peek()
  const assignment = assignmentOf(current, partId)
  if (!assignment) return
  const drivers = assignment.drivers.map((d) => (d.id === driverId ? { ...d, ...patch } : d))
  updateRig(withAssignment(current, partId, { ...assignment, drivers }))
}

function OverlayCard(): JSX.Element {
  const settings = rig.value.face
  const source = faceSource.value
  const preview = useMemo(
    () => composeFace(source, faceVariants.value, faceLayout.value, currentFaceState.value),
    [source, faceVariants.value, faceLayout.value, currentFaceState.value]
  )
  return (
    <section class="card">
      <h2 class="card-title">{t('face.section.overlay')}</h2>
      <label class="checkbox">
        <input type="checkbox" checked={settings.enabled} onChange={(e) => updateFaceSettings({ enabled: e.currentTarget.checked })} />
        <span>{t('face.overlay.enabled')}</span>
      </label>
      <p class="hint">{t('face.overlay.hint')}</p>
      <div class="face-preview-row">
        <PixelCanvas image={preview} className="face-preview" />
        <div class="muted">
          <div>{t('face.preview')}</div>
          <div>{t('face.emotion.current', { emotion: t(`emotion.${currentEmotion.value}`) })}</div>
        </div>
      </div>
      {source.hatFrontMerged && <p class="hint">{t('face.hatMerged')}</p>}
    </section>
  )
}

function LayoutCard(): JSX.Element {
  const [active, setActive] = useState<FaceFeature>('rightEye')
  const custom = rig.value.face.layout !== null
  const analysis = faceAnalysis.value

  const setRect = useCallback((feature: FaceFeature, rect: CellRect | null) => {
    updateFaceSettings({ layout: { ...faceLayout.peek(), [feature]: rect } })
  }, [])

  return (
    <section class="card">
      <h2 class="card-title">{t('face.section.layout')}</h2>
      <p class="hint">{t('face.layout.hint')}</p>
      <div class="feature-buttons">
        {FACE_FEATURES.map((feature) => (
          <button
            key={feature}
            type="button"
            class={feature === active ? 'chip active' : 'chip'}
            style={{ borderColor: FEATURE_COLORS[feature] }}
            onClick={() => setActive(feature)}
          >
            {t(`face.feature.${feature}`)}
          </button>
        ))}
      </div>
      <FaceGrid grid={faceSource.value.grid} layout={faceLayout.value} active={active} onRect={setRect} />
      <p class="status-text">{custom ? t('face.layout.custom') : t('face.layout.auto')}</p>
      {!custom && analysis.notes.map((note) => <p key={note} class="hint">{t(`face.note.${note}`)}</p>)}
      <div class="button-row">
        <button type="button" class="button" onClick={() => setRect(active, null)}>
          {t('face.layout.clear')}
        </button>
        <button type="button" class="button" disabled={!custom} onClick={() => updateFaceSettings({ layout: null })}>
          {t('face.layout.reset')}
        </button>
      </div>
    </section>
  )
}

function ExpressionCard(): JSX.Element {
  const current = rig.value
  const eyeDriver = assignmentOf(current, FACE_PART_IDS.rightEye)?.drivers.find((d) => d.mode === 'textureSwap')
  const mouthDriver = assignmentOf(current, FACE_PART_IDS.mouth)?.drivers.find((d) => d.mode === 'faceMouth')
  const eyeThresholds = eyeDriver?.thresholds ?? [0.35, 0.65]

  const setEyeThreshold = (index: number, value: number): void => {
    const next = [...eyeThresholds]
    next[index] = value
    // Beide Augen gleich einstellen; Reihenfolge halb < zu sicherstellen.
    next.sort((a, b) => a - b)
    for (const partId of [FACE_PART_IDS.rightEye, FACE_PART_IDS.leftEye]) {
      const driver = assignmentOf(rig.peek(), partId)?.drivers.find((d) => d.mode === 'textureSwap')
      if (driver) patchFaceDriver(partId, driver.id, { thresholds: next })
    }
  }

  const setMouthThreshold = (index: number, value: number): void => {
    if (!mouthDriver) return
    const next = [...mouthDriver.thresholds]
    next[index] = value
    patchFaceDriver(FACE_PART_IDS.mouth, mouthDriver.id, { thresholds: next })
  }

  return (
    <section class="card">
      <h2 class="card-title">{t('face.section.expression')}</h2>
      <label class="checkbox">
        <input type="checkbox" checked={current.face.swapSides} onChange={(e) => updateFaceSettings({ swapSides: e.currentTarget.checked })} />
        <span>{t('face.swapSides')}</span>
      </label>
      <p class="hint">{t('face.swapSides.hint')}</p>
      {eyeDriver && (
        <>
          <Slider label={t('face.eyes.half')} value={eyeThresholds[0] ?? 0.35} min={0.05} max={0.95} step={0.01} format={percent} onInput={(v) => setEyeThreshold(0, v)} />
          <Slider label={t('face.eyes.closed')} value={eyeThresholds[1] ?? 0.65} min={0.05} max={0.95} step={0.01} format={percent} onInput={(v) => setEyeThreshold(1, v)} />
        </>
      )}
      {mouthDriver &&
        MOUTH_THRESHOLD_LABELS.map((label, index) => (
          <Slider
            key={label}
            label={t(`face.mouth.${label}` as MessageKey)}
            value={mouthDriver.thresholds[index] ?? 0.35}
            min={0.02}
            max={0.95}
            step={0.01}
            format={percent}
            onInput={(v) => setMouthThreshold(index, v)}
          />
        ))}
      <p class="hint">{t('face.mouth.hint')}</p>
    </section>
  )
}

function EmotionCard(): JSX.Element {
  const manual = manualEmotion.value
  return (
    <section class="card">
      <h2 class="card-title">{t('face.section.emotions')}</h2>
      <label class="checkbox">
        <input type="checkbox" checked={rig.value.face.autoEmotion} onChange={(e) => updateFaceSettings({ autoEmotion: e.currentTarget.checked })} />
        <span>{t('face.autoEmotion')}</span>
      </label>
      <div class="feature-buttons">
        {EMOTIONS.map((emotion) => (
          <button
            key={emotion}
            type="button"
            class={manual === emotion ? 'chip active' : 'chip'}
            onClick={() => (manualEmotion.value = manual === emotion ? null : emotion)}
          >
            {t(`emotion.${emotion}`)}
          </button>
        ))}
      </div>
      <p class="hint">{t('face.emotion.manualHint')}</p>
    </section>
  )
}

export function FacePanel(): JSX.Element {
  return (
    <div class="panel-content">
      <h1 class="panel-title">{t('tab.face')}</h1>
      <OverlayCard />
      <LayoutCard />
      <ExpressionCard />
      <EmotionCard />
      <FaceEditorCard />
    </div>
  )
}
