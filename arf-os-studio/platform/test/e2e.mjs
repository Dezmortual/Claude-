// End-to-end smoke test: real app in headless Chromium, with the Anthropic API and Binance mocked.
// Usage: node test/e2e.mjs [screenshotDir]
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticBars } from "../js/synthetic.js";
import { SDL_TEMPLATE } from "../js/sdl.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const shots = process.argv[2] || null;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

const TF = 4 * 3600_000;
const N = 3000;
const end = Math.floor(Date.now() / TF) * TF - TF;
const bars = syntheticBars({ n: N, seed: 5, start: end - (N - 1) * TF, tfMs: TF });

const PINE = `//@version=6
// ARF-OS Strategy ID: x
strategy("ok", overlay=true, initial_capital=10000, currency=currency.USD, commission_type=strategy.commission.percent, commission_value=0.06, slippage=2, default_qty_type=strategy.percent_of_equity, default_qty_value=10, pyramiding=0, margin_long=100, margin_short=100, calc_on_every_tick=false, process_orders_on_close=false)
fast_length = input.int(20, "Fast", minval=10, maxval=40)
slow_length = input.int(100, "Slow", minval=60, maxval=160)
stop_atr = input.float(2.0, "Stop ATR", minval=1, maxval=3)
target_r = input.float(2.0, "Target R", minval=1, maxval=3)
startTime = input.time(timestamp("2020-01-01"), "Start")
f = ta.ema(close, fast_length)
s = ta.ema(close, slow_length)
a = ta.atr(14)
if barstate.isconfirmed and ta.crossover(f, s) and time >= startTime
    strategy.entry("L", strategy.long)
if barstate.isconfirmed and ta.crossunder(f, s)
    strategy.entry("S", strategy.short)
strategy.exit("XL", from_entry="L", stop=strategy.position_avg_price - a * stop_atr, limit=strategy.position_avg_price + a * stop_atr * target_r)
strategy.exit("XS", from_entry="S", stop=strategy.position_avg_price + a * stop_atr, limit=strategy.position_avg_price - a * stop_atr * target_r)
alert('{"deploymentId":"x","strategyVersionId":"y"}', alert.freq_once_per_bar_close)`;
const common = { status: "COMPLETE", summary: "Mock summary", assumptions: ["mock"], unknowns: [], confidence: 0.5 };
const sdl = structuredClone(SDL_TEMPLATE);
const OUT = {
  CHIEF_RESEARCH_ORCHESTRATOR: { ...common, directions: [{ title: "EMA trend", question: "Do EMA crosses trend?", rationale: "momentum", priority: "high" }], risks: ["overfitting"], budgetNotes: "fine" },
  IDEA_SCOUT: { ...common, ideas: [{ title: "EMA cross trend", hypothesis: "Fast/slow EMA crosses capture persistent trends.", sourceSummary: "classic", sources: [], mechanism: "herding", expectedDirection: "both", expectedRegime: "trending", failureRegime: "chop", requiredInputs: ["close"], pineFeasibility: "FEASIBLE", expectedTradeFrequency: "weekly", cheapestFalsificationTest: "default-param backtest", noveltyScore: 2, evidenceStrength: "moderate", similarInternal: [], risks: ["whipsaw"], recommendation: "RESEARCH" }] },
  INDICATOR_RESEARCHER: { ...common, cards: [{ name: "EMA", type: "ema", role: "trend", formula: "ema", parameters: [{ name: "length", min: 10, max: 160, default: 20, rationale: "x" }], economicInterpretation: "trend", warmupBars: 300, repaintingAnalysis: "causal", mtfNotes: "none", failureModes: ["chop"], redundancyNotes: "", pineNotes: "ta.ema", unitTests: ["x"], recommendation: "USE" }] },
  STRATEGY_ARCHITECT: { ...common, sdl, ambiguityNotes: [], expectedFailureModes: ["chop"], backtestExpectations: { tradesPerYear: 40, expectedWinRatePct: 40, notes: "" }, changeCategory: "initial", changedFields: [] },
  PINE_ENGINEER: { ...common, source: PINE, implementationNotes: "Direct mapping", deviations: [], alertExamples: [] },
  BACKTEST_ENGINEER: { ...common, dataQualityNotes: [], lowSample: false, concerns: [], parameterSelectionComment: "ok", isOosDegradation: "moderate", recommendation: "PROCEED_TO_VALIDATION" },
  ROBUSTNESS_VALIDATOR: { ...common, recommendation: "PAPER_TEST", rejectionCase: "Single symbol, synthetic.", positiveCase: "Stable.", risks: [{ risk: "regime", severity: "medium", mitigation: "forward" }], unresolvedQuestions: [], operationalRisks: [], proposedChange: "" },
  STRATEGY_JUDGE: { ...common, decision: "PAPER_TEST_RECOMMENDED", memo: "Mock memo", positiveCase: "p", rejectionCase: "r", conditions: ["c"], falsifiers: ["f"], requiredNextEvidence: ["forward"], reviewInDays: 30 },
  DATA_INTEGRITY_AND_MARKET_REGIME_ANALYST: { ...common, verdict: "OK", assessment: "clean", issues: [], recommendations: [] },
  FORWARD_TEST_OPERATOR: { ...common, health: "HEALTHY", driftAssessment: "none", infraIssues: [], recommendation: "CONTINUE" },
  PORTFOLIO_RESEARCHER: { ...common, redundantPairs: [], diversifiers: [], concentrationRisks: [], riskBudget: [] }
};
let calls = 0;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" && !/ERR_CERT_AUTHORITY_INVALID|fonts\.g/.test(m.text())) errors.push("console: " + m.text()); });
await page.route("https://api.anthropic.com/**", async route => {
  calls++;
  const body = JSON.parse(route.request().postData());
  const role = (body.system.match(/ROLE: ([A-Z_]+)/) || [])[1];
  const out = OUT[role];
  if (!out) return route.fulfill({ status: 400, body: JSON.stringify({ error: { type: "invalid_request_error", message: "unknown role " + role } }) });
  const text = JSON.stringify(out);
  const ev = (o) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
  const sse = ev({ type: "message_start", message: { model: body.model, usage: { input_tokens: 1200 } } }) + ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }) + ev({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 600 } }) + ev({ type: "message_stop" });
  await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: sse });
});
await page.route("https://data-api.binance.vision/**", async route => {
  const u = new URL(route.request().url());
  const st = +u.searchParams.get("startTime"), lim = +u.searchParams.get("limit");
  const rows = [];
  for (let i = 0; i < N && rows.length < lim; i++) if (bars.t[i] >= st) rows.push([bars.t[i], String(bars.o[i]), String(bars.h[i]), String(bars.l[i]), String(bars.c[i]), String(bars.v[i]), bars.t[i] + TF - 1]);
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
});
const shot = async name => { if (shots) await page.screenshot({ path: path.join(shots, name + ".png"), fullPage: false }); };
const base = `http://localhost:${port}/platform/`;
await page.goto(base);
await page.waitForSelector(".tiles");
await shot("01-command-empty");
// API key
await page.goto(base + "#/admin");
await page.fill("#apiKey", "sk-ant-test-key");
await page.click("[data-act=saveKey]");
// Campaign
await page.goto(base + "#/campaigns");
await page.click("[data-act=newCampaign]");
await page.fill("[name=name]", "E2E BTC trend");
await page.selectOption("[name=maxDirections]".replace("select", ""), {}).catch(() => {});
await shot("02-new-campaign");
await page.click("button[data-start='1']");
const dbmod = `${base}js/db.js`;
const waitState = async (states, timeout = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const st = await page.evaluate(async u => { const db = await import(u); const vs = await db.all("versions"); const ts = await db.all("tasks"); return { vs: vs.map(v => v.status), failed: ts.filter(t => t.status === "FAILED_TERMINAL" || t.status === "WAITING_HUMAN").map(t => t.kind + ": " + (t.error?.message || "")) }; }, dbmod);
    if (st.failed.length) throw new Error("Task failed: " + st.failed.join(" | "));
    if (st.vs.some(s => states.includes(s))) return st;
    await page.waitForTimeout(500);
  }
  throw new Error("timeout waiting for " + states);
};
await page.waitForTimeout(1500);
await shot("03-task-graph-running");
const st = await waitState(["PAPER_PENDING_HUMAN", "REJECTED", "RESEARCH_APPROVED"]);
console.log("version states after campaign:", st.vs, "model calls:", calls);
await page.goto(base + "#/");
await page.waitForTimeout(800);
await shot("04-command");
const vid = await page.evaluate(async u => (await (await import(u)).all("versions"))[0].id, dbmod);
for (const tab of ["evidence", "definition", "source", "backtest", "robustness", "tradingview", "decisions", "lineage", "runs"]) {
  await page.goto(base + `#/version/${vid}/${tab}`);
  await page.waitForTimeout(500);
  const bad = await page.$(".note.bad b");
  const txt = bad ? await bad.textContent() : "";
  if (txt.includes("Could not render")) throw new Error("render failure on tab " + tab);
  await shot("05-version-" + tab);
}
// TradingView parity: build the CSV from the runner itself, upload it
const csv = await page.evaluate(async ([u, vid]) => {
  const db = await import(u); const { runBacktest } = await import(u.replace("db.js", "runner.js"));
  const v = await db.get("versions", vid); const b = await db.get("bars", v.datasetId);
  const r = runBacktest(v.sdl, b, v.selectedParams, { recordEquity: false });
  const iso = t => new Date(t).toISOString().slice(0, 16).replace("T", " ");
  let s = "Trade #,Type,Signal,Date/Time,Price USDT,Contracts,Profit USDT\n";
  r.trades.forEach((t, i) => { s += `${i + 1},Exit ${t.dir},x,${iso(t.exitTime)},${t.exitPrice},${t.qty},${t.net}\n${i + 1},Entry ${t.dir},x,${iso(t.entryTime)},${t.entryPrice},${t.qty},${t.net}\n`; });
  return s;
}, [dbmod, vid]);
await page.goto(base + `#/version/${vid}/tradingview`);
await page.setInputFiles("#tvFile", { name: "trades.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
await page.click("[data-act=uploadTV]");
await page.waitForTimeout(2500);
await shot("06-tradingview-parity");
const parityStatus = await page.evaluate(async u => (await (await import(u)).all("verifications"))[0]?.status, dbmod);
console.log("parity:", parityStatus);
// Committee: approve paper test
await page.goto(base + "#/committee");
await page.waitForTimeout(600);
await shot("07-committee");
let vstatus = await page.evaluate(async ([u, id]) => (await (await import(u)).get("versions", id)).status, [dbmod, vid]);
if (vstatus === "REJECTED") {
  // Exercise the human override path (visible, reasoned) so the paper/forward flow is covered too.
  await page.goto(base + `#/version/${vid}`);
  await page.click(`[data-act=humanDecision][data-id="${vid}"]`);
  await page.selectOption("#hdTo", "RESEARCH_APPROVED");
  await page.fill("#hdReason", "E2E: exercise forward flow");
  await page.check("#hdOverride");
  await page.click("#hdGo");
  await page.waitForTimeout(800);
  vstatus = await page.evaluate(async ([u, id]) => (await (await import(u)).get("versions", id)).status, [dbmod, vid]);
  console.log("after override:", vstatus);
  await page.goto(base + "#/committee");
  await page.waitForTimeout(600);
}
if (["PAPER_PENDING_HUMAN", "RESEARCH_APPROVED"].includes(vstatus)) {
  await page.click(`[data-act=approvePaper][data-id="${vid}"]`);
  await page.check("#paperAck");
  await page.click("#paperGo");
  await page.waitForTimeout(800);
  await page.goto(base + `#/version/${vid}`);
  await page.click(`[data-act=startForward][data-id="${vid}"]`);
  await page.waitForTimeout(3000);
  const dep = await page.evaluate(async u => (await (await import(u)).all("deployments"))[0], dbmod);
  console.log("deployment:", dep && dep.status, dep && dep.snapshot ? `bars ${dep.snapshot.bars}, trades ${dep.snapshot.trades.length}, issues ${JSON.stringify(dep.health?.issues)}` : "no snapshot");
  // Simulate a deployment that started 40 days ago so live bars exist after the start.
  await page.evaluate(async ([u, id]) => { const db = await import(u); await db.update("deployments", id, { startedAt: new Date(Date.now() - 40 * 86400000).toISOString() }); }, [dbmod, dep.id]);
  await page.goto(base + `#/version/${vid}/forward`);
  await page.click(`[data-act=checkDeployment][data-id="${dep.id}"]`);
  await page.waitForTimeout(2500);
  const dep2 = await page.evaluate(async u => (await (await import(u)).all("deployments"))[0], dbmod);
  console.log("forward after 40d:", `bars ${dep2.snapshot.bars}, trades ${dep2.snapshot.trades.length}, drift ${JSON.stringify(dep2.snapshot.drift)}`);
  await shot("08-forward");
}
for (const r of ["library", "validation", "forward", "agents", "practice", "data", "portfolio", "audit", "admin", "inbox", "lab"]) {
  await page.goto(base + "#/" + r);
  await page.waitForTimeout(500);
  const t = await page.textContent("main");
  if (t.includes("Could not render")) throw new Error("render failure on " + r);
  await shot("09-" + r);
}
const camp = await page.evaluate(async u => (await (await import(u)).all("campaigns"))[0], dbmod);
await page.goto(base + `#/campaign/${camp.id}/tasks`);
await page.waitForTimeout(600);
await shot("10-campaign-tasks");
// Practice: run the data suite against the mock
await page.goto(base + "#/practice");
await page.click('[data-act=runPractice][data-suite="data_defects"]');
await page.waitForTimeout(2500);
const pr = await page.evaluate(async u => (await (await import(u)).all("practiceRuns"))[0], dbmod);
console.log("practice score:", pr && pr.score);
// Backtest Lab: hand-written SDL, no campaign
await page.goto(base + "#/lab");
await page.click("[data-act=labValidate]");
await page.waitForSelector("#labOut .note");
await page.click("[data-act=labRun]");
const t0 = Date.now(); let labState = null;
while (Date.now() - t0 < 120000) {
  labState = await page.evaluate(async u => { const db = await import(u); const vs = (await db.all("versions")).filter(v => !v.campaignId); const ts = await db.all("tasks", t => !t.campaignId && t.status === "FAILED_TERMINAL"); return { s: vs.map(v => v.status), f: ts.map(t => t.kind + ": " + t.error?.message) }; }, dbmod);
  if (labState.f.length) throw new Error("Lab task failed: " + labState.f.join(" | "));
  if (labState.s.some(x => ["REJECTED", "RESEARCH_APPROVED", "PAPER_PENDING_HUMAN"].includes(x))) break;
  await page.waitForTimeout(500);
}
console.log("lab version:", labState.s);
// Dark theme
await page.click("#themeBtn");
await page.goto(base + `#/version/${vid}/robustness`);
await page.waitForTimeout(800);
await shot("12-dark-robustness");
// Mobile layout
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + `#/version/${vid}/backtest`);
await page.waitForTimeout(800);
await shot("11-mobile-backtest");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
console.log("horizontal overflow on mobile:", overflow);
console.log("campaign spend:", camp.spend);
console.log("errors:", errors.length ? errors : "none");
await browser.close(); server.close();
if (errors.length) process.exit(1);
