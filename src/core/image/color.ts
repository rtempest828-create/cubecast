/** Farbe als 32-Bit-Wert 0xRRGGBBAA (wie in `rgba-image.ts`). */
export type Rgba = number

export function rgbaChannels(color: Rgba): [number, number, number, number] {
  return [(color >>> 24) & 0xff, (color >>> 16) & 0xff, (color >>> 8) & 0xff, color & 0xff]
}

export function rgba(r: number, g: number, b: number, a = 255): Rgba {
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))
  return ((c(r) << 24) | (c(g) << 16) | (c(b) << 8) | c(a)) >>> 0
}

/** Helligkeit 0…255 (wahrgenommen, Rec. 601). */
export function luminance(color: Rgba): number {
  const [r, g, b] = rgbaChannels(color)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Euklidischer RGB-Abstand (0…≈441). */
export function colorDistance(a: Rgba, b: Rgba): number {
  const [ar, ag, ab] = rgbaChannels(a)
  const [br, bg, bb] = rgbaChannels(b)
  return Math.hypot(ar - br, ag - bg, ab - bb)
}

/** Verdunkelt eine Farbe (factor 1 = unverändert, 0 = schwarz). */
export function darken(color: Rgba, factor: number): Rgba {
  const [r, g, b, a] = rgbaChannels(color)
  return rgba(r * factor, g * factor, b * factor, a)
}

/** Lineare Mischung zweier Farben (t = 0 → a, t = 1 → b). */
export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  const ca = rgbaChannels(a)
  const cb = rgbaChannels(b)
  return rgba(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t, ca[3] + (cb[3] - ca[3]) * t)
}

/** Legt `top` (mit Alpha) über die deckende Farbe `bottom`. */
export function alphaOver(bottom: Rgba, top: Rgba): Rgba {
  const alpha = (top & 0xff) / 255
  if (alpha <= 0) return bottom
  const [br, bg, bb] = rgbaChannels(bottom)
  const [tr, tg, tb] = rgbaChannels(top)
  return rgba(br + (tr - br) * alpha, bg + (tg - bg) * alpha, bb + (tb - bb) * alpha, 255)
}
