import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { EMOTIONS } from '@core/face/emotions'
import { t } from '@shared/i18n'
import { PROFILE_NAME_PATTERN, type AppInfo } from '@shared/ipc'
import { animationClips } from '../state/animation-state'
import { acceleratorFromEvent, acceleratorLabel, actionLabel, addHotkey, hotkeyBindings, hotkeyResults, removeHotkey } from '../state/hotkey-state'
import { luaKeybinds, luaWheel } from '../state/lua-state'
import { autoProfile, currentProfile, loadProfile, profiles, refreshProfiles, removeProfile, saveProfile, setAutoProfile } from '../state/profile-state'

function ProfileCard(): JSX.Element {
  const list = profiles.value
  const [name, setName] = useState(currentProfile.value ?? '')
  const [selected, setSelected] = useState('')
  const current = list.some((p) => p.name === selected) ? selected : (list[0]?.name ?? '')
  const valid = PROFILE_NAME_PATTERN.test(name.trim())
  useEffect(() => {
    void refreshProfiles()
  }, [])

  return (
    <section class="card">
      <h2 class="card-title">{t('profile.section')}</h2>
      <p class="hint">{t('profile.hint')}</p>
      {list.length > 0 ? (
        <>
          <label class="field">
            <span class="field-label">{t('profile.list')}</span>
            <select value={current} onChange={(e) => setSelected(e.currentTarget.value)}>
              {list.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                  {p.updated ? ` (${new Date(p.updated).toLocaleString('de-DE')})` : ''}
                </option>
              ))}
            </select>
          </label>
          <div class="button-row">
            <button type="button" class="button primary" disabled={!current} onClick={() => void loadProfile(current)}>
              {t('profile.load')}
            </button>
            <button
              type="button"
              class="button"
              disabled={!current}
              onClick={() => {
                if (window.confirm(t('profile.confirmDelete', { name: current }))) void removeProfile(current)
              }}
            >
              {t('profile.delete')}
            </button>
          </div>
          <label class="checkbox">
            <input type="checkbox" checked={!!current && autoProfile.value === current} disabled={!current} onChange={(e) => setAutoProfile(e.currentTarget.checked ? current : null)} />
            <span>{t('profile.auto')}</span>
          </label>
        </>
      ) : (
        <p class="status-text">{t('profile.none')}</p>
      )}
      <form
        class="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) void saveProfile(name.trim())
        }}
      >
        <label class="field">
          <span class="field-label">{t('profile.saveAs')}</span>
          <input type="text" value={name} maxLength={60} placeholder={t('profile.placeholder')} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <button type="submit" class="button" disabled={!valid}>
          {t('profile.save')}
        </button>
      </form>
    </section>
  )
}

function actionOptions(): { group: string; items: { id: string; label: string }[] }[] {
  const groups = [
    {
      group: t('hotkeys.group.face'),
      items: [{ id: 'emotion:auto', label: actionLabel('emotion:auto') }, ...EMOTIONS.map((e) => ({ id: `emotion:${e}`, label: actionLabel(`emotion:${e}`) }))]
    },
    {
      group: t('hotkeys.group.general'),
      items: [
        { id: 'output:window', label: actionLabel('output:window') },
        { id: 'chibi:toggle', label: actionLabel('chibi:toggle') },
        { id: 'tracking:neutral', label: actionLabel('tracking:neutral') },
        ...profiles.value.map((p) => ({ id: `profile:${p.name}`, label: actionLabel(`profile:${p.name}`) }))
      ]
    },
    { group: t('hotkeys.group.animations'), items: animationClips.value.map((c) => ({ id: `animation:${c.id}`, label: actionLabel(`animation:${c.id}`) })) },
    {
      group: t('hotkeys.group.lua'),
      items: [
        ...luaWheel.value.actions.map((a) => ({ id: `wheel:${a.index}`, label: `${actionLabel(`wheel:${a.index}`)} – ${a.title}` })),
        ...luaKeybinds.value.map((k) => ({ id: `lua:${k.key}`, label: `${actionLabel(`lua:${k.key}`)} – ${k.name}` }))
      ]
    }
  ]
  return groups.filter((g) => g.items.length > 0)
}

function HotkeyCard(): JSX.Element {
  const bindings = hotkeyBindings.value
  const failed = new Set(hotkeyResults.value.filter((r) => !r.ok).map((r) => r.accelerator))
  const options = actionOptions()
  const [action, setAction] = useState('emotion:happy')
  const [accelerator, setAccelerator] = useState<string | null>(null)

  return (
    <section class="card">
      <h2 class="card-title">{t('hotkeys.section')}</h2>
      <p class="hint">{t('hotkeys.hint')}</p>
      {bindings.length > 0 && (
        <ul class="hotkey-list">
          {bindings.map((b) => (
            <li key={b.accelerator} class={failed.has(b.accelerator) ? 'hotkey failed' : 'hotkey'}>
              <kbd>{acceleratorLabel(b.accelerator)}</kbd>
              <span>{actionLabel(b.id)}</span>
              {failed.has(b.accelerator) && <span class="status-text error">{t('hotkeys.taken')}</span>}
              <button type="button" class="button" onClick={() => removeHotkey(b.accelerator)}>
                {t('hotkeys.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label class="field">
        <span class="field-label">{t('hotkeys.action')}</span>
        <select value={action} onChange={(e) => setAction(e.currentTarget.value)}>
          {options.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label class="field">
        <span class="field-label">{t('hotkeys.key')}</span>
        <input
          type="text"
          readOnly
          value={accelerator ? acceleratorLabel(accelerator) : ''}
          placeholder={t('hotkeys.press')}
          onKeyDown={(e) => {
            e.preventDefault()
            const acc = acceleratorFromEvent(e)
            if (acc) setAccelerator(acc)
          }}
        />
      </label>
      <div class="button-row">
        <button
          type="button"
          class="button primary"
          disabled={!accelerator}
          onClick={() => {
            if (accelerator && addHotkey(action, accelerator)) setAccelerator(null)
          }}
        >
          {t('hotkeys.add')}
        </button>
      </div>
    </section>
  )
}

function AppCard(): JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  useEffect(() => {
    if ('vtuber' in window) void window.vtuber.app.info().then(setInfo)
  }, [])
  return (
    <section class="card">
      <h2 class="card-title">{t('settings.app')}</h2>
      <ul class="info-list">
        <li>{t('settings.version', { version: info?.version ?? '–' })}</li>
        <li class="hint">{info?.dataFolder}</li>
      </ul>
      <p class="hint">{t('settings.privacy')}</p>
      <div class="button-row">
        <button type="button" class="button" onClick={() => void window.vtuber.app.openDataFolder()}>
          {t('settings.openData')}
        </button>
      </div>
    </section>
  )
}

/** Bereich „Einstellungen“: Profile, globale Tastenkürzel, App-Infos. */
export function SettingsPanel(): JSX.Element {
  return (
    <div class="panel-content">
      <h1 class="panel-title">{t('tab.settings')}</h1>
      <ProfileCard />
      <HotkeyCard />
      <AppCard />
    </div>
  )
}
