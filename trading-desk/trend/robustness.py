#!/usr/bin/env python3
"""
robustness.py  --  stress the crypto time-series momentum rule without tuning it.

Run after run_backtest.py. Nothing here can change that script's verdict:
these runs are reported in full, never used to pick a better version.

  1. Other coins. The same weekly 28-day rule on 18 coins it was never tested
     on (Binance daily candles, 2019 on), each against holding that coin, and
     as one equal-weight basket against holding the basket.
  2. Neighbouring lookbacks. 14, 21, 35 and 42 days on BTC and ETH. An edge
     that exists only at 28 days is a fitted number, not an effect.

  python3 trend/robustness.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "core"))
sys.path.insert(0, str(HERE))

import binance_data                                          # noqa: E402
from run_backtest import cash_daily, load, memmel, stats     # noqa: E402

OOS = pd.Timestamp("2019-01-01")
COST = 0.0007
OTHERS = ["SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT",
          "TRXUSDT", "LTCUSDT", "BCHUSDT", "NEARUSDT", "SUIUSDT", "APTUSDT", "ARBUSDT", "OPUSDT",
          "INJUSDT", "PEPEUSDT"]


def tsmom(px: pd.DataFrame, cash: pd.Series, lookback: int) -> tuple:
    """Weekly, equal weight across live coins, hold a coin if its lookback return > 0."""
    idx = px.index
    rets = px.pct_change().fillna(0.0)
    sundays = idx[idx.dayofweek == 6]
    r = px / px.shift(lookback) - 1
    live = r.loc[sundays].notna()
    sig = (r.loc[sundays] > 0) & live
    w = sig.astype(float).div(live.sum(axis=1).replace(0, np.nan), axis=0).fillna(0.0)
    held = w.reindex(idx).ffill().shift(2).fillna(0.0)
    turn = held.diff().abs().sum(axis=1).fillna(0.0)
    strat = (held * rets).sum(axis=1) + (1 - held.sum(axis=1)) * cash - turn * COST
    avail = px.notna().astype(float)
    bw = avail.div(avail.sum(axis=1).replace(0, np.nan), axis=0).fillna(0.0)
    bench = (bw.shift(1).fillna(0.0) * rets).sum(axis=1) + (1 - bw.shift(1).fillna(0.0).sum(axis=1)) * cash
    return strat, bench


def report(tag: str, strat: pd.Series, bench: pd.Series, cash: pd.Series) -> dict:
    sel = strat.index >= OOS
    s, b, c = strat[sel], bench[sel], cash[sel]
    # Start each series when the asset actually trades.
    first = b.ne(c).idxmax() if b.ne(c).any() else b.index[0]
    s, b, c = s.loc[first:], b.loc[first:], c.loc[first:]
    a, h = stats(s, c, 365.0), stats(b, c, 365.0)
    z, p = memmel(s - c, b - c)
    print("  %-12s %5.2f vs %5.2f   %6.1f%% vs %6.1f%%   z=%+.2f p=%.3f  from %s"
          % (tag, a["sharpe"], h["sharpe"], a["maxdd"], h["maxdd"], z, p, first.date()))
    return {"tag": tag, "sharpe": a["sharpe"], "hold_sharpe": h["sharpe"], "dd": a["maxdd"], "hold_dd": h["maxdd"], "p": p}


def main() -> None:
    print("=== 1. the same rule on 18 other coins (Binance daily, from 2019) ===")
    closes = {}
    for s in OTHERS:
        df = binance_data.candles(s, "2018-10-01", "1d", verbose=False)
        if len(df):
            closes[s.replace("USDT", "")] = df["close"]
    px = pd.DataFrame(closes)
    px.index = px.index.tz_localize(None)
    irx = load(["^IRX"])["^IRX"]
    cash = cash_daily(irx, px.index, crypto=True)
    print("  %-12s %-14s %-20s %s" % ("coin", "Sharpe vs hold", "max DD vs hold", "Sharpe difference"))
    rows = []
    for coin in px.columns:
        st, bh = tsmom(px[[coin]], cash, 28)
        rows.append(report(coin, st, bh, cash))
    better = sum(r["sharpe"] > r["hold_sharpe"] for r in rows)
    shallower = sum(r["dd"] > r["hold_dd"] for r in rows)
    print("  Sharpe higher than holding on %d of %d coins; shallower drawdown on %d of %d"
          % (better, len(rows), shallower, len(rows)))
    st, bh = tsmom(px, cash, 28)
    print("  basket of all 18, equal weight:")
    report("basket", st, bh, cash)

    print("\n=== 2. neighbouring lookbacks on BTC and ETH (Yahoo daily, from 2019) ===")
    y = load(["BTC-USD", "ETH-USD"])
    pxb = pd.DataFrame(y)
    cashb = cash_daily(irx, pxb.index, crypto=True)
    for lb in (14, 21, 28, 35, 42):
        st, bh = tsmom(pxb, cashb, lb)
        report("%d days" % lb, st, bh, cashb)


if __name__ == "__main__":
    main()
