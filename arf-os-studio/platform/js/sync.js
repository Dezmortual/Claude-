// Cross-device sync for the Claude app version. Every record in the local IndexedDB workspace is mirrored
// to the viewer's private space in the artifact's database (data/users/<id>/ws/<store>/<record>), so the
// same workspace appears on every device signed in to the same Claude account. The website has no shared
// store and keeps using Export/Import.
//
// Rules: newest write wins per record (each write is stamped with _m, when, and _d, which device);
// deletions travel as tombstones; records too big for one document are gzipped and split into parts.

import * as db from "./db.js";
import { IN_ARTIFACT } from "./ui-util.js";

const LOCAL_ONLY = { settings: new Set(["apikey", "theme", "queuePaused", "concurrency", "labDraft", "labPine"]) };
const PLAIN_MAX = 60_000;   // characters of JSON stored as-is in one document (documents cap at 256 KiB)
const PART = 190_000;       // characters of base64 per part document
const PAGE = 100;
const LS = "dq-sync:";

const state = { status: "off", detail: "", lastSync: null, pulled: 0, pushed: 0, pending: 0 };
const listeners = new Set();
export const syncState = () => ({ ...state });
export const onSync = fn => (listeners.add(fn), () => listeners.delete(fn));
const setState = p => { Object.assign(state, p); for (const fn of listeners) try { fn({ ...state }); } catch (_) {} };

const lsGet = (k, d) => { try { const v = localStorage.getItem(LS + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (_) {} };

const safe = id => String(id).replace(/[^A-Za-z0-9_\-.:]/g, c => "~" + c.charCodeAt(0).toString(16) + "~");
const keyOf = (store, id) => store + "\n" + id;
const localOnly = (store, id) => !!LOCAL_ONLY[store]?.has(id);
export const mOf = r => r?._m || Date.parse(r?.updatedAt || r?.createdAt || r?.at || "") || 1;

let rdb = null, root = null, started = false;
const remoteM = new Map();   // key -> newest stamp known to be in the cloud
const remoteN = new Map();   // key -> number of part documents in the cloud
const deviceSeen = {};       // device -> newest stamp seen from it (how recently it was active)
let cursors = lsGet("cursors", {});
let firstSync = false;
let pushedUpTo = lsGet("pushed", {});
const dirty = new Map(Object.entries(lsGet("dirty", {}))); // key -> deletion time (0 = changed, not deleted)

/** How long ago another device last wrote anything we have seen (Infinity if never). */
export const deviceIdleMs = d => (d === db.DEVICE ? 0 : Date.now() - (deviceSeen[d] || 0));
export const syncing = () => !!root;

/* ---------------- Encoding ---------------- */
async function gzip64(str) {
  const buf = new Uint8Array(await new Response(new Blob([str]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
async function gunzip64(b64) {
  const bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
const canZip = () => typeof CompressionStream === "function" && typeof DecompressionStream === "function";

/* ---------------- Push ---------------- */
let flushTimer = null, flushing = false, backoffUntil = 0, stopped = "";
let saveTimer = null;
const saveDirty = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => lsSet("dirty", Object.fromEntries(dirty)), 400); };
function markDirty(store, id, deleted) {
  if (localOnly(store, id)) return;
  dirty.set(keyOf(store, id), deleted ? Date.now() : 0);
  saveDirty();
  setState({ pending: dirty.size });
  scheduleFlush();
}
function scheduleFlush(ms = 2000) { if (!root || stopped) return; clearTimeout(flushTimer); flushTimer = setTimeout(flush, Math.max(ms, backoffUntil - Date.now())); }

async function writePartsAndMain(store, id, main, payload) {
  const parts = [];
  for (let i = 0; i < payload.length; i += PART) parts.push(payload.slice(i, i + PART));
  const h = Math.random().toString(36).slice(2, 10);
  const px = root.collection(store + "-parts");
  for (let k = 0; k < parts.length; k++) await px.doc(safe(id) + "@" + k).set({ h, p: parts[k] });
  await root.collection(store).doc(safe(id)).set({ ...main, n: parts.length, h });
  const old = remoteN.get(keyOf(store, id)) || 0;
  for (let k = parts.length; k < old; k++) await px.doc(safe(id) + "@" + k).delete();
  remoteN.set(keyOf(store, id), parts.length);
}

async function pushRecord(store, rec) {
  const key = keyOf(store, rec.id), m = mOf(rec);
  if ((remoteM.get(key) || 0) >= m) return false;
  const main = { i: rec.id, m, d: rec._d || db.DEVICE };
  const json = JSON.stringify(rec);
  if (json.length <= PLAIN_MAX) {
    await root.collection(store).doc(safe(rec.id)).set({ ...main, j: json });
    const old = remoteN.get(key) || 0;
    for (let k = 0; k < old; k++) await root.collection(store + "-parts").doc(safe(rec.id) + "@" + k).delete();
    remoteN.delete(key);
  } else if (canZip()) {
    const z = await gzip64(json);
    if (z.length <= PART) { await root.collection(store).doc(safe(rec.id)).set({ ...main, z }); remoteN.delete(key); }
    else await writePartsAndMain(store, rec.id, { ...main, e: "z" }, z);
  } else await writePartsAndMain(store, rec.id, { ...main, e: "j" }, json);
  remoteM.set(key, m);
  if (m > (pushedUpTo[store] || 0)) { pushedUpTo[store] = m; lsSet("pushed", pushedUpTo); }
  return true;
}

async function pushKey(key, delAt) {
  const [store, id] = key.split("\n");
  const rec = await db.get(store, id);
  if (rec) return pushRecord(store, rec);
  const m = Math.max(delAt || Date.now(), (remoteM.get(key) || 0) + 0.001);
  await root.collection(store).doc(safe(id)).set({ i: id, m, d: db.DEVICE, del: true });
  for (let k = 0; k < (remoteN.get(key) || 0); k++) await root.collection(store + "-parts").doc(safe(id) + "@" + k).delete();
  remoteN.delete(key); remoteM.set(key, m);
  return true;
}

// Returns false when pushing should stop for now.
async function handleError(e, what) {
  const code = e?.code || "unavailable";
  if (code === "resource_exhausted" || code === "unavailable") { backoffUntil = Date.now() + 15_000; setState({ status: "waiting", detail: "Busy; retrying shortly" }); return false; }
  if (code === "quota_exceeded") { stopped = "full"; setState({ status: "full", detail: "Your cloud space for DezQuant is full. Delete old rejected strategies or datasets, then tap Sync now." }); return false; }
  if (code === "revoked" || code === "not_granted" || code === "capability_disabled" || code === "capability_removed") { stopped = "off"; root = null; setState({ status: "unavailable", detail: "Sync was switched off for this page." }); return false; }
  console.warn("sync: skipped", what, e); return true; // invalid_argument and the like: this record cannot be stored; move on
}

async function flush() {
  if (!root || flushing || stopped) return;
  flushing = true;
  try {
    for (const [key, delAt] of [...dirty]) {
      try { await pushKey(key, delAt); state.pushed++; }
      catch (e) { if (!(await handleError(e, key))) { scheduleFlush(15_000); return; } }
      if (dirty.get(key) === delAt) dirty.delete(key);
      saveDirty();
    }
    setState({ status: "on", detail: "", lastSync: new Date().toISOString(), pending: dirty.size });
  } finally { flushing = false; if (dirty.size && !stopped) scheduleFlush(); }
}

/* ---------------- Pull ---------------- */
let applyChain = Promise.resolve();
const applyQueued = (store, docs) => (applyChain = applyChain.then(() => applyDocs(store, docs)).catch(e => console.warn("sync: apply", e)));

async function readRecord(store, d) {
  if (d.j !== undefined) return d.j;
  if (d.z !== undefined) return gunzip64(d.z);
  const px = root.collection(store + "-parts"); let s = "";
  for (let k = 0; k < d.n; k++) {
    const snap = await px.doc(safe(d.i) + "@" + k).get();
    const p = snap.exists ? snap.data() : null;
    if (!p || p.h !== d.h) return null; // being rewritten right now; the newer copy arrives on its own
    s += p.p;
  }
  return d.e === "z" ? gunzip64(s) : s;
}

async function applyDocs(store, docs) {
  let n = 0;
  for (const d of docs) {
    if (!d || d.i === undefined || typeof d.m !== "number") continue;
    const key = keyOf(store, d.i);
    if (d.m > (remoteM.get(key) || 0)) remoteM.set(key, d.m);
    if (d.n) remoteN.set(key, d.n); else remoteN.delete(key);
    if (d.d && d.m > (deviceSeen[d.d] || 0)) deviceSeen[d.d] = d.m;
    if (d.m > (cursors[store] || 0)) cursors[store] = d.m;
    if (localOnly(store, d.i)) continue;
    const delAt = dirty.get(key);
    if (delAt && delAt >= d.m) continue;           // deleted here after that copy was written
    const cur = await db.get(store, d.i);
    // Ours is the same or newer. On a device's very first sync the cloud copy wins instead: records with
    // fixed ids (built-in prompts, preferences) were just recreated here and must not overwrite your edits.
    if (cur && mOf(cur) >= d.m && !(firstSync && cur._d === db.DEVICE)) continue;
    if (d.del) { if (cur) { await db.del(store, d.i, { remote: true }); n++; } continue; }
    const json = await readRecord(store, d);
    if (json == null) continue;
    const rec = JSON.parse(json);
    rec._m = d.m; rec._d = d.d;
    await db.put(store, rec, { remote: true });
    if (dirty.has(key) && !dirty.get(key)) { dirty.delete(key); saveDirty(); } // a newer copy replaced our unsent change
    n++;
  }
  lsSet("cursors", cursors);
  if (n) setState({ pulled: state.pulled + n, lastSync: new Date().toISOString() });
  return n;
}

// Everything newer than this device's cursor, a page at a time ("m >=" so equal stamps at a page edge are not skipped).
async function pullStore(store) {
  let from = Math.max(0, (cursors[store] || 0) - 0.0005), total = 0, seen = new Set();
  for (;;) {
    const snap = await root.collection(store).where("m", ">=", from).orderBy("m").limit(PAGE).get();
    const docs = snap.docs.map(x => x.data()).filter(d => d && !seen.has(d.i + "@" + d.m));
    for (const d of docs) seen.add(d.i + "@" + d.m);
    total += await applyQueued(store, docs) || 0;
    if (snap.size < PAGE || !docs.length) return total;
    from = snap.docs[snap.docs.length - 1].data().m;
  }
}

// Records written on this device that the cloud has not got yet (first sync, or changes made while offline).
async function pushBacklog() {
  for (const store of db.STORES) {
    const since = pushedUpTo[store] || 0;
    for (const rec of await db.all(store)) {
      if (localOnly(store, rec.id) || (rec._d && rec._d !== db.DEVICE)) continue;
      if (!rec._m) { rec._m = db.stamp(mOf(rec) - 1); rec._d = db.DEVICE; await db.put(store, rec, { remote: true }); }
      else if (rec._m <= since) continue;
      if (!dirty.has(keyOf(store, rec.id))) dirty.set(keyOf(store, rec.id), 0);
    }
  }
  saveDirty();
  setState({ pending: dirty.size });
}

const unsubs = [];
function subscribe() {
  for (const u of unsubs.splice(0)) try { u(); } catch (_) {}
  for (const store of db.STORES) {
    const q = root.collection(store).where("m", ">", cursors[store] || 0);
    unsubs.push(q.onSnapshot(snap => {
      const docs = snap.docChanges().filter(c => c.type !== "removed").map(c => c.doc.data());
      if (docs.length) applyQueued(store, docs);
    }, e => { if (e?.code === "unavailable") setTimeout(subscribe, 5000); }));
  }
}

/* ---------------- Start ---------------- */
async function claudeRuntime(ms = 10_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (window.claude && typeof window.claude.use === "function") return window.claude; await new Promise(r => setTimeout(r, 100)); }
  return null;
}

/** Connects and runs the first sync; resolves with how many records came from other devices. */
export async function startSync() {
  if (started) return 0;
  started = true;
  const claude = typeof window !== "undefined" ? await claudeRuntime() : null;
  if (!claude) { setState({ status: "unavailable", detail: "Sync works when DezQuant is opened in the Claude app." }); return 0; }
  let user = null;
  try { [rdb, user] = await Promise.all([claude.use("db"), claude.use("user")]); } catch (_) {}
  const uid = user ? await user.id() : null;
  if (!rdb || !uid) { setState({ status: "unavailable", detail: "Sign in to Claude to sync across devices." }); return 0; }
  root = rdb.doc(`data/users/${uid}/ws`);
  setState({ status: "syncing", detail: "Getting your work from your other devices…" });
  let pulled = 0;
  firstSync = !lsGet("synced", false);
  try {
    for (const store of db.STORES) pulled += await pullStore(store);
    await applyChain;
    firstSync = false; lsSet("synced", true);
    await pushBacklog();
  } catch (e) { if (!(await handleError(e, "first sync"))) { scheduleFlush(15_000); } }
  if (!root) return pulled;
  subscribe();
  setState({ status: dirty.size ? "syncing" : "on", detail: dirty.size ? "Uploading your work…" : "", lastSync: new Date().toISOString() });
  flush();
  // Coming back to the tab: send anything left over and pick up changes the live feed may have missed.
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
  return pulled;
}

let pullingNow = false;
export async function syncNow() {
  if (!root || pullingNow) return;
  pullingNow = true; stopped = stopped === "full" ? "" : stopped; backoffUntil = 0;
  try { for (const store of db.STORES) await pullStore(store); await applyChain; await flush(); }
  catch (e) { await handleError(e, "sync now"); }
  finally { pullingNow = false; }
}

/** After "Reset workspace": forget what this device had, so the next start downloads everything again. */
export function forgetLocal() { lsSet("synced", false); cursors = {}; pushedUpTo = {}; dirty.clear(); clearTimeout(saveTimer); lsSet("cursors", {}); lsSet("pushed", {}); lsSet("dirty", {}); }

// Only the Claude app syncs; the website never records changes for upload.
if (IN_ARTIFACT) db.on((store, obj, meta = {}) => { if (!meta.remote) markDirty(store, obj.id, !!obj.deleted); });
