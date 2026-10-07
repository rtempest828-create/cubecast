import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Raycaster, Scene, Vector2, WebGLRenderer } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CellRect } from '../core/face/face-layout'
import type { RgbaImage } from '../core/image/rgba-image'
import type { AvatarModel } from '../core/model/avatar-model'
import type { Pose } from '../core/pipeline/pose'
import { AvatarObject, type DebugDisplayOptions, type PickResult } from './avatar-object'

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
  private debugHidden: ReadonlySet<string> = new Set()
  private debugSolo: ReadonlySet<string> = new Set()
  private highlight: { parts: ReadonlySet<string>; cubes: ReadonlySet<string>; faceRects: readonly CellRect[] } = {
    parts: new Set(),
    cubes: new Set(),
    faceRects: []
  }
  private debugOptions: DebugDisplayOptions = { wireframe: false, pivots: false }
  private readonly raycaster = new Raycaster()
  private frameCallback: FrameCallback | null = null
  /** Zählt Avatar-Wechsel; wer Texturen setzt, erkennt daran einen Neuaufbau. */
  avatarVersion = 0
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
    this.avatarVersion++
    if (!model) return
    this.avatar = new AvatarObject(model)
    this.avatar.setOriginVisible('vanilla-layer', this.outerLayerVisible)
    this.avatar.setDebugVisibility(this.debugHidden, this.debugSolo)
    this.avatar.setHighlight(this.highlight.parts, this.highlight.cubes, this.highlight.faceRects)
    this.avatar.setDebugOptions(this.debugOptions)
    this.scene.add(this.avatar.root)
  }

  updateTexture(id: string, image: RgbaImage): void {
    this.avatar?.updateTexture(id, image)
  }

  setDebugVisibility(hidden: ReadonlySet<string>, solo: ReadonlySet<string>): void {
    this.debugHidden = hidden
    this.debugSolo = solo
    this.avatar?.setDebugVisibility(hidden, solo)
  }

  setHighlight(parts: ReadonlySet<string>, cubes: ReadonlySet<string>, faceRects: readonly CellRect[]): void {
    this.highlight = { parts, cubes, faceRects }
    this.avatar?.setHighlight(parts, cubes, faceRects)
  }

  setDebugOptions(options: DebugDisplayOptions): void {
    this.debugOptions = options
    this.avatar?.setDebugOptions(options)
  }

  /** Teil unter einer Bildschirmposition (Client-Koordinaten der Maus). */
  pick(clientX: number, clientY: number): PickResult | null {
    if (!this.avatar) return null
    const rect = this.canvas.getBoundingClientRect()
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    return this.avatar.pick(this.raycaster)
  }

  setFrameCallback(callback: FrameCallback | null): void {
    this.frameCallback = callback
  }

  applyPose(pose: Pose): void {
    this.avatar?.applyPose(pose)
  }

  /** Aktuelle Kamera (z. B. um sie für die Ausgabe zu übernehmen). */
  getCameraState(): { position: [number, number, number]; target: [number, number, number]; fov: number } {
    const p = this.camera.position
    const t = this.controls.target
    return { position: [p.x, p.y, p.z], target: [t.x, t.y, t.z], fov: this.camera.fov }
  }

  /** Kamera auf die Standardansicht zurücksetzen. */
  resetCamera(): void {
    this.camera.position.set(22, 26, 62)
    this.controls.target.set(0, 16, 0)
    this.controls.update()
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
