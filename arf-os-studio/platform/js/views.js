// Views (spec §15). Each route renders HTML from IndexedDB state; actions mutate through lanes/workflow.
import * as db from "./db.js";
import { AGENTS, byId as agentById } from "./agents.js";
import { MODELS } from "./model.js";
import { VERSION_STATES, activeTasks, cancelTask, retryTask, championPrompt, pump } from "./workflow.js";
import * as L from "./lanes.js";
import { POLICIES, evaluateEvidence, buildSegments } from "./research.js";
import { validateSDL, gridSize, SDL_TEMPLATE, paramAxis } from "./sdl.js";
import { SOURCES as DATA_SOURCES, fetchBars, parseOhlcCsv } from "./data.js";
import { SUITES, runPractice, createChallenger, promotionCheck, promote, rollback } from "./practice.js";
import { lineChart, barChart, heatmap, fanChart } from "./charts.js";
import { drawdownSeries, monthlyReturns } from "./metrics.js";
import { esc, fmt, pct, isoDate, isoMinute, md, timeAgo, toast, download, copyText, readFile, $, IN_ARTIFACT } from "./ui-util.js";
const CSV_HINT = "In TradingView: open the chart, then Export chart data (time, open, high, low, close, volume). Use standard candles.";

/* ---------------- Shared bits ---------------- */
const GOOD = ["RESEARCH_APPROVED", "PAPER_APPROVED", "LIVE_CANDIDATE", "SUCCEEDED", "PASS", "OK", "ACCEPTED", "COMPLETED", "HEALTHY", "champion"];
const WARN = ["PAPER_PENDING_HUMAN", "WAITING_HUMAN", "QA_FAILED", "REWORK_REQUESTED", "DEGRADED", "WARN", "PARKED", "AWAITING_TRIAGE", "PAUSED", "challenger", "DRIFTING", "FAILED_RETRYABLE"];
const BAD = ["REJECTED", "FAILED_TERMINAL", "QUARANTINED", "FAIL", "CANCELLED", "FAILED", "MERGED", "FAILED_INFRA", "retired"];
const RUN = ["RUNNING", "BACKTESTING", "VALIDATING", "FORWARD_TESTING", "ACTIVE"];
export function badge(s) {
  if (!s) return "";
  const cls = GOOD.includes(s) ? "good" : WARN.includes(s) ? "warn" : BAD.includes(s) ? "bad" : RUN.includes(s) ? "info run" : "info";
  const icon = GOOD.includes(s) ? "✓ " : WARN.includes(s) ? "! " : BAD.includes(s) ? "✕ " : "";
  return `<span class="badge ${cls}" title="${esc(VERSION_STATES[s] || s)}">${icon}${esc(String(s).replace(/_/g, " "))}</span>`;
}
const grade = g => (g ? `<span class="grade ${g}" title="Evidence grade ${g}">${g}</span>` : `<span class="grade" title="Not graded">–</span>`);
export function avatar(id, sm = false) {
  const a = agentById[id];
  if (!a) return `<span class="av ${sm ? "sm" : ""}" style="background:#5a6876">${id === "human" ? "H" : "S"}</span>`;
  const ini = a.name.replace(/^Dr\. /, "").split(" ").map(w => w[0]).join("").slice(0, 2);
  return `<span class="av ${sm ? "sm" : ""}" style="background:hsl(${a.hue} 45% 40%)" title="${esc(a.name)} — ${esc(a.role)}">${ini}</span>`;
}
const laneName = id => agentById[id]?.role || ({ data: "Data", system: "System" }[id] || id);
const pf = x => (x === Infinity ? "∞" : fmt(x, 2));
const money = x => (Number.isFinite(x) ? (x < 0 ? "−" : "") + "$" + fmt(Math.abs(x), 0) : "—");
const page = (head, body) => `<div class="page">${head}${body}</div>`;
const header = (title, sub = "", actions = "", crumbs = "") => `<div class="page-head"><div>${crumbs ? `<div class="crumbs">${crumbs}</div>` : ""}<h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${actions ? `<div class="actions">${actions}</div>` : ""}</div>`;
const tabs = (base, list, cur) => `<nav class="tabs">${list.map(([k, l]) => `<a href="${base}/${k}" ${cur === k ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>`;
const empty = (title, text, action = "") => `<div class="card empty"><h3>${title}</h3><p>${text}</p>${action}</div>`;
const vname = v => `${esc(v.sdl?.strategy?.name || "Strategy")} <span class="muted">v${v.versionNumber}</span>`;
const vlink = v => `<a href="#/version/${v.id}">${vname(v)}</a>`;
const sortDesc = (a, k = "createdAt") => [...a].sort((x, y) => String(y[k] || "").localeCompare(String(x[k] || "")));

function metricRows(cols) {
  const rows = [
    ["Trades", m => fmt(m.tradeCount, 0)], ["Net profit", m => money(m.netProfit)], ["Total return", m => pct(m.totalReturn)], ["Profit factor", m => pf(m.profitFactor)],
    ["Win rate", m => pct(m.winRate)], ["Max drawdown", m => pct(m.maxDrawdown)], ["Sharpe", m => fmt(m.sharpe, 2)], ["Sortino", m => fmt(m.sortino, 2)],
    ["Expectancy / trade", m => money(m.expectancy)], ["Payoff ratio", m => fmt(m.payoff, 2)], ["Avg bars held", m => fmt(m.avgBarsHeld, 1)], ["Exposure", m => pct(m.exposurePct)],
    ["Top trade share of net", m => pct(m.topTradeShare)], ["Commission / gross profit", m => pct(m.commissionShareOfGross)], ["Positive months", m => pct(m.positiveMonthsPct)], ["Longest drawdown", m => (Number.isFinite(m.longestDrawdownDays) ? fmt(m.longestDrawdownDays, 0) + " d" : "—")],
    ["Long / short trades", m => `${fmt(m.longCount, 0)} / ${fmt(m.shortCount, 0)}`]
  ];
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Metric</th>${cols.map(c => `<th class="num">${c.label}</th>`).join("")}</tr></thead><tbody>${rows.map(([l, f]) => `<tr><td>${l}</td>${cols.map(c => `<td class="num">${c.m ? (c.m.tradeCount === undefined && l !== "Total return" ? "—" : f(c.m)) : "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="small faint" style="margin-top:6px">Metrics: arf-metrics/1.0.0 · each segment starts at $10,000 · costs included</p>`;
}

/* ---------------- Nav counts ---------------- */
export async function navCounts() {
  const ideas = await db.all("ideas", i => i.status === "AWAITING_TRIAGE");
  const pending = await db.all("versions", v => v.status === "PAPER_PENDING_HUMAN");
  const waiting = await db.all("tasks", t => t.status === "WAITING_HUMAN");
  const deps = await db.all("deployments", d => ["ACTIVE", "DEGRADED"].includes(d.status));
  const ds = await db.all("datasets", d => d.status === "QUARANTINED");
  return { inbox: ideas.length, committee: pending.length + waiting.length, forward: deps.length, data: ds.length, hot: { inbox: ideas.length > 0, committee: pending.length + waiting.length > 0, forward: deps.some(d => d.status === "DEGRADED"), data: ds.length > 0 } };
}

/* ======================= Command Centre ======================= */
async function viewCommand() {
  const [campaigns, versions, tasks, transitions, deps, ideas] = await Promise.all([db.all("campaigns"), db.all("versions"), db.all("tasks"), db.all("transitions"), db.all("deployments"), db.all("ideas")]);
  const key = await db.setting("apikey");
  const { transport } = await import("./model.js");
  const weekAgo = Date.now() - 7 * 86_400_000;
  const killed = versions.filter(v => v.status === "REJECTED" && new Date(v.rejectedAt || v.updatedAt || 0).getTime() > weekAgo).length;
  const waiting = tasks.filter(t => t.status === "WAITING_HUMAN");
  const pendingHuman = versions.filter(v => v.status === "PAPER_PENDING_HUMAN");
  const triage = ideas.filter(i => i.status === "AWAITING_TRIAGE");
  const failed = tasks.filter(t => t.status === "FAILED_TERMINAL").slice(-5);
  const spend = campaigns.reduce((s, c) => s + (c.spend?.costUsd || 0), 0);
  const degraded = deps.filter(d => d.status === "DEGRADED");
  let html = "";
  if (!campaigns.length) {
    html += `<div class="card section" style="margin-top:0"><h2>Start your research factory</h2><ol class="prose" style="margin:8px 0 0;padding-left:20px;line-height:1.8">
      <li>${transport() === "claude" || key ? `<span class="pass">✓</span> Agents are connected${transport() === "claude" ? " through your Claude plan" : ""}.` : IN_ARTIFACT ? `Allow this page to use Claude when it asks (agents run on your Claude plan).` : `Add an Anthropic API key in <a href="#/admin">Policies & Admin</a>. Calls go from your browser straight to the API; the key stays on this device.`}</li>
      <li>Create a <a href="#/campaigns">campaign</a>: a brief, a market (${IN_ARTIFACT ? "upload price history exported from TradingView" : "e.g. Binance BTCUSDT 4h"}), a budget and a policy profile.</li>
      <li>Start it. The Orchestrator plans directions, the Scout writes idea cards, the Indicator Researcher and Architect produce a strategy definition, the Pine Engineer codes it, the research runner backtests it on real data, the Validator tries to break it and the Judge decides.</li>
      <li>You approve paper tests in the <a href="#/committee">Committee</a> and watch them in <a href="#/forward">Forward Tests</a>. No agent can approve live capital.</li></ol>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="newCampaign">New campaign</button><a class="btn" href="#/lab">Hand-write a strategy in the Backtest Lab</a></div></div>`;
  }
  html += `<div class="tiles section">
    <a class="tile" href="#/campaigns"><div class="lbl">Active campaigns</div><div class="val">${campaigns.filter(c => c.status === "RUNNING").length}<small> / ${campaigns.length}</small></div></a>
    <a class="tile" href="#/library"><div class="lbl">Strategy versions</div><div class="val">${versions.length}</div></a>
    <a class="tile ${waiting.length + pendingHuman.length + triage.length ? "attn" : ""}" href="#/committee"><div class="lbl">Needs a human</div><div class="val">${waiting.length + pendingHuman.length + triage.length}</div></a>
    <a class="tile" href="#/library?state=REJECTED"><div class="lbl">Killed in last 7 days</div><div class="val">${killed}</div></a>
    <a class="tile ${degraded.length ? "attn" : ""}" href="#/forward"><div class="lbl">Forward tests (degraded)</div><div class="val">${deps.filter(d => ["ACTIVE", "DEGRADED"].includes(d.status)).length}<small> (${degraded.length})</small></div></a>
    <a class="tile" href="#/agents"><div class="lbl">Model spend</div><div class="val">$${spend.toFixed(2)}</div></a></div>`;
  // Funnel
  const order = ["DEFINED", "PINE_READY", "QA_FAILED", "BACKTESTING", "BACKTESTED", "VALIDATING", "VALIDATED", "IN_COMMITTEE", "RESEARCH_APPROVED", "PAPER_PENDING_HUMAN", "PAPER_APPROVED", "FORWARD_TESTING", "LIVE_CANDIDATE", "REWORK_REQUESTED", "REJECTED", "ARCHIVED"];
  const counts = Object.fromEntries(order.map(s => [s, versions.filter(v => v.status === s).length]));
  const maxC = Math.max(1, ...Object.values(counts));
  const funnel = `<div class="funnel">${order.map(s => `<a class="funnel-row" href="#/library?state=${s}"><span>${badge(s)}</span><span class="bar"><i style="width:${(counts[s] / maxC) * 100}%"></i></span><span class="n">${counts[s]}</span></a>`).join("")}</div>`;
  const running = activeTasks();
  const queuedByLane = {};
  for (const t of tasks.filter(t => t.status === "QUEUED")) queuedByLane[t.lane] = (queuedByLane[t.lane] || 0) + 1;
  const runHtml = running.length ? running.map(r => `<div class="task"><div class="row">${avatar(r.task.lane, true)}<span class="tt">${esc(r.task.title)}</span></div><div class="meta">${badge("RUNNING")}<span>${Math.round((Date.now() - r.startedAt) / 1000)}s</span><span class="progress" data-progress="${r.task.id}">${esc(r.progress || "")}</span></div></div>`).join("") : `<p class="muted small">Nothing running.</p>`;
  const attention = [
    ...triage.map(i => `<div><time>idea</time><span><a href="#/inbox">${esc(i.title)}</a> awaits triage</span></div>`),
    ...pendingHuman.map(v => `<div><time>committee</time><span>${vlink(v)} — judge recommends a paper test</span></div>`),
    ...waiting.map(t => `<div><time>task</time><span>${esc(t.title)} — ${esc(t.error?.message || "waiting for a human")} ${t.campaignId ? `<a href="#/campaign/${t.campaignId}/tasks">open</a>` : ""}</span></div>`),
    ...failed.map(t => `<div><time>failed</time><span>${esc(t.title)}: ${esc(t.error?.message || "")} ${t.campaignId ? `<a href="#/campaign/${t.campaignId}/tasks">open</a>` : ""}</span></div>`),
    ...degraded.map(d => `<div><time>forward</time><span>Deployment ${esc(d.id.slice(0, 8))} degraded: ${esc((d.health?.issues || []).join("; "))}</span></div>`),
    ...campaigns.filter(c => c.status === "PAUSED" && c.pauseReason).map(c => `<div><time>campaign</time><span><a href="#/campaign/${c.id}">${esc(c.name)}</a> paused: ${esc(c.pauseReason)}</span></div>`)
  ];
  const vById = Object.fromEntries(versions.map(v => [v.id, v]));
  const feed = sortDesc(transitions, "created_at").slice(0, 14).map(t => { const v = vById[t.strategy_version_id]; return `<div><time>${timeAgo(t.created_at)}</time><span>${v ? vlink(v) : "version"} ${t.from_state ? badge(t.from_state) + " → " : ""}${badge(t.to_state)} <span class="muted">by ${esc(t.actor_id)}${t.human_override ? " (override)" : ""}</span>${t.free_text_summary ? `<br><span class="small muted">${esc(t.free_text_summary.slice(0, 160))}</span>` : ""}</span></div>`; }).join("");
  html += `<div class="grid g2 section">
    <div class="card"><div class="card-head"><h2>Strategy funnel</h2><span class="right small muted">by lifecycle state</span></div>${funnel}</div>
    <div class="stack">
      <div class="card"><div class="card-head"><h2>Running now</h2><span class="right small muted">${Object.entries(queuedByLane).map(([l, n]) => `${laneName(l)} ${n}`).join(" · ") || "queue empty"}</span></div>${runHtml}</div>
      <div class="card"><h2>Needs attention</h2>${attention.length ? `<div class="feed">${attention.join("")}</div>` : `<p class="muted small">Nothing is waiting on you.</p>`}</div>
    </div></div>
    <div class="card section"><h2>Recent decisions</h2>${feed ? `<div class="feed">${feed}</div>` : `<p class="muted small">No transitions yet.</p>`}</div>`;
  return page(header("Command Centre", "What the research factory is doing now, where work is blocked and what needs you.", `<button class="btn primary" data-act="newCampaign">New campaign</button>`), html);
}

/* ======================= Campaigns ======================= */
async function viewCampaigns() {
  const cs = sortDesc(await db.all("campaigns"));
  const versions = await db.all("versions");
  if (!cs.length) return page(header("Campaigns", "A campaign is a research brief with a market, budget and policy. Agents work through it end to end."), empty("No campaigns yet", "Create one to put the agents to work.", `<button class="btn primary" data-act="newCampaign">New campaign</button>`));
  const rows = cs.map(c => {
    const vs = versions.filter(v => v.campaignId === c.id);
    const spend = c.spend || {};
    return `<tr class="click" data-href="#/campaign/${c.id}"><td><a href="#/campaign/${c.id}">${esc(c.name)}</a><div class="small muted">${esc(c.brief.slice(0, 120))}</div></td><td>${badge(c.status)}</td><td>${esc(c.market.source)}:${esc(c.market.symbol)} · ${esc(c.market.timeframe)}</td><td>${esc(POLICIES[c.policy]?.name || c.policy)}</td><td class="num">${vs.length}</td><td class="num">${vs.filter(v => ["RESEARCH_APPROVED", "PAPER_PENDING_HUMAN", "PAPER_APPROVED", "FORWARD_TESTING", "LIVE_CANDIDATE"].includes(v.status)).length}</td><td class="num">$${(spend.costUsd || 0).toFixed(2)} / $${c.budget.maxCostUsd}</td><td class="num">${spend.calls || 0} / ${c.budget.maxCalls}</td><td>${timeAgo(c.createdAt)}</td></tr>`;
  }).join("");
  return page(header("Campaigns", "Research briefs being worked by the agent lanes.", `<button class="btn primary" data-act="newCampaign">New campaign</button>`),
    `<div class="table-wrap"><table class="t"><thead><tr><th>Campaign</th><th>Status</th><th>Market</th><th>Policy</th><th class="num">Versions</th><th class="num">Approved</th><th class="num">Spend</th><th class="num">Calls</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

async function campaignForm() {
  const datasets = await db.all("datasets", d => d.status !== "QUARANTINED");
  const tfOpts = src => Object.keys(DATA_SOURCES[src].tf).map(t => `<option value="${t}" ${t === "240" ? "selected" : ""}>${t}</option>`).join("");
  return `<h2>New research campaign</h2>
  <form id="campaignForm" class="stack">
    <div class="form-grid">
      <label class="field wide">Name<input type="text" name="name" required placeholder="BTC volatility regimes, 4h"></label>
      <label class="field wide">Research brief<textarea name="brief" required placeholder="What should the agents look for? Constraints, markets, ideas to avoid…">Find simple, robust trend or volatility-regime strategies on this market that survive realistic costs and out-of-sample testing. Prefer few parameters. Avoid anything that needs data beyond OHLCV.</textarea></label>
      <label class="field">Data source<select name="source" id="cfSource">${IN_ARTIFACT ? "" : Object.entries(DATA_SOURCES).map(([k, s]) => `<option value="${k}">${esc(s.name)}</option>`).join("")}${datasets.length ? `<option value="dataset">Existing dataset…</option>` : ""}<option value="csv">Upload CSV…</option></select></label>
      <label class="field wide" id="cfCsvWrap" hidden>Price history CSV<input type="file" name="csvFile" accept=".csv,text/csv"><span class="hint">${CSV_HINT}</span></label>
      <label class="field" id="cfTickWrap" hidden>Tick size (optional)<input type="number" step="any" name="tickSize" placeholder="auto"></label>
      <label class="field">Symbol<input type="text" name="symbol" value="BTCUSDT" required></label>
      <label class="field">Timeframe<select name="timeframe" id="cfTf">${IN_ARTIFACT ? ["15", "60", "240", "1D"].map(t => `<option ${t === "240" ? "selected" : ""}>${t}</option>`).join("") : tfOpts("binance")}</select></label>
      <label class="field" id="cfDaysWrap">History (days)<input type="number" name="historyDays" value="1460" min="120" max="4000"></label>
      <label class="field" id="cfDsWrap" hidden>Dataset<select name="uploadedDatasetId">${datasets.map(d => `<option value="${d.id}">${esc(d.symbol)} ${esc(d.timeframe)} · ${d.bars} bars · ${isoDate(d.from)}→${isoDate(d.to)}</option>`).join("")}</select></label>
      <label class="field">Policy profile<select name="policy">${Object.values(POLICIES).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
      <label class="field">Research directions<input type="number" name="maxDirections" value="2" min="1" max="6"><span class="hint">Scout tasks the Orchestrator may create</span></label>
      <label class="field">Max candidates<input type="number" name="maxCandidates" value="2" min="1" max="10"><span class="hint">Ideas promoted to strategy design</span></label>
      <label class="field">Budget: model calls<input type="number" name="maxCalls" value="60" min="5"></label>
      <label class="field">Budget: USD<input type="number" name="maxCostUsd" value="10" min="0.5" step="0.5"></label>
      <label class="check wide"><input type="checkbox" name="autoTriage" checked> Auto-triage ideas by policy (otherwise every idea waits in the Research Inbox for you)</label>
    </div>
    <p class="small muted">Roughly 12–20 model calls per candidate strategy end to end. ${IN_ARTIFACT ? "Agents run on your Claude plan; dollar figures are list-price estimates used only for the budget cap." : "Spend is estimated from token usage at list prices."}</p>
    <div class="foot"><button type="button" class="btn" data-act="closeModal">Cancel</button><button type="submit" class="btn">Create draft</button><button type="submit" class="btn primary" data-start="1">Create and start</button></div>
  </form>`;
}

async function viewCampaign([id, tab = "overview"]) {
  const c = await db.get("campaigns", id);
  if (!c) return page(header("Campaign not found"), "");
  const base = `#/campaign/${id}`;
  const acts = [
    c.status === "DRAFT" || c.status === "PAUSED" ? `<button class="btn primary" data-act="startCampaign" data-id="${id}">${c.status === "DRAFT" ? "Start" : "Resume"}</button>` : "",
    c.status === "RUNNING" ? `<button class="btn" data-act="pauseCampaign" data-id="${id}">Pause</button>` : "",
    !["CANCELLED", "COMPLETED"].includes(c.status) ? `<button class="btn danger" data-act="cancelCampaign" data-id="${id}" data-confirm="Cancel this campaign and all queued tasks?">Cancel</button>` : ""
  ].join("");
  const head = header(esc(c.name), `${badge(c.status)} ${esc(c.market.source)}:${esc(c.market.symbol)} · ${esc(c.market.timeframe)} · ${esc(POLICIES[c.policy]?.name || c.policy)}${c.pauseReason ? ` · <span class="fail">${esc(c.pauseReason)}</span>` : ""}`, acts, `<a href="#/campaigns">Campaigns</a>`);
  const t = tabs(base, [["overview", "Overview"], ["tasks", "Task graph"], ["ideas", "Ideas"], ["candidates", "Candidates"], ["decisions", "Decisions"], ["audit", "Audit"]], tab);
  let body = "";
  if (tab === "overview") {
    const plan = c.planArtefactId ? (await db.get("artefacts", c.planArtefactId))?.data : null;
    const ds = c.datasetId ? await db.get("datasets", c.datasetId) : null;
    const s = c.spend || { calls: 0, costUsd: 0, tokensIn: 0, tokensOut: 0 };
    const pctCost = Math.min(100, (s.costUsd / c.budget.maxCostUsd) * 100), pctCalls = Math.min(100, (s.calls / c.budget.maxCalls) * 100);
    body = `<div class="grid g2"><div class="card"><h2>Brief</h2><div class="prose">${md(c.brief)}</div>
      <dl class="kv" style="margin-top:10px"><dt>Directions</dt><dd>${c.maxDirections}</dd><dt>Max candidates</dt><dd>${c.maxCandidates}</dd><dt>Idea triage</dt><dd>${c.autoTriage ? "Automatic by policy" : "Human"}</dd><dt>Dataset</dt><dd>${ds ? `<a href="#/data/${ds.id}">${esc(ds.symbol)} ${esc(ds.timeframe)}</a> · ${ds.bars} bars · ${isoDate(ds.from)} → ${isoDate(ds.to)} ${badge(ds.status)}` : "not loaded"}</dd></dl></div>
      <div class="card"><h2>Budget</h2><div class="funnel"><div class="funnel-row"><span>Spend $${s.costUsd.toFixed(2)} / $${c.budget.maxCostUsd}</span><span class="bar"><i style="width:${pctCost}%"></i></span><span class="n">${Math.round(pctCost)}%</span></div><div class="funnel-row"><span>Calls ${s.calls} / ${c.budget.maxCalls}</span><span class="bar"><i style="width:${pctCalls}%"></i></span><span class="n">${Math.round(pctCalls)}%</span></div></div><p class="small muted" style="margin-top:8px">${fmt(s.tokensIn, 0)} input / ${fmt(s.tokensOut, 0)} output tokens. When a limit is reached the campaign pauses and asks you.</p>
      <form class="row" data-form="budget" data-id="${id}"><label class="field" style="width:130px">Max calls<input type="number" name="maxCalls" value="${c.budget.maxCalls}"></label><label class="field" style="width:130px">Max USD<input type="number" step="0.5" name="maxCostUsd" value="${c.budget.maxCostUsd}"></label><button class="btn small" data-act="saveBudget" data-id="${id}" style="align-self:end">Update budget</button></form></div></div>
      <div class="card section"><h2>Campaign plan</h2>${plan ? `<p>${esc(plan.summary)}</p><div class="table-wrap"><table class="t"><thead><tr><th>Direction</th><th>Question</th><th>Priority</th></tr></thead><tbody>${plan.directions.map(d => `<tr><td>${esc(d.title)}</td><td>${esc(d.question)}<div class="small muted">${esc(d.rationale)}</div></td><td>${esc(d.priority)}</td></tr>`).join("")}</tbody></table></div>${plan.risks?.length ? `<p class="small muted" style="margin-top:8px">Risks: ${esc(plan.risks.join("; "))}</p>` : ""}` : `<p class="muted">The Orchestrator writes the plan after data loads.</p>`}</div>`;
  } else if (tab === "tasks") {
    const tasks = (await db.all("tasks", t => t.campaignId === id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lanes = ["data", "orchestrator", "scout", "indicator", "architect", "pine", "backtest", "validator", "judge"];
    const running = Object.fromEntries(activeTasks().map(r => [r.task.id, r]));
    const prot = ["VALIDATION_RUN", "VALIDATE", "JUDGE"];
    body = tasks.length ? `<div class="lanes">${lanes.map(l => `<div class="lane"><h3>${avatar(l, true)} ${esc(laneName(l))}</h3>${tasks.filter(t => t.lane === l).map(t => {
      const dur = t.finishedAt && t.startedAt ? Math.round((new Date(t.finishedAt) - new Date(t.startedAt)) / 1000) + "s" : "";
      const ctl = ["QUEUED", "RUNNING"].includes(t.status) ? `<button class="btn small" data-act="cancelTask" data-id="${t.id}">Cancel</button>` : ["FAILED_TERMINAL", "CANCELLED", "WAITING_HUMAN"].includes(t.status) ? `<button class="btn small" data-act="retryTask" data-id="${t.id}">Retry</button>` : "";
      return `<div class="task ${prot.includes(t.kind) ? "prot" : ""}" title="${prot.includes(t.kind) ? "Sees protected holdout data" : ""}"><div class="tt">${esc(t.title)}</div><div class="meta">${badge(t.status)}${t.attempts > 1 ? `<span>attempt ${t.attempts}</span>` : ""}<span>${dur}</span>${t.refs?.versionId ? `<a href="#/version/${t.refs.versionId}">version</a>` : ""}${ctl}</div>${running[t.id] ? `<div class="progress" data-progress="${t.id}">${esc(running[t.id].progress || "")}</div>` : ""}${t.error ? `<div class="small ${t.status === "FAILED_TERMINAL" ? "fail" : "muted"}">${esc(t.error.message.slice(0, 220))}</div>` : ""}</div>`;
    }).join("")}</div>`).join("")}</div><p class="small muted" style="margin-top:8px">Tasks marked with an orange edge see protected holdout data. Tasks are idempotent and are requeued if the page closes mid-run.</p>` : empty("No tasks yet", c.status === "DRAFT" ? "Start the campaign to create the first task." : "");
  } else if (tab === "ideas") body = await ideasList(i => i.campaignId === id);
  else if (tab === "candidates") body = await versionsTable(v => v.campaignId === id);
  else if (tab === "decisions") body = await decisionsList(d => d.campaignId === id);
  else if (tab === "audit") body = await auditTable(a => JSON.stringify(a.data).includes(id));
  return page(head, t + body);
}

/* ======================= Research Inbox ======================= */
async function ideasList(filter, statusFilter = null) {
  let ideas = sortDesc(await db.all("ideas", filter));
  if (statusFilter) ideas = ideas.filter(i => i.status === statusFilter);
  if (!ideas.length) return empty("No ideas here", "Ideas appear when the Idea Scout researches a campaign direction.");
  const indicators = await db.all("indicators");
  return `<div class="stack">${ideas.map(i => {
    const inds = indicators.filter(x => x.ideaId === i.id);
    const acts = ["AWAITING_TRIAGE", "PARKED", "NEW"].includes(i.status) ? `<button class="btn small primary" data-act="ideaDecision" data-id="${i.id}" data-status="ACCEPTED">Send to indicator research</button><button class="btn small" data-act="ideaDecision" data-id="${i.id}" data-status="PARKED">Park</button><button class="btn small danger" data-act="ideaDecision" data-id="${i.id}" data-status="REJECTED">Reject</button>` : "";
    return `<div class="card"><div class="card-head">${avatar("scout")}<div><h3>${esc(i.title)}</h3><div class="small muted">${esc(i.direction || "")} · ${timeAgo(i.createdAt)}</div></div><div class="right">${badge(i.status)} ${badge(i.recommendation)}</div></div>
      <p><b>Hypothesis.</b> ${esc(i.hypothesis)}</p>
      <div class="grid g2"><dl class="kv"><dt>Mechanism</dt><dd>${esc(i.mechanism)}</dd><dt>Direction</dt><dd>${esc(i.expectedDirection)}</dd><dt>Works in</dt><dd>${esc(i.expectedRegime)}</dd><dt>Fails in</dt><dd>${esc(i.failureRegime)}</dd><dt>Frequency</dt><dd>${esc(i.expectedTradeFrequency)}</dd></dl>
      <dl class="kv"><dt>Pine feasibility</dt><dd>${badge(i.pineFeasibility)}</dd><dt>Evidence</dt><dd>${esc(i.evidenceStrength)} · novelty ${i.noveltyScore}/5</dd><dt>Cheapest test</dt><dd>${esc(i.cheapestFalsificationTest)}</dd><dt>Risks</dt><dd>${esc((i.risks || []).join("; "))}</dd><dt>Sources</dt><dd>${(i.sources || []).length ? i.sources.map(s => `${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>` : esc(s.title)} <span class="faint">(${esc(s.licence || "licence unknown")})</span>`).join("; ") : "<span class='faint'>none cited</span>"}</dd></dl></div>
      ${i.duplicateOf ? `<p class="note warn small">Near-duplicate of an earlier idea.</p>` : ""}${i.triageReason ? `<p class="small muted">Triage: ${esc(i.triageReason)} (${esc(i.triagedBy?.type || "")})</p>` : ""}
      ${inds.length ? `<details><summary class="small">Indicator cards (${inds.length})</summary><div class="table-wrap" style="margin-top:6px"><table class="t"><thead><tr><th>Indicator</th><th>Role</th><th>Parameters</th><th>Repainting</th><th>Use</th></tr></thead><tbody>${inds.map(x => `<tr><td>${esc(x.name)} <code>${esc(x.type)}</code><div class="small muted">${esc(x.formula)}</div></td><td>${esc(x.role)}</td><td class="small">${x.parameters.map(p => `${esc(p.name)} ${p.min}–${p.max} (${p.default})`).join("<br>")}</td><td class="small">${esc(x.repaintingAnalysis)}</td><td>${badge(x.recommendation)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
      ${i.strategyId ? `<p class="small"><a href="#/library?strategy=${i.strategyId}">View strategy versions →</a></p>` : ""}
      ${acts ? `<div class="row" style="margin-top:8px">${acts}</div>` : ""}</div>`;
  }).join("")}</div>`;
}
async function viewInbox(_, q) {
  const st = q.status || "AWAITING_TRIAGE";
  const all = await db.all("ideas");
  const statuses = ["AWAITING_TRIAGE", "ACCEPTED", "PARKED", "REJECTED", "MERGED", "ALL"];
  const chips = `<div class="filters">${statuses.map(s => `<a class="chip" href="#/inbox?status=${s}" ${st === s ? 'style="background:var(--accent);color:var(--accent-ink);border-color:var(--accent)"' : ""}>${s.replace(/_/g, " ").toLowerCase()} (${s === "ALL" ? all.length : all.filter(i => i.status === s).length})</a>`).join("")}</div>`;
  return page(header("Research Inbox", "Idea cards from the Idea Scout, with indicator research attached. Accept to send an idea to strategy design."), chips + await ideasList(() => true, st === "ALL" ? null : st));
}

/* ======================= Strategy Library ======================= */
async function versionsTable(filter, q = {}) {
  let vs = sortDesc(await db.all("versions", filter));
  if (q.state) vs = vs.filter(v => v.status === q.state);
  if (q.grade) vs = vs.filter(v => v.evidenceGrade === q.grade);
  if (q.strategy) vs = vs.filter(v => v.strategyId === q.strategy);
  if (q.q) { const s = q.q.toLowerCase(); vs = vs.filter(v => JSON.stringify(v.sdl.strategy).toLowerCase().includes(s)); }
  if (q.view === "candidates") vs = vs.filter(v => ["DEFINED", "PINE_READY", "QA_FAILED", "BACKTESTING", "BACKTESTED", "VALIDATING", "VALIDATED", "IN_COMMITTEE"].includes(v.status));
  if (q.view === "approved") vs = vs.filter(v => ["RESEARCH_APPROVED", "PAPER_PENDING_HUMAN", "PAPER_APPROVED", "FORWARD_TESTING", "LIVE_CANDIDATE"].includes(v.status));
  if (q.view === "paper") vs = vs.filter(v => ["PAPER_APPROVED", "FORWARD_TESTING"].includes(v.status));
  if (q.view === "overfit") vs = vs.filter(v => v.status === "REJECTED" && /overfit|neighbour|parameter|sensitiv|concentrat/i.test(v.lastDecisionSummary || ""));
  if (!vs.length) return empty("No strategy versions", "Versions appear when the Strategy Architect writes a definition, or when you hand-write one in the Backtest Lab.");
  const bts = Object.fromEntries((await db.all("backtests")).map(b => [b.id, b]));
  const datasets = Object.fromEntries((await db.all("datasets")).map(d => [d.id, d]));
  const vers = await db.all("verifications");
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Strategy</th><th>State</th><th>Grade</th><th>Market</th><th class="num">Val. trades</th><th class="num">Val. PF</th><th class="num">WF OOS PF</th><th class="num">Val. max DD</th><th>TV parity</th><th>Last decision</th><th>Updated</th></tr></thead><tbody>${vs.map(v => {
    const bt = bts[v.backtestId]?.result; const ds = datasets[v.datasetId];
    const tv = vers.filter(x => x.versionId === v.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return `<tr class="click" data-href="#/version/${v.id}"><td>${vlink(v)}<div class="small muted">${esc(v.sdl.strategy.family)} · ${esc(v.sdl.strategy.directions.join("/"))}${v.contaminatedDatasetIds?.length ? " · holdout contaminated" : ""}</div></td><td>${badge(v.status)}</td><td>${grade(v.evidenceGrade)} ${v.evidenceScore !== undefined ? `<span class="small muted">${fmt(v.evidenceScore, 0)}</span>` : ""}</td><td class="small">${ds ? `${esc(ds.symbol)} ${esc(ds.timeframe)}` : ""}</td><td class="num">${bt ? bt.validation.metrics.tradeCount : "—"}</td><td class="num">${bt ? pf(bt.validation.metrics.profitFactor) : "—"}</td><td class="num">${bt ? pf(bt.walkForward.oos.profitFactor) : "—"}</td><td class="num">${bt ? pct(bt.validation.metrics.maxDrawdown) : "—"}</td><td>${tv ? badge(tv.status) : `<span class="faint small">none</span>`}</td><td class="small">${esc((v.lastDecisionSummary || "").slice(0, 90))}</td><td class="small">${timeAgo(v.updatedAt || v.createdAt)}</td></tr>`;
  }).join("")}</tbody></table></div>`;
}
async function viewLibrary(_, q) {
  const views = [["", "All"], ["candidates", "In research"], ["approved", "Approved"], ["paper", "Paper testing"], ["overfit", "Rejected for fragility"]];
  const qs = o => "#/library?" + new URLSearchParams(Object.entries({ ...q, ...o }).filter(([, v]) => v)).toString();
  const filters = `<div class="filters">${views.map(([k, l]) => `<a class="chip" href="${qs({ view: k, state: "" })}" ${(q.view || "") === k && !q.state ? 'style="background:var(--accent);color:var(--accent-ink);border-color:var(--accent)"' : ""}>${l}</a>`).join("")}
    <select data-nav="state"><option value="">Any state</option>${Object.keys(VERSION_STATES).map(s => `<option ${q.state === s ? "selected" : ""}>${s}</option>`).join("")}</select>
    <select data-nav="grade"><option value="">Any grade</option>${["A", "B", "C", "D", "F"].map(g => `<option ${q.grade === g ? "selected" : ""}>${g}</option>`).join("")}</select>
    <input type="search" data-nav="q" placeholder="Search name or thesis" value="${esc(q.q || "")}"></div>`;
  return page(header("Strategy Library", "Every strategy version, including rejected ones. Failed research is a knowledge asset."), filters + await versionsTable(() => true, q));
}

/* ======================= Strategy version detail ======================= */
async function viewVersion([id, tab = "evidence"], q) {
  const v = await db.get("versions", id);
  if (!v) return page(header("Version not found"), "");
  const strategy = await db.get("strategies", v.strategyId);
  const c = v.campaignId ? await db.get("campaigns", v.campaignId) : null;
  const base = `#/version/${id}`;
  const st = v.status;
  const acts = [];
  if (st === "BACKTESTED") acts.push(`<button class="btn primary" data-act="sendToValidation" data-id="${id}">Send to validation</button>`);
  if (st === "DEFINED" && !v.backtestId) acts.push(`<button class="btn primary" data-act="backtestNow" data-id="${id}">Run backtest plan</button>`);
  if (["RESEARCH_APPROVED", "PAPER_PENDING_HUMAN"].includes(st)) acts.push(`<button class="btn primary" data-act="approvePaper" data-id="${id}">Approve paper test…</button>`);
  if (st === "PAPER_APPROVED") acts.push(`<button class="btn primary" data-act="startForward" data-id="${id}">Start forward test</button>`);
  if (st === "FORWARD_TESTING") acts.push(`<button class="btn primary" data-act="markLive" data-id="${id}">Mark live candidate…</button>`);
  if (!["REJECTED", "ARCHIVED", "REWORK_REQUESTED"].includes(st)) acts.push(`<button class="btn" data-act="humanRework" data-id="${id}">Request new version…</button>`);
  acts.push(`<button class="btn" data-act="humanDecision" data-id="${id}">Decision / override…</button>`);
  const crumbs = `<a href="#/library">Strategy Library</a>${c ? ` · <a href="#/campaign/${c.id}">${esc(c.name)}</a>` : ""}`;
  const head = header(`${esc(strategy?.name || v.sdl.strategy.name)} <span class="muted">v${v.versionNumber}</span>`, `${badge(st)} ${grade(v.evidenceGrade)} ${esc(VERSION_STATES[st] || "")}${v.contaminatedDatasetIds?.length ? ` · <span class="badge warn">! holdout contaminated</span>` : ""}`, acts.join(""), crumbs);
  const t = tabs(base, [["evidence", "Evidence"], ["definition", "Definition"], ["source", "Pine source"], ["backtest", "Backtests"], ["robustness", "Robustness"], ["tradingview", "TradingView"], ["forward", "Forward"], ["decisions", "Decisions"], ["lineage", "Lineage"], ["runs", "Agent runs"]], tab);
  const R = { evidence: tabEvidence, definition: tabDefinition, source: tabSource, backtest: tabBacktest, robustness: tabRobustness, tradingview: tabTradingView, forward: tabForward, decisions: tabDecisions, lineage: tabLineage, runs: tabRuns };
  return page(head, t + await (R[tab] || tabEvidence)(v, q, c));
}

async function tabEvidence(v, q, c) {
  const ev = evaluateEvidence(await L.gatherEvidence(v), c?.policy || "discovery");
  const val = v.validationId ? await db.get("validations", v.validationId) : null;
  const dec = v.lastDecisionId ? await db.get("decisions", v.lastDecisionId) : null;
  const bt = v.backtestId ? await db.get("backtests", v.backtestId) : null;
  const parts = [["dataIntegrity", "Data integrity", 10], ["causality", "Causality & non-repainting", 15], ["reproducibility", "Reproducibility & parity", 10], ["outOfSample", "Out-of-sample performance", 15], ["segmentStability", "Segment stability", 15], ["parameterStability", "Parameter stability", 10], ["costExecution", "Cost & execution resilience", 10], ["concentration", "Concentration & tail risk", 5], ["crossMarket", "Cross-market / regime", 5], ["forward", "Forward evidence", 5]];
  const next = { DEFINED: "Pine implementation and the backtest plan.", PINE_READY: "Backtest plan on the research runner.", QA_FAILED: "Fix Pine QA findings (regenerate) — the runner backtest continues meanwhile.", BACKTESTING: "Runner is executing the plan.", BACKTESTED: "Backtest Engineer report, then robustness validation.", VALIDATING: "Robustness suite and one-time holdout.", VALIDATED: "Strategy Judge decision.", IN_COMMITTEE: "Strategy Judge decision.", RESEARCH_APPROVED: "TradingView parity check, then a human may approve a paper test.", PAPER_PENDING_HUMAN: "Human committee approval of a paper test.", PAPER_APPROVED: "Start the forward test.", FORWARD_TESTING: `Accumulate forward evidence (${POLICIES[c?.policy || "discovery"].forwardMinTrades} trades / ${POLICIES[c?.policy || "discovery"].forwardMinDays} days).`, LIVE_CANDIDATE: "Human live review outside ARF-OS.", REWORK_REQUESTED: "Child version from the Strategy Architect.", REJECTED: "None — kept as a knowledge asset.", ARCHIVED: "None." }[v.status];
  const supports = ev.gates.filter(g => g.pass === true).map(g => `${g.name} (${g.detail})`);
  const contradicts = [...ev.hardFails.map(h => "HARD FAIL: " + h), ...ev.gates.filter(g => g.pass === false).map(g => `${g.name} (${g.detail})`)];
  return `<div class="grid g2">
    <div class="card"><h2>Executive evidence</h2><dl class="kv">
      <dt>Claims to exploit</dt><dd>${esc(v.sdl.strategy.thesis)}</dd>
      <dt>Supports</dt><dd>${supports.length ? `<ul style="margin:0;padding-left:16px">${supports.map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : "<span class='faint'>nothing yet</span>"}</dd>
      <dt>Contradicts</dt><dd>${contradicts.length ? `<ul style="margin:0;padding-left:16px">${contradicts.map(s => `<li class="${s.startsWith("HARD") ? "fail" : ""}">${esc(s)}</li>`).join("")}</ul>` : "<span class='faint'>nothing found yet</span>"}</dd>
      <dt>Changed from parent</dt><dd>${v.parentVersionId ? `${esc(v.changeReason)} <span class="faint">(${esc(v.changeCategory)}: ${esc((v.changedFields || []).join(", "))})</span>` : "Initial version"}</dd>
      <dt>Untouched data</dt><dd>${v.contaminatedDatasetIds?.includes(v.datasetId) ? "Final holdout was seen by an ancestor — forward evidence is required." : v.holdoutEvaluated ? `Holdout evaluated once on ${isoMinute(v.holdoutEvaluatedAt)}; only forward data remains untouched.` : "Final holdout (last 20%) untouched."}</dd>
      <dt>Next</dt><dd>${esc(next || "")}</dd></dl>
      ${dec ? `<div class="section"><h3>Latest decision: ${badge(dec.decision)}</h3>${dec.policyNote ? `<p class="note warn small">${esc(dec.policyNote)}</p>` : ""}<div class="prose small">${md(dec.memo || "")}</div></div>` : ""}
      ${val?.report ? `<div class="section"><h3>Validator: ${badge(val.report.recommendation)}</h3><div class="case neg small prose"><b>Strongest rejection case.</b> ${md(val.report.rejectionCase)}</div><div class="case pos small prose" style="margin-top:6px"><b>Positive case.</b> ${md(val.report.positiveCase)}</div></div>` : ""}
      ${bt?.report ? `<div class="section"><h3>Backtest Engineer: ${badge(bt.report.recommendation)}</h3><p class="small">${esc(bt.report.summary)}</p></div>` : ""}
    </div>
    <div class="stack">
      <div class="card"><div class="card-head"><h2>Evidence score</h2><span class="right">${grade(ev.grade)} <b style="font-size:20px">${fmt(ev.score, 1)}</b><span class="muted">/100</span></span></div>
        <div class="funnel">${parts.map(([k, l, max]) => `<div class="funnel-row"><span>${l}</span><span class="bar"><i style="width:${(ev.parts[k] / max) * 100}%"></i></span><span class="n">${fmt(ev.parts[k], 1)}/${max}</span></div>`).join("")}</div>
        <p class="small muted" style="margin-top:8px">Policy ${esc(ev.policy)}@${esc(ev.policyVersion)}. Hard fails override the score. A grade is evidence quality, not a promise of profit.</p></div>
      ${ev.hardFails.length ? `<div class="note bad"><b>Hard fails</b><ul style="margin:4px 0 0;padding-left:18px">${ev.hardFails.map(h => `<li>${esc(h)}</li>`).join("")}</ul></div>` : ""}
      ${ev.softConcerns.length ? `<div class="note warn"><b>Soft concerns</b><ul style="margin:4px 0 0;padding-left:18px">${ev.softConcerns.map(h => `<li>${esc(h)}</li>`).join("")}</ul></div>` : ""}
      <div class="card"><h2>Gate checklist</h2><div class="table-wrap"><table class="t"><tbody>${ev.gates.map(g => `<tr><td>${g.pass === true ? `<span class="pass">✓ pass</span>` : g.pass === false ? `<span class="fail">✕ fail</span>` : `<span class="pend">○ pending</span>`}</td><td>${esc(g.name)}${g.required ? "" : ` <span class="faint small">(optional)</span>`}</td><td class="num small">${esc(g.detail)}</td></tr>`).join("")}</tbody></table></div></div>
    </div></div>`;
}

async function tabDefinition(v) {
  const sdl = v.sdl;
  const art = v.sdlArtefactId ? await db.get("artefacts", v.sdlArtefactId) : null;
  return `<div class="grid g2"><div class="stack">
    <div class="card"><h2>Rules</h2><dl class="kv"><dt>Thesis</dt><dd>${esc(sdl.strategy.thesis)}</dd><dt>Directions</dt><dd>${esc(sdl.strategy.directions.join(", "))}</dd>
    ${["longEntry", "shortEntry", "longExit", "shortExit"].map(k => `<dt>${k}</dt><dd>${sdl.signals[k] ? `<code>${esc(sdl.signals[k])}</code>` : "<span class='faint'>none</span>"}</dd>`).join("")}
    <dt>Stop-loss</dt><dd>${esc(sdl.risk.stopLoss.type)} ${esc(sdl.risk.stopLoss.valueParameter || sdl.risk.stopLoss.value)}${sdl.risk.stopLoss.atrIndicator ? ` × ${esc(sdl.risk.stopLoss.atrIndicator)}` : "%"}</dd>
    <dt>Take-profit</dt><dd>${esc(sdl.risk.takeProfit.type)} ${esc(sdl.risk.takeProfit.valueParameter || sdl.risk.takeProfit.value || "")}</dd>
    ${sdl.risk.trailingStop ? `<dt>Trailing stop</dt><dd>arms at +${esc(sdl.risk.trailingStop.activation.valueParameter || sdl.risk.trailingStop.activation.value)}${sdl.risk.trailingStop.activation.type === "percent" ? "%" : "×ATR"}, trails by ${esc(sdl.risk.trailingStop.offset.valueParameter || sdl.risk.trailingStop.offset.value)}${sdl.risk.trailingStop.offset.type === "percent" ? "%" : "×ATR"}</dd>` : ""}
    <dt>Sizing</dt><dd>${sdl.risk.sizePercent}% of equity × ${sdl.risk.leverage} leverage</dd><dt>Costs</dt><dd>${sdl.costs.commissionValue}% per side + ${sdl.costs.slippageTicks} ticks (tick ${sdl.costs.tickSize})</dd>
    <dt>Execution</dt><dd>Confirmed bar close → ${sdl.execution.processOnClose ? "fill at that close (process_orders_on_close)" : esc(sdl.execution.entryOrder)}, pyramiding ${sdl.execution.pyramiding}, reversal ${sdl.execution.allowReversal ? "on" : "off"}</dd>
    <dt>Segments</dt><dd>${esc(sdl.segments.selectionMode)}, warm-up ${sdl.segments.warmupBars}, embargo ${sdl.segments.embargoBars} bars</dd><dt>Grid</dt><dd>${gridSize(sdl)} combinations${gridSize(sdl) > 500 ? " (sampled to 500)" : ""}</dd><dt>Selected</dt><dd>${v.selectedParams ? `<code>${esc(JSON.stringify(v.selectedParams))}</code>` : "—"}</dd></dl></div>
    <div class="card"><h2>Indicators</h2><div class="table-wrap"><table class="t"><thead><tr><th>id</th><th>type</th><th>inputs</th></tr></thead><tbody>${sdl.indicators.map(i => `<tr><td><code>${esc(i.id)}</code></td><td>${esc(i.type)}</td><td class="small">${["source", "length", "mult", "fast", "slow", "signal"].filter(k => i[k] !== undefined).map(k => `${k}=${esc(typeof i[k] === "object" ? "{" + i[k].parameter + "}" : i[k])}`).join(", ")}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="card"><h2>Parameters</h2><div class="table-wrap"><table class="t"><thead><tr><th>key</th><th>type</th><th class="num">default</th><th class="num">range</th><th>rationale</th></tr></thead><tbody>${sdl.parameters.map(p => `<tr><td><code>${esc(p.key)}</code></td><td>${p.type}</td><td class="num">${p.default}</td><td class="num">${p.min}–${p.max} / ${p.step}</td><td class="small">${esc(p.rationale || "")}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">No optimisable parameters</td></tr>`}</tbody></table></div></div>
    <div class="card"><h2>Pre-registered falsification</h2><ul>${sdl.falsification.map(f => `<li>${esc(f)}</li>`).join("")}</ul>${art?.data?.expectedFailureModes?.length ? `<h3>Expected failure regimes</h3><ul>${art.data.expectedFailureModes.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}${art?.data?.backtestExpectations ? `<p class="small muted">Architect expected ≈${fmt(art.data.backtestExpectations.tradesPerYear, 0)} trades/yr, win rate ≈${fmt(art.data.backtestExpectations.expectedWinRatePct, 0)}%. ${esc(art.data.backtestExpectations.notes)}</p>` : ""}</div>
  </div><div class="stack">
    ${v.normalisations?.length ? `<div class="note small"><b>Orchestrator scope normalisations</b> (recorded, not silent): ${esc(v.normalisations.join("; "))}</div>` : ""}
    ${v.sdlWarnings?.length ? `<div class="note warn small"><b>SDL warnings:</b> ${esc(v.sdlWarnings.join("; "))}</div>` : ""}
    <div class="card"><div class="card-head"><h2>SDL document</h2><div class="right"><button class="btn small" data-act="copySDL" data-id="${v.id}">Copy</button><button class="btn small" data-act="downloadSDL" data-id="${v.id}">Download</button></div></div><p class="small muted">Definition hash <code>${esc(v.definitionHash.slice(0, 16))}…</code> · immutable</p><pre>${esc(JSON.stringify(sdl, null, 2))}</pre></div>
  </div></div>`;
}

async function tabSource(v) {
  if (!v.pineArtefactId) return empty("No Pine source yet", "The Pine Engineer writes it after the definition is approved.", `<button class="btn" data-act="regenPine" data-id="${v.id}">Generate Pine now</button>`);
  const art = await db.get("artefacts", v.pineArtefactId);
  const d = art.data;
  return `<div class="grid g2"><div class="card"><div class="card-head"><h2>Pine Script v6</h2><div class="right"><button class="btn small" data-act="copyPine" data-id="${v.id}">Copy</button><button class="btn small" data-act="downloadPine" data-id="${v.id}">Download .pine</button><button class="btn small" data-act="regenPine" data-id="${v.id}">New revision</button></div></div>
    <p class="small muted">Revision ${v.pineRevisions.length} · source hash <code>${esc(art.hash.slice(0, 16))}</code> · tested revisions are read-only; regenerating appends a revision.</p><pre>${esc(d.source)}</pre></div>
    <div class="stack"><div class="card"><div class="card-head"><h2>Pine QA</h2><span class="right">${d.lint.pass ? badge("PASS") : badge("FAIL")}</span></div><p class="small muted">${esc(d.lint.version)} · ${d.lint.errors} errors · ${d.lint.warnings} warnings</p>
      ${d.lint.findings.length ? `<div class="table-wrap"><table class="t"><tbody>${d.lint.findings.map(f => `<tr><td>${f.severity === "error" ? `<span class="fail">✕ error</span>` : `<span class="pend">! warning</span>`}</td><td><code>${esc(f.rule)}</code></td><td class="small">${esc(f.message)}${f.line ? ` <span class="faint">line ${f.line}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<p class="pass">✓ No findings</p>`}</div>
      <div class="card"><h2>Implementation notes</h2><div class="prose small">${md(d.implementationNotes || "")}</div>${d.deviations?.length ? `<h3>Deviations from SDL</h3><ul>${d.deviations.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="small muted">No declared deviations.</p>`}</div>
      <div class="card"><h2>Revisions</h2><div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>hash</th><th>QA</th><th>created</th></tr></thead><tbody>${v.pineRevisions.map(r => `<tr><td>${r.n}</td><td><code>${esc(r.sourceHash)}</code></td><td>${r.lintPass ? badge("PASS") : badge("FAIL")} <span class="small muted">${r.errors}E/${r.warnings}W</span></td><td class="small">${isoMinute(r.createdAt)}</td></tr>`).join("")}</tbody></table></div></div></div></div>`;
}

async function tabBacktest(v, q) {
  if (!v.backtestId) return empty("No backtest yet", "The research runner executes the plan after Pine QA.", v.status === "DEFINED" ? `<button class="btn primary" data-act="backtestNow" data-id="${v.id}">Run backtest plan</button>` : "");
  const bt = await db.get("backtests", v.backtestId);
  const r = bt.result;
  const showHold = !!v.holdoutResult;
  const hold = v.holdoutResult;
  const contaminated = v.contaminatedDatasetIds?.includes(v.datasetId);
  const series = [{ name: "Development (in-sample)", points: r.development.equity, slot: 1 }, { name: "Validation (out-of-sample)", points: r.validation.equity, slot: 3 }];
  if (showHold) series.push({ name: "Final holdout" + (contaminated ? " (contaminated)" : ""), points: hold.equity, slot: 2 });
  const bands = [{ from: r.development.window.from, to: r.development.window.to, label: "Development", kind: "dev" }, { from: r.validation.window.from, to: r.validation.window.to, label: "Validation", kind: "val" }];
  if (showHold) bands.push({ from: hold.window.from, to: hold.window.to, label: "Holdout", kind: "hold" });
  const dd = series.map(s => ({ ...s, points: drawdownSeries(s.points), area: true }));
  const cols = [{ label: "Baseline (defaults, dev)", m: r.baseline.metrics }, { label: "Development", m: r.development.metrics }, { label: "Validation", m: r.validation.metrics }, { label: "Walk-forward OOS", m: r.walkForward.oos }];
  if (showHold) cols.push({ label: "Final holdout", m: hold.metrics });
  // Parameter heatmap
  const ps = v.sdl.parameters;
  let heat = "";
  if (ps.length >= 1) {
    const px = q.px || ps[0].key, py = q.py || (ps[1] || ps[0]).key, metric = q.hm || "profitFactor";
    const xs = paramAxis(ps.find(p => p.key === px)), ys = paramAxis(ps.find(p => p.key === py));
    const vals = ys.map(yv => xs.map(xv => { const rows = r.search.rows.filter(row => row.params[px] === xv && row.params[py] === yv && row.m.tradeCount > 0); if (!rows.length) return null; const arr = rows.map(row => row.m[metric]).filter(Number.isFinite); return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }));
    heat = `<div class="card section"><div class="card-head"><h2>Parameter surface (in-sample)</h2><div class="right row"><select data-nav="px">${ps.map(p => `<option ${p.key === px ? "selected" : ""}>${p.key}</option>`).join("")}</select><select data-nav="py">${ps.map(p => `<option ${p.key === py ? "selected" : ""}>${p.key}</option>`).join("")}</select><select data-nav="hm">${[["profitFactor", "Profit factor"], ["netProfit", "Net profit"], ["maxDrawdown", "Max drawdown"], ["tradeCount", "Trades"]].map(([k, l]) => `<option value="${k}" ${k === metric ? "selected" : ""}>${l}</option>`).join("")}</select></div></div>
    ${heatmap({ rows: ys.map(String), cols: xs.map(String), values: vals, mid: metric === "profitFactor" ? 1 : metric === "netProfit" ? 0 : null, fmtv: x => metric === "netProfit" ? fmt(x, 0) : metric === "tradeCount" ? fmt(x, 0) : fmt(x, 2), rowTitle: py, colTitle: px })}
    <p class="small muted" style="margin-top:6px">Mean over other parameters, ${r.search.tried} combinations tried (${r.search.eligible} eligible). Selection rule (predeclared): ${esc(r.search.rule)} — objective ${esc(r.search.objective)}. Selected <code>${esc(JSON.stringify(r.selectedParams))}</code>${r.selectionFellBack ? " (fell back to defaults)" : ""}. Smooth plateaus beat sharp peaks.</p></div>`;
  }
  const seg = q.seg || "validation";
  const tradesSrc = seg === "development" ? r.development.trades : seg === "holdout" && showHold ? hold.trades : r.validation.trades;
  const months = monthlyReturns(r.validation.equity);
  return `<div class="card">${lineChart({ series, bands, title: "Equity by segment (each segment starts at $10,000)", yFmt: x => "$" + fmt(x, 0), desc: "Equity curves for development, validation and holdout segments" })}</div>
    <div class="grid g2 section"><div class="card">${lineChart({ series: dd, bands, title: "Drawdown (%)", yFmt: x => fmt(x, 0) + "%", zero: true, height: 200, half: true })}</div><div class="card">${barChart({ bars: months.map(m => ({ label: String(m.month).slice(2, 4) + "/" + String(m.month).slice(4), value: m.ret, tip: `${String(m.month).slice(0, 4)}-${String(m.month).slice(4)}` })), signed: true, title: "Validation monthly returns (%)", yFmt: x => fmt(x, 1) + "%", half: true })}</div></div>
    <div class="section">${metricRows(cols)}<p class="small muted">Buy-and-hold: development ${pct(r.benchmark.development)}, validation ${pct(r.benchmark.validation)}${showHold ? `, holdout ${pct(hold.benchmark)}` : ""}. Holdout ${showHold ? `evaluated once (${contaminated ? "contaminated for this lineage" : "untouched before evaluation"})` : "is protected until validation"}.</p></div>
    ${heat}
    <div class="grid g2 section"><div class="card"><h2>Walk-forward (${esc(r.walkForward.mode)})</h2><div class="table-wrap"><table class="t"><thead><tr><th>OOS window</th><th>params</th><th class="num">trades</th><th class="num">PF</th><th class="num">net</th><th class="num">DD</th></tr></thead><tbody>${r.walkForward.folds.map(f => `<tr><td class="small">${isoDate(f.from)} → ${isoDate(f.to)}</td><td class="small"><code>${esc(Object.values(f.params).join(", "))}</code>${f.fellBack ? " *" : ""}</td><td class="num">${f.metrics.tradeCount}</td><td class="num">${pf(f.metrics.profitFactor)}</td><td class="num">${money(f.metrics.netProfit)}</td><td class="num">${pct(f.metrics.maxDrawdown)}</td></tr>`).join("")}</tbody></table></div><p class="small muted">${pct(r.walkForward.positiveFoldsPct, 0)} of folds positive; parameters re-selected on each training window with the same rule.</p></div>
      <div class="card"><h2>Smoke test</h2><div class="table-wrap"><table class="t"><tbody>${r.smoke.checks.map(c => `<tr><td>${c.pass ? `<span class="pass">✓</span>` : `<span class="fail">✕</span>`}</td><td>${esc(c.name)}</td><td class="small muted">${esc(c.detail || "")}</td></tr>`).join("")}</tbody></table></div><p class="small muted" style="margin-top:6px">Runner ${esc(r.plan.runner)} · dataset checksum <code>${esc(bt.datasetChecksum.slice(0, 12))}</code> · SDL <code>${esc(bt.sdlHash.slice(0, 12))}</code> · reproducibility hash <code>${esc(r.reproHash.slice(0, 12))}</code></p></div></div>
    <div class="card section"><div class="card-head"><h2>Trades</h2><div class="right chipset">${[["development", "Development"], ["validation", "Validation"], ...(showHold ? [["holdout", "Holdout"]] : [])].map(([k, l]) => `<a class="chip" href="#/version/${v.id}/backtest?seg=${k}" ${seg === k ? 'style="background:var(--accent);color:var(--accent-ink)"' : ""}>${l}</a>`).join("")}<button class="btn small" data-act="downloadTrades" data-id="${v.id}" data-seg="${seg}">CSV</button></div></div>${tradeTable(tradesSrc)}</div>`;
}
function tradeTable(trades, limit = 300) {
  if (!trades.length) return `<p class="muted small">No trades in this segment.</p>`;
  return `<div class="table-wrap" style="max-height:420px;overflow:auto"><table class="t"><thead><tr><th>#</th><th>Dir</th><th>Entry</th><th class="num">Entry px</th><th>Exit</th><th class="num">Exit px</th><th class="num">Qty</th><th class="num">Fees</th><th class="num">Net</th><th class="num">MAE / MFE</th><th>Exit reason</th></tr></thead><tbody>${trades.slice(0, limit).map(t => `<tr><td>${t.id}</td><td>${t.dir}</td><td class="small">${isoMinute(t.entryTime)}</td><td class="num">${fmt(t.entryPrice, 2)}</td><td class="small">${isoMinute(t.exitTime)}</td><td class="num">${fmt(t.exitPrice, 2)}</td><td class="num">${fmt(t.qty, 4)}</td><td class="num">${fmt(t.fees, 2)}</td><td class="num ${t.net >= 0 ? "pass" : "fail"}">${fmt(t.net, 2)}</td><td class="num small">${t.mae !== undefined ? `${fmt(t.mae * 100, 1)}% / ${fmt(t.mfe * 100, 1)}%` : "—"}</td><td class="small">${esc(t.reason || "")}${t.boundary ? " (boundary)" : ""}</td></tr>`).join("")}</tbody></table></div>${trades.length > limit ? `<p class="small muted">Showing ${limit} of ${trades.length}; download CSV for all.</p>` : ""}`;
}

async function tabRobustness(v) {
  if (!v.validationId) return empty("Not validated yet", "The robustness suite runs after the Backtest Engineer recommends validation.", v.status === "BACKTESTED" ? `<button class="btn primary" data-act="sendToValidation" data-id="${v.id}">Send to validation</button>` : "");
  const val = await db.get("validations", v.validationId);
  const rb = val.robustness;
  return `<div class="grid g2"><div class="card"><h2>Robustness tests</h2><div class="table-wrap"><table class="t"><tbody>${rb.tests.map(t => `<tr><td>${t.pass ? `<span class="pass">✓ pass</span>` : `<span class="fail">✕ fail</span>`}</td><td>${esc(t.name)}<div class="small muted">${esc(t.detail || "")}</div></td><td class="num">${t.value === null || t.value === undefined ? "" : fmt(t.value, 1)}</td></tr>`).join("")}</tbody></table></div><p class="small muted" style="margin-top:6px">Region: development + validation with frozen parameters <code>${esc(JSON.stringify(rb.params))}</code>. The holdout is not used for robustness tests.</p></div>
    <div class="stack"><div class="card">${barChart({ bars: rb.segments.map(s => ({ label: isoDate(s.from).slice(2, 7), value: s.net, tip: `${isoDate(s.from)} → ${isoDate(s.to)} · PF ${pf(s.pf)} · ${s.trades} trades` })), signed: true, title: `Calendar segments — net profit (${fmt(rb.positiveSegmentsPct, 0)}% positive)`, yFmt: x => "$" + fmt(x, 0), half: true })}</div>
    <div class="card">${fanChart({ fan: rb.monteCarlo.fan, title: "Monte Carlo: equity paths resampled from trade returns (start = 100)", half: true })}<p class="small muted">Drawdown p50 ${pct(rb.monteCarlo.ddP50)} · p95 ${pct(rb.monteCarlo.ddP95)} · return p10 ${pct(rb.monteCarlo.retP10)} · p90 ${pct(rb.monteCarlo.retP90)}</p></div></div></div>
    <div class="grid g2 section"><div class="card"><h2>Parameter neighbours (validation)</h2><div class="table-wrap"><table class="t"><thead><tr><th>params</th><th class="num">net</th><th class="num">PF</th></tr></thead><tbody>${rb.neighbours.map(n => `<tr><td class="small"><code>${esc(JSON.stringify(n.params))}</code></td><td class="num ${n.net > 0 ? "pass" : "fail"}">${money(n.net)}</td><td class="num">${pf(n.pf)}</td></tr>`).join("") || `<tr><td class="muted">No parameters to perturb</td></tr>`}</tbody></table></div><p class="small muted">${fmt(rb.neighbourSurvival, 0)}% of one-step neighbours survive (PF > 1 and net > 0).</p></div>
      <div class="card"><h2>Sensitivity &amp; direction</h2><dl class="kv"><dt>Base net (dev+val)</dt><dd>${money(rb.baseMetrics.netProfit)}</dd><dt>Commission ×2</dt><dd>${money(rb.sensitivity.commission2x)}</dd><dt>Slippage ×2</dt><dd>${money(rb.sensitivity.slippage2x)}</dd><dt>Entry +1 bar</dt><dd>${money(rb.sensitivity.delay1)}</dd>${rb.sensitivity.adversePath !== undefined ? `<dt>Adverse intrabar path</dt><dd>${money(rb.sensitivity.adversePath)}</dd>` : ""}<dt>10% missed trades</dt><dd>p10 ${money(rb.missedTrades.p10)} · p50 ${money(rb.missedTrades.p50)}</dd><dt>Start-date shifts</dt><dd>${rb.startShifts.map(s => `+${s.shift * 100}%: ${money(s.net)}`).join(" · ")}</dd>${rb.longOnly ? `<dt>Long only</dt><dd>${money(rb.longOnly.netProfit)} · PF ${pf(rb.longOnly.profitFactor)} · ${rb.longOnly.tradeCount} trades</dd>` : ""}${rb.shortOnly ? `<dt>Short only</dt><dd>${money(rb.shortOnly.netProfit)} · PF ${pf(rb.shortOnly.profitFactor)} · ${rb.shortOnly.tradeCount} trades</dd>` : ""}<dt>Buy-and-hold</dt><dd>${pct(rb.benchmark)} vs strategy ${pct(rb.baseMetrics.totalReturn)}</dd></dl></div></div>
    ${val.report ? `<div class="card section"><h2>Validator report ${badge(val.report.recommendation)}</h2><div class="grid g2"><div class="case neg prose small"><b>Strongest rejection case</b>${md(val.report.rejectionCase)}</div><div class="case pos prose small"><b>Positive case</b>${md(val.report.positiveCase)}</div></div>${val.report.risks.length ? `<div class="table-wrap section"><table class="t"><thead><tr><th>Risk</th><th>Severity</th><th>Mitigation</th></tr></thead><tbody>${val.report.risks.map(r => `<tr><td>${esc(r.risk)}</td><td>${badge(r.severity === "high" ? "FAIL" : r.severity === "medium" ? "WARN" : "OK").replace(/FAIL|WARN|OK/, r.severity)}</td><td class="small">${esc(r.mitigation)}</td></tr>`).join("")}</tbody></table></div>` : ""}${val.report.unresolvedQuestions.length ? `<p class="small section"><b>Unresolved:</b> ${esc(val.report.unresolvedQuestions.join("; "))}</p>` : ""}${val.report.proposedChange ? `<p class="small"><b>Proposed change:</b> ${esc(val.report.proposedChange)}</p>` : ""}</div>` : ""}`;
}

async function tabTradingView(v) {
  const ds = await db.get("datasets", v.datasetId);
  const verifs = sortDesc(await db.all("verifications", x => x.versionId === v.id));
  const sdl = v.sdl;
  const exch = ds.source === "csv" ? ds.symbol : (ds.source === "binance" ? "BINANCE" : "COINBASE") + ":" + ds.symbol.replace("-", "");
  return `<div class="grid g2"><div class="card"><h2>Verification steps (spec §13.2)</h2><ol class="prose" style="padding-left:18px;line-height:1.7;margin:0">
    <li>Open TradingView on <code>${esc(exch)}</code>, timeframe <code>${esc(ds.timeframe)}</code>, <b>standard candles</b>, chart timezone <b>UTC</b>.</li>
    <li>Paste the Pine source from the <a href="#/version/${v.id}/source">Pine source</a> tab into the Pine Editor and add it to the chart. Confirm it compiles.</li>
    <li>In the strategy's inputs set the parameters to <code>${esc(JSON.stringify(v.selectedParams || {}))}</code> and the date window to ${isoDate(ds.from)} → ${isoDate(ds.to)}.</li>
    <li>Check properties: commission ${sdl.costs.commissionValue}% · slippage ${sdl.costs.slippageTicks} ticks · order size ${sdl.risk.sizePercent * sdl.risk.leverage}% of equity · pyramiding 0. Use Deep Backtesting over the same range if available.</li>
    <li>Strategy Tester → List of Trades → export CSV, then upload it here.</li></ol>
    <div class="section row"><input type="file" accept=".csv,text/csv" id="tvFile"><button class="btn primary" data-act="uploadTV" data-id="${v.id}">Upload &amp; compute parity</button></div>
    <p class="small muted">Parity tolerance policy ${esc((await import("./tv.js")).PARITY_TOLERANCE.version)}: ≥95% trades matched by direction and entry bar, median price diff ≤ 3 ticks + slippage, ≥90% exits on the same bar.</p></div>
    <div class="stack">${verifs.length ? verifs.map(x => `<div class="card"><div class="card-head"><h3>${esc(x.fileName || "upload")}</h3><span class="right">${badge(x.status)}</span></div><p class="small muted">${isoMinute(x.createdAt)} · TradingView ${x.tvTradeCount} trades · runner ${x.localTradeCount} trades · source ${esc(x.sourceHash || "")}</p>
      ${x.parity.checks ? `<div class="table-wrap"><table class="t"><tbody>${x.parity.checks.map(c => `<tr><td>${c.pass ? `<span class="pass">✓</span>` : `<span class="fail">✕</span>`}</td><td>${esc(c.name)}</td><td class="small">${esc(c.detail)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="fail">${esc(x.parity.reason || "")}</p>`}
      ${x.warnings.length ? `<p class="small muted">${esc(x.warnings.join("; "))}</p>` : ""}
      ${x.status === "FAIL" ? (x.explanation ? `<p class="note small"><b>Explanation:</b> ${esc(x.explanation)}</p>` : `<div class="stack section"><textarea id="exp-${x.id}" placeholder="Explain the discrepancy (e.g. different data history start). An unexplained parity failure is a hard fail."></textarea><button class="btn small" data-act="explainTV" data-id="${x.id}">Save explanation</button></div>`) : ""}
      ${x.parity.unmatchedTv?.length ? `<details><summary class="small">Unmatched TradingView trades (${x.parity.unmatchedTv.length})</summary><pre class="small">${esc(x.parity.unmatchedTv.map(t => `${t.dir} ${isoMinute(t.entryTime)} @ ${t.entryPrice}`).join("\n"))}</pre></details>` : ""}
      ${x.parity.unmatchedLocal?.length ? `<details><summary class="small">Unmatched runner trades (${x.parity.unmatchedLocal.length})</summary><pre class="small">${esc(x.parity.unmatchedLocal.map(t => `${t.dir} ${isoMinute(t.entryTime)} @ ${fmt(t.entryPrice, 2)}`).join("\n"))}</pre></details>` : ""}</div>`).join("") : empty("No verification yet", "Upload a TradingView List of Trades export to compare with the research runner.")}</div></div>`;
}

async function tabForward(v) {
  const deps = sortDesc(await db.all("deployments", d => d.versionId === v.id));
  if (!deps.length) return empty("No forward test", v.status === "PAPER_APPROVED" ? "This version is approved for paper testing." : "A human must approve a paper test in the Committee first.", v.status === "PAPER_APPROVED" ? `<button class="btn primary" data-act="startForward" data-id="${v.id}">Start forward test</button>` : "");
  return (await Promise.all(deps.map(deploymentCard))).join("");
}
async function deploymentCard(d) {
  const s = d.snapshot;
  const acts = ["ACTIVE", "DEGRADED"].includes(d.status) ? `<button class="btn small" data-act="checkDeployment" data-id="${d.id}">Check now</button><button class="btn small" data-act="reviewForward" data-id="${d.id}">Ask operator to review</button><button class="btn small danger" data-act="stopDeployment" data-id="${d.id}" data-confirm="Complete this deployment? A restart is a new deployment.">Complete</button>` : "";
  return `<div class="card section"><div class="card-head"><h2>Deployment ${esc(d.id.slice(0, 8))}</h2><span>${badge(d.status)}</span><div class="right">${acts}</div></div>
    <div class="grid g2"><dl class="kv"><dt>Market</dt><dd>${esc(d.source)}:${esc(d.symbol)} · ${esc(d.timeframe)}</dd><dt>Started</dt><dd>${isoMinute(d.startedAt)} (${timeAgo(d.startedAt)})</dd><dt>Config hash</dt><dd><code>${esc(d.configHash.slice(0, 16))}</code></dd><dt>Fill model</dt><dd>${esc(d.fillModel)}</dd><dt>Last check</dt><dd>${d.lastCheckAt ? timeAgo(d.lastCheckAt) : "never"}${s ? ` · last bar ${isoMinute(s.lastBarTime)}` : ""}</dd><dt>Health</dt><dd>${d.health?.issues?.length ? `<span class="fail">${esc(d.health.issues.join("; "))}</span>` : `<span class="pass">✓ no issues</span>`}</dd></dl>
    <dl class="kv"><dt>Forward trades</dt><dd>${s ? s.trades.length : 0} (expected ≈${s ? fmt(s.drift.expectedTrades, 1) : "—"})</dd><dt>Win rate</dt><dd>${s ? pct(s.drift.winRate) : "—"} vs backtest ${pct(d.expectation.winRate)}${s && Number.isFinite(s.drift.winRateZ) ? ` (z ${fmt(s.drift.winRateZ, 2)})` : ""}</dd><dt>Net return</dt><dd>${s ? pct(s.netReturnPct) : "—"}</dd><dt>Open position</dt><dd>${s?.open ? `${s.open.dir} since ${isoMinute(s.open.entryTime)} @ ${fmt(s.open.entryPrice, 2)}, mark ${fmt(s.open.markPrice, 2)}` : "flat"}</dd><dt>Drift</dt><dd>${s ? (s.drift.flag ? `<span class="fail">✕ drift flagged</span>` : `<span class="pass">✓ within bounds</span>`) : "—"}</dd></dl></div>
    ${s && s.equity.length > 1 ? `<div class="section">${lineChart({ series: [{ name: "Paper equity", points: s.equity, slot: 7 }], bands: [{ from: s.equity[0][0], to: s.equity.at(-1)[0], label: "Forward", kind: "fwd" }], title: "Paper equity (forward only, compounded trade returns)", yFmt: x => "$" + fmt(x, 0), height: 200 })}</div>` : ""}
    ${s ? `<div class="section">${tradeTable(s.trades)}</div>` : `<p class="muted small section">Press "Check now" to evaluate bars that closed since the start. Only bars after the start can create forward trades; nothing is backfilled.</p>`}
    ${d.review ? `<div class="note section small"><b>Forward-Test Operator: ${esc(d.review.health)} → ${esc(d.review.recommendation)}.</b> ${esc(d.review.driftAssessment)}</div>` : ""}</div>`;
}

async function decisionsList(filter) {
  const ds = sortDesc(await db.all("decisions", filter));
  if (!ds.length) return empty("No decisions yet", "Decisions are recorded by the Strategy Judge and the human committee.");
  const vs = Object.fromEntries((await db.all("versions")).map(v => [v.id, v]));
  return `<div class="stack">${ds.map(d => `<div class="card"><div class="card-head">${avatar(d.by?.type === "human" ? "human" : "judge")}<div><h3>${vs[d.versionId] ? vlink(vs[d.versionId]) : "version"} → ${badge(d.decision)}</h3><div class="small muted">${esc(d.by?.type)} · ${isoMinute(d.createdAt)}${d.evidenceGrade ? ` · grade ${d.evidenceGrade} (${fmt(d.evidenceScore, 0)})` : ""}${d.override ? " · human override" : ""}</div></div></div>
    ${d.policyNote ? `<p class="note warn small">${esc(d.policyNote)} (judge said ${esc(d.judgeDecision)})</p>` : ""}${d.memo ? `<div class="prose small">${md(d.memo)}</div>` : ""}
    ${d.positiveCase ? `<div class="grid g2 section"><div class="case pos small"><b>Positive case.</b> ${esc(d.positiveCase)}</div><div class="case neg small"><b>Rejection case.</b> ${esc(d.rejectionCase)}</div></div>` : ""}
    ${d.conditions?.length ? `<p class="small"><b>Conditions:</b> ${esc(d.conditions.join("; "))}</p>` : ""}${d.falsifiers?.length ? `<p class="small"><b>Would be falsified by:</b> ${esc(d.falsifiers.join("; "))}</p>` : ""}${d.requiredNextEvidence?.length ? `<p class="small"><b>Next evidence:</b> ${esc(d.requiredNextEvidence.join("; "))}</p>` : ""}${d.reviewInDays ? `<p class="small muted">Review in ${d.reviewInDays} days. Approval expires if code, parameters, costs, execution, market or data change.</p>` : ""}</div>`).join("")}</div>`;
}
async function tabDecisions(v) {
  const tr = sortDesc(await db.all("transitions", t => t.strategy_version_id === v.id), "created_at");
  return await decisionsList(d => d.versionId === v.id) + `<div class="card section"><h2>State transitions</h2><div class="table-wrap"><table class="t"><thead><tr><th>When</th><th>From → to</th><th>Actor</th><th>Reasons</th><th>Summary</th><th>Policy</th></tr></thead><tbody>${tr.map(t => `<tr><td class="small">${isoMinute(t.created_at)}</td><td>${t.from_state ? badge(t.from_state) + " → " : ""}${badge(t.to_state)}</td><td class="small">${esc(t.actor_type)}:${esc(t.actor_id)}${t.human_override ? ` <span class="badge warn">override</span>` : ""}</td><td class="small">${esc((t.reason_codes || []).join(", "))}</td><td class="small">${esc((t.free_text_summary || "").slice(0, 200))}${t.override_reason ? `<br><i>${esc(t.override_reason)}</i>` : ""}</td><td class="small">${esc(t.policy_version || "")}</td></tr>`).join("")}</tbody></table></div></div>`;
}
async function tabLineage(v) {
  const all = (await db.all("versions", x => x.strategyId === v.strategyId)).sort((a, b) => a.versionNumber - b.versionNumber);
  const handoffs = sortDesc(await db.all("handoffs", h => h.strategyVersionId === v.id));
  return `<div class="grid g2"><div class="card"><h2>Version lineage</h2><div class="lineage">${all.map(x => `<a class="node ${x.id === v.id ? "cur" : ""}" href="#/version/${x.id}"><b>v${x.versionNumber}</b> ${badge(x.status)} ${grade(x.evidenceGrade)}<span class="small muted">${x.parentVersionId ? `from v${all.find(p => p.id === x.parentVersionId)?.versionNumber} · ${esc(x.changeCategory)}: ${esc((x.changeReason || "").slice(0, 80))}` : "initial"}</span></a>`).join("")}</div>
    <p class="small muted" style="margin-top:10px">Contaminated datasets for this version: ${v.contaminatedDatasetIds?.length ? v.contaminatedDatasetIds.map(d => `<code>${esc(d.slice(0, 8))}</code>`).join(", ") + " — the parent's holdout result motivated this version, so the holdout no longer counts as evidence here." : "none"}</p></div>
    <div class="card"><h2>Agent handoffs</h2>${handoffs.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>From → to</th><th>Action</th><th>Accepted</th><th>When</th></tr></thead><tbody>${handoffs.map(h => `<tr><td class="small">${esc(h.fromAgent.role)} → ${esc(h.toRole)}</td><td class="small">${esc(h.requestedAction)}<div class="faint">${esc(h.summary.slice(0, 140))}</div></td><td>${h.accepted ? `<span class="pass">✓</span>` : `<span class="fail" title="${esc(h.problems.join("; "))}">✕ ${esc(h.problems.join("; "))}</span>`}</td><td class="small">${timeAgo(h.createdAt)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">No handoffs recorded.</p>`}</div></div>`;
}
async function tabRuns(v) {
  const strategy = await db.get("strategies", v.strategyId);
  const taskIds = new Set((await db.all("tasks", t => t.refs?.versionId === v.id || (v.versionNumber === 1 && strategy?.ideaId && t.refs?.ideaId === strategy.ideaId))).map(t => t.id));
  const runs = sortDesc(await db.all("agentRuns", r => taskIds.has(r.taskId)), "startedAt");
  return runsTable(runs);
}
function runsTable(runs) {
  if (!runs.length) return empty("No agent runs", "");
  return `<div class="table-wrap"><table class="t"><thead><tr><th>Agent</th><th>Status</th><th>Model</th><th>Prompt</th><th class="num">Attempts</th><th class="num">Tokens in/out</th><th class="num">Cost</th><th class="num">Duration</th><th>When</th></tr></thead><tbody>${runs.map(r => `<tr class="click" data-href="#/run/${r.id}"><td>${avatar(r.agentId, true)} ${esc(agentById[r.agentId]?.role || r.agentId)}${r.practice ? ` <span class="badge">practice</span>` : ""}</td><td>${badge(r.status)}${r.validationErrors?.length ? ` <span class="small warn">${r.validationErrors.length} contract errors</span>` : ""}</td><td class="small">${esc(r.model)}${r.effort ? " · " + esc(r.effort) : ""}</td><td class="small">v${r.promptVersion}</td><td class="num">${r.attempts}</td><td class="num">${fmt(r.usage?.input_tokens, 0)} / ${fmt(r.usage?.output_tokens, 0)}</td><td class="num">$${(r.cost || 0).toFixed(3)}</td><td class="num">${r.durationMs ? fmt(r.durationMs / 1000, 1) + "s" : "—"}</td><td class="small">${timeAgo(r.startedAt)}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ======================= Backtest Lab ======================= */
async function viewLab() {
  const datasets = sortDesc(await db.all("datasets", d => d.status !== "QUARANTINED"));
  const draft = (await db.setting("labDraft")) || JSON.stringify(SDL_TEMPLATE, null, 2);
  const left = `<div class="card"><h2>Strategy Definition (SDL)</h2><p class="small muted">Write or paste an SDL document. It is validated against the same grammar agents use, then registered as an immutable version and run through the full backtest plan. Every run is recorded; nothing is a throwaway.</p>
    <textarea class="code" id="labSdl" spellcheck="false">${esc(draft)}</textarea>
    <div class="row section"><button class="btn" data-act="labValidate">Validate</button><button class="btn" data-act="labTemplate">Reset to template</button><span style="flex:1"></span>
    <select id="labDataset">${datasets.map(d => `<option value="${d.id}">${esc(d.symbol)} ${esc(d.timeframe)} · ${d.bars} bars · ${isoDate(d.from)}→${isoDate(d.to)}</option>`).join("")}</select>
    <button class="btn primary" data-act="labRun" ${datasets.length ? "" : "disabled"}>Register &amp; run backtest plan</button></div>
    ${datasets.length ? "" : `<p class="note warn small section">Load a dataset in <a href="#/data">Data Health</a> first.</p>`}<div id="labOut" class="section"></div></div>`;
  const { SDL_GRAMMAR_DOC } = await import("./agents.js");
  const right = `<div class="card"><h2>Grammar</h2><pre style="white-space:pre-wrap;max-height:none">${esc(SDL_GRAMMAR_DOC)}</pre></div>`;
  return page(header("Backtest Lab", "Hand-write a strategy definition and run it through the same predeclared plan as the agents: smoke → baseline → in-sample search → validation → walk-forward."), `<div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)">${left}${right}</div>`);
}

/* ======================= Validation Lab ======================= */
async function viewValidation() {
  const vs = sortDesc(await db.all("versions", v => v.validationId), "updatedAt");
  if (!vs.length) return page(header("Validation Lab", "Adversarial validation results across strategies."), empty("Nothing validated yet", "Versions appear here after the robustness suite and one-time holdout run."));
  const vals = Object.fromEntries((await db.all("validations")).map(x => [x.id, x]));
  return page(header("Validation Lab", "Adversarial validation results: evidence grade, hard fails, the validator's recommendation and the judge's decision."),
    `<div class="table-wrap"><table class="t"><thead><tr><th>Strategy</th><th>State</th><th>Grade</th><th class="num">Score</th><th>Hard fails</th><th>Validator</th><th class="num">Holdout PF</th><th class="num">Neighbour survival</th><th class="num">Positive segments</th><th>Strongest rejection case</th></tr></thead><tbody>${vs.map(v => { const x = vals[v.validationId]; if (!x) return ""; const ev = x.evidence || {}; return `<tr class="click" data-href="#/version/${v.id}/robustness"><td>${vlink(v)}</td><td>${badge(v.status)}</td><td>${grade(ev.grade)}</td><td class="num">${fmt(ev.score, 0)}</td><td class="small ${ev.hardFails?.length ? "fail" : ""}">${ev.hardFails?.length ? esc(ev.hardFails.join("; ")) : "none"}</td><td>${x.report ? badge(x.report.recommendation) : "—"}</td><td class="num">${v.contaminatedDatasetIds?.includes(v.datasetId) ? "excluded" : pf(x.holdout.metrics.profitFactor)}</td><td class="num">${pct(x.robustness.neighbourSurvival, 0)}</td><td class="num">${pct(x.robustness.positiveSegmentsPct, 0)}</td><td class="small">${esc((x.report?.rejectionCase || "").slice(0, 160))}</td></tr>`; }).join("")}</tbody></table></div>`);
}

/* ======================= Forward Tests ======================= */
async function viewForward() {
  const deps = sortDesc(await db.all("deployments"));
  if (!deps.length) return page(header("Forward Tests", "Paper forward tests on live bars."), empty("No deployments", "A human approves a paper test in the Committee, then you start it from the strategy page."));
  const vs = Object.fromEntries((await db.all("versions")).map(v => [v.id, v]));
  const cards = await Promise.all(deps.map(async d => `<div class="crumbs section">${vs[d.versionId] ? vlink(vs[d.versionId]) : ""}</div>${await deploymentCard(d)}`));
  return page(header("Forward Tests", "Paper trading on bars that close after each deployment starts. Checks run every 15 minutes while this page is open, or on demand.", `<button class="btn" data-act="checkAllDeployments">Check all now</button>`), cards.join(""));
}
export async function autoCheckDeployments() {
  for (const d of await db.all("deployments", d => ["ACTIVE", "DEGRADED"].includes(d.status))) { try { await L.checkDeployment(d.id); } catch (_) {} }
}

/* ======================= Committee ======================= */
async function viewCommittee() {
  const vs = await db.all("versions");
  const tasks = await db.all("tasks", t => t.status === "WAITING_HUMAN");
  const pending = vs.filter(v => v.status === "PAPER_PENDING_HUMAN");
  const approved = vs.filter(v => v.status === "RESEARCH_APPROVED");
  const forward = vs.filter(v => v.status === "FORWARD_TESTING");
  const judge = vs.filter(v => ["IN_COMMITTEE", "VALIDATED"].includes(v.status));
  const card = async (v, actions) => {
    const val = v.validationId ? await db.get("validations", v.validationId) : null;
    const dec = v.lastDecisionId ? await db.get("decisions", v.lastDecisionId) : null;
    const c = v.campaignId ? await db.get("campaigns", v.campaignId) : null;
    const ev = evaluateEvidence(await L.gatherEvidence(v), c?.policy || "discovery");
    const missing = ev.gates.filter(g => g.pass === null).map(g => g.name);
    return `<div class="card"><div class="card-head"><h3>${vlink(v)}</h3><span>${badge(v.status)} ${grade(ev.grade)} <span class="small muted">${fmt(ev.score, 0)}/100</span></span><div class="right">${actions}</div></div>
      <div class="grid g2"><div class="case pos small"><b>Strongest positive case.</b> ${esc(dec?.positiveCase || val?.report?.positiveCase || "—")}</div><div class="case neg small"><b>Strongest rejection case.</b> ${esc(dec?.rejectionCase || val?.report?.rejectionCase || "—")}</div></div>
      <dl class="kv section"><dt>Validator</dt><dd>${val?.report ? badge(val.report.recommendation) : "—"}</dd><dt>Judge</dt><dd>${dec ? badge(dec.decision) + " " + esc((dec.memo || "").slice(0, 200)) : "—"}</dd><dt>Hard fails</dt><dd class="${ev.hardFails.length ? "fail" : ""}">${ev.hardFails.length ? esc(ev.hardFails.join("; ")) : "none"}</dd><dt>Missing evidence</dt><dd>${missing.length ? esc(missing.join("; ")) : "none"}</dd><dt>Conditions</dt><dd>${esc((dec?.conditions || []).join("; ") || "—")}</dd><dt>Expires when</dt><dd>Code, parameters, costs, execution, market or data change</dd></dl></div>`;
  };
  const sec = async (title, sub, list, act) => `<div class="section"><h2>${title} <span class="muted small">(${list.length})</span></h2><p class="small muted">${sub}</p><div class="stack">${list.length ? (await Promise.all(list.map(v => card(v, act(v))))).join("") : `<p class="muted small">None.</p>`}</div></div>`;
  let html = "";
  if (tasks.length) html += `<div class="section"><h2>Tasks waiting for you <span class="muted small">(${tasks.length})</span></h2><div class="table-wrap"><table class="t"><tbody>${tasks.map(t => `<tr><td>${avatar(t.lane, true)} ${esc(t.title)}</td><td class="small">${esc(t.error?.message || "Human approval required")}</td><td>${t.campaignId ? `<a href="#/campaign/${t.campaignId}/tasks">campaign</a>` : ""}</td><td><button class="btn small primary" data-act="retryTask" data-id="${t.id}">Approve &amp; run</button> <button class="btn small" data-act="cancelTask" data-id="${t.id}">Dismiss</button></td></tr>`).join("")}</tbody></table></div></div>`;
  html += await sec("Paper-test approvals", "The Strategy Judge recommends a paper forward test. Only a human can approve it (spec §25).", pending, v => `<button class="btn small primary" data-act="approvePaper" data-id="${v.id}">Approve paper test…</button><button class="btn small danger" data-act="humanDecision" data-id="${v.id}" data-to="REJECTED">Reject…</button>`);
  html += await sec("Research-approved", "Historical evidence is sufficient for continued research. You may still approve a paper test.", approved, v => `<button class="btn small" data-act="approvePaper" data-id="${v.id}">Approve paper test…</button>`);
  html += await sec("Forward testing", "Eligible for live-candidate review once forward-test requirements are met. LIVE_APPROVED is granted outside ARF-OS.", forward, v => `<button class="btn small" data-act="markLive" data-id="${v.id}">Mark live candidate…</button>`);
  html += await sec("Awaiting the Strategy Judge", "Evidence packs complete; the judge is deciding.", judge, () => "");
  return page(header("Committee", "Decisions are made from evidence, including failures and dissent — not persuasive prose."), html);
}

/* ======================= Agents ======================= */
async function viewAgents() {
  const runs = await db.all("agentRuns");
  const cfg = (await db.setting("agentModels")) || {};
  const cards = await Promise.all(AGENTS.map(async a => {
    const rs = runs.filter(r => r.agentId === a.id && !r.practice);
    const ok = rs.filter(r => r.status === "SUCCEEDED").length;
    const schemaFails = rs.filter(r => r.validationErrors?.length).length;
    const cost = rs.reduce((s, r) => s + (r.cost || 0), 0);
    const lat = rs.filter(r => r.durationMs).map(r => r.durationMs);
    const champ = await championPrompt(a.id);
    const practice = sortDesc(await db.all("practiceRuns", p => p.agentId === a.id && p.promptId === champ.id))[0];
    const model = cfg[a.id]?.model || a.model, effort = cfg[a.id]?.effort || a.effort;
    return `<div class="card agent-card"><div class="top">${avatar(a.id)}<div><div class="nm">${esc(a.name)} <span class="muted small">"${esc(a.alias)}"</span></div><div class="rl">${esc(a.role)} · prompt v${champ.version}</div></div></div>
      <p class="small">${esc(a.mission)}</p>
      <div class="mini-stats"><div>Runs<b>${rs.length}</b></div><div>Success<b>${rs.length ? Math.round((ok / rs.length) * 100) + "%" : "—"}</b></div><div>Contract fails<b>${schemaFails}</b></div><div>Cost<b>$${cost.toFixed(2)}</b></div><div>Median time<b>${lat.length ? fmt(lat.sort((x, y) => x - y)[lat.length >> 1] / 1000, 0) + "s" : "—"}</b></div><div>Practice<b>${practice ? Math.round(practice.score * 100) + "%" : "—"}</b></div></div>
      <div class="row"><select data-act-change="agentModel" data-id="${a.id}" aria-label="Model">${Object.entries(MODELS).map(([k, m]) => `<option value="${k}" ${k === model ? "selected" : ""}>${m.name}</option>`).join("")}</select><select data-act-change="agentEffort" data-id="${a.id}" aria-label="Effort" ${MODELS[model]?.effort ? "" : "disabled"}>${["low", "medium", "high", "xhigh", "max"].map(e => `<option ${e === effort ? "selected" : ""}>${e}</option>`).join("")}</select></div></div>`;
  }));
  const recent = sortDesc(runs, "startedAt").slice(0, 40);
  return page(header("Agents", "Eleven independent lanes. Each has a role prompt, a typed output contract, a model and an effort level."), `<div class="grid gauto">${cards.join("")}</div><div class="section"><h2>Recent agent runs</h2>${runsTable(recent)}</div>`);
}
async function viewRun([id]) {
  const r = await db.get("agentRuns", id);
  if (!r) return page(header("Run not found"), "");
  const a = agentById[r.agentId];
  return page(header(`${esc(a?.role || r.agentId)} run`, `${badge(r.status)} ${esc(r.model)} · effort ${esc(r.effort)} · prompt v${r.promptVersion} · ${isoMinute(r.startedAt)}`, "", `<a href="#/agents">Agents</a>`),
    `<div class="grid g2"><div class="card"><h2>Input (sanitised)</h2><pre style="white-space:pre-wrap">${esc(r.inputPreview || "")}</pre></div>
    <div class="stack"><div class="card"><dl class="kv"><dt>Attempts</dt><dd>${r.attempts}</dd><dt>Structured output</dt><dd>${r.structured ? "JSON schema enforced by API" : "Parsed and validated client-side"}</dd><dt>Tokens</dt><dd>${fmt(r.usage?.input_tokens, 0)} in / ${fmt(r.usage?.output_tokens, 0)} out${r.usage?.estimated ? " (estimated)" : ""}</dd><dt>Cost</dt><dd>$${(r.cost || 0).toFixed(4)}</dd><dt>Duration</dt><dd>${r.durationMs ? fmt(r.durationMs / 1000, 1) + "s" : "—"}</dd><dt>Served by</dt><dd>${esc(r.servedModel || r.model)}</dd>${r.error ? `<dt>Error</dt><dd class="fail">${esc(r.error.code)}: ${esc(r.error.message)}</dd>` : ""}</dl></div>
    ${r.validationErrors?.length ? `<div class="note warn small"><b>Contract errors</b><ul style="margin:4px 0 0;padding-left:18px">${r.validationErrors.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
    <div class="card"><h2>Output</h2><pre style="white-space:pre-wrap">${esc(r.output ? JSON.stringify(r.output, null, 2) : r.rawOutput || "")}</pre></div></div></div>
    <p class="small muted section">ARF-OS shows inputs, structured outputs and validation results. Secrets are never stored in runs.</p>`);
}

/* ======================= Practice Arena ======================= */
async function viewPractice() {
  const runs = await db.all("practiceRuns");
  for (const a of AGENTS) await championPrompt(a.id);
  const allPrompts = await db.all("prompts");
  const suiteRows = await Promise.all(Object.entries(SUITES).map(async ([sid, s]) => {
    const champ = await championPrompt(s.agent);
    const last = sortDesc(runs.filter(r => r.suiteId === sid && r.promptId === champ.id))[0];
    const ch = allPrompts.filter(p => p.agentId === s.agent && p.status === "challenger");
    return `<tr><td>${avatar(s.agent, true)} ${esc(s.name)}<div class="small muted">${s.items.length} tasks · ${s.visible ? "visible" : "hidden labels"}</div></td><td class="num">${last ? Math.round(last.score * 100) + "%" : "—"}</td><td class="small">${last ? timeAgo(last.createdAt) : ""}</td><td><button class="btn small" data-act="runPractice" data-suite="${sid}">Run champion v${champ.version}</button> ${ch.map(p => `<button class="btn small" data-act="runPractice" data-suite="${sid}" data-prompt="${p.id}">Run challenger v${p.version}</button>`).join(" ")}</td></tr>`;
  }));
  const byAgent = AGENTS.map(a => {
    const ps = allPrompts.filter(p => p.agentId === a.id).sort((x, y) => y.version - x.version);
    return `<tr><td>${avatar(a.id, true)} ${esc(a.role)}</td><td>${ps.map(p => `<span class="row" style="gap:4px;margin:2px 0">${badge(p.status)} v${p.version}${p.status === "challenger" ? ` <button class="btn small" data-act="promoteCheck" data-id="${p.id}">Compare &amp; promote…</button>` : ""}${p.status === "retired" ? ` <button class="btn small" data-act="rollbackPrompt" data-id="${p.id}">Roll back to this</button>` : ""}</span>`).join("")}</td><td><button class="btn small" data-act="newChallenger" data-agent="${a.id}">New challenger…</button></td></tr>`;
  }).join("");
  const recent = sortDesc(runs).slice(0, 20);
  return page(header("Practice Arena", "Agents improve on blind benchmark tasks, never on production work. Prompt changes are challengers until a human promotes them."),
    `<div class="note small">Practice uses synthetic data and fixed fixtures only. It never sees production datasets or holdouts, and its cost is not charged to campaigns. Scores are computed deterministically (hidden labels, SDL validity and trade overlap, Pine QA).</div>
    <div class="section"><h2>Benchmark suites</h2><div class="table-wrap"><table class="t"><thead><tr><th>Suite</th><th class="num">Champion score</th><th>Last run</th><th>Run</th></tr></thead><tbody>${suiteRows.join("")}</tbody></table></div></div>
    <div class="section"><h2>Prompt versions</h2><div class="table-wrap"><table class="t"><thead><tr><th>Agent</th><th>Versions</th><th></th></tr></thead><tbody>${byAgent}</tbody></table></div></div>
    <div class="section"><h2>Recent practice runs</h2>${recent.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Suite</th><th>Prompt</th><th class="num">Score</th><th>Items</th><th class="num">Cost</th><th>When</th></tr></thead><tbody>${recent.map(r => `<tr><td>${esc(SUITES[r.suiteId]?.name || r.suiteId)}</td><td>v${r.promptVersion} ${badge(r.promptStatus)}</td><td class="num">${Math.round(r.score * 100)}%</td><td class="small">${r.items.map(i => `${esc(i.id)}: ${Math.round(i.score * 100)}% <span class="faint">${esc(i.detail)}</span>`).join("<br>")}</td><td class="num">$${r.cost.toFixed(3)}</td><td class="small">${timeAgo(r.createdAt)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">No practice runs yet.</p>`}</div>`);
}

/* ======================= Data Health ======================= */
async function viewData([id]) {
  if (id) return viewDataset(id);
  const ds = sortDesc(await db.all("datasets"));
  const vs = await db.all("versions");
  return page(header("Data Health", IN_ARTIFACT ? "Dataset versions, integrity checks and the strategies that depend on them. Upload price history exported from TradingView." : "Dataset versions, integrity checks and the strategies that depend on them.", `<button class="btn primary" data-act="loadDataset">Load dataset…</button>`),
    ds.length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Dataset</th><th>Status</th><th class="num">Bars</th><th>Range</th><th class="num">Missing</th><th class="num">Duplicates</th><th class="num">Bad OHLC</th><th>Checksum</th><th class="num">Versions</th><th>Review</th></tr></thead><tbody>${ds.map(d => `<tr class="click" data-href="#/data/${d.id}"><td><a href="#/data/${d.id}">${esc(d.source)}:${esc(d.symbol)} ${esc(d.timeframe)}</a><div class="small muted">tick ${d.tickSize}${d.note ? " · " + esc(d.note) : ""}</div></td><td>${badge(d.status)}</td><td class="num">${fmt(d.bars, 0)}</td><td class="small">${isoDate(d.from)} → ${isoDate(d.to)}</td><td class="num">${d.integrity.missing} (${fmt(d.integrity.missingPct, 2)}%)</td><td class="num">${d.integrity.duplicates}</td><td class="num">${d.integrity.badOhlc}</td><td><code>${esc(d.checksum.slice(0, 10))}</code></td><td class="num">${vs.filter(v => v.datasetId === d.id).length}</td><td>${d.review ? badge(d.review.verdict) : "—"}</td></tr>`).join("")}</tbody></table></div>` : empty("No datasets", "Datasets load automatically when a campaign starts, or load one here.", `<button class="btn primary" data-act="loadDataset">Load dataset…</button>`));
}
async function viewDataset(id) {
  const d = await db.get("datasets", id);
  if (!d) return page(header("Dataset not found"), "");
  const bars = await db.get("bars", id);
  const vs = await db.all("versions", v => v.datasetId === id);
  const segs = buildSegments(bars.t.length, { segments: { embargoBars: 10 } });
  const pts = bars.t.map((t, i) => [t, bars.c[i]]);
  return page(header(`${esc(d.source)}:${esc(d.symbol)} ${esc(d.timeframe)}`, `${badge(d.status)} ${fmt(d.bars, 0)} bars · checksum <code>${esc(d.checksum.slice(0, 16))}</code>`, "", `<a href="#/data">Data Health</a>`),
    `<div class="card">${lineChart({ series: [{ name: "Close", points: pts, slot: 1 }], bands: [{ from: bars.t[0], to: bars.t[segs.development.end - 1], label: "Development 60%", kind: "dev" }, { from: bars.t[segs.validation.start], to: bars.t[segs.validation.end - 1], label: "Validation 20%", kind: "val" }, { from: bars.t[segs.holdout.start], to: bars.t.at(-1), label: "Holdout 20% (protected)", kind: "hold" }], title: "Close price with the default segment split", yFmt: x => fmt(x, x < 10 ? 4 : 0) })}</div>
    <div class="grid g2 section"><div class="card"><h2>Integrity report</h2><dl class="kv"><dt>Range</dt><dd>${isoMinute(d.from)} → ${isoMinute(d.to)}</dd><dt>Missing bars</dt><dd>${d.integrity.missing} in ${d.integrity.gaps} gaps (${fmt(d.integrity.missingPct, 2)}%), largest ${d.integrity.largestGapBars}</dd><dt>Duplicates</dt><dd>${d.integrity.duplicates}</dd><dt>Out of order</dt><dd>${d.integrity.outOfOrder}</dd><dt>Impossible OHLC</dt><dd>${d.integrity.badOhlc}</dd><dt>Zero volume</dt><dd>${d.integrity.zeroVolume}</dd><dt>Tick size</dt><dd>${d.tickSize}</dd></dl>
      ${d.integrity.errors.length ? `<div class="note bad small section">${esc(d.integrity.errors.join("; "))}</div>` : ""}${d.integrity.warnings.length ? `<div class="note warn small section">${esc(d.integrity.warnings.join("; "))}</div>` : ""}</div>
      <div class="card"><h2>Data Integrity Analyst</h2>${d.review ? `<p>${badge(d.review.verdict)} ${esc(d.review.assessment)}</p>${d.review.issues.length ? `<ul>${d.review.issues.map(i => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}${d.review.recommendations.length ? `<p class="small muted">${esc(d.review.recommendations.join("; "))}</p>` : ""}` : `<p class="muted small">Not reviewed yet.</p>`}
      <h3 class="section">Impacted versions</h3>${vs.length ? vs.map(v => `<div>${vlink(v)} ${badge(v.status)}</div>`).join("") : `<p class="muted small">None.</p>`}</div></div>`);
}

/* ======================= Portfolio ======================= */
async function viewPortfolio() {
  const pd = await L.portfolioData();
  const reviews = sortDesc(await db.all("artefacts", a => a.kind === "PortfolioReview"));
  const latest = reviews[0]?.data;
  return page(header("Portfolio Research", "Approved strategies evaluated together: correlation of daily returns, redundancy and concentration. Portfolio benefits cannot rescue a rejected strategy.", `<button class="btn primary" data-act="portfolioReview" ${pd.strategies.length >= 2 ? "" : "disabled"}>Ask the Portfolio Researcher</button>`),
    pd.strategies.length ? `<div class="card">${heatmap({ rows: pd.strategies.map(s => s.label), cols: pd.strategies.map((_, i) => String(i + 1)), values: pd.corr, mid: 0, fmtv: x => fmt(x, 2), title: "Correlation of daily returns (dev + validation)" })}<p class="small muted">Columns follow row order. Cells need ≥ 30 overlapping days.</p></div>
    <div class="table-wrap section"><table class="t"><thead><tr><th>#</th><th>Strategy</th><th>Market</th><th>Family</th><th>Directions</th><th>Grade</th></tr></thead><tbody>${pd.strategies.map((s, i) => `<tr class="click" data-href="#/version/${s.versionId}"><td>${i + 1}</td><td>${esc(s.label)}</td><td>${esc(s.symbol)} ${esc(s.timeframe)}</td><td>${esc(s.family)}</td><td>${esc(s.directions.join("/"))}</td><td>${grade(s.grade)}</td></tr>`).join("")}</tbody></table></div>
    ${latest ? `<div class="card section"><h2>Latest review</h2><p>${esc(latest.summary)}</p><div class="grid g2"><div><h3>Redundant pairs</h3><ul>${latest.redundantPairs.map(p => `<li>${esc(p.a)} ↔ ${esc(p.b)}: ${esc(p.reason)}</li>`).join("") || "<li>none</li>"}</ul><h3>Concentration risks</h3><ul>${latest.concentrationRisks.map(x => `<li>${esc(x)}</li>`).join("") || "<li>none</li>"}</ul></div><div><h3>Research risk budget (proposal)</h3><div class="table-wrap"><table class="t"><tbody>${latest.riskBudget.map(r => `<tr><td>${esc(r.strategy)}</td><td class="num">${fmt(r.weightPct, 0)}%</td><td class="small">${esc(r.rationale)}</td></tr>`).join("")}</tbody></table></div></div></div></div>` : ""}` : empty("No approved strategies yet", "Strategies appear here once the Strategy Judge research-approves them."));
}

/* ======================= Audit ======================= */
async function auditTable(filter, limit = 400) {
  const rows = sortDesc(await db.all("audit", filter), "at").slice(0, limit);
  if (!rows.length) return empty("No audit events", "");
  return `<div class="table-wrap"><table class="t"><thead><tr><th>When</th><th>Event</th><th>Actor</th><th>Details</th></tr></thead><tbody>${rows.map(a => `<tr><td class="small">${isoMinute(a.at)}</td><td><code>${esc(a.type)}</code></td><td class="small">${esc(a.actor?.type)}:${esc(a.actor?.id)}</td><td class="small mono" style="white-space:pre-wrap;word-break:break-word">${esc(JSON.stringify(a.data).slice(0, 300))}</td></tr>`).join("")}</tbody></table></div>`;
}
async function viewAudit(_, q) {
  const types = [...new Set((await db.all("audit")).map(a => a.type.split(".")[0]))].sort();
  const f = q.type || "";
  return page(header("Audit Log", "Append-only record of authentication-free local actions: transitions, protected-data access, uploads, overrides and prompt promotions.", `<button class="btn" data-act="exportAudit">Export JSON</button>`),
    `<div class="filters"><a class="chip" href="#/audit">all</a>${types.map(t => `<a class="chip" href="#/audit?type=${t}" ${f === t ? 'style="background:var(--accent);color:var(--accent-ink)"' : ""}>${esc(t)}</a>`).join("")}</div>` + await auditTable(a => !f || a.type.startsWith(f + ".")));
}

/* ======================= Admin ======================= */
async function viewAdmin() {
  const key = await db.setting("apikey");
  const { transport } = await import("./model.js");
  const conc = (await db.setting("concurrency")) || 2;
  const persistent = await db.persistent();
  const pol = Object.values(POLICIES);
  const keys = ["minTrades", "minTradesHard", "oosProfitFactor", "maxDrawdown", "positiveSegmentsPct", "maxTopTradeShare", "neighbourSurvivalPct", "requireTradingViewParity", "requireForward", "forwardMinTrades", "forwardMinDays", "gridCap", "wfFolds"];
  return page(header("Policies & Admin", "Model access, queue settings, gate policies and workspace data."),
    `<div class="grid g2"><div class="card"><h2>Model access</h2>${transport() === "claude" ? `<p class="note good small">Running inside Claude: agents use your Claude plan. No key needed.</p>` : IN_ARTIFACT ? `<p class="note warn small">Claude access is off for this page. Allow it from the artifact's permissions menu, then reload, to let the agents run.</p>` : `
      <p class="small muted">Agents call the Anthropic Messages API directly from this browser. The key is stored only in this browser's IndexedDB and is excluded from workspace exports. Use a key with a spend limit.</p>
      <div class="row"><input type="password" id="apiKey" placeholder="sk-ant-…" value="${key ? "••••••••••••" : ""}" autocomplete="off"><button class="btn primary" data-act="saveKey">Save</button>${key ? `<button class="btn danger" data-act="clearKey">Remove</button>` : ""}</div>`}
      <dl class="kv section"><dt>Default model</dt><dd>${transport() === "claude" ? "Your Claude plan picks the model; each agent's setting maps to a quick, default or complex tier" : `Claude Opus 5.5 for every lane (change per agent on the <a href="#/agents">Agents</a> page)`}</dd><dt>Refusal fallback</dt><dd>Server-side <code>fallbacks: "default"</code> on Opus/Sonnet</dd><dt>Output contracts</dt><dd>JSON Schema via <code>output_config.format</code>, validated again client-side</dd></dl></div>
    <div class="card"><h2>Job queue</h2><label class="field">Concurrent tasks<input type="number" id="concurrency" min="1" max="6" value="${conc}"></label><div class="row section"><button class="btn" data-act="saveConcurrency">Save</button></div><p class="small muted">Research runner jobs execute in a Web Worker. Storage: ${persistent ? "IndexedDB (persistent in this browser)" : "<span class='fail'>memory only</span>"}.</p></div></div>
    <div class="card section"><h2>Gate policies</h2><p class="small muted">Policies are versioned and chosen per campaign. Thresholds are starting points, not promises of profitability (spec §12.6).</p><div class="table-wrap"><table class="t"><thead><tr><th>Threshold</th>${pol.map(p => `<th class="num">${esc(p.name)} <span class="faint">v${p.version}</span></th>`).join("")}</tr></thead><tbody>${keys.map(k => `<tr><td><code>${k}</code></td>${pol.map(p => `<td class="num">${esc(String(p[k]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
    <div class="grid g2 section"><div class="card"><h2>Workspace</h2><p class="small muted">Everything lives in this browser${IN_ARTIFACT ? ", in this artifact's own storage. Clearing site data or using another device starts empty, so export regularly" : ""}. Export to back up or move to another machine (the API key is never exported).</p><div class="row"><button class="btn" data-act="exportWorkspace">Export workspace</button><label class="btn">Import…<input type="file" accept=".json" id="importFile" hidden data-act-change="importWorkspace"></label><button class="btn danger" data-act="resetWorkspace">Reset workspace…</button></div></div>
    <div class="card"><h2>Boundaries</h2><ul class="small" style="margin:0;padding-left:18px"><li>No live orders, no exchange keys, no capital movement.</li><li>No agent can grant LIVE_APPROVED; that happens in a human-authorised process outside ARF-OS.</li><li>Paper tests need human approval.</li><li>This is a research tool, not a fund, adviser or broker.</li></ul></div></div>`);
}

/* ======================= Routes ======================= */
export const routes = {
  "": { render: viewCommand }, campaigns: { render: viewCampaigns }, campaign: { render: viewCampaign }, inbox: { render: viewInbox }, library: { render: viewLibrary },
  version: { render: viewVersion, live: true }, lab: { render: viewLab, live: false }, validation: { render: viewValidation }, forward: { render: viewForward }, committee: { render: viewCommittee },
  agents: { render: viewAgents }, run: { render: viewRun }, practice: { render: viewPractice }, data: { render: viewData }, portfolio: { render: viewPortfolio }, audit: { render: viewAudit }, admin: { render: viewAdmin, live: false },
  "404": { render: async () => page(header("Not found"), `<p><a href="#/">Back to the Command Centre</a></p>`) }
};

/* Navigation selects/inputs (data-nav) update the query string. */
document.addEventListener("change", e => {
  const el = e.target.closest("[data-nav]");
  if (el) {
    const [path, qs] = location.hash.split("?");
    const p = new URLSearchParams(qs || ""); el.value ? p.set(el.dataset.nav, el.value) : p.delete(el.dataset.nav);
    location.hash = path + "?" + p.toString();
    return;
  }
  const ch = e.target.closest("[data-act-change]");
  if (ch && actions[ch.dataset.actChange]) actions[ch.dataset.actChange](ch, ch.dataset).catch(err => toast(err.message, "bad"));
});
document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input[data-nav]")) e.target.dispatchEvent(new Event("change", { bubbles: true })); });

/* ======================= Actions ======================= */
const HUMAN_STATES = ["REJECTED", "ARCHIVED", "RESEARCH_APPROVED", "PAPER_APPROVED", "REWORK_REQUESTED", "LIVE_CANDIDATE"];
export const actions = {
  closeModal: (el, d, ui) => ui.closeModal(),
  newCampaign: async (el, d, ui) => {
    ui.openModal(await campaignForm(), m => {
      const src = m.querySelector("#cfSource"), tf = m.querySelector("#cfTf"), dsw = m.querySelector("#cfDsWrap");
      const sync = () => {
        dsw.hidden = src.value !== "dataset";
        m.querySelector("#cfCsvWrap").hidden = m.querySelector("#cfTickWrap").hidden = src.value !== "csv";
        m.querySelector("#cfDaysWrap").hidden = ["csv", "dataset"].includes(src.value);
      };
      sync();
      src.addEventListener("change", () => {
        sync();
        if (DATA_SOURCES[src.value]) { tf.innerHTML = Object.keys(DATA_SOURCES[src.value].tf).map(t => `<option ${t === "240" || (src.value === "coinbase" && t === "360") ? "selected" : ""}>${t}</option>`).join(""); m.querySelector("[name=symbol]").value = DATA_SOURCES[src.value].example; }
      });
      m.querySelector("#campaignForm").addEventListener("submit", async e => {
        e.preventDefault();
        const f = Object.fromEntries(new FormData(e.target).entries());
        f.autoTriage = !!f.autoTriage;
        try {
          if (f.source === "dataset") { const ds = await db.get("datasets", f.uploadedDatasetId); f.source = ds.source; f.symbol = ds.symbol; f.timeframe = ds.timeframe; }
          else if (f.source === "csv") {
            const file = e.target.csvFile.files[0]; if (!file) throw new Error("Choose the price history CSV");
            const bars = parseOhlcCsv(await readFile(file)); if (bars.t.length < 2) throw new Error("No bars found in that CSV");
            const ds = await L.saveDataset({ source: "csv", symbol: f.symbol.trim().toUpperCase(), timeframe: f.timeframe, bars, tickSize: +f.tickSize || null, note: file.name });
            f.uploadedDatasetId = ds.id;
          } else f.uploadedDatasetId = null;
          delete f.csvFile;
          const c = await L.createCampaign(f);
          ui.closeModal();
          if (e.submitter && e.submitter.dataset.start) await L.startCampaign(c.id);
          location.hash = `#/campaign/${c.id}/tasks`;
          toast(e.submitter?.dataset.start ? "Campaign started" : "Draft created");
        } catch (err) { toast(err.message, "bad"); }
      });
    });
  },
  startCampaign: async (el, d) => { await L.startCampaign(d.id); toast("Campaign running"); },
  pauseCampaign: async (el, d) => { await L.pauseCampaign(d.id); toast("Campaign paused — running tasks finish, queued tasks wait"); },
  cancelCampaign: async (el, d) => { await L.cancelCampaign(d.id); toast("Campaign cancelled"); },
  saveBudget: async (el, d) => { const f = el.closest("form"); await db.update("campaigns", d.id, c => { c.budget.maxCalls = +f.maxCalls.value; c.budget.maxCostUsd = +f.maxCostUsd.value; }); await db.audit("campaign.budget_changed", { campaignId: d.id, maxCalls: +f.maxCalls.value, maxCostUsd: +f.maxCostUsd.value }, { type: "human", id: "operator" }); toast("Budget updated"); },
  cancelTask: async (el, d) => { await cancelTask(d.id); toast("Task cancelled"); },
  retryTask: async (el, d) => { const t = await db.get("tasks", d.id); if (t.campaignId) { const c = await db.get("campaigns", t.campaignId); if (c.status !== "RUNNING") await L.startCampaign(c.id); } await retryTask(d.id); toast("Task queued"); },
  ideaDecision: async (el, d) => { await L.decideIdea(d.id, d.status, d.status === "ACCEPTED" ? "Accepted by human" : `${d.status.toLowerCase()} by human`); const idea = await db.get("ideas", d.id); if (d.status === "ACCEPTED") { const c = await db.get("campaigns", idea.campaignId); if (c.status !== "RUNNING") toast("Queued — resume the campaign to process it"); else toast("Sent to indicator research"); pump(); } else toast("Idea " + d.status.toLowerCase()); },
  sendToValidation: async (el, d) => { await L.sendToValidation(d.id); toast("Validation queued"); },
  backtestNow: async (el, d) => { await L.backtestNow(d.id); toast("Backtest plan queued"); },
  regenPine: async (el, d) => { await L.regeneratePine(d.id); toast("Pine Engineer queued"); },
  approvePaper: async (el, d, ui) => {
    ui.openModal(`<h2>Approve paper forward test</h2><p class="small muted">You are the human committee. Approval allows a paper deployment on live bars; it does not allow live capital. Hard fails and (under strict policy) missing TradingView parity block approval.</p><label class="field">Note (conditions, rationale)<textarea id="paperNote" placeholder="Why this deserves forward evidence, and what would stop it"></textarea></label><label class="check"><input type="checkbox" id="paperAck"> I have read the strongest rejection case.</label><div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="paperGo">Approve paper test</button></div>`, m => {
      m.querySelector("#paperGo").addEventListener("click", async () => {
        if (!m.querySelector("#paperAck").checked) return toast("Confirm you read the rejection case", "bad");
        try { await L.approvePaper(d.id, m.querySelector("#paperNote").value); ui.closeModal(); toast("Paper test approved"); } catch (e) { toast(e.message, "bad"); }
      });
    });
  },
  startForward: async (el, d) => { const dep = await L.startForward(d.id); toast("Deployment started"); location.hash = `#/version/${d.id}/forward`; setTimeout(() => L.checkDeployment(dep.id).catch(() => {}), 500); },
  checkDeployment: async (el, d, ui) => {
    if (!IN_ARTIFACT) { toast("Checking live bars…"); await L.checkDeployment(d.id); toast("Deployment checked"); return; }
    const dep = await db.get("deployments", d.id);
    ui.openModal(`<h2>Check forward test</h2><p class="small muted">This view cannot fetch live prices. Upload fresh price history for ${esc(dep.symbol)} ${esc(dep.timeframe)} that covers the period since ${isoMinute(dep.startedAt)} plus some earlier history for indicator warm-up. Only bars that closed after the start can create forward trades.</p><label class="field">Price history CSV<input type="file" id="fwFile" accept=".csv,text/csv"><span class="hint">${CSV_HINT}</span></label><div id="fwOut" class="small"></div><div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="fwGo">Check deployment</button></div>`, m => {
      m.querySelector("#fwGo").addEventListener("click", async () => {
        try { const f = m.querySelector("#fwFile").files[0]; if (!f) throw new Error("Choose a CSV file"); const bars = parseOhlcCsv(await readFile(f)); await L.checkDeployment(d.id, { bars }); ui.closeModal(); toast("Deployment checked"); }
        catch (e) { m.querySelector("#fwOut").innerHTML = `<span class="fail">${esc(e.message)}</span>`; }
      });
    });
  },
  checkAllDeployments: async () => { if (IN_ARTIFACT) return toast("Use Check now on each deployment to upload fresh prices.", "bad"); toast("Checking all deployments…"); await autoCheckDeployments(); toast("Done"); },
  stopDeployment: async (el, d) => { await L.stopDeployment(d.id); toast("Deployment completed"); },
  reviewForward: async (el, d) => { await L.reviewForward(d.id); toast("Forward-Test Operator queued"); },
  markLive: async (el, d, ui) => {
    ui.openModal(`<h2>Mark live candidate</h2><p class="small muted">Requires forward-test requirements to be met. This only marks the version as eligible for a human live review <b>outside ARF-OS</b>. It does not approve or enable live trading.</p><label class="field">Note<textarea id="liveNote"></textarea></label><div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="liveGo">Mark live candidate</button></div>`, m => {
      m.querySelector("#liveGo").addEventListener("click", async () => { try { await L.markLiveCandidate(d.id, m.querySelector("#liveNote").value); ui.closeModal(); toast("Marked live candidate"); } catch (e) { toast(e.message, "bad"); } });
    });
  },
  humanRework: async (el, d, ui) => {
    ui.openModal(`<h2>Request a new version</h2><p class="small muted">Describe one explicit change. The Strategy Architect creates a child version; the parent stays immutable. If the parent's holdout was evaluated, the child's holdout is marked contaminated.</p><label class="field">Explicit change<textarea id="rwText" placeholder="e.g. Add a 200-EMA regime filter: only long when close > ema200, because the validator found losses concentrated in bear regimes."></textarea></label><div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="rwGo">Request child version</button></div>`, m => {
      m.querySelector("#rwGo").addEventListener("click", async () => { try { await L.requestHumanRework(d.id, m.querySelector("#rwText").value.trim()); ui.closeModal(); toast("Rework queued"); } catch (e) { toast(e.message, "bad"); } });
    });
  },
  humanDecision: async (el, d, ui) => {
    const v = await db.get("versions", d.id);
    ui.openModal(`<h2>Human decision</h2><p class="small muted">Current state ${badge(v.status)}. Decisions outside the normal lifecycle are recorded as visible overrides with your reason. LIVE_APPROVED cannot be granted here.</p>
      <label class="field">New state<select id="hdTo">${HUMAN_STATES.map(s => `<option ${d.to === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      <label class="field">Reason (required)<textarea id="hdReason"></textarea></label><label class="check"><input type="checkbox" id="hdOverride"> This is an override of the lifecycle policy</label>
      <div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="hdGo">Record decision</button></div>`, m => {
      m.querySelector("#hdGo").addEventListener("click", async () => {
        try { await L.humanDecision(d.id, m.querySelector("#hdTo").value, m.querySelector("#hdReason").value.trim(), m.querySelector("#hdOverride").checked); ui.closeModal(); toast("Decision recorded"); }
        catch (e) { toast(e.message + (/not allowed/.test(e.message) ? " — tick override to force it." : ""), "bad"); }
      });
    });
  },
  copySDL: async (el, d) => copyText(JSON.stringify((await db.get("versions", d.id)).sdl, null, 2)),
  downloadSDL: async (el, d) => { const v = await db.get("versions", d.id); download(`${v.sdl.strategy.name.replace(/\W+/g, "_")}_v${v.versionNumber}.sdl.json`, JSON.stringify(v.sdl, null, 2), "application/json"); },
  copyPine: async (el, d) => { const v = await db.get("versions", d.id); copyText((await db.get("artefacts", v.pineArtefactId)).data.source); },
  downloadPine: async (el, d) => { const v = await db.get("versions", d.id); download(`${v.sdl.strategy.name.replace(/\W+/g, "_")}_v${v.versionNumber}.pine`, (await db.get("artefacts", v.pineArtefactId)).data.source); },
  downloadTrades: async (el, d) => {
    const v = await db.get("versions", d.id); const bt = await db.get("backtests", v.backtestId);
    const trades = d.seg === "development" ? bt.result.development.trades : d.seg === "holdout" ? v.holdoutResult?.trades || [] : bt.result.validation.trades;
    const head = "id,direction,entry_time,entry_price,exit_time,exit_price,qty,fees,net,reason\n";
    download(`trades_${d.seg}_v${v.versionNumber}.csv`, head + trades.map(t => [t.id, t.dir, new Date(t.entryTime).toISOString(), t.entryPrice, new Date(t.exitTime).toISOString(), t.exitPrice, t.qty, t.fees, t.net, t.reason].join(",")).join("\n"), "text/csv");
  },
  uploadTV: async (el, d) => {
    const f = $("#tvFile").files[0]; if (!f) return toast("Choose the List of Trades CSV first", "bad");
    toast("Computing parity…");
    const rec = await L.verifyTradingView(d.id, await readFile(f), f.name);
    toast(`Parity ${rec.status}`, rec.status === "PASS" ? "" : "bad");
  },
  explainTV: async (el, d) => { const t = $(`#exp-${d.id}`).value.trim(); if (!t) return toast("Write an explanation", "bad"); await L.explainVerification(d.id, t); toast("Explanation saved"); },
  labValidate: async () => {
    const out = $("#labOut"); let sdl;
    try { sdl = JSON.parse($("#labSdl").value); } catch (e) { out.innerHTML = `<div class="note bad small">Invalid JSON: ${esc(e.message)}</div>`; return; }
    await db.setting("labDraft", $("#labSdl").value);
    const ds = await db.get("datasets", $("#labDataset")?.value);
    if (ds) sdl.costs.tickSize = sdl.costs.tickSize || ds.tickSize;
    const v = validateSDL(sdl);
    out.innerHTML = v.ok ? `<div class="note good small">✓ Valid SDL · ${gridSize(sdl)} parameter combinations${v.warnings.length ? `<br>Warnings: ${esc(v.warnings.join("; "))}` : ""}</div>` : `<div class="note bad small"><b>${v.errors.length} errors</b><ul style="margin:4px 0 0;padding-left:18px">${v.errors.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>`;
  },
  labTemplate: async () => { $("#labSdl").value = JSON.stringify(SDL_TEMPLATE, null, 2); await db.setting("labDraft", $("#labSdl").value); },
  labRun: async () => {
    let sdl; try { sdl = JSON.parse($("#labSdl").value); } catch (e) { return toast("Invalid JSON: " + e.message, "bad"); }
    await db.setting("labDraft", $("#labSdl").value);
    const ds = await db.get("datasets", $("#labDataset").value);
    sdl.market = { ...sdl.market, timeframe: ds.timeframe, symbols: [`${ds.source.toUpperCase()}:${ds.symbol}`] };
    sdl.costs.tickSize = ds.tickSize;
    const v = await L.createManualVersion({ campaignId: null, datasetId: ds.id, sdl });
    await L.backtestNow(v.id);
    location.hash = `#/version/${v.id}/backtest`;
    toast("Version registered — backtest plan running");
  },
  agentModel: async (el, d) => { const cfg = (await db.setting("agentModels")) || {}; cfg[d.id] = { ...(cfg[d.id] || {}), model: el.value }; await db.setting("agentModels", cfg); await db.audit("agent.model_changed", { agentId: d.id, model: el.value }, { type: "human", id: "operator" }); toast("Model updated"); },
  agentEffort: async (el, d) => { const cfg = (await db.setting("agentModels")) || {}; cfg[d.id] = { ...(cfg[d.id] || {}), effort: el.value }; await db.setting("agentModels", cfg); toast("Effort updated"); },
  runPractice: async (el, d) => { toast("Practice running…"); const r = await runPractice(d.suite, { promptId: d.prompt || null }); toast(`Practice score ${Math.round(r.score * 100)}%`); },
  newChallenger: async (el, d, ui) => {
    const champ = await championPrompt(d.agent);
    ui.openModal(`<h2>New challenger prompt — ${esc(agentById[d.agent].role)}</h2><p class="small muted">The challenger runs only in the Practice Arena until a human promotes it. Shared rules and the output contract stay fixed.</p><textarea class="code" id="chText" style="min-height:320px">${esc(champ.text)}</textarea><label class="field">What changed and why<input type="text" id="chNotes"></label><div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="chGo">Save challenger</button></div>`, m => {
      m.querySelector("#chGo").addEventListener("click", async () => { await createChallenger(d.agent, m.querySelector("#chText").value, m.querySelector("#chNotes").value); ui.closeModal(); toast("Challenger saved — run the practice suites"); });
    });
  },
  promoteCheck: async (el, d, ui) => {
    const chk = await promotionCheck(d.id);
    ui.openModal(`<h2>Promote challenger v${chk.challenger.version}?</h2>${chk.noSuite ? `<p class="note warn small">No practice suite exists for this agent; promotion relies on your review alone.</p>` : `<div class="table-wrap"><table class="t"><thead><tr><th>Suite</th><th class="num">Champion v${chk.champion.version}</th><th class="num">Challenger</th></tr></thead><tbody>${chk.rows.map(r => `<tr><td>${esc(SUITES[r.suiteId].name)}</td><td class="num">${r.champion ? Math.round(r.champion.score * 100) + "%" : "not run"}</td><td class="num">${r.challenger ? Math.round(r.challenger.score * 100) + "%" : "not run"}</td></tr>`).join("")}</tbody></table></div>${!chk.ready ? `<p class="note warn small">Run every suite for both prompts first.</p>` : chk.better ? `<p class="note good small">Challenger matches or beats the champion on every suite.</p>` : `<p class="note bad small">Challenger regresses on at least one suite. Promotion will be recorded as a regression.</p>`}`}
      <details><summary class="small">Challenger text</summary><pre style="white-space:pre-wrap">${esc(chk.challenger.text)}</pre></details><label class="field">Reason (required)<input type="text" id="prReason"></label><div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="prGo" ${!chk.noSuite && !chk.ready ? "disabled" : ""}>Promote to champion</button></div>`, m => {
      m.querySelector("#prGo").addEventListener("click", async () => { try { await promote(d.id, m.querySelector("#prReason").value.trim()); ui.closeModal(); toast("Prompt promoted"); } catch (e) { toast(e.message, "bad"); } });
    });
  },
  rollbackPrompt: async (el, d, ui) => {
    ui.openModal(`<h2>Roll back prompt</h2><label class="field">Reason (required)<input type="text" id="rbReason"></label><div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="rbGo">Roll back</button></div>`, m => {
      m.querySelector("#rbGo").addEventListener("click", async () => { const r = m.querySelector("#rbReason").value.trim(); if (!r) return toast("Give a reason", "bad"); await rollback(d.id, r); ui.closeModal(); toast("Rolled back"); });
    });
  },
  loadDataset: async (el, d, ui) => {
    ui.openModal(`<h2>Load dataset</h2><div class="form-grid"><label class="field">Source<select id="ldSource">${IN_ARTIFACT ? "" : Object.entries(DATA_SOURCES).map(([k, s]) => `<option value="${k}">${esc(s.name)}</option>`).join("")}<option value="csv">CSV upload</option></select></label><label class="field">Symbol<input type="text" id="ldSymbol" value="BTCUSDT"></label><label class="field">Timeframe<input type="text" id="ldTf" value="240"><span class="hint">TradingView style: 60, 240, 1D…</span></label><label class="field">History (days)<input type="number" id="ldDays" value="1460"></label><label class="field">Tick size (optional)<input type="number" step="any" id="ldTick" placeholder="auto"></label><label class="field" id="ldFileWrap" ${IN_ARTIFACT ? "" : "hidden"}>CSV file<input type="file" id="ldFile" accept=".csv,text/csv"><span class="hint">Columns: time, open, high, low, close[, volume]. ${CSV_HINT}</span></label></div><div id="ldOut" class="small muted"></div><div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" id="ldGo">Load &amp; check integrity</button></div>`, m => {
      m.querySelector("#ldSource").addEventListener("change", e => { m.querySelector("#ldFileWrap").hidden = e.target.value !== "csv"; });
      m.querySelector("#ldGo").addEventListener("click", async () => {
        const src = m.querySelector("#ldSource").value, sym = m.querySelector("#ldSymbol").value.trim(), tf = m.querySelector("#ldTf").value.trim().toUpperCase().replace(/^(\d+)$/, "$1"), tick = +m.querySelector("#ldTick").value || null;
        const out = m.querySelector("#ldOut");
        try {
          let bars;
          if (src === "csv") { const f = m.querySelector("#ldFile").files[0]; if (!f) throw new Error("Choose a CSV file"); bars = parseOhlcCsv(await readFile(f)); }
          else bars = await fetchBars({ source: src, symbol: sym, timeframe: tf, from: Date.now() - (+m.querySelector("#ldDays").value || 1460) * 86_400_000, onProgress: n => (out.textContent = `${n} bars…`) });
          if (!bars.t.length) throw new Error("No bars returned");
          const ds = await L.saveDataset({ source: src, symbol: sym, timeframe: tf, bars, tickSize: tick, note: src === "csv" ? "CSV upload" : "" });
          ui.closeModal(); location.hash = `#/data/${ds.id}`; toast(`Loaded ${ds.bars} bars — ${ds.status}`);
        } catch (e) { out.innerHTML = `<span class="fail">${esc(e.message)}</span>`; }
      });
    });
  },
  portfolioReview: async () => { await L.runPortfolioReview(); toast("Portfolio Researcher queued"); },
  exportAudit: async () => download("arf-audit.json", JSON.stringify(await db.all("audit"), null, 1), "application/json"),
  saveKey: async () => { const v = $("#apiKey").value.trim(); if (!v || v.startsWith("•")) return toast("Paste a key first", "bad"); if (!/^sk-ant-/.test(v)) return toast("That does not look like an Anthropic API key", "bad"); await db.setting("apikey", v); await db.audit("settings.api_key_set", {}, { type: "human", id: "operator" }); toast("API key saved in this browser"); pump(); },
  clearKey: async () => { await db.del("settings", "apikey"); await db.audit("settings.api_key_removed", {}, { type: "human", id: "operator" }); toast("API key removed"); },
  saveConcurrency: async () => { await db.setting("concurrency", Math.max(1, Math.min(6, +$("#concurrency").value || 2))); toast("Saved"); pump(); },
  exportWorkspace: async () => download(`arf-workspace-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await db.exportWorkspace()), "application/json"),
  importWorkspace: async el => {
    const f = el.files[0]; if (!f) return;
    let data; try { data = JSON.parse(await readFile(f)); } catch (e) { return toast("That file is not valid JSON", "bad"); }
    el.value = "";
    const { openModal, closeModal } = await import("./app.js");
    openModal(`<h2>Import workspace</h2><p>Merge the file into this workspace, or replace everything here with it?</p><div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn" id="imMerge">Merge</button><button class="btn danger" id="imReplace">Replace</button></div>`, m => {
      const go = async replace => { try { await db.importWorkspace(data, { replace }); closeModal(); toast("Workspace imported"); location.hash = "#/"; } catch (e) { toast(e.message, "bad"); } };
      m.querySelector("#imMerge").addEventListener("click", () => go(false));
      m.querySelector("#imReplace").addEventListener("click", () => go(true));
    });
  },
  resetWorkspace: async (el, d, ui) => {
    ui.openModal(`<h2>Reset workspace</h2><p>This deletes every campaign, strategy, run and audit record in this browser. Export first if you want a backup.</p><label class="field">Type RESET to confirm<input type="text" id="rsText" autocomplete="off"></label><div class="foot"><button class="btn" data-act="closeModal">Cancel</button><button class="btn danger" id="rsGo">Delete everything</button></div>`, m => {
      m.querySelector("#rsGo").addEventListener("click", async () => { if (m.querySelector("#rsText").value !== "RESET") return toast('Type RESET to confirm', "bad"); await db.clearAll(); ui.closeModal(); location.hash = "#/"; toast("Workspace reset"); });
    });
  }
};
