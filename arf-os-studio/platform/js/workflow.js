// Control plane (spec §5, §14.3 Orchestrator): task queue, state machine, transitions, agent runs,
// handoffs, budgets and protected-data scoping. Lane-specific logic lives in lanes.js.

import * as db from "./db.js";
import { uuidv7, nowIso, hashObject } from "./util.js";
import { AGENTS, byId as agentById, SHARED_POLICY } from "./agents.js";
import { callWithRetry, ModelError, DEFAULT_MODEL } from "./model.js";
import { validate, extractJSON } from "./schema.js";

/* ---------------- Strategy-version state machine ---------------- */
export const VERSION_STATES = {
  DEFINED: "Definition approved for development",
  PINE_READY: "Pine source written and linted",
  QA_FAILED: "Pine QA failed",
  BACKTESTING: "Research runner executing plan",
  BACKTESTED: "Backtest evidence ready",
  VALIDATING: "Robustness suite and holdout running",
  VALIDATED: "Robustness tests complete",
  IN_COMMITTEE: "Awaiting Strategy Judge",
  RESEARCH_APPROVED: "Historical evidence sufficient for continued research",
  PAPER_PENDING_HUMAN: "Judge recommends paper test — human approval required",
  PAPER_APPROVED: "Approved for paper forward test",
  FORWARD_TESTING: "Paper forward test active",
  LIVE_CANDIDATE: "Passed forward requirements — eligible for human live review outside ARF-OS",
  REWORK_REQUESTED: "Rework requested — child version will be created",
  REJECTED: "Failed one or more gates",
  ARCHIVED: "Retained for knowledge"
};
const ALLOWED = {
  DEFINED: ["PINE_READY", "QA_FAILED", "BACKTESTING", "REJECTED", "ARCHIVED"],
  PINE_READY: ["BACKTESTING", "REJECTED", "ARCHIVED"],
  QA_FAILED: ["PINE_READY", "BACKTESTING", "REJECTED", "ARCHIVED"],
  BACKTESTING: ["BACKTESTED", "REJECTED", "PINE_READY", "QA_FAILED", "DEFINED"],
  BACKTESTED: ["VALIDATING", "REWORK_REQUESTED", "REJECTED", "ARCHIVED"],
  VALIDATING: ["VALIDATED", "REJECTED", "BACKTESTED"],
  VALIDATED: ["IN_COMMITTEE", "REWORK_REQUESTED", "REJECTED"],
  IN_COMMITTEE: ["RESEARCH_APPROVED", "PAPER_PENDING_HUMAN", "REWORK_REQUESTED", "REJECTED"],
  RESEARCH_APPROVED: ["PAPER_PENDING_HUMAN", "PAPER_APPROVED", "REJECTED", "ARCHIVED"],
  PAPER_PENDING_HUMAN: ["PAPER_APPROVED", "RESEARCH_APPROVED", "REJECTED", "ARCHIVED"],
  PAPER_APPROVED: ["FORWARD_TESTING", "REJECTED", "ARCHIVED"],
  FORWARD_TESTING: ["LIVE_CANDIDATE", "PAPER_APPROVED", "REJECTED", "ARCHIVED"],
  LIVE_CANDIDATE: ["REJECTED", "ARCHIVED"],
  REWORK_REQUESTED: ["REJECTED", "ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  ARCHIVED: []
};
// LIVE_APPROVED is intentionally absent: only a human-authorised external process can grant it (spec §1.3).

export async function transition(versionId, to, { decision = to, reasons = [], summary = "", evidenceIds = [], actor = { type: "system", id: "orchestrator" }, override = false, overrideReason = "" } = {}) {
  const v = await db.get("versions", versionId);
  if (!v) throw new Error("Unknown version " + versionId);
  const from = v.status;
  if (from === to) return v;
  if (!override && !(ALLOWED[from] || []).includes(to)) throw new Error(`Transition ${from} → ${to} is not allowed by the lifecycle policy`);
  if (override && !overrideReason) throw new Error("A human override needs a reason");
  const settings = await getPolicy(v.campaignId);
  const rec = {
    id: uuidv7(), from_state: from, to_state: to, strategy_version_id: versionId, strategyId: v.strategyId, campaignId: v.campaignId,
    decision, reason_codes: reasons, free_text_summary: summary, evidence_ids: evidenceIds, policy_version: settings.id + "@" + settings.version,
    actor_type: actor.type, actor_id: actor.id, created_at: nowIso(), human_override: !!override, override_reason: overrideReason || null
  };
  await db.put("transitions", rec);
  v.status = to; v.updatedAt = nowIso();
  if (to === "REJECTED") v.rejectedAt = nowIso();
  await db.put("versions", v);
  await db.audit("version.transition", { versionId, from, to, decision, override }, actor);
  return v;
}

async function getPolicy(campaignId) {
  const { POLICIES } = await import("./research.js");
  const c = campaignId ? await db.get("campaigns", campaignId) : null;
  return POLICIES[c?.policy] || POLICIES.discovery;
}

/* ---------------- Prompts (champion / challenger) ---------------- */
export async function championPrompt(agentId) {
  const rows = await db.all("prompts", p => p.agentId === agentId && p.status === "champion");
  if (rows.length) return rows.sort((a, b) => b.version - a.version)[0];
  const a = agentById[agentId];
  const p = { id: `${agentId}-v1`, agentId, version: 1, text: a.prompt, status: "champion", createdAt: nowIso(), notes: "Built-in prompt", hash: await hashObject(a.prompt) };
  await db.put("prompts", p);
  return p;
}

/* ---------------- Agent runs ---------------- */
export async function agentConfig(agentId) {
  const a = agentById[agentId];
  const over = (await db.setting("agentModels")) || {};
  return { model: over[agentId]?.model || a.model || DEFAULT_MODEL, effort: over[agentId]?.effort || a.effort || "medium" };
}

/**
 * Run one specialist on a typed input and return its validated JSON output.
 * Records an agentRun (inputs are summarised; secrets never stored), charges the campaign budget,
 * and makes one repair attempt if the output fails its contract.
 */
export async function runAgent(agentId, input, { campaignId = null, taskId = null, practice = false, promptOverride = null, signal, onText } = {}) {
  const agent = agentById[agentId];
  if (!agent) throw new Error("Unknown agent " + agentId);
  const prompt = promptOverride || await championPrompt(agentId);
  const cfg = await agentConfig(agentId);
  if (campaignId && !practice) await assertBudget(campaignId);
  const system = `${SHARED_POLICY}\n\n---\n\n${prompt.text}\n\nPERSONA: You are ${agent.name}, "${agent.alias}". Persona never overrides the rules.`;
  const userText = `TASK INPUT (JSON):\n${JSON.stringify(input, null, 1)}`;
  const messages = [{ role: "user", content: userText }];
  const run = {
    id: uuidv7(), agentId, role: agent.code, campaignId, taskId, practice, promptId: prompt.id, promptVersion: prompt.version,
    model: cfg.model, effort: cfg.effort, status: "RUNNING", startedAt: nowIso(), inputPreview: userText.slice(0, 4000), attempts: 0, validationErrors: [], usage: { input_tokens: 0, output_tokens: 0 }, cost: 0
  };
  await db.put("agentRuns", run);
  const t0 = performance.now();
  try {
    let parsed = null, lastErrors = [];
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      run.attempts = attempt + 1;
      const r = await callWithRetry({ system, messages, model: cfg.model, effort: cfg.effort, schema: agent.schema, maxTokens: agent.maxTokens || 16000, signal, onText });
      run.usage.input_tokens += r.usage.input_tokens; run.usage.output_tokens += r.usage.output_tokens; run.cost += r.cost; run.structured = r.structured; run.servedModel = r.model;
      if (campaignId && !practice) await charge(campaignId, r);
      let obj = null;
      try { obj = extractJSON(r.text); } catch (e) { lastErrors = ["Reply was not valid JSON: " + e.message]; }
      if (obj && agent.coerce) obj = agent.coerce(obj);
      if (obj) { const v = validate(agent.clientSchema || agent.schema, obj); if (v.ok) parsed = obj; else lastErrors = v.errors.slice(0, 30); }
      run.rawOutput = r.text.slice(0, 60000);
      if (!parsed) {
        run.validationErrors.push(...lastErrors);
        // Repair with one fresh user turn (no replayed assistant turn, so no history editing).
        messages.splice(0, messages.length, { role: "user", content: `${userText}\n\nYOUR PREVIOUS REPLY (rejected):\n${r.text.slice(0, 30000)}\n\nIt failed the output contract:\n- ${lastErrors.join("\n- ")}\nReply again with only the corrected JSON.` });
      }
    }
    if (!parsed) throw new ModelError("schema_failure", "Output failed its contract twice: " + lastErrors.slice(0, 3).join("; "));
    run.status = "SUCCEEDED"; run.output = parsed;
    return { output: parsed, run };
  } catch (e) {
    run.status = "FAILED"; run.error = { code: e.code || "error", message: e.message };
    throw e;
  } finally {
    run.durationMs = Math.round(performance.now() - t0); run.finishedAt = nowIso();
    await db.put("agentRuns", run);
  }
}

async function charge(campaignId, r) {
  await db.update("campaigns", campaignId, c => {
    c.spend = c.spend || { calls: 0, costUsd: 0, tokensIn: 0, tokensOut: 0 };
    c.spend.calls++; c.spend.costUsd += r.cost; c.spend.tokensIn += r.usage.input_tokens; c.spend.tokensOut += r.usage.output_tokens;
  });
}
export class BudgetError extends Error { constructor(m) { super(m); this.code = "budget"; } }
async function assertBudget(campaignId) {
  const c = await db.get("campaigns", campaignId);
  const s = c.spend || { calls: 0, costUsd: 0 };
  if (c.budget?.maxCalls && s.calls >= c.budget.maxCalls) throw new BudgetError(`Campaign budget reached: ${s.calls} of ${c.budget.maxCalls} model calls`);
  if (c.budget?.maxCostUsd && s.costUsd >= c.budget.maxCostUsd) throw new BudgetError(`Campaign budget reached: $${s.costUsd.toFixed(2)} of $${c.budget.maxCostUsd}`);
}

/* ---------------- Handoffs (spec §8) ---------------- */
const RECEIVER_ACTIONS = {
  IDEA_SCOUT: ["Research a direction"], INDICATOR_RESEARCHER: ["Qualify indicators for an idea"], STRATEGY_ARCHITECT: ["Create a deterministic strategy definition", "Create a child version with one explicit change"],
  PINE_ENGINEER: ["Implement the SDL in Pine v6"], BACKTEST_ENGINEER: ["Report on the executed backtest plan"], ROBUSTNESS_VALIDATOR: ["Attempt to break the strategy"],
  STRATEGY_JUDGE: ["Decide from the evidence pack"], FORWARD_TEST_OPERATOR: ["Assess forward-test health and drift"], PORTFOLIO_RESEARCHER: ["Evaluate as a portfolio"], HUMAN_COMMITTEE: ["Approve or reject a paper test"],
  CHIEF_RESEARCH_ORCHESTRATOR: ["Route next step"]
};
export async function handoff({ campaignId, strategyId = null, versionId = null, from, to, taskId, output, artefactIds = [], evidenceIds = [], requestedAction, protectedIncluded = false }) {
  const fromAgent = agentById[from];
  const h = {
    schemaVersion: "1.0.0", id: uuidv7(), handoffId: null, campaignId, strategyId, strategyVersionId: versionId,
    fromAgent: { role: fromAgent ? fromAgent.code : from, agentId: from, promptVersion: (await championPrompt(from).catch(() => null))?.hash || null },
    toRole: to, taskId, status: output?.status || "COMPLETE", summary: output?.summary || "", assumptions: output?.assumptions || [], unknowns: output?.unknowns || [],
    riskFlags: output?.risks ? output.risks.map(r => (typeof r === "string" ? r : r.risk)) : [], artefactIds, evidenceIds, requestedAction, createdAt: nowIso()
  };
  h.handoffId = h.id;
  const problems = [];
  if (!h.summary) problems.push("missing summary");
  if (h.status === "BLOCKED") problems.push("sender returned BLOCKED");
  if (!(RECEIVER_ACTIONS[to] || []).includes(requestedAction)) problems.push("requested action outside receiving role");
  if (protectedIncluded && !["ROBUSTNESS_VALIDATOR", "STRATEGY_JUDGE", "HUMAN_COMMITTEE", "FORWARD_TEST_OPERATOR", "PORTFOLIO_RESEARCHER"].includes(to)) problems.push("protected holdout information included for an upstream role");
  for (const id of artefactIds) if (!(await db.get("artefacts", id))) problems.push("artefact " + id + " does not resolve");
  h.accepted = problems.length === 0; h.problems = problems;
  await db.put("handoffs", h);
  await db.audit(h.accepted ? "handoff.accepted" : "handoff.rejected", { handoffId: h.id, from, to, problems });
  return h;
}

export async function artefact(kind, data, refs = {}) {
  const a = { id: uuidv7(), kind, ...refs, data, hash: await hashObject(data), createdAt: nowIso() };
  await db.put("artefacts", a);
  return a;
}

/* ---------------- Task queue ---------------- */
export const TASK_STATES = ["QUEUED", "RUNNING", "WAITING_HUMAN", "WAITING_EXTERNAL", "SUCCEEDED", "FAILED_RETRYABLE", "FAILED_TERMINAL", "CANCELLED"];
let handlers = {};
export function registerHandlers(h) { handlers = h; }

export async function enqueue(kind, { campaignId, lane, title, refs = {}, input = {}, deps = [], maxAttempts = 2, status = "QUEUED" }) {
  const t = { id: uuidv7(), kind, campaignId, lane, title, refs, input, deps, status, attempts: 0, maxAttempts, createdAt: nowIso() };
  await db.put("tasks", t);
  pump();
  return t;
}

let running = new Map(), pumping = false, paused = false;
const listeners = new Set();
export const onActivity = fn => (listeners.add(fn), () => listeners.delete(fn));
const ping = msg => listeners.forEach(fn => { try { fn(msg); } catch (_) {} });
export const activeTasks = () => [...running.values()];
export function setPaused(p) { paused = p; if (!p) pump(); }

export async function pump() {
  if (pumping || paused) return;
  pumping = true;
  try {
    const conc = (await db.setting("concurrency")) || 2;
    while (running.size < conc) {
      const tasks = await db.all("tasks", t => t.status === "QUEUED" && !running.has(t.id));
      const campaigns = Object.fromEntries((await db.all("campaigns")).map(c => [c.id, c]));
      const done = new Set((await db.all("tasks", t => t.status === "SUCCEEDED")).map(t => t.id));
      const next = tasks.filter(t => (!t.campaignId || campaigns[t.campaignId]?.status === "RUNNING") && t.deps.every(d => done.has(d)))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!next) break;
      execute(next);
    }
  } finally { pumping = false; }
}

async function execute(task) {
  const ctl = new AbortController();
  running.set(task.id, { task, ctl, startedAt: Date.now(), progress: "" });
  await db.update("tasks", task.id, { status: "RUNNING", startedAt: nowIso(), attempts: (task.attempts || 0) + 1 });
  ping({ type: "task", task });
  try {
    const h = handlers[task.kind];
    if (!h) throw new Error("No handler for " + task.kind);
    const out = await h(task, { signal: ctl.signal, progress: msg => { const r = running.get(task.id); if (r) r.progress = msg; ping({ type: "progress", taskId: task.id, msg }); } });
    const status = out && out.status ? out.status : "SUCCEEDED";
    await db.update("tasks", task.id, { status, finishedAt: nowIso(), result: out?.result || null, error: null });
  } catch (e) {
    const cur = await db.get("tasks", task.id);
    const aborted = e.name === "AbortError" || ctl.signal.aborted;
    const budget = e.code === "budget";
    const retryable = !aborted && !budget && cur.attempts < cur.maxAttempts && !["schema_failure", "no_key", "bad_key", "refused", "no_credit"].includes(e.code);
    const status = aborted ? "CANCELLED" : budget ? "WAITING_HUMAN" : retryable ? "QUEUED" : "FAILED_TERMINAL";
    await db.update("tasks", task.id, { status, finishedAt: nowIso(), error: { code: e.code || "error", message: e.message || String(e) } });
    if (budget && task.campaignId) { await db.update("campaigns", task.campaignId, { status: "PAUSED", pauseReason: e.message }); await db.audit("campaign.budget_exhausted", { campaignId: task.campaignId, message: e.message }); }
    if (["no_key", "bad_key", "no_credit"].includes(e.code)) await db.update("tasks", task.id, { status: "WAITING_HUMAN" });
  } finally {
    running.delete(task.id);
    ping({ type: "done", taskId: task.id });
    setTimeout(pump, 0);
  }
}

export async function cancelTask(id) {
  const r = running.get(id);
  if (r) r.ctl.abort();
  else await db.update("tasks", id, { status: "CANCELLED", finishedAt: nowIso() });
  await db.audit("task.cancelled", { taskId: id }, { type: "human", id: "operator" });
}
export async function retryTask(id) {
  await db.update("tasks", id, t => { t.status = "QUEUED"; t.attempts = 0; t.error = null; });
  await db.audit("task.retried", { taskId: id }, { type: "human", id: "operator" });
  pump();
}
// After a reload, anything left RUNNING was interrupted: requeue it (jobs are idempotent).
export async function recover() {
  for (const t of await db.all("tasks", t => t.status === "RUNNING")) await db.update("tasks", t.id, { status: "QUEUED", error: { code: "interrupted", message: "Page closed while running; requeued" } });
  for (const r of await db.all("agentRuns", r => r.status === "RUNNING")) await db.update("agentRuns", r.id, { status: "FAILED", error: { code: "interrupted", message: "Interrupted" } });
}

export { AGENTS };
