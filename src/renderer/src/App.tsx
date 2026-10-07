import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { DropOverlay } from './components/DropOverlay'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { ViewportView } from './components/ViewportView'
import { DebugDrawer } from './debug/DebugDrawer'
import { AnimationPanel } from './panels/AnimationPanel'
import { FacePanel } from './panels/FacePanel'
import { ModelPanel } from './panels/ModelPanel'
import { PhysicsPanel } from './panels/PhysicsPanel'
import { OutputPanel } from './panels/OutputPanel'
import { ScriptPanel } from './panels/ScriptPanel'
import { SettingsPanel } from './panels/SettingsPanel'
import './state/hotkey-state'
import { loadAutoProfile } from './state/profile-state'
import { TrackingPanel } from './panels/TrackingPanel'
import { activeTab, type TabId } from './state/app-state'
import { clearSelection, debugMode } from './state/debug-state'
import { toggleChibi } from './state/rig-state'

const PANELS: Readonly<Record<TabId, () => JSX.Element>> = {
  model: ModelPanel,
  tracking: TrackingPanel,
  face: FacePanel,
  physics: PhysicsPanel,
  animations: AnimationPanel,
  script: ScriptPanel,
  output: OutputPanel,
  settings: SettingsPanel
}

export function App(): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey && !event.altKey && event.code === 'KeyK') {
        event.preventDefault()
        toggleChibi()
      } else if (event.key === 'F12') {
        event.preventDefault()
        debugMode.value = !debugMode.peek()
      } else if (event.key === 'Escape' && debugMode.peek()) {
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Profil für den Start (falls in den Einstellungen gewählt)
  useEffect(() => {
    if ('vtuber' in window) void loadAutoProfile()
  }, [])

  const Panel = PANELS[activeTab.value]
  return (
    <div class={debugMode.value ? 'app debug' : 'app'}>
      <Sidebar />
      <section class="panel">
        <Panel />
      </section>
      <ViewportView />
      {debugMode.value && <DebugDrawer />}
      <Toasts />
      <DropOverlay />
    </div>
  )
}
