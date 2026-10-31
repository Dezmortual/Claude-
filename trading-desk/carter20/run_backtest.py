#!/usr/bin/env python3
"""
run_backtest.py  --  all 20 systems of Thomas Carter's "20 Forex Trading
Strategies (5 Minute Time Frame)" on 5-minute bars, fills on 1-minute bars.

  python3 carter20/run_backtest.py
  python3 carter20/run_backtest.py --systems 7 9 --pairs EURUSD

Each system runs on the pairs the book names for it ("any" = EURUSD, GBPUSD,
USDJPY, AUDUSD), from 2018-02-01 (after a month of warm-up; the book is from
2014) to the last full month HistData has published. Split at 2022-07-01.

Costs: the data are BID prices, so each round trip pays a typical retail
spread plus slippage, in pips: EURUSD 1.0, USDJPY 1.2, AUDUSD 1.3, GBPUSD 1.5,
USDCHF 1.6, GBPJPY 2.8. Results are also shown before costs.

The headline percentage is the return of an account that risks 1% of its
starting balance on every trade (the stop distance sets the size), summed, not
compounded, per year.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import engine                                                       # noqa: E402
import fx_data                                                      # noqa: E402
from systems import NAMES, PAIRS, PEND_BARS, SYSTEMS                # noqa: E402

OUT = Path(__file__).resolve().parent / "out"
COST_PIPS = {"EURUSD": 1.0, "USDJPY": 1.2, "AUDUSD": 1.3, "GBPUSD": 1.5, "USDCHF": 1.6, "GBPJPY": 2.8}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--systems", nargs="+", type=int, default=list(range(1, 21)))
    p.add_argument("--pairs", nargs="+", default=None, help="restrict to these pairs")
    p.add_argument("--start", default="2018-02-01")
    p.add_argument("--split", default="2022-07-01")
    p.add_argument("--cost-scale", type=float, default=1.0, help="multiply the spread table")
    p.add_argument("--out", default=str(OUT))
    return p.parse_args()


def tstat(x) -> float:
    x = np.asarray(x, dtype=float)
    if len(x) < 2 or x.std(ddof=1) == 0:
        return 0.0
    return float(x.mean() / (x.std(ddof=1) / np.sqrt(len(x))))


def score(t: pd.DataFrame, cost_scale: float) -> pd.DataFrame:
    t = t.copy()
    sd = np.where(t["side"] == "long", 1.0, -1.0)
    pipsz = t["pair"].map(lambda p: fx_data.pip(p))
    t["r_gross"] = sd * ((t["exit_a"] + t["exit_b"]) / 2 - t["entry"]) / t["risk"]
    t["pips_gross"] = sd * ((t["exit_a"] + t["exit_b"]) / 2 - t["entry"]) / pipsz
    cost = t["pair"].map(COST_PIPS) * cost_scale
    t["pips_net"] = t["pips_gross"] - cost
    t["risk_pips"] = t["risk"] / pipsz
    t["r_net"] = t["r_gross"] - cost / t["risk_pips"]
    return t


def stats(t: pd.DataFrame, years: float) -> dict:
    if len(t) == 0:
        return {"trades": 0}
    win = t.loc[t["r_net"] > 0, "r_net"].sum()
    loss = -t.loc[t["r_net"] < 0, "r_net"].sum()
    return {"trades": int(len(t)), "per_year": round(len(t) / years, 1),
            "win_pct": round(float((t["r_net"] > 0).mean() * 100), 1),
            "gross_R": round(float(t["r_gross"].mean()), 4), "gross_t": round(tstat(t["r_gross"]), 2),
            "net_R": round(float(t["r_net"].mean()), 4), "net_t": round(tstat(t["r_net"]), 2),
            "net_pips": round(float(t["pips_net"].mean()), 2), "gross_pips": round(float(t["pips_gross"].mean()), 2),
            "risk_pips": round(float(t["risk_pips"].median()), 1),
            "profit_factor": round(float(win / loss), 2) if loss > 0 else None,
            # an account risking 1% of its starting balance per trade, summed (not compounded)
            "pct_per_year": round(float(t["r_net"].sum() / years), 1),
            "gross_pct_per_year": round(float(t["r_gross"].sum() / years), 1)}


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out.mkdir(exist_ok=True)
    t0, cut = pd.Timestamp(args.start, tz="UTC"), pd.Timestamp(args.split, tz="UTC")
    need = sorted({p for s in args.systems for p in PAIRS[s] if args.pairs is None or p in args.pairs})
    data = {}
    for p in need:
        m1 = fx_data.minutes(p, "2018-01-01")
        data[p] = (m1, fx_data.resample(m1, "5min"))
        print("  %s: %d minutes, %s to %s" % (p, len(m1), m1.index[0].date(), m1.index[-1].date()), flush=True)
    end = min(d[0].index[-1] for d in data.values())
    years_all = (end - t0).days / 365.25
    years = {"train": (cut - t0).days / 365.25, "test": (end - cut).days / 365.25}

    rows, amb = [], 0
    for s in args.systems:
        for p in PAIRS[s]:
            if p not in data:
                continue
            m1, x = data[p]
            sig = SYSTEMS[s](x, fx_data.pip(p), p)
            rows += engine.run(x, sig, m1, p, s, t0, PEND_BARS.get(s, 1))
            amb += engine.run.ambiguous
        print("  system %2d done" % s, flush=True)
    t = score(pd.DataFrame(rows), args.cost_scale)
    t.to_csv(out / "trades.csv", index=False)

    summary = {}
    print("\n%-3s %-44s %7s %6s %9s %9s %7s %9s %8s %8s" % ("#", "system", "trades", "win%", "gross R", "net R",
                                                          "t", "%/yr@1%", "train R", "test R"))
    for s in args.systems:
        g = t[t["system"] == s]
        tr, te = g[g["entry_time"] < cut], g[g["entry_time"] >= cut]
        a, b, c = stats(g, years_all), stats(tr, years["train"]), stats(te, years["test"])
        pairs = {p: stats(g[g["pair"] == p], years_all) for p in PAIRS[s] if p in data}
        profitable = (a.get("net_R", -1) > 0 and a.get("net_t", 0) >= 2
                      and b.get("net_R", -1) > 0 and c.get("net_R", -1) > 0)
        summary[s] = {"name": NAMES[s], "pairs": PAIRS[s], "all": a, "train": b, "test": c, "by_pair": pairs,
                      "profitable": bool(profitable)}
        if a["trades"]:
            print("%-3d %-44s %7d %6.1f %+9.3f %+9.3f %7.1f %+9.1f %+8.3f %+8.3f %s"
                  % (s, NAMES[s][:44], a["trades"], a["win_pct"], a["gross_R"], a["net_R"], a["net_t"],
                     a["pct_per_year"], b.get("net_R", np.nan), c.get("net_R", np.nan), "PROFITABLE" if profitable else ""))
        else:
            print("%-3d %-44s       0" % (s, NAMES[s][:44]))
    meta = {"start": args.start, "end": str(end), "split": args.split, "years": years_all,
            "cost_pips": COST_PIPS, "cost_scale": args.cost_scale, "ambiguous_minutes": amb,
            "systems": args.systems, "pairs": args.pairs}
    (out / "summary.json").write_text(json.dumps({"meta": meta, "systems": summary}, indent=1, default=str))
    print("\n%d trades, %s to %s; %d minutes where a stop and a target fell in the same minute (stop taken)"
          % (len(t), args.start, end.date(), amb))
    print("profitable = net R > 0 with t >= 2 over the whole period, and net R > 0 in both halves")
    print("wrote %s" % out)


if __name__ == "__main__":
    main()
