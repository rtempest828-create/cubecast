import { effect, signal } from '@preact/signals'
import { EMOTIONS, type Emotion } from '@core/face/emotions'
import { t } from '@shared/i18n'
import { ACCELERATOR_PATTERN, type HotkeyBinding, type HotkeyResult } from '@shared/ipc'
import { calibrateNeutralPose } from '../runtime/runtime'
import { animationPlayer } from './animation-state'
import { pushToast } from './app-state'
import { clickWheelAction, pressLuaKey } from './lua-state'
import { toggleOutputWindow } from './output-state'
import { isRecord, loadSetting, saveSetting } from './persist'
import { loadProfile } from './profile-state'
import { manualEmotion, toggleChibi } from './rig-state'

/**
 * Globale Tastenkürzel: wirken auch, wenn ein anderes Programm (z. B. Minecraft) aktiv ist.
 * Aktions-IDs: `emotion:<name>`, `emotion:auto`, `animation:<id>`, `wheel:<n>`, `lua:<taste>`,
 * `output:window`, `tracking:neutral`, `profile:<name>`.
 */

const STORAGE_KEY = 'vtuber.hotkeys'

export const hotkeyBindings = signal<readonly HotkeyBinding[]>(
  loadSetting(STORAGE_KEY, [], (v) =>
    Array.isArray(v)
      ? v.filter((b): b is HotkeyBinding => isRecord(b) && typeof b['id'] === 'string' && typeof b['accelerator'] === 'string' && ACCELERATOR_PATTERN.test(b['accelerator'])).slice(0, 64)
      : null
  )
)
export const hotkeyResults = signal<readonly HotkeyResult[]>([])

const hasBridge = (): boolean => typeof window !== 'undefined' && 'vtuber' in window

effect(() => {
  const bindings = hotkeyBindings.value
  saveSetting(STORAGE_KEY, bindings)
  if (!hasBridge()) return
  void window.vtuber.hotkeys.set(bindings).then((results) => {
    const failedBefore = new Set(hotkeyResults.peek().filter((r) => !r.ok).map((r) => r.accelerator))
    hotkeyResults.value = results
    if (results.some((r) => !r.ok && !failedBefore.has(r.accelerator))) pushToast('error', t('hotkeys.toast.taken'))
  })
})

export function addHotkey(id: string, accelerator: string): boolean {
  if (!ACCELERATOR_PATTERN.test(accelerator)) return false
  const others = hotkeyBindings.peek().filter((b) => b.accelerator !== accelerator)
  hotkeyBindings.value = [...others, { id, accelerator }]
  return true
}

export function removeHotkey(accelerator: string): void {
  hotkeyBindings.value = hotkeyBindings.peek().filter((b) => b.accelerator !== accelerator)
}

/** Tastendruck → Electron-Tastenkürzel (null, solange nur Modifikatoren gedrückt sind). */
export function acceleratorFromEvent(event: KeyboardEvent): string | null {
  const mods: string[] = []
  if (event.ctrlKey) mods.push('CommandOrControl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')
  if (event.metaKey) mods.push('Super')
  const code = event.code
  let key: string | null
  const letter = /^Key([A-Z])$/.exec(code)
  const digit = /^Digit(\d)$/.exec(code)
  const numpad = /^Numpad(\d)$/.exec(code)
  const fkey = /^F(\d{1,2})$/.exec(code)
  if (letter) key = letter[1]!
  else if (digit) key = digit[1]!
  else if (numpad) key = `num${numpad[1]}`
  else if (fkey) key = `F${fkey[1]}`
  else {
    const named: Record<string, string> = {
      Space: 'Space', Tab: 'Tab', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End',
      PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert', Delete: 'Delete', Minus: '-', Equal: '=', Comma: ',', Period: '.'
    }
    key = named[code] ?? null
  }
  if (!key) return null
  const accelerator = [...mods, key].join('+')
  return ACCELERATOR_PATTERN.test(accelerator) ? accelerator : null
}

/** Lesbarer Name eines Kürzels („Strg+Alt+1“). */
export function acceleratorLabel(accelerator: string): string {
  return accelerator.replace('CommandOrControl', 'Strg').replace('Super', 'Win').replace(/^num/, 'Num ')
}

export function actionLabel(id: string): string {
  const [kind, ...rest] = id.split(':')
  const value = rest.join(':')
  switch (kind) {
    case 'emotion':
      return value === 'auto' ? t('hotkeys.action.emotionAuto') : t('hotkeys.action.emotion', { emotion: t(`emotion.${value as Emotion}`) })
    case 'animation':
      return t('hotkeys.action.animation', { name: value })
    case 'wheel':
      return t('hotkeys.action.wheel', { index: value })
    case 'lua':
      return t('hotkeys.action.lua', { key: value.replace(/^key\.keyboard\./, '').toUpperCase() })
    case 'output':
      return t('hotkeys.action.outputWindow')
    case 'tracking':
      return t('hotkeys.action.neutral')
    case 'profile':
      return t('hotkeys.action.profile', { name: value })
    case 'chibi':
      return t('hotkeys.action.chibi')
    default:
      return id
  }
}

function runAction(id: string): void {
  const [kind, ...rest] = id.split(':')
  const value = rest.join(':')
  switch (kind) {
    case 'emotion':
      if (value === 'auto') manualEmotion.value = null
      else if (EMOTIONS.includes(value as Emotion)) manualEmotion.value = manualEmotion.peek() === value ? null : (value as Emotion)
      break
    case 'animation':
      if (animationPlayer.stateOf(value) === 'playing') animationPlayer.stop(value)
      else animationPlayer.restart(value)
      break
    case 'wheel':
      clickWheelAction(Number(value), false)
      break
    case 'lua':
      if (value) pressLuaKey(value)
      break
    case 'output':
      void toggleOutputWindow()
      break
    case 'tracking':
      if (calibrateNeutralPose()) pushToast('success', t('tracking.calibration.success'))
      break
    case 'profile':
      void loadProfile(value)
      break
    case 'chibi':
      toggleChibi()
      break
  }
}

if (hasBridge()) window.vtuber.hotkeys.onTriggered(runAction)
