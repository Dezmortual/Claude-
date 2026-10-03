// Practice arena (spec §10): blind benchmark tasks with hidden labels, deterministic scoring,
// and champion/challenger prompt governance. Practice never touches production datasets or budgets.

import * as db from "./db.js";
import { uuidv7, nowIso, hashObject, mean } from "./util.js";
import { runAgent, championPrompt } from "./workflow.js";
import { validateSDL, SDL_TEMPLATE } from "./sdl.js";
import { lintPine } from "./pine-lint.js";
import { runBacktest } from "./runner.js";
import { syntheticBars } from "./synthetic.js";

const BARS = () => syntheticBars({ n: 2500, seed: 11 });
const clone = o => JSON.parse(JSON.stringify(o));

function refSDL(name, indicators, signals, params, extra = {}) {
  const s = clone(SDL_TEMPLATE);
  s.strategy.name = name; s.strategy.thesis = name; s.indicators = indicators; s.signals = { longExit: "", shortExit: "", ...signals }; s.parameters = params;
  s.risk.stopLoss = { type: "percent", value: 2 }; s.risk.takeProfit = { type: "risk_multiple", value: 2 };
  return Object.assign(s, extra);
}

export const SUITES = {
  scout_claims: {
    agent: "scout", name: "Idea Scout — separate falsifiable ideas from marketing claims", visible: false,
    items: [
      { id: "s1", input: { direction: { title: "Evaluate claim", question: "\"Buy BTC whenever RSI crosses 30 — 80% win rate guaranteed!\" (social media post, no data)", rationale: "user submitted", priority: "high" } }, label: "not_research" },
      { id: "s2", input: { direction: { title: "Volatility compression breakouts", question: "Do breakouts from 20-bar ranges after ATR contracts to a 100-bar low continue more often than random on 4h crypto bars?", rationale: "volatility clustering literature", priority: "high" } }, label: "research" },
      { id: "s3", input: { direction: { title: "Insider flow", question: "Trade ahead of exchange listing announcements using private Telegram tips.", rationale: "", priority: "high" } }, label: "not_research" },
      { id: "s4", input: { direction: { title: "Time-series momentum", question: "Does the sign of the trailing 30-day return predict the next week's return sign on BTC daily bars?", rationale: "TSMOM papers", priority: "medium" } }, label: "research" },
      { id: "s5", input: { direction: { title: "Secret indicator", question: "My proprietary 'Quantum Wave' indicator (code not available) prints buy arrows that never lose.", rationale: "", priority: "high" } }, label: "not_research" }
    ],
    score: (out, item) => {
      const recs = (out.ideas || []).map(i => i.recommendation);
      const anyResearch = recs.includes("RESEARCH");
      const ok = item.label === "research" ? anyResearch : !anyResearch;
      return { score: ok ? 1 : 0, detail: `recommendations: ${recs.join(", ") || "none"}` };
    },
    wrap: item => ({ ...item.input, market: { symbol: "BTCUSDT", timeframe: "240", source: "binance" }, dataAvailable: "OHLCV only", existingIdeas: [], graveyard: [], maxIdeas: 2 })
  },
  architect_prose: {
    agent: "architect", name: "Strategy Architect — prose to deterministic SDL", visible: false,
    items: [
      { id: "a1", prose: "Long only. Enter when the 20-period EMA of close crosses above the 50-period EMA. Stop 2% below entry, target 2R. No exit signal. Parameters: none.", ref: refSDL("ema cross", [{ id: "fast", type: "ema", source: "close", length: 20 }, { id: "slow", type: "ema", source: "close", length: 50 }], { longEntry: "crosses_above(fast, slow)", shortEntry: "" }, [], { strategy: { name: "ema cross", family: "trend", thesis: "x", directions: ["long"] } }) },
      { id: "a2", prose: "Long and short. Long when close breaks above the highest high of the previous 20 bars; short when close breaks below the lowest low of the previous 20 bars. Stop 2% from entry, target 2R.", ref: refSDL("donchian", [{ id: "hh", type: "highest", source: "high", length: 20 }, { id: "ll", type: "lowest", source: "low", length: 20 }], { longEntry: "close > hh[1]", shortEntry: "close < ll[1]" }, []) },
      { id: "a3", prose: "Long only. Enter when 14-period RSI of close crosses back above 30 (from below). Exit when RSI rises above 70. Stop 2% below entry, target 2R.", ref: refSDL("rsi revert", [{ id: "rsi14", type: "rsi", source: "close", length: 14 }], { longEntry: "crosses_above(rsi14, 30)", shortEntry: "", longExit: "rsi14 > 70" }, [], { strategy: { name: "rsi revert", family: "mean_reversion", thesis: "x", directions: ["long"] } }) }
    ],
    score: (out, item) => {
      const sdl = out.sdl; if (!sdl) return { score: 0, detail: "no sdl" };
      sdl.market.timeframe = "240"; sdl.costs.tickSize = 0.01; sdl.risk.stopLoss = { type: "percent", value: 2 }; sdl.risk.takeProfit = { type: "risk_multiple", value: 2 };
      for (const k of ["longExit", "shortExit", "longEntry", "shortEntry"]) if (sdl.signals[k] === undefined) sdl.signals[k] = "";
      const v = validateSDL(sdl);
      if (!v.ok) return { score: 0, detail: "invalid: " + v.errors.slice(0, 2).join("; ") };
      const bars = BARS();
      const a = runBacktest(item.ref, bars, {}, { recordEquity: false }).trades.map(t => t.entryTime + t.dir);
      const b = new Set(runBacktest(sdl, bars, {}, { recordEquity: false }).trades.map(t => t.entryTime + t.dir));
      const overlap = a.length ? a.filter(x => b.has(x)).length / Math.max(a.length, b.size) : 0;
      return { score: 0.3 + 0.7 * overlap, detail: `valid; trade overlap with reference ${(overlap * 100).toFixed(0)}%` };
    },
    wrap: item => ({ idea: { title: "Practice", hypothesis: item.prose }, indicatorCards: [], market: { symbol: "PRACTICE:SYNTH", timeframe: "240", tickSize: 0.01 }, instruction: "Translate the prose exactly. Do not add filters or parameters that the prose does not state. Use the warm-up and segment defaults you consider correct." })
  },
  pine_from_sdl: {
    agent: "pine", name: "Pine Engineer — implement a reference SDL that passes Pine QA", visible: true,
    items: [{ id: "p1", sdl: SDL_TEMPLATE }],
    score: (out, item) => { const l = lintPine(out.source || "", item.sdl); return { score: l.pass ? Math.max(0.5, 1 - 0.05 * l.warnings) : 0, detail: `${l.errors} errors, ${l.warnings} warnings` }; },
    wrap: item => ({ sdl: item.sdl, ids: { strategyId: "practice", strategyVersionId: "practice-v1", sdlHash: "practice", parentVersionId: "none", campaignId: "practice" }, strategyName: item.sdl.strategy.name })
  },
  data_defects: {
    agent: "data", name: "Data Integrity — escalate defective datasets", visible: false,
    items: [
      { id: "d1", integrity: { bars: 8000, duplicates: 0, outOfOrder: 0, missing: 0, badOhlc: 0, zeroVolume: 3, errors: [], warnings: [], status: "OK" }, label: "ok" },
      { id: "d2", integrity: { bars: 8000, duplicates: 37, outOfOrder: 2, missing: 0, badOhlc: 0, zeroVolume: 0, errors: ["37 duplicate bars", "2 out-of-order bars"], warnings: [], status: "QUARANTINED" }, label: "escalate" },
      { id: "d3", integrity: { bars: 320, duplicates: 0, outOfOrder: 0, missing: 0, badOhlc: 0, zeroVolume: 0, errors: ["Insufficient history: 320 bars (need ≥ 500)"], warnings: [], status: "QUARANTINED" }, label: "escalate" },
      { id: "d4", integrity: { bars: 9000, duplicates: 0, outOfOrder: 0, missing: 1100, missingPct: 10.9, badOhlc: 4, zeroVolume: 0, errors: ["1100 missing bars (10.9%)", "4 bars with impossible OHLC values"], warnings: [], status: "QUARANTINED" }, label: "escalate" }
    ],
    score: (out, item) => ({ score: (item.label === "escalate") === (out.verdict === "ESCALATE") ? 1 : 0, detail: "verdict " + out.verdict }),
    wrap: item => ({ dataset: { source: "practice", symbol: "SYNTH", timeframe: "240" }, integrity: item.integrity })
  },
  judge_incomplete: {
    agent: "judge", name: "Strategy Judge — never promote on incomplete or failed evidence", visible: false,
    items: [
      { id: "j1", pack: { evidence: { grade: "B", score: 68, hardFails: [], gates: [{ name: "Positive final holdout net result", pass: null, detail: "not run", required: true }] }, finalHoldout: null, note: "holdout not run" }, label: "no_promote" },
      { id: "j2", pack: { evidence: { grade: "F", score: 72, hardFails: ["Repainting/lookahead construct in Pine source"], gates: [] }, validatorReport: { recommendation: "RESEARCH_APPROVE" } }, label: "no_promote" },
      { id: "j3", pack: { evidence: { grade: "A", score: 84, hardFails: [], softConcerns: ["No TradingView parity check yet"], gates: [{ name: "≥ 100 closed trades across evidence", pass: true, detail: "412 trades", required: true }, { name: "Positive final holdout net result", pass: true, detail: "1840.22", required: true }, { name: "Out-of-sample PF > 1.1 (walk-forward)", pass: true, detail: "1.34", required: true }, { name: "≥ 60% positive segments", pass: true, detail: "83%", required: true }, { name: "Neighbour survival ≥ 50%", pass: true, detail: "88%", required: true }] }, validatorReport: { recommendation: "PAPER_TEST", rejectionCase: "Single symbol; parity unverified." } }, label: "promote_ok" }
    ],
    score: (out, item) => { const promote = ["RESEARCH_APPROVED", "PAPER_TEST_RECOMMENDED"].includes(out.decision); return { score: item.label === "no_promote" ? (promote ? 0 : 1) : (promote ? 1 : 0.5), detail: "decision " + out.decision }; },
    wrap: item => ({ ...item.pack, practice: true })
  },
  forward_infra: {
    agent: "forward", name: "Forward Operator — infrastructure vs strategy failure", visible: false,
    items: [
      { id: "f1", snap: { deployment: { status: "DEGRADED" }, snapshot: { lastBarTime: "3 days ago", trades: 0, drift: { expectedTrades: 4, actualTrades: 0 }, health: { issues: ["Last closed bar is stale", "Data fetch failed: 503"] } } }, label: "infra" },
      { id: "f2", snap: { deployment: { status: "ACTIVE" }, snapshot: { lastBarTime: "1 bar ago", trades: 30, netReturnPct: -9.5, drift: { expectedTrades: 28, actualTrades: 30, winRate: 22, expectedWinRate: 48, winRateZ: -2.85, flag: true }, health: { issues: [] } } }, label: "strategy" },
      { id: "f3", snap: { deployment: { status: "ACTIVE" }, snapshot: { lastBarTime: "1 bar ago", trades: 6, netReturnPct: 1.2, drift: { expectedTrades: 7, actualTrades: 6, winRate: 50, expectedWinRate: 47, flag: false }, health: { issues: [] } } }, label: "healthy" }
    ],
    score: (out, item) => {
      const map = { infra: ["FAILED_INFRA", "DEGRADED"], strategy: ["DRIFTING"], healthy: ["HEALTHY"] };
      return { score: map[item.label].includes(out.health) ? 1 : 0, detail: `health ${out.health}, recommendation ${out.recommendation}` };
    },
    wrap: item => item.snap
  }
};

export async function runPractice(suiteId, { promptId = null, onItem = () => {} } = {}) {
  const suite = SUITES[suiteId];
  const prompt = promptId ? await db.get("prompts", promptId) : await championPrompt(suite.agent);
  const items = [];
  let cost = 0;
  for (const item of suite.items) {
    try {
      const { output, run } = await runAgent(suite.agent, suite.wrap(item), { practice: true, promptOverride: prompt });
      cost += run.cost;
      const s = suite.score(clone(output), item);
      items.push({ id: item.id, ...s, runId: run.id });
    } catch (e) { items.push({ id: item.id, score: 0, detail: "error: " + e.message }); }
    onItem(items.length, suite.items.length);
  }
  const rec = { id: uuidv7(), suiteId, agentId: suite.agent, promptId: prompt.id, promptVersion: prompt.version, promptStatus: prompt.status, items, score: mean(items.map(i => i.score)), cost, createdAt: nowIso() };
  await db.put("practiceRuns", rec);
  await db.audit("practice.run", { suiteId, promptId: prompt.id, score: rec.score });
  return rec;
}

export async function createChallenger(agentId, text, notes) {
  const all = await db.all("prompts", p => p.agentId === agentId);
  await championPrompt(agentId);
  const version = Math.max(1, ...all.map(p => p.version)) + 1;
  const p = { id: `${agentId}-v${version}`, agentId, version, text, status: "challenger", notes, createdAt: nowIso(), hash: await hashObject(text) };
  await db.put("prompts", p);
  await db.audit("prompt.challenger_created", { agentId, version }, { type: "human", id: "operator" });
  return p;
}

// Promotion needs a challenger practice run on every suite for this agent, scored at least as well as the champion's latest run.
export async function promotionCheck(challengerId) {
  const ch = await db.get("prompts", challengerId);
  const champ = await championPrompt(ch.agentId);
  const suites = Object.entries(SUITES).filter(([, s]) => s.agent === ch.agentId).map(([id]) => id);
  const runs = await db.all("practiceRuns");
  const latest = (pid, sid) => runs.filter(r => r.promptId === pid && r.suiteId === sid).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const rows = suites.map(sid => ({ suiteId: sid, champion: latest(champ.id, sid), challenger: latest(ch.id, sid) }));
  const ready = rows.length > 0 && rows.every(r => r.champion && r.challenger);
  const better = ready && rows.every(r => r.challenger.score >= r.champion.score);
  return { challenger: ch, champion: champ, rows, ready, better, noSuite: rows.length === 0 };
}
export async function promote(challengerId, reason) {
  const chk = await promotionCheck(challengerId);
  if (!chk.noSuite && !chk.ready) throw new Error("Run every practice suite for both champion and challenger first.");
  if (!reason) throw new Error("Give a reason for the promotion.");
  await db.update("prompts", chk.champion.id, { status: "retired", retiredAt: nowIso() });
  await db.update("prompts", challengerId, { status: "champion", promotedAt: nowIso(), promotionReason: reason, regressed: chk.ready && !chk.better });
  await db.audit("prompt.promoted", { agentId: chk.challenger.agentId, from: chk.champion.version, to: chk.challenger.version, reason, regressed: chk.ready && !chk.better }, { type: "human", id: "operator" });
}
export async function rollback(promptId, reason) {
  const p = await db.get("prompts", promptId);
  const cur = await championPrompt(p.agentId);
  await db.update("prompts", cur.id, { status: "retired" });
  await db.update("prompts", promptId, { status: "champion" });
  await db.audit("prompt.rollback", { agentId: p.agentId, to: p.version, reason }, { type: "human", id: "operator" });
}
