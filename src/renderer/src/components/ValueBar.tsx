import type { JSX } from 'preact'

export interface ValueBarProps {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  /** Balken wächst von der Mitte aus (für Werte mit Vorzeichen, z. B. Winkel). */
  readonly centered?: boolean
  readonly text: string
}

/** Kompakter Balken zur Live-Anzeige eines Tracking-Werts. */
export function ValueBar({ label, value, min, max, centered = false, text }: ValueBarProps): JSX.Element {
  const range = max - min || 1
  const position = Math.max(0, Math.min(1, (value - min) / range))
  const style = centered
    ? { left: `${Math.min(position, 0.5) * 100}%`, width: `${Math.abs(position - 0.5) * 100}%` }
    : { left: '0%', width: `${position * 100}%` }
  return (
    <div class="value-bar">
      <span class="value-bar-label" title={label}>
        {label}
      </span>
      <span class={centered ? 'value-bar-track centered' : 'value-bar-track'}>
        <span class="value-bar-fill" style={style} />
      </span>
      <span class="value-bar-text">{text}</span>
    </div>
  )
}
