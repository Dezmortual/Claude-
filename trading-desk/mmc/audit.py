#!/usr/bin/env python3
"""
audit.py  --  re-verify every trade in out/trades.csv against the prices,
sharing no code with the simulators.

  2b, 2b_gated, div   entry is the close of its bar; a STOP exit is at the stop
                      (or the open of a minute that gapped through it) and no
                      earlier minute after entry touched the stop or the target;
                      a TARGET exit likewise, at the 2R level
  footprint           entry is the close of its bar; the exit is at or beyond
                      the bar's traded range on the stop side (the shared stop
                      trails, so only the fill is checked); units of a campaign
                      share one exit time; campaigns never overlap on a pair
  all                 no overlapping trades of one system, timeframe and pair

  python3 mmc/audit.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "carter20"))
import fx_data                                                       # noqa: E402  (data loading only)

EPS = 1e-8


def main() -> None:
    t = pd.read_csv(HERE / "out" / "trades.csv", parse_dates=["entry_time", "exit_time"])
    ok = bad = 0

    def fail(msg):
        nonlocal bad
        bad += 1
        if bad <= 15:
            print("  FAIL " + msg)

    for pair, gp in t.groupby("pair"):
        m1 = fx_data.minutes(pair, "2018-01-01")
        mi = m1.index
        o, h, l = (m1[k].to_numpy() for k in ("open", "high", "low"))
        pt = fx_data.point(pair)
        for (sysname, tf), g in gp.groupby(["system", "tf"]):
            bars = fx_data.resample(m1, tf)
            span = pd.Timedelta(tf)
            if sysname == "footprint":
                for _, cg in g.groupby("campaign"):
                    if cg["exit_time"].nunique() != 1:
                        fail("%s %s %s campaign units exit at different times" % (pair, tf, cg["entry_time"].iloc[0]))
                prev = None
                for cid, cg in g.sort_values("entry_time").groupby("campaign", sort=False):
                    first = cg["entry_time"].min()
                    if prev is not None and first < prev:
                        fail("%s %s campaign %s overlaps the previous one" % (pair, tf, cid))
                    prev = cg["exit_time"].iloc[0]
            else:
                prev = None
                for r in g.sort_values("entry_time").itertuples(index=False):
                    if prev is not None and r.entry_time < prev:
                        fail("%s %s %s %s overlaps" % (sysname, tf, pair, r.entry_time))
                    prev = r.exit_time
            for r in g.itertuples(index=False):
                errs = []
                sd = 1 if r.side == "long" else -1
                if abs(r.entry - bars.at[r.entry_time, "close"]) > pt * 0.51:
                    errs.append("entry is not the bar close")
                a = mi.searchsorted(r.entry_time + span)                 # first minute after the entry bar
                b = mi.searchsorted(r.exit_time + span)                  # end of the exit bar
                x0 = mi.searchsorted(r.exit_time)
                if sysname == "footprint":
                    seen = any((l[m] <= r.exit + EPS) if sd > 0 else (h[m] >= r.exit - EPS) for m in range(x0, b))
                    if not seen:
                        errs.append("exit price not traded in exit bar")
                else:
                    lvl = r.stop if r.reason == "STOP" else r.target
                    first = next((m for m in range(a, b)
                                  if ((l[m] <= r.stop + EPS) if sd > 0 else (h[m] >= r.stop - EPS))
                                  or ((h[m] >= r.target - EPS) if sd > 0 else (l[m] <= r.target + EPS))), None)
                    if first is None:
                        errs.append("neither stop nor target touched")
                    else:
                        if mi[first] < r.exit_time:
                            errs.append("a level was touched before the logged exit bar")
                        if not (abs(r.exit - lvl) <= pt * 0.51 or abs(r.exit - o[first]) <= pt * 0.51):
                            errs.append("fill %.5f vs level %.5f" % (r.exit, lvl))
                if errs:
                    fail("%s %s %s %s %s: %s" % (sysname, tf, pair, r.side, r.entry_time, "; ".join(errs)))
                else:
                    ok += 1
        print("  %s checked" % pair, flush=True)
    print("[mmc] %d/%d trades satisfy the fill rules" % (ok, ok + bad))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
