import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { findPart, walkParts, type PartNode } from '@core/model/avatar-model'
import { AXES, createDriver, DRIVER_MODES, type Axis, type DriverConfig, type DriverMode } from '@core/roles/drivers'
import { BUILTIN_ROLES, customRole, defaultDriversForRole, type RoleId } from '@core/roles/roles'
import { assignmentOf, withAssignment, type AvatarRig, type RoleAssignment } from '@core/roles/rig'
import { SIGNAL_CATALOG } from '@core/tracking/signals'
import { t, type MessageKey } from '@shared/i18n'
import { avatarModel } from '../state/app-state'
import { driverValues, selection } from '../state/debug-state'
import { resetRig, rerunRoleDetection, rig, updateRig } from '../state/rig-state'

const SOURCE_MODES = new Set<DriverMode>(['rotation', 'position', 'scale', 'visibility', 'uvOffset', 'textureSwap'])
const AXIS_MODES = new Set<DriverMode>(['rotation', 'position', 'scale', 'uvOffset'])
const THRESHOLD_MODES = new Set<DriverMode>(['visibility', 'textureSwap', 'faceMouth'])

function NumberField({ label, value, step = 0.05, onChange }: { readonly label: string; readonly value: number; readonly step?: number; readonly onChange: (v: number) => void }): JSX.Element {
  return (
    <label class="field compact">
      <span class="field-label">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const parsed = Number(e.currentTarget.value)
          if (Number.isFinite(parsed)) onChange(parsed)
        }}
      />
    </label>
  )
}

function DriverEditor({ partId, driver, onChange, onRemove }: { readonly partId: string; readonly driver: DriverConfig; readonly onChange: (d: DriverConfig) => void; readonly onRemove: () => void }): JSX.Element {
  const live = driverValues.value.get(`${partId}/${driver.id}`)
  const set = (patch: Partial<DriverConfig>): void => onChange({ ...driver, ...patch })
  const [thresholdText, setThresholdText] = useState(driver.thresholds.join(', '))

  return (
    <div class="driver-card">
      <div class="driver-head">
        <select
          value={driver.mode}
          onChange={(e) => onChange(createDriver(e.currentTarget.value as DriverMode, { id: driver.id, source: driver.source }))}
        >
          {DRIVER_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(`driver.mode.${mode}`)}
            </option>
          ))}
        </select>
        <button type="button" class="button small" onClick={onRemove}>
          {t('debug.driver.remove')}
        </button>
      </div>

      {driver.mode === 'headRotation' && <p class="hint">{t('debug.driver.headHint')}</p>}
      {driver.mode === 'faceMouth' && <p class="hint">{t('debug.driver.mouthHint')}</p>}

      {SOURCE_MODES.has(driver.mode) && (
        <label class="field compact">
          <span class="field-label">{t('debug.driver.source')}</span>
          <select value={driver.source} onChange={(e) => set({ source: e.currentTarget.value })}>
            {(['head', 'derived', 'blendshape'] as const).map((group) => (
              <optgroup key={group} label={group}>
                {SIGNAL_CATALOG.filter((s) => s.group === group).map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}

      {AXIS_MODES.has(driver.mode) && (
        <label class="field compact">
          <span class="field-label">{t('debug.driver.axis')}</span>
          <select value={driver.axis} onChange={(e) => set({ axis: e.currentTarget.value as Axis })}>
            {(driver.mode === 'uvOffset' ? AXES.slice(0, 2) : AXES).map((axis) => (
              <option key={axis} value={axis}>
                {axis.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      )}

      {SOURCE_MODES.has(driver.mode) && (
        <>
          <div class="field-grid">
            <NumberField label={t('debug.driver.inputMin')} value={driver.inputMin} onChange={(v) => set({ inputMin: v })} />
            <NumberField label={t('debug.driver.inputMax')} value={driver.inputMax} onChange={(v) => set({ inputMax: v })} />
            {AXIS_MODES.has(driver.mode) && (
              <>
                <NumberField label={t('debug.driver.outputMin')} value={driver.outputMin} step={0.1} onChange={(v) => set({ outputMin: v })} />
                <NumberField label={t('debug.driver.outputMax')} value={driver.outputMax} step={0.1} onChange={(v) => set({ outputMax: v })} />
              </>
            )}
            <NumberField label={t('debug.driver.sensitivity')} value={driver.sensitivity} step={0.1} onChange={(v) => set({ sensitivity: Math.max(0, v) })} />
            <NumberField label={t('debug.driver.smoothing')} value={driver.smoothing} step={0.05} onChange={(v) => set({ smoothing: Math.max(0, Math.min(1, v)) })} />
          </div>
          <label class="checkbox">
            <input type="checkbox" checked={driver.invert} onChange={(e) => set({ invert: e.currentTarget.checked })} />
            <span>{t('debug.driver.invert')}</span>
          </label>
        </>
      )}

      {THRESHOLD_MODES.has(driver.mode) && (
        <label class="field compact">
          <span class="field-label">{t('debug.driver.thresholds')}</span>
          <input
            type="text"
            value={thresholdText}
            onInput={(e) => setThresholdText(e.currentTarget.value)}
            onChange={() => {
              const values = thresholdText
                .split(/[,;\s]+/)
                .map((v) => Number(v.replace(',', '.')))
                .filter((v) => Number.isFinite(v))
                .slice(0, 8)
              set({ thresholds: values })
            }}
          />
        </label>
      )}

      {driver.mode === 'physics' && (
        <>
          <p class="hint">{t('debug.driver.physicsLater')}</p>
          <div class="field-grid">
            <NumberField label={t('debug.driver.strength')} value={driver.physics.strength} onChange={(v) => set({ physics: { ...driver.physics, strength: Math.max(0, Math.min(1, v)) } })} />
            <NumberField label={t('debug.driver.damping')} value={driver.physics.damping} onChange={(v) => set({ physics: { ...driver.physics, damping: Math.max(0, Math.min(1, v)) } })} />
          </div>
        </>
      )}

      {live && (
        <p class="driver-live">{t('debug.driver.live', { input: live.input.toFixed(2), output: Number.isInteger(live.output) ? live.output : live.output.toFixed(2) })}</p>
      )}
    </div>
  )
}

function RoleSelect({ value, onChange }: { readonly value: RoleId | null; readonly onChange: (role: RoleId | null) => void }): JSX.Element {
  const [customName, setCustomName] = useState('')
  const [customMode, setCustomMode] = useState(value?.startsWith('custom:') ?? false)
  const existingCustom = [...new Set(rig.value.assignments.map((a) => a.role).filter((r) => r.startsWith('custom:')))]

  return (
    <div class="role-select">
      <select
        value={customMode ? '__custom' : (value ?? '')}
        onChange={(e) => {
          const v = e.currentTarget.value
          if (v === '__custom') setCustomMode(true)
          else {
            setCustomMode(false)
            onChange(v ? (v as RoleId) : null)
          }
        }}
      >
        <option value="">{t('debug.role.none')}</option>
        {BUILTIN_ROLES.map((role) => (
          <option key={role} value={role}>
            {t(`role.${role}` as MessageKey)}
          </option>
        ))}
        {existingCustom.map((role) => (
          <option key={role} value={role}>
            {role.slice(7)}
          </option>
        ))}
        <option value="__custom">{t('debug.role.custom')}</option>
      </select>
      {customMode && (
        <form
          class="inline-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (customName.trim()) onChange(customRole(customName))
          }}
        >
          <input type="text" placeholder={t('debug.role.customName')} value={customName} onInput={(e) => setCustomName(e.currentTarget.value)} />
          <button type="submit" class="button small primary">
            OK
          </button>
        </form>
      )}
    </div>
  )
}

function setRole(current: AvatarRig, partId: string, role: RoleId | null): AvatarRig {
  return withAssignment(current, partId, role ? { partId, role, confirmed: true, drivers: defaultDriversForRole(role) } : null)
}

function SinglePartEditor({ part }: { readonly part: PartNode }): JSX.Element {
  const assignment = assignmentOf(rig.value, part.id)
  const save = (next: RoleAssignment): void => updateRig(withAssignment(rig.peek(), part.id, next))

  return (
    <div class="role-editor">
      <h3 class="editor-title">{part.name}</h3>
      <label class="field compact">
        <span class="field-label">{t('debug.role')}</span>
        <RoleSelect key={part.id} value={assignment?.role ?? null} onChange={(role) => updateRig(setRole(rig.peek(), part.id, role))} />
      </label>
      {assignment && !assignment.confirmed && (
        <div class="suggestion">
          <span class="hint">{t('debug.role.suggested')}</span>
          <button type="button" class="button small primary" onClick={() => save({ ...assignment, confirmed: true })}>
            {t('debug.role.confirm')}
          </button>
        </div>
      )}
      {assignment && (
        <>
          <h4 class="card-title">{t('debug.drivers')}</h4>
          {assignment.drivers.length === 0 && <p class="hint">{t('debug.drivers.none')}</p>}
          {assignment.drivers.map((driver, index) => (
            <DriverEditor
              key={`${part.id}/${driver.id}/${driver.mode}`}
              partId={part.id}
              driver={driver}
              onChange={(next) => save({ ...assignment, drivers: assignment.drivers.map((d, i) => (i === index ? next : d)) })}
              onRemove={() => save({ ...assignment, drivers: assignment.drivers.filter((_, i) => i !== index) })}
            />
          ))}
          <button type="button" class="button" onClick={() => save({ ...assignment, drivers: [...assignment.drivers, createDriver('rotation')] })}>
            {t('debug.driver.add')}
          </button>
        </>
      )}
    </div>
  )
}

/** Rollen und Treiber der Auswahl bearbeiten. */
export function RoleEditor(): JSX.Element {
  const model = avatarModel.value
  const { parts, cubes } = selection.value

  // Würfel-Auswahl: das zugehörige Teil bearbeiten.
  let cubeInfo: JSX.Element | null = null
  let partIds = [...parts]
  if (partIds.length === 0 && cubes.size === 1) {
    const cubeId = [...cubes][0]!
    walkParts(model.root, (part) => {
      const cube = part.cubes.find((c) => c.id === cubeId)
      if (cube) {
        partIds = [part.id]
        cubeInfo = <p class="hint">{t('debug.selection.cube', { name: cube.name, part: part.name })}</p>
      }
    })
  }

  const toolbar = (
    <div class="button-row">
      <button type="button" class="button small" onClick={rerunRoleDetection}>
        {t('debug.rig.redetect')}
      </button>
      <button type="button" class="button small" onClick={() => window.confirm(t('debug.rig.resetConfirm')) && resetRig()}>
        {t('debug.rig.reset')}
      </button>
    </div>
  )

  if (partIds.length === 0) {
    return (
      <div class="role-editor">
        <p class="hint">{t('debug.selection.none')}</p>
        {toolbar}
        <p class="hint">{t('debug.rig.saved')}</p>
      </div>
    )
  }

  if (partIds.length > 1) {
    return (
      <div class="role-editor">
        <h3 class="editor-title">{t('debug.selection.multi', { count: partIds.length })}</h3>
        <label class="field compact">
          <span class="field-label">{t('debug.role.applyToSelection', { count: partIds.length })}</span>
          <RoleSelect value={null} onChange={(role) => updateRig(partIds.reduce((acc, id) => setRole(acc, id, role), rig.peek()))} />
        </label>
        {toolbar}
      </div>
    )
  }

  const part = findPart(model.root, partIds[0]!)
  return (
    <>
      {cubeInfo}
      {part ? <SinglePartEditor part={part} /> : null}
      {toolbar}
    </>
  )
}
