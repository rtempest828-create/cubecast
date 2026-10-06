import type { JSX } from 'preact'
import { t } from '@shared/i18n'
import { armTrackingActive, physicsPartCount } from '../runtime/runtime'
import { animationClips, animationStatus } from '../state/animation-state'
import { logEntries, signalMode } from '../state/debug-state'
import { currentEmotion } from '../state/rig-state'
import { trackingClient, trackingDebug } from '../state/tracking-state'

/** Messwerte oben links in der 3D-Ansicht (nur im Debug-Modus). */
export function DebugHud(): JSX.Element {
  const debug = trackingDebug.value
  const running = trackingClient.status.value === 'running'
  const warnings = logEntries.value.filter((e) => e.level !== 'info').length
  const rows: readonly [string, string][] = [
    [t('hud.render'), t('unit.fps', { value: Math.round(debug.renderFps) })],
    [t('hud.tracking'), running ? t('unit.fps', { value: debug.trackingFps }) : '–'],
    [t('hud.latency'), running ? t('unit.ms', { value: Math.round(debug.latencyMs) }) : '–'],
    [t('hud.source'), t(`debug.sim.${signalMode.value}`)],
    [t('hud.face'), debug.faceFound ? t('tracking.live.yes') : t('tracking.live.no')],
    [t('hud.emotion'), t(`emotion.${currentEmotion.value}`)],
    [t('hud.physics'), t('hud.physics.parts', { count: physicsPartCount.value })],
    [t('hud.arms'), armTrackingActive.value ? t('hud.arms.tracked') : t('hud.arms.idle')],
    [
      t('hud.animations'),
      animationClips.value.length === 0
        ? t('hud.animations.none')
        : t('hud.animations.active', { active: [...animationStatus.value.values()].filter((s) => s.state === 'playing').length, total: animationClips.value.length })
    ],
    [t('hud.lua'), t('hud.lua.none')],
    [t('hud.warnings'), String(warnings)]
  ]
  return (
    <div class="debug-hud">
      {rows.map(([label, value]) => (
        <div key={label} class="hud-row">
          <span>{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  )
}
