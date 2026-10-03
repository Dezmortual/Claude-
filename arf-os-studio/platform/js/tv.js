// TradingView Strategy Report ingestion (List of Trades CSV) and local/TradingView parity (spec §13).

import { parseTime } from "./data.js";
import { median } from "./util.js";

export const PARITY_TOLERANCE = { version: "parity/1.0.0", minMatchedPct: 95, maxCountDiffPct: 5, maxCountDiffAbs: 2, entryTimeBars: 0, priceTicks: 3, netPct: 10 };

function splitCsvLine(line, delim) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

export function parseTradingViewTrades(text) {
  const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 3) throw new Error("File has no trades");
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const head = splitCsvLine(lines[0], delim).map(h => h.toLowerCase());
  const find = (...res) => head.findIndex(h => res.some(r => r.test(h)));
  const iNo = find(/^trade\s*#/, /^trade number/), iType = find(/^type$/), iTime = find(/^date/, /time/);
  const iPrice = find(/^price/), iQty = find(/contracts/, /position size \(qty\)/, /^qty/, /quantity/, /^size/);
  const iPnl = find(/^net p&l(?!.*%)/, /^profit(?!.*%)/, /^p&l(?!.*%)/), iSignal = find(/^signal/);
  if ([iNo, iType, iTime, iPrice].some(i => i < 0)) throw new Error("Not a TradingView List of Trades export: need Trade #, Type, Date/Time and Price columns");
  const byNo = new Map();
  const warnings = [];
  for (let k = 1; k < lines.length; k++) {
    const f = splitCsvLine(lines[k], delim);
    const no = +f[iNo]; if (!Number.isFinite(no)) continue;
    const type = (f[iType] || "").toLowerCase();
    const t = parseTime(f[iTime]);
    if (!Number.isFinite(t)) { warnings.push(`Row ${k + 1}: unreadable time "${f[iTime]}"`); continue; }
    const rec = byNo.get(no) || { id: no };
    const price = +String(f[iPrice]).replace(/[^\d.\-eE]/g, "");
    if (type.startsWith("entry")) { rec.dir = type.includes("short") ? "short" : "long"; rec.entryTime = t; rec.entryPrice = price; rec.entrySignal = iSignal >= 0 ? f[iSignal] : ""; }
    else if (type.startsWith("exit")) { rec.exitTime = t; rec.exitPrice = price; rec.exitSignal = iSignal >= 0 ? f[iSignal] : ""; if (!rec.dir) rec.dir = type.includes("short") ? "short" : "long"; }
    if (iQty >= 0 && f[iQty] !== "") rec.qty = +String(f[iQty]).replace(/[^\d.\-eE]/g, "");
    if (iPnl >= 0 && f[iPnl] !== "") { const p = +String(f[iPnl]).replace(/[^\d.\-eE]/g, ""); if (Number.isFinite(p)) rec.net = p; }
    byNo.set(no, rec);
  }
  const trades = [...byNo.values()].filter(t => t.entryTime && t.exitTime).sort((a, b) => a.entryTime - b.entryTime);
  const open = [...byNo.values()].filter(t => t.entryTime && !t.exitTime).length;
  if (open) warnings.push(`${open} open trade(s) ignored`);
  for (const t of trades) { if (t.net === undefined) t.net = (t.dir === "long" ? 1 : -1) * (t.exitPrice - t.entryPrice) * (t.qty || 1); t.fees = 0; }
  const ids = trades.map(t => t.id); const dupIds = ids.length - new Set(ids).size;
  if (dupIds) warnings.push(`${dupIds} duplicate trade numbers`);
  const outOfOrder = trades.filter(t => t.exitTime < t.entryTime).length;
  if (outOfOrder) warnings.push(`${outOfOrder} trades exit before they enter`);
  return { trades, warnings, columns: head };
}

export function parity(localTrades, tvTrades, { tfMs, tickSize, slippageTicks = 0 }, tol = PARITY_TOLERANCE) {
  if (!tvTrades.length || !localTrades.length) return { status: "FAIL", reason: "One side has no trades", tolerance: tol };
  const from = Math.max(localTrades[0].entryTime, tvTrades[0].entryTime);
  const to = Math.min(localTrades[localTrades.length - 1].entryTime, tvTrades[tvTrades.length - 1].entryTime);
  const L = localTrades.filter(t => t.entryTime >= from && t.entryTime <= to);
  const T = tvTrades.filter(t => t.entryTime >= from && t.entryTime <= to);
  const used = new Set(), pairs = [];
  for (const a of L) {
    let best = -1, bestD = Infinity;
    T.forEach((b, j) => { if (used.has(j) || b.dir !== a.dir) return; const d = Math.abs(b.entryTime - a.entryTime); if (d < bestD) { bestD = d; best = j; } });
    if (best >= 0 && bestD <= tfMs * (tol.entryTimeBars + 0.5)) { used.add(best); pairs.push([a, T[best]]); }
  }
  const ticks = x => Math.abs(x) / tickSize;
  const entryDiff = pairs.map(([a, b]) => ticks(a.entryPrice - b.entryPrice));
  const exitDiff = pairs.map(([a, b]) => ticks(a.exitPrice - b.exitPrice));
  const exitTimeExact = pairs.filter(([a, b]) => Math.abs(a.exitTime - b.exitTime) < tfMs / 2).length;
  const matchedPct = (pairs.length / Math.max(L.length, T.length)) * 100;
  const countDiff = Math.abs(L.length - T.length);
  const netL = L.reduce((s, t) => s + t.net, 0), netT = T.reduce((s, t) => s + t.net, 0);
  const priceTol = tol.priceTicks + slippageTicks;
  const checks = [
    { name: "Matched trades", value: matchedPct, pass: matchedPct >= tol.minMatchedPct, detail: `${pairs.length} of ${Math.max(L.length, T.length)} (≥ ${tol.minMatchedPct}%)` },
    { name: "Trade count", value: countDiff, pass: countDiff <= Math.max(tol.maxCountDiffAbs, (Math.max(L.length, T.length) * tol.maxCountDiffPct) / 100), detail: `local ${L.length}, TradingView ${T.length}` },
    { name: "Entry price (median ticks)", value: median(entryDiff), pass: median(entryDiff) <= priceTol, detail: `max ${Math.max(0, ...entryDiff).toFixed(1)} ticks; tolerance ${priceTol}` },
    { name: "Exit price (median ticks)", value: median(exitDiff), pass: median(exitDiff) <= priceTol, detail: `max ${Math.max(0, ...exitDiff).toFixed(1)} ticks` },
    { name: "Exit timestamp match", value: pairs.length ? (exitTimeExact / pairs.length) * 100 : 0, pass: pairs.length ? exitTimeExact / pairs.length >= 0.9 : false, detail: `${exitTimeExact} of ${pairs.length} exits on the same bar` },
    { name: "Net P&L sign agreement", value: null, pass: Math.sign(netL) === Math.sign(netT), detail: `local ${netL.toFixed(2)}, TradingView ${netT.toFixed(2)} (sizes may differ)` }
  ];
  return {
    status: checks.every(c => c.pass) ? "PASS" : "FAIL", tolerance: tol, window: { from, to }, checks,
    unmatchedLocal: L.filter(a => !pairs.some(p => p[0] === a)).slice(0, 50).map(t => ({ dir: t.dir, entryTime: t.entryTime, entryPrice: t.entryPrice })),
    unmatchedTv: T.filter((b, j) => !used.has(j)).slice(0, 50).map(t => ({ dir: t.dir, entryTime: t.entryTime, entryPrice: t.entryPrice }))
  };
}
