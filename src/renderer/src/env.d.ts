/// <reference types="vite/client" />
import type { VtuberApi } from '@shared/ipc'

declare global {
  interface Window {
    /** Vom Preload-Skript bereitgestellt (siehe `src/preload/index.ts`). */
    readonly vtuber: VtuberApi
  }
}

export {}
