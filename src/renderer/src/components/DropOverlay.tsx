import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { t } from '@shared/i18n'
import { loadSkinFromFile } from '../skin/skin-loader'

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false
}

/** Nimmt im ganzen Fenster abgelegte Skin-Dateien an und zeigt beim Ziehen einen Hinweis. */
export function DropOverlay(): JSX.Element | null {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // dragenter/dragleave feuern für jedes Kind-Element; der Zähler verhindert Flackern.
    let depth = 0
    const onEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth++
      setVisible(true)
    }
    const onLeave = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setVisible(false)
    }
    const onOver = (event: DragEvent): void => {
      // Ohne preventDefault würde Electron zur Datei navigieren.
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    }
    const onDrop = (event: DragEvent): void => {
      event.preventDefault()
      depth = 0
      setVisible(false)
      const file = event.dataTransfer?.files[0]
      if (file) void loadSkinFromFile(file)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  if (!visible) return null
  return (
    <div class="drop-overlay">
      <div class="drop-overlay-box">{t('drop.overlay')}</div>
    </div>
  )
}
