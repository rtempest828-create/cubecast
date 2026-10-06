import type { JSX } from 'preact'
import { DropOverlay } from './components/DropOverlay'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { ViewportView } from './components/ViewportView'
import { ModelPanel } from './panels/ModelPanel'
import { PlaceholderPanel } from './panels/PlaceholderPanel'
import { TrackingPanel } from './panels/TrackingPanel'
import { activeTab, type TabId } from './state/app-state'

const PANELS: Readonly<Record<TabId, () => JSX.Element>> = {
  model: ModelPanel,
  tracking: TrackingPanel,
  face: () => <PlaceholderPanel title="tab.face" milestone="M3" />,
  physics: () => <PlaceholderPanel title="tab.physics" milestone="M4" />,
  output: () => <PlaceholderPanel title="tab.output" milestone="M6" />,
  settings: () => <PlaceholderPanel title="tab.settings" milestone="M6" />
}

export function App(): JSX.Element {
  const Panel = PANELS[activeTab.value]
  return (
    <div class="app">
      <Sidebar />
      <section class="panel">
        <Panel />
      </section>
      <ViewportView />
      <Toasts />
      <DropOverlay />
    </div>
  )
}
