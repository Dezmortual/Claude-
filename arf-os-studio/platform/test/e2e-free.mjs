// The free path on a phone: no API key, no AI calls. One-tap data, free Pine conversion, examples, run → evidence grade.
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticBars } from "../js/synthetic.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv[2] || null;
const server = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  const f = path.join(dir, p.endsWith("/") ? p + "index.html" : p);
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html" });
  fs.createReadStream(f).pipe(r);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const TF = 4 * 3600_000, N = 4400, end = Math.floor(Date.now() / TF) * TF - TF;
const bars = syntheticBars({ n: N, seed: 21, start: end - (N - 1) * TF, tfMs: TF });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const page = await ctx.newPage();
const errors = []; let aiCalls = 0;
page.on("pageerror", e => errors.push(e.message));
await page.route(/fonts\.g/, r => r.abort());
await page.route("https://api.anthropic.com/**", r => { aiCalls++; return r.fulfill({ status: 400, body: JSON.stringify({ error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }) }); });
await page.route("https://data-api.binance.vision/**", async route => {
  const u = new URL(route.request().url()); const st = +u.searchParams.get("startTime"), lim = +u.searchParams.get("limit");
  const rows = []; for (let i = 0; i < N && rows.length < lim; i++) if (bars.t[i] >= st) rows.push([bars.t[i], String(bars.o[i]), String(bars.h[i]), String(bars.l[i]), String(bars.c[i]), String(bars.v[i]), bars.t[i] + TF - 1]);
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
});
const dbu = base + "js/db.js";
const waitVersion = async (n, timeout = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const vs = await page.evaluate(async u => (await (await import(u)).all("versions")).map(v => ({ s: v.status, g: v.evidenceGrade, n: v.sdl.strategy.name })), dbu);
    if (vs.length >= n && vs.slice(-1)[0] && ["VALIDATED", "REJECTED"].includes(vs.sort((a, b) => 0)[vs.length - 1].s) && vs.every(v => ["VALIDATED", "REJECTED"].includes(v.s))) return vs;
    await page.waitForTimeout(500);
  }
  throw new Error("timeout");
};
const res = {};
await page.goto(base + "#/lab");
await page.click('[data-act=quickData][data-symbol="BTCUSDT"][data-tf="240"]');
await page.waitForSelector("#labDataset", { timeout: 20000 });
// 1) Paste the user's MACD-CCI script and convert for free
await page.fill("#labPine", fs.readFileSync(path.join(dir, "test/pine/macd_cci.pine"), "utf8"));
await page.click("[data-act=convertPineFree]");
await page.waitForSelector("#pineOut .note");
res.convert = (await page.textContent("#pineOut .note.good")).trim().slice(0, 60);
if (shots) await page.screenshot({ path: path.join(shots, "f1-converted.png") });
await page.click("[data-act=labRun]");
let vs = await waitVersion(1);
res.macd = vs[0];
// 2) R08 pasted → clear failure with the example button → load it → run
await page.goto(base + "#/lab");
await page.fill("#labPine", fs.readFileSync(path.join(dir, "test/pine/r08.pine"), "utf8"));
await page.click("[data-act=convertPineFree]");
await page.waitForSelector("#pineOut .note.bad");
res.r08Offer = await page.isVisible('#pineOut [data-act=loadExample][data-id="r08"]');
await page.click('#pineOut [data-act=loadExample][data-id="r08"]');
await page.click("[data-act=labRun]");
vs = await waitVersion(2);
res.r08 = vs[1];
await page.goto(base + "#/version/" + (await page.evaluate(async u => (await (await import(u)).all("versions")).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[1].id, dbu)) + "/evidence");
await page.waitForTimeout(800);
res.reviewButton = await page.isVisible("[data-act=askAgentReview]");
// The Lab version already has free Pine code (no AI) on its Pine source tab.
await page.click('.tabs a[href$="/source"], a[href$="/source"]');
await page.waitForTimeout(800);
res.freePine = (await page.textContent("pre")).startsWith("//@version=6");
if (shots) await page.screenshot({ path: path.join(shots, "f2-evidence.png") });
res.failedTasks = await page.evaluate(async u => (await (await import(u)).all("tasks", t => ["FAILED_TERMINAL", "WAITING_HUMAN"].includes(t.status))).map(t => t.kind), dbu);
// An indicator script: pick its signals, build a strategy and run it.
await page.goto(base + "#/lab");
await page.fill("#labPine", fs.readFileSync(path.join(dir, "test/pine/ema_cross_indicator.pine"), "utf8"));
await page.click("[data-act=convertPineFree]");
await page.waitForSelector("#isBuy");
res.indicatorPicks = [await page.inputValue("#isBuy"), await page.inputValue("#isSell")];
if (shots) await page.screenshot({ path: path.join(shots, "f3-indicator-picker.png"), fullPage: false });
await page.click("[data-act=buildFromIndicator]");
await page.waitForSelector("#pineOut .note.good");
const nBefore = (await page.evaluate(async u => (await (await import(u)).all("versions")).length, dbu));
await page.click("[data-act=labRun]");
vs = await waitVersion(nBefore + 1);
res.indicatorRun = vs[vs.length - 1];
// Gold (PAXG) via the symbol box: typing "gold" maps to PAXGUSDT.
await page.goto(base + "#/lab");
await page.fill("#symPick", "gold");
await page.click("[data-act=quickDataPick]");
await page.waitForTimeout(3000);
res.gold = await page.evaluate(async u => (await (await import(u)).all("datasets")).some(d => d.symbol === "PAXGUSDT"), dbu);
// Campaign quick setup on a phone: tap choices, save a draft (no AI runs for a draft).
await page.goto(base + "#/campaigns");
await page.click("[data-act=newCampaign]");
await page.waitForSelector(".quick-setup");
await page.click('button.chip[data-group="tf"][data-value="60"]');
await page.click('button.chip[data-group="idea"][data-value="pullback"]');
if (shots) await page.screenshot({ path: path.join(shots, "f4-campaign-quick.png") });
await page.click("#campaignForm button[type=submit]:not([data-start])");
await page.waitForTimeout(1500);
res.quickCampaign = await page.evaluate(async u => { const db = await import(u); const c = (await db.all("campaigns"))[0]; const ds = c && await db.get("datasets", c.market.uploadedDatasetId); return c && { name: c.name, symbol: c.market.symbol, tf: c.market.timeframe, ds: ds && ds.symbol + " " + ds.timeframe + " " + ds.status }; }, dbu);
res.aiCalls = aiCalls; res.errors = errors;
console.log(JSON.stringify(res, null, 1));
await browser.close(); server.close();
if (errors.length || aiCalls || res.failedTasks.length || !res.r08Offer || !res.gold || res.indicatorPicks.join() !== "Buy,Sell" || !res.indicatorRun || !res.freePine || res.quickCampaign?.name !== "Gold 1h · Pullbacks" || !/^XAUUSD 60 (OK|WARN)$/.test(res.quickCampaign?.ds || "")) process.exit(1);
