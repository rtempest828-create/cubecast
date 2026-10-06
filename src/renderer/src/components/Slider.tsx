import type { JSX } from 'preact'

export interface SliderProps {
  readonly label: string
  readonly value: number
  readonly min: number
  readonly max: number
  readonly step: number
  /** Anzeige des aktuellen Werts, z. B. „50 %“. */
  readonly format: (value: number) => string
  readonly hint?: string
  readonly onInput: (value: number) => void
}

/** Beschrifteter Schieberegler mit Wertanzeige und optionalem Hinweistext. */
export function Slider({ label, value, min, max, step, format, hint, onInput }: SliderProps): JSX.Element {
  return (
    <label class="slider">
      <span class="slider-head">
        <span>{label}</span>
        <span class="slider-value">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(event) => onInput(Number(event.currentTarget.value))}
      />
      {hint && <span class="hint">{hint}</span>}
    </label>
  )
}
