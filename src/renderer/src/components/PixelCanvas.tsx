import type { JSX } from 'preact'
import { useEffect, useRef } from 'preact/hooks'
import type { RgbaImage } from '@core/image/rgba-image'

/** Zeigt ein Bild pixelgenau (per CSS vergrößert, ohne Glättung). */
export function PixelCanvas({ image, className }: { readonly image: RgbaImage; readonly className?: string }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.width = image.width
    canvas.height = image.height
    context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  }, [image])

  return <canvas ref={canvasRef} class={className ? `pixel-canvas ${className}` : 'pixel-canvas'} />
}
