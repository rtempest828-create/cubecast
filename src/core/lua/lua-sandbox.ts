import type { LuaEngine, LuaFactory } from 'wasmoon'

/**
 * Abgeschottete Lua-5.4-Umgebung (wasmoon/WebAssembly).
 *
 * - kein Datei-, Netzwerk- oder Betriebssystemzugriff (`io`, `os.execute`, `debug`, `package`,
 *   `dofile`, `loadfile` entfernt; `load` nur für Text)
 * - Instruktionslimit pro Aufruf (nativer Zähl-Hook, gilt auch in Koroutinen)
 * - Speicherlimit
 *
 * Alle Aufrufe laufen über `run()` auf dem Haupt-Thread des Lua-Zustands, damit der Hook greift.
 */

/** Alle so viele Lua-Instruktionen wird das Budget geprüft. */
const HOOK_COUNT = 1000
/** Nach Überschreiten noch so viele Hook-Schritte für Fehlermeldung und Traceback. */
const GRACE_STEPS = 20
const LUA_MASK_COUNT = 8

export const LIMIT_MESSAGE = 'Instruktionslimit überschritten'

export class LuaError extends Error {
  constructor(
    message: string,
    readonly limit: boolean
  ) {
    super(message)
    this.name = 'LuaError'
  }
}

const SANDBOX = `
do
  local rawload = load
  local rawcollect = collectgarbage
  load = function(chunk, name, mode, env)
    if type(chunk) ~= 'string' and type(chunk) ~= 'function' then error('load: Text oder Funktion erwartet', 2) end
    return rawload(chunk, name, 't', env)
  end
  loadstring = nil
  dofile, loadfile = nil, nil
  collectgarbage = function(opt)
    if opt == 'count' then return rawcollect('count') end
    return 0
  end
  io, debug, package = nil, nil, nil
  os = { time = os.time, clock = os.clock, date = os.date, difftime = os.difftime }
  string.dump = nil
end
`

export class LuaSandbox {
  private budget = 0
  private granted = 0
  private exceeded = false
  private hookPointer = 0

  private constructor(private readonly engine: LuaEngine) {}

  static async create(factory: LuaFactory, memoryBytes: number): Promise<LuaSandbox> {
    const engine = await factory.createEngine({ openStandardLibs: true, injectObjects: false, enableProxy: false, traceAllocations: true })
    const sandbox = new LuaSandbox(engine)
    sandbox.installHook()
    engine.global.setMemoryMax(memoryBytes)
    return sandbox
  }

  private installHook(): void {
    const global = this.engine.global
    this.hookPointer = global.lua.module.addFunction((L: number) => {
      this.budget--
      if (this.budget >= 0) return
      if (!this.exceeded) {
        this.exceeded = true
        this.budget = GRACE_STEPS
      }
      const thread = global.stateToThread(L)
      thread.pushValue(LIMIT_MESSAGE)
      global.lua.lua_error(L)
    }, 'vii')
    global.lua.lua_sethook(global.address, this.hookPointer, LUA_MASK_COUNT, HOOK_COUNT)
  }

  /** Legt einen JavaScript-Wert (Zahl, Text, Tabelle, Funktion) als globale Variable an. */
  set(name: string, value: unknown): void {
    this.engine.global.set(name, value)
  }

  /** Bindet die Sandbox-Einschränkungen (nach dem Laden der eigenen Bibliotheken aufrufen). */
  lockDown(): void {
    this.run(SANDBOX, '=sandbox', 1_000_000)
  }

  /**
   * Führt Lua-Code aus und liefert den ersten Rückgabewert.
   * Wirft `LuaError` bei Laufzeitfehlern oder überschrittenem Limit.
   */
  run(code: string, chunkName: string, instructions: number): unknown {
    const global = this.engine.global
    this.budget = Math.max(1, Math.ceil(instructions / HOOK_COUNT))
    this.granted = this.budget
    this.exceeded = false
    const top = global.getTop()
    try {
      global.loadString(code, chunkName)
      const result = global.runSync()
      return result[0]
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new LuaError(message, this.exceeded || message.includes(LIMIT_MESSAGE))
    } finally {
      global.setTop(top)
    }
  }

  /** Verbrauchte Instruktionen des letzten Aufrufs (auf 1000 gerundet). */
  get instructionsUsed(): number {
    return Math.max(0, this.granted - Math.max(0, this.budget)) * HOOK_COUNT
  }

  get memoryUsed(): number {
    return this.engine.global.getMemoryUsed()
  }

  close(): void {
    const global = this.engine.global
    try {
      global.lua.lua_sethook(global.address, null, 0, 0)
      global.close()
    } finally {
      if (this.hookPointer) global.lua.module.removeFunction(this.hookPointer)
      this.hookPointer = 0
    }
  }
}
