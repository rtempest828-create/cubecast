import { AmbientLight, Box3, Color, DirectionalLight, MathUtils, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three'
import { DEFAULT_OUTPUT_SETTINGS, deserializeImage, deserializeModel, deserializePose, presetFrame, type OutputMessage, type OutputSettings } from '@core/output/protocol'
import { AvatarObject } from '@render/avatar-object'

/**
 * Ausgabeseite für OBS (Browserquelle) und das Ausgabefenster. Zeigt nur, was die App
 * über den lokalen Ausgabe-Server sendet; transparenter Hintergrund möglich.
 */

const params = new URLSearchParams(location.search)
const source = params.get('source') ?? ''
if (params.get('window') === '1') document.body.classList.add('window')

const canvas = document.getElementById('view') as HTMLCanvasElement
const status = document.getElementById('status') as HTMLElement
const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
const scene = new Scene()
scene.add(new AmbientLight(0xffffff, 2.2))
const key = new DirectionalLight(0xffffff, 1.3)
key.position.set(0.4, 1, 0.9)
scene.add(key)
const fill = new DirectionalLight(0xffffff, 0.4)
fill.position.set(-0.8, 0.2, -0.5)
scene.add(fill)
const camera = new PerspectiveCamera(30, 1, 0.5, 2000)

let avatar: AvatarObject | null = null
let bounds = { minY: 0, maxY: 32, radius: 16 }
let settings: OutputSettings = DEFAULT_OUTPUT_SETTINGS

function applyBackground(): void {
  if (settings.background === 'transparent') {
    scene.background = null
    renderer.setClearColor(0x000000, 0)
  } else {
    const color = new Color(settings.background === 'green' ? '#00ff00' : settings.color)
    scene.background = color
    renderer.setClearColor(color, 1)
  }
}

function applyCamera(): void {
  const aspect = camera.aspect
  if (settings.camera === 'custom' && settings.customCamera) {
    const c = settings.customCamera
    camera.fov = c.fov
    const target = new Vector3(...c.target)
    const offset = new Vector3(...c.position).sub(target).divideScalar(settings.zoom)
    camera.position.copy(target).add(offset)
    camera.lookAt(target)
  } else {
    const preset = settings.camera === 'custom' ? 'half' : settings.camera
    const frame = presetFrame(preset, bounds)
    camera.fov = 30
    const vertical = MathUtils.degToRad(camera.fov / 2)
    // Bei schmalen (Hochkant-)Ausgaben muss die Figur auch in der Breite passen.
    const frameWidth = Math.min(bounds.radius * 2, frame.height) * 1.1
    const height = Math.max(frame.height, frameWidth / Math.max(aspect, 0.1))
    const distance = height / 2 / Math.tan(vertical) / settings.zoom
    const angle = MathUtils.degToRad(settings.angle)
    camera.position.set(Math.sin(angle) * distance, frame.centerY, Math.cos(angle) * distance)
    camera.lookAt(0, frame.centerY, 0)
  }
  camera.updateProjectionMatrix()
}

function resize(): void {
  const width = Math.max(1, window.innerWidth)
  const height = Math.max(1, window.innerHeight)
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  applyCamera()
}
window.addEventListener('resize', resize)

function setModel(message: Extract<OutputMessage, { type: 'model' }>): void {
  avatar?.dispose()
  avatar = new AvatarObject(deserializeModel(message.model))
  avatar.setOriginVisible('vanilla-layer', settings.outerLayer)
  scene.add(avatar.root)
  const box = new Box3().setFromObject(avatar.root)
  if (!box.isEmpty()) {
    const size = box.getSize(new Vector3())
    bounds = { minY: box.min.y, maxY: box.max.y, radius: Math.max(size.x, size.z) / 2 }
  }
  applyCamera()
}

function handle(message: OutputMessage): void {
  switch (message.type) {
    case 'model':
      setModel(message)
      break
    case 'pose':
      avatar?.applyPose(deserializePose(message.parts))
      break
    case 'texture':
      avatar?.updateTexture(message.id, deserializeImage(message.width, message.height, message.data))
      break
    case 'settings':
      settings = message.settings
      avatar?.setOriginVisible('vanilla-layer', settings.outerLayer)
      applyBackground()
      applyCamera()
      break
  }
}

function connect(): void {
  const events = new EventSource(`${source}/events`)
  events.onopen = () => (status.hidden = true)
  events.onerror = () => {
    status.hidden = false
    status.textContent = 'Warte auf CubeCast …'
  }
  events.onmessage = (event: MessageEvent<string>) => {
    try {
      handle(JSON.parse(event.data) as OutputMessage)
    } catch (error) {
      console.warn('[Ausgabe] Nachricht fehlerhaft:', error)
    }
  }
}

applyBackground()
resize()
connect()
renderer.setAnimationLoop(() => renderer.render(scene, camera))
