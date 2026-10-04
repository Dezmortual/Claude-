// Phone-width flows: one-tap Binance data, Pine → SDL conversion, run, Copy for Claude → paste in artifact mode.
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticBars } from "../js/synthetic.js";
import { SDL_TEMPLATE } from "../js/sdl.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shots = process.argv[2] || null;
const sk = b => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${b}</body></html>`;
const server = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, "http://x").pathname);
  if (p === "/artifact/") { r.writeHead(200, { "content-type": "text/html" }); return r.end(sk(fs.readFileSync(path.join(dir, "artifact.html"), "utf8"))); }
  const f = path.join(dir, p.replace(/^\/artifact\//, "/").replace(/\/$/, "/index.html"));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html" });
  fs.createReadStream(f).pipe(r);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const TF = 4 * 3600_000, N = 4400, end = Math.floor(Date.now() / TF) * TF - TF;
const bars = syntheticBars({ n: N, seed: 12, start: end - (N - 1) * TF, tfMs: TF });
// Mirrors a real reply that left out strategy.family, thesis and directions (the app must cope).
const partialSdl = structuredClone(SDL_TEMPLATE); partialSdl.strategy = { name: "MACD test" };
const sdlOut = { status: "COMPLETE", summary: "Translated MACD cross strategy.", assumptions: [], unknowns: [], confidence: 0.7, sdl: partialSdl, ambiguityNotes: ["Script has no stop-loss; added a 2×ATR stop."], expectedFailureModes: [], backtestExpectations: { tradesPerYear: 30, expectedWinRatePct: 40, notes: "" }, changeCategory: "initial", changedFields: [] };
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
await page.route("https://data-api.binance.vision/**", async route => {
  const u = new URL(route.request().url()); const st = +u.searchParams.get("startTime"), lim = +u.searchParams.get("limit");
  const rows = []; for (let i = 0; i < N && rows.length < lim; i++) if (bars.t[i] >= st) rows.push([bars.t[i], String(bars.o[i]), String(bars.h[i]), String(bars.l[i]), String(bars.c[i]), String(bars.v[i]), bars.t[i] + TF - 1]);
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(rows) });
});
// First architect reply breaks a runner rule (unknown name "cci") and uses a flat trailing-stop shape;
// the app must send the validator's errors back and accept the corrected second reply.
let architectCalls = 0;
await page.route("https://api.anthropic.com/**", async route => {
  const ev = o => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
  architectCalls++;
  const out = structuredClone(sdlOut);
  out.sdl.indicators = [...out.sdl.indicators];
  out.sdl.risk = { ...out.sdl.risk, trailingStop: { type: "atr_multiple", value: 0.015, atrIndicator: "atr14" } };
  if (architectCalls === 1) out.sdl.signals = { ...out.sdl.signals, longEntry: "crosses_above(fast, slow) AND cci > 0" };
  await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: ev({ type: "message_start", message: { usage: { input_tokens: 900 } } }) + ev({ type: "content_block_delta", delta: { type: "text_delta", text: JSON.stringify(out) } }) + ev({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 700 } }) });
});
await page.route(/fonts\.g/, r => r.abort());
const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + ".png") }); };
const result = {};
// --- Website version on a phone
await page.goto(base + "#/admin");
await page.fill("#apiKey", "sk-ant-test"); await page.click("[data-act=saveKey]");
await page.goto(base + "#/lab");
await page.waitForSelector(".quick-data");
result.tabbarVisible = await page.isVisible("#tabbar");
await shot("m1-lab");
await page.click('[data-act=quickData][data-symbol="BTCUSDT"][data-tf="240"]');
await page.waitForSelector("#labDataset", { timeout: 20000 });
result.datasetLoaded = await page.$eval("#labDataset", s => s.options[s.selectedIndex].text);
await page.click(".pine-box summary").catch(() => {});
if (!(await page.isVisible("#labPine"))) await page.click(".pine-box summary");
await page.fill("#labPine", '//@version=6\nstrategy("MACD test")\nif ta.crossover(ta.ema(close,20), ta.ema(close,100))\n    strategy.entry("L", strategy.long)');
await page.click("[data-act=convertPine]");
await page.waitForSelector("#pineOut .note", { timeout: 20000 });
result.converted = (await page.textContent("#pineOut")).slice(0, 80);
result.architectCalls = architectCalls;
result.trailInDefinition = (await page.inputValue("#labSdl")).includes('"activation"');
await shot("m2-converted");
await page.click("[data-act=labRun]");
await page.waitForTimeout(4000);
result.afterRunUrl = page.url().split("#")[1].split("/")[1];
// Copy for Claude
await page.goto(base + "#/lab");
await page.click("[data-act=copyForClaude]");
await page.click("#cfcGo");
await page.waitForTimeout(300);
const copied = await page.evaluate(() => navigator.clipboard.readText());
result.copiedKB = Math.round(copied.length / 1024);
await shot("m3-copy");
const overflow1 = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
// --- Artifact mode on a phone: paste the copied text
const page2 = await ctx.newPage();
page2.on("pageerror", e => errors.push("artifact: " + e.message));
await page2.route("**/*", r => (new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort()));
await page2.addInitScript(() => { window.claude = { use: async () => null }; });
await page2.goto(base + "artifact/#/lab");
await page2.waitForSelector("[data-act=pasteDataset]");
result.artifactHasQuickButtons = await page2.isVisible(".quick-data");
await page2.click("[data-act=pasteDataset]");
// A real paste inserts the whole text at once; set it the same way (fill() types it and times out on 200 KB).
await page2.$eval("#pdText", (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); }, copied);
result.prefilled = `${await page2.inputValue("#pdSym")} ${await page2.inputValue("#pdTf")}`;
await page2.click("#pdGo");
await page2.waitForSelector("#labDataset", { timeout: 10000 });
result.artifactDataset = await page2.$eval("#labDataset", s => s.options[s.selectedIndex].text);
if (shots) await page2.screenshot({ path: path.join(shots, "m4-artifact-pasted.png") });
const overflow2 = await page2.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
result.overflow = overflow1 || overflow2;
result.errors = errors;
console.log(JSON.stringify(result, null, 1));
await browser.close(); server.close();
if (errors.length || result.overflow || !result.artifactDataset || result.afterRunUrl !== "version") process.exit(1);
