/** Lua-Dateien werden von Vite/Vitest als Text eingebunden (`import source from './x.lua?raw'`). */
declare module '*.lua?raw' {
  const source: string
  export default source
}
