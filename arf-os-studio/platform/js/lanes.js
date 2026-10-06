// Lane handlers: what each task kind does and what the orchestrator queues next (spec §5, §7, §12).
// Protected data rule: final-holdout results only ever appear in VALIDATE and JUDGE inputs.

import * as db from "./db.js";
import { uuidv7, nowIso, hashObject, timeframeMs } from "./util.js";
import { enqueue, runAgent, transition, handoff, artefact, registerHandlers, championPrompt } from "./workflow.js";
import { validateSDL, gridSize, longestLookback } from "./sdl.js";
import { lintPine, fixPineConstants } from "./pine-lint.js";
import { generatePine, PINE_GEN_VERSION } from "./pine-gen.js";
import { fetchBars, integrityReport, datasetChecksum, inferTickSize, realisticCosts, costsLookUnrealistic } from "./data.js";
import { evaluateEvidence, POLICIES } from "./research.js";
import { parseTradingViewTrades, parity as parityCheck } from "./tv.js";
import { computeMetrics } from "./metrics.js";
import { mean, stdev } from "./util.js";

/* ---------------- Research worker bridge ---------------- */
let worker = null, seq = 0;
const waiting = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.onmessage = e => {
      const w = waiting.get(e.data.id); if (!w) return;
      if (e.data.progress) return w.progress(e.data.progress);
      waiting.delete(e.data.id);
      e.data.error ? w.reject(new Error(e.data.error)) : w.resolve(e.data.result);
    };
    worker.onerror = () => { worker = false; };
  } catch (_) { worker = false; }
  return worker;
}
export async function research(op, payload, progress = () => {}) {
  const w = getWorker();
  if (!w) { const { execute } = await import("./worker.js"); return execute(op, payload, progress); }
  const id = ++seq;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject, progress }); w.postMessage({ id, op, payload }); });
}

/* ---------------- Helpers ---------------- */
const r2 = x => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 100) / 100 : x);
const slimMetrics = m => m && Object.fromEntries(["tradeCount", "netProfit", "totalReturn", "profitFactor", "winRate", "maxDrawdown", "sharpe", "sortino", "expectancy", "avgBarsHeld", "exposurePct", "topTradeShare", "positiveMonthsPct", "longCount", "shortCount", "longNet", "shortNet", "commissionShareOfGross", "longestDrawdownDays"].filter(k => k in m).map(k => [k, r2(m[k])]));
export async function loadBars(datasetId) { return db.get("bars", datasetId); }
// Versions created in the Backtest Lab have no campaign: they run under the default policy with no budget.
async function campaignOf(id) { return (id && await db.get("campaigns", id)) || { id: null, policy: "discovery", market: {}, budget: {}, maxCandidates: 0 }; }
async function graveyard(excludeCampaign = null) {
  const versions = await db.all("versions");
  const strategies = Object.fromEntries((await db.all("strategies")).map(s => [s.id, s]));
  const live = versions.filter(v => ["REJECTED", "ARCHIVED", "REWORK_REQUESTED"].includes(v.status)).slice(-40).map(v => ({ name: strategies[v.strategyId]?.name, thesis: v.sdl?.strategy?.thesis, status: v.status, reason: v.lastDecisionSummary || "" }));
  // Deleted rejected versions leave a one-line lesson, so agents still avoid repeating them.
  const kept = (await db.all("lessons", l => l.kind === "deleted_rejected")).map(l => ({ name: l.name, thesis: l.thesis, status: "REJECTED", reason: l.reason }));
  return [...kept, ...live].slice(-40);
}
function words(s) { return new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3)); }
function similarity(a, b) { const A = words(a), B = words(b); const inter = [...A].filter(x => B.has(x)).length; return inter / Math.max(1, Math.min(A.size, B.size)); }
async function touchCampaign(campaignId) { if (!campaignId) return; const c = await db.get("campaigns", campaignId); if (c && c.status === "COMPLETED") await db.update("campaigns", campaignId, { status: "RUNNING" }); }
async function q(kind, opts) { await touchCampaign(opts.campaignId); return enqueue(kind, opts); }

/* ---------------- Campaign lifecycle ---------------- */
export async function createCampaign(form) {
  const c = {
    id: uuidv7(), name: form.name, brief: form.brief, status: "DRAFT", policy: form.policy || "discovery",
    market: { source: form.source, symbol: form.symbol, timeframe: form.timeframe, historyDays: +form.historyDays || 1460, uploadedDatasetId: form.uploadedDatasetId || null },
    maxDirections: +form.maxDirections || 3, maxCandidates: +form.maxCandidates || 3, autoTriage: form.autoTriage !== false,
    budget: { maxCalls: +form.maxCalls || 60, maxCostUsd: +form.maxCostUsd || 10 }, spend: { calls: 0, costUsd: 0, tokensIn: 0, tokensOut: 0 }, createdAt: nowIso()
  };
  await db.put("campaigns", c);
  await db.audit("campaign.created", { campaignId: c.id, name: c.name }, { type: "human", id: "operator" });
  return c;
}
export async function startCampaign(id) {
  const c = await db.get("campaigns", id);
  await db.update("campaigns", id, { status: "RUNNING", startedAt: c.startedAt || nowIso(), pauseReason: null });
  await db.audit("campaign.started", { campaignId: id }, { type: "human", id: "operator" });
  const existing = await db.all("tasks", t => t.campaignId === id);
  if (!existing.length) await enqueue("DATA_FETCH", { campaignId: id, lane: "data", title: `Load ${c.market.symbol} ${c.market.timeframe} data` });
  else { const { pump } = await import("./workflow.js"); for (const t of existing.filter(t => t.status === "WAITING_HUMAN" && t.error?.code === "budget")) await db.update("tasks", t.id, { status: "QUEUED" }); pump(); }
}
export async function pauseCampaign(id) { await db.update("campaigns", id, { status: "PAUSED" }); await db.audit("campaign.paused", { campaignId: id }, { type: "human", id: "operator" }); }
export async function cancelCampaign(id) {
  await db.update("campaigns", id, { status: "CANCELLED" });
  for (const t of await db.all("tasks", t => t.campaignId === id && ["QUEUED", "WAITING_HUMAN", "FAILED_RETRYABLE"].includes(t.status))) await db.update("tasks", t.id, { status: "CANCELLED" });
  await db.audit("campaign.cancelled", { campaignId: id }, { type: "human", id: "operator" });
}
export async function checkCampaignIdle(campaignId) {
  if (!campaignId) return;
  const open = await db.all("tasks", t => t.campaignId === campaignId && ["QUEUED", "RUNNING", "WAITING_HUMAN"].includes(t.status));
  const c = await db.get("campaigns", campaignId);
  if (!open.length && c && c.status === "RUNNING") { await db.update("campaigns", campaignId, { status: "COMPLETED", completedAt: nowIso() }); await db.audit("campaign.idle", { campaignId }); }
}

/* ---------------- Datasets ---------------- */
export async function saveDataset({ campaignId = null, source, symbol, timeframe, bars, tickSize, note = "", market = "24x7" }) {
  const integrity = integrityReport(bars, timeframe, { market });
  const checksum = await datasetChecksum(bars);
  const ds = { id: uuidv7(), campaignId, source, symbol, timeframe, bars: bars.t.length, from: bars.t[0], to: bars.t[bars.t.length - 1], checksum, integrity, status: integrity.status, tickSize: tickSize || inferTickSize(bars), note, market, createdAt: nowIso(), version: 1 };
  await db.put("datasets", ds);
  await db.put("bars", { id: ds.id, ...bars });
  await db.audit("dataset.created", { datasetId: ds.id, symbol, timeframe, bars: ds.bars, checksum, status: ds.status });
  return ds;
}

/* ---------------- Handlers ---------------- */
const H = {};

H.DATA_FETCH = async (task, { signal, progress }) => {
  const c = await campaignOf(task.campaignId);
  let ds;
  if (c.market.uploadedDatasetId) ds = await db.get("datasets", c.market.uploadedDatasetId);
  else {
    const from = Date.now() - c.market.historyDays * 86_400_000;
    const bars = await fetchBars({ source: c.market.source, symbol: c.market.symbol, timeframe: c.market.timeframe, from, signal, onProgress: n => progress(`${n} bars`) });
    ds = await saveDataset({ campaignId: c.id, source: c.market.source, symbol: c.market.symbol, timeframe: c.market.timeframe, bars });
  }
  await db.update("campaigns", c.id, { datasetId: ds.id });
  await q("DATA_REVIEW", { campaignId: c.id, lane: "data", title: "Data integrity review", refs: { datasetId: ds.id } });
  if (ds.integrity.errors.length) {
    await db.update("campaigns", c.id, { status: "PAUSED", pauseReason: "Dataset quarantined: " + ds.integrity.errors.join("; ") });
    await db.audit("dataset.quarantined", { datasetId: ds.id, errors: ds.integrity.errors });
    return { result: { datasetId: ds.id, quarantined: true } };
  }
  await q("PLAN", { campaignId: c.id, lane: "orchestrator", title: "Decompose brief into research directions" });
  return { result: { datasetId: ds.id } };
};

H.DATA_REVIEW = async (task, { signal }) => {
  const ds = await db.get("datasets", task.refs.datasetId);
  const { output, run } = await runAgent("data", { dataset: { source: ds.source, symbol: ds.symbol, timeframe: ds.timeframe, from: new Date(ds.from).toISOString(), to: new Date(ds.to).toISOString(), checksum: ds.checksum, tickSize: ds.tickSize }, integrity: ds.integrity }, { campaignId: task.campaignId, taskId: task.id, signal });
  await db.update("datasets", ds.id, { review: output, reviewRunId: run.id });
  if (output.verdict === "ESCALATE") await db.audit("dataset.escalated", { datasetId: ds.id, issues: output.issues });
  return { result: { verdict: output.verdict } };
};

H.PLAN = async (task, { signal }) => {
  const c = await campaignOf(task.campaignId);
  const ds = await db.get("datasets", c.datasetId);
  const input = { brief: c.brief, market: { symbol: c.market.symbol, source: c.market.source, timeframe: c.market.timeframe, history: `${new Date(ds.from).toISOString().slice(0, 10)} → ${new Date(ds.to).toISOString().slice(0, 10)}` }, dataAvailable: "OHLCV for this one symbol and timeframe only", maxDirections: c.maxDirections, policy: c.policy, graveyard: await graveyard() };
  const { output, run } = await runAgent("orchestrator", input, { campaignId: c.id, taskId: task.id, signal });
  const art = await artefact("CampaignPlan", output, { campaignId: c.id, agentRunId: run.id });
  await db.update("campaigns", c.id, { planArtefactId: art.id });
  const order = { high: 0, medium: 1, low: 2 };
  const dirs = [...output.directions].sort((a, b) => order[a.priority] - order[b.priority]).slice(0, c.maxDirections);
  for (const d of dirs) {
    await handoff({ campaignId: c.id, from: "orchestrator", to: "IDEA_SCOUT", taskId: task.id, output, artefactIds: [art.id], requestedAction: "Research a direction" });
    await q("SCOUT", { campaignId: c.id, lane: "scout", title: `Scout: ${d.title}`, input: { direction: d } });
  }
  return { result: { directions: dirs.length } };
};

H.SCOUT = async (task, { signal }) => {
  const c = await campaignOf(task.campaignId);
  const existing = await db.all("ideas");
  const input = { direction: task.input.direction, market: { symbol: c.market.symbol, timeframe: c.market.timeframe, source: c.market.source }, dataAvailable: "OHLCV for this one symbol and timeframe only", existingIdeas: existing.slice(-40).map(i => i.title), graveyard: await graveyard(), maxIdeas: 3 };
  const { output, run } = await runAgent("scout", input, { campaignId: c.id, taskId: task.id, signal });
  const art = await artefact("IdeaCards", output, { campaignId: c.id, agentRunId: run.id });
  const created = [];
  for (const card of output.ideas) {
    const dup = existing.concat(created).find(i => similarity(i.title + " " + i.hypothesis, card.title + " " + card.hypothesis) > 0.7);
    const idea = { id: uuidv7(), campaignId: c.id, direction: task.input.direction.title, ...card, duplicateOf: dup ? dup.id : null, status: "NEW", agentRunId: run.id, artefactId: art.id, createdAt: nowIso() };
    await db.put("ideas", idea);
    created.push(idea);
  }
  if (c.autoTriage) for (const idea of created) await autoTriage(idea);
  else for (const idea of created) await db.update("ideas", idea.id, { status: "AWAITING_TRIAGE" });
  return { result: { ideas: created.length } };
};

async function autoTriage(idea) {
  const c = await campaignOf(idea.campaignId);
  const accepted = await db.all("ideas", i => i.campaignId === c.id && i.status === "ACCEPTED");
  if (idea.duplicateOf) return decideIdea(idea.id, "MERGED", "Near-duplicate of an existing idea", { type: "system", id: "orchestrator" });
  if (idea.recommendation === "REJECT" || idea.pineFeasibility === "INFEASIBLE") return decideIdea(idea.id, "REJECTED", idea.recommendation === "REJECT" ? "Scout recommended rejection" : "Not feasible with OHLCV/Pine", { type: "system", id: "orchestrator" });
  if (idea.recommendation === "PARK" || idea.pineFeasibility === "LIMITED") return decideIdea(idea.id, "PARKED", "Parked by policy (scout recommendation or limited feasibility)", { type: "system", id: "orchestrator" });
  if (accepted.length >= c.maxCandidates) return decideIdea(idea.id, "PARKED", `Candidate limit (${c.maxCandidates}) reached`, { type: "system", id: "orchestrator" });
  return decideIdea(idea.id, "ACCEPTED", "Meets triage policy", { type: "system", id: "orchestrator" });
}

export async function decideIdea(ideaId, status, reason, actor = { type: "human", id: "operator" }) {
  const idea = await db.update("ideas", ideaId, { status, triageReason: reason, triagedBy: actor, triagedAt: nowIso() });
  await db.audit("idea." + status.toLowerCase(), { ideaId, reason }, actor);
  if (status === "ACCEPTED") {
    await handoff({ campaignId: idea.campaignId, from: "scout", to: "INDICATOR_RESEARCHER", taskId: null, output: { summary: idea.hypothesis, assumptions: [], unknowns: [], status: "COMPLETE" }, artefactIds: idea.artefactId ? [idea.artefactId] : [], requestedAction: "Qualify indicators for an idea" });
    await q("INDICATORS", { campaignId: idea.campaignId, lane: "indicator", title: `Indicators: ${idea.title}`, refs: { ideaId } });
  }
  return idea;
}

H.INDICATORS = async (task, { signal }) => {
  const idea = await db.get("ideas", task.refs.ideaId);
  const c = await campaignOf(idea.campaignId);
  const input = { idea: pickIdea(idea), market: { symbol: c.market.symbol, timeframe: c.market.timeframe } };
  const { output, run } = await runAgent("indicator", input, { campaignId: c.id, taskId: task.id, signal });
  const art = await artefact("IndicatorCards", output, { campaignId: c.id, ideaId: idea.id, agentRunId: run.id });
  for (const card of output.cards) await db.put("indicators", { id: uuidv7(), campaignId: c.id, ideaId: idea.id, ...card, agentRunId: run.id, createdAt: nowIso() });
  await handoff({ campaignId: c.id, from: "indicator", to: "STRATEGY_ARCHITECT", taskId: task.id, output, artefactIds: [art.id], requestedAction: "Create a deterministic strategy definition" });
  await q("ARCHITECT", { campaignId: c.id, lane: "architect", title: `Architect: ${idea.title}`, refs: { ideaId: idea.id }, input: { indicatorArtefactId: art.id } });
  return { result: { cards: output.cards.length } };
};
const pickIdea = i => ({ title: i.title, hypothesis: i.hypothesis, mechanism: i.mechanism, expectedDirection: i.expectedDirection, expectedRegime: i.expectedRegime, failureRegime: i.failureRegime, cheapestFalsificationTest: i.cheapestFalsificationTest, risks: i.risks });

// Orchestrator scope normalisation: the campaign fixes market, timeframe and tick size. Recorded, never silent.
function normaliseSDL(sdl, c, ds) {
  const notes = [];
  sdl.market = sdl.market || {};
  const sym = `${c.market.source.toUpperCase()}:${c.market.symbol.toUpperCase()}`;
  if (sdl.market.timeframe !== c.market.timeframe) { notes.push(`market.timeframe ${sdl.market.timeframe} → ${c.market.timeframe} (campaign scope)`); sdl.market.timeframe = c.market.timeframe; }
  if (JSON.stringify(sdl.market.symbols) !== JSON.stringify([sym])) { notes.push(`market.symbols → ["${sym}"] (campaign scope)`); sdl.market.symbols = [sym]; }
  sdl.costs = sdl.costs || {};
  if (sdl.costs.tickSize !== ds.tickSize) { notes.push(`costs.tickSize ${sdl.costs.tickSize} → ${ds.tickSize} (dataset)`); sdl.costs.tickSize = ds.tickSize; }
  for (const k of ["longExit", "shortExit", "longEntry", "shortEntry"]) if (sdl.signals && sdl.signals[k] === undefined) sdl.signals[k] = "";
  return notes;
}

async function architectLoop(agentInput, c, ds, task, signal) {
  let input = agentInput, last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { output, run } = await runAgent("architect", input, { campaignId: c.id, taskId: task.id, signal });
    const sdl = structuredClone(output.sdl);
    const notes = normaliseSDL(sdl, c, ds);
    const v = validateSDL(sdl);
    if (v.ok) return { output, run, sdl, notes, warnings: v.warnings, ambiguityDefects: attempt };
    last = v.errors;
    input = { ...agentInput, previousSDL: output.sdl, validationErrors: v.errors, instruction: "Your SDL failed validation by the research runner. Fix every error and return the full corrected output." };
  }
  throw Object.assign(new Error("The strategy definition still had problems after 3 attempts: " + last.slice(0, 4).join("; ")), { code: "sdl_invalid", sdlErrors: last });
}

H.ARCHITECT = async (task, { signal }) => {
  const idea = await db.get("ideas", task.refs.ideaId);
  const c = await campaignOf(idea.campaignId);
  const ds = await db.get("datasets", c.datasetId);
  const cards = (await db.get("artefacts", task.input.indicatorArtefactId))?.data?.cards || [];
  const input = { idea: pickIdea(idea), indicatorCards: cards, market: { symbol: `${c.market.source.toUpperCase()}:${c.market.symbol.toUpperCase()}`, timeframe: c.market.timeframe, tickSize: ds.tickSize, bars: ds.bars, history: `${new Date(ds.from).toISOString().slice(0, 10)} → ${new Date(ds.to).toISOString().slice(0, 10)}` }, policy: POLICIES[c.policy], parameterGridCap: 500 };
  const { output, run, sdl, notes, warnings, ambiguityDefects } = await architectLoop(input, c, ds, task, signal);
  const strategy = { id: uuidv7(), campaignId: c.id, ideaId: idea.id, name: sdl.strategy.name, family: sdl.strategy.family, createdAt: nowIso() };
  await db.put("strategies", strategy);
  const version = await createVersion({ strategy, c, ds, sdl, output, run, notes, warnings, ambiguityDefects, parent: null, changeReason: "Initial definition" });
  await handoff({ campaignId: c.id, strategyId: strategy.id, versionId: version.id, from: "architect", to: "PINE_ENGINEER", taskId: task.id, output, artefactIds: [version.sdlArtefactId], requestedAction: "Implement the SDL in Pine v6" });
  await db.update("ideas", idea.id, { strategyId: strategy.id });
  await q("PINE", { campaignId: c.id, lane: "pine", title: `Pine v6: ${strategy.name} v1`, refs: { versionId: version.id } });
  return { result: { versionId: version.id } };
};

async function createVersion({ strategy, c, ds, sdl, output, run, notes, warnings, ambiguityDefects, parent, changeReason, changeCategory = "initial", changedFields = [] }) {
  const sdlArt = await artefact("StrategyDefinition", { sdl, notes, warnings, expectedFailureModes: output.expectedFailureModes, backtestExpectations: output.backtestExpectations, ambiguityNotes: output.ambiguityNotes }, { campaignId: c.id, strategyId: strategy.id, agentRunId: run.id });
  const siblings = await db.all("versions", v => v.strategyId === strategy.id);
  const contaminated = parent ? [...new Set([...(parent.contaminatedDatasetIds || []), ...(parent.holdoutEvaluated ? [parent.datasetId] : [])])] : [];
  const v = {
    id: uuidv7(), strategyId: strategy.id, campaignId: c.id, versionNumber: siblings.reduce((m, x) => Math.max(m, x.versionNumber || 0), 0) + 1, parentVersionId: parent ? parent.id : null,
    status: "DEFINED", sdl, definitionHash: await hashObject(sdl), sdlArtefactId: sdlArt.id, createdByAgentRunId: run.id, changeReason, changeCategory, changedFields,
    normalisations: notes, sdlWarnings: warnings, ambiguityDefects, gridSize: gridSize(sdl), datasetId: ds.id, contaminatedDatasetIds: contaminated,
    pineRevisions: [], createdAt: nowIso()
  };
  await db.put("versions", v);
  await db.put("transitions", { id: uuidv7(), from_state: null, to_state: "DEFINED", strategy_version_id: v.id, strategyId: strategy.id, campaignId: c.id, decision: "CREATED", reason_codes: [changeCategory], free_text_summary: changeReason, evidence_ids: [sdlArt.id], policy_version: c.policy, actor_type: "agent", actor_id: "architect", created_at: nowIso(), human_override: false });
  await db.audit("strategy_version.created", { versionId: v.id, strategyId: strategy.id, versionNumber: v.versionNumber, parent: v.parentVersionId, contaminated });
  return v;
}

H.PINE = async (task, { signal }) => {
  const v = await db.get("versions", task.refs.versionId);
  const strategy = await db.get("strategies", v.strategyId);
  const base = { sdl: v.sdl, ids: { strategyId: v.strategyId, strategyVersionId: v.id, sdlHash: v.definitionHash, parentVersionId: v.parentVersionId || "none", campaignId: v.campaignId }, strategyName: strategy.name };
  // Mechanical compile fixes (constant input.time defaults) are applied before Pine QA and noted.
  const tidy = out => { const f = fixPineConstants(out.source); if (f.fixes.length) { out.source = f.source; out.deviations = [...(out.deviations || []), ...f.fixes.map(x => "Auto-fixed for TradingView: " + x)]; } return out; };
  let { output, run } = await runAgent("pine", base, { campaignId: v.campaignId, taskId: task.id, signal });
  output = tidy(output);
  let lint = lintPine(output.source, v.sdl);
  if (!lint.pass) {
    const retry = await runAgent("pine", { ...base, previousSource: output.source, lintFindings: lint.findings.filter(f => f.severity === "error"), instruction: "Pine QA rejected your source. Fix every error finding and return the complete corrected source." }, { campaignId: v.campaignId, taskId: task.id, signal });
    output = tidy(retry.output); run = retry.run; lint = lintPine(output.source, v.sdl);
  }
  const art = await artefact("PineRevision", { source: output.source, implementationNotes: output.implementationNotes, deviations: output.deviations, alertExamples: output.alertExamples, lint }, { campaignId: v.campaignId, strategyId: v.strategyId, versionId: v.id, agentRunId: run.id });
  const rev = { n: v.pineRevisions.length + 1, artefactId: art.id, sourceHash: art.hash.slice(0, 16), lintPass: lint.pass, errors: lint.errors, warnings: lint.warnings, createdAt: nowIso() };
  await db.update("versions", v.id, x => { x.pineRevisions.push(rev); x.pineArtefactId = art.id; });
  if (["DEFINED", "QA_FAILED"].includes(v.status)) await transition(v.id, lint.pass ? "PINE_READY" : "QA_FAILED", { reasons: lint.pass ? ["PINE_QA_PASS"] : ["PINE_QA_FAIL"], summary: `${lint.errors} errors, ${lint.warnings} warnings`, evidenceIds: [art.id], actor: { type: "agent", id: "pine" } });
  else await db.audit("pine.revision_added", { versionId: v.id, revision: rev.n, lintPass: lint.pass });
  if (!v.backtestId) await q("BACKTEST", { campaignId: v.campaignId, lane: "backtest", title: `Backtest plan: ${strategy.name} v${v.versionNumber}`, refs: { versionId: v.id } });
  return { result: { lintPass: lint.pass } };
};

H.BACKTEST = async (task, { progress }) => {
  const v = await db.get("versions", task.refs.versionId);
  const c = await campaignOf(v.campaignId);
  const bars = await loadBars(v.datasetId);
  await transition(v.id, "BACKTESTING", { reasons: ["PLAN_STARTED"], actor: { type: "system", id: "backtest-runner" } });
  const result = await research("backtest", { sdl: v.sdl, bars, policy: c.policy }, progress);
  const ds = await db.get("datasets", v.datasetId);
  const bt = { id: uuidv7(), versionId: v.id, strategyId: v.strategyId, campaignId: v.campaignId, datasetId: ds.id, datasetChecksum: ds.checksum, sdlHash: v.definitionHash, runner: result.plan.runner, result, createdAt: nowIso() };
  await db.put("backtests", bt);
  await db.update("versions", v.id, { backtestId: bt.id, selectedParams: result.selectedParams });
  await transition(v.id, "BACKTESTED", { reasons: [result.smoke.pass ? "SMOKE_PASS" : "SMOKE_FAIL"], summary: `validation PF ${r2(result.validation.metrics.profitFactor)}, ${result.validation.metrics.tradeCount} trades`, evidenceIds: [bt.id], actor: { type: "system", id: "backtest-runner" } });
  // Backtest Lab versions (no campaign) continue straight to the free robustness suite; AI reviews are optional.
  if (!v.campaignId) await q("VALIDATION_RUN", { campaignId: null, lane: "validator", title: `Robustness tests: v${v.versionNumber}`, refs: { versionId: v.id }, input: { withAgents: false } });
  else await q("BACKTEST_REPORT", { campaignId: v.campaignId, lane: "backtest", title: `Backtest report: v${v.versionNumber}`, refs: { versionId: v.id } });
  return { result: { backtestId: bt.id } };
};

export function backtestSummary(bt) {
  const r = bt.result;
  return {
    plan: { runner: r.plan.runner, metrics: r.plan.metrics, policy: r.plan.policy, segments: { development: segInfo(r.development), validation: segInfo(r.validation) }, selectionRule: r.search.rule, objective: r.search.objective, gridTried: r.search.tried, eligible: r.search.eligible },
    smoke: r.smoke, baseline: { params: r.baseline.params, metrics: slimMetrics(r.baseline.metrics) },
    selectedParams: r.selectedParams, selectionFellBack: r.selectionFellBack,
    topCandidates: [...r.search.rows].filter(x => x.eligible).sort((a, b) => b.plateau - a.plateau).slice(0, 8).map(x => ({ params: x.params, plateau: r2(x.plateau), ...Object.fromEntries(Object.entries(x.m).map(([k, v]) => [k, r2(v)])) })),
    development: slimMetrics(r.development.metrics), validation: slimMetrics(r.validation.metrics),
    walkForward: { mode: r.walkForward.mode, folds: r.walkForward.folds.map(f => ({ from: iso(f.from), to: iso(f.to), params: f.params, ...Object.fromEntries(Object.entries(f.metrics).map(([k, v]) => [k, r2(v)])) })), oos: Object.fromEntries(Object.entries(r.walkForward.oos).map(([k, v]) => [k, r2(v)])), positiveFoldsPct: r2(r.walkForward.positiveFoldsPct) },
    benchmarkBuyHoldPct: { development: r2(r.benchmark.development), validation: r2(r.benchmark.validation) }
  };
}
const iso = t => (t ? new Date(t).toISOString().slice(0, 10) : null);
const segInfo = s => ({ from: iso(s.window.from), to: iso(s.window.to), bars: s.end - s.start });

H.BACKTEST_REPORT = async (task, { signal }) => {
  const v = await db.get("versions", task.refs.versionId);
  const bt = await db.get("backtests", v.backtestId);
  const ds = await db.get("datasets", v.datasetId);
  const input = { sdl: v.sdl, backtest: backtestSummary(bt), dataset: { symbol: ds.symbol, timeframe: ds.timeframe, integrity: { status: ds.integrity.status, errors: ds.integrity.errors, warnings: ds.integrity.warnings } }, pineQA: v.pineRevisions.at(-1) || null, note: "The final holdout segment is protected and not part of this input." };
  const { output, run } = await runAgent("backtest", input, { campaignId: v.campaignId, taskId: task.id, signal });
  await db.update("backtests", bt.id, { report: output, reportRunId: run.id });
  const art = await artefact("BacktestReport", output, { campaignId: v.campaignId, versionId: v.id, agentRunId: run.id });
  const rec = output.recommendation;
  if (rec === "PROCEED_TO_VALIDATION") {
    await handoff({ campaignId: v.campaignId, strategyId: v.strategyId, versionId: v.id, from: "backtest", to: "ROBUSTNESS_VALIDATOR", taskId: task.id, output, artefactIds: [art.id], evidenceIds: [bt.id], requestedAction: "Attempt to break the strategy" });
    await q("VALIDATION_RUN", { campaignId: v.campaignId, lane: "validator", title: `Robustness + holdout: v${v.versionNumber}`, refs: { versionId: v.id } });
  } else if (rec === "REWORK_WITH_NEW_VERSION") await requestRework(v, output.concerns.join("; ") || output.summary, "backtest", art.id);
  else if (rec === "REJECT") { await transition(v.id, "REJECTED", { decision: "REJECT", reasons: ["BACKTEST_ENGINEER_REJECT"], summary: output.summary, evidenceIds: [art.id, bt.id], actor: { type: "agent", id: "backtest" } }); await db.update("versions", v.id, { lastDecisionSummary: output.summary }); }
  else return { status: "WAITING_HUMAN", result: { blocked: output.summary } };
  return { result: { recommendation: rec } };
};

async function requestRework(v, proposal, by, evidenceId) {
  const siblings = await db.all("versions", x => x.strategyId === v.strategyId);
  await transition(v.id, "REWORK_REQUESTED", { decision: "REWORK", reasons: ["REWORK_" + by.toUpperCase()], summary: proposal, evidenceIds: [evidenceId], actor: { type: "agent", id: by } });
  await db.update("versions", v.id, { lastDecisionSummary: proposal });
  if (siblings.length >= 1 + 3) {
    await db.audit("strategy.revision_limit", { strategyId: v.strategyId, versions: siblings.length });
    await q("REWORK", { campaignId: v.campaignId, lane: "architect", title: `Rework (needs human approval: revision limit)`, refs: { versionId: v.id }, input: { proposal, by }, status: "WAITING_HUMAN" });
    return;
  }
  await handoff({ campaignId: v.campaignId, strategyId: v.strategyId, versionId: v.id, from: by, to: "STRATEGY_ARCHITECT", taskId: null, output: { summary: proposal, status: "COMPLETE" }, artefactIds: evidenceId ? [evidenceId] : [], requestedAction: "Create a child version with one explicit change", protectedIncluded: false });
  await q("REWORK", { campaignId: v.campaignId, lane: "architect", title: `Rework v${v.versionNumber} → v${v.versionNumber + 1}`, refs: { versionId: v.id }, input: { proposal, by } });
}

H.REWORK = async (task, { signal }) => {
  const parent = await db.get("versions", task.refs.versionId);
  const c = await campaignOf(parent.campaignId);
  const ds = await db.get("datasets", parent.datasetId);
  const strategy = await db.get("strategies", parent.strategyId);
  const bt = parent.backtestId ? await db.get("backtests", parent.backtestId) : null;
  const input = {
    parentSDL: parent.sdl, parentVersion: parent.versionNumber, proposedChange: task.input.proposal, proposedBy: task.input.by,
    parentEvidence: bt ? { development: slimMetrics(bt.result.development.metrics), validation: slimMetrics(bt.result.validation.metrics), walkForwardOOS: bt.result.walkForward.oos } : null,
    market: { timeframe: c.market.timeframe, tickSize: ds.tickSize },
    instruction: "Create a child version that makes ONE explicit, pre-motivated change. List changedFields and changeCategory. Do not tune parameters to past results; justify ranges from the mechanism."
  };
  const { output, run, sdl, notes, warnings, ambiguityDefects } = await architectLoop(input, c, ds, task, signal);
  const v = await createVersion({ strategy, c, ds, sdl, output, run, notes, warnings, ambiguityDefects, parent, changeReason: task.input.proposal.slice(0, 500), changeCategory: output.changeCategory || "logic", changedFields: output.changedFields || [] });
  await q("PINE", { campaignId: c.id, lane: "pine", title: `Pine v6: ${strategy.name} v${v.versionNumber}`, refs: { versionId: v.id } });
  return { result: { childVersionId: v.id } };
};

export async function gatherEvidence(v) {
  const ds = await db.get("datasets", v.datasetId);
  const bt = v.backtestId ? await db.get("backtests", v.backtestId) : null;
  const val = v.validationId ? await db.get("validations", v.validationId) : null;
  const pine = v.pineArtefactId ? await db.get("artefacts", v.pineArtefactId) : null;
  const vers = (await db.all("verifications", x => x.versionId === v.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
  const dep = (await db.all("deployments", d => d.versionId === v.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] || null;
  const contaminated = (v.contaminatedDatasetIds || []).includes(v.datasetId);
  const forward = dep && dep.snapshot ? { trades: dep.snapshot.trades.length, days: (Date.now() - new Date(dep.startedAt).getTime()) / 86_400_000, drift: dep.snapshot.drift } : null;
  return { dataset: ds, lint: pine?.data?.lint || null, backtest: bt?.result || null, robustness: val?.robustness || null, holdout: val?.holdout || null, parity: vers ? { status: vers.status, explanation: vers.explanation } : null, forward, contaminated, sdl: v.sdl };
}

H.VALIDATION_RUN = async (task, { progress }) => {
  const v = await db.get("versions", task.refs.versionId);
  const c = await campaignOf(v.campaignId);
  const bars = await loadBars(v.datasetId);
  await transition(v.id, "VALIDATING", { reasons: ["VALIDATION_STARTED"], actor: { type: "system", id: "validation-runner" } });
  const robustness = await research("robustness", { sdl: v.sdl, bars, params: v.selectedParams, policy: c.policy }, progress);
  // Stage E: the holdout runs once per version. A retry reuses the stored result.
  let holdout = v.holdoutResult || null;
  if (!holdout) {
    holdout = await research("holdout", { sdl: v.sdl, bars, params: v.selectedParams });
    await db.update("versions", v.id, { holdoutEvaluated: true, holdoutEvaluatedAt: nowIso(), holdoutResult: holdout });
    await db.audit("protected.holdout_evaluated", { versionId: v.id, datasetId: v.datasetId, params: v.selectedParams }, { type: "system", id: "validation-runner" });
  }
  const val = { id: uuidv7(), versionId: v.id, strategyId: v.strategyId, campaignId: v.campaignId, robustness, holdout: { ...holdout, protected: true }, createdAt: nowIso() };
  await db.put("validations", val);
  await db.update("versions", v.id, { validationId: val.id });
  const ev = evaluateEvidence(await gatherEvidence({ ...v, validationId: val.id }), c.policy);
  await db.update("validations", val.id, { evidence: ev });
  await db.update("versions", v.id, { evidenceGrade: ev.grade, evidenceScore: ev.score });
  if (task.input && task.input.withAgents === false) {
    await transition(v.id, "VALIDATED", { decision: "ROBUSTNESS_COMPLETE", reasons: ["NO_AGENT_REVIEW"], summary: `Evidence grade ${ev.grade} (${ev.score}/100). No AI review requested.`, evidenceIds: [val.id], actor: { type: "system", id: "validation-runner" } });
    return { result: { grade: ev.grade, score: ev.score } };
  }
  await q("VALIDATE", { campaignId: v.campaignId, lane: "validator", title: `Validator review: v${v.versionNumber}`, refs: { versionId: v.id } });
  return { result: { grade: ev.grade, score: ev.score } };
};

function robustnessSummary(rob) {
  return { tests: rob.tests.map(t => ({ name: t.name, pass: t.pass, value: r2(t.value), detail: t.detail })), neighbourSurvivalPct: r2(rob.neighbourSurvival), positiveSegmentsPct: r2(rob.positiveSegmentsPct), segments: rob.segments.map(s => ({ from: iso(s.from), to: iso(s.to), net: r2(s.net), pf: r2(s.pf), dd: r2(s.dd), trades: s.trades })), monteCarlo: Object.fromEntries(Object.entries(rob.monteCarlo).filter(([k]) => k !== "fan").map(([k, x]) => [k, r2(x)])), longOnly: rob.longOnly, shortOnly: rob.shortOnly, sensitivity: Object.fromEntries(Object.entries(rob.sensitivity).map(([k, x]) => [k, r2(x)])), benchmarkPct: r2(rob.benchmark) };
}
export async function evidencePack(v) {
  const bt = await db.get("backtests", v.backtestId);
  const val = await db.get("validations", v.validationId);
  const parent = v.parentVersionId ? await db.get("versions", v.parentVersionId) : null;
  return {
    strategy: { name: v.sdl.strategy.name, thesis: v.sdl.strategy.thesis, version: v.versionNumber, changeReason: v.changeReason, parentStatus: parent?.status || null, falsification: v.sdl.falsification },
    sdlSummary: { indicators: v.sdl.indicators, signals: v.sdl.signals, risk: v.sdl.risk, costs: v.sdl.costs, selectedParams: v.selectedParams },
    backtest: backtestSummary(bt), backtestEngineerReport: bt.report ? { recommendation: bt.report.recommendation, summary: bt.report.summary, concerns: bt.report.concerns } : null,
    robustness: robustnessSummary(val.robustness),
    finalHoldout: (v.contaminatedDatasetIds || []).includes(v.datasetId) ? { contaminated: true, note: "Holdout influenced an earlier version of this strategy; excluded from evidence." } : { window: { from: iso(val.holdout.window.from), to: iso(val.holdout.window.to) }, metrics: slimMetrics(val.holdout.metrics), buyHoldPct: r2(val.holdout.benchmark) },
    evidence: { grade: val.evidence.grade, score: val.evidence.score, parts: Object.fromEntries(Object.entries(val.evidence.parts).map(([k, x]) => [k, r2(x)])), hardFails: val.evidence.hardFails, softConcerns: val.evidence.softConcerns, gates: val.evidence.gates, policy: val.evidence.policy },
    pineQA: v.pineRevisions.at(-1) || null
  };
}

H.VALIDATE = async (task, { signal }) => {
  const v = await db.get("versions", task.refs.versionId);
  const pack = await evidencePack(v);
  const { output, run } = await runAgent("validator", pack, { campaignId: v.campaignId, taskId: task.id, signal });
  await db.update("validations", v.validationId, { report: output, reportRunId: run.id });
  const art = await artefact("ValidationReport", output, { campaignId: v.campaignId, versionId: v.id, agentRunId: run.id });
  await transition(v.id, "VALIDATED", { decision: output.recommendation, reasons: ["VALIDATOR_" + output.recommendation], summary: output.summary, evidenceIds: [art.id, v.validationId], actor: { type: "agent", id: "validator" } });
  await transition(v.id, "IN_COMMITTEE", { reasons: ["EVIDENCE_PACK_COMPLETE"], actor: { type: "system", id: "orchestrator" } });
  await handoff({ campaignId: v.campaignId, strategyId: v.strategyId, versionId: v.id, from: "validator", to: "STRATEGY_JUDGE", taskId: task.id, output, artefactIds: [art.id], evidenceIds: [v.validationId], requestedAction: "Decide from the evidence pack", protectedIncluded: true });
  await q("JUDGE", { campaignId: v.campaignId, lane: "judge", title: `Committee decision: v${v.versionNumber}`, refs: { versionId: v.id } });
  return { result: { recommendation: output.recommendation } };
};

H.JUDGE = async (task, { signal }) => {
  const v = await db.get("versions", task.refs.versionId);
  const c = await campaignOf(v.campaignId);
  const val = await db.get("validations", v.validationId);
  const pack = { ...(await evidencePack(v)), validatorReport: val.report };
  const { output, run } = await runAgent("judge", pack, { campaignId: v.campaignId, taskId: task.id, signal });
  const ev = val.evidence;
  // Deterministic policy checks override the judge on promotion (spec §16.1, §17.5).
  const historicalFails = ev.gates.filter(g => g.required && g.pass === false && !/TradingView|Forward/.test(g.name)).map(g => g.name);
  let decision = output.decision, policyNote = "";
  if (["RESEARCH_APPROVED", "PAPER_TEST_RECOMMENDED"].includes(decision) && (ev.hardFails.length || historicalFails.length)) {
    policyNote = `Policy blocked promotion: ${[...ev.hardFails, ...historicalFails].join("; ")}`;
    decision = "REJECT";
  }
  const dec = { id: uuidv7(), versionId: v.id, strategyId: v.strategyId, campaignId: v.campaignId, by: { type: "agent", id: "judge", runId: run.id }, judgeDecision: output.decision, decision, policyNote, memo: output.memo, positiveCase: output.positiveCase, rejectionCase: output.rejectionCase, conditions: output.conditions, falsifiers: output.falsifiers, requiredNextEvidence: output.requiredNextEvidence, reviewInDays: output.reviewInDays, evidenceGrade: ev.grade, evidenceScore: ev.score, policy: c.policy, sdlHash: v.definitionHash, createdAt: nowIso() };
  await db.put("decisions", dec);
  const summary = policyNote || output.summary;
  await db.update("versions", v.id, { lastDecisionSummary: summary, lastDecisionId: dec.id });
  const actor = { type: "agent", id: "judge" };
  if (decision === "REJECT" || decision === "INSUFFICIENT_EVIDENCE") await transition(v.id, "REJECTED", { decision, reasons: [decision, ...(policyNote ? ["POLICY_GATE"] : [])], summary, evidenceIds: [dec.id], actor });
  else if (decision === "REWORK") await requestRework(v, output.requiredNextEvidence.concat(output.conditions).join("; ") || output.memo, "judge", null);
  else if (decision === "RESEARCH_APPROVED") await transition(v.id, "RESEARCH_APPROVED", { decision, reasons: ["JUDGE_APPROVED"], summary, evidenceIds: [dec.id], actor });
  else if (decision === "PAPER_TEST_RECOMMENDED") {
    await transition(v.id, "PAPER_PENDING_HUMAN", { decision, reasons: ["JUDGE_RECOMMENDS_PAPER"], summary, evidenceIds: [dec.id], actor });
    await handoff({ campaignId: v.campaignId, strategyId: v.strategyId, versionId: v.id, from: "judge", to: "HUMAN_COMMITTEE", taskId: task.id, output, evidenceIds: [dec.id], requestedAction: "Approve or reject a paper test", protectedIncluded: true });
  }
  return { result: { decision } };
};

/* ---------------- Human committee actions ---------------- */
const HUMAN = { type: "human", id: "operator" };
export async function approvePaper(versionId, note) {
  const v = await db.get("versions", versionId);
  const c = await campaignOf(v.campaignId);
  const policy = POLICIES[c?.policy] || POLICIES.discovery;
  const ev = evaluateEvidence(await gatherEvidence(v), policy.id);
  if (ev.hardFails.length) throw new Error("Hard fails block paper approval: " + ev.hardFails.join("; "));
  if (policy.requireTradingViewParity && !(ev.gates.find(g => g.name.startsWith("TradingView")).pass)) throw new Error("This policy requires TradingView parity before a paper test.");
  await transition(versionId, "PAPER_APPROVED", { decision: "PAPER_APPROVED", reasons: ["HUMAN_COMMITTEE"], summary: note || "Approved for paper forward test", actor: HUMAN });
  await db.put("decisions", { id: uuidv7(), versionId, strategyId: v.strategyId, campaignId: v.campaignId, by: HUMAN, decision: "PAPER_APPROVED", memo: note || "", evidenceGrade: ev.grade, evidenceScore: ev.score, createdAt: nowIso() });
}
export async function humanDecision(versionId, to, reason, override = false) {
  const v = await db.get("versions", versionId);
  if (!reason) throw new Error("Give a reason for this decision.");
  if (to === "LIVE_APPROVED") throw new Error("LIVE_APPROVED can only be granted by a human-authorised process outside DezQuant.");
  await transition(versionId, to, { decision: to, reasons: ["HUMAN_DECISION"], summary: reason, actor: HUMAN, override, overrideReason: reason });
  await db.put("decisions", { id: uuidv7(), versionId, strategyId: v.strategyId, campaignId: v.campaignId, by: HUMAN, decision: to, memo: reason, override, createdAt: nowIso() });
  await db.update("versions", versionId, { lastDecisionSummary: reason });
}
export async function requestHumanRework(versionId, proposal) {
  const v = await db.get("versions", versionId);
  if (!proposal) throw new Error("Describe the explicit change.");
  await humanDecision(versionId, "REWORK_REQUESTED", proposal, !["BACKTESTED", "VALIDATED", "IN_COMMITTEE"].includes(v.status));
  await q("REWORK", { campaignId: v.campaignId, lane: "architect", title: `Rework v${v.versionNumber} (human request)`, refs: { versionId }, input: { proposal, by: "human" } });
}
export async function sendToValidation(versionId) {
  const v = await db.get("versions", versionId);
  await db.audit("version.sent_to_validation", { versionId }, HUMAN);
  await q("VALIDATION_RUN", { campaignId: v.campaignId, lane: "validator", title: `Robustness + holdout: v${v.versionNumber} (human)`, refs: { versionId } });
}
// Optional AI review of a version that already has free robustness evidence.
export async function askAgentReview(versionId) {
  const v = await db.get("versions", versionId);
  await db.audit("version.agent_review_requested", { versionId }, HUMAN);
  await q("VALIDATE", { campaignId: v.campaignId, lane: "validator", title: `Validator review: v${v.versionNumber}`, refs: { versionId } });
}
// Free Pine revision from the deterministic generator (no AI). Adds a revision; never moves the
// version's lifecycle state, so it is safe to run while a backtest is in progress.
export async function freePine(versionId) {
  const v = await db.get("versions", versionId);
  const strategy = await db.get("strategies", v.strategyId);
  const { source, notes } = generatePine(v.sdl, { ids: { strategyId: v.strategyId, strategyVersionId: v.id, sdlHash: v.definitionHash, parentVersionId: v.parentVersionId || "none", campaignId: v.campaignId || "none" } });
  const lint = lintPine(source, v.sdl);
  const art = await artefact("PineRevision", { source, implementationNotes: ["Generated by the free Pine generator (" + PINE_GEN_VERSION + "), not an AI.", ...notes].join(" "), deviations: [], alertExamples: [], lint, generator: PINE_GEN_VERSION }, { campaignId: v.campaignId, strategyId: v.strategyId, versionId: v.id, agentRunId: null });
  const rev = { n: v.pineRevisions.length + 1, artefactId: art.id, sourceHash: art.hash.slice(0, 16), lintPass: lint.pass, errors: lint.errors, warnings: lint.warnings, createdAt: nowIso(), generator: PINE_GEN_VERSION };
  await db.update("versions", v.id, x => { x.pineRevisions.push(rev); x.pineArtefactId = art.id; });
  await db.audit("pine.free_revision", { versionId: v.id, revision: rev.n, lintPass: lint.pass, strategy: strategy?.name }, HUMAN);
  return { lint, revision: rev.n };
}
export async function regeneratePine(versionId) {
  const v = await db.get("versions", versionId);
  await q("PINE", { campaignId: v.campaignId, lane: "pine", title: `Pine revision ${v.pineRevisions.length + 1}: v${v.versionNumber}`, refs: { versionId } });
}

/* ---------------- TradingView verification (spec §13.2) ---------------- */
export async function verifyTradingView(versionId, csvText, fileName) {
  const v = await db.get("versions", versionId);
  const ds = await db.get("datasets", v.datasetId);
  const parsed = parseTradingViewTrades(csvText);
  const bars = await loadBars(v.datasetId);
  const full = await research("full", { sdl: v.sdl, bars, params: v.selectedParams || {}, opts: { recordEquity: false } });
  const p = parityCheck(full.trades, parsed.trades, { tfMs: timeframeMs(ds.timeframe), tickSize: v.sdl.costs.tickSize, slippageTicks: v.sdl.costs.slippageTicks });
  const tvMetrics = computeMetrics({ trades: parsed.trades, initialCapital: 10_000 });
  const rec = { id: uuidv7(), versionId, strategyId: v.strategyId, campaignId: v.campaignId, fileName, uploadedAt: nowIso(), tvTradeCount: parsed.trades.length, localTradeCount: full.trades.length, warnings: parsed.warnings, parity: p, status: p.status, tvMetrics: slimMetrics(tvMetrics), explanation: null, sourceHash: v.pineRevisions.at(-1)?.sourceHash || null, createdAt: nowIso() };
  await db.put("verifications", rec);
  await db.audit("tradingview.report_uploaded", { versionId, verificationId: rec.id, status: rec.status, trades: rec.tvTradeCount }, HUMAN);
  return rec;
}
export async function explainVerification(id, text) {
  await db.update("verifications", id, { explanation: text, explainedAt: nowIso() });
  await db.audit("tradingview.parity_explained", { verificationId: id }, HUMAN);
}

/* ---------------- Forward testing (spec §7.8) ---------------- */
// One tap: approve a paper (forward) test and start it. A forward test trades nothing real and is the
// only fair evidence left once a version's holdout has been seen, so the human approval is recorded
// (as an override where the lifecycle would not normally allow it) and a pending AI rework is cancelled.
export const FORWARD_FROM = ["VALIDATED", "IN_COMMITTEE", "REWORK_REQUESTED", "RESEARCH_APPROVED", "PAPER_PENDING_HUMAN", "PAPER_APPROVED"];
export async function forwardTestNow(versionId) {
  const v = await db.get("versions", versionId);
  if (!FORWARD_FROM.includes(v.status)) throw new Error(`A ${v.status} version can't start a forward test.`);
  if (!v.backtestId || !v.validationId) throw new Error("Run the full backtest plan first.");
  const running = await db.all("deployments", d => d.versionId === v.id && ["ACTIVE", "DEGRADED"].includes(d.status));
  if (running.length) return running[0];
  const c = await campaignOf(v.campaignId);
  const ev = evaluateEvidence(await gatherEvidence(v), c.policy || "discovery");
  if (ev.hardFails.length) throw new Error("Hard fails block a forward test: " + ev.hardFails.join("; "));
  for (const t of await db.all("tasks", t => t.kind === "REWORK" && t.refs?.versionId === v.id && ["QUEUED", "WAITING_HUMAN"].includes(t.status))) await db.update("tasks", t.id, { status: "CANCELLED", finishedAt: nowIso(), error: { code: "replaced", message: "Replaced by a forward test" } });
  if (v.status !== "PAPER_APPROVED") {
    const reason = "One-tap forward test: collect evidence on new, unseen bars (paper only).";
    const normal = ["RESEARCH_APPROVED", "PAPER_PENDING_HUMAN"].includes(v.status);
    await transition(versionId, "PAPER_APPROVED", { decision: "PAPER_APPROVED", reasons: ["HUMAN_FORWARD_TEST"], summary: reason, actor: HUMAN, override: !normal, overrideReason: normal ? "" : reason });
    await db.put("decisions", { id: uuidv7(), versionId, strategyId: v.strategyId, campaignId: v.campaignId, by: HUMAN, decision: "PAPER_APPROVED", memo: reason, override: !normal, evidenceGrade: ev.grade, evidenceScore: ev.score, createdAt: nowIso() });
  }
  return startForward(versionId);
}
export async function startForward(versionId) {
  const v = await db.get("versions", versionId);
  if (v.status !== "PAPER_APPROVED") throw new Error("Only PAPER_APPROVED versions can start a forward test.");
  const ds = await db.get("datasets", v.datasetId);
  const bt = await db.get("backtests", v.backtestId);
  const vm = bt.result.validation.metrics, span = (bt.result.validation.window.to - bt.result.validation.window.from) / 86_400_000;
  const dep = {
    id: uuidv7(), versionId, strategyId: v.strategyId, campaignId: v.campaignId, status: "ACTIVE", source: ds.source, symbol: ds.symbol, timeframe: ds.timeframe,
    params: v.selectedParams, sdlHash: v.definitionHash, configHash: await hashObject({ sdl: v.sdl, params: v.selectedParams, symbol: ds.symbol, timeframe: ds.timeframe }),
    startedAt: nowIso(), createdAt: nowIso(), expectation: { tradesPerDay: vm.tradeCount / Math.max(1, span), winRate: vm.winRate, avgTradePct: vm.tradeCount ? (vm.totalReturn / vm.tradeCount) : 0 },
    fillModel: "arf-runner next-bar-open + slippage (paper)", snapshots: 0
  };
  await db.put("deployments", dep);
  await transition(versionId, "FORWARD_TESTING", { decision: "FORWARD_STARTED", reasons: ["DEPLOYMENT_CREATED"], summary: `Deployment ${dep.id.slice(0, 8)}`, evidenceIds: [dep.id], actor: HUMAN });
  await db.audit("forward.deployment_created", { deploymentId: dep.id, versionId, configHash: dep.configHash }, HUMAN);
  return dep;
}

// Re-evaluates the deployment on bars that closed after it started. Only bars after startedAt can produce
// forward trades, so nothing is backfilled; indicator warm-up uses earlier history, which is causal.
export async function checkDeployment(depId, { signal, bars: uploaded = null } = {}) {
  const dep = await db.get("deployments", depId);
  if (!dep || !["ACTIVE", "DEGRADED"].includes(dep.status)) return dep;
  const v = await db.get("versions", dep.versionId);
  const tf = timeframeMs(dep.timeframe);
  const start = new Date(dep.startedAt).getTime();
  const warm = longestLookback(v.sdl, dep.params) + (v.sdl.segments.warmupBars || 0) + 5;
  let bars, health = { checkedAt: nowIso(), issues: [] };
  try { bars = uploaded || await fetchBars({ source: dep.source, symbol: dep.symbol, timeframe: dep.timeframe, from: start - warm * tf, signal }); }
  catch (e) { health.issues.push("Data fetch failed: " + e.message); await db.update("deployments", depId, { status: "DEGRADED", health }); return db.get("deployments", depId); }
  const firstIdx = bars.t.findIndex(t => t >= start);
  const lastBar = bars.t[bars.t.length - 1];
  // Built-in prices refresh once a day, so up to a day's lag is expected, not a fault.
  const daily = String(dep.source).startsWith("builtin") && !bars.live;
  const lag = Date.now() - (lastBar + tf), allowed = daily ? Math.max(tf * 2.5, 30 * 3_600_000) : tf * 2.5;
  if (lag > allowed) health.issues.push(`Last closed bar ${new Date(lastBar).toISOString()} is stale${daily ? " (the daily price update is late)" : ""}`);
  else if (daily && lag > tf * 2.5) health.notes = [`Built-in prices update once a day; bars after ${isoMinuteUtc(lastBar)} UTC arrive with the next daily update.`];
  const integ = integrityReport(bars, dep.timeframe);
  if (integ.missing) health.issues.push(`${integ.missing} missing bars in forward window`);
  let trades = [], open = null;
  if (firstIdx >= 0) {
    const r = await research("full", { sdl: v.sdl, bars, params: dep.params, opts: { start: Math.max(1, firstIdx - 1), recordEquity: false } });
    trades = r.trades.filter(t => !t.boundary && t.entryTime >= start);
    const b = r.trades.find(t => t.boundary && t.entryTime >= start);
    if (b) open = { dir: b.dir, entryTime: b.entryTime, entryPrice: b.entryPrice, markPrice: b.exitPrice, unrealised: b.net };
  }
  const days = (Date.now() - start) / 86_400_000;
  const exp = dep.expectation;
  const expectedTrades = exp.tradesPerDay * days;
  const winRate = trades.length ? (trades.filter(t => t.net > 0).length / trades.length) * 100 : NaN;
  const p = (exp.winRate || 50) / 100, n = trades.length;
  const z = n >= 5 ? ((winRate / 100) - p) / Math.sqrt((p * (1 - p)) / n) : NaN;
  const freqRatio = expectedTrades > 0.5 ? n / expectedTrades : NaN;
  const drift = { expectedTrades: r2(expectedTrades), actualTrades: n, frequencyRatio: r2(freqRatio), winRate: r2(winRate), expectedWinRate: r2(exp.winRate), winRateZ: r2(z), flag: (Number.isFinite(z) && z < -2) || (Number.isFinite(freqRatio) && expectedTrades >= 5 && (freqRatio < 0.33 || freqRatio > 3)) };
  let e = 10_000; const equity = [[start, e]]; for (const t of trades) { e *= 1 + t.ret; equity.push([t.exitTime, e]); }
  if (lastBar > (equity.at(-1)?.[0] || 0)) equity.push([lastBar, e]);
  const snapshot = { at: nowIso(), lastBarTime: lastBar, bars: firstIdx >= 0 ? bars.t.length - firstIdx : 0, trades, open, equity, drift, health, netReturnPct: r2((e / 10_000 - 1) * 100), avgTradePct: n ? r2(mean(trades.map(t => t.ret * 100))) : null, sdTradePct: n > 1 ? r2(stdev(trades.map(t => t.ret * 100))) : null };
  const status = health.issues.some(i => /stale|failed/i.test(i)) ? "DEGRADED" : "ACTIVE";
  await db.update("deployments", depId, { snapshot, status, health, snapshots: (dep.snapshots || 0) + 1, lastCheckAt: nowIso() });
  if (status !== dep.status) await db.audit("forward.deployment_" + status.toLowerCase(), { deploymentId: depId, issues: health.issues });
  return db.get("deployments", depId);
}
const isoMinuteUtc = t => new Date(t).toISOString().slice(0, 16).replace("T", " ");
export async function stopDeployment(depId, status = "COMPLETED") {
  const dep = await db.update("deployments", depId, { status, endedAt: nowIso() });
  await db.audit("forward.deployment_" + status.toLowerCase(), { deploymentId: depId }, HUMAN);
  return dep;
}
export async function reviewForward(depId) {
  const dep = await db.get("deployments", depId);
  const v = await db.get("versions", dep.versionId);
  return q("FORWARD_REVIEW", { campaignId: null, lane: "forward", title: `Forward review: ${v.sdl.strategy.name} v${v.versionNumber}`, refs: { deploymentId: depId, versionId: v.id } });
}
H.FORWARD_REVIEW = async (task, { signal }) => {
  const dep = await db.get("deployments", task.refs.deploymentId);
  const s = dep.snapshot;
  const input = { deployment: { id: dep.id, status: dep.status, startedAt: dep.startedAt, symbol: dep.symbol, timeframe: dep.timeframe, configHash: dep.configHash, fillModel: dep.fillModel }, expectation: dep.expectation, snapshot: s ? { lastBarTime: new Date(s.lastBarTime).toISOString(), trades: s.trades.length, netReturnPct: s.netReturnPct, avgTradePct: s.avgTradePct, drift: s.drift, health: s.health, open: s.open } : null };
  const { output, run } = await runAgent("forward", input, { taskId: task.id, signal });
  await db.update("deployments", dep.id, { review: output, reviewRunId: run.id, reviewedAt: nowIso(), reviewedSnapshotAt: s?.at || null });
  return { result: { health: output.health } };
};
export async function markLiveCandidate(versionId, note) {
  const v = await db.get("versions", versionId);
  const c = await campaignOf(v.campaignId);
  const ev = evaluateEvidence(await gatherEvidence(v), c?.policy);
  const fwd = ev.gates.find(g => g.name === "Forward-test evidence");
  if (!fwd.pass) throw new Error("Forward-test requirements are not met yet: " + fwd.detail);
  if (ev.hardFails.length) throw new Error("Hard fails: " + ev.hardFails.join("; "));
  await transition(versionId, "LIVE_CANDIDATE", { decision: "LIVE_CANDIDATE", reasons: ["FORWARD_REQUIREMENTS_MET", "HUMAN_REVIEW"], summary: note || "Forward requirements met", actor: HUMAN });
}

/* ---------------- Portfolio research (spec §7.11) ---------------- */
export async function portfolioData() {
  const vs = await db.all("versions", v => ["RESEARCH_APPROVED", "PAPER_PENDING_HUMAN", "PAPER_APPROVED", "FORWARD_TESTING", "LIVE_CANDIDATE"].includes(v.status) && v.backtestId);
  const series = [];
  for (const v of vs) {
    const bt = await db.get("backtests", v.backtestId);
    const eq = [...bt.result.development.equity, ...bt.result.validation.equity];
    const byDay = new Map(); for (const [t, e] of eq) byDay.set(Math.floor(t / 86_400_000), e);
    const days = [...byDay.keys()].sort((a, b) => a - b); const rets = new Map();
    for (let i = 1; i < days.length; i++) rets.set(days[i], byDay.get(days[i]) / byDay.get(days[i - 1]) - 1);
    const ds = await db.get("datasets", v.datasetId);
    series.push({ versionId: v.id, label: `${v.sdl.strategy.name} v${v.versionNumber}`, symbol: ds.symbol, timeframe: ds.timeframe, family: v.sdl.strategy.family, grade: v.evidenceGrade, rets, directions: v.sdl.strategy.directions });
  }
  const corr = series.map(a => series.map(b => {
    const common = [...a.rets.keys()].filter(d => b.rets.has(d));
    if (common.length < 30) return null;
    const x = common.map(d => a.rets.get(d)), y = common.map(d => b.rets.get(d));
    const mx = mean(x), my = mean(y);
    let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }));
  return { strategies: series.map(({ rets, ...s }) => s), corr };
}
export async function runPortfolioReview() {
  return enqueue("PORTFOLIO_REVIEW", { campaignId: null, lane: "portfolio", title: "Portfolio review of approved strategies" });
}
H.PORTFOLIO_REVIEW = async (task, { signal }) => {
  const pd = await portfolioData();
  if (pd.strategies.length < 2) return { status: "FAILED_TERMINAL", result: { message: "Need at least two approved strategies" } };
  const input = { strategies: pd.strategies, correlationOfDailyReturns: pd.corr.map(r => r.map(x => (x === null ? null : r2(x)))) };
  const { output, run } = await runAgent("portfolio", input, { taskId: task.id, signal });
  const art = await artefact("PortfolioReview", { ...output, input }, { agentRunId: run.id });
  return { result: { artefactId: art.id } };
};

/* ---------------- Convert a pasted Pine script into SDL (Strategy Architect) ---------------- */
export async function convertPine(pineSource, datasetId) {
  const ds = datasetId ? await db.get("datasets", datasetId) : null;
  const market = ds ? { source: ds.source, symbol: ds.symbol, timeframe: ds.timeframe } : { source: "binance", symbol: "BTCUSDT", timeframe: "240" };
  const c = { id: null, policy: "discovery", market };
  const fakeDs = ds || { tickSize: 0.01, bars: 0, from: Date.now(), to: Date.now() };
  const input = {
    task: "TRANSLATE_PINE",
    pineSource: String(pineSource).slice(0, 40000),
    market: { symbol: `${market.source.toUpperCase()}:${market.symbol.toUpperCase()}`, timeframe: market.timeframe, tickSize: fakeDs.tickSize },
    instruction: "Translate this Pine Script strategy into one SDL document that reproduces its entries and exits as exactly as the grammar allows. Keep its inputs as parameters with sensible ranges around the script's defaults. Map process_orders_on_close to execution.processOnClose and trail_points/trail_offset to risk.trailingStop. The SDL requires a stop-loss: if the script has none, add a wide one and say so. In ambiguityNotes, list every place where the SDL differs from the script or where the script looks like it has a bug. Do not improve or optimise the strategy."
  };
  const { output, sdl, notes, warnings } = await architectLoop(input, c, fakeDs, { id: null }, undefined);
  return { sdl, notes: [...(output.ambiguityNotes || []), ...notes], warnings, summary: output.summary };
}

/* ---------------- Ad-hoc: run a backtest on a hand-written SDL (Strategy Workbench) ---------------- */
export async function createManualVersion({ campaignId, datasetId, sdl, name }) {
  const v0 = validateSDL(sdl);
  if (!v0.ok) throw new Error(v0.errors.join("\n"));
  const ds = await db.get("datasets", datasetId);
  const c = campaignId ? await campaignOf(campaignId) : { id: null, policy: "discovery", market: { source: ds.source, symbol: ds.symbol, timeframe: ds.timeframe } };
  const strategy = { id: uuidv7(), campaignId: c.id, ideaId: null, name: name || sdl.strategy.name, family: sdl.strategy.family, manual: true, createdAt: nowIso() };
  await db.put("strategies", strategy);
  const fakeRun = { id: "human" };
  const v = await createVersion({ strategy, c, ds, sdl, output: { expectedFailureModes: [], backtestExpectations: null, ambiguityNotes: [] }, run: fakeRun, notes: [], warnings: v0.warnings, ambiguityDefects: 0, parent: null, changeReason: "Hand-written SDL" });
  await db.audit("strategy_version.manual", { versionId: v.id }, HUMAN);
  // Hand-written and converted strategies get TradingView code right away, for free.
  try { await freePine(v.id); } catch (e) { await db.audit("pine.free_failed", { versionId: v.id, error: e.message }, HUMAN); }
  return db.get("versions", v.id);
}
// Free, no-AI fix for a strategy tested without realistic costs: a child version with market-typical
// slippage (and a minimal commission if none), Pine code regenerated, and the full test plan re-run.
export async function fixCostsAndRetest(versionId) {
  const v = await db.get("versions", versionId);
  const ds = await db.get("datasets", v.datasetId);
  const bars = await db.get("bars", ds.id);
  const price = bars && bars.c.length ? bars.c[bars.c.length - 1] : null;
  const rc = realisticCosts(ds.symbol, ds.tickSize || v.sdl.costs.tickSize, price, v.sdl.costs);
  if (v.sdl.costs.slippageTicks >= rc.slippageTicks && v.sdl.costs.commissionValue > 0) throw new Error(`Costs already look realistic (${v.sdl.costs.slippageTicks} ticks slippage, ${v.sdl.costs.commissionValue}% commission).`);
  const sdl = structuredClone(v.sdl);
  sdl.costs = { ...sdl.costs, slippageTicks: Math.max(rc.slippageTicks, sdl.costs.slippageTicks || 0), commissionValue: rc.commissionValue, tickSize: rc.tickSize };
  const check = validateSDL(sdl);
  if (!check.ok) throw new Error(check.errors.join("; "));
  // A free costs fix replaces a pending AI rework of the same version.
  for (const t of await db.all("tasks", t => t.kind === "REWORK" && t.refs?.versionId === v.id && ["QUEUED", "WAITING_HUMAN"].includes(t.status))) await db.update("tasks", t.id, { status: "CANCELLED", finishedAt: nowIso(), error: { code: "replaced", message: "Replaced by the free costs fix" } });
  const strategy = await db.get("strategies", v.strategyId);
  const c = await campaignOf(v.campaignId);
  const changed = ["costs.slippageTicks", ...(v.sdl.costs.commissionValue > 0 ? [] : ["costs.commissionValue"]), ...(sdl.costs.tickSize !== v.sdl.costs.tickSize ? ["costs.tickSize"] : [])];
  const child = await createVersion({ strategy, c, ds, sdl, output: { expectedFailureModes: [], backtestExpectations: null, ambiguityNotes: [] }, run: { id: "human" }, notes: [], warnings: check.warnings, ambiguityDefects: 0, parent: v, changeReason: `Realistic costs: ${rc.note}`, changeCategory: "costs", changedFields: changed });
  await db.audit("strategy_version.costs_fixed", { parent: v.id, child: child.id, slippageTicks: sdl.costs.slippageTicks, commission: sdl.costs.commissionValue }, HUMAN);
  try { await freePine(child.id); } catch (_) {}
  await backtestNow(child.id);
  return { child, note: rc.note };
}
// Improver (free): search explainable changes toward the user's goals on development/validation only.
export async function improveVersion(versionId, goals, { maxRounds = 4, progress = () => {} } = {}) {
  const v = await db.get("versions", versionId);
  if (!v.backtestId) throw new Error("Run the backtest first.");
  const bars = await db.get("bars", v.datasetId);
  const result = await research("improve", { sdl: v.sdl, bars, params: v.selectedParams || {}, goals, maxRounds }, progress);
  const art = await artefact("Improvement", result, { campaignId: v.campaignId, strategyId: v.strategyId, versionId: v.id });
  await db.audit("strategy.improver_run", { versionId: v.id, goals, tried: result.tried, allMet: result.allMet, changes: result.best.changes.map(c => c.id) }, HUMAN);
  return art;
}
export async function createImprovedVersion(artefactId) {
  const art = await db.get("artefacts", artefactId);
  const v = await db.get("versions", art.versionId);
  const best = art.data.best;
  if (!best.changes.length) throw new Error("No improvement was found to apply.");
  const sdl = structuredClone(best.sdl);
  const ds = await db.get("datasets", v.datasetId);
  if (costsLookUnrealistic(sdl)) { const bars = await db.get("bars", ds.id); const rc = realisticCosts(ds.symbol, ds.tickSize, bars?.c?.at(-1), sdl.costs); sdl.costs = { ...sdl.costs, slippageTicks: Math.max(rc.slippageTicks, sdl.costs.slippageTicks || 0), commissionValue: rc.commissionValue, tickSize: rc.tickSize }; }
  const check = validateSDL(sdl);
  if (!check.ok) throw new Error(check.errors.join("; "));
  const strategy = await db.get("strategies", v.strategyId);
  const c = await campaignOf(v.campaignId);
  const child = await createVersion({ strategy, c, ds, sdl, output: { expectedFailureModes: [], backtestExpectations: null, ambiguityNotes: [] }, run: { id: "human" }, notes: [], warnings: check.warnings, ambiguityDefects: 0, parent: v, changeReason: "Improver: " + best.changes.map(x => x.label).join(" + "), changeCategory: "improve", changedFields: best.changes.map(x => x.id) });
  await db.update("artefacts", art.id, { appliedVersionId: child.id });
  await db.audit("strategy_version.improved", { parent: v.id, child: child.id, changes: best.changes.map(x => x.id), tried: art.data.tried }, HUMAN);
  try { await freePine(child.id); } catch (_) {}
  await backtestNow(child.id);
  return child;
}
export async function backtestNow(versionId) {
  const v = await db.get("versions", versionId);
  return q("BACKTEST", { campaignId: v.campaignId, lane: "backtest", title: `Backtest plan: v${v.versionNumber}`, refs: { versionId } });
}

/* Wrap handlers so every completion checks whether the campaign went idle. */
const wrapped = Object.fromEntries(Object.entries(H).map(([k, fn]) => [k, async (task, ctx) => { try { return await fn(task, ctx); } finally { setTimeout(() => checkCampaignIdle(task.campaignId), 50); } }]));
registerHandlers(wrapped);
export { championPrompt };

/* Housekeeping: permanently delete rejected strategy versions and everything recorded only for them
   (backtests, validations, Pine, decisions, forward tests, queued jobs). The audit log is append-only and
   keeps its entries; lessons learned are kept too. A strategy with no versions left is removed. */
const VERSION_LINKED = ["backtests", "validations", "verifications", "decisions", "deployments", "artefacts", "transitions", "handoffs", "tasks", "agentRuns"];
const linkedVersion = r => r.versionId || r.strategy_version_id || r.strategyVersionId || r.refs?.versionId || r.input?.versionId || null;
export async function deleteRejected() {
  const gone = await db.all("versions", v => v.status === "REJECTED");
  if (!gone.length) return { versions: 0, strategies: 0, records: 0 };
  const ids = new Set(gone.map(v => v.id));
  const names = Object.fromEntries((await db.all("strategies")).map(x => [x.id, x.name]));
  for (const v of gone) await db.put("lessons", { id: uuidv7(), kind: "deleted_rejected", name: names[v.strategyId] || v.sdl?.strategy?.name, thesis: v.sdl?.strategy?.thesis, reason: v.lastDecisionSummary || "", versionId: null, createdAt: nowIso() });
  let records = 0;
  for (const store of VERSION_LINKED) {
    const rows = await db.all(store, r => ids.has(linkedVersion(r)) && !(store === "tasks" && r.status === "RUNNING"));
    for (const r of rows) { await db.del(store, r.id); records++; }
  }
  for (const v of gone) await db.del("versions", v.id);
  const left = new Set((await db.all("versions")).map(v => v.strategyId));
  const strategies = await db.all("strategies", s => !left.has(s.id) && gone.some(v => v.strategyId === s.id));
  for (const s of strategies) await db.del("strategies", s.id);
  await db.audit("versions.deleted_rejected", { versions: gone.length, strategies: strategies.length, records, names: gone.slice(0, 50).map(v => `${v.sdl?.strategy?.name || "?"} v${v.versionNumber}`) }, HUMAN);
  return { versions: gone.length, strategies: strategies.length, records };
}
