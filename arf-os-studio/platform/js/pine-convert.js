// Free, offline Pine Script → SDL converter for common strategy patterns. No AI involved.
// It understands inputs, ta.* indicators, crossovers, if/else blocks with strategy.entry/close,
// strategy.exit stops, limits and trails, and strategy() properties. Everything it cannot express
// is listed in `skipped` / `notes`, never silently dropped.

/* ---------------- Tokenizer and expression parser (Pine subset) ---------------- */
function tokenize(src) {
  const out = [], re = /\s*(?:(\d+\.\d*|\.\d+|\d+(?:[eE][+-]?\d+)?)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|([A-Za-z_][A-Za-z0-9_.]*)|(:=|==|!=|<=|>=|=>|[-+*/%(),\[\]<>?:=]))/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new Error(`can't read "${src.slice(pos, pos + 12)}"`);
    pos = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: "num", v: +m[1] });
    else if (m[2] !== undefined) out.push({ t: "str", v: m[2].slice(1, -1) });
    else if (m[3] !== undefined) out.push(["and", "or", "not", "true", "false"].includes(m[3]) ? { t: "kw", v: m[3] } : { t: "id", v: m[3] });
    else out.push({ t: "op", v: m[4] });
  }
  return out;
}
function parse(src) {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const isOp = v => peek() && peek().t === "op" && peek().v === v;
  const isKw = v => peek() && peek().t === "kw" && peek().v === v;
  const expect = v => { if (!isOp(v)) throw new Error(`expected "${v}"`); i++; };
  const ternary = () => { const c = or(); if (isOp("?")) { i++; const a = ternary(); expect(":"); const b = ternary(); return { k: "tern", c, a, b }; } return c; };
  const or = () => { let l = and(); while (isKw("or")) { i++; l = { k: "logic", op: "OR", l, r: and() }; } return l; };
  const and = () => { let l = not(); while (isKw("and")) { i++; l = { k: "logic", op: "AND", l, r: not() }; } return l; };
  const not = () => (isKw("not") ? (i++, { k: "not", e: not() }) : cmp());
  const cmp = () => { const l = add(); if (peek() && peek().t === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(peek().v)) { const op = next().v; return { k: "cmp", op, l, r: add() }; } return l; };
  const add = () => { let l = mul(); while (peek() && peek().t === "op" && ["+", "-"].includes(peek().v)) { const op = next().v; l = { k: "ar", op, l, r: mul() }; } return l; };
  const mul = () => { let l = unary(); while (peek() && peek().t === "op" && ["*", "/", "%"].includes(peek().v)) { const op = next().v; l = { k: "ar", op, l, r: unary() }; } return l; };
  const unary = () => (isOp("-") ? (i++, { k: "neg", e: unary() }) : isOp("+") ? (i++, unary()) : post());
  const post = () => {
    let e = prim();
    while (isOp("[")) { i++; const n = ternary(); expect("]"); e = { k: "idx", e, n }; }
    return e;
  };
  const prim = () => {
    const t = next();
    if (!t) throw new Error("unexpected end");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "kw" && (t.v === "true" || t.v === "false")) return { k: "bool", v: t.v === "true" };
    if (t.t === "id") {
      if (isOp("(")) {
        i++;
        const args = [], named = {};
        while (!isOp(")")) {
          if (peek() && peek().t === "id" && toks[i + 1] && toks[i + 1].t === "op" && toks[i + 1].v === "=") { const name = next().v; i++; named[name] = ternary(); }
          else args.push(ternary());
          if (isOp(",")) i++; else break;
        }
        expect(")");
        return { k: "call", fn: t.v, args, named };
      }
      return { k: "id", v: t.v };
    }
    if (t.t === "op" && t.v === "(") { const e = ternary(); expect(")"); return e; }
    if (t.t === "op" && t.v === "[") { const items = []; while (!isOp("]")) { items.push(ternary()); if (isOp(",")) i++; else break; } expect("]"); return { k: "tuple", items }; }
    throw new Error(`unexpected "${t.v}"`);
  };
  const ast = ternary();
  if (i < toks.length) throw new Error(`unexpected "${toks[i].v}"`);
  return ast;
}

/* ---------------- Source preprocessing ---------------- */
function stripComment(line) {
  let q = null;
  for (let k = 0; k < line.length; k++) {
    const ch = line[k];
    if (q) { if (ch === q && line[k - 1] !== "\\") q = null; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === "/" && line[k + 1] === "/") return line.slice(0, k);
  }
  return line;
}
// Join statements that continue over several lines (open brackets, trailing operators/commas).
function logicalLines(src) {
  const raw = src.replace(/\r/g, "").split("\n").map(stripComment);
  const out = [];
  let buf = null, depth = 0;
  for (const line of raw) {
    if (!line.trim()) { if (buf === null) continue; }
    if (buf === null) { buf = { indent: (line.match(/^\s*/)[0].replace(/\t/g, "    ")).length, text: line.trim() }; }
    else buf.text += " " + line.trim();
    for (const ch of line) { if ("([".includes(ch)) depth++; else if (")]".includes(ch)) depth--; }
    const cont = depth > 0 || /(,|\b(and|or|not)|[-+*/=<>?:]|\()\s*$/.test(line.trim());
    if (!cont) { if (buf.text) out.push(buf); buf = null; depth = 0; }
  }
  if (buf && buf.text) out.push(buf);
  return out;
}

/* ---------------- Converter ---------------- */
const SOURCES = ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4"];
const TA_SIMPLE = { "ta.ema": "ema", "ta.sma": "sma", "ta.rma": "rma", "ta.wma": "wma", "ta.rsi": "rsi", "ta.highest": "highest", "ta.lowest": "lowest", "ta.stdev": "stdev", "ta.roc": "roc" };
const sid = s => String(s).toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^([0-9])/, "_$1").slice(0, 40) || "x";

export function convertPineToSDL(pine, { timeframe = "240", symbol = "BINANCE:BTCUSDT", tickSize = 0.01 } = {}) {
  const notes = [], skipped = [];
  const params = {}, paramOrder = [];
  const env = {};           // name → { kind: "expr"|"ind"|"param"|"tuple"|"cci", ... }
  const indicators = [], indByKey = new Map();
  const entries = {};       // entry id → direction
  const cond = { longEntry: [], shortEntry: [], longExit: [], shortExit: [] };
  const exits = [];
  const props = {};
  let usedId = new Set(SOURCES.concat(["hour", "dayofweek", "bar_index"]));

  const uniq = base => { let id = sid(base), n = 2; while (usedId.has(id)) id = sid(base) + "_" + n++; usedId.add(id); return id; };
  const numOrParam = node => {
    if (node.k === "num") return node.v;
    if (node.k === "id" && env[node.v] && env[node.v].kind === "param") return { parameter: env[node.v].key };
    if (node.k === "id" && env[node.v] && env[node.v].kind === "const") return env[node.v].v;
    throw new Error("indicator length must be a number or an input");
  };
  const srcName = node => {
    if (node.k === "id" && SOURCES.includes(node.v)) return node.v;
    if (node.k === "id" && env[node.v] && env[node.v].kind === "expr" && SOURCES.includes(env[node.v].sdl)) return env[node.v].sdl;
    throw new Error("indicator source must be open, high, low, close, volume, hl2, hlc3 or ohlc4");
  };
  const addInd = (type, fields, hint) => {
    const key = type + JSON.stringify(fields);
    if (indByKey.has(key)) return indByKey.get(key);
    const id = uniq(hint || type);
    indicators.push({ id, type, ...fields });
    indByKey.set(key, id);
    return id;
  };

  // Translate a Pine AST to an SDL expression string.
  const tr = (n, ctx = {}) => {
    switch (n.k) {
      case "num": return String(n.v);
      case "bool": return n.v ? "true" : "false";
      case "str": throw new Error("text values are not supported in conditions");
      case "id": {
        if (SOURCES.includes(n.v)) return n.v;
        if (n.v === "bar_index") return "bar_index";
        if (n.v === "barstate.isconfirmed") return "true"; // the runner already evaluates on confirmed bars
        const e = env[n.v];
        if (!e) throw new Error(`unknown name "${n.v}"`);
        if (e.kind === "param") return e.key;
        if (e.kind === "const") return String(e.v);
        if (e.kind === "ind") return e.id;
        if (e.kind === "expr") return `(${e.sdl})`;
        if (e.kind === "cci") throw new Error("CCI can only be compared with 0 (cci > 0 / cci < 0)");
        if (e.kind === "stateful") throw new Error(`"${n.v}" is updated bar by bar with := (custom logic the converter can't follow)`);
        throw new Error(`"${n.v}" can't be used here`);
      }
      case "idx": { if (n.n.k !== "num") throw new Error("history offset must be a number"); return `${tr(n.e)}[${n.n.v}]`; }
      case "neg": return `-${tr(n.e)}`;
      case "not": return `NOT ${tr(n.e)}`;
      case "logic": return `(${tr(n.l)} ${n.op} ${tr(n.r)})`;
      case "ar": { if (n.op === "%") throw new Error("% is not supported"); return `(${tr(n.l)} ${n.op} ${tr(n.r)})`; }
      case "cmp": {
        const side = x => (x.k === "id" && env[x.v] && env[x.v].kind === "cci" ? env[x.v] : x.k === "call" && x.fn === "ta.cci" ? cciOf(x) : null);
        const lc = side(n.l), rc = side(n.r);
        if (lc || rc) {
          const c = lc || rc, other = lc ? n.r : n.l;
          if (other.k !== "num" || other.v !== 0) throw new Error("CCI can only be compared with 0");
          const op = lc ? n.op : { "<": ">", ">": "<", "<=": ">=", ">=": "<=" }[n.op] || n.op;
          return `${c.src} ${op} ${c.mean}`;
        }
        return `${tr(n.l)} ${n.op} ${tr(n.r)}`;
      }
      case "tern": throw new Error("the ? : operator is not supported in conditions");
      case "call": return trCall(n);
    }
    throw new Error("unsupported expression");
  };
  const cciOf = n => { const src = srcName(n.args[0]), len = numOrParam(n.args[1]); return { kind: "cci", src, mean: addInd("sma", { source: src, length: len }, `${src}_mean`) }; };
  const trCall = (n, hint) => {
    const f = n.fn, a = n.args;
    if (f === "ta.crossover") return `crosses_above(${tr(a[0])}, ${tr(a[1])})`;
    if (f === "ta.crossunder") return `crosses_below(${tr(a[0])}, ${tr(a[1])})`;
    if (f === "ta.cross") return `(crosses_above(${tr(a[0])}, ${tr(a[1])}) OR crosses_below(${tr(a[0])}, ${tr(a[1])}))`;
    if (f === "ta.rising") return `rising(${tr(a[0])}, ${a[1].v})`;
    if (f === "ta.falling") return `falling(${tr(a[0])}, ${a[1].v})`;
    if (f === "math.abs") return `abs(${tr(a[0])})`;
    if (f === "math.max" && a.length === 2) return `max(${tr(a[0])}, ${tr(a[1])})`;
    if (f === "math.min" && a.length === 2) return `min(${tr(a[0])}, ${tr(a[1])})`;
    if (f === "nz") return tr(a[0]);
    if (TA_SIMPLE[f]) return addInd(TA_SIMPLE[f], { source: srcName(a[0]), length: numOrParam(a[1]) }, hint || TA_SIMPLE[f]);
    if (f === "ta.atr") return addInd("atr", { length: numOrParam(a[0]) }, hint || "atr");
    if (f === "ta.vwap") { notes.push("ta.vwap was mapped to a VWAP that resets at each UTC day (TradingView's crypto session anchor)."); return addInd("vwap_daily", { source: a[0] ? srcName(a[0]) : "hlc3" }, "vwap"); }
    if (f === "ta.change" && a.length === 1) return `(${tr(a[0])} - ${tr(a[0])}[1])`;
    throw new Error(`${f}() is not supported`);
  };

  const assignTuple = (names, call) => {
    if (call.k !== "call") throw new Error("tuple must come from a function");
    if (call.fn === "ta.macd") {
      const src = srcName(call.args[0]), fast = numOrParam(call.args[1]), slow = numOrParam(call.args[2]), sig = numOrParam(call.args[3]);
      const line = addInd("macd", { source: src, fast, slow }, names[0] || "macd");
      const signal = addInd("macd_signal", { source: src, fast, slow, signal: sig }, names[1] || "macd_signal");
      if (names[0]) env[names[0]] = { kind: "ind", id: line };
      if (names[1]) env[names[1]] = { kind: "ind", id: signal };
      if (names[2]) env[names[2]] = { kind: "expr", sdl: `${line} - ${signal}` };
      return;
    }
    if (call.fn === "ta.bb") {
      const src = srcName(call.args[0]), len = numOrParam(call.args[1]), mult = numOrParam(call.args[2]);
      if (names[0]) env[names[0]] = { kind: "ind", id: addInd("sma", { source: src, length: len }, names[0]) };
      if (names[1]) env[names[1]] = { kind: "ind", id: addInd("bb_upper", { source: src, length: len, mult }, names[1]) };
      if (names[2]) env[names[2]] = { kind: "ind", id: addInd("bb_lower", { source: src, length: len, mult }, names[2]) };
      return;
    }
    throw new Error(`${call.fn}() tuples are not supported`);
  };

  const addInput = (name, call) => {
    const isInt = call.fn === "input.int" || (call.fn === "input" && call.args[0] && Number.isInteger(call.args[0].v));
    const def = call.args[0] && call.args[0].k === "num" ? call.args[0].v : call.named.defval && call.named.defval.v;
    if (typeof def !== "number") { if (call.fn === "input.time" || call.fn === "input.bool" || call.fn === "input.string" || call.fn === "input.source") { skipped.push(`${name} = ${call.fn}(…) — not a numeric input; ignored`); return; } throw new Error("input needs a numeric default"); }
    const num = k => (call.named[k] && call.named[k].k === "num" ? call.named[k].v : undefined);
    let min = num("minval"), max = num("maxval"), step = num("step");
    if (min === undefined) min = isInt ? Math.max(1, Math.round(def / 2)) : +(def / 2).toFixed(6);
    if (max === undefined) max = isInt ? Math.round(def * 2) : +(def * 2).toFixed(6);
    if (min > def) min = def; if (max < def) max = def;
    if (step === undefined) step = isInt ? Math.max(1, Math.round((max - min) / 6)) : +((max - min) / 6).toPrecision(2);
    if (!(step > 0)) step = isInt ? 1 : 0.1;
    const key = uniq(name);
    params[key] = { key, type: isInt ? "int" : "float", default: def, min, max, step, rationale: `Script input "${call.args[1]?.v || call.named.title?.v || name}"` };
    paramOrder.push(key);
    env[name] = { kind: "param", key };
  };

  // Recognise stop/limit/trail distances relative to the entry price.
  const relDistance = node => {
    // patterns: avg * (1 - X/100), avg - atr*k, avg + atr*k*r, close * (1 ± X/100)
    const isBase = x => x.k === "id" && (x.v === "strategy.position_avg_price" || x.v === "close" || (env[x.v] && env[x.v].kind === "base"));
    const valOf = x => (x.k === "num" ? x.v : x.k === "id" && env[x.v] && env[x.v].kind === "param" ? env[x.v].key : x.k === "id" && env[x.v] && env[x.v].kind === "const" ? env[x.v].v : null);
    if (node.k === "ar" && node.op === "*" && (isBase(node.l) || isBase(node.r))) {
      const f = isBase(node.l) ? node.r : node.l;
      if (f.k === "ar" && ["-", "+"].includes(f.op) && f.l.k === "num" && f.l.v === 1) {
        const r = f.r;
        if (r.k === "ar" && r.op === "/" && r.r.k === "num" && r.r.v === 100) { const v = valOf(r.l); if (v !== null) return { type: "percent", v }; }
        if (r.k === "num") return { type: "percent", v: +(r.v * 100).toFixed(6) };
      }
    }
    if (node.k === "ar" && ["-", "+"].includes(node.op) && isBase(node.l)) {
      const r = node.r;
      const isAtr = y => (y.k === "id" && env[y.v] && env[y.v].kind === "ind" && indicators.find(i => i.id === env[y.v].id && i.type === "atr")) || (y.k === "call" && y.fn === "ta.atr");
      const atrId = y => (y.k === "call" ? addInd("atr", { length: numOrParam(y.args[0]) }, "atr") : env[y.v].id);
      // Flatten a product into factors: exactly one ATR, numbers, and at most one input.
      const atrMul = x => {
        const fs = []; const walk = y => (y.k === "ar" && y.op === "*" ? (walk(y.l), walk(y.r)) : fs.push(y)); walk(x);
        const atrs = fs.filter(isAtr); if (atrs.length !== 1) return null;
        let num = 1, param = null;
        for (const f of fs) { if (f === atrs[0]) continue; const v = valOf(f); if (typeof v === "number") num *= v; else if (typeof v === "string" && !param) param = v; else return null; }
        return { atr: atrId(atrs[0]), num: +num.toFixed(10), param };
      };
      const am = atrMul(r);
      if (am) return { type: "atr_multiple", v: am.param && am.num === 1 ? am.param : am.param ? null : am.num, num: am.num, param: am.param, atr: am.atr };
    }
    return null;
  };
  // trail_points / trail_offset are in ticks: X / syminfo.mintick where X is a price distance.
  const tickDistance = node => {
    let x = node;
    if (x.k === "call" && x.fn === "math.round") x = x.args[0];
    if (x.k === "call" && x.fn === "math.max" && x.args.length === 2) x = x.args[0].k === "num" ? x.args[1] : x.args[0];
    if (x.k === "call" && x.fn === "math.round") x = x.args[0];
    if (x.k === "ar" && x.op === "/" && x.r.k === "id" && x.r.v === "syminfo.mintick") {
      const d = x.l;
      const fake = { k: "ar", op: "-", l: { k: "id", v: "strategy.position_avg_price" }, r: d };
      const a = relDistance(fake);
      if (a) return a;
      // base * p / 100
      if (d.k === "ar" && d.op === "/" && d.r.k === "num" && d.r.v === 100 && d.l.k === "ar" && d.l.op === "*") {
        const v = d.l.r.k === "num" ? d.l.r.v : d.l.r.k === "id" && env[d.l.r.v]?.kind === "param" ? env[d.l.r.v].key : null;
        if (v !== null) return { type: "percent", v };
      }
      if (d.k === "ar" && d.op === "*" && d.r.k === "num") return { type: "percent", v: d.r.v * 100 };
    }
    if (x.k === "num") return { ticks: x.v };
    if (x.k === "id" && env[x.v] && env[x.v].kind === "ticks") return env[x.v].dist;
    return null;
  };

  const lines = logicalLines(pine);
  // Variables reassigned with := carry state from bar to bar; their values cannot be expressed in SDL.
  const stateful = new Set();
  for (const l of lines) { const m = l.text.match(/^([A-Za-z_]\w*)\s*:=/); if (m) stateful.add(m[1]); const v = l.text.match(/^var\s+(?:\w+\s+)?([A-Za-z_]\w*)\s*=/); if (v) stateful.add(v[1]); }
  const stack = []; // {indent, cond}
  const condAt = indent => { while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop(); return stack.map(s => s.cond); };
  const andAll = cs => (cs.length === 1 ? cs[0] : cs.length ? cs.map(c => `(${c})`).join(" AND ") : "true");

  for (const ln of lines) {
    const text = ln.text;
    let outer;
    try {
      if (/^\/\/@version/.test(text) || /^(indicator|plot|plotshape|plotchar|bgcolor|barcolor|fill|hline|alertcondition|alert|label\.|line\.|box\.|table\.|var\s+table)/.test(text)) { condAt(ln.indent); continue; }
      if (/^strategy\s*\(/.test(text)) {
        const c = parse(text);
        for (const [k, v] of Object.entries(c.named)) props[k] = v.k === "num" ? v.v : v.k === "bool" ? v.v : v.k === "id" ? v.v : v.v;
        continue;
      }
      if (/^else\s+if\b/.test(text) || /^else\b/.test(text)) {
        // turn "else" into NOT of the previous sibling if at the same indent
        const prev = stack.length && stack[stack.length - 1].indent === ln.indent ? stack.pop() : null;
        if (!prev) throw new Error("else without if");
        const negPrev = prev.cond === null ? null : `NOT (${prev.cond})`;
        const rest = text.replace(/^else\s*/, "");
        if (rest.startsWith("if")) { let c = null; try { c = tr(parse(rest.slice(2))); } catch (e) { stack.push({ indent: ln.indent, cond: null }); throw e; } stack.push({ indent: ln.indent, cond: negPrev === null ? null : `${negPrev} AND (${c})` }); }
        else stack.push({ indent: ln.indent, cond: negPrev });
        continue;
      }
      outer = condAt(ln.indent);
      if (/^if\b/.test(text)) {
        let c = null;
        try { c = tr(parse(text.slice(2))); } catch (e) { stack.push({ indent: ln.indent, cond: null }); throw e; }
        stack.push({ indent: ln.indent, cond: c }); continue;
      }
      let m;
      if ((m = text.match(/^\[([^\]]+)\]\s*=\s*(.+)$/))) { assignTuple(m[1].split(",").map(s => s.trim()).map(s => (s === "_" ? null : s)), parse(m[2])); continue; }
      if ((m = text.match(/^(?:var\s+|varip\s+)?(?:(?:float|int|bool|series\s+\w+|simple\s+\w+)\s+)?([A-Za-z_]\w*)\s*(:?=)\s*(.+)$/)) && !/^strategy\./.test(text)) {
        const [, name, op, rhs] = m;
        if (stateful.has(name) || op === ":=") { env[name] = { kind: "stateful" }; if (op === ":=" || /^var/.test(text)) skipped.push(`${text.slice(0, 60)}… — bar-by-bar state (var / :=) isn't supported`); continue; }
        const node = parse(rhs);
        if (node.k === "call" && /^input(\.int|\.float)?$/.test(node.fn)) { addInput(name, node); continue; }
        if (node.k === "call" && /^input\./.test(node.fn)) { addInput(name, node); continue; }
        if (node.k === "num") { env[name] = { kind: "const", v: node.v }; continue; }
        if (node.k === "call" && node.fn === "ta.cci") { env[name] = cciOf(node); continue; }
        // Distances used later by strategy.exit (in ticks or price)
        const td = tickDistance(node);
        if (td && !td.ticks) { env[name] = { kind: "ticks", dist: td }; continue; }
        if (node.k === "call" && TA_SIMPLE[node.fn] || (node.k === "call" && ["ta.atr", "ta.vwap"].includes(node.fn))) {
          const id = trCall(node, name);
          env[name] = { kind: "ind", id };
          // name the indicator after the variable when it is new
          continue;
        }
        if (node.k === "id" && node.v === "strategy.position_avg_price") { env[name] = { kind: "base" }; continue; }
        if (node.k === "tern") { env[name] = { kind: "tern", node }; skipped.push(`${name} = … ? … : … — conditional value, used only if it is a stop or trail`); continue; }
        const rel = relDistance(node);
        if (rel) { env[name] = { kind: "level", rel }; continue; }
        env[name] = { kind: "expr", sdl: tr(node) };
        continue;
      }
      if (/^strategy\.(entry|order)\s*\(/.test(text)) {
        const c = parse(text);
        if (outer.some(x => x === null)) throw new Error("inside a block the converter couldn't read");
        const id = c.args[0]?.v, dirNode = c.args[1] || c.named.direction;
        const dir = dirNode && dirNode.k === "id" ? (dirNode.v.endsWith("long") ? "long" : dirNode.v.endsWith("short") ? "short" : null) : null;
        if (!dir) throw new Error("direction must be strategy.long or strategy.short");
        if (c.named.limit || c.named.stop) notes.push(`Entry "${id}" uses a limit/stop entry order; the runner enters at market on the next bar.`);
        entries[id] = dir;
        const cs = [...outer]; if (c.named.when) cs.push(tr(c.named.when));
        cond[dir === "long" ? "longEntry" : "shortEntry"].push(andAll(cs));
        continue;
      }
      if (/^strategy\.(close|close_all|exit)\s*\(/.test(text) && outer.some(x => x === null)) throw new Error("inside a block the converter couldn't read");
      if (/^strategy\.close_all\s*\(/.test(text)) { const cs = andAll(outer); cond.longExit.push(cs); cond.shortExit.push(cs); continue; }
      if (/^strategy\.close\s*\(/.test(text)) {
        const c = parse(text); const id = c.args[0]?.v;
        const dir = entries[id] || (/s(hort)?$/i.test(id) ? "short" : "long");
        const cs = [...outer]; if (c.named.when) cs.push(tr(c.named.when));
        cond[dir === "long" ? "longExit" : "shortExit"].push(andAll(cs));
        continue;
      }
      if (/^strategy\.exit\s*\(/.test(text)) { exits.push({ call: parse(text), text }); continue; }
      if (/^(strategy\.cancel|strategy\.risk|runtime\.|log\.|max_bars_back)/.test(text)) { skipped.push(text.slice(0, 80)); continue; }
      skipped.push(text.slice(0, 80));
    } catch (e) {
      skipped.push(`${text.slice(0, 70)}${text.length > 70 ? "…" : ""} — ${e.message}`);
    }
  }

  // Exits → stop, target, trail
  let stopLoss = null, takeProfit = { type: "none" }, trailingStop = null;
  const atrIdFallback = () => addInd("atr", { length: 14 }, "atr14");
  const asPart = d => {
    if (!d) return null;
    if (d.type === "atr_multiple") return typeof d.v === "string" ? { type: "atr_multiple", valueParameter: d.v, atrIndicator: d.atr } : { type: "atr_multiple", value: d.v, atrIndicator: d.atr };
    if (d.type === "percent") return typeof d.v === "string" ? { type: "percent", valueParameter: d.v } : { type: "percent", value: d.v };
    return null;
  };
  for (const { call, text } of exits) {
    const nm = call.named;
    const fromLevel = node => {
      if (!node) return null;
      if (node.k === "id" && env[node.v]?.kind === "level") return env[node.v].rel;
      if (node.k === "id" && env[node.v]?.kind === "tern") return null;
      return relDistance(node);
    };
    const s = fromLevel(nm.stop);
    if (nm.stop && !s) skipped.push(`stop in ${text.slice(0, 40)}… — not a recognised distance from the entry price`);
    if (s && s.v === null) skipped.push(`stop in ${text.slice(0, 40)}… — an input multiplied by a number can't be expressed; use the input alone`);
    else if (s && !stopLoss) stopLoss = asPart(s);
    if (nm.limit) {
      const l = fromLevel(nm.limit);
      if (l && takeProfit.type === "none") takeProfit = l.type === "percent" ? asPart(l) : { type: "none" };
      if (l && l.type === "atr_multiple" && s && s.type === "atr_multiple" && l.atr === s.atr && l.param === s.param) takeProfit = { type: "risk_multiple", value: +(l.num / s.num).toFixed(4) };
      else if (l && l.type === "atr_multiple") { skipped.push(`limit in ${text.slice(0, 40)}… — an ATR target is only supported as a multiple of the ATR stop`); }
      if (!l) skipped.push(`limit in ${text.slice(0, 40)}… — not a recognised distance from the entry price`);
    }
    if (nm.loss || nm.profit) notes.push("loss=/profit= are in ticks; converted using the dataset tick size as a percent of the latest price is not exact, so they were skipped. Use stop=/limit= prices for an exact conversion.");
    if (nm.trail_points || nm.trail_offset) {
      const a = nm.trail_points ? tickDistance(nm.trail_points) : null, o = nm.trail_offset ? tickDistance(nm.trail_offset) : null;
      const fix = d => (d && d.ticks !== undefined ? null : d);
      const A = fix(a), O = fix(o);
      if (A && O && !trailingStop) trailingStop = { activation: asPart(A), offset: asPart(O) };
      else if (!A || !O) skipped.push(`trail in ${text.slice(0, 40)}… — trail_points/trail_offset must be a price distance / syminfo.mintick (fixed tick counts depend on the symbol)`);
    }
  }
  if (!stopLoss) {
    stopLoss = { type: "percent", value: 5 };
    notes.push("Your script has no stop-loss. The backtester requires one, so a wide 5% safety stop was added; change it if you like.");
  }
  if (stopLoss.type === "atr_multiple" && !stopLoss.atrIndicator) stopLoss.atrIndicator = atrIdFallback();

  // strategy() properties
  const isFalse = c => /^[()\s]*false[()\s]*$/.test(c);
  for (const k of ["longEntry", "shortEntry"]) if (cond[k].length && cond[k].every(isFalse)) { notes.push(`The ${k === "longEntry" ? "long" : "short"} entry depends on a value that never changes from false, so it was dropped.`); cond[k] = []; }
  const directions = [cond.longEntry.length && "long", cond.shortEntry.length && "short"].filter(Boolean);
  if (!directions.length) {
    const stateHint = stateful.size ? " The entries depend on bar-by-bar state (var / :=), which only a hand-made definition can reproduce." : "";
    throw Object.assign(new Error("No entry conditions could be converted, so there is nothing to backtest." + stateHint), { skipped, notes });
  }
  const qtyType = String(props.default_qty_type || "");
  let size = 100;
  if (/percent_of_equity/.test(qtyType) && typeof props.default_qty_value === "number") size = Math.min(100, props.default_qty_value);
  else notes.push("Order size is not a percent of equity in the script; using 100% of equity.");
  if (typeof props.pyramiding === "number" && props.pyramiding > 1) notes.push(`pyramiding=${props.pyramiding} in the script; the backtester allows one position at a time.`);
  const commission = typeof props.commission_value === "number" ? props.commission_value : 0.06;
  if (props.commission_value === undefined) notes.push("No commission in the script; using 0.06% per side.");
  const slippage = typeof props.slippage === "number" ? props.slippage : 0;
  if (!slippage) notes.push("No slippage in the script. Add 1–2 ticks for a realistic test.");

  // Keep the parameter grid ≤ 500 by widening steps on the largest axes.
  const paramList = paramOrder.map(k => params[k]);
  const axis = p => Math.floor((p.max - p.min) / p.step + 1e-9) + 1;
  let guard = 0;
  while (paramList.reduce((s, p) => s * axis(p), 1) > 500 && guard++ < 50) {
    const big = paramList.reduce((a, b) => (axis(a) >= axis(b) ? a : b));
    big.step = big.type === "int" ? Math.max(1, Math.round(big.step * 2)) : +(big.step * 2).toPrecision(3);
  }
  // Inputs never used by the logic are dropped from the grid (they would only multiply runs).
  const json = JSON.stringify({ indicators, cond, stopLoss, takeProfit, trailingStop });
  const used = paramList.filter(p => new RegExp(`\\b${p.key}\\b`).test(json));
  for (const p of paramList) if (!used.includes(p)) notes.push(`Input "${p.key}" isn't used by the converted logic and was left out.`);

  const unwrap = c => { c = c.trim(); while (/^\(.*\)$/.test(c)) { let d = 0, ok = true; for (let k = 0; k < c.length - 1; k++) { if (c[k] === "(") d++; else if (c[k] === ")") d--; if (d === 0) { ok = false; break; } } if (!ok) break; c = c.slice(1, -1).trim(); } return c; };
  const join = arr => (arr.length ? (arr.length === 1 ? unwrap(arr[0]) : arr.map(c => `(${unwrap(c)})`).join(" OR ")) : "");
  const sdl = {
    schemaVersion: "1.0.0",
    strategy: { name: String(props.title || (pine.match(/strategy\s*\(\s*["']([^"']+)/) || [])[1] || "Converted strategy"), family: "converted_pine", thesis: "Converted from a Pine Script strategy by the built-in converter.", directions },
    market: { assetClass: "crypto", symbols: [symbol], timeframe, timezone: "Etc/UTC", session: "0000-2359:1234567", chartType: "standard_ohlc" },
    indicators,
    signals: { longEntry: join(cond.longEntry), shortEntry: join(cond.shortEntry), longExit: join(cond.longExit), shortExit: join(cond.shortExit) },
    execution: { entryOrder: "market_next_bar", pyramiding: 0, allowReversal: true, processOnClose: props.process_orders_on_close === true, calcOnEveryTick: false },
    risk: { sizingModel: "percent_of_equity", sizePercent: size, leverage: 1, stopLoss, takeProfit, ...(trailingStop ? { trailingStop } : {}), oneStopOneTarget: true },
    costs: { commissionType: "percent", commissionValue: commission, slippageTicks: slippage, tickSize },
    parameters: used,
    segments: { warmupBars: 300, selectionMode: "rolling_walk_forward", embargoBars: 10 },
    falsification: ["Validation-segment net profit is non-positive.", "Doubling costs removes the edge.", "Profit disappears under the adverse intrabar path test."]
  };
  return { sdl, notes, skipped };
}
