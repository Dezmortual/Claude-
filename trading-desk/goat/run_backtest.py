#!/usr/bin/env python3
"""
run_backtest.py  --  "FX GOAT: NASDAQ Trading Strategy" on the NASDAQ-100.

  python3 goat/run_backtest.py
  python3 goat/run_backtest.py --tf 1h

HistData NSXUSD 1-minute bars (the NASDAQ-100 CFD the notes trade as US100),
2018-02-01 to the latest published month, resampled to 15-minute, 1-hour and
4-hour bars ("take trades on 15 minutes or more"; the examples are hourly).
Entries at bar closes; stops and targets settled on the 1-minute path by the
carter20 engine. Split at 2022-07-01.

Cost: 2 index points per round trip (a typical US100 CFD spread plus
slippage). Results are also shown before costs.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "carter20"))
sys.path.insert(0, str(HERE))

import engine                                                       # noqa: E402
import fx_data                                                      # noqa: E402
from setups import SETUPS                                           # noqa: E402

_spec = importlib.util.spec_from_file_location("c20run", HERE.parent / "carter20" / "run_backtest.py")
_c20 = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_c20)
stats, tstat = _c20.stats, _c20.tstat

OUT = HERE / "out"
SYMBOL = "NSXUSD"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--tf", nargs="+", default=["15min", "1h", "4h"])
    p.add_argument("--setups", nargs="+", default=list(SETUPS))
    p.add_argument("--start", default="2018-02-01")
    p.add_argument("--split", default="2022-07-01")
    p.add_argument("--cost-points", type=float, default=2.0)
    p.add_argument("--out", default=str(OUT))
    return p.parse_args()


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out.mkdir(exist_ok=True)
    t0, cut = pd.Timestamp(args.start, tz="UTC"), pd.Timestamp(args.split, tz="UTC")
    m1 = fx_data.minutes(SYMBOL, "2018-01-01")
    end = m1.index[-1]
    print("  %s: %d minutes, %s to %s" % (SYMBOL, len(m1), m1.index[0].date(), end.date()), flush=True)
    rows = []
    for tf in args.tf:
        x = fx_data.resample(m1, tf)
        for s in args.setups:
            sig = SETUPS[s][1](x)
            for r in engine.run(x, sig, m1, SYMBOL, 0, t0, bar=tf):
                rows.append({"setup": s, "tf": tf, "side": r["side"], "entry_time": r["entry_time"],
                             "exit_time": r["exit_time"], "entry": r["entry"], "stop": r["stop"], "target": r["target"],
                             "exit": r["exit_a"], "reason": r["why_a"], "bars": r["bars"]})
            print("  %s %s done" % (tf, s), flush=True)
    t = pd.DataFrame(rows)
    sd = np.where(t["side"] == "long", 1.0, -1.0)
    t["risk_pips"] = (t["entry"] - t["stop"]).abs()                 # index points
    t["pips_gross"] = sd * (t["exit"] - t["entry"])
    t["pips_net"] = t["pips_gross"] - args.cost_points
    t["r_gross"] = t["pips_gross"] / t["risk_pips"]
    t["r_net"] = t["pips_net"] / t["risk_pips"]
    t.to_csv(out / "trades.csv", index=False)

    years = (end - t0).days / 365.25
    ytr, yte = (cut - t0).days / 365.25, (end - cut).days / 365.25
    summary = {}
    print("\n%-38s %-6s %7s %6s %9s %9s %7s %8s %8s %9s" % ("setup", "tf", "trades", "win%", "gross R", "net R", "t",
                                                         "train R", "test R", "account"))
    for s in args.setups:
        for tf in args.tf:
            g = t[(t["setup"] == s) & (t["tf"] == tf)].sort_values("exit_time")
            if len(g) == 0:
                continue
            a = stats(g, years)
            b, c = stats(g[g["entry_time"] < cut], ytr), stats(g[g["entry_time"] >= cut], yte)
            acct = float(np.prod(1 + 0.01 * g["r_net"].clip(lower=-100).to_numpy()) - 1) * 100
            acct_g = float(np.prod(1 + 0.01 * g["r_gross"].clip(lower=-100).to_numpy()) - 1) * 100
            profitable = a["net_R"] > 0 and a["net_t"] >= 2 and b.get("net_R", -1) > 0 and c.get("net_R", -1) > 0
            summary["%s_%s" % (s, tf)] = {"setup": s, "name": SETUPS[s][0], "tf": tf, "all": a, "train": b, "test": c,
                                          "account_pct": round(acct, 1), "account_gross_pct": round(acct_g, 1),
                                          "long": stats(g[g["side"] == "long"], years),
                                          "short": stats(g[g["side"] == "short"], years),
                                          "profitable": bool(profitable)}
            print("%-38s %-6s %7d %6.1f %+9.3f %+9.3f %7.1f %+8.3f %+8.3f %+8.1f%% %s"
                  % (SETUPS[s][0][:38], tf, a["trades"], a["win_pct"], a["gross_R"], a["net_R"], a["net_t"],
                     b.get("net_R", np.nan), c.get("net_R", np.nan), acct, "PROFITABLE" if profitable else ""))
    meta = {"symbol": SYMBOL, "start": args.start, "end": str(end), "split": args.split, "years": years,
            "cost_points": args.cost_points}
    (out / "summary.json").write_text(json.dumps({"meta": meta, "runs": summary}, indent=1, default=str))
    print("\nprofitable = net R > 0 with t >= 2 over the whole period, and net R > 0 in both halves")
    print("wrote %s" % out)


if __name__ == "__main__":
    main()
