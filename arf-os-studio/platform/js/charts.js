// Dependency-free SVG charts with hover tooltips. Colors come from CSS tokens (--s1.., --band-*),
// so light/dark themes swap in one place. Every chart is one y-axis; legends appear for ≥ 2 series.

import { esc, fmt, isoDate, isoMinute } from "./ui-util.js";

const registry = new Map();
let nextId = 0;

// Render at roughly the on-screen width so 11px labels stay 11px (no viewBox shrink on phones).
export function chartWidth(half = false) {
  if (typeof window === "undefined") return 900;
  const vw = window.innerWidth;
  const full = vw < 800 ? vw - 66 : Math.min(1360, vw - 310);
  return Math.max(300, Math.round(half && vw >= 1100 ? full / 2 - 40 : full));
}

function niceTicks(min, max, n = 5) {
  if (!(max > min)) { max = min + 1; }
  const span = max - min, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n) || 10 * mag;
  const out = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function timeTicks(t0, t1, n = 6) {
  const out = [], step = (t1 - t0) / n;
  for (let i = 0; i <= n; i++) out.push(t0 + i * step);
  return out;
}

/**
 * Line chart over time. series: [{name, points:[[t,v],...], slot (1-8), area?}], bands: [{from,to,label,kind}]
 */
export function lineChart({ series, bands = [], height = 260, yFmt = v => fmt(v, 0), title = "", zero = false, timeFmt = isoDate, desc = "", half = false }) {
  const id = "c" + (++nextId);
  const W = chartWidth(half), H = height, m = { l: 64, r: 16, t: 14, b: 28 };
  const all = series.flatMap(s => s.points);
  if (!all.length) return `<div class="chart-empty">No data</div>`;
  let t0 = Math.min(...all.map(p => p[0])), t1 = Math.max(...all.map(p => p[0]));
  if (t1 === t0) t1 = t0 + 1;
  let y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
  if (zero) { y0 = Math.min(0, y0); y1 = Math.max(0, y1); }
  const pad = (y1 - y0) * 0.06 || 1; y0 -= pad; y1 += pad;
  const x = t => m.l + ((t - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = v => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const yt = niceTicks(y0, y1);
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" data-chart="${id}" role="img" aria-label="${esc(title || "chart")}">`;
  if (desc) svg += `<desc>${esc(desc)}</desc>`;
  for (const b of bands) {
    const bx0 = x(Math.max(t0, b.from)), bx1 = x(Math.min(t1, b.to));
    if (bx1 <= bx0) continue;
    svg += `<rect class="band band-${b.kind}" x="${bx0}" y="${m.t}" width="${bx1 - bx0}" height="${H - m.t - m.b}"/>${bx1 - bx0 > b.label.length * 7 + 12 ? `<text class="band-label" x="${bx0 + 6}" y="${m.t + 13}">${esc(b.label)}</text>` : ""}`;
  }
  for (const v of yt) svg += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(yFmt(v))}</text>`;
  if (zero && y0 < 0 && y1 > 0) svg += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  const tts = timeTicks(t0, t1, Math.max(2, Math.min(6, Math.floor(W / 140))));
  tts.forEach((t, k) => { svg += `<text class="tick" x="${x(t)}" y="${H - 8}" text-anchor="${k === 0 ? "start" : k === tts.length - 1 ? "end" : "middle"}">${esc(isoDate(t))}</text>`; });
  series.forEach((s, i) => {
    const slot = s.slot || i + 1;
    const pts = thin(s.points, 1200);
    const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    if (s.area) svg += `<path class="area s${slot}" d="${d}L${x(pts[pts.length - 1][0])},${y(Math.max(y0, Math.min(0, y1)))}L${x(pts[0][0])},${y(Math.max(y0, Math.min(0, y1)))}Z"/>`;
    svg += `<path class="line s${slot}" d="${d}"/>`;
  });
  svg += `<line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/><rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></svg>`;
  registry.set(id, { kind: "line", series, x, t0, t1, W, m, yFmt, timeFmt });
  const legend = series.length > 1 ? `<div class="legend">${series.map((s, i) => `<span><i class="sw s${s.slot || i + 1}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
  return `<figure class="chart-wrap">${title ? `<figcaption>${esc(title)}</figcaption>` : ""}${legend}<div class="chart-box">${svg}<div class="tip" hidden></div></div></figure>`;
}
function thin(points, max) {
  if (points.length <= max) return points;
  const step = points.length / max, out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.floor(i * step)]);
  out.push(points[points.length - 1]);
  return out;
}

/** Vertical bars, one series (slot 1) or signed (positive slot 1 / negative slot 8). */
export function barChart({ bars, height = 200, yFmt = v => fmt(v, 0), title = "", signed = false, half = false }) {
  const id = "c" + (++nextId);
  if (!bars.length) return `<div class="chart-empty">No data</div>`;
  const W = chartWidth(half), H = height, m = { l: 64, r: 16, t: 12, b: 34 };
  let y0 = Math.min(0, ...bars.map(b => b.value)), y1 = Math.max(0, ...bars.map(b => b.value));
  if (y0 === y1) y1 = y0 + 1;
  const pad = (y1 - y0) * 0.08; y1 += pad; if (y0 < 0) y0 -= pad;
  const y = v => m.t + (1 - (v - y0) / (y1 - y0)) * (H - m.t - m.b);
  const slotW = (W - m.l - m.r) / bars.length, bw = Math.min(slotW, 48), off = (slotW - bw) / 2;
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" data-chart="${id}" role="img" aria-label="${esc(title)}">`;
  for (const v of niceTicks(y0, y1, 4)) svg += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${esc(yFmt(v))}</text>`;
  svg += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  bars.forEach((b, i) => {
    const x0 = m.l + i * slotW + off + Math.min(1, bw * 0.05), w = Math.max(1, bw - Math.min(2, bw * 0.1));
    const top = y(Math.max(0, b.value)), h = Math.abs(y(b.value) - y(0));
    const cls = signed ? (b.value >= 0 ? "s1" : "neg") : "s" + (b.slot || 1);
    svg += `<rect class="bar ${cls}" data-i="${i}" x="${x0}" y="${top}" width="${w}" height="${Math.max(1, h)}" rx="${Math.min(4, w / 3)}"/>`;
    if (bars.length <= Math.floor(W / 46)) svg += `<text class="tick" x="${x0 + w / 2}" y="${H - 14}" text-anchor="middle">${esc(b.label)}</text>`;
  });
  svg += `</svg>`;
  registry.set(id, { kind: "bar", bars, yFmt });
  return `<figure class="chart-wrap">${title ? `<figcaption>${esc(title)}</figcaption>` : ""}<div class="chart-box">${svg}<div class="tip" hidden></div></div></figure>`;
}

/** Heatmap; diverging around `mid` (blue ↔ red with gray midpoint) or sequential blue. */
export function heatmap({ rows, cols, values, fmtv = v => fmt(v, 2), title = "", mid = null, rowTitle = "", colTitle = "" }) {
  const id = "c" + (++nextId);
  const flat = values.flat().filter(v => v !== null && Number.isFinite(v));
  if (!flat.length) return `<div class="chart-empty">No data</div>`;
  const lo = Math.min(...flat), hi = Math.max(...flat);
  const cell = (v) => {
    if (v === null || !Number.isFinite(v)) return "var(--cell-empty)";
    if (mid === null) { const k = (v - lo) / ((hi - lo) || 1); return `color-mix(in oklab, var(--seq-hi) ${Math.round(15 + k * 85)}%, var(--seq-lo))`; }
    const span = Math.max(hi - mid, mid - lo) || 1, k = (v - mid) / span;
    return k >= 0 ? `color-mix(in oklab, var(--div-pos) ${Math.round(Math.abs(k) * 100)}%, var(--div-mid))` : `color-mix(in oklab, var(--div-neg) ${Math.round(Math.abs(k) * 100)}%, var(--div-mid))`;
  };
  let html = `<figure class="chart-wrap">${title ? `<figcaption>${esc(title)}</figcaption>` : ""}<div class="heat-scroll"><table class="heat" data-chart="${id}"><thead><tr><th class="corner">${esc(rowTitle)}${colTitle ? ` \\ ${esc(colTitle)}` : ""}</th>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>`;
  rows.forEach((r, i) => {
    html += `<tr><th>${esc(r)}</th>${cols.map((c, j) => { const v = values[i][j]; return `<td style="background:${cell(v)}" title="${esc(r)} / ${esc(c)}: ${v === null ? "n/a" : esc(fmtv(v))}"><span>${v === null ? "" : esc(fmtv(v))}</span></td>`; }).join("")}</tr>`;
  });
  html += `</tbody></table></div></figure>`;
  return html;
}

/** Monte Carlo fan: percentile bands of equity paths by trade number. */
export function fanChart({ fan, height = 240, title = "", half = false }) {
  if (!fan || !fan.length) return `<div class="chart-empty">No data</div>`;
  const id = "c" + (++nextId);
  const W = chartWidth(half), H = height, m = { l: 64, r: 16, t: 12, b: 28 };
  const y0 = Math.min(...fan.map(f => f.p05)), y1 = Math.max(...fan.map(f => f.p95));
  const x = i => m.l + ((i - 1) / Math.max(1, fan.length - 1)) * (W - m.l - m.r);
  const y = v => m.t + (1 - (v - y0) / ((y1 - y0) || 1)) * (H - m.t - m.b);
  const area = (lo, hi) => fan.map((f, k) => `${k ? "L" : "M"}${x(f.i)},${y(f[hi])}`).join("") + [...fan].reverse().map(f => `L${x(f.i)},${y(f[lo])}`).join("") + "Z";
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" data-chart="${id}" role="img" aria-label="${esc(title)}">`;
  for (const v of niceTicks(y0, y1, 4)) svg += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`;
  svg += `<path class="fan outer" d="${area("p05", "p95")}"/><path class="fan inner" d="${area("p25", "p75")}"/>`;
  svg += `<path class="line s1" d="${fan.map((f, k) => `${k ? "L" : "M"}${x(f.i)},${y(f.p50)}`).join("")}"/>`;
  svg += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${y(100)}" y2="${y(100)}"/>`;
  for (const t of niceTicks(1, fan.length, 6)) if (t >= 1) svg += `<text class="tick" x="${x(t)}" y="${H - 8}" text-anchor="middle">${t}</text>`;
  svg += `<line class="crosshair" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/><rect class="hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}"/></svg>`;
  registry.set(id, { kind: "fan", fan, x, W, m });
  return `<figure class="chart-wrap">${title ? `<figcaption>${esc(title)}</figcaption>` : ""}<div class="legend"><span><i class="sw s1"></i>Median path</span><span><i class="sw fan-inner"></i>25–75%</span><span><i class="sw fan-outer"></i>5–95%</span></div><div class="chart-box">${svg}<div class="tip" hidden></div></div></figure>`;
}

/* ---------------- Hover layer (delegated) ---------------- */
export function installChartHover(root = document) {
  root.addEventListener("pointermove", e => {
    const svg = e.target.closest && e.target.closest("svg.chart");
    if (!svg) return;
    const c = registry.get(svg.dataset.chart); if (!c) return;
    const box = svg.parentElement, tip = box.querySelector(".tip");
    const r = svg.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * (c.W || r.width);
    let html = "";
    if (c.kind === "line") {
      const t = c.t0 + ((vx - c.m.l) / (c.W - c.m.l - c.m.r)) * (c.t1 - c.t0);
      if (t < c.t0 || t > c.t1) return hide(svg, tip);
      const rows = c.series.map((s, i) => { const p = nearest(s.points, t); return p ? `<div><i class="sw s${s.slot || i + 1}"></i>${esc(s.name)} <b>${esc(c.yFmt(p[1]))}</b></div>` : ""; }).join("");
      const p0 = nearest(c.series[0].points, t);
      html = `<div class="tip-t">${esc(c.timeFmt(p0 ? p0[0] : t))}</div>${rows}`;
      moveCross(svg, c.x(p0 ? p0[0] : t));
    } else if (c.kind === "fan") {
      const i = Math.round(1 + ((vx - c.m.l) / (c.W - c.m.l - c.m.r)) * (c.fan.length - 1));
      const f = c.fan[Math.max(0, Math.min(c.fan.length - 1, i - 1))];
      html = `<div class="tip-t">Trade ${f.i}</div><div>Median <b>${fmt(f.p50, 1)}</b></div><div>25–75% <b>${fmt(f.p25, 1)} – ${fmt(f.p75, 1)}</b></div><div>5–95% <b>${fmt(f.p05, 1)} – ${fmt(f.p95, 1)}</b></div>`;
      moveCross(svg, c.x(f.i));
    } else if (c.kind === "bar") {
      const rect = e.target.closest("rect.bar"); if (!rect) return hide(svg, tip);
      const b = c.bars[+rect.dataset.i];
      html = `<div class="tip-t">${esc(b.tip || b.label)}</div><div><b>${esc(c.yFmt(b.value))}</b></div>`;
    }
    tip.innerHTML = html; tip.hidden = false;
    const bx = e.clientX - box.getBoundingClientRect().left;
    tip.style.left = Math.min(box.clientWidth - tip.offsetWidth - 4, Math.max(4, bx + 14)) + "px";
    tip.style.top = "8px";
  });
  root.addEventListener("pointerleave", e => { const svg = e.target.closest && e.target.closest("svg.chart"); if (svg) hide(svg, svg.parentElement.querySelector(".tip")); }, true);
}
function hide(svg, tip) { if (tip) tip.hidden = true; const ch = svg.querySelector(".crosshair"); if (ch) ch.setAttribute("visibility", "hidden"); }
function moveCross(svg, px) { const ch = svg.querySelector(".crosshair"); if (ch) { ch.setAttribute("x1", px); ch.setAttribute("x2", px); ch.setAttribute("visibility", "visible"); } }
function nearest(points, t) {
  if (!points.length) return null;
  let lo = 0, hi = points.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (points[mid][0] < t) lo = mid; else hi = mid; }
  return Math.abs(points[lo][0] - t) <= Math.abs(points[hi][0] - t) ? points[lo] : points[hi];
}
export const clearCharts = () => registry.clear();
export { isoMinute };
