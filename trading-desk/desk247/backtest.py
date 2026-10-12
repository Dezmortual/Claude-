#!/usr/bin/env python3
"""
backtest.py  --  what the risk layer costs and what it buys, on daily Binance bars.

Three arms from 2019-01-01 (the out-of-sample start used in trend/):

  hold        50/50 BTC and ETH, rebalanced daily
  rule        the momentum rule at full 1/N weight, no stops (what trend/ tested)
  rule+risk   what desk247 runs: entries sized by risk.size_position(), ATR
              stops, the 25% drawdown kill switch (resumes at the first weekly
              rebalance 28+ days after it fires, standing in for a human reset)

Same functions as the live loop: strategy.momentum, strategy.target_weights,
research.atr, risk.size_position, risk.stop_fill. A Sunday signal trades at
Monday's open. Costs 5 bps fee + 2 bps slippage per side. Cash earns nothing.
Stops are checked on daily lows, so a stop and a recovery inside one day both
count as a stop: pessimistic for the risk arm.

The rule was frozen before 2019 data was looked at for it; the risk numbers in
config.py were chosen 2026-10-12 with full knowledge of 2019-2026 crypto
history. Read the rule+risk column as in-sample.

  python3 desk247/backtest.py
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import config as C                       # noqa: E402
import research                          # noqa: E402
import risk                              # noqa: E402
import strategy                          # noqa: E402
from core.binance_data import candles    # noqa: E402

START = pd.Timestamp("2019-01-01", tz="UTC")
COST = (C.FEE_BPS + C.SLIPPAGE_BPS) / 1e4


def load() -> dict:
    out = {}
    for coin, sym in C.SYMBOLS.items():
        d = candles(sym, "2017-09-01", "1d", verbose=False)
        out[coin] = d[d.index < pd.Timestamp.now(tz="UTC").normalize()]      # closed bars only
    common = out["BTC"].index.intersection(out["ETH"].index)
    return {c: d.loc[common] for c, d in out.items()}


def stats(eq: pd.Series, expo: pd.Series) -> dict:
    r = eq.pct_change().dropna()
    yrs = len(r) / 365
    return {"CAGR": (eq.iloc[-1] / eq.iloc[0]) ** (1 / yrs) - 1,
            "Sharpe": r.mean() / r.std() * math.sqrt(365),
            "MaxDD": (eq / eq.cummax() - 1).min(),
            "Vol": r.std() * math.sqrt(365),
            "Exposure": expo.mean(),
            "Total": eq.iloc[-1] / eq.iloc[0] - 1}


def simulate(px: dict, with_risk: bool) -> tuple:
    idx = px["BTC"].index
    days = idx[idx >= START]
    atrs = {c: research.atr(px[c]) for c in px}
    cash, pos, stops = C.START_EQUITY, {c: 0.0 for c in px}, {c: 0.0 for c in px}
    peak, killed_until, n_trades, n_stops, kills = cash, None, 0, 0, []
    pending = None                                           # weights decided at Sunday close
    eq_curve, expo = [], []
    for d in days:
        o = {c: px[c].at[d, "open"] for c in px}
        lo = {c: px[c].at[d, "low"] for c in px}
        cl = {c: px[c].at[d, "close"] for c in px}

        if pending is not None:                              # Monday open: act on Sunday's signal
            w, sig_day = pending
            pending = None
            eq_open = cash + sum(pos[c] * o[c] for c in px)
            for c in px:
                if w[c] == 0 and pos[c] > 0:
                    cash += pos[c] * o[c] * (1 - COST); pos[c] = 0.0; n_trades += 1
            for c in px:
                if w[c] > 0 and pos[c] == 0 and (killed_until is None or d >= killed_until):
                    killed_until = None
                    if with_risk:
                        try:
                            q, stops[c] = risk.size_position(w[c], eq_open, o[c], float(atrs[c].at[sig_day]))
                        except risk.SizingError:
                            continue
                    else:
                        q, stops[c] = w[c] * eq_open / o[c] / (1 + COST), 0.0
                    q = min(q, cash / (o[c] * (1 + COST)))
                    if q * o[c] >= C.MIN_ORDER_USD:
                        cash -= q * o[c] * (1 + COST); pos[c] = q; n_trades += 1

        if with_risk:                                        # stops on the daily low
            for c in px:
                if pos[c] > 0:
                    f = risk.stop_fill(stops[c], o[c], lo[c])
                    if f is not None:
                        cash += pos[c] * f * (1 - COST); pos[c] = 0.0; n_trades += 1; n_stops += 1

        eq = cash + sum(pos[c] * cl[c] for c in px)
        if with_risk:
            peak = max(peak, eq)
            if eq <= peak * (1 - C.MAX_DRAWDOWN) and any(pos.values()):
                for c in px:
                    if pos[c] > 0:
                        cash += pos[c] * cl[c] * (1 - COST); pos[c] = 0.0; n_trades += 1
                eq, peak = cash, cash
                kills.append(str(d.date()))
                killed_until = d + pd.Timedelta(days=28)
        eq_curve.append(eq)
        expo.append(sum(pos[c] * cl[c] for c in px) / eq)

        if strategy.is_rebalance_bar(d):
            mom = {c: strategy.momentum(px[c]["close"], d) for c in px}
            pending = (strategy.target_weights(mom), d)
    return (pd.Series(eq_curve, index=days), pd.Series(expo, index=days),
            {"trades": n_trades, "stop_exits": n_stops, "kills": kills})


def hold(px: dict) -> pd.Series:
    r = pd.DataFrame({c: px[c]["close"].pct_change() for c in px}).loc[START:].fillna(0).mean(axis=1)
    r.iloc[0] -= COST
    return C.START_EQUITY * (1 + r).cumprod()


def main() -> None:
    px = load()
    print(f"daily bars {px['BTC'].index[0].date()} .. {px['BTC'].index[-1].date()}, tested from {START.date()}")
    h = hold(px)
    rule, rule_x, rule_info = simulate(px, with_risk=False)
    rr, rr_x, rr_info = simulate(px, with_risk=True)
    rows = {"hold 50/50": stats(h, pd.Series(1.0, index=h.index)), "rule": stats(rule, rule_x),
            "rule+risk": stats(rr, rr_x)}
    print()
    print(f"{'':12}{'CAGR':>8}{'Sharpe':>8}{'MaxDD':>8}{'Vol':>8}{'Expo':>7}{'Total':>10}")
    for k, s in rows.items():
        print(f"{k:12}{s['CAGR']:>8.1%}{s['Sharpe']:>8.2f}{s['MaxDD']:>8.1%}{s['Vol']:>8.1%}"
              f"{s['Exposure']:>7.0%}{s['Total']:>10.0%}")
    print()
    print(f"rule:      {rule_info['trades']} trades")
    print(f"rule+risk: {rr_info['trades']} trades, {rr_info['stop_exits']} stop exits, "
          f"kill switch fired {len(rr_info['kills'])}x {rr_info['kills']}")
    print("\nby year (total return)")
    years = sorted(set(h.index.year))
    print(f"{'':12}" + "".join(f"{y:>8}" for y in years))
    for k, eq in (("hold 50/50", h), ("rule", rule), ("rule+risk", rr)):
        yr = eq.groupby(eq.index.year).last() / eq.groupby(eq.index.year).last().shift(1).fillna(C.START_EQUITY) - 1
        print(f"{k:12}" + "".join(f"{v:>8.0%}" for v in yr.values))


if __name__ == "__main__":
    main()
