// Daily 10-year government bond yields from each issuer's own statistics, no keys needed: the US Treasury's daily par
// yield curve, the Bundesbank's term structure of listed federal securities (Svensson method) and the Bank of
// England's 10-year nominal par gilt yield. One value per working day, so bars are flat and there is no intraday data.
import type { Bar } from "../types";
import { getText } from "./http";

export type YieldSeries = "US10Y" | "DE10Y" | "GB10Y";

export const YIELD_LABEL: Record<YieldSeries, string> = {
  US10Y: "U.S. Treasury daily par yield curve, 10-year (official, daily)",
  DE10Y: "Deutsche Bundesbank yield curve, 10-year federal securities (official, daily)",
  GB10Y: "Bank of England 10-year nominal par gilt yield (official, daily, about two days behind)",
};

const flat = (ts: number, v: number): Bar => ({ ts, o: v, h: v, l: v, c: v, v: 0 });
const DAY = 86_400_000;

async function treasury(from: Date): Promise<Bar[]> {
  const out: Bar[] = [];
  for (let y = from.getUTCFullYear(); y <= new Date().getUTCFullYear(); y++) {
    const csv = await getText(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`);
    const [head, ...lines] = csv.trim().split(/\r?\n/);
    const col = head.split(",").map((c) => c.replace(/"/g, "")).indexOf("10 Yr");
    if (col < 0) throw new Error("treasury: no 10 Yr column");
    for (const line of lines) {
      const cells = line.split(",");
      const [m, d, yy] = cells[0].split("/").map(Number);
      const v = Number(cells[col]);
      if (Number.isFinite(v) && v > 0) out.push(flat(Date.UTC(yy, m - 1, d), v));
    }
  }
  return out;
}

async function bundesbank(from: Date): Promise<Bar[]> {
  const csv = await getText(`https://api.statistiken.bundesbank.de/rest/data/BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A?startPeriod=${from.toISOString().slice(0, 10)}`,
    { Accept: "application/vnd.sdmx.data+csv;version=1.0.0" });
  const rows = csv.replace(/^﻿/, "").trim().split(/\r?\n/).map((l) => l.split(";"));
  const t = rows[0].indexOf("TIME_PERIOD"), o = rows[0].indexOf("OBS_VALUE");
  if (t < 0 || o < 0) throw new Error("bundesbank: unexpected columns");
  return rows.slice(1).flatMap((r) => {
    const v = Number(r[o]); // "." marks days with no value
    return r[o] && r[o] !== "." && Number.isFinite(v) ? [flat(Date.parse(`${r[t]}T00:00:00Z`), v)] : [];
  });
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function bankOfEngland(from: Date): Promise<Bar[]> {
  const f = `${String(from.getUTCDate()).padStart(2, "0")}/${MON[from.getUTCMonth()]}/${from.getUTCFullYear()}`;
  const csv = await getText(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${f}&Dateto=now&SeriesCodes=IUDMNPY&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`,
    { "User-Agent": "Mozilla/5.0 (compatible; forecast-app)" });
  return csv.trim().split(/\r?\n/).slice(1).flatMap((line) => {
    const [date, value] = line.split(",");
    const ts = Date.parse(`${date} UTC`), v = Number(value);
    return Number.isFinite(ts) && Number.isFinite(v) && v > 0 ? [flat(ts, v)] : [];
  });
}

/** Daily closes since `since` (or about `days` back), oldest first. */
export async function yieldDaily(series: YieldSeries, since: number | null, days: number): Promise<Bar[]> {
  const from = new Date(since ?? Date.now() - days * DAY);
  const bars = await (series === "US10Y" ? treasury(from) : series === "DE10Y" ? bundesbank(from) : bankOfEngland(from));
  return bars.filter((b) => b.ts >= from.getTime()).sort((a, b) => a.ts - b.ts);
}
