/**
 * Ausdrücke in Keyframe-Werten, z. B. `math.sin(time * 4) * 10`.
 *
 * Figura wertet solche Werte als **Lua** aus (Winkelfunktionen im Bogenmaß), Blockbench als
 * **Molang** (Winkelfunktionen in Grad, `q.anim_time`). Dieser kleine Auswerter versteht die
 * gemeinsame Teilmenge beider Sprachen und rechnet je nach Dialekt. Ab M5c übernimmt für
 * Figura-Avatare die echte Lua-Laufzeit.
 */

export type ExpressionDialect = 'lua' | 'molang'

type Value = number | boolean

export interface ExpressionVars {
  /** Zeit innerhalb der Animation in Sekunden. */
  readonly animTime: number
  /** Laufzeit seit Start der App in Sekunden. */
  readonly lifeTime: number
}

export interface CompiledExpression {
  /** Konstanter Wert, falls der Ausdruck nicht von der Zeit abhängt (sonst null). */
  readonly constant: number | null
  evaluate(vars: ExpressionVars): number
  /** Namen, die der Auswerter nicht kennt (werden als 0 gerechnet). */
  readonly unknown: readonly string[]
}

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpressionError'
  }
}

// ---------------------------------------------------------------------------
// Zerlegen

type Token = { kind: 'num'; value: number } | { kind: 'name'; value: string } | { kind: 'op'; value: string } | { kind: 'end' }

const OPERATORS = ['==', '~=', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '^', '<', '>', '(', ')', ',', '?', ':', '!']

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const c = source[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    const number = /^(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?)/i.exec(source.slice(i))
    if (number) {
      tokens.push({ kind: 'num', value: Number(number[0]) })
      i += number[0].length
      continue
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/.exec(source.slice(i))
    if (name) {
      tokens.push({ kind: 'name', value: name[0] })
      i += name[0].length
      continue
    }
    const op = OPERATORS.find((o) => source.startsWith(o, i))
    if (!op) throw new ExpressionError(`Unerwartetes Zeichen „${c}“`)
    tokens.push({ kind: 'op', value: op })
    i += op.length
  }
  tokens.push({ kind: 'end' })
  return tokens
}

// ---------------------------------------------------------------------------
// Syntaxbaum

type Node =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'unary'; op: string; arg: Node }
  | { type: 'binary'; op: string; left: Node; right: Node }
  | { type: 'ternary'; cond: Node; then: Node; else: Node }
  | { type: 'call'; name: string; args: Node[] }

const truthy = (v: Value, dialect: ExpressionDialect): boolean => (dialect === 'lua' ? v !== false : typeof v === 'boolean' ? v : v !== 0)
const num = (v: Value): number => (typeof v === 'boolean' ? (v ? 1 : 0) : v)

class Parser {
  private pos = 0
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos]!
  }
  private isOp(...ops: string[]): boolean {
    const t = this.peek()
    return (t.kind === 'op' || t.kind === 'name') && ops.includes(t.value as string)
  }
  private next(): Token {
    return this.tokens[this.pos++]!
  }
  private nextText(): string {
    const t = this.next()
    return t.kind === 'end' ? '' : String(t.value)
  }
  private expect(op: string): void {
    const t = this.next()
    if (t.kind !== 'op' || t.value !== op) throw new ExpressionError(`„${op}“ erwartet`)
  }

  parse(): Node {
    const node = this.ternary()
    if (this.peek().kind !== 'end') throw new ExpressionError('Unerwartetes Ende des Ausdrucks')
    return node
  }

  private ternary(): Node {
    const cond = this.or()
    if (!this.isOp('?')) return cond
    this.next()
    const then = this.ternary()
    this.expect(':')
    return { type: 'ternary', cond, then, else: this.ternary() }
  }
  private binaryLevel(next: () => Node, ops: string[]): Node {
    let left = next()
    while (this.isOp(...ops)) {
      const op = this.nextText()
      left = { type: 'binary', op, left, right: next() }
    }
    return left
  }
  private or = (): Node => this.binaryLevel(this.and, ['or', '||'])
  private and = (): Node => this.binaryLevel(this.compare, ['and', '&&'])
  private compare = (): Node => this.binaryLevel(this.add, ['==', '~=', '!=', '<', '<=', '>', '>='])
  private add = (): Node => this.binaryLevel(this.mul, ['+', '-'])
  private mul = (): Node => this.binaryLevel(this.unary, ['*', '/', '%'])
  private unary = (): Node => {
    if (this.isOp('-', 'not', '!')) {
      const op = this.nextText()
      return { type: 'unary', op, arg: this.unary() }
    }
    if (this.isOp('+')) {
      this.next()
      return this.unary()
    }
    return this.power()
  }
  private power(): Node {
    const base = this.primary()
    if (!this.isOp('^')) return base
    this.next()
    return { type: 'binary', op: '^', left: base, right: this.unary() }
  }
  private primary(): Node {
    const t = this.next()
    if (t.kind === 'num') return { type: 'num', value: t.value }
    if (t.kind === 'op' && t.value === '(') {
      const inner = this.ternary()
      this.expect(')')
      return inner
    }
    if (t.kind === 'name') {
      if (this.isOp('(')) {
        this.next()
        const args: Node[] = []
        if (!this.isOp(')')) {
          args.push(this.ternary())
          while (this.isOp(',')) {
            this.next()
            args.push(this.ternary())
          }
        }
        this.expect(')')
        return { type: 'call', name: t.value.toLowerCase(), args }
      }
      return { type: 'var', name: t.value }
    }
    throw new ExpressionError('Wert erwartet')
  }
}

// ---------------------------------------------------------------------------
// Auswerten

const DEG = Math.PI / 180

function functions(dialect: ExpressionDialect): Readonly<Record<string, (...a: number[]) => number>> {
  // Molang rechnet Winkel in Grad, Lua im Bogenmaß.
  const toRad = dialect === 'molang' ? DEG : 1
  const fromRad = dialect === 'molang' ? 1 / DEG : 1
  const lerp = (a = 0, b = 0, t = 0): number => a + (b - a) * t
  const clamp = (v = 0, lo = 0, hi = 0): number => Math.min(Math.max(v, lo), hi)
  return {
    'math.sin': (x = 0) => Math.sin(x * toRad),
    'math.cos': (x = 0) => Math.cos(x * toRad),
    'math.tan': (x = 0) => Math.tan(x * toRad),
    'math.asin': (x = 0) => Math.asin(x) * fromRad,
    'math.acos': (x = 0) => Math.acos(x) * fromRad,
    'math.atan': (y = 0, x?: number) => (x === undefined ? Math.atan(y) : Math.atan2(y, x)) * fromRad,
    'math.atan2': (y = 0, x = 1) => Math.atan2(y, x) * fromRad,
    'math.abs': (x = 0) => Math.abs(x),
    'math.floor': (x = 0) => Math.floor(x),
    'math.ceil': (x = 0) => Math.ceil(x),
    'math.round': (x = 0) => Math.round(x),
    'math.trunc': (x = 0) => Math.trunc(x),
    'math.sqrt': (x = 0) => Math.sqrt(x),
    'math.exp': (x = 0) => Math.exp(x),
    'math.log': (x = 0, base?: number) => (base === undefined ? Math.log(x) : Math.log(x) / Math.log(base)),
    'math.ln': (x = 0) => Math.log(x),
    'math.pow': (a = 0, b = 0) => a ** b,
    'math.min': (...a) => Math.min(...a),
    'math.max': (...a) => Math.max(...a),
    'math.fmod': (a = 0, b = 1) => a % b,
    'math.mod': (a = 0, b = 1) => a % b,
    'math.sign': (x = 0) => Math.sign(x),
    'math.clamp': clamp,
    'math.lerp': lerp,
    'math.random': (a?: number, b?: number) => (a === undefined ? Math.random() : b === undefined ? 1 + Math.floor(Math.random() * a) : a + Math.random() * (b - a)),
    'math.random_integer': (a = 0, b = 0) => Math.floor(a + Math.random() * (b - a + 1)),
    'math.die_roll': (n = 0, lo = 0, hi = 0) => Array.from({ length: Math.max(0, Math.floor(n)) }, () => lo + Math.random() * (hi - lo)).reduce((s, v) => s + v, 0),
    'math.hermite_blend': (t = 0) => 3 * t * t - 2 * t * t * t,
    'math.min_angle': (a = 0) => ((((a + 180) % 360) + 360) % 360) - 180
  }
}

const CONSTANTS: Readonly<Record<string, number>> = { 'math.pi': Math.PI, 'math.huge': Infinity, 'math.e': Math.E }

/** Zeit-Variablen beider Dialekte (Molang: `q.`/`query.`). */
function timeVariable(name: string): ((vars: ExpressionVars) => number) | null {
  switch (name.toLowerCase()) {
    case 'time':
    case 'anim_time':
    case 'q.anim_time':
    case 'query.anim_time':
      return (v) => v.animTime
    case 'q.life_time':
    case 'query.life_time':
    case 'world_time':
      return (v) => v.lifeTime
    default:
      return null
  }
}

type Evaluator = (vars: ExpressionVars) => Value

function build(node: Node, dialect: ExpressionDialect, unknown: Set<string>): Evaluator {
  switch (node.type) {
    case 'num':
      return () => node.value
    case 'var': {
      if (node.name === 'true') return () => true
      if (node.name === 'false' || node.name === 'nil') return () => false
      const constant = CONSTANTS[node.name.toLowerCase()]
      if (constant !== undefined) return () => constant
      const time = timeVariable(node.name)
      if (time) return time
      unknown.add(node.name)
      return () => 0
    }
    case 'unary': {
      const arg = build(node.arg, dialect, unknown)
      return node.op === '-' ? (v) => -num(arg(v)) : (v) => !truthy(arg(v), dialect)
    }
    case 'ternary': {
      const [c, a, b] = [build(node.cond, dialect, unknown), build(node.then, dialect, unknown), build(node.else, dialect, unknown)]
      return (v) => (truthy(c(v), dialect) ? a(v) : b(v))
    }
    case 'call': {
      const fn = functions(dialect)[node.name]
      const args = node.args.map((a) => build(a, dialect, unknown))
      if (!fn) {
        unknown.add(`${node.name}()`)
        return () => 0
      }
      return (v) => fn(...args.map((a) => num(a(v))))
    }
    case 'binary': {
      const [l, r] = [build(node.left, dialect, unknown), build(node.right, dialect, unknown)]
      switch (node.op) {
        case '+':
          return (v) => num(l(v)) + num(r(v))
        case '-':
          return (v) => num(l(v)) - num(r(v))
        case '*':
          return (v) => num(l(v)) * num(r(v))
        case '/':
          return (v) => num(l(v)) / num(r(v))
        case '%':
          // Lua: Ergebnis hat das Vorzeichen des Divisors
          return (v) => {
            const a = num(l(v))
            const b = num(r(v))
            return dialect === 'lua' ? a - Math.floor(a / b) * b : a % b
          }
        case '^':
          return (v) => num(l(v)) ** num(r(v))
        case '==':
          return (v) => l(v) === r(v)
        case '~=':
        case '!=':
          return (v) => l(v) !== r(v)
        case '<':
          return (v) => num(l(v)) < num(r(v))
        case '<=':
          return (v) => num(l(v)) <= num(r(v))
        case '>':
          return (v) => num(l(v)) > num(r(v))
        case '>=':
          return (v) => num(l(v)) >= num(r(v))
        case 'and':
        case '&&':
          return (v) => {
            const a = l(v)
            return truthy(a, dialect) ? r(v) : a
          }
        default:
          return (v) => {
            const a = l(v)
            return truthy(a, dialect) ? a : r(v)
          }
      }
    }
  }
}

const isConstantNode = (node: Node): boolean => {
  switch (node.type) {
    case 'num':
      return true
    case 'var':
      return node.name === 'true' || node.name === 'false' || node.name === 'nil' || CONSTANTS[node.name.toLowerCase()] !== undefined || timeVariable(node.name) === null
    case 'unary':
      return isConstantNode(node.arg)
    case 'binary':
      return isConstantNode(node.left) && isConstantNode(node.right)
    case 'ternary':
      return isConstantNode(node.cond) && isConstantNode(node.then) && isConstantNode(node.else)
    case 'call':
      return !node.name.startsWith('math.random') && node.name !== 'math.die_roll' && node.args.every(isConstantNode)
  }
}

const ZERO_VARS: ExpressionVars = { animTime: 0, lifeTime: 0 }

/**
 * Übersetzt einen Keyframe-Wert. Leere Werte sind 0. Wirft `ExpressionError`
 * bei Syntaxfehlern (der Aufrufer ersetzt den Wert dann durch 0 und warnt).
 */
export function compileExpression(source: string | number, dialect: ExpressionDialect): CompiledExpression {
  if (typeof source === 'number') return { constant: Number.isFinite(source) ? source : 0, evaluate: () => (Number.isFinite(source) ? source : 0), unknown: [] }
  const text = source.trim().replace(/^return\s+/, '').replace(/;$/, '')
  if (text === '') return { constant: 0, evaluate: () => 0, unknown: [] }
  const plain = Number(text)
  if (Number.isFinite(plain)) return { constant: plain, evaluate: () => plain, unknown: [] }

  const node = new Parser(tokenize(text)).parse()
  const unknown = new Set<string>()
  const evaluator = build(node, dialect, unknown)
  const evaluate = (vars: ExpressionVars): number => {
    const result = num(evaluator(vars))
    return Number.isFinite(result) ? result : 0
  }
  const constant = isConstantNode(node) ? evaluate(ZERO_VARS) : null
  return { constant, evaluate, unknown: [...unknown] }
}
