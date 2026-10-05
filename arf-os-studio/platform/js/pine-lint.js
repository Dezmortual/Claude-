// Pine QA static checks (spec §11.11). Deterministic regex/structure checks over Pine v6 source,
// plus SDL-to-code conformance where an SDL is supplied.

export const LINT_VERSION = "arf-pine-lint/1.0.0";

function stripComments(src) {
  return src.split("\n").map(line => {
    let inStr = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inStr) { if (ch === inStr && line[i - 1] !== "\\") inStr = null; continue; }
      if (ch === '"' || ch === "'") { inStr = ch; continue; }
      if (ch === "/" && line[i + 1] === "/") return line.slice(0, i);
    }
    return line;
  }).join("\n");
}

function declArgs(code) {
  const m = code.match(/\bstrategy\s*\(/);
  if (!m) return null;
  let depth = 0, i = m.index + m[0].length - 1, start = i + 1;
  for (; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")") { depth--; if (depth === 0) break; }
  }
  return code.slice(start, i);
}

// First argument (the default value) of each input.time(...) call, with its offsets in `code`.
function inputTimeDefaults(code) {
  const out = [], re = /\binput\.time\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    let depth = 0, i = m.index + m[0].length, start = i, inStr = null;
    for (; i < code.length; i++) {
      const ch = code[i];
      if (inStr) { if (ch === inStr && code[i - 1] !== "\\") inStr = null; continue; }
      if (ch === '"' || ch === "'") inStr = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") { if (depth === 0) break; depth--; }
      else if (ch === "," && depth === 0) break;
    }
    out.push({ start, end: i, text: code.slice(start, i) });
  }
  return out;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = n => String(n).padStart(2, "0");
// UTC offset of a timezone literal such as "UTC", "GMT+3" or "UTC-05:30"; null for named zones.
function tzOffset(tz) {
  if (/^(UTC|GMT|Etc\/UTC|Etc\/GMT|Z)$/i.test(tz)) return "+0000";
  const m = tz.match(/^(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  return m ? m[1] + p2(m[2]) + p2(m[3] || 0) : null;
}
const CONST_TS = /^\s*(defval\s*=\s*)?timestamp\s*\(\s*"[^"]*"\s*\)\s*$/;

/**
 * TradingView requires input defaults to be compile-time constants (error CE10123). Forms such as
 * timestamp(2020, 1, 1, 0, 0) or timestamp("GMT+3", 2020, 1, 1) return a "simple int", while the
 * single-string form timestamp("01 Jan 2020 00:00 +0000") is a constant. This rewrites literal-only
 * calls inside input.time() defaults to the constant form. Returns { source, fixes }.
 */
export function fixPineConstants(src) {
  let source = String(src || ""); const fixes = [];
  for (const d of inputTimeDefaults(source).reverse()) {
    if (CONST_TS.test(d.text)) continue;
    const m = d.text.match(/^(\s*(?:defval\s*=\s*)?)timestamp\s*\(([^()]*)\)(\s*)$/);
    if (!m) continue;
    let args = m[2].split(",").map(a => a.trim()), off = "+0000", note = "";
    if (args.length && !/^\d+$/.test(args[0])) {
      const tz = args.shift(), lit = tz.match(/^"([^"]*)"$/), o = lit && tzOffset(lit[1]);
      if (o) off = o; else note = ` (time zone ${tz} replaced by UTC)`;
    }
    if (args.length < 3 || args.length > 6 || !args.every(a => /^\d+$/.test(a))) continue;
    const [y, mo, dd, hh = 0, mi = 0] = args.map(Number);
    if (mo < 1 || mo > 12) continue;
    const lit = `timestamp("${p2(dd)} ${MONTHS[mo - 1]} ${y} ${p2(hh)}:${p2(mi)} ${off}")`;
    source = source.slice(0, d.start) + m[1] + lit + m[3] + source.slice(d.end);
    fixes.push(`input.time default ${m[2].trim() ? "timestamp(" + m[2].trim() + ")" : "timestamp()"} → ${lit}${note}`);
  }
  return { source, fixes: fixes.reverse() };
}

export function lintPine(src, sdl = null) {
  const findings = [];
  const add = (severity, category, rule, message, line = null) => findings.push({ severity, category, rule, message, line });
  const raw = String(src || "");
  const code = stripComments(raw);
  const lines = code.split("\n");
  const lineOf = re => { const i = lines.findIndex(l => re.test(l)); return i >= 0 ? i + 1 : null; };

  if (!/^\s*\/\/@version=6\b/m.test(raw)) add("error", "version", "version", "Missing `//@version=6` annotation (Pine v6 is mandatory).", 1);
  if (/\bindicator\s*\(/.test(code)) add("error", "declaration", "indicator", "Uses indicator(); testable strategies must use strategy().", lineOf(/\bindicator\s*\(/));
  const args = declArgs(code);
  if (args === null) add("error", "declaration", "strategy", "No strategy() declaration found.");
  else {
    const need = ["initial_capital", "currency", "commission_type", "commission_value", "slippage", "default_qty_type", "default_qty_value", "pyramiding", "margin_long", "margin_short"];
    for (const k of need) if (!new RegExp("\\b" + k + "\\s*=").test(args)) add(k.startsWith("margin") || k === "currency" ? "warning" : "error", "declaration", "strategy-prop", `strategy() is missing ${k}.`);
    const pyr = args.match(/\bpyramiding\s*=\s*(\d+)/);
    if (pyr && +pyr[1] !== 0) add("error", "risk", "pyramiding", `pyramiding = ${pyr[1]}; default policy is 0.`);
    if (/\bcalc_on_every_tick\s*=\s*true/.test(args)) add("error", "execution", "calc_on_every_tick", "calc_on_every_tick = true is not allowed by default.");
    if (/\bprocess_orders_on_close\s*=\s*true/.test(args) && !(sdl && sdl.execution && sdl.execution.processOnClose)) add("warning", "execution", "process_orders_on_close", "process_orders_on_close = true differs from the SDL's next-bar-open model.");
    if (sdl && sdl.execution && sdl.execution.processOnClose && !/\bprocess_orders_on_close\s*=\s*true/.test(args)) add("error", "sdl", "process-on-close", "SDL declares processOnClose but strategy() does not set process_orders_on_close=true.");
    if (/\bcalc_on_order_fills\s*=\s*true/.test(args)) add("warning", "execution", "calc_on_order_fills", "calc_on_order_fills = true can cause intrabar recalculation.");
    if (/commission_value\s*=\s*0(\.0+)?\b/.test(args)) add("warning", "costs", "zero-commission", "commission_value is 0.");
  }

  // Input defaults must be compile-time constants, or TradingView refuses to compile (CE10123).
  for (const d of inputTimeDefaults(code)) {
    const t = d.text.trim().replace(/^defval\s*=\s*/, "");
    if (/^timestamp\s*\(/.test(t) && !CONST_TS.test(t)) add("error", "compile", "input-time-const", `input.time default ${t} is not a constant (TradingView error CE10123). Use the one-string form, e.g. timestamp("01 Jan 2020 00:00 +0000").`, code.slice(0, d.start).split("\n").length);
    else if (!/^timestamp\s*\(|^\d+$/.test(t)) add("error", "compile", "input-time-const", `input.time default "${t}" must be a constant such as timestamp("01 Jan 2020 00:00 +0000") (TradingView error CE10123).`, code.slice(0, d.start).split("\n").length);
  }

  // Repainting and leakage (§11.3)
  lines.forEach((l, i) => {
    if (/barmerge\.lookahead_on/.test(l) || /lookahead\s*=\s*barmerge\.lookahead_on/.test(l)) {
      const safe = /\[\s*1\s*\]/.test(l);
      add(safe ? "warning" : "error", "repaint", "lookahead_on", safe ? "lookahead_on with an offset [1] series: confirm this uses the approved confirmed-value helper." : "barmerge.lookahead_on without a [1]-offset confirmed series leaks future data.", i + 1);
    }
    if (/request\.security\s*\(/.test(l) && !/lookahead/.test(l) && !/\[\s*1\s*\]/.test(l) && !/barstate\.isconfirmed/.test(code)) add("warning", "repaint", "security-unconfirmed", "request.security without a confirmed-value pattern may repaint on realtime bars.", i + 1);
    if (/request\.security_lower_tf\s*\(/.test(l)) add("warning", "mtf", "lower-tf", "Lower-timeframe request: document the aggregation rule (§11.5).", i + 1);
    if (/offset\s*=\s*-\s*\d+/.test(l)) add("error", "repaint", "negative-offset", "Negative plot offset implies earlier signals than were available.", i + 1);
    if (/\[\s*-\s*\d+\s*\]/.test(l)) add("error", "repaint", "future-ref", "Negative history reference (future bar).", i + 1);
    if (/\bbarstate\.isrealtime\b/.test(l)) add("warning", "repaint", "realtime-branch", "Logic branching on barstate.isrealtime behaves differently historically.", i + 1);
    if (/\btimenow\b/.test(l)) add("warning", "repaint", "timenow", "timenow changes on every execution and repaints historical logic.", i + 1);
    if (/\b(heikinashi|renko|kagi|linebreak|pointfigure)\s*\(/.test(l) || /ticker\.(heikinashi|renko|kagi|linebreak|pointfigure)/.test(l)) add("error", "chart", "non-standard", "Non-standard chart data used; fills must use standard OHLC.", i + 1);
    if (/\bstrategy\.(entry|order)\s*\(/.test(l) && /strategy\.position_size\s*[<>]/.test(code) && /\bqty\s*=\s*strategy\.position_size\s*\*/.test(l)) add("error", "risk", "martingale", "Position size derived from current position (averaging/martingale).", i + 1);
  });
  if (/\bvarip\b/.test(code)) add("warning", "repaint", "varip", "varip variables persist intrabar and differ between history and realtime.", lineOf(/\bvarip\b/));

  // Structure and risk
  const entries = [...code.matchAll(/strategy\.entry\s*\(\s*"([^"]+)"/g)].map(m => m[1]);
  const exits = [...code.matchAll(/strategy\.exit\s*\(\s*"[^"]*"\s*,\s*"([^"]+)"/g)].map(m => m[1]);
  const exitsFrom = [...code.matchAll(/from_entry\s*=\s*"([^"]+)"/g)].map(m => m[1]);
  if (!entries.length) add("error", "structure", "no-entry", "No strategy.entry() calls found.");
  if (!/strategy\.exit\s*\(/.test(code)) add("error", "risk", "no-exit", "No strategy.exit(): one stop-loss per trade is mandatory.");
  else if (!/\bstop\s*=/.test(code)) add("error", "risk", "no-stop", "strategy.exit() without stop=.");
  for (const e of entries) if (![...exits, ...exitsFrom].includes(e)) add("warning", "structure", "unpaired-entry", `Entry "${e}" has no strategy.exit() with matching from_entry.`);
  if (!/barstate\.isconfirmed/.test(code)) add("warning", "repaint", "unconfirmed", "Signals are not gated on barstate.isconfirmed.");
  if (!/\balert\s*\(|alert_message\s*=/.test(code)) add("warning", "alerts", "no-alerts", "No alert() calls or alert_message payloads.");
  else if (!/strategyVersionId|deploymentId/.test(raw)) add("warning", "alerts", "alert-ids", "Alert payload does not identify deploymentId / strategyVersionId (§11.10).");
  if (!/input\.time\s*\(|timestamp\s*\(/.test(code)) add("warning", "segments", "no-date-window", "No date-window inputs (input.time) for segment testing.");
  if (!/ARF-OS Strategy ID/.test(raw)) add("warning", "metadata", "header", "Missing ARF-OS metadata header (§11.9).");
  for (const m of code.matchAll(/input\.(int|float)\s*\(([^)]*)\)/g)) {
    if (!/minval\s*=/.test(m[2]) || !/maxval\s*=/.test(m[2])) add("warning", "parameters", "unbounded", `Unbounded input: input.${m[1]}(${m[2].slice(0, 40)}…) needs minval/maxval.`);
  }

  // SDL conformance
  if (sdl && args) {
    const cv = args.match(/commission_value\s*=\s*([\d.]+)/), sl = args.match(/\bslippage\s*=\s*(\d+)/);
    if (cv && Math.abs(+cv[1] - sdl.costs.commissionValue) > 1e-9) add("error", "sdl", "commission-mismatch", `commission_value ${cv[1]} ≠ SDL ${sdl.costs.commissionValue}.`);
    if (sl && +sl[1] !== sdl.costs.slippageTicks) add("error", "sdl", "slippage-mismatch", `slippage ${sl[1]} ≠ SDL ${sdl.costs.slippageTicks}.`);
    if (!/commission_type\s*=\s*strategy\.commission\.percent/.test(args)) add("error", "sdl", "commission-type", "commission_type must be strategy.commission.percent to match the SDL.");
    for (const p of sdl.parameters || []) if (!new RegExp("\\b" + p.key + "\\b").test(code)) add("warning", "sdl", "param-missing", `SDL parameter ${p.key} is not referenced in the source.`);
    const inputKeys = [...code.matchAll(/^\s*([a-zA-Z_]\w*)\s*=\s*input\.(int|float)\s*\(/gm)].map(m => m[1]);
    const declared = new Set((sdl.parameters || []).map(p => p.key));
    for (const k of inputKeys) if (!declared.has(k) && !/^(start|end|from|to|use|show|debug)/i.test(k)) add("warning", "sdl", "undeclared-input", `Numeric input "${k}" is not declared in the SDL parameter manifest.`);
    if (sdl.strategy.directions.length === 1 && entries.some(e => (sdl.strategy.directions[0] === "long" ? /short/i : /long/i).test(e))) add("error", "sdl", "direction", "Source trades a direction the SDL does not allow.");
  }
  const errors = findings.filter(f => f.severity === "error").length;
  return { version: LINT_VERSION, pass: errors === 0, errors, warnings: findings.length - errors, findings };
}
