// Indicator formulas: a small expression language, parsed here and evaluated bar by bar. It can only do arithmetic
// on price series; there is no eval and no access to anything else, so a formula can't run code. Shared by the
// browser (charts, editor preview) and the server (validation, alerts).
//
//   ema(close, 12) - ema(close, 26)            a value to plot
//   rsi(close, 14) < 30 and close > sma(close, 200)   a rule: true on the bars where it holds
//
// Every expression evaluates to one value per bar; null where there isn't enough history yet. Rules are true where
// the value is non-zero (comparisons give 1 or 0).

export type Bar = { ts: number; o: number; h: number; l: number; c: number; v: number };
export type Series = (number | null)[];

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "call"; name: string; args: Node[]; pos: number }
  | { k: "un"; op: "-" | "not"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node };

export class FormulaError extends Error {
  constructor(message: string, public pos: number) { super(message); }
}

export const VARIABLES = ["open", "high", "low", "close", "volume"] as const;

/** Name, arguments (`n` must be a whole number), and what it gives. Also the reference shown on the Indicators page. */
export const FUNCTIONS: Record<string, { args: string[]; min: number; doc: string }> = {
  sma: { args: ["x", "n"], min: 2, doc: "Simple moving average of x over n bars" },
  ema: { args: ["x", "n"], min: 2, doc: "Exponential moving average of x over n bars" },
  wma: { args: ["x", "n"], min: 2, doc: "Weighted moving average (recent bars count more)" },
  rsi: { args: ["x", "n"], min: 1, doc: "Relative strength index, 0 to 100 (n defaults to 14)" },
  stdev: { args: ["x", "n"], min: 2, doc: "Standard deviation of x over n bars" },
  highest: { args: ["x", "n"], min: 2, doc: "Highest x over the last n bars" },
  lowest: { args: ["x", "n"], min: 2, doc: "Lowest x over the last n bars" },
  sum: { args: ["x", "n"], min: 2, doc: "Sum of x over the last n bars" },
  prev: { args: ["x", "n"], min: 1, doc: "x as it was n bars ago (n defaults to 1)" },
  change: { args: ["x", "n"], min: 1, doc: "x minus x n bars ago (n defaults to 1)" },
  roc: { args: ["x", "n"], min: 2, doc: "Percent change of x over n bars" },
  atr: { args: ["n"], min: 0, doc: "Average true range over n bars (defaults to 14)" },
  stoch: { args: ["n"], min: 0, doc: "Stochastic %K: where the close sits in the n-bar high–low range, 0 to 100" },
  macd: { args: ["x", "fast", "slow"], min: 1, doc: "MACD line: ema(x, fast) − ema(x, slow), defaults 12 and 26" },
  macd_signal: { args: ["x", "fast", "slow", "signal"], min: 1, doc: "Signal line: ema of the MACD line, defaults 12, 26, 9" },
  bb_upper: { args: ["x", "n", "k"], min: 1, doc: "Upper Bollinger band: sma + k × stdev, defaults 20 and 2" },
  bb_lower: { args: ["x", "n", "k"], min: 1, doc: "Lower Bollinger band: sma − k × stdev, defaults 20 and 2" },
  abs: { args: ["x"], min: 1, doc: "Absolute value" },
  min: { args: ["a", "b"], min: 2, doc: "The smaller of a and b" },
  max: { args: ["a", "b"], min: 2, doc: "The larger of a and b" },
  crosses_above: { args: ["a", "b"], min: 2, doc: "True on the bar where a moves from at or below b to above it" },
  crosses_below: { args: ["a", "b"], min: 2, doc: "True on the bar where a moves from at or above b to below it" },
};
const WINDOW_ARGS = new Set(["n", "fast", "slow", "signal"]);
// Own keys only: a name like "constructor" must not reach Object.prototype.
const fnNamed = (name: string) => (Object.hasOwn(FUNCTIONS, name) ? FUNCTIONS[name] : undefined);
const MAX_LENGTH = 300, MAX_DEPTH = 24, MAX_WINDOW = 500;

// ---------------------------------------------------------------- parse

type Tok = { t: "num" | "id" | "op" | "(" | ")" | "," | "end"; v: string; pos: number };

function tokens(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    const rest = src.slice(i);
    const num = rest.match(/^(\d+(\.\d+)?|\.\d+)/);
    if (num) { out.push({ t: "num", v: num[0], pos: i }); i += num[0].length; continue; }
    const id = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (id) { out.push({ t: "id", v: id[0].toLowerCase(), pos: i }); i += id[0].length; continue; }
    const op = rest.match(/^(<=|>=|==|!=|<|>|\+|-|\*|\/)/);
    if (op) { out.push({ t: "op", v: op[0], pos: i }); i += op[0].length; continue; }
    if (ch === "(" || ch === ")" || ch === ",") { out.push({ t: ch, v: ch, pos: i }); i++; continue; }
    throw new FormulaError(`Unexpected "${ch}"`, i);
  }
  out.push({ t: "end", v: "", pos: src.length });
  return out;
}

export function parse(src: string): Node {
  if (!src.trim()) throw new FormulaError("Write a formula", 0);
  if (src.length > MAX_LENGTH) throw new FormulaError(`Keep it under ${MAX_LENGTH} characters`, MAX_LENGTH);
  const ts = tokens(src);
  let p = 0, depth = 0;
  const peek = () => ts[p];
  const next = () => ts[p++];
  const word = (w: string) => peek().t === "id" && peek().v === w;
  const expect = (t: Tok["t"], what: string) => {
    if (peek().t !== t) throw new FormulaError(`Expected ${what}`, peek().pos);
    return next();
  };
  const deeper = <T,>(f: () => T): T => {
    if (++depth > MAX_DEPTH) throw new FormulaError("Formula is nested too deeply", peek().pos);
    try { return f(); } finally { depth--; }
  };

  const or = (): Node => deeper(() => {
    let a = and();
    while (word("or")) { next(); a = { k: "bin", op: "or", a, b: and() }; }
    return a;
  });
  const and = (): Node => {
    let a = not();
    while (word("and")) { next(); a = { k: "bin", op: "and", a, b: not() }; }
    return a;
  };
  const not = (): Node => {
    if (word("not")) { next(); return { k: "un", op: "not", a: not() }; }
    return cmp();
  };
  const cmp = (): Node => {
    const a = add();
    if (peek().t === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(peek().v)) {
      const op = next().v;
      return { k: "bin", op, a, b: add() };
    }
    return a;
  };
  const add = (): Node => {
    let a = mul();
    while (peek().t === "op" && (peek().v === "+" || peek().v === "-")) { const op = next().v; a = { k: "bin", op, a, b: mul() }; }
    return a;
  };
  const mul = (): Node => {
    let a = unary();
    while (peek().t === "op" && (peek().v === "*" || peek().v === "/")) { const op = next().v; a = { k: "bin", op, a, b: unary() }; }
    return a;
  };
  const unary = (): Node => {
    if (peek().t === "op" && peek().v === "-") { next(); return { k: "un", op: "-", a: unary() }; }
    return primary();
  };
  const primary = (): Node => {
    const tk = next();
    if (tk.t === "num") return { k: "num", v: Number(tk.v) };
    if (tk.t === "(") { const e = or(); expect(")", "a closing bracket"); return e; }
    if (tk.t === "id") {
      if (peek().t === "(") {
        const fn = fnNamed(tk.v);
        if (!fn) throw new FormulaError(`Unknown function "${tk.v}"`, tk.pos);
        next();
        const args: Node[] = [];
        if (peek().t !== ")") {
          do { args.push(deeper(or)); } while (peek().t === "," && next());
        }
        expect(")", `a closing bracket after ${tk.v}(…)`);
        if (args.length < fn.min || args.length > fn.args.length)
          throw new FormulaError(`${tk.v} takes ${fn.min === fn.args.length ? fn.min : `${fn.min} to ${fn.args.length}`} values: ${tk.v}(${fn.args.join(", ")})`, tk.pos);
        args.forEach((a, i) => {
          if (fn.args[i] === "k" && (a.k !== "num" || a.v <= 0 || a.v > 10))
            throw new FormulaError(`In ${tk.v}, k must be a number above 0 and up to 10`, tk.pos);
          if (!WINDOW_ARGS.has(fn.args[i])) return;
          if (a.k !== "num" || !Number.isInteger(a.v) || a.v < 1 || a.v > MAX_WINDOW)
            throw new FormulaError(`In ${tk.v}, ${fn.args[i]} must be a whole number from 1 to ${MAX_WINDOW}`, tk.pos);
        });
        return { k: "call", name: tk.v, args, pos: tk.pos };
      }
      if ((VARIABLES as readonly string[]).includes(tk.v)) return { k: "var", name: tk.v };
      if (fnNamed(tk.v)) throw new FormulaError(`${tk.v} needs brackets: ${tk.v}(${FUNCTIONS[tk.v].args.join(", ")})`, tk.pos);
      throw new FormulaError(`Unknown name "${tk.v}". Use open, high, low, close or volume`, tk.pos);
    }
    if (tk.t === "end") throw new FormulaError("The formula ends too early", tk.pos);
    throw new FormulaError(`Unexpected "${tk.v}"`, tk.pos);
  };

  const tree = or();
  if (peek().t !== "end") throw new FormulaError(`Unexpected "${peek().v}"`, peek().pos);
  return tree;
}

/** null if the formula is valid, else a message with where the problem is. */
export function check(src: string): { message: string; pos: number } | null {
  try { parse(src); return null; } catch (e) {
    if (e instanceof FormulaError) return { message: e.message, pos: e.pos };
    throw e;
  }
}

// ---------------------------------------------------------------- series helpers

const fill = (n: number): Series => new Array(n).fill(null);

/** Applies f to each full window of n non-null values ending at each bar. */
function windowed(x: Series, n: number, f: (w: number[]) => number): Series {
  const out = fill(x.length);
  for (let i = n - 1; i < x.length; i++) {
    const w = x.slice(i - n + 1, i + 1);
    if (w.every((v) => v !== null)) out[i] = f(w as number[]);
  }
  return out;
}

function emaOf(x: Series, n: number): Series {
  const out = fill(x.length), k = 2 / (n + 1);
  let seed: number[] = [], prev: number | null = null;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    if (v === null) { seed = []; prev = null; continue; }
    if (prev === null) {
      seed.push(v);
      if (seed.length === n) { prev = seed.reduce((a, b) => a + b, 0) / n; out[i] = prev; }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function rsiOf(x: Series, n: number): Series {
  const out = fill(x.length);
  let gain = 0, loss = 0, count = 0;
  for (let i = 1; i < x.length; i++) {
    const a = x[i - 1], b = x[i];
    if (a === null || b === null) { gain = 0; loss = 0; count = 0; continue; }
    const d = b - a;
    if (count < n) {
      gain += Math.max(d, 0); loss += Math.max(-d, 0); count++;
      if (count === n) { gain /= n; loss /= n; out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss); }
      continue;
    }
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

const stdevOf = (w: number[]) => { const m = w.reduce((a, b) => a + b, 0) / w.length; return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length); };
const zip = (a: Series, b: Series, f: (x: number, y: number) => number | null): Series =>
  a.map((x, i) => (x === null || b[i] === null ? null : f(x, b[i] as number)));
const shift = (x: Series, n: number): Series => x.map((_, i) => (i >= n ? x[i - n] : null));
const truthy = (v: number | null) => v !== null && v !== 0;

// ---------------------------------------------------------------- evaluate

export function evaluate(src: string | Node, bars: Bar[]): Series {
  const tree = typeof src === "string" ? parse(src) : src;
  const N = bars.length;
  const cols: Record<string, Series> = {
    open: bars.map((b) => b.o), high: bars.map((b) => b.h), low: bars.map((b) => b.l), close: bars.map((b) => b.c), volume: bars.map((b) => b.v),
  };
  const ev = (n: Node): Series => {
    switch (n.k) {
      case "num": return new Array(N).fill(n.v);
      case "var": return cols[n.name];
      case "un": { const a = ev(n.a); return n.op === "-" ? a.map((v) => (v === null ? null : -v)) : a.map((v) => (v === null ? null : truthy(v) ? 0 : 1)); }
      case "bin": {
        const a = ev(n.a), b = ev(n.b);
        switch (n.op) {
          case "+": return zip(a, b, (x, y) => x + y);
          case "-": return zip(a, b, (x, y) => x - y);
          case "*": return zip(a, b, (x, y) => x * y);
          case "/": return zip(a, b, (x, y) => (y === 0 ? null : x / y));
          case "<": return zip(a, b, (x, y) => +(x < y));
          case ">": return zip(a, b, (x, y) => +(x > y));
          case "<=": return zip(a, b, (x, y) => +(x <= y));
          case ">=": return zip(a, b, (x, y) => +(x >= y));
          case "==": return zip(a, b, (x, y) => +(x === y));
          case "!=": return zip(a, b, (x, y) => +(x !== y));
          case "and": return zip(a, b, (x, y) => +(x !== 0 && y !== 0));
          case "or": return zip(a, b, (x, y) => +(x !== 0 || y !== 0));
        }
        throw new Error(`operator ${n.op}`);
      }
      case "call": {
        const num = (i: number, d: number) => (n.args[i] ? (n.args[i] as { v: number }).v : d);
        const x = () => ev(n.args[0]);
        switch (n.name) {
          case "sma": return windowed(x(), num(1, 0), (w) => w.reduce((a, b) => a + b, 0) / w.length);
          case "ema": return emaOf(x(), num(1, 0));
          case "wma": { const k = num(1, 0), d = (k * (k + 1)) / 2; return windowed(x(), k, (w) => w.reduce((a, v, i) => a + v * (i + 1), 0) / d); }
          case "rsi": return rsiOf(x(), num(1, 14));
          case "stdev": return windowed(x(), num(1, 0), stdevOf);
          case "highest": return windowed(x(), num(1, 0), (w) => Math.max(...w));
          case "lowest": return windowed(x(), num(1, 0), (w) => Math.min(...w));
          case "sum": return windowed(x(), num(1, 0), (w) => w.reduce((a, b) => a + b, 0));
          case "prev": return shift(x(), num(1, 1));
          case "change": { const s = x(); return zip(s, shift(s, num(1, 1)), (a, b) => a - b); }
          case "roc": { const s = x(); return zip(s, shift(s, num(1, 0)), (a, b) => (b === 0 ? null : (a / b - 1) * 100)); }
          case "atr": {
            const tr: Series = bars.map((b, i) => (i === 0 ? b.h - b.l : Math.max(b.h, bars[i - 1].c) - Math.min(b.l, bars[i - 1].c)));
            const k = num(0, 14), out = fill(N);
            let prev: number | null = null;
            for (let i = 0; i < N; i++) {
              if (i < k - 1) continue;
              prev = prev === null ? (tr.slice(i - k + 1, i + 1) as number[]).reduce((a, b) => a + b, 0) / k : (prev * (k - 1) + (tr[i] as number)) / k;
              out[i] = prev;
            }
            return out;
          }
          case "stoch": {
            const k = num(0, 14), hi = windowed(cols.high, k, (w) => Math.max(...w)), lo = windowed(cols.low, k, (w) => Math.min(...w));
            return cols.close.map((c, i) => (hi[i] === null || lo[i] === null ? null : hi[i] === lo[i] ? 50 : (((c as number) - (lo[i] as number)) / ((hi[i] as number) - (lo[i] as number))) * 100));
          }
          case "macd": case "macd_signal": {
            const s = x(), line = zip(emaOf(s, num(1, 12)), emaOf(s, num(2, 26)), (a, b) => a - b);
            return n.name === "macd" ? line : emaOf(line, num(3, 9));
          }
          case "bb_upper": case "bb_lower": {
            const s = x(), k = num(1, 20), m = n.args[2] ? (n.args[2] as { v: number }).v : 2, sign = n.name === "bb_upper" ? 1 : -1;
            return windowed(s, k, (w) => w.reduce((a, b) => a + b, 0) / k + sign * m * stdevOf(w));
          }
          case "abs": return x().map((v) => (v === null ? null : Math.abs(v)));
          case "min": return zip(x(), ev(n.args[1]), Math.min);
          case "max": return zip(x(), ev(n.args[1]), Math.max);
          case "crosses_above": case "crosses_below": {
            const a = x(), b = ev(n.args[1]), up = n.name === "crosses_above";
            return a.map((v, i) => {
              if (i === 0 || v === null || b[i] === null || a[i - 1] === null || b[i - 1] === null) return null;
              return up ? +((a[i - 1] as number) <= (b[i - 1] as number) && v > (b[i] as number)) : +((a[i - 1] as number) >= (b[i - 1] as number) && v < (b[i] as number));
            });
          }
        }
        throw new Error(`function ${n.name}`);
      }
    }
  };
  // Non-numeric arguments (window sizes) are never evaluated as series, so a literal there costs nothing.
  return ev(tree).map((v) => (v === null || !Number.isFinite(v) ? null : v));
}

/** The bars where a rule turns true (true now, not true on the bar before): the moments a signal is given. */
export function signalBars(rule: Series): number[] {
  const out: number[] = [];
  for (let i = 0; i < rule.length; i++) if (truthy(rule[i]) && !truthy(i ? rule[i - 1] : null)) out.push(i);
  return out;
}

/** Whether a rule holds on the last bar, for alerts. */
export const holdsNow = (rule: Series) => truthy(rule.at(-1) ?? null);
