import type { PoseBuilder } from '../pipeline/pose'
import type { Signals } from '../tracking/signals'
import { LOOP_MODES, sampleTrack, type AnimationClip, type LoopMode } from './clip'

/**
 * Spielt Blockbench-Animationen ab und addiert sie zur Pose.
 *
 * Umrechnung Blockbench → unser Raum (Blockbench zeigt Animationen im Bedrock-Stil an:
 * Drehung um X und Y sowie Verschiebung in X sind umgekehrt; dazu kommt die 180°-Drehung
 * zwischen den Räumen): Drehung [x, y, z] → [x, −y, −z], Verschiebung [x, y, z] → [x, y, −z],
 * Skalierung unverändert.
 */

export type PlayState = 'playing' | 'paused' | 'stopped'

export interface AnimationTrigger {
  /** Signal, z. B. „mouth.smile“. */
  readonly source: string
  readonly threshold: number
  /** `while`: läuft, solange das Signal darüber liegt; `start`: startet bei jedem Überschreiten neu. */
  readonly mode: 'while' | 'start'
}

/** Einstellungen pro Animation; werden mit der Zuordnung des Avatars gespeichert. */
export interface AnimationSettings {
  /** Beim Laden des Avatars automatisch starten. */
  readonly autoplay: boolean
  /** Tempo-Faktor (0…4). */
  readonly speed: number
  /** Stärke 0…1 (zusätzlich zum Wert aus Blockbench). */
  readonly blend: number
  /** Eigener Loop-Modus oder null = wie in Blockbench. */
  readonly loop: LoopMode | null
  readonly trigger: AnimationTrigger | null
  /** Nur zur Laufzeit (Lua `setOverride`): ersetzt den Wert aus Blockbench. */
  readonly override?: boolean
}

export const DEFAULT_ANIMATION_SETTINGS: AnimationSettings = { autoplay: false, speed: 1, blend: 1, loop: null, trigger: null }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const clampNum = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/** Liest gespeicherte Einstellungen robust (Unbekanntes wird verworfen). */
export function parseAnimationSettings(value: unknown): Record<string, AnimationSettings> {
  const result: Record<string, AnimationSettings> = {}
  if (!isRecord(value)) return result
  for (const [id, raw] of Object.entries(value).slice(0, 500)) {
    if (!isRecord(raw) || id.length > 200) continue
    const t = raw['trigger']
    result[id] = {
      autoplay: raw['autoplay'] === true,
      speed: clampNum(raw['speed'], 0, 4, 1),
      blend: clampNum(raw['blend'], 0, 1, 1),
      loop: LOOP_MODES.includes(raw['loop'] as LoopMode) ? (raw['loop'] as LoopMode) : null,
      trigger:
        isRecord(t) && typeof t['source'] === 'string'
          ? { source: t['source'].slice(0, 60), threshold: clampNum(t['threshold'], -90, 90, 0.5), mode: t['mode'] === 'start' ? 'start' : 'while' }
          : null
    }
  }
  return result
}

interface ClipState {
  state: PlayState
  /** Laufzeit seit dem Start (inkl. Startverzögerung), bereits mit dem Tempo verrechnet. */
  elapsed: number
}

export interface ClipStatus {
  readonly state: PlayState
  /** Zeit innerhalb der Animation (Sekunden). */
  readonly time: number
}

/** Zeit innerhalb der Animation oder null, wenn sie (noch/schon) nichts anzeigt. */
export function clipTime(clip: AnimationClip, loop: LoopMode, elapsed: number): { time: number | null; finished: boolean } {
  const local = elapsed - clip.startDelay
  if (local < 0) return { time: null, finished: false }
  if (loop === 'loop') {
    const period = clip.length + clip.loopDelay
    if (period <= 0) return { time: 0, finished: false }
    return { time: Math.min(local % period, clip.length), finished: false }
  }
  if (local >= clip.length) return loop === 'hold' ? { time: clip.length, finished: false } : { time: null, finished: true }
  return { time: local, finished: false }
}

export interface FiredTimeline {
  readonly clipId: string
  readonly script: string
}

/** Timeline-Einträge, deren Zeitpunkt zwischen zwei Abspielständen liegt (auch über Schleifen hinweg). */
export function crossedTimeline(clip: AnimationClip, loop: LoopMode, elapsedBefore: number, elapsedAfter: number): string[] {
  const a = elapsedBefore - clip.startDelay
  const b = elapsedAfter - clip.startDelay
  if (b < 0 || b <= a) return []
  const atStart = elapsedBefore === 0
  const reached = (abs: number): boolean => (abs > a || (atStart && abs === Math.max(a, 0))) && abs <= b
  const out: string[] = []
  if (loop === 'loop') {
    const period = clip.length + clip.loopDelay
    if (period <= 0) return []
    const first = Math.floor(Math.max(a, 0) / period)
    const last = Math.min(first + 8, Math.floor(b / period))
    for (let cycle = first; cycle <= last; cycle++) {
      for (const entry of clip.timeline) if (entry.time <= clip.length && reached(cycle * period + entry.time)) out.push(entry.script)
    }
    return out
  }
  for (const entry of clip.timeline) if (entry.time <= clip.length && reached(entry.time)) out.push(entry.script)
  return out
}

export class AnimationPlayer {
  private readonly states = new Map<string, ClipState>()

  play(id: string): void {
    const current = this.states.get(id)
    if (current?.state === 'paused') current.state = 'playing'
    else if (current?.state !== 'playing') this.states.set(id, { state: 'playing', elapsed: 0 })
  }

  /** Von vorn beginnen (auch wenn sie gerade läuft). */
  restart(id: string): void {
    this.states.set(id, { state: 'playing', elapsed: 0 })
  }

  pause(id: string): void {
    const current = this.states.get(id)
    if (current?.state === 'playing') current.state = 'paused'
  }

  stop(id: string): void {
    this.states.delete(id)
  }

  stopAll(): void {
    this.states.clear()
  }

  stateOf(id: string): PlayState {
    return this.states.get(id)?.state ?? 'stopped'
  }

  /** Spielende bzw. pausierte Animationen. */
  activeIds(): string[] {
    return [...this.states.keys()]
  }

  status(clip: AnimationClip, settings: AnimationSettings): ClipStatus {
    const state = this.states.get(clip.id)
    if (!state) return { state: 'stopped', time: 0 }
    return { state: state.state, time: clipTime(clip, settings.loop ?? clip.loop, state.elapsed).time ?? 0 }
  }

  /** Springt an eine Stelle der Animation (Sekunden ab Beginn, ohne Startverzögerung). */
  setTime(clip: AnimationClip, time: number): void {
    const state = this.states.get(clip.id)
    if (state) state.elapsed = Math.max(0, time) + clip.startDelay
    else this.states.set(clip.id, { state: 'paused', elapsed: Math.max(0, time) + clip.startDelay })
  }

  /**
   * Zeit voranschreiten lassen; „once“-Animationen enden von selbst.
   * Liefert die dabei erreichten Timeline-Skripte (für die Lua-Laufzeit).
   */
  update(dtSec: number, clips: readonly AnimationClip[], settingsOf: (id: string) => AnimationSettings): FiredTimeline[] {
    const fired: FiredTimeline[] = []
    for (const clip of clips) {
      const state = this.states.get(clip.id)
      if (!state || state.state !== 'playing') continue
      const settings = settingsOf(clip.id)
      const loop = settings.loop ?? clip.loop
      const before = state.elapsed
      state.elapsed += dtSec * settings.speed
      if (clip.timeline.length > 0) for (const script of crossedTimeline(clip, loop, before, state.elapsed)) fired.push({ clipId: clip.id, script })
      if (clipTime(clip, loop, state.elapsed).finished) this.states.delete(clip.id)
    }
    // Animationen, die es nicht mehr gibt (Avatar gewechselt), vergessen.
    if (this.states.size > 0) {
      const ids = new Set(clips.map((c) => c.id))
      for (const id of this.states.keys()) if (!ids.has(id)) this.states.delete(id)
    }
    return fired
  }

  /** Addiert alle aktiven Animationen (gewichtet) zur Pose. */
  apply(
    pose: PoseBuilder,
    clips: readonly AnimationClip[],
    settingsOf: (id: string) => AnimationSettings,
    lifeTime: number,
    /** Faktor für Verschiebungen pro Teil (Chibi-Modus). */
    positionScale?: (partId: string) => readonly [number, number, number] | undefined
  ): void {
    const overridden = new Set<string>()
    for (const clip of clips) {
      const state = this.states.get(clip.id)
      if (!state) continue
      const settings = settingsOf(clip.id)
      const { time } = clipTime(clip, settings.loop ?? clip.loop, state.elapsed)
      if (time === null) continue
      const weight = clip.blend * settings.blend
      if (weight === 0) continue
      const vars = { animTime: time, lifeTime }
      for (const track of clip.tracks) {
        const v = sampleTrack(track, time, vars)
        const part = pose.part(track.partId)
        if ((settings.override ?? clip.override) && track.channel !== 'scale') {
          // Override: Tracking/Leerlauf für diesen Kanal ersetzen (einmal pro Teil und Kanal).
          const key = `${track.partId}/${track.channel}`
          if (!overridden.has(key)) {
            overridden.add(key)
            const target = track.channel === 'rotation' ? part.rotation : part.position
            target[0] = 0
            target[1] = 0
            target[2] = 0
          }
        }
        switch (track.channel) {
          case 'rotation':
            part.rotation[0] += v[0] * weight
            part.rotation[1] -= v[1] * weight
            part.rotation[2] -= v[2] * weight
            break
          case 'position': {
            const k = positionScale?.(track.partId) ?? [1, 1, 1]
            part.position[0] += v[0] * weight * k[0]
            part.position[1] += v[1] * weight * k[1]
            part.position[2] -= v[2] * weight * k[2]
            break
          }
          case 'scale':
            for (let i = 0; i < 3; i++) part.scale[i] = part.scale[i]! * (1 + (v[i]! - 1) * weight)
            break
        }
      }
    }
  }
}

/** Zustand der Auslöser (letzter Wert über der Schwelle). */
export type TriggerMemory = Map<string, boolean>

/** Startet/stoppt Animationen anhand ihrer Auslöser-Signale (mit kleiner Hysterese gegen Flackern). */
export function evaluateTriggers(
  player: AnimationPlayer,
  clips: readonly AnimationClip[],
  settingsOf: (id: string) => AnimationSettings,
  signals: Signals,
  memory: TriggerMemory
): void {
  for (const clip of clips) {
    const trigger = settingsOf(clip.id).trigger
    if (!trigger) continue
    const value = signals[trigger.source] ?? 0
    const wasAbove = memory.get(clip.id) ?? false
    const above = wasAbove ? value >= trigger.threshold - 0.05 : value >= trigger.threshold
    memory.set(clip.id, above)
    if (trigger.mode === 'while') {
      if (above && player.stateOf(clip.id) === 'stopped') player.play(clip.id)
      else if (!above && wasAbove) player.stop(clip.id)
    } else if (above && !wasAbove) {
      player.restart(clip.id)
    }
  }
}
