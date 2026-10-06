import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

/** Gemeinsame Pfad-Aliase für alle Prozesse (spiegeln tsconfig.base.json). */
const alias = {
  '@core': resolve(__dirname, 'src/core'),
  '@shared': resolve(__dirname, 'src/shared'),
  '@render': resolve(__dirname, 'src/render')
}

export default defineConfig({
  main: {
    resolve: { alias }
  },
  preload: {
    resolve: { alias }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
