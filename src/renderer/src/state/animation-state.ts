import { computed, effect, signal } from '@preact/signals'
import { LOOP_MODES, type AnimationClip, type LoopMode } from '@core/animation/clip'
import { AnimationPlayer, DEFAULT_ANIMATION_SETTINGS, type AnimationSettings, type ClipStatus } from '@core/animation/player'
import { loadedFigura } from './app-state'
import { avatarKey, rig, updateRig } from './rig-state'

/**
 * Blockbench-Animationen des geladenen Figura-Avatars. Der Player läuft im Bild-Takt
 * (`runtime.ts`); die Einstellungen pro Animation werden mit der Zuordnung gespeichert.
 */

export const animationClips = computed<readonly AnimationClip[]>(() => loadedFigura.value?.avatar.animations ?? [])

export const animationPlayer = new AnimationPlayer()

/** Zustand der aktiven Animationen (ca. 10 × pro Sekunde aktualisiert). */
export const animationStatus = signal<ReadonlyMap<string, ClipStatus>>(new Map())

/** Änderungen durch Lua-Skripte (Tempo, Wiederholung …); werden nicht gespeichert. */
const luaOverrides = new Map<string, Partial<AnimationSettings>>()

export function settingsOf(id: string): AnimationSettings {
  const base = rig.peek().animations?.[id] ?? DEFAULT_ANIMATION_SETTINGS
  const lua = luaOverrides.get(id)
  return lua ? { ...base, ...lua } : base
}

function overrideFromLua(id: string, patch: Partial<AnimationSettings>): void {
  luaOverrides.set(id, { ...luaOverrides.get(id), ...patch })
}

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

/** Befehle aus Lua (`animations.model.x:play()` …). */
export function luaAnimationCommand(command: string, id: string, argument: unknown): unknown {
  const clip = animationClips.peek().find((c) => c.id === id)
  if (!clip) return undefined
  switch (command) {
    case 'play':
      animationPlayer.play(id)
      return undefined
    case 'stop':
      animationPlayer.stop(id)
      return undefined
    case 'pause':
      animationPlayer.pause(id)
      return undefined
    case 'restart':
      animationPlayer.restart(id)
      return undefined
    case 'state': {
      const state = animationPlayer.stateOf(id)
      return state === 'playing' ? 'PLAYING' : state === 'paused' ? 'PAUSED' : 'STOPPED'
    }
    case 'speed':
      overrideFromLua(id, { speed: clampNumber(argument, 0, 10, 1) })
      return undefined
    case 'getSpeed':
      return settingsOf(id).speed
    case 'loop':
      if (LOOP_MODES.includes(argument as LoopMode)) overrideFromLua(id, { loop: argument as LoopMode })
      return undefined
    case 'getLoop':
      return settingsOf(id).loop ?? clip.loop
    case 'blend':
      overrideFromLua(id, { blend: clampNumber(argument, 0, 10, 1) })
      return undefined
    case 'getBlend':
      return settingsOf(id).blend * clip.blend
    case 'time':
      animationPlayer.setTime(clip, clampNumber(argument, 0, 1e6, 0))
      return undefined
    case 'getTime':
      return animationPlayer.status(clip, settingsOf(id)).time
    case 'override':
      overrideFromLua(id, { override: argument === true })
      return undefined
    case 'getOverride':
      return settingsOf(id).override ?? clip.override
    case 'getLength':
      return clip.length
    default:
      return undefined
  }
}

export function updateAnimationSettings(id: string, patch: Partial<AnimationSettings>): void {
  const current = rig.peek()
  // Ohne Lua-Änderungen speichern
  const animations = { ...current.animations, [id]: { ...(current.animations?.[id] ?? DEFAULT_ANIMATION_SETTINGS), ...patch } }
  updateRig({ ...current, animations })
}

export function playAnimation(id: string): void {
  animationPlayer.play(id)
}

export function pauseAnimation(id: string): void {
  animationPlayer.pause(id)
}

export function stopAnimation(id: string): void {
  animationPlayer.stop(id)
}

export function restartAnimation(id: string): void {
  animationPlayer.restart(id)
}

export function stopAllAnimations(): void {
  animationPlayer.stopAll()
}

/** Wird vom Bild-Takt aufgerufen: Status für die Oberfläche veröffentlichen. */
export function publishAnimationStatus(): void {
  const clips = animationClips.peek()
  const previous = animationStatus.peek()
  const active = animationPlayer.activeIds()
  if (active.length === 0 && previous.size === 0) return
  const next = new Map<string, ClipStatus>()
  for (const clip of clips) if (active.includes(clip.id)) next.set(clip.id, animationPlayer.status(clip, settingsOf(clip.id)))
  animationStatus.value = next
}

// Sobald die Zuordnung eines Avatars geladen ist: alles stoppen und Autostart-Animationen starten.
effect(() => {
  const key = avatarKey.value
  animationPlayer.stopAll()
  luaOverrides.clear()
  if (!key) return
  for (const clip of animationClips.peek()) if (settingsOf(clip.id).autoplay) animationPlayer.play(clip.id)
})
