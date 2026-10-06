// App shell: boot, navigation, hash router, live refresh, modals, global actions.
import * as db from "./db.js";
import { connect, transport } from "./model.js";
import { recover, pump, onActivity, activeTasks, setPaused } from "./workflow.js";
import "./lanes.js";
import { installChartHover, clearCharts } from "./charts.js";
import { esc, toast, $, IN_ARTIFACT } from "./ui-util.js";
import { routes, actions, navCounts, syncText } from "./views.js";
import { startSync, onSync } from "./sync.js";

const NAV = [
  ["Operate", [["", "Command Centre"], ["campaigns", "Campaigns"], ["inbox", "Research Inbox", "inbox"], ["committee", "Committee", "committee"]]],
  ["Strategies", [["library", "Strategy Library"], ["lab", "Backtest Lab"], ["validation", "Validation Lab"], ["forward", "Forward Tests", "forward"], ["portfolio", "Portfolio"]]],
  ["Agents", [["agents", "Agents"], ["practice", "Practice Arena"]]],
  ["Governance", [["data", "Data Health", "data"], ["audit", "Audit Log"], ["admin", "Policies & Admin"]]]
];

let current = { name: "", args: [] };
let rendering = false, dirty = false;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, "");
  const [path, qs] = h.split("?");
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || "", args: parts.slice(1), query: Object.fromEntries(new URLSearchParams(qs || "")) };
}

async function renderNav() {
  const counts = await navCounts();
  const tabKey = ["version", "lab"].includes(current.name) ? (current.name === "version" ? "library" : "lab") : current.name;
  document.querySelectorAll("#tabbar a").forEach(a => a.setAttribute("aria-current", a.dataset.tab === tabKey ? "page" : "false"));
  const dec = document.querySelector('#tabbar a[data-tab="committee"]'); if (dec) dec.dataset.count = counts.committee || "";
  const here = current.name === "version" ? "library" : current.name === "campaign" ? "campaigns" : current.name === "run" ? "agents" : current.name;
  $("#nav").innerHTML = NAV.map(([g, items]) => `<div class="nav-group">${g}</div>` + items.map(([r, label, ck]) => {
    const n = ck ? counts[ck] : 0;
    return `<a class="nav-item" href="#/${r}" ${here === r ? 'aria-current="page"' : ""}><span>${label}</span>${n ? `<span class="count ${counts.hot && counts.hot[ck] ? "hot" : ""}">${n}</span>` : ""}</a>`;
  }).join("")).join("");
}

async function renderTop() {
  const campaigns = await db.all("campaigns");
  const spend = campaigns.reduce((s, c) => s + (c.spend?.costUsd || 0), 0);
  const runs = activeTasks();
  const queued = (await db.all("tasks", t => t.status === "QUEUED")).length;
  $("#topStats").innerHTML = `<span>Running <b>${runs.length}</b></span><span>Queued <b>${queued}</b></span><span>Model spend <b>$${spend.toFixed(2)}</b></span><span>Campaigns active <b>${campaigns.filter(c => c.status === "RUNNING").length}</b></span>`;
  const conn = $("#conn"), key = await db.setting("apikey");
  const t = transport();
  conn.className = "conn " + (t === "claude" || (key && !IN_ARTIFACT) ? "ok" : IN_ARTIFACT ? "off" : "free");
  conn.lastChild.textContent = t === "claude" ? "Claude connected" : IN_ARTIFACT ? "Claude access off" : key ? "API key set" : "Free mode (AI off)";
  conn.title = t === "claude" ? "Running inside Claude: agents use your Claude session" : key ? "Agents call the Anthropic API with your key" : "Add an API key in Policies & Admin";
}

export async function render() {
  if (rendering) { dirty = true; return; }
  rendering = true;
  try {
    const r = parseHash();
    current = r;
    const view = routes[r.name] || routes["404"];
    const el = $("#view");
    const keepScroll = el.dataset.route === location.hash ? el.scrollTop : 0;
    clearCharts();
    let html;
    try { html = await view.render(r.args, r.query); }
    catch (e) { console.error(e); html = `<div class="page"><div class="note bad"><b>Could not render this page.</b> ${esc(e.message)}</div></div>`; }
    el.innerHTML = html;
    el.dataset.route = location.hash;
    el.scrollTop = keepScroll;
    if (view.mount) view.mount(el, r.args, r.query);
    await renderNav();
    await renderTop();
  } finally {
    rendering = false;
    if (dirty) { dirty = false; setTimeout(render, 50); }
  }
}

// Live refresh: re-render on data changes, but never while the user is typing in the page.
let refreshTimer = null;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const a = document.activeElement;
    const typing = a && $("#view").contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName);
    const view = routes[current.name] || {};
    if (!typing && view.live !== false && $("#modalBack").hidden) render();
    else { renderNav(); renderTop(); }
  }, 600);
}

/* Modal */
export function openModal(html, onMount) {
  $("#modal").innerHTML = html;
  $("#modalBack").hidden = false;
  if (onMount) onMount($("#modal"));
  const f = $("#modal").querySelector("input, textarea, select, button");
  if (f) f.focus();
}
export function closeModal() { $("#modalBack").hidden = true; $("#modal").innerHTML = ""; }
$("#modalBack").addEventListener("click", e => { if (e.target.id === "modalBack") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#modalBack").hidden) closeModal(); });

/* Global action delegation: <button data-act="name" data-...> */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  if (el.dataset.confirm && !el.dataset.confirmed) {
    // Browser confirm() is unavailable in artifacts, so confirmations are always in-page.
    openModal(`<h2>Please confirm</h2><p>${esc(el.dataset.confirm)}</p><div class="foot"><button class="btn" data-act="closeModal">Keep it</button><button class="btn danger" id="confirmGo">Confirm</button></div>`, m => {
      m.querySelector("#confirmGo").addEventListener("click", () => { closeModal(); el.dataset.confirmed = "1"; el.click(); delete el.dataset.confirmed; });
    });
    return;
  }
  const prev = el.disabled; el.disabled = true;
  try { await fn(el, el.dataset, { openModal, closeModal, render }); }
  catch (err) { console.error(err); toast(err.message || String(err), "bad"); }
  finally { el.disabled = prev; }
});
document.addEventListener("click", e => { const tr = e.target.closest("tr[data-href]"); if (tr && !e.target.closest("a,button,input")) location.hash = tr.dataset.href; });

/* Theme */
function applyTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
$("#themeBtn").addEventListener("click", async () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const next = dark ? "light" : "dark";
  applyTheme(next); await db.setting("theme", next); render();
});
$("#menuBtn").addEventListener("click", () => document.querySelector(".rail").classList.toggle("open"));
$("#tabMore").addEventListener("click", () => document.querySelector(".rail").classList.toggle("open"));
document.addEventListener("click", e => { const rail = document.querySelector(".rail"); if (rail.classList.contains("open") && !e.target.closest(".rail, #menuBtn, #tabMore")) rail.classList.remove("open"); });
document.querySelector(".rail").addEventListener("click", e => { if (e.target.closest("a")) document.querySelector(".rail").classList.remove("open"); });
$("#pauseBtn").addEventListener("click", async () => {
  const p = !(await db.setting("queuePaused"));
  await db.setting("queuePaused", p); setPaused(p);
  $("#pauseBtn").setAttribute("aria-pressed", String(p)); $("#pauseBtn").textContent = p ? "Resume queue" : "Pause queue";
  toast(p ? "Job queue paused" : "Job queue resumed");
});

async function boot() {
  if (IN_ARTIFACT) { const back = document.querySelector('.rail-foot a[href="../"]'); if (back) back.hidden = true; $("#envBadge").textContent = "Research · paper only · in Claude"; }
  applyTheme(await db.setting("theme"));
  installChartHover(document);
  const persistent = await db.persistent();
  if (!persistent) toast("Browser storage is unavailable: work will be lost when you close this tab.", "bad");
  await connect();
  await recover();
  const paused = !!(await db.setting("queuePaused"));
  setPaused(paused);
  $("#pauseBtn").setAttribute("aria-pressed", String(paused)); $("#pauseBtn").textContent = paused ? "Resume queue" : "Pause queue";
  db.on(() => scheduleRefresh());
  onActivity(m => { if (m.type === "progress") { const p = document.querySelector(`[data-progress="${m.taskId}"]`); if (p) p.textContent = m.msg; } else scheduleRefresh(); });
  window.addEventListener("hashchange", () => { $("#view").scrollTop = 0; render(); });
  let lastW = window.innerWidth, rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(window.innerWidth - lastW) > 60) { lastW = window.innerWidth; render(); } }, 250); });
  await render();
  pump();
  // Claude app: mirror the workspace to the viewer's private cloud space so every device shows the same work.
  if (IN_ARTIFACT) {
    onSync(st => { const el = document.getElementById("syncStatus"); if (el) el.innerHTML = syncText(st); });
    startSync().then(n => {
      if (n) { toast(`Synced ${n} item${n === 1 ? "" : "s"} from your other devices`); render(); }
      pump(); setInterval(pump, 60_000); // picks up tasks left by a device that has since closed
    });
  }
  // Forward deployments refresh every 15 minutes while the page is open.
  if (!IN_ARTIFACT) setInterval(async () => { const { autoCheckDeployments } = await import("./views.js"); autoCheckDeployments(); }, 15 * 60_000);
}
boot();
