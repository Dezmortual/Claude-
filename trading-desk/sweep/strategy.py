"""
strategy.py — Sweep
===================
A port of sweep_indicator.pine at the repo root.

  signal long    the 4-period EMA of close crosses above the session VWAP
  signal short   the EMA crosses below it
  entry          the signal bar's close (Pine: process_orders_on_close=true)
  reversal       an opposite signal closes the open trade at that close and
                 opens the other side, so the system is usually in the market
  trailing stop  arms once price has moved `trail_mult` x ATR in the trade's
                 favour, then follows the best price by that distance
  no hard stop   until the trail arms, only an opposite signal ends a trade

This does not fit core/engine.py, which sizes every trade from a stop and has
no reversal exit, so it has its own small simulator. Returns are per trade, as
a percentage of the position's notional, like the Pine dashboard reports them.

Trailing-stop modes, as in donchian/:
  causal     the stop used on a bar comes only from bars already closed. A bar's
             high and low carry no order, so this is the honest reading.
  same_bar   the bar's own high moves the stop before its low is checked, and
             the stop fills at its level: what TradingView's strategy tester
             assumes without bar magnifier. Kept to measure that assumption.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np
import pandas as pd


@dataclass
class SweepConfig:
    # The Pine script's inputs, unchanged.
    atr_len: int = 14
    ema_len: int = 4
    trail_mult: float = 0.005
    warmup: int = 200            # bars skipped before any signal, so indicators have settled


def indicators(df: pd.DataFrame, cfg: SweepConfig) -> pd.DataFrame:
    out = df.copy()
    # Causal: recursive EMA of closes up to this bar (Pine's ta.ema seeds with
    # the first close, as ewm(adjust=False) does).
    out["ema"] = out["close"].ewm(span=cfg.ema_len, adjust=False).mean()
    # Causal: Pine's ta.vwap(close) anchored to the session, which for crypto
    # on TradingView is the UTC day. Cumulative sums restart at 00:00 UTC and
    # include only bars of the current day up to and including this one.
    day = out.index.normalize()
    pv = (out["close"] * out["volume"]).groupby(day).cumsum()
    vv = out["volume"].groupby(day).cumsum()
    out["vwap"] = pv / vv.replace(0, np.nan)
    # Causal: Wilder ATR, true range from this bar and the previous close.
    prev = out["close"].shift(1)
    tr = pd.concat([out["high"] - out["low"], (out["high"] - prev).abs(), (out["low"] - prev).abs()],
                   axis=1).max(axis=1)
    out["atr"] = tr.ewm(alpha=1.0 / cfg.atr_len, adjust=False).mean()
    # Causal: crossovers compare this bar with the previous one only.
    e, v = out["ema"], out["vwap"]
    out["long_sig"] = (e > v) & (e.shift(1) <= v.shift(1))
    out["short_sig"] = (e < v) & (e.shift(1) >= v.shift(1))
    # Pine places the trail at bar close, so the trail active on a bar uses the
    # previous bar's ATR.
    out["trail_prev"] = (out["atr"] * cfg.trail_mult).shift(1)
    return out


def simulate(df: pd.DataFrame, cfg: SweepConfig, mode: str = "causal", symbol: str = "") -> List[dict]:
    """Bar-by-bar replay of the Pine logic. Returns one dict per closed trade."""
    x = indicators(df, cfg)
    ts = x.index
    o, h, l, c = (x[k].to_numpy() for k in ("open", "high", "low", "close"))
    ls, ss = x["long_sig"].to_numpy(), x["short_sig"].to_numpy()
    tp = x["trail_prev"].to_numpy()
    valid = np.isfinite(x["vwap"].to_numpy()) & np.isfinite(tp)

    trades: List[dict] = []
    pos, entry, extreme, armed, i_in = 0, np.nan, np.nan, False, -1

    def close_trade(i: int, px: float, reason: str) -> None:
        trades.append({"symbol": symbol, "side": "long" if pos > 0 else "short",
                       "entry_time": ts[i_in], "exit_time": ts[i], "entry": entry, "exit": px,
                       "reason": reason, "bars": i - i_in})

    for i in range(cfg.warmup, len(x)):
        # --- 1. trailing stop on an open position (bars after the entry bar) ---
        if pos != 0 and i > i_in:
            d = tp[i]
            if mode == "same_bar":
                extreme = max(extreme, h[i]) if pos > 0 else min(extreme, l[i])
                if not armed and pos * (extreme - entry) >= d:
                    armed = True
                if armed:
                    stop = extreme - pos * d
                    if (pos > 0 and l[i] <= stop) or (pos < 0 and h[i] >= stop):
                        close_trade(i, stop, "TRAIL")
                        pos = 0
            else:
                if armed:
                    stop = extreme - pos * d
                    if (pos > 0 and l[i] <= stop) or (pos < 0 and h[i] >= stop):
                        # A stop resting before the bar opened fills at the open
                        # if price gaps through it.
                        fill = min(o[i], stop) if pos > 0 else max(o[i], stop)
                        close_trade(i, fill, "TRAIL")
                        pos = 0
                if pos != 0:
                    extreme = max(extreme, h[i]) if pos > 0 else min(extreme, l[i])
                    if not armed and pos * (extreme - entry) >= d:
                        armed = True

        # --- 2. signals at this bar's close, reversing any open trade ---
        if not valid[i]:
            continue
        want = 1 if ls[i] else (-1 if ss[i] else 0)
        if want != 0 and want != pos:
            if pos != 0:
                close_trade(i, c[i], "REVERSE")
            pos, entry, extreme, armed, i_in = want, c[i], c[i], False, i

    return trades


def costs(trades: pd.DataFrame, commission_pct: float, slippage_bps: float) -> pd.DataFrame:
    """Add gross, commission-only and fully costed returns, in percent of notional."""
    t = trades.copy()
    sgn = np.where(t["side"] == "long", 1.0, -1.0)
    t["ret_gross"] = sgn * (t["exit"] - t["entry"]) / t["entry"] * 100
    t["ret_comm"] = t["ret_gross"] - 2 * commission_pct          # the Pine dashboard's figure
    t["ret_net"] = t["ret_comm"] - 2 * slippage_bps / 100        # plus slippage on both fills
    return t
