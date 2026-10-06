import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { DropOverlay } from './components/DropOverlay'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { ViewportView } from './components/ViewportView'
import { DebugDrawer } from './debug/DebugDrawer'
import { FacePanel } from './panels/FacePanel'
import { ModelPanel } from './panels/ModelPanel'
import { PlaceholderPanel } from './panels/PlaceholderPanel'
import { TrackingPanel } from './panels/TrackingPanel'
import { activeTab, type TabId } from './state/app-state'
import { clearSelection, debugMode } from './state/debug-state'

const PANELS: Readonly<Record<TabId, () => JSX.Element>> = {
  model: ModelPanel,
  tracking: TrackingPanel,
  face: FacePanel,
  physics: () => <PlaceholderPanel title="tab.physics" milestone="M4" />,
  output: () => <PlaceholderPanel title="tab.output" milestone="M6" />,
  settings: () => <PlaceholderPanel title="tab.settings" milestone="M6" />
}

export function App(): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'F12') {
        event.preventDefault()
        debugMode.value = !debugMode.peek()
      } else if (event.key === 'Escape' && debugMode.peek()) {
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
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
