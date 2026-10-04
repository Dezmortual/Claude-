// Artifact-mode test: the entry page wrapped in the publish skeleton, window.claude mocked
// (sample + downloads), and every non-local request blocked like the artifact CSP.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticBars } from "../js/synthetic.js";
import { SDL_TEMPLATE } from "../js/sdl.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv[2] || null;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const skeleton = body => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/" || p === "/index.html") { res.writeHead(200, { "content-type": "text/html" }); return res.end(skeleton(fs.readFileSync(path.join(dir, "artifact.html"), "utf8"))); }
  const f = path.join(dir, p);
  if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const TF = 4 * 3600_000, N = 3000, end = Math.floor(Date.now() / TF) * TF - TF;
const b = syntheticBars({ n: N, seed: 5, start: end - (N - 1) * TF, tfMs: TF });
let csv = "time,open,high,low,close,Volume\n";
for (let i = 0; i < N; i++) csv += `${b.t[i] / 1000},${b.o[i]},${b.h[i]},${b.l[i]},${b.c[i]},${b.v[i]}\n`;

const common = { status: "COMPLETE", summary: "Mock summary", assumptions: [], unknowns: [], confidence: 0.5 };
const OUT = {
  CHIEF_RESEARCH_ORCHESTRATOR: { ...common, directions: [{ title: "EMA trend", question: "q", rationale: "r", priority: "high" }], risks: [], budgetNotes: "" },
  IDEA_SCOUT: { ...common, ideas: [{ title: "EMA cross trend", hypothesis: "h", sourceSummary: "", sources: [], mechanism: "m", expectedDirection: "both", expectedRegime: "t", failureRegime: "c", requiredInputs: [], pineFeasibility: "FEASIBLE", expectedTradeFrequency: "w", cheapestFalsificationTest: "x", noveltyScore: 2, evidenceStrength: "moderate", similarInternal: [], risks: [], recommendation: "RESEARCH" }] },
  INDICATOR_RESEARCHER: { ...common, cards: [] },
  STRATEGY_ARCHITECT: { ...common, sdl: SDL_TEMPLATE, ambiguityNotes: [], expectedFailureModes: [], backtestExpectations: { tradesPerYear: 40, expectedWinRatePct: 40, notes: "" }, changeCategory: "initial", changedFields: [] },
  PINE_ENGINEER: { ...common, source: "//@version=6\nstrategy(\"x\")", implementationNotes: "", deviations: [], alertExamples: [] },
  BACKTEST_ENGINEER: { ...common, dataQualityNotes: [], lowSample: false, concerns: [], parameterSelectionComment: "", isOosDegradation: "", recommendation: "PROCEED_TO_VALIDATION" },
  ROBUSTNESS_VALIDATOR: { ...common, recommendation: "REJECT", rejectionCase: "r", positiveCase: "p", risks: [], unresolvedQuestions: [], operationalRisks: [], proposedChange: "" },
  STRATEGY_JUDGE: { ...common, decision: "REJECT", memo: "m", positiveCase: "p", rejectionCase: "r", conditions: [], falsifiers: [], requiredNextEvidence: [], reviewInDays: 30 },
  DATA_INTEGRITY_AND_MARKET_REGIME_ANALYST: { ...common, verdict: "OK", assessment: "ok", issues: [], recommendations: [] }
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], external = [];
page.on("pageerror", e => errors.push(e.message));
page.on("console", m => { if (m.type() === "error" && !/fonts|ERR_CERT|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
await page.route("**/*", r => { const u = new URL(r.request().url()); if (u.hostname === "localhost") return r.continue(); if (!/fonts\.g/.test(u.hostname)) external.push(u.hostname); return r.abort(); });
await page.exposeFunction("__mockSample", input => {
  const text = typeof input === "string" ? input : input.map(t => t.content).join("\n");
  const role = (text.match(/ROLE: ([A-Z_]+)/) || [])[1];
  return JSON.stringify(OUT[role] || {});
});
await page.exposeFunction("__mockSave", (name) => { globalThis.__saved = (globalThis.__saved || []).concat(name); return true; });
await page.addInitScript(() => {
  const sample = async (input, opts = {}) => { const text = await window.__mockSample(input); opts.onText && opts.onText({ text, delta: text }); return { text, truncated: false, modelTierApplied: opts.modelTier || "default" }; };
  const downloads = { save: async ({ filename }) => { await window.__mockSave(filename); return { status: "saved" }; } };
  window.claude = { use: async name => (name === "sample" ? sample : name === "downloads" ? downloads : null) };
});
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + ".png") }); };
await page.goto(base);
await page.waitForSelector(".tiles");
await shot("a1-command");
const conn = await page.textContent("#conn");
await page.click("[data-act=newCampaign]");
const opts = await page.$$eval("#cfSource option", os => os.map(o => o.value));
await page.fill("[name=name]", "Artifact campaign");
await page.selectOption("#cfSource", "csv");
await page.setInputFiles("[name=csvFile]", { name: "BTCUSDT_240.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
await shot("a2-form");
await page.click("button[data-start='1']");
const dbu = base + "js/db.js";
const t0 = Date.now(); let st;
while (Date.now() - t0 < 120000) {
  st = await page.evaluate(async u => { const db = await import(u); return { v: (await db.all("versions")).map(v => v.status), f: (await db.all("tasks")).filter(t => ["FAILED_TERMINAL", "WAITING_HUMAN"].includes(t.status)).map(t => t.kind + ": " + t.error?.message) }; }, dbu);
  if (st.f.length || st.v.includes("REJECTED")) break;
  await page.waitForTimeout(400);
}
await page.goto(base + "#/admin");
await page.click("[data-act=exportWorkspace]");
await page.waitForTimeout(500);
const saved = await page.evaluate(() => 0); // saves are recorded node-side
await shot("a3-admin");
await page.click("[data-act=resetWorkspace]");
const resetModal = await page.isVisible("#rsText");
await page.click("[data-act=closeModal]");
// A strategy pasted into the price box goes to step 1 instead of erroring.
await page.goto(base + "#/lab");
await page.click("[data-act=pasteDataset]");
await page.evaluate(() => { document.querySelector("#pdText").value = JSON.stringify({ schemaVersion: "1.0", strategy: { name: "Gold test" }, market: { symbols: ["XAUUSD"] } }); });
await page.click("#pdGo");
await page.waitForTimeout(600);
const sdlRouted = (await page.inputValue("#labSdl")).includes("Gold test") && await page.isHidden("#modalBack");
console.log(JSON.stringify({ conn, sdlRouted, sourceOptions: opts, versions: st.v, failures: st.f, saved: globalThis.__saved || [], resetModal, external: [...new Set(external)], errors }, null, 1));
void saved;
await browser.close(); server.close();
if (!sdlRouted || errors.length || st.f.length || !st.v.length || external.length) process.exit(1);
