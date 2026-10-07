#!/usr/bin/env python3
"""
audit.py  --  re-verify every trade in out/trades_causal.csv against the rules
as written, from the cached candles, sharing no code with strategy.py.

For each symbol it recomputes the EMA, session VWAP and ATR by loop, then
replays the position bar by bar and checks that every logged trade is exactly
the trade the rules produce, and that no trade is missing:

  - each entry bar has the right crossover and fills at that bar's close
  - each exit is either the causal trailing stop (filled at the stop, or at
    the open if price gapped through it) or the next opposite signal's close
  - trades follow each other with no overlap

  python3 sweep/audit.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
OUT, CACHE = HERE / "out", HERE / "cache"
ATR_LEN, EMA_LEN, TRAIL, WARMUP = 14, 4, 0.005, 200


def close_enough(a: float, b: float) -> bool:
    return math.isclose(a, b, rel_tol=1e-7, abs_tol=1e-9)


def replay(bars: pd.DataFrame) -> list:
    o, h, l, c, v = (bars[k].tolist() for k in ("open", "high", "low", "close", "volume"))
    days = [ts.date() for ts in bars.index]
    n = len(c)
    ema, vwap, atr = [0.0] * n, [math.nan] * n, [0.0] * n
    a = 2.0 / (EMA_LEN + 1)
    pv = vv = 0.0
    for i in range(n):
        ema[i] = c[i] if i == 0 else a * c[i] + (1 - a) * ema[i - 1]
        if i == 0 or days[i] != days[i - 1]:
            pv = vv = 0.0                       # VWAP restarts at 00:00 UTC
        pv += c[i] * v[i]
        vv += v[i]
        vwap[i] = pv / vv if vv > 0 else math.nan
        tr = h[i] - l[i] if i == 0 else max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1]))
        atr[i] = tr if i == 0 else atr[i - 1] + (tr - atr[i - 1]) / ATR_LEN

    out, pos, entry, ext, armed, i_in = [], 0, 0.0, 0.0, False, -1
    for i in range(WARMUP, n):
        if pos and i > i_in:
            d = atr[i - 1] * TRAIL
            if armed:
                stop = ext - pos * d
                if (pos > 0 and l[i] <= stop) or (pos < 0 and h[i] >= stop):
                    px = min(o[i], stop) if pos > 0 else max(o[i], stop)
                    out.append((i_in, i, pos, entry, px, "TRAIL"))
                    pos = 0
            if pos:
                ext = max(ext, h[i]) if pos > 0 else min(ext, l[i])
                armed = armed or pos * (ext - entry) >= d
        if i == 0 or math.isnan(vwap[i]) or math.isnan(vwap[i - 1]):
            continue
        up = ema[i] > vwap[i] and ema[i - 1] <= vwap[i - 1]
        dn = ema[i] < vwap[i] and ema[i - 1] >= vwap[i - 1]
        want = 1 if up else (-1 if dn else 0)
        if want and want != pos:
            if pos:
                out.append((i_in, i, pos, entry, c[i], "REVERSE"))
            pos, entry, ext, armed, i_in = want, c[i], c[i], False, i
    return out


def main() -> None:
    settings = json.loads((OUT / "settings.json").read_text())
    log = pd.read_csv(OUT / "trades_causal.csv", parse_dates=["entry_time", "exit_time"])
    ok = total = 0
    for sym, g in log.groupby("symbol"):
        bars = pd.read_csv(CACHE / f"{sym}_{settings['interval']}.csv", index_col=0, parse_dates=True)
        bars = bars[bars.index >= pd.Timestamp(settings["start"], tz="UTC")]
        # Same rule as data.py: only bars that had closed when the backtest ran.
        bars = bars[bars.index <= g["exit_time"].max()]
        exp = replay(bars)
        idx = bars.index
        want = [(idx[a], idx[b], "long" if p > 0 else "short", e, x, r) for a, b, p, e, x, r in exp]
        got = list(g.sort_values("entry_time")[["entry_time", "exit_time", "side", "entry", "exit", "reason"]]
                   .itertuples(index=False, name=None))
        sym_ok = 0
        for k, (w, t) in enumerate(zip(want, got)):
            match = (w[0] == t[0] and w[1] == t[1] and w[2] == t[2] and w[5] == t[5]
                     and close_enough(w[3], t[3]) and close_enough(w[4], t[4]))
            if match:
                sym_ok += 1
            elif total - ok < 10:
                print("  FAIL %s #%d: expected %s, logged %s" % (sym, k, w, t))
        if len(want) != len(got):
            print("  FAIL %s: rules produce %d trades, log has %d" % (sym, len(want), len(got)))
        ok += sym_ok
        total += max(len(want), len(got))
    print("[causal] %d/%d trades satisfy the rules as written" % (ok, total))
    sys.exit(0 if ok == total else 1)


if __name__ == "__main__":
    main()
