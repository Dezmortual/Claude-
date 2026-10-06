// Persistence: IndexedDB object stores (one per entity type), an append-only audit log and a tiny
// event bus. Everything lives in the viewer's browser; Export/Import moves a workspace between machines.

import { uuidv7, nowIso } from "./util.js";

const DB_NAME = "arf-os-platform";
const DB_VERSION = 1;
export const STORES = [
  "settings", "campaigns", "tasks", "ideas", "indicators", "strategies", "versions", "artefacts",
  "datasets", "bars", "backtests", "validations", "verifications", "decisions", "deployments",
  "agentRuns", "prompts", "practiceRuns", "audit", "transitions", "handoffs", "lessons"
];

let dbp = null;
let memory = null; // fallback when IndexedDB is unavailable (private mode, tests)

function open() {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => { const db = req.result; for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { memory = Object.fromEntries(STORES.map(s => [s, new Map()])); resolve(null); };
    } catch (_) { memory = Object.fromEntries(STORES.map(s => [s, new Map()])); resolve(null); }
  });
  return dbp;
}
export const persistent = async () => !!(await open());

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode), s = t.objectStore(store);
    let out;
    const r = fn(s);
    if (r) r.onsuccess = () => { out = r.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// Each device has a stable id; every local write is stamped with when (_m) and where (_d) it happened,
// so cross-device sync (sync.js) can tell newer from older copies of a record.
export const DEVICE = (() => {
  try { let d = localStorage.getItem("dq-device"); if (!d) { d = "d" + uuidv7().replace(/-/g, "").slice(-12); localStorage.setItem("dq-device", d); } return d; }
  catch (_) { return "d" + uuidv7().replace(/-/g, "").slice(-12); }
})();
// Strictly increasing on this device (fractions of a millisecond break ties), never below the record's last stamp.
let lastStamp = 0;
export const stamp = (after = 0) => (lastStamp = Math.max(Date.now(), lastStamp + 0.001, after + 0.001));
export async function put(store, obj, { remote = false } = {}) {
  if (!obj.id) obj.id = uuidv7();
  if (!remote) { obj._m = stamp(obj._m || 0); obj._d = DEVICE; }
  const db = await open();
  if (!db) { memory[store].set(obj.id, structuredClone(obj)); }
  else await tx(db, store, "readwrite", s => s.put(obj));
  emit(store, obj, { remote });
  return obj;
}
export async function get(store, id) {
  if (!id) return null;
  const db = await open();
  if (!db) { const v = memory[store].get(id); return v ? structuredClone(v) : null; }
  return (await tx(db, store, "readonly", s => s.get(id))) || null;
}
export async function all(store, filter) {
  const db = await open();
  const rows = !db ? [...memory[store].values()].map(v => structuredClone(v)) : await tx(db, store, "readonly", s => s.getAll());
  return filter ? rows.filter(filter) : rows;
}
export async function del(store, id, { remote = false } = {}) {
  const db = await open();
  if (!db) memory[store].delete(id);
  else await tx(db, store, "readwrite", s => s.delete(id));
  emit(store, { id, deleted: true }, { remote });
}
export async function update(store, id, patch) {
  const cur = await get(store, id);
  if (!cur) throw new Error(`${store}/${id} not found`);
  const next = typeof patch === "function" ? patch(cur) || cur : Object.assign(cur, patch);
  next.updatedAt = nowIso();
  return put(store, next);
}

/* Events */
const listeners = new Set();
export function on(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(store, obj, meta = {}) { for (const fn of listeners) try { fn(store, obj, meta); } catch (_) {} }

/* Audit (spec §17.4): append-only — there is no update or delete path for this store in the app. */
export async function audit(type, data = {}, actor = { type: "system", id: "arf-os" }) {
  return put("audit", { id: uuidv7(), type, actor, data, at: nowIso() });
}

/* Settings */
export async function setting(key, value) {
  if (value === undefined) { const r = await get("settings", key); return r ? r.value : undefined; }
  await put("settings", { id: key, value });
  return value;
}

/* Workspace export / import */
export async function exportWorkspace() {
  const out = { format: "arf-os-workspace", version: 1, exportedAt: nowIso(), stores: {} };
  for (const s of STORES) out.stores[s] = s === "settings" ? (await all(s)).filter(r => r.id !== "apikey") : await all(s);
  return out;
}
export async function importWorkspace(data, { replace = false } = {}) {
  if (!data || data.format !== "arf-os-workspace") throw new Error("Not a DezQuant workspace file");
  if (replace) await clearAll();
  for (const s of STORES) for (const row of data.stores[s] || []) await put(s, row);
  await audit("workspace.imported", { replace, exportedAt: data.exportedAt });
}
export async function clearAll() {
  const db = await open();
  for (const s of STORES) {
    if (!db) memory[s].clear();
    else await tx(db, s, "readwrite", st => st.clear());
  }
}
