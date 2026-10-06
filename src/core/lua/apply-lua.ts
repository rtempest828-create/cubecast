import type { PoseBuilder } from '../pipeline/pose'
import type { LuaPartPose } from './figura-runtime'

export interface ApplyLuaOptions {
  /** Der Nutzer hat die Vanilla-Teile selbst festgelegt – Lua-Sichtbarkeit dafür ignorieren. */
  readonly ignoreVanillaVisibility: boolean
}

/**
 * Überträgt die Lua-Änderungen in die Pose (nach Rollen-Treibern und Körper, vor Animationen).
 *
 * Sichtbarkeit: Lua ersetzt die Sichtbarkeit aus dem Modell. Ein Rollen-Treiber, der ein
 * Teil gerade einblendet (z. B. „Augen zu“ beim Blinzeln), hat aber Vorrang vor einem
 * Lua-Ausblenden – so bleibt Face-Tracking wirksam, auch wenn das Skript selbst Ausdrücke steuert.
 */
export function applyLuaPoses(pose: PoseBuilder, poses: readonly LuaPartPose[], options: ApplyLuaOptions): void {
  for (const p of poses) {
    const part = pose.part(p.partId)
    if (p.kind === 'GROUP' || p.kind === 'VANILLA') {
      part.rotation[0] += p.rotation[0]
      part.rotation[1] += p.rotation[1]
      part.rotation[2] += p.rotation[2]
      part.position[0] += p.position[0]
      part.position[1] += p.position[1]
      part.position[2] += p.position[2]
      part.scale[0] *= p.scale[0]
      part.scale[1] *= p.scale[1]
      part.scale[2] *= p.scale[2]
    }
    part.uvOffset[0] += p.uvOffset[0]
    part.uvOffset[1] += p.uvOffset[1]
    if (p.visible === null || (p.kind === 'VANILLA' && options.ignoreVanillaVisibility)) continue
    if (p.visible) {
      part.visible = true
      part.shown = true
    } else if (!part.shown) {
      part.visible = false
    }
  }
}

/** Browser-Tastencode → Minecraft-Tastenname und GLFW-Code (für keybinds und KEY_PRESS). */
export function keyFromBrowser(code: string): { readonly name: string; readonly glfw: number } | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return { name: `key.keyboard.${letter[1]!.toLowerCase()}`, glfw: letter[1]!.charCodeAt(0) }
  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return { name: `key.keyboard.${digit[1]}`, glfw: 48 + Number(digit[1]) }
  const fKey = /^F(\d{1,2})$/.exec(code)
  if (fKey && Number(fKey[1]) <= 25) return { name: `key.keyboard.f${fKey[1]}`, glfw: 289 + Number(fKey[1]) }
  const numpad = /^Numpad(\d)$/.exec(code)
  if (numpad) return { name: `key.keyboard.keypad.${numpad[1]}`, glfw: 320 + Number(numpad[1]) }
  const named: Readonly<Record<string, readonly [string, number]>> = {
    Space: ['space', 32],
    Quote: ['apostrophe', 39],
    Comma: ['comma', 44],
    Minus: ['minus', 45],
    Period: ['period', 46],
    Slash: ['slash', 47],
    Semicolon: ['semicolon', 59],
    Equal: ['equal', 61],
    BracketLeft: ['left.bracket', 91],
    Backslash: ['backslash', 92],
    BracketRight: ['right.bracket', 93],
    Backquote: ['grave.accent', 96],
    Escape: ['escape', 256],
    Enter: ['enter', 257],
    Tab: ['tab', 258],
    Backspace: ['backspace', 259],
    Insert: ['insert', 260],
    Delete: ['delete', 261],
    ArrowRight: ['right', 262],
    ArrowLeft: ['left', 263],
    ArrowDown: ['down', 264],
    ArrowUp: ['up', 265],
    PageUp: ['page.up', 266],
    PageDown: ['page.down', 267],
    Home: ['home', 268],
    End: ['end', 269],
    CapsLock: ['caps.lock', 280],
    ShiftLeft: ['left.shift', 340],
    ControlLeft: ['left.control', 341],
    AltLeft: ['left.alt', 342],
    ShiftRight: ['right.shift', 344],
    ControlRight: ['right.control', 345],
    AltRight: ['right.alt', 346],
    NumpadEnter: ['keypad.enter', 335],
    NumpadAdd: ['keypad.add', 334],
    NumpadSubtract: ['keypad.subtract', 333],
    NumpadMultiply: ['keypad.multiply', 332],
    NumpadDivide: ['keypad.divide', 331],
    NumpadDecimal: ['keypad.decimal', 330]
  }
  const entry = named[code]
  return entry ? { name: `key.keyboard.${entry[0]}`, glfw: entry[1] } : null
}
