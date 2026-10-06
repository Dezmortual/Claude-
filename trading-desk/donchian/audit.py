#!/usr/bin/env python3
"""
audit.py  --  re-verify every trade in out/trades_<arm>.csv against the rules
as written, using the exact bars run_backtest.py saved to out/bars_<sym>.csv.

Deliberately shares no code with strategy.py or the engine: every indicator is
recomputed here from scratch, by loop where that is clearer. The point is to
check the strategy, so the strategy cannot be the thing doing the checking.

Audits the default configuration (fill=close, trail-mode causal, 2 bps
slippage). Run run_backtest.py with defaults first.

  python3 donchian/audit.py
  python3 donchian/audit.py --arms rules
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parent / "out"

ATR_LEN, SMA_LEN, CHAN_LEN, VOL_LEN, SLOPE_LEN = 14, 200, 20, 20, 20
STOP_MULT, TRAIL_MULT = 1.5, 0.02
SLIP = 2.0 / 10_000
MAX_BREAKOUT_ATR = 1.0


def close_enough(a: float, b: float) -> bool:
    # The trade log is rounded to 4dp; 1e-6 would fail on honest rounding.
    return math.isclose(a, b, rel_tol=1e-5, abs_tol=1e-3)


def indicators(bars: pd.DataFrame) -> pd.DataFrame:
    o, h, l, c = (bars[k].tolist() for k in ("open", "high", "low", "close"))
    n = len(c)
    atr = [math.nan] * n
    tr_prev = None
    for i in range(n):
        tr = h[i] - l[i] if i == 0 else max(h[i] - l[i], abs(h[i] - c[i - 1]),
                                             abs(l[i] - c[i - 1]))
        # Wilder RMA, seeded from the first value like pandas ewm(adjust=False).
        tr_prev = tr if tr_prev is None else tr_prev + (tr - tr_prev) / ATR_LEN
        if i >= ATR_LEN - 1:
            atr[i] = tr_prev
    rows = []
    for i in range(n):
        sma = sum(c[i - SMA_LEN + 1:i + 1]) / SMA_LEN if i >= SMA_LEN - 1 else math.nan
        sma_ago = (sum(c[i - SLOPE_LEN - SMA_LEN + 1:i - SLOPE_LEN + 1]) / SMA_LEN
                   if i - SLOPE_LEN >= SMA_LEN - 1 else math.nan)
        win = atr[i - VOL_LEN + 1:i + 1] if i >= VOL_LEN - 1 else []
        atr_avg = sum(win) / VOL_LEN if win and not any(math.isnan(x) for x in win) else math.nan
        chan_hi = max(h[i - CHAN_LEN:i]) if i >= CHAN_LEN else math.nan
        chan_lo = min(l[i - CHAN_LEN:i]) if i >= CHAN_LEN else math.nan
        rows.append((sma, sma - sma_ago, atr[i], atr_avg, chan_hi, chan_lo))
    return pd.DataFrame(rows, index=bars.index,
                        columns=["sma", "sma_slope", "atr", "atr_avg", "chan_hi", "chan_lo"])


def audit_trade(t, bars: pd.DataFrame, ind: pd.DataFrame, gated: bool) -> list:
    errs = []
    side = 1 if t.side == "long" else -1
    i = bars.index.get_loc(t.entry_time)
    c = float(bars["close"].iloc[i])
    x = ind.iloc[i]

    # 1. the entry rule, on the entry bar
    if side > 0:
        ok = c > x.chan_hi and c > x.sma and x.atr > x.atr_avg
    else:
        ok = c < x.chan_lo and c < x.sma and x.atr > x.atr_avg
    if not ok:
        errs.append("entry rule not met")

    # 2. gates, for the gated arm
    if gated:
        edge = x.chan_hi if side > 0 else x.chan_lo
        if side * x.sma_slope <= 0:
            errs.append("trend gate should have vetoed")
        if side * (c - edge) / x.atr > MAX_BREAKOUT_ATR:
            errs.append("extension gate should have vetoed")

    # 3. entry fill and hard stop
    if not close_enough(t.entry, c * (1 + side * SLIP)):
        errs.append("entry %.4f != close+slip %.4f" % (t.entry, c * (1 + side * SLIP)))
    hard = c - side * STOP_MULT * x.atr
    if not close_enough(t.stop, hard):
        errs.append("stop %.4f != %.4f" % (t.stop, hard))

    # 4. replay the exit bar by bar, trailing only from closed bars
    trail, extreme, armed = TRAIL_MULT * x.atr, c, False
    exp = None
    for j in range(i + 1, len(bars)):
        o, h, l = (float(bars[k].iloc[j]) for k in ("open", "high", "low"))
        level, why = hard, "STOP"
        if armed:
            tl = extreme - side * trail
            if side * (tl - hard) >= 0:
                level, why = tl, "TRAIL"
        if (side > 0 and l <= level) or (side < 0 and h >= level):
            raw = min(o, level) if side > 0 else max(o, level)
            exp = (bars.index[j], raw, why)
            break
        extreme = max(extreme, h) if side > 0 else min(extreme, l)
        if side * (extreme - c) >= trail:
            armed = True
    if exp is None:
        errs.append("no exit found in the data, but the log closed the trade")
    else:
        when, raw, why = exp
        if when != t.exit_time:
            errs.append("exit %s != expected %s" % (t.exit_time.date(), when.date()))
        if not close_enough(t.exit, raw * (1 - side * SLIP)):
            errs.append("exit %.4f != expected %.4f" % (t.exit, raw * (1 - side * SLIP)))
        if t.reason != why:
            errs.append("reason %s != expected %s" % (t.reason, why))

    # 5. accounting: net = before-costs - slippage - fees, exactly (to the cent)
    if abs(t.net_pnl - (t.ideal_pnl - t.slippage - t.fees)) > 0.03:
        errs.append("net != ideal - slippage - fees")
    return errs


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--arms", nargs="+", default=["rules", "gated"])
    args = p.parse_args()

    bars, ind = {}, {}
    total_fail = 0
    for arm in args.arms:
        path = OUT / ("trades_%s.csv" % arm)
        if not path.exists():
            sys.exit("missing %s: run donchian/run_backtest.py first" % path)
        tdf = pd.read_csv(path, parse_dates=["entry_time", "exit_time"])
        ok, fails = 0, []
        for t in tdf.itertuples(index=False):
            if t.symbol not in bars:
                b = pd.read_csv(OUT / ("bars_%s.csv" % t.symbol), index_col=0, parse_dates=True)
                bars[t.symbol], ind[t.symbol] = b, indicators(b)
            errs = audit_trade(t, bars[t.symbol], ind[t.symbol], gated=(arm == "gated"))
            if errs:
                fails.append((t.symbol, t.entry_time.date(), errs))
            else:
                ok += 1

        # 6. one position per symbol: a trade never opens before the last one closed
        for sym, g in tdf.sort_values("entry_time").groupby("symbol"):
            prev_exit = None
            for t in g.itertuples(index=False):
                if prev_exit is not None and t.entry_time <= prev_exit:
                    fails.append((sym, t.entry_time.date(), ["overlaps the previous trade"]))
                prev_exit = t.exit_time

        print("[%s] %d/%d trades satisfy the rules as written" % (arm, ok, len(tdf)))
        for f in fails[:10]:
            print("   FAIL %s %s: %s" % (f[0], f[1], "; ".join(f[2])))
        total_fail += len(fails)
    sys.exit(1 if total_fail else 0)


if __name__ == "__main__":
    main()
