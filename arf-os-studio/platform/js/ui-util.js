// DOM-side helpers shared by views and charts.
export { fmt, pct, isoDate, isoMinute } from "./util.js";

export function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let toastTimer;
export function toast(text, kind = "") {
  const el = document.getElementById("toast");
  el.textContent = text; el.className = "toast " + kind; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), kind === "bad" ? 6000 : 2600);
}

// Small, safe Markdown renderer (escapes first, then formats). Used for agent prose fields.
export function md(src) {
  const inline = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return String(src ?? "").split(/\n{2,}/).map(p => {
    if (/^\s*[-*] /.test(p)) return "<ul>" + p.split("\n").filter(l => l.trim()).map(l => `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`).join("") + "</ul>";
    return `<p>${inline(p).replace(/\n/g, "<br>")}</p>`;
  }).join("");
}

export function timeAgo(iso) {
  if (!iso) return "—";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  return Math.floor(s / 86400) + "d ago";
}

// Inside a Claude artifact the page cannot reach other sites, start downloads or show browser dialogs.
export const IN_ARTIFACT = typeof window !== "undefined" && (!!(window.claude && typeof window.claude.use === "function") || /claudeusercontent|claude\.ai/.test(location.hostname));

let dl;
export async function download(name, text, type = "text/plain") {
  if (IN_ARTIFACT) {
    if (dl === undefined) { try { dl = await window.claude.use("downloads"); } catch (_) { dl = null; } }
    if (!dl) return toast("Saving files is not available in this view.", "bad");
    try { const r = await dl.save({ filename: name, data: new Blob([text], { type }) }); if (r.status === "saved") toast("Saved " + name); }
    catch (e) { if (e.code !== "cancelled" && e.code !== "declined") toast("Could not save: " + (e.message || e.code), "bad"); }
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied"); }
  catch (_) { toast("Copy failed — select and copy manually", "bad"); }
}

export function readFile(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); });
}
