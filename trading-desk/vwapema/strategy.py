"""
strategy.py  --  the VWAP EMA Trend indicator (vwap_ema_indicator.pine) as a strategy.

The indicator only says when to go long or short:
  long   close > session VWAP and 9 EMA > 20 EMA
  short  close < session VWAP and 9 EMA < 20 EMA
It has no exit, so this port holds a position while its condition still holds
at the bar's close, and exits at the next bar's open once it doesn't. If the
opposite condition holds instead, it reverses at that same open.

Fills are at the NEXT bar's open, because the condition is only known once the
bar has closed. There is no stop: the source gives none, and adding one would
be testing a different strategy.

The gated arm takes the same candidate entries and keeps only those where ATR
is above its own 20-bar average, a hand-written volatility filter that serves
as the control (see the trading-desk-method skill).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np
import pandas as pd


@dataclass
class VwapEmaConfig:
    fast: int = 9
    slow: int = 20
    atr_len: int = 14
    atr_avg: int = 20
    warmup: int = 200


def indicators(df: pd.DataFrame, cfg: VwapEmaConfig) -> pd.DataFrame:
    x = df.copy()
    x["fast"] = x["close"].ewm(span=cfg.fast, adjust=False).mean()
    x["slow"] = x["close"].ewm(span=cfg.slow, adjust=False).mean()
    # Pine ta.vwap(hlc3), anchored to the session (the UTC day on Binance).
    day = x.index.normalize()
    src = (x["high"] + x["low"] + x["close"]) / 3
    pv = (src * x["volume"]).groupby(day).cumsum()
    vv = x["volume"].groupby(day).cumsum()
    x["vwap"] = pv / vv.replace(0, np.nan)
    bull = (x["close"] > x["vwap"]) & (x["fast"] > x["slow"])
    bear = (x["close"] < x["vwap"]) & (x["fast"] < x["slow"])
    x["state"] = np.where(bull, 1, np.where(bear, -1, 0))
    prev = x["close"].shift(1)
    tr = pd.concat([x["high"] - x["low"], (x["high"] - prev).abs(), (x["low"] - prev).abs()], axis=1).max(axis=1)
    x["atr"] = tr.ewm(alpha=1.0 / cfg.atr_len, adjust=False).mean()
    x["atr_hot"] = x["atr"] > x["atr"].rolling(cfg.atr_avg).mean()
    return x


def simulate(df: pd.DataFrame, cfg: VwapEmaConfig, arm: str = "rules", symbol: str = "") -> List[dict]:
    """Decisions at bar i's close, fills at bar i+1's open."""
    x = indicators(df, cfg)
    ts, o = x.index, x["open"].to_numpy()
    st, hot = x["state"].to_numpy(), x["atr_hot"].to_numpy()
    valid = np.isfinite(x["vwap"].to_numpy())
    trades: List[dict] = []
    pos, entry, i_in = 0, np.nan, -1

    for i in range(cfg.warmup, len(x) - 1):
        if not valid[i]:
            continue
        s = st[i]
        if pos != 0 and s != pos:
            trades.append({"symbol": symbol, "side": "long" if pos > 0 else "short",
                           "entry_time": ts[i_in], "exit_time": ts[i + 1], "entry": entry,
                           "exit": o[i + 1], "bars": i + 1 - i_in})
            pos = 0
        # A candidate is the first close where the condition holds after not holding.
        if pos == 0 and s != 0 and st[i - 1] != s:
            if arm == "gated" and not hot[i]:
                continue
            pos, entry, i_in = int(s), o[i + 1], i + 1
    return trades


def costs(trades: pd.DataFrame, commission_pct: float, slippage_bps: float) -> pd.DataFrame:
    t = trades.copy()
    sgn = np.where(t["side"] == "long", 1.0, -1.0)
    t["ret_gross"] = sgn * (t["exit"] - t["entry"]) / t["entry"] * 100
    t["ret_net"] = t["ret_gross"] - 2 * commission_pct - 2 * slippage_bps / 100
    return t
