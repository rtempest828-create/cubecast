import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { t } from '@shared/i18n'
import { activeTab, loadedFigura } from '../state/app-state'
import {
  clearLuaLog,
  clickWheelAction,
  gameState,
  luaKeybinds,
  luaLog,
  luaStats,
  luaStatus,
  luaWheel,
  restartLua,
  scrollWheelAction,
  sendChat,
  setLuaEnabled,
  simulateHurt,
  updateGameState,
  type GameState
} from '../state/lua-state'
import { rig } from '../state/rig-state'

const keyLabel = (key: string): string => key.replace(/^key\.(keyboard|mouse)\./, '').replace(/\./g, ' ').toUpperCase()

function StatusCard(): JSX.Element {
  const status = luaStatus.value
  const stats = luaStats.value
  const enabled = rig.value.luaEnabled !== false
  const text =
    status.kind === 'error' ? t('lua.status.error', { message: status.message }) : t(`lua.status.${status.kind}`)
  return (
    <section class="card">
      <h2 class="card-title">{t('lua.section.status')}</h2>
      <p class={status.kind === 'error' ? 'status-text error' : 'status-text'}>{text}</p>
      <label class="checkbox">
        <input type="checkbox" checked={enabled} onChange={(e) => setLuaEnabled(e.currentTarget.checked)} />
        <span>{t('lua.enabled')}</span>
      </label>
      <div class="button-row">
        <button type="button" class="button" disabled={!enabled} onClick={restartLua}>
          {t('lua.restart')}
        </button>
      </div>
      {stats && (
        <p class="hint">
          {t('lua.stats', {
            init: Math.round(stats.initInstructions / 1000),
            tick: Math.round(stats.tickInstructions / 1000),
            render: Math.round(stats.renderInstructions / 1000),
            memory: (stats.memoryBytes / 1024 / 1024).toFixed(1)
          })}
        </p>
      )}
      <p class="hint">{t('lua.sandbox')}</p>
    </section>
  )
}

function WheelCard(): JSX.Element | null {
  const wheel = luaWheel.value
  if (wheel.actions.length === 0) return null
  return (
    <section class="card">
      <h2 class="card-title">{wheel.title ? t('lua.wheel.titled', { title: wheel.title }) : t('lua.wheel')}</h2>
      <div class="wheel-grid">
        {wheel.actions.map((action) => (
          <button
            key={action.index}
            type="button"
            class={action.toggled ? 'wheel-action toggled' : 'wheel-action'}
            style={action.color ? { borderLeftColor: `#${action.color}` } : undefined}
            title={t('lua.wheel.hint')}
            onClick={() => clickWheelAction(action.index, false)}
            onContextMenu={(e) => {
              e.preventDefault()
              clickWheelAction(action.index, true)
            }}
            onWheel={(e) => {
              if (!action.scrollable) return
              e.preventDefault()
              scrollWheelAction(action.index, e.deltaY < 0 ? 1 : -1)
            }}
          >
            <span class="wheel-title">{action.title || `#${action.index}`}</span>
            {action.item && <span class="wheel-item">{action.item.replace(/^minecraft:/, '')}</span>}
            {action.toggleable && <span class="wheel-state">{action.toggled ? t('lua.wheel.on') : t('lua.wheel.off')}</span>}
          </button>
        ))}
      </div>
      <p class="hint">{t('lua.wheel.hint')}</p>
    </section>
  )
}

function KeybindCard(): JSX.Element | null {
  const keybinds = luaKeybinds.value
  if (keybinds.length === 0) return null
  return (
    <section class="card">
      <h2 class="card-title">{t('lua.keybinds')}</h2>
      <ul class="info-list">
        {keybinds.map((kb, i) => (
          <li key={i}>
            <kbd>{keyLabel(kb.key)}</kbd> {kb.name}
          </li>
        ))}
      </ul>
      <p class="hint">{t('lua.keybinds.hint')}</p>
    </section>
  )
}

function GameCard(): JSX.Element {
  const game = gameState.value
  const [message, setMessage] = useState('')
  const toggles: readonly (keyof GameState)[] = ['crouch', 'walk', 'sprint', 'sleep']
  return (
    <section class="card">
      <h2 class="card-title">{t('lua.game')}</h2>
      <p class="hint">{t('lua.game.hint')}</p>
      <div class="vanilla-grid">
        {toggles.map((key) => (
          <label key={key} class="checkbox">
            <input type="checkbox" checked={game[key]} onChange={(e) => updateGameState({ [key]: e.currentTarget.checked })} />
            <span>{t(`lua.game.${key}`)}</span>
          </label>
        ))}
      </div>
      <div class="button-row">
        <button type="button" class="button" onClick={simulateHurt}>
          {t('lua.game.hurt')}
        </button>
      </div>
      <form
        class="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          sendChat(message)
          setMessage('')
        }}
      >
        <label class="field">
          <span class="field-label">{t('lua.chat')}</span>
          <input type="text" value={message} maxLength={256} placeholder={t('lua.chat.placeholder')} onInput={(e) => setMessage(e.currentTarget.value)} />
        </label>
        <button type="submit" class="button" disabled={!message.trim()}>
          {t('lua.chat.send')}
        </button>
      </form>
    </section>
  )
}

function LogCard(): JSX.Element {
  const entries = luaLog.value
  return (
    <section class="card">
      <h2 class="card-title">{t('lua.log')}</h2>
      {entries.length === 0 ? (
        <p class="hint">{t('lua.log.empty')}</p>
      ) : (
        <ol class="lua-log">
          {entries.slice(-120).map((entry) => (
            <li key={entry.id} class={`lua-log-${entry.level}`}>
              <time>{new Date(entry.time).toLocaleTimeString('de-DE')}</time> <span>{entry.message}</span>
            </li>
          ))}
        </ol>
      )}
      <div class="button-row">
        <button type="button" class="button" disabled={entries.length === 0} onClick={clearLuaLog}>
          {t('lua.log.clear')}
        </button>
      </div>
    </section>
  )
}

/** Bereich „Skript (Lua)“. */
export function ScriptPanel(): JSX.Element {
  const figura = loadedFigura.value
  return (
    <div class="panel-content">
      <h1 class="panel-title">{t('tab.script')}</h1>
      {!figura ? (
        <section class="card">
          <p class="hint">{t('lua.noFigura')}</p>
          <button type="button" class="button" onClick={() => (activeTab.value = 'model')}>
            {t('anim.toModel')}
          </button>
        </section>
      ) : figura.avatar.scripts.length === 0 ? (
        <section class="card">
          <p class="hint">{t('lua.noScripts')}</p>
        </section>
      ) : (
        <>
          <StatusCard />
          <WheelCard />
          <KeybindCard />
          <GameCard />
          <LogCard />
        </>
      )}
    </div>
  )
}
