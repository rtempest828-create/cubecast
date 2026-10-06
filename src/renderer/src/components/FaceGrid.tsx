import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { CellRect, FaceFeature, FaceLayout } from '@core/face/face-layout'
import { FACE_CELLS } from '@core/face/face-source'
import { getPixel, type RgbaImage } from '@core/image/rgba-image'

/** Farben der Merkmal-Rahmen im Raster. */
export const FEATURE_COLORS: Readonly<Record<FaceFeature, string>> = {
  rightEye: '#4fc3f7',
  leftEye: '#29b6f6',
  rightBrow: '#ffb74d',
  leftBrow: '#ffa726',
  mouth: '#ef5350'
}

function cssColor(rgba: number): string {
  return `rgba(${(rgba >>> 24) & 0xff}, ${(rgba >>> 16) & 0xff}, ${(rgba >>> 8) & 0xff}, ${(rgba & 0xff) / 255})`
}

interface FaceGridProps {
  readonly grid: RgbaImage
  readonly layout: FaceLayout
  readonly active: FaceFeature
  readonly onRect: (feature: FaceFeature, rect: CellRect) => void
}

/** 8 × 8-Raster des Gesichts; durch Ziehen wird das Rechteck des aktiven Merkmals gesetzt. */
export function FaceGrid({ grid, layout, active, onRect }: FaceGridProps): JSX.Element {
  const [drag, setDrag] = useState<{ start: [number, number]; end: [number, number] } | null>(null)

  useEffect(() => {
    if (!drag) return
    const finish = (): void => {
      const x = Math.min(drag.start[0], drag.end[0])
      const y = Math.min(drag.start[1], drag.end[1])
      onRect(active, { x, y, w: Math.abs(drag.start[0] - drag.end[0]) + 1, h: Math.abs(drag.start[1] - drag.end[1]) + 1 })
      setDrag(null)
    }
    window.addEventListener('pointerup', finish, { once: true })
    return () => window.removeEventListener('pointerup', finish)
  }, [drag, active, onRect])

  const cells: JSX.Element[] = []
  for (let y = 0; y < FACE_CELLS; y++) {
    for (let x = 0; x < FACE_CELLS; x++) {
      cells.push(
        <div
          key={`${x}-${y}`}
          class="face-cell"
          style={{ background: cssColor(getPixel(grid, x, y) | 0xff) }}
          onPointerDown={(event) => {
            event.preventDefault()
            setDrag({ start: [x, y], end: [x, y] })
          }}
          onPointerEnter={() => drag && setDrag({ ...drag, end: [x, y] })}
        />
      )
    }
  }

  const rectStyle = (r: CellRect, color: string, dashed: boolean): Record<string, string> => ({
    left: `${(r.x / FACE_CELLS) * 100}%`,
    top: `${(r.y / FACE_CELLS) * 100}%`,
    width: `${(r.w / FACE_CELLS) * 100}%`,
    height: `${(r.h / FACE_CELLS) * 100}%`,
    borderColor: color,
    borderStyle: dashed ? 'dashed' : 'solid'
  })

  const dragRect: CellRect | null = drag
    ? {
        x: Math.min(drag.start[0], drag.end[0]),
        y: Math.min(drag.start[1], drag.end[1]),
        w: Math.abs(drag.start[0] - drag.end[0]) + 1,
        h: Math.abs(drag.start[1] - drag.end[1]) + 1
      }
    : null

  return (
    <div class="face-grid">
      {cells}
      {(Object.keys(FEATURE_COLORS) as FaceFeature[]).map((feature) => {
        const rect = layout[feature]
        if (!rect || (drag && feature === active)) return null
        return <div key={feature} class={feature === active ? 'face-rect active' : 'face-rect'} style={rectStyle(rect, FEATURE_COLORS[feature], false)} />
      })}
      {dragRect && <div class="face-rect active" style={rectStyle(dragRect, FEATURE_COLORS[active], true)} />}
    </div>
  )
}
