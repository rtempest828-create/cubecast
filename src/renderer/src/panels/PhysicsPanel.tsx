import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { findPart } from '@core/model/avatar-model'
import { AXES, type Axis, type DriverConfig } from '@core/roles/drivers'
import { assignmentOf, withAssignment } from '@core/roles/rig'
import { t } from '@shared/i18n'
import { listMicrophones } from '../audio/lipsync-client'
import { Slider } from '../components/Slider'
import { ValueBar } from '../components/ValueBar'
import { roleLabel } from '../debug/PartTree'
import { armTrackingActive, resetPhysics } from '../runtime/runtime'
import { avatarModel } from '../state/app-state'
import { bodyState, lipSyncClient, micLevel, microphones, updateBodyState } from '../state/body-state'
import { rig, updateCosmetics, updateRig } from '../state/rig-state'
import { trackingClient } from '../state/tracking-state'

const percent = (value: number): string => t('unit.percent', { value: Math.round(value * 100) })

function BodyCard(): JSX.Element {
  const body = bodyState.value
  return (
    <section class="card">
      <h2 class="card-title">{t('body.section.body')}</h2>
      <Slider label={t('body.follow')} hint={t('body.follow.hint')} value={body.follow} min={0} max={2} step={0.05} format={percent} onInput={(follow) => updateBodyState({ follow })} />
      <Slider label={t('body.breathing')} value={body.breathing} min={0} max={1} step={0.05} format={percent} onInput={(breathing) => updateBodyState({ breathing })} />
      <Slider label={t('body.sway')} value={body.sway} min={0} max={1} step={0.05} format={percent} onInput={(sway) => updateBodyState({ sway })} />
      <label class="checkbox">
        <input type="checkbox" checked={body.armIdle} onChange={(e) => updateBodyState({ armIdle: e.currentTarget.checked })} />
        <span>{t('body.armIdle')}</span>
      </label>
    </section>
  )
}

/** Ändert die Physik-Werte eines Teils in der Rollen-Zuordnung. */
function patchPhysics(partId: string, driver: DriverConfig, patch: Partial<DriverConfig['physics']>): void {
  const current = rig.peek()
  const assignment = assignmentOf(current, partId)
  if (!assignment) return
  const drivers = assignment.drivers.map((d) => (d.id === driver.id ? { ...d, physics: { ...d.physics, ...patch } } : d))
  updateRig(withAssignment(current, partId, { ...assignment, drivers }))
}

function PhysicsCard(): JSX.Element {
  const body = bodyState.value
  const model = avatarModel.value
  const entries = rig.value.assignments
    .filter((a) => a.confirmed)
    .flatMap((a) => {
      const driver = a.drivers.find((d) => d.mode === 'physics')
      const part = findPart(model.root, a.partId)
      return driver && part ? [{ assignment: a, driver, part }] : []
    })

  return (
    <section class="card">
      <h2 class="card-title">{t('body.section.physics')}</h2>
      <label class="checkbox">
        <input type="checkbox" checked={body.physicsEnabled} onChange={(e) => updateBodyState({ physicsEnabled: e.currentTarget.checked })} />
        <span>{t('body.physics.enabled')}</span>
      </label>
      <Slider label={t('body.physics.strength')} value={body.physicsStrength} min={0} max={2} step={0.05} format={percent} onInput={(physicsStrength) => updateBodyState({ physicsStrength })} />
      {entries.length === 0 && <p class="hint">{t('body.physics.none')}</p>}
      {entries.map(({ assignment, driver, part }) => (
        <div key={part.id} class="physics-part">
          <div class="physics-part-head">
            <strong>{part.name}</strong>
            <span class="role-badge">{roleLabel(assignment)}</span>
          </div>
          <Slider label={t('body.physics.strengthPart')} value={driver.physics.strength} min={0} max={1} step={0.05} format={percent} onInput={(strength) => patchPhysics(part.id, driver, { strength })} />
          <Slider label={t('body.physics.damping')} value={driver.physics.damping} min={0} max={1} step={0.05} format={percent} onInput={(damping) => patchPhysics(part.id, driver, { damping })} />
          <div class="axis-row">
            <span class="field-label">{t('body.physics.axes')}</span>
            {AXES.map((axis: Axis) => (
              <label key={axis} class="checkbox">
                <input
                  type="checkbox"
                  checked={driver.physics.axes.includes(axis)}
                  onChange={(e) =>
                    patchPhysics(part.id, driver, {
                      axes: e.currentTarget.checked ? [...driver.physics.axes, axis] : driver.physics.axes.filter((a) => a !== axis)
                    })
                  }
                />
                <span>{axis.toUpperCase()}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      {entries.length > 0 && <p class="hint">{t('body.physics.axesHint')}</p>}
      <button type="button" class="button small" onClick={resetPhysics}>
        {t('body.physics.reset')}
      </button>
    </section>
  )
}

function CosmeticsCard(): JSX.Element {
  const cosmetics = rig.value.cosmetics
  const options = [
    ['foxEars', 'body.cosmetics.foxEars'],
    ['foxTail', 'body.cosmetics.foxTail'],
    ['headset', 'body.cosmetics.headset']
  ] as const
  return (
    <section class="card">
      <h2 class="card-title">{t('body.section.cosmetics')}</h2>
      {options.map(([key, label]) => (
        <label key={key} class="checkbox">
          <input type="checkbox" checked={cosmetics[key]} onChange={(e) => updateCosmetics({ [key]: e.currentTarget.checked })} />
          <span>{t(label)}</span>
        </label>
      ))}
      <p class="hint">{t('body.cosmetics.hint')}</p>
    </section>
  )
}

function ArmsCard(): JSX.Element {
  const body = bodyState.value
  const status = trackingClient.poseStatus.value
  let text: string
  if (status === 'error') text = t('body.arms.status.error', { message: trackingClient.poseError.value ?? '?' })
  else if (status === 'loading') text = t('body.arms.status.loading')
  else if (status === 'ready') text = armTrackingActive.value ? t('body.arms.status.active') : t('body.arms.status.ready')
  else text = t('body.arms.status.off')
  return (
    <section class="card">
      <h2 class="card-title">{t('body.section.arms')}</h2>
      <label class="checkbox">
        <input type="checkbox" checked={body.armTracking} onChange={(e) => updateBodyState({ armTracking: e.currentTarget.checked })} />
        <span>{t('body.arms.enabled')}</span>
      </label>
      <p class={status === 'error' ? 'status-text error' : 'status-text'}>{text}</p>
      <p class="hint">{t('body.arms.hint')}</p>
    </section>
  )
}

async function refreshMicrophones(): Promise<void> {
  try {
    microphones.value = await listMicrophones()
  } catch {
    // Liste bleibt leer; Standardmikrofon funktioniert trotzdem.
  }
}

function LipSyncCard(): JSX.Element {
  const body = bodyState.value
  const status = lipSyncClient.status.value
  const running = status === 'running' || status === 'starting'
  const errorCode = lipSyncClient.errorCode.value

  const start = async (): Promise<void> => {
    await lipSyncClient.start(bodyState.peek().micDeviceId)
    await refreshMicrophones()
  }

  return (
    <section class="card">
      <h2 class="card-title">{t('body.section.lipsync')}</h2>
      <p class="hint">{t('body.lipsync.hint')}</p>
      <select
        value={body.micDeviceId ?? ''}
        onChange={(e) => {
          updateBodyState({ micDeviceId: e.currentTarget.value || null })
          if (running) void start()
        }}
      >
        <option value="">{t('body.lipsync.device.default')}</option>
        {microphones.value.map((mic, index) => (
          <option key={mic.deviceId} value={mic.deviceId}>
            {mic.label || t('body.lipsync.device.unnamed', { index: index + 1 })}
          </option>
        ))}
      </select>
      <button type="button" class={running ? 'button' : 'button primary'} disabled={status === 'starting'} onClick={() => (running ? lipSyncClient.stop() : void start())}>
        {running ? t('body.lipsync.stop') : t('body.lipsync.start')}
      </button>
      {status === 'error' && errorCode && <p class="status-text error">{t(`body.lipsync.error.${errorCode}`)}</p>}
      <ValueBar label={t('body.lipsync.level')} value={micLevel.value} min={0} max={1} text={percent(micLevel.value)} />
      <Slider label={t('body.lipsync.gain')} value={body.micGain} min={0.25} max={6} step={0.05} format={(v) => `${v.toFixed(2)}×`} onInput={(micGain) => updateBodyState({ micGain })} />
      <Slider
        label={t('body.lipsync.gate')}
        hint={t('body.lipsync.gate.hint')}
        value={body.micGateDb}
        min={-80}
        max={-20}
        step={1}
        format={(v) => t('unit.db', { value: v })}
        onInput={(micGateDb) => updateBodyState({ micGateDb })}
      />
    </section>
  )
}

export function PhysicsPanel(): JSX.Element {
  useEffect(() => {
    void refreshMicrophones()
  }, [])
  return (
    <div class="panel-content">
      <h1 class="panel-title">{t('tab.physics')}</h1>
      <BodyCard />
      <PhysicsCard />
      <CosmeticsCard />
      <ArmsCard />
      <LipSyncCard />
    </div>
  )
}
