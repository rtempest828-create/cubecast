import { effect } from '@preact/signals'
import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import type { CellRect } from '@core/face/face-layout'
import { featureAt } from '@core/face/face-layout'
import { FACE_PART_IDS } from '@core/roles/rig'
import { Viewport } from '@render/viewport'
import { t } from '@shared/i18n'
import { DebugHud } from '../debug/DebugHud'
import { attachRuntime } from '../runtime/runtime'
import { avatarModel, pushToast, showOuterLayer } from '../state/app-state'
import { clearSelection, debugHidden, debugMode, debugOptions, selectCube, selection, selectPart, soloParts } from '../state/debug-state'
import { setCameraProvider } from '../state/output-state'
import { faceLayout, faceVariants } from '../state/rig-state'

/** Ab dieser Mausbewegung (px) gilt ein Klick als Kameradrehung, nicht als Auswahl. */
const CLICK_TOLERANCE = 5

const FEATURE_PARTS = {
  rightEye: FACE_PART_IDS.rightEye,
  leftEye: FACE_PART_IDS.leftEye,
  rightBrow: FACE_PART_IDS.rightBrow,
  leftBrow: FACE_PART_IDS.leftBrow,
  mouth: FACE_PART_IDS.mouth
} as const

/** Rechteck eines virtuellen Gesichtsteils (zum Hervorheben auf dem Overlay). */
function faceRectOf(partId: string): CellRect | null {
  const layout = faceLayout.peek()
  const variants = faceVariants.peek()
  switch (partId) {
    case FACE_PART_IDS.rightEye:
      return layout.rightEye
    case FACE_PART_IDS.leftEye:
      return layout.leftEye
    case FACE_PART_IDS.rightBrow:
      return layout.rightBrow
    case FACE_PART_IDS.leftBrow:
      return layout.leftBrow
    case FACE_PART_IDS.mouth:
      return layout.mouth
    case FACE_PART_IDS.rightPupil:
      return variants.pupils.right ? { ...variants.pupils.right, w: 1, h: 1 } : null
    case FACE_PART_IDS.leftPupil:
      return variants.pupils.left ? { ...variants.pupils.left, w: 1, h: 1 } : null
    default:
      return null
  }
}

/** Bei Klick aufs Gesichts-Overlay das getroffene Merkmal (Pupille, Auge, Braue, Mund) wählen. */
function overlayFeature(uv: readonly [number, number] | null): string {
  if (!uv) return FACE_PART_IDS.overlay
  const x = Math.min(7, Math.max(0, Math.floor(uv[0] * 8)))
  const y = Math.min(7, Math.max(0, Math.floor(uv[1] * 8)))
  const { pupils } = faceVariants.peek()
  if (pupils.right && pupils.right.x === x && pupils.right.y === y) return FACE_PART_IDS.rightPupil
  if (pupils.left && pupils.left.x === x && pupils.left.y === y) return FACE_PART_IDS.leftPupil
  const feature = featureAt(faceLayout.peek(), x, y)
  return feature ? FEATURE_PARTS[feature] : FACE_PART_IDS.overlay
}

export function ViewportView(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let viewport: Viewport
    try {
      viewport = new Viewport(canvas)
    } catch (error) {
      console.error('[Viewport] WebGL-Initialisierung fehlgeschlagen:', error)
      pushToast('error', t('error.webgl'))
      return
    }
    const stops = [
      effect(() => viewport.setAvatar(avatarModel.value)),
      effect(() => viewport.setOuterLayerVisible(showOuterLayer.value)),
      effect(() => {
        const active = debugMode.value
        viewport.setDebugVisibility(active ? debugHidden.value : new Set(), active ? soloParts.value : new Set())
        viewport.setDebugOptions(active ? debugOptions.value : { wireframe: false, pivots: false })
      }),
      effect(() => {
        const { parts, cubes } = selection.value
        // Layout-Änderungen sollen die Markierung mitziehen.
        void faceLayout.value
        if (!debugMode.value) {
          viewport.setHighlight(new Set(), new Set(), [])
          return
        }
        const rects = [...parts].map(faceRectOf).filter((r): r is CellRect => r !== null)
        viewport.setHighlight(parts, cubes, rects)
      })
    ]
    const detachRuntime = attachRuntime(viewport)
    setCameraProvider(() => viewport.getCameraState())

    // Klick-Auswahl im Debug-Modus (Ziehen dreht weiterhin die Kamera).
    let down: { x: number; y: number } | null = null
    const onDown = (event: PointerEvent): void => {
      down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null
    }
    const onUp = (event: PointerEvent): void => {
      if (!down || !debugMode.peek()) return
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
      down = null
      if (moved > CLICK_TOLERANCE) return
      const additive = event.ctrlKey || event.metaKey || event.shiftKey
      const hit = viewport.pick(event.clientX, event.clientY)
      if (!hit) {
        if (!additive) clearSelection()
        return
      }
      // Alt+Klick wählt den einzelnen Würfel, sonst das Teil.
      if (event.altKey) selectCube(hit.cubeId, additive)
      else selectPart(hit.partId === FACE_PART_IDS.overlay ? overlayFeature(hit.uv) : hit.partId, additive)
    }
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      detachRuntime()
      setCameraProvider(null)
      stops.forEach((stop) => stop())
      viewport.dispose()
    }
  }, [])

  return (
    <main class="viewport">
      <canvas ref={canvasRef} />
      {debugMode.value && <DebugHud />}
      <div class="viewport-hint">{t('viewport.hint')}</div>
    </main>
  )
}
