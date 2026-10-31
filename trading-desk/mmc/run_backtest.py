#!/usr/bin/env python3
"""
run_backtest.py  --  the "MMC Footprint" notes' setups on six forex pairs.

  python3 mmc/run_backtest.py
  python3 mmc/run_backtest.py --tf 1h --pairs EURUSD

Same data, costs and fill engine as carter20/: HistData 1-minute BID bars from
2018, resampled to 15-minute, 1-hour and 4-hour bars (the notes say any
timeframe works); entries at bar closes, stops and targets on the 1-minute path.
Split at 2022-07-01.

Systems (setups.py, footprint.py):
  2b         2B false breakout with pokebar, 2R target
  2b_gated   the same, only in the direction of the daily 50-EMA trend
  div        RSI divergence at the second swing, 2R target
  footprint  trendline + previous-high break, adding units while in profit,
             one trailing stop, no target (every unit is a row)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "carter20"))

import engine                                                       # noqa: E402
import footprint                                                    # noqa: E402
import fx_data                                                      # noqa: E402
import importlib.util                                               # noqa: E402
_spec = importlib.util.spec_from_file_location("c20run", HERE.parent / "carter20" / "run_backtest.py")
_c20 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_c20)
COST_PIPS, stats, tstat = _c20.COST_PIPS, _c20.stats, _c20.tstat
from setups import s2b, sdiv                                        # noqa: E402

OUT = HERE / "out"
PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "GBPJPY"]
NAMES = {"2b": "2B false breakout + pokebar", "2b_gated": "2B with the daily trend",
         "div": "RSI divergence, 2nd swing", "footprint": "MMC footprint + leverage"}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--tf", nargs="+", default=["15min", "1h", "4h"])
    p.add_argument("--pairs", nargs="+", default=PAIRS)
    p.add_argument("--systems", nargs="+", default=list(NAMES))
    p.add_argument("--start", default="2018-02-01")
    p.add_argument("--split", default="2022-07-01")
    p.add_argument("--out", default=str(OUT))
    return p.parse_args()


def score(t: pd.DataFrame) -> pd.DataFrame:
    t = t.copy()
    sd = np.where(t["side"] == "long", 1.0, -1.0)
    pipsz = t["pair"].map(fx_data.pip)
    t["risk_pips"] = (t["entry"] - t["stop"]).abs() / pipsz
    t["pips_gross"] = sd * (t["exit"] - t["entry"]) / pipsz
    t["pips_net"] = t["pips_gross"] - t["pair"].map(COST_PIPS)
    t["r_gross"] = t["pips_gross"] / t["risk_pips"]
    t["r_net"] = t["pips_net"] / t["risk_pips"]
    return t


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out.mkdir(exist_ok=True)
    t0, cut = pd.Timestamp(args.start, tz="UTC"), pd.Timestamp(args.split, tz="UTC")
    rows = []
    for p in args.pairs:
        m1 = fx_data.minutes(p, "2018-01-01")
        for tf in args.tf:
            x = fx_data.resample(m1, tf)
            for s in args.systems:
                if s == "footprint":
                    tr = footprint.run(x, p, t0)
                    for r in tr:
                        r["system"], r["tf"] = s, tf
                    rows += tr
                    continue
                sig = s2b(x, gated=(s == "2b_gated")) if s.startswith("2b") else sdiv(x)
                for r in engine.run(x, sig, m1, p, 0, t0, bar=tf):
                    # both halves are the same trade here (no split exit)
                    rows.append({"pair": p, "system": s, "tf": tf, "side": r["side"], "entry_time": r["entry_time"],
                                 "exit_time": r["exit_time"], "entry": r["entry"], "stop": r["stop"],
                                 "exit": r["exit_a"], "reason": r["why_a"], "bars": r["bars"], "target": r["target"]})
        end = m1.index[-1]
        print("  %s done" % p, flush=True)
    t = score(pd.DataFrame(rows))
    t["entry_time"] = pd.to_datetime(t["entry_time"], utc=True)
    t["exit_time"] = pd.to_datetime(t["exit_time"], utc=True)
    t.to_csv(out / "trades.csv", index=False)

    years = (end - t0).days / 365.25
    ytr, yte = (cut - t0).days / 365.25, (end - cut).days / 365.25
    summary = {}
    print("\n%-28s %-6s %7s %6s %9s %9s %7s %8s %8s %9s" % ("system", "tf", "trades", "win%", "gross R", "net R", "t",
                                                         "train R", "test R", "account"))
    for s in args.systems:
        for tf in args.tf:
            g = t[(t["system"] == s) & (t["tf"] == tf)].sort_values("exit_time")
            if len(g) == 0:
                continue
            a = stats(g, years)
            b, c = stats(g[g["entry_time"] < cut], ytr), stats(g[g["entry_time"] >= cut], yte)
            acct = float(np.prod(1 + 0.01 * g["r_net"].clip(lower=-100).to_numpy()) - 1) * 100
            acct_g = float(np.prod(1 + 0.01 * g["r_gross"].clip(lower=-100).to_numpy()) - 1) * 100
            profitable = a["net_R"] > 0 and a["net_t"] >= 2 and b.get("net_R", -1) > 0 and c.get("net_R", -1) > 0
            key = "%s_%s" % (s, tf)
            summary[key] = {"system": s, "name": NAMES[s], "tf": tf, "all": a, "train": b, "test": c,
                            "account_pct": round(acct, 1), "account_gross_pct": round(acct_g, 1),
                            "by_pair": {p: stats(g[g["pair"] == p], years) for p in args.pairs},
                            "profitable": bool(profitable)}
            if s == "footprint":
                camp = g.groupby(["pair", "campaign"]).agg(units=("unit", "size"), r=("r_net", "sum"), rg=("r_gross", "sum"))
                summary[key]["campaigns"] = {"n": int(len(camp)), "mean_units": round(float(camp["units"].mean()), 2),
                                             "net_R": round(float(camp["r"].mean()), 3), "net_t": round(tstat(camp["r"]), 2),
                                             "gross_R": round(float(camp["rg"].mean()), 3),
                                             "win_pct": round(float((camp["r"] > 0).mean() * 100), 1)}
            print("%-28s %-6s %7d %6.1f %+9.3f %+9.3f %7.1f %+8.3f %+8.3f %+8.1f%% %s"
                  % (NAMES[s][:28], tf, a["trades"], a["win_pct"], a["gross_R"], a["net_R"], a["net_t"],
                     b.get("net_R", np.nan), c.get("net_R", np.nan), acct, "PROFITABLE" if profitable else ""))
    meta = {"start": args.start, "end": str(end), "split": args.split, "years": years, "cost_pips": COST_PIPS}
    (out / "summary.json").write_text(json.dumps({"meta": meta, "runs": summary}, indent=1, default=str))
    print("\nprofitable = net R > 0 with t >= 2 over the whole period, and net R > 0 in both halves")
    print("wrote %s" % out)


if __name__ == "__main__":
    main()
