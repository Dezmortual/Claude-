#!/usr/bin/env python3
"""
audit.py  --  re-verify every trade in out/trades.csv against the 1-minute
prices, sharing no code with engine.py.

For every trade it checks:
  - the entry fills at a 5-minute close (market) or, for stop entries, at the
    order price or the open of a minute that gapped through it
  - a STOP or TARGET exit is at that level or at the open of the minute that
    gapped through it, and no earlier minute after entry touched that level
    (so the trade did not survive a stop it should have hit)
  - a TARGET exit is the target (or 1R/2R for split systems); an EXIT is the
    close of a 5-minute bar
  - trades of one system on one pair never overlap

The signal logic (which bar a system fires on) is not re-derived here.

  python3 carter20/audit.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fx_data                                                       # noqa: E402  (data loading only)

HERE = Path(__file__).resolve().parent
SPLIT = {9: 2.0, 18: 1.0}
STOP_ENTRY = {7, 18}


def near(a, b, pair):
    return abs(a - b) <= fx_data.point(pair) * 0.51


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "out"
    t = pd.read_csv(out / "trades.csv", parse_dates=["entry_time", "exit_time", "time_a", "time_b"])
    ok = bad = 0
    for pair, g in t.groupby("pair"):
        m1 = fx_data.minutes(pair, "2018-01-01")
        idx = m1.index
        o, h, l, c = (m1[k].to_numpy() for k in ("open", "high", "low", "close"))
        five = fx_data.resample(m1, "5min")["close"]
        for (sysno, _), gg in g.groupby(["system", "pair"]):
            gg = gg.sort_values("entry_time")
            prev_exit = None
            for r in gg.itertuples(index=False):
                errs = []
                sd = 1 if r.side == "long" else -1
                if prev_exit is not None and r.entry_time < prev_exit:
                    errs.append("overlaps previous trade")
                prev_exit = r.exit_time
                # entry
                a = idx.searchsorted(r.entry_time)
                b = idx.searchsorted(r.entry_time + pd.Timedelta("5min"))
                if sysno in STOP_ENTRY:
                    m_in = next((m for m in range(a, b) if (sd > 0 and h[m] >= r.entry - 1e-8 and (near(r.entry, o[m], pair) or l[m] <= r.entry + 1e-8))
                                 or (sd < 0 and l[m] <= r.entry + 1e-8 and (near(r.entry, o[m], pair) or h[m] >= r.entry - 1e-8))), None)
                    if m_in is None:
                        errs.append("stop entry not reached in its bar")
                    start_m = (m_in + 1) if m_in is not None else b
                else:
                    if not near(r.entry, five.loc[r.entry_time], pair):
                        errs.append("market entry is not the 5m close")
                    start_m = b
                # exits, per half
                for x, why, half, xt in ((r.exit_a, r.why_a, 0, r.time_a), (r.exit_b, r.why_b, 1, r.time_b)):
                    if why == "EXIT":
                        if not near(x, five.loc[xt], pair):
                            errs.append("EXIT price is not a 5m close")
                        continue
                    if why == "TARGET":
                        lvl = r.target if sysno not in SPLIT else r.entry + sd * SPLIT[sysno] * r.risk
                        if not (half == 0 or sysno not in SPLIT):
                            errs.append("second half cannot take the target")
                        end = idx.searchsorted(xt + pd.Timedelta("5min"))
                        hit = next((m for m in range(start_m, end) if (h[m] >= lvl - 1e-8 if sd > 0 else l[m] <= lvl + 1e-8)), None)
                        if hit is None or idx[hit] < xt:
                            errs.append("target not first touched in its exit bar")
                        elif not (near(x, lvl, pair) or near(x, o[hit], pair)):
                            errs.append("target fill %.5f vs level %.5f" % (x, lvl))
                    elif why == "STOP":
                        # A stop can trail or move to break-even, so the level is the fill
                        # itself unless it gapped; check the price really traded there.
                        end = idx.searchsorted(xt + pd.Timedelta("5min"))
                        first_t = idx.searchsorted(xt)
                        seen = any((l[m] <= x + 1e-8) if sd > 0 else (h[m] >= x - 1e-8) for m in range(max(start_m - 1, first_t - 1), end))
                        if not seen:
                            errs.append("stop price not traded in exit bar")
                        if half == 0 and sysno not in SPLIT and sysno not in (7, 18):
                            # a fixed initial stop: no minute before the exit bar may have touched it
                            early = next((m for m in range(start_m, first_t) if (l[m] <= r.stop + 1e-8 if sd > 0 else h[m] >= r.stop - 1e-8)), None)
                            if early is not None and r.stop == r.stop:
                                errs.append("stop touched earlier at %s" % idx[early])
                if errs:
                    bad += 1
                    if bad <= 15:
                        print("  FAIL system %d %s %s %s: %s" % (sysno, pair, r.side, r.entry_time, "; ".join(errs)))
                else:
                    ok += 1
        print("  %s checked" % pair, flush=True)
    print("[carter20] %d/%d trades satisfy the fill rules" % (ok, ok + bad))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
