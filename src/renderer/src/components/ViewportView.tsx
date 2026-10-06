import { effect } from '@preact/signals'
import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import { Viewport } from '@render/viewport'
import { t } from '@shared/i18n'
import { attachRuntime } from '../runtime/runtime'
import { avatarModel, pushToast, showOuterLayer } from '../state/app-state'

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
    const stopAvatar = effect(() => viewport.setAvatar(avatarModel.value))
    const stopLayer = effect(() => viewport.setOuterLayerVisible(showOuterLayer.value))
    const detachRuntime = attachRuntime(viewport)
    return () => {
      detachRuntime()
      stopAvatar()
      stopLayer()
      viewport.dispose()
    }
  }, [])

  return (
    <main class="viewport">
      <canvas ref={canvasRef} />
      <div class="viewport-hint">{t('viewport.hint')}</div>
    </main>
  )
}
