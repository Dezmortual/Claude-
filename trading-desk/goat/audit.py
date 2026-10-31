#!/usr/bin/env python3
"""
audit.py  --  re-verify every trade in out/trades.csv against the 1-minute
prices, sharing no code with the engine.

For every trade: the entry is its bar's close; the first minute after the entry
bar that touched the stop or the target is in the logged exit bar, and the
fill is that level (or the open of a minute that gapped through it); trades of
one setup and timeframe never overlap.

  python3 goat/audit.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "carter20"))
import fx_data                                                       # noqa: E402  (data loading only)

EPS, TOL = 1e-8, 0.0011


def main() -> None:
    t = pd.read_csv(HERE / "out" / "trades.csv", parse_dates=["entry_time", "exit_time"])
    m1 = fx_data.minutes("NSXUSD", "2018-01-01")
    mi = m1.index
    o, h, l = (m1[k].to_numpy() for k in ("open", "high", "low"))
    ok = bad = 0
    for (setup, tf), g in t.groupby(["setup", "tf"]):
        bars = fx_data.resample(m1, tf)
        span = pd.Timedelta(tf)
        prev = None
        for r in g.sort_values("entry_time").itertuples(index=False):
            errs = []
            sd = 1 if r.side == "long" else -1
            if prev is not None and r.entry_time < prev:
                errs.append("overlaps the previous trade")
            prev = r.exit_time
            if abs(r.entry - bars.at[r.entry_time, "close"]) > TOL:
                errs.append("entry is not the bar close")
            a, b = mi.searchsorted(r.entry_time + span), mi.searchsorted(r.exit_time + span)
            first = next((m for m in range(a, b)
                          if ((l[m] <= r.stop + EPS) if sd > 0 else (h[m] >= r.stop - EPS))
                          or ((h[m] >= r.target - EPS) if sd > 0 else (l[m] <= r.target + EPS))), None)
            lvl = r.stop if r.reason == "STOP" else r.target
            if first is None:
                errs.append("neither stop nor target touched")
            else:
                if mi[first] < r.exit_time:
                    errs.append("a level was touched before the logged exit bar")
                if not (abs(r.exit - lvl) <= TOL or abs(r.exit - o[first]) <= TOL):
                    errs.append("fill %.3f vs level %.3f" % (r.exit, lvl))
            if errs:
                bad += 1
                if bad <= 15:
                    print("  FAIL %s %s %s %s: %s" % (setup, tf, r.side, r.entry_time, "; ".join(errs)))
            else:
                ok += 1
    print("[goat] %d/%d trades satisfy the fill rules" % (ok, ok + bad))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
