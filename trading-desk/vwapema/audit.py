#!/usr/bin/env python3
"""
audit.py  --  re-verify every vwapema trade against the rules, independently.

Reads out/trades_<arm>.csv and the cached candles, recomputes the indicators
here (without importing strategy.py), and checks each trade:
  1. the entry fills at the open of the bar after the first close where the
     side's condition holds (it did not hold on the close before that)
  2. the condition held on every close from that one until the exit decision
  3. the exit fills at the open of the bar after the first close where it no
     longer held
  4. gated arm only: ATR was above its 20-bar average at the entry decision
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / "core" / "cache"
TOL = 1e-3


def states(b: pd.DataFrame) -> pd.DataFrame:
    c = b["close"]
    fast = c.ewm(alpha=2 / 10, adjust=False).mean()     # span 9
    slow = c.ewm(alpha=2 / 21, adjust=False).mean()     # span 20
    tp = (b["high"] + b["low"] + c) / 3
    day = b.index.floor("D")
    vwap = (tp * b["volume"]).groupby(day).cumsum() / b["volume"].groupby(day).cumsum()
    side = pd.Series(0, index=b.index)
    side[(c > vwap) & (fast > slow)] = 1
    side[(c < vwap) & (fast < slow)] = -1
    pc = c.shift(1)
    tr = np.maximum(b["high"] - b["low"], np.maximum((b["high"] - pc).abs(), (b["low"] - pc).abs()))
    atr = tr.ewm(alpha=1 / 14, adjust=False).mean()
    return pd.DataFrame({"side": side, "hot": atr > atr.rolling(20).mean(), "open": b["open"]})


def main() -> None:
    interval = sys.argv[1] if len(sys.argv) > 1 else "1h"
    outdir = HERE / (sys.argv[2] if len(sys.argv) > 2 else "out")
    for arm in ("rules", "gated"):
        t = pd.read_csv(outdir / f"trades_{arm}.csv", parse_dates=["entry_time", "exit_time"])
        ok, bad = 0, []
        for sym, g in t.groupby("symbol"):
            b = pd.read_csv(CACHE / f"{sym}_{interval}.csv", index_col=0, parse_dates=True)
            s = states(b)
            pos = {ts: i for i, ts in enumerate(s.index)}
            sd, hot, op = s["side"].to_numpy(), s["hot"].to_numpy(), s["open"].to_numpy()
            for r in g.itertuples():
                want = 1 if r.side == "long" else -1
                k, m = pos[r.entry_time], pos[r.exit_time]
                checks = [
                    sd[k - 1] == want and sd[k - 2] != want,
                    bool(np.all(sd[k - 1:m - 1] == want)),
                    sd[m - 1] != want,
                    abs(r.entry - op[k]) <= TOL * op[k] and abs(r.exit - op[m]) <= TOL * op[m],
                    arm != "gated" or bool(hot[k - 1]),
                ]
                if all(checks):
                    ok += 1
                else:
                    bad.append((sym, r.entry_time, [i + 1 for i, c in enumerate(checks) if not c]))
        print("%s: %d/%d trades satisfy the rules" % (arm, ok, len(t)))
        for b_ in bad[:10]:
            print("   FAIL", b_)


if __name__ == "__main__":
    main()
