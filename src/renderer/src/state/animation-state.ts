import { computed, effect, signal } from '@preact/signals'
import type { AnimationClip } from '@core/animation/clip'
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

export function settingsOf(id: string): AnimationSettings {
  return rig.peek().animations?.[id] ?? DEFAULT_ANIMATION_SETTINGS
}

export function updateAnimationSettings(id: string, patch: Partial<AnimationSettings>): void {
  const current = rig.peek()
  const animations = { ...current.animations, [id]: { ...settingsOf(id), ...patch } }
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
  if (!key) return
  for (const clip of animationClips.peek()) if (settingsOf(clip.id).autoplay) animationPlayer.play(clip.id)
})
