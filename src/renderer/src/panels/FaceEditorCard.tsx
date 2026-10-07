import type { JSX } from 'preact'
import { useState } from 'preact/hooks'
import { CUSTOM_VARIANT_KEYS, fromEdits, hexToRgba, paintCell, rgbaToHex, toEdits, variantEdits, type CustomVariantKey } from '@core/face/face-custom'
import { FACE_CELLS } from '@core/face/face-source'
import type { Rgba } from '@core/image/color'
import { getPixel } from '@core/image/rgba-image'
import { t } from '@shared/i18n'
import { faceSource, generatedFaceVariants, rig, updateFaceSettings } from '../state/rig-state'

const css = (color: Rgba): string => {
  const hex = rgbaToHex(color)
  return `#${hex.slice(1, 7)}${hex.slice(7, 9)}`
}

/**
 * Face-Editor: Augen- und Mundvarianten Zelle für Zelle bemalen.
 * Linksklick = Farbe setzen, Rechtsklick = Zelle auf Original zurück.
 */
export function FaceEditorCard(): JSX.Element {
  const [key, setKey] = useState<CustomVariantKey>('mouth.open')
  const [color, setColor] = useState<Rgba>(0x3a1414ff)
  const grid = faceSource.value.grid
  const custom = rig.value.face.custom ?? {}
  const isCustom = custom[key] !== undefined
  const edits = isCustom ? toEdits(custom[key] ?? []) : variantEdits(generatedFaceVariants.value, key)

  const cells: { x: number; y: number; color: Rgba; edited: boolean }[] = []
  for (let y = 0; y < FACE_CELLS; y++) {
    for (let x = 0; x < FACE_CELLS; x++) {
      const edit = edits.find(([ex, ey]) => ex === x && ey === y)
      cells.push({ x, y, color: edit ? edit[2] : (getPixel(grid, x, y) | 0xff) >>> 0, edited: !!edit })
    }
  }
  // Palette: Farben des Gesichts und der aktuellen Variante
  const palette = [...new Set(cells.map((c) => c.color))].slice(0, 24)

  const save = (next: ReturnType<typeof paintCell>): void => {
    updateFaceSettings({ custom: { ...custom, [key]: fromEdits(next) } })
  }
  const reset = (): void => {
    const rest = { ...custom }
    delete rest[key]
    updateFaceSettings({ custom: rest })
  }

  return (
    <section class="card">
      <h2 class="card-title">{t('faceEditor.section')}</h2>
      <p class="hint">{t('faceEditor.hint')}</p>
      <label class="field">
        <span class="field-label">{t('faceEditor.variant')}</span>
        <select value={key} onChange={(e) => setKey(e.currentTarget.value as CustomVariantKey)}>
          {CUSTOM_VARIANT_KEYS.map((k) => (
            <option key={k} value={k}>
              {t(`faceEditor.key.${k}`)}
              {custom[k] !== undefined ? ` ${t('faceEditor.customMark')}` : ''}
            </option>
          ))}
        </select>
      </label>
      <div class="face-editor">
        <div class="face-editor-grid" onContextMenu={(e) => e.preventDefault()}>
          {cells.map((cell) => (
            <button
              key={`${cell.x},${cell.y}`}
              type="button"
              class={cell.edited ? 'face-editor-cell edited' : 'face-editor-cell'}
              style={{ background: css(cell.color) }}
              title={`${cell.x + 1}/${cell.y + 1}`}
              onMouseDown={(e) => {
                e.preventDefault()
                save(paintCell(edits, cell.x, cell.y, e.button === 2 ? null : color))
              }}
            />
          ))}
        </div>
        <div class="face-editor-tools">
          <label class="field">
            <span class="field-label">{t('faceEditor.color')}</span>
            <input type="color" value={rgbaToHex(color).slice(0, 7)} onInput={(e) => setColor(hexToRgba(`${e.currentTarget.value}ff`) ?? color)} />
          </label>
          <div class="face-editor-palette">
            {palette.map((c) => (
              <button key={c} type="button" class={c === color ? 'swatch active' : 'swatch'} style={{ background: css(c) }} onClick={() => setColor(c)} />
            ))}
          </div>
          <p class="hint">{t('faceEditor.mouse')}</p>
          <div class="button-row">
            <button type="button" class="button" disabled={!isCustom} onClick={reset}>
              {t('faceEditor.reset')}
            </button>
          </div>
          <p class="status-text">{isCustom ? t('faceEditor.isCustom') : t('faceEditor.isAuto')}</p>
        </div>
      </div>
    </section>
  )
}
