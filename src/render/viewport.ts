import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { AvatarModel } from '../core/model/avatar-model'
import type { Pose } from '../core/pipeline/pose'
import { AvatarObject } from './avatar-object'

export const EDITOR_BACKGROUND = '#1a1d24'

/** Wird vor jedem gezeichneten Bild aufgerufen (Zeit in ms, `performance.now()`). */
export type FrameCallback = (nowMs: number) => void

/**
 * 3D-Ansicht mit Orbit-Kamera. Kümmert sich um Größe, Render-Schleife und
 * das Austauschen des Avatars; enthält selbst keine App-Logik.
 */
export class Viewport {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(35, 1, 0.5, 2000)
  private readonly controls: OrbitControls
  private readonly resizeObserver: ResizeObserver
  private avatar: AvatarObject | null = null
  private outerLayerVisible = true
  private frameCallback: FrameCallback | null = null
  private lastRenderTime = 0
  /**
   * Obergrenze der Bildrate (0 = Bildschirmfrequenz). Spart GPU-Leistung für Spiele,
   * wenn der Monitor z. B. mit 144 oder 240 Hz läuft.
   */
  maxFps = 60
  private framesThisSecond = 0
  private fpsWindowStart = 0
  /** Gemessene Bildrate der Darstellung (jede halbe Sekunde aktualisiert). */
  renderFps = 0

  /** Wirft, wenn WebGL nicht verfügbar ist. */
  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.scene.background = new Color(EDITOR_BACKGROUND)

    // Weiches Grundlicht plus Führungs- und Fülllicht: Würfelseiten heben sich
    // leicht voneinander ab, wie bei der Entity-Beleuchtung in Minecraft.
    this.scene.add(new AmbientLight(0xffffff, 2.2))
    const key = new DirectionalLight(0xffffff, 1.3)
    key.position.set(0.4, 1, 0.9)
    this.scene.add(key)
    const fill = new DirectionalLight(0xffffff, 0.4)
    fill.position.set(-0.8, 0.2, -0.5)
    this.scene.add(fill)

    this.camera.position.set(22, 26, 62)
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.target.set(0, 16, 0)
    this.controls.enableDamping = true
    this.controls.minDistance = 8
    this.controls.maxDistance = 250
    this.controls.update()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas.parentElement ?? canvas)
    this.resize()
    this.renderer.setAnimationLoop(() => this.frame())
  }

  setAvatar(model: AvatarModel | null): void {
    this.avatar?.dispose()
    this.avatar = null
    if (!model) return
    this.avatar = new AvatarObject(model)
    this.avatar.setOriginVisible('vanilla-layer', this.outerLayerVisible)
    this.scene.add(this.avatar.root)
  }

  setFrameCallback(callback: FrameCallback | null): void {
    this.frameCallback = callback
  }

  applyPose(pose: Pose): void {
    this.avatar?.applyPose(pose)
  }

  setOuterLayerVisible(visible: boolean): void {
    this.outerLayerVisible = visible
    this.avatar?.setOriginVisible('vanilla-layer', visible)
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.avatar?.dispose()
    this.renderer.dispose()
  }

  private resize(): void {
    const host = this.canvas.parentElement ?? this.canvas
    const width = Math.max(1, host.clientWidth)
    const height = Math.max(1, host.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private frame(): void {
    const now = performance.now()
    if (this.maxFps > 0) {
      const interval = 1000 / this.maxFps
      const elapsed = now - this.lastRenderTime
      // 2 ms Toleranz, damit bei 60-Hz-Monitoren trotz Zeitschwankungen kein Bild ausfällt.
      if (elapsed < interval - 2) return
      // Überhang mitnehmen, damit z. B. bei 144 Hz im Mittel wirklich `maxFps` erreicht werden.
      this.lastRenderTime = elapsed > interval ? now - Math.min(elapsed - interval, interval / 2) : now
    } else {
      this.lastRenderTime = now
    }
    this.framesThisSecond++
    if (now - this.fpsWindowStart >= 500) {
      this.renderFps = (this.framesThisSecond * 1000) / (now - this.fpsWindowStart)
      this.framesThisSecond = 0
      this.fpsWindowStart = now
    }
    try {
      this.frameCallback?.(now)
    } catch (error) {
      // Ein Fehler in der Pipeline darf die Darstellung nicht anhalten.
      console.error('[Viewport] Fehler im Frame-Callback:', error)
    }
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
