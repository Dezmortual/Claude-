"""
strategy.py  --  the trading rule, in plain language and in code.

  Setup       Once a week, on the daily bar that opens Sunday 00:00 UTC and
              closes Monday 00:00 UTC.
  Entry       Hold a coin if its close is above its close 28 days earlier.
  Weight      1/N of equity per coin held (N = coins in the universe, so 50%
              each), then cut down by the risk layer (risk.py).
  Exit        (a) at a weekly rebalance where the 28-day return is <= 0;
              (b) at any time if price trades through the protective stop;
              (c) at any time if the kill switch fires.
  Take profit None. Momentum makes its money from the few long runs; a profit
              target would cut exactly those. Winners leave by rule (a).
  No trade    No new entry or increase when: data is bad or stale, the daily
              loss limit was hit today, the kill switch is on, today's range
              is over 3x ATR, or an order for the same rebalance already exists.
              Exits and reductions are always allowed.

Nothing here reads the clock, the network or the portfolio: same inputs, same
output. backtest.py and the live loop call the same functions.
"""

from __future__ import annotations

from typing import Dict

import pandas as pd

import config as C


def is_rebalance_bar(bar_open: pd.Timestamp) -> bool:
    return bar_open.dayofweek == C.REBALANCE_WEEKDAY


def last_rebalance_bar(now: pd.Timestamp) -> pd.Timestamp:
    """Open time of the most recent closed Sunday daily bar."""
    today = now.normalize()
    back = (today.dayofweek - C.REBALANCE_WEEKDAY - 1) % 7 + 1
    return today - pd.Timedelta(days=back)


def momentum(closes: pd.Series, at: pd.Timestamp) -> float:
    """28-day return ending at the close of the bar that opened at `at`."""
    c = closes.loc[:at]
    if len(c) <= C.LOOKBACK_DAYS or c.index[-1] != at:
        return float("nan")
    return float(c.iloc[-1] / c.iloc[-1 - C.LOOKBACK_DAYS] - 1)


def target_weights(mom: Dict[str, float]) -> Dict[str, float]:
    """Rule weights before risk: 1/N for each coin with positive momentum."""
    n = len(mom)
    out = {}
    for coin, m in mom.items():
        if m != m:                      # NaN: no signal, hold nothing new
            out[coin] = 0.0
        else:
            out[coin] = (1.0 / n) if m > 0 else 0.0
    return out
