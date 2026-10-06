// Cross-device sync: two separate browsers (own IndexedDB and localStorage) signed in as the same Claude user,
// sharing one mocked artifact database. Work done on one appears on the other; deletes travel; device-only
// settings stay put; a device does not run tasks another live device queued.
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syntheticBars } from "../js/synthetic.js";
import { SDL_TEMPLATE } from "../js/sdl.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".csv": "text/csv" };
const skeleton = body => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${body}</body></html>`;
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/" || p === "/index.html") { res.writeHead(200, { "content-type": "text/html" }); return res.end(skeleton(fs.readFileSync(path.join(dir, "artifact.html"), "utf8"))); }
  const f = path.join(dir, p);
  if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

/* ---- The shared cloud store: enforces the documented path grammar, 256 KiB documents and the 25,000 cap. ---- */
const store = new Map(); let writes = 0, maxDoc = 0;
const SEG = /^[A-Za-z0-9_\-.:@+~]{1,200}$/;
const checkPath = (p, even) => { const s = p.split("/"); if (s.length % 2 !== (even ? 0 : 1) || s.some(x => !SEG.test(x) || x === "." || x === "..")) throw "invalid_argument"; };
const cmp = (a, op, b) => op === ">" ? a > b : op === ">=" ? a >= b : op === "<" ? a < b : op === "<=" ? a <= b : op === "==" ? a === b : op === "!=" ? a !== b : false;
function rdbOp(op, a) {
  if (op === "set") {
    checkPath(a.path, true);
    const size = Buffer.byteLength(JSON.stringify(a.data)); if (size > 256 * 1024) throw "invalid_argument";
    if (!store.has(a.path) && store.size >= 25000) throw "quota_exceeded";
    maxDoc = Math.max(maxDoc, size); writes++; store.set(a.path, a.data); return null;
  }
  if (op === "get") { checkPath(a.path, true); return store.get(a.path) ?? null; }
  if (op === "delete") { checkPath(a.path, true); store.delete(a.path); return null; }
  if (op === "query") {
    checkPath(a.coll, false);
    let rows = [...store].filter(([p]) => p.slice(0, p.lastIndexOf("/")) === a.coll).map(([p, d]) => ({ path: p, data: d }));
    for (const [f, o, v] of a.f) rows = rows.filter(r => cmp(r.data[f], o, v));
    if (a.o) rows.sort((x, y) => (x.data[a.o[0]] - y.data[a.o[0]]) * (a.o[1] === "desc" ? -1 : 1)); else rows.sort((x, y) => x.path.localeCompare(y.path));
    if (a.l) { if (a.l > 1000) throw "invalid_argument"; rows = rows.slice(0, a.l); }
    return rows;
  }
  throw "invalid_argument";
}
const mockRuntime = () => {
  const call = async (op, a) => { const r = JSON.parse(await window.__rdb(op, JSON.stringify(a))); if (r.err) throw { code: r.err, message: r.err }; return r.v; };
  const meta = { fromCache: false, hasPendingWrites: false };
  const snapOf = (p, d) => ({ id: p.split("/").pop(), exists: d != null, data: () => d ?? undefined, metadata: meta });
  const need = (p, even) => { if (p.split("/").length % 2 !== (even ? 0 : 1)) throw new TypeError("bad path parity: " + p); };
  const docRef = p => (need(p, true), { id: p.split("/").pop(), path: p, get: async () => snapOf(p, await call("get", { path: p })), set: d => call("set", { path: p, data: d }), update: d => call("set", { path: p, data: d }), delete: () => call("delete", { path: p }), collection: c => query(p + "/" + c) });
  const query = (coll, f = [], o = null, l = null) => (need(coll, false), {
    path: coll, where: (a, b, c) => query(coll, [...f, [a, b, c]], o, l), orderBy: (a, d = "asc") => query(coll, f, [a, d], l), limit: n => query(coll, f, o, n),
    doc: id => docRef(coll + "/" + (id || Math.random().toString(36).slice(2))),
    get: async () => { const docs = (await call("query", { coll, f, o, l })).map(r => snapOf(r.path, r.data)); return { docs, size: docs.length, empty: !docs.length, docChanges: () => docs.map((d, i) => ({ type: "added", doc: d, oldIndex: -1, newIndex: i })), metadata: meta }; },
    onSnapshot(next, err) {
      let prev = null, stop = false;
      const tick = async () => {
        if (stop) return;
        try {
          const rows = await call("query", { coll, f, o, l }), cur = new Map(rows.map(r => [r.path, JSON.stringify(r.data)])), ch = [];
          rows.forEach((r, i) => { const p = prev && prev.get(r.path); if (p === undefined || p === null) { if (!prev || !prev.has(r.path)) ch.push({ type: "added", doc: snapOf(r.path, r.data), oldIndex: -1, newIndex: i }); } else if (p !== cur.get(r.path)) ch.push({ type: "modified", doc: snapOf(r.path, r.data), oldIndex: i, newIndex: i }); });
          const firstTime = !prev; prev = cur;
          if (ch.length || firstTime) { const docs = rows.map(r => snapOf(r.path, r.data)); next({ docs, size: docs.length, empty: !docs.length, docChanges: () => ch, metadata: meta }); }
        } catch (e) { stop = true; err && err(e); return; }
        setTimeout(tick, 300);
      };
      setTimeout(tick, 0);
      return () => { stop = true; };
    }
  });
  const rdb = { doc: docRef, collection: p => query(p) };
  const user = { id: async () => "u_dez", isOwner: async () => true, canEdit: async () => true, can: async () => true };
  window.claude = { use: async name => (name === "db" ? rdb : name === "user" ? user : null) };
};

const browser = await chromium.launch();
async function device(name, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", e => page.errors.push(name + ": " + e.message));
  await page.route("**/*", r => new URL(r.request().url()).hostname === "localhost" ? r.continue() : r.abort());
  await page.exposeFunction("__rdb", (op, a) => { try { return JSON.stringify({ v: rdbOp(op, JSON.parse(a)) }); } catch (e) { return JSON.stringify({ err: typeof e === "string" ? e : "invalid_argument" }); } });
  await page.addInitScript(mockRuntime);
  await page.goto(base);
  await page.waitForSelector("#view .page");
  return page;
}
const js = (page, fn, arg) => page.evaluate(fn, arg);
const syncOf = page => js(page, async () => (await import("/js/sync.js")).syncState());
const until = async (fn, ms = 60000, what = "condition") => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what); await new Promise(r => setTimeout(r, 300)); } };
const counts = page => js(page, async () => { const db = await import("/js/db.js"); const o = {}; for (const s of ["versions", "backtests", "bars", "datasets", "strategies", "tasks"]) o[s] = (await db.all(s)).length; return o; });

const res = {};
const TF = 3600_000, N = 30000, end = Math.floor(Date.now() / TF) * TF - TF;
const bars = syntheticBars({ n: N, seed: 3, start: end - (N - 1) * TF, tfMs: TF });

// Device A: desktop. Make real work: a dataset (big enough to need part documents) and two backtested strategies.
const A = await device("A", { viewport: { width: 1280, height: 900 } });
await until(async () => (await syncOf(A)).status === "on", 30000, "A sync on");
await js(A, async ([b, sdl]) => {
  const L = await import("/js/lanes.js"); const db = await import("/js/db.js");
  await db.setting("theme", "dark");
  const ds = await L.saveDataset({ source: "test", symbol: "BTCUSDT", timeframe: "60", bars: b, tickSize: 0.01 });
  for (const name of ["Sync one", "Sync two"]) { const v = await L.createManualVersion({ datasetId: ds.id, sdl: { ...structuredClone(sdl), strategy: { ...sdl.strategy, name } }, name }); await L.backtestNow(v.id); }
}, [{ t: bars.t, o: bars.o, h: bars.h, l: bars.l, c: bars.c, v: bars.v }, SDL_TEMPLATE]);
await until(async () => (await js(A, async () => (await (await import("/js/db.js")).all("tasks")).every(t => ["SUCCEEDED", "FAILED_TERMINAL"].includes(t.status)))), 120000, "A tasks done");
await until(async () => { const s = await syncOf(A); return s.status === "on" && !s.pending; }, 60000, "A uploaded");
res.A = await counts(A);
res.cloudDocs = store.size; res.maxDocBytes = maxDoc;
res.partsUsed = [...store.keys()].some(k => k.includes("/bars-parts/"));

// Device B: phone, empty. It downloads everything and gets the same work.
const B = await device("B", { ...devices["Pixel 7"] });
await until(async () => (await syncOf(B)).status === "on", 60000, "B sync on");
await until(async () => JSON.stringify(await counts(B)) === JSON.stringify(res.A), 30000, "B matches A");
res.B = await counts(B);
res.barsIntact = await js(B, async n => { const db = await import("/js/db.js"); const ds = (await db.all("datasets"))[0]; const b = await db.get("bars", ds.id); return b.c.length === n && b.t.length === n; }, N);
res.themeStaysLocal = await js(B, async () => (await (await import("/js/db.js")).setting("theme")) === undefined);
await B.goto(base + "#/library"); await B.waitForTimeout(600);
res.libraryRowsB = await B.$$eval("table.t tbody tr", r => r.length);

// A change on the phone (reject one) reaches the desktop live; then deleting it on the phone removes it there too.
const vId = await js(B, async () => (await (await import("/js/db.js")).all("versions")).find(v => v.sdl.strategy.name === "Sync one").id);
await js(B, async id => (await import("/js/lanes.js")).humanDecision(id, "REJECTED", "sync test", true), vId);
res.liveUpdate = await until(async () => (await js(A, async id => (await (await import("/js/db.js")).get("versions", id))?.status, vId)) === "REJECTED", 30000, "A sees reject");
await js(B, async () => (await import("/js/lanes.js")).deleteRejected());
res.liveDelete = await until(async () => (await js(A, async id => !(await (await import("/js/db.js")).get("versions", id)), vId)), 30000, "A sees delete");

// A task queued on the desktop is not run by the phone while the desktop is live.
await js(A, async () => { const w = await import("/js/workflow.js"); w.setPaused(true); const db = await import("/js/db.js"); const v = (await db.all("versions"))[0]; await (await import("/js/lanes.js")).backtestNow(v.id); });
const tId = await until(async () => js(A, async () => (await (await import("/js/db.js")).all("tasks")).find(t => t.status === "QUEUED")?.id), 10000, "queued task");
await until(async () => js(B, async id => !!(await (await import("/js/db.js")).get("tasks", id)), tId), 30000, "B sees task");
await js(B, async () => (await import("/js/workflow.js")).pump());
await B.waitForTimeout(3000);
res.phoneLeftTaskAlone = await js(B, async id => (await (await import("/js/db.js")).get("tasks", id)).status, tId) === "QUEUED";
await js(A, async () => (await import("/js/workflow.js")).setPaused(false));
// (The re-backtest itself is refused by the lifecycle, which is fine here: what matters is that the desktop ran it.)
const aDevice = await js(A, async () => (await import("/js/db.js")).DEVICE);
res.taskDoneSeenOnPhone = await until(async () => { const t = await js(B, async id => (await (await import("/js/db.js")).get("tasks", id)), tId); return ["SUCCEEDED", "FAILED_TERMINAL"].includes(t.status) && t.device === aDevice && t.attempts > 0; }, 60000, "B sees task done");

// Reopening the phone later: nothing re-downloads needlessly and nothing is lost.
const w0 = writes;
await B.reload(); await B.waitForSelector("#view .page");
await until(async () => (await syncOf(B)).status === "on", 30000, "B sync on after reload");
await B.waitForTimeout(1500);
res.writesOnReload = writes - w0;
res.afterReload = JSON.stringify(await counts(B)) === JSON.stringify(await counts(A));
await B.goto(base + "#/admin"); await B.waitForTimeout(500);
res.adminText = await B.$eval("#syncStatus", e => e.textContent);
res.errors = [...A.errors, ...B.errors];
console.log(JSON.stringify(res, null, 1));
await browser.close(); server.close();
if (res.errors.length || !res.partsUsed || res.maxDocBytes > 256 * 1024 || res.B.versions !== 2 || !res.barsIntact || !res.themeStaysLocal || res.libraryRowsB !== 2 || !res.liveUpdate || !res.liveDelete || !res.phoneLeftTaskAlone || !res.taskDoneSeenOnPhone || res.writesOnReload > 3 || !res.afterReload || !/synced across your devices/.test(res.adminText)) process.exit(1);
