// Strategy Definition Language (spec §9): validation, the approved expression grammar,
// and parameter-grid helpers. SDL contains no free-form executable logic: signals are
// expressions in a small grammar over named series, compiled here into closures.

import { rng } from "./util.js";

export const INDICATOR_TYPES = {
  ema: { needs: ["source", "length"], doc: "Exponential moving average" },
  sma: { needs: ["source", "length"], doc: "Simple moving average" },
  rma: { needs: ["source", "length"], doc: "Wilder moving average (ta.rma)" },
  wma: { needs: ["source", "length"], doc: "Weighted moving average" },
  rsi: { needs: ["source", "length"], doc: "Relative strength index 0–100" },
  atr: { needs: ["length"], doc: "Average true range (Wilder)" },
  highest: { needs: ["source", "length"], doc: "Highest value over length bars, including the current bar" },
  lowest: { needs: ["source", "length"], doc: "Lowest value over length bars, including the current bar" },
  stdev: { needs: ["source", "length"], doc: "Population standard deviation (ta.stdev)" },
  bb_upper: { needs: ["source", "length", "mult"], doc: "Bollinger upper band: sma + mult × stdev" },
  bb_lower: { needs: ["source", "length", "mult"], doc: "Bollinger lower band: sma − mult × stdev" },
  roc: { needs: ["source", "length"], doc: "Rate of change in percent" },
  zscore: { needs: ["source", "length"], doc: "(source − sma) / stdev" },
  macd: { needs: ["source", "fast", "slow"], doc: "MACD line: ema(fast) − ema(slow)" },
  macd_signal: { needs: ["source", "fast", "slow", "signal"], doc: "EMA(signal) of the MACD line" },
  adx: { needs: ["length"], doc: "Average directional index (Wilder, DI length = smoothing = length)" },
  volume_sma: { needs: ["length"], doc: "SMA of volume" }
};
export const SOURCES = ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4"];
export const FUNCTIONS = {
  crosses_above: 2, crosses_below: 2, abs: 1, min: 2, max: 2, rising: 2, falling: 2
};
export const BUILTINS = [...SOURCES, "hour", "dayofweek", "bar_index"];

/* ---------------- Expression grammar ---------------- */
// expr  := or ; or := and ("OR" and)* ; and := not ("AND" not)* ; not := "NOT" not | cmp
// cmp   := add (("<"|">"|"<="|">="|"=="|"!=") add)? ; add := mul (("+"|"-") mul)*
// mul   := unary (("*"|"/") unary)* ; unary := "-" unary | post ; post := prim ("[" INT "]")*
// prim  := NUMBER | "true" | "false" | IDENT | IDENT "(" args ")" | "(" expr ")"

function tokenize(src) {
  const toks = [], re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|[()<>+\-*/\[\],]))/y;
  let m, pos = 0;
  src = String(src);
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    m = re.exec(src);
    if (!m) throw new Error(`Unexpected character at position ${pos}: "${src.slice(pos, pos + 10)}"`);
    pos = re.lastIndex;
    if (m[1] !== undefined) toks.push({ t: "num", v: +m[1] });
    else if (m[2] !== undefined) {
      const up = m[2].toUpperCase();
      if (["AND", "OR", "NOT"].includes(up)) toks.push({ t: "op", v: up });
      else if (m[2] === "true" || m[2] === "false") toks.push({ t: "bool", v: m[2] === "true" });
      else toks.push({ t: "id", v: m[2] });
    } else toks.push({ t: "op", v: m[3] });
  }
  return toks;
}

export function parseExpression(src) {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const isOp = v => peek() && peek().t === "op" && peek().v === v;
  const expect = v => { if (!isOp(v)) throw new Error(`Expected "${v}"`); i++; };
  const bin = (sub, ops, kind) => () => {
    let l = sub();
    while (peek() && peek().t === "op" && ops.includes(peek().v)) { const op = next().v; l = { k: kind, op, l, r: sub() }; }
    return l;
  };
  const prim = () => {
    const t = next();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "bool") return { k: "num", v: t.v ? 1 : 0, bool: true };
    if (t.t === "id") {
      if (isOp("(")) {
        i++;
        const args = [];
        if (!isOp(")")) { args.push(or()); while (isOp(",")) { i++; args.push(or()); } }
        expect(")");
        return { k: "call", fn: t.v, args };
      }
      return { k: "id", v: t.v };
    }
    if (t.v === "(") { const e = or(); expect(")"); return e; }
    throw new Error(`Unexpected "${t.v}"`);
  };
  const post = () => {
    let e = prim();
    while (isOp("[")) {
      i++;
      const n = next();
      if (!n || n.t !== "num" || !Number.isInteger(n.v) || n.v < 0) throw new Error("History offset must be a non-negative integer, e.g. close[1]");
      expect("]");
      e = { k: "lag", n: n.v, e };
    }
    return e;
  };
  const unary = () => (isOp("-") ? (i++, { k: "neg", e: unary() }) : post());
  const mul = bin(unary, ["*", "/"], "arith");
  const add = bin(mul, ["+", "-"], "arith");
  const cmp = () => {
    const l = add();
    if (peek() && peek().t === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(peek().v)) { const op = next().v; return { k: "cmp", op, l, r: add() }; }
    return l;
  };
  const not = () => (isOp("NOT") ? (i++, { k: "not", e: not() }) : cmp());
  const and = bin(not, ["AND"], "logic");
  const or = bin(and, ["OR"], "logic");
  const ast = or();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i].v}" after end of expression`);
  return ast;
}

export function identifiers(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.k === "id") out.add(ast.v);
  for (const k of ["l", "r", "e"]) if (ast[k]) identifiers(ast[k], out);
  if (ast.args) ast.args.forEach(a => identifiers(a, out));
  return out;
}
export function maxLag(ast) {
  if (!ast) return 0;
  let m = 0;
  if (ast.k === "lag") m = ast.n + maxLag(ast.e);
  for (const k of ["l", "r"]) if (ast[k]) m = Math.max(m, maxLag(ast[k]));
  if (ast.k !== "lag" && ast.e) m = Math.max(m, maxLag(ast.e));
  if (ast.args) for (const a of ast.args) m = Math.max(m, maxLag(a) + (["crosses_above", "crosses_below"].includes(ast.fn) ? 1 : 0));
  return m;
}
// The grammar has no way to reference a future bar: offsets are non-negative integers only.

// Compile an AST to a function of bar index. `resolve(name)` returns an array or a constant.
export function compile(ast, resolve) {
  const c = node => {
    switch (node.k) {
      case "num": return () => node.v;
      case "id": {
        const v = resolve(node.v);
        if (Array.isArray(v) || ArrayBuffer.isView(v)) return i => (i >= 0 && i < v.length ? v[i] : NaN);
        if (typeof v === "function") return v;
        return () => v;
      }
      case "lag": { const f = c(node.e); return i => f(i - node.n); }
      case "neg": { const f = c(node.e); return i => -f(i); }
      case "not": { const f = c(node.e); return i => !truthy(f(i)); }
      case "arith": {
        const l = c(node.l), r = c(node.r);
        if (node.op === "+") return i => l(i) + r(i);
        if (node.op === "-") return i => l(i) - r(i);
        if (node.op === "*") return i => l(i) * r(i);
        return i => { const d = r(i); return d === 0 ? NaN : l(i) / d; };
      }
      case "cmp": {
        const l = c(node.l), r = c(node.r);
        const ops = { "<": (a, b) => a < b, ">": (a, b) => a > b, "<=": (a, b) => a <= b, ">=": (a, b) => a >= b, "==": (a, b) => a === b, "!=": (a, b) => a !== b };
        const f = ops[node.op];
        return i => { const a = l(i), b = r(i); return Number.isNaN(a) || Number.isNaN(b) ? false : f(a, b); };
      }
      case "logic": {
        const l = c(node.l), r = c(node.r);
        return node.op === "AND" ? i => truthy(l(i)) && truthy(r(i)) : i => truthy(l(i)) || truthy(r(i));
      }
      case "call": {
        const a = node.args.map(c);
        switch (node.fn) {
          case "crosses_above": return i => { const x = a[0](i), y = a[1](i), px = a[0](i - 1), py = a[1](i - 1); return x > y && px <= py; };
          case "crosses_below": return i => { const x = a[0](i), y = a[1](i), px = a[0](i - 1), py = a[1](i - 1); return x < y && px >= py; };
          case "abs": return i => Math.abs(a[0](i));
          case "min": return i => Math.min(a[0](i), a[1](i));
          case "max": return i => Math.max(a[0](i), a[1](i));
          case "rising": { const n = constArg(node.args[1]); return i => { for (let k = 0; k < n; k++) if (!(a[0](i - k) > a[0](i - k - 1))) return false; return true; }; }
          case "falling": { const n = constArg(node.args[1]); return i => { for (let k = 0; k < n; k++) if (!(a[0](i - k) < a[0](i - k - 1))) return false; return true; }; }
        }
        throw new Error("Unknown function " + node.fn);
      }
    }
    throw new Error("Bad node " + node.k);
  };
  return c(ast);
}
const truthy = v => v === true || (typeof v === "number" && v !== 0 && !Number.isNaN(v));
function constArg(n) {
  if (n.k !== "num" || !Number.isInteger(n.v) || n.v < 1) throw new Error("rising/falling need a positive integer bar count");
  return n.v;
}

/* ---------------- SDL validation ---------------- */
const SIGNAL_KEYS = ["longEntry", "shortEntry", "longExit", "shortExit"];

export function paramValue(spec, params, sdl) {
  if (spec === undefined || spec === null) return undefined;
  if (typeof spec === "number") return spec;
  if (typeof spec === "object" && spec.parameter) {
    if (params && spec.parameter in params) return params[spec.parameter];
    const p = (sdl.parameters || []).find(x => x.key === spec.parameter);
    return p ? p.default : undefined;
  }
  if (typeof spec === "string") {
    if (params && spec in params) return params[spec];
    const p = (sdl.parameters || []).find(x => x.key === spec);
    if (p) return p.default;
    if (!Number.isNaN(+spec)) return +spec;
  }
  return undefined;
}

export function validateSDL(sdl) {
  const errors = [], warnings = [];
  const err = m => errors.push(m), warn = m => warnings.push(m);
  if (!sdl || typeof sdl !== "object") return { ok: false, errors: ["SDL must be a JSON object"], warnings };
  if (sdl.schemaVersion !== "1.0.0") err('schemaVersion must be "1.0.0"');
  const s = sdl.strategy || {};
  if (!s.name) err("strategy.name is required");
  if (!s.thesis) err("strategy.thesis is required");
  const dirs = s.directions || [];
  if (!Array.isArray(dirs) || !dirs.length || dirs.some(d => !["long", "short"].includes(d))) err('strategy.directions must be a non-empty subset of ["long","short"]');
  const mk = sdl.market || {};
  if (!mk.timeframe) err("market.timeframe is required");
  if (mk.chartType && mk.chartType !== "standard_ohlc") err("market.chartType must be standard_ohlc (spec §7.4)");
  if (mk.timezone && mk.timezone !== "Etc/UTC") warn("The research runner evaluates time filters in UTC; timezone is treated as Etc/UTC.");

  // Parameters
  const params = Array.isArray(sdl.parameters) ? sdl.parameters : [];
  if (!Array.isArray(sdl.parameters)) err("parameters must be an array (may be empty)");
  const keys = new Set();
  for (const p of params) {
    if (!p.key || !/^[a-z_][a-z0-9_]*$/.test(p.key)) { err(`parameter key "${p.key}" must be snake_case`); continue; }
    if (keys.has(p.key)) err(`duplicate parameter "${p.key}"`);
    keys.add(p.key);
    if (!["int", "float"].includes(p.type)) err(`parameter ${p.key}: type must be int or float`);
    for (const f of ["default", "min", "max", "step"]) if (typeof p[f] !== "number" || !Number.isFinite(p[f])) err(`parameter ${p.key}: ${f} must be a number`);
    if (p.min > p.max) err(`parameter ${p.key}: min > max`);
    if (p.default < p.min || p.default > p.max) err(`parameter ${p.key}: default outside [min,max]`);
    if (p.step <= 0) err(`parameter ${p.key}: step must be > 0`);
    if (p.type === "int" && [p.default, p.min, p.max, p.step].some(v => !Number.isInteger(v))) err(`parameter ${p.key}: int parameter needs integer default/min/max/step`);
    if (!p.rationale) warn(`parameter ${p.key} has no rationale`);
  }
  const refParam = (v, where) => {
    if (v && typeof v === "object" && "parameter" in v && !keys.has(v.parameter)) err(`${where} references undeclared parameter "${v.parameter}"`);
  };

  // Indicators
  const inds = Array.isArray(sdl.indicators) ? sdl.indicators : [];
  if (!Array.isArray(sdl.indicators)) err("indicators must be an array");
  const indIds = new Set();
  for (const ind of inds) {
    if (!ind.id || !/^[a-z_][a-z0-9_]*$/.test(ind.id)) { err(`indicator id "${ind.id}" must be snake_case`); continue; }
    if (indIds.has(ind.id) || keys.has(ind.id) || BUILTINS.includes(ind.id)) err(`indicator id "${ind.id}" clashes with another name`);
    indIds.add(ind.id);
    const t = INDICATOR_TYPES[ind.type];
    if (!t) { err(`indicator ${ind.id}: unsupported type "${ind.type}". Supported: ${Object.keys(INDICATOR_TYPES).join(", ")}`); continue; }
    for (const n of t.needs) {
      if (n === "source") { if (!SOURCES.includes(ind.source)) err(`indicator ${ind.id}: source must be one of ${SOURCES.join(", ")}`); }
      else if (ind[n] === undefined) err(`indicator ${ind.id}: ${n} is required`);
      else refParam(ind[n], `indicator ${ind.id}.${n}`);
    }
  }

  // Signals
  const sig = sdl.signals || {};
  const asts = {};
  const known = new Set([...indIds, ...keys, ...BUILTINS]);
  for (const k of SIGNAL_KEYS) {
    if (sig[k] === undefined || sig[k] === null || sig[k] === "") continue;
    try {
      const ast = parseExpression(sig[k]);
      asts[k] = ast;
      for (const id of identifiers(ast)) if (!known.has(id)) err(`signals.${k}: unknown name "${id}"`);
      checkCalls(ast, k, err);
    } catch (e) { err(`signals.${k}: ${e.message}`); }
  }
  if (dirs.includes("long") && !asts.longEntry) err("signals.longEntry is required when trading long");
  if (dirs.includes("short") && !asts.shortEntry) err("signals.shortEntry is required when trading short");

  // Execution (spec §11.2 defaults)
  const ex = sdl.execution || {};
  if (ex.entryOrder && ex.entryOrder !== "market_next_bar") err('execution.entryOrder must be "market_next_bar" (only model supported by the runner)');
  if ((ex.pyramiding ?? 0) !== 0) err("execution.pyramiding must be 0 (spec §11.6)");
  if (ex.calcOnEveryTick) err("execution.calcOnEveryTick must be false (spec §11.2)");
  if (ex.processOnClose) err("execution.processOnClose must be false (spec §11.2)");

  // Risk
  const r = sdl.risk || {};
  if (r.sizingModel !== "percent_of_equity") err('risk.sizingModel must be "percent_of_equity"');
  if (!(r.sizePercent > 0 && r.sizePercent <= 100)) err("risk.sizePercent must be in (0, 100]");
  if (!(r.leverage >= 1 && r.leverage <= 10)) err("risk.leverage must be between 1 and 10");
  const sl = r.stopLoss || {}, tp = r.takeProfit || {};
  if (!["atr_multiple", "percent"].includes(sl.type)) err('risk.stopLoss.type must be "atr_multiple" or "percent" (one SL is mandatory)');
  if (!["risk_multiple", "percent", "none"].includes(tp.type)) err('risk.takeProfit.type must be "risk_multiple", "percent" or "none"');
  for (const [o, n] of [[sl, "stopLoss"], [tp, "takeProfit"]]) {
    if (o.type === "none") continue;
    if (o.value === undefined && o.valueParameter === undefined) err(`risk.${n} needs value or valueParameter`);
    if (o.valueParameter !== undefined && !keys.has(o.valueParameter)) err(`risk.${n}.valueParameter "${o.valueParameter}" is not declared`);
  }
  if (sl.type === "atr_multiple") {
    const atrId = sl.atrIndicator;
    if (!atrId || !inds.find(x => x.id === atrId && x.type === "atr")) err("risk.stopLoss.atrIndicator must name an indicator of type atr");
  }
  if (r.oneStopOneTarget === false) err("risk.oneStopOneTarget must be true");

  // Costs (spec §11.7)
  const c = sdl.costs || {};
  if (c.commissionType !== "percent") err('costs.commissionType must be "percent"');
  if (!(c.commissionValue >= 0)) err("costs.commissionValue must be >= 0");
  if (c.commissionValue === 0) warn("Zero commission is unrealistic for most venues.");
  if (!(c.slippageTicks >= 0)) err("costs.slippageTicks must be >= 0");
  if (!(c.tickSize > 0)) err("costs.tickSize must be > 0 (price increment of the symbol)");

  // Segments
  const sg = sdl.segments || {};
  if (!(Number.isInteger(sg.warmupBars) && sg.warmupBars >= 0)) err("segments.warmupBars must be a non-negative integer");
  if (!["fixed", "rolling_walk_forward", "anchored_walk_forward"].includes(sg.selectionMode)) err('segments.selectionMode must be "fixed", "rolling_walk_forward" or "anchored_walk_forward"');
  if (!(Number.isInteger(sg.embargoBars ?? 0) && (sg.embargoBars ?? 0) >= 0)) err("segments.embargoBars must be a non-negative integer");

  if (!Array.isArray(sdl.falsification) || !sdl.falsification.length) err("falsification must list at least one pre-registered failure condition");

  // Warm-up must cover longest lookback.
  if (!errors.length) {
    const look = longestLookback(sdl, null);
    if (sg.warmupBars < look) warn(`warmupBars (${sg.warmupBars}) is shorter than the longest lookback (${look}); the runner will use ${look}.`);
    const g = gridSize(sdl);
    if (g > 500) warn(`Parameter grid has ${g} combinations; first search is capped at 500 (spec §25) and will be sampled.`);
  }
  return { ok: errors.length === 0, errors, warnings, asts };
}

function checkCalls(ast, where, err) {
  if (!ast) return;
  if (ast.k === "call") {
    if (!(ast.fn in FUNCTIONS)) err(`signals.${where}: unknown function "${ast.fn}". Allowed: ${Object.keys(FUNCTIONS).join(", ")}`);
    else if (ast.args.length !== FUNCTIONS[ast.fn]) err(`signals.${where}: ${ast.fn} takes ${FUNCTIONS[ast.fn]} arguments`);
    ast.args.forEach(a => checkCalls(a, where, err));
  }
  for (const k of ["l", "r", "e"]) if (ast[k]) checkCalls(ast[k], where, err);
}

export function longestLookback(sdl, params) {
  let m = 0;
  for (const ind of sdl.indicators || []) {
    const vals = ["length", "slow", "fast", "signal"].map(f => paramValue(ind[f], params, sdl)).filter(v => typeof v === "number");
    let L = vals.length ? Math.max(...vals) : 0;
    if (ind.type === "macd_signal") L = (paramValue(ind.slow, params, sdl) || 0) + (paramValue(ind.signal, params, sdl) || 0);
    if (["ema", "rma", "rsi", "atr", "adx", "macd", "macd_signal"].includes(ind.type)) L = L * 3; // recursive filters need extra settling
    m = Math.max(m, L);
  }
  // Max length if parameters at their max
  if (!params) for (const p of sdl.parameters || []) for (const ind of sdl.indicators || []) for (const f of ["length", "slow", "fast"]) if (ind[f] && ind[f].parameter === p.key) m = Math.max(m, ["ema", "rma", "rsi", "atr", "adx", "macd", "macd_signal"].includes(ind.type) ? p.max * 3 : p.max);
  let lag = 0;
  for (const k of SIGNAL_KEYS) if (sdl.signals && sdl.signals[k]) try { lag = Math.max(lag, maxLag(parseExpression(sdl.signals[k]))); } catch (_) {}
  return m + lag + 1;
}

/* ---------------- Parameter grids ---------------- */
export function paramAxis(p) {
  const out = [];
  const n = Math.floor((p.max - p.min) / p.step + 1e-9);
  for (let k = 0; k <= n; k++) out.push(+(p.min + k * p.step).toFixed(10));
  return out;
}
export function gridSize(sdl) {
  return (sdl.parameters || []).reduce((s, p) => s * paramAxis(p).length, 1);
}
export function defaults(sdl) {
  return Object.fromEntries((sdl.parameters || []).map(p => [p.key, p.default]));
}
// Full grid, or a deterministic sample capped at `cap` that always contains the defaults.
export function parameterGrid(sdl, cap = 500, seed = 7) {
  const ps = sdl.parameters || [];
  if (!ps.length) return [{}];
  const axes = ps.map(paramAxis);
  const total = axes.reduce((s, a) => s * a.length, 1);
  const decode = n => { const o = {}; for (let j = ps.length - 1; j >= 0; j--) { o[ps[j].key] = axes[j][n % axes[j].length]; n = Math.floor(n / axes[j].length); } return o; };
  if (total <= cap) return Array.from({ length: total }, (_, n) => decode(n));
  const r = rng(seed), picked = new Set(), out = [defaults(sdl)];
  while (out.length < cap) { const n = Math.floor(r() * total); if (!picked.has(n)) { picked.add(n); out.push(decode(n)); } }
  return out;
}
export function neighbours(sdl, params) {
  const out = [];
  for (const p of sdl.parameters || []) {
    for (const d of [-1, 1]) {
      const v = +(params[p.key] + d * p.step).toFixed(10);
      if (v >= p.min - 1e-9 && v <= p.max + 1e-9) out.push({ ...params, [p.key]: v });
    }
  }
  return out;
}
export const paramKey = p => Object.keys(p).sort().map(k => `${k}=${p[k]}`).join(",");

export const SDL_TEMPLATE = {
  schemaVersion: "1.0.0",
  strategy: { name: "Example EMA trend with ATR stop", family: "trend_following", thesis: "Price trends persist after a fast/slow EMA cross on 4h bars.", directions: ["long", "short"] },
  market: { assetClass: "crypto", symbols: ["BINANCE:BTCUSDT"], timeframe: "240", timezone: "Etc/UTC", session: "0000-2359:1234567", chartType: "standard_ohlc" },
  indicators: [
    { id: "fast", type: "ema", source: "close", length: { parameter: "fast_length" } },
    { id: "slow", type: "ema", source: "close", length: { parameter: "slow_length" } },
    { id: "atr14", type: "atr", length: 14 }
  ],
  signals: { longEntry: "crosses_above(fast, slow)", shortEntry: "crosses_below(fast, slow)", longExit: "", shortExit: "" },
  execution: { entryOrder: "market_next_bar", pyramiding: 0, allowReversal: false, processOnClose: false, calcOnEveryTick: false },
  risk: { sizingModel: "percent_of_equity", sizePercent: 10, leverage: 1, stopLoss: { type: "atr_multiple", valueParameter: "stop_atr", atrIndicator: "atr14" }, takeProfit: { type: "risk_multiple", valueParameter: "target_r" }, oneStopOneTarget: true },
  costs: { commissionType: "percent", commissionValue: 0.06, slippageTicks: 2, tickSize: 0.01 },
  parameters: [
    { key: "fast_length", type: "int", default: 20, min: 10, max: 40, step: 5, rationale: "Responsive trend estimate" },
    { key: "slow_length", type: "int", default: 100, min: 60, max: 160, step: 20, rationale: "Slow regime trend" },
    { key: "stop_atr", type: "float", default: 2, min: 1, max: 3, step: 0.5, rationale: "Stop beyond typical bar noise" },
    { key: "target_r", type: "float", default: 2, min: 1, max: 3, step: 0.5, rationale: "Target as a multiple of initial risk" }
  ],
  segments: { warmupBars: 300, selectionMode: "rolling_walk_forward", embargoBars: 10 },
  falsification: ["Validation-segment net profit is non-positive.", "Neighbouring parameters collapse.", "Doubling costs removes the edge."]
};
