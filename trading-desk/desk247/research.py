"""
research.py  --  what the system knows about the market, and how sure it is.

Three kinds of information, kept apart on purpose:

  hard     raw exchange data: OHLCV bars and their timestamps
  derived  numbers computed from hard data by a fixed formula
  review   things that matter but that this code cannot measure; they are
           printed for a human every week and never used to trade

Only `derived` values feed the strategy and the risk layer.
"""

from __future__ import annotations

import math
import sys
import time
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

import config as C

sys.path.insert(0, str(C.DESK))

HUMAN_REVIEW = [
    "Exchange health: withdrawals, outages or insolvency news for the venue",
    "Stablecoin peg: USDT trading within 0.5% of $1",
    "Scheduled catalysts this week: FOMC, CPI, ETF flows, major unlocks or forks",
    "Regulatory action naming BTC, ETH or the exchange",
    "Anything that makes the last 28 days unrepresentative (hack, delisting, halt)",
]


class BadData(Exception):
    """The feed cannot be trusted this tick. Callers must not open positions."""


def validate_bars(df: pd.DataFrame, name: str, now: Optional[pd.Timestamp] = None,
                  max_age_s: Optional[float] = None) -> pd.DataFrame:
    """Reject the feed outright rather than trade on a guess."""
    if df is None or len(df) == 0:
        raise BadData(f"{name}: no bars")
    need = ["open", "high", "low", "close", "volume"]
    if any(c not in df.columns for c in need):
        raise BadData(f"{name}: missing columns")
    if not df.index.is_monotonic_increasing or df.index.has_duplicates:
        raise BadData(f"{name}: timestamps out of order or duplicated")
    tail = df[need].iloc[-60:]
    if tail.isna().any().any():
        raise BadData(f"{name}: NaN in recent bars")
    if (tail[["open", "high", "low", "close"]] <= 0).any().any() or (tail["volume"] < 0).any():
        raise BadData(f"{name}: non-positive price or negative volume")
    if ((tail["high"] < tail[["open", "close"]].max(axis=1)) |
            (tail["low"] > tail[["open", "close"]].min(axis=1))).any():
        raise BadData(f"{name}: high/low inconsistent with open/close")
    moves = tail["close"].pct_change().abs().iloc[1:]
    if (moves > C.MAX_BAR_MOVE).any():
        raise BadData(f"{name}: bar-to-bar move over {C.MAX_BAR_MOVE:.0%}, treating as a bad print")
    if max_age_s is not None:
        now = now or pd.Timestamp.now(tz="UTC")
        step = df.index[-1] - df.index[-2] if len(df) > 1 else pd.Timedelta(hours=1)
        age = (now - (df.index[-1] + step)).total_seconds()      # bar is indexed by its open
        if age > max_age_s:
            raise BadData(f"{name}: newest bar closed {age / 3600:.1f}h ago (stale)")
    return df


def closed_only(df: pd.DataFrame, now: pd.Timestamp) -> pd.DataFrame:
    """Drop a bar that is still forming; decisions only use closed bars."""
    if len(df) < 2:
        return df
    step = df.index[-1] - df.index[-2]
    return df[df.index + step <= now]


def atr(daily: pd.DataFrame, n: int = C.ATR_DAYS) -> pd.Series:
    prev = daily["close"].shift(1)
    tr = pd.concat([daily["high"] - daily["low"], (daily["high"] - prev).abs(),
                    (daily["low"] - prev).abs()], axis=1).max(axis=1)
    return tr.rolling(n).mean()


@dataclass
class Read:
    """Everything the system believes about one coin at one moment."""
    coin: str
    as_of: str                      # close time of the last daily bar used
    hard: Dict[str, float] = field(default_factory=dict)
    derived: Dict[str, float] = field(default_factory=dict)
    regime: str = ""
    invalidation: List[str] = field(default_factory=list)


def read_coin(coin: str, daily: pd.DataFrame, hourly: Optional[pd.DataFrame] = None) -> Read:
    d = daily
    if len(d) < 230:                    # SMA200 plus its 21-day slope
        raise BadData(f"{coin}: {len(d)} daily bars, need 230")
    c = d["close"]
    last = d.index[-1]
    a = atr(d)
    tr_today = max(d["high"].iloc[-1] - d["low"].iloc[-1], abs(d["high"].iloc[-1] - c.iloc[-2]),
                   abs(d["low"].iloc[-1] - c.iloc[-2]))
    sma200 = c.rolling(200).mean()
    vol30 = c.pct_change().rolling(30).std().iloc[-1] * math.sqrt(365)
    r28 = c.iloc[-1] / c.iloc[-1 - C.LOOKBACK_DAYS] - 1 if len(c) > C.LOOKBACK_DAYS else float("nan")
    r7 = c.iloc[-1] / c.iloc[-8] - 1 if len(c) > 7 else float("nan")
    usd_vol = (d["volume"] * c).rolling(30).median().iloc[-1]
    vol_med90 = (c.pct_change().rolling(30).std() * math.sqrt(365)).rolling(90).median().iloc[-1]

    trend = "up" if c.iloc[-1] > sma200.iloc[-1] and sma200.iloc[-1] > sma200.iloc[-21] else (
        "down" if c.iloc[-1] < sma200.iloc[-1] and sma200.iloc[-1] < sma200.iloc[-21] else "mixed")
    volstate = "volatile" if vol30 > 1.25 * vol_med90 else ("calm" if vol30 < 0.8 * vol_med90 else "normal")

    r = Read(coin=coin, as_of=str(last + pd.Timedelta(days=1)))
    r.hard = {"close": float(c.iloc[-1]), "high": float(d["high"].iloc[-1]),
              "low": float(d["low"].iloc[-1]), "volume": float(d["volume"].iloc[-1])}
    if hourly is not None and len(hourly):
        r.hard["last_hourly_close"] = float(hourly["close"].iloc[-1])
    r.derived = {
        "ret_28d": float(r28), "ret_7d": float(r7), "atr20": float(a.iloc[-1]),
        "atr20_pct": float(a.iloc[-1] / c.iloc[-1]), "true_range_today": float(tr_today),
        "realized_vol_30d": float(vol30), "realized_vol_median_90d": float(vol_med90),
        "sma200": float(sma200.iloc[-1]), "dist_sma200": float(c.iloc[-1] / sma200.iloc[-1] - 1),
        "drawdown_90d": float(c.iloc[-1] / c.iloc[-90:].max() - 1),
        "liquidity_usd_30d_median": float(usd_vol),
        "vol_spike": float(tr_today > C.VOL_SPIKE_MULT * a.iloc[-1]),
    }
    bad = [k for k, v in r.derived.items() if not math.isfinite(v)]
    if bad:
        raise BadData(f"{coin}: derived values not finite: {', '.join(bad)}")
    r.regime = f"trend {trend}, volatility {volstate}"
    if r28 <= 0:
        r.invalidation.append("28-day return is not positive: the rule holds cash at the next rebalance")
    if r.derived["vol_spike"]:
        r.invalidation.append("today's range is over 3x ATR: no new entries today")
    if usd_vol < 1e8:
        r.invalidation.append("median daily volume under $100M: liquidity too thin for this system")
    return r


def fetch(now: Optional[pd.Timestamp] = None) -> Dict[str, Dict[str, pd.DataFrame]]:
    """Daily and hourly closed bars for every coin, validated. Raises BadData."""
    from core.binance_data import candles
    now = now or pd.Timestamp.now(tz="UTC")
    out = {}
    for coin, sym in C.SYMBOLS.items():
        try:
            d = candles(sym, "2018-01-01", "1d", verbose=False)
            h = candles(sym, (now - pd.Timedelta(days=10)).strftime("%Y-%m-%d"), "1h", verbose=False)
        except Exception as e:          # network, exchange or parse failure
            raise BadData(f"{coin}: feed error {type(e).__name__}: {e}") from e
        d, h = closed_only(d, now), closed_only(h, now)
        validate_bars(d, f"{coin} daily")
        validate_bars(h, f"{coin} hourly", now=now, max_age_s=C.STALE_HOURLY_SECONDS)
        out[coin] = {"daily": d, "hourly": h}
    return out


def report(reads: Dict[str, Read]) -> str:
    lines = ["# Research read", ""]
    for r in reads.values():
        lines.append(f"## {r.coin} (daily close {r.as_of})")
        lines.append(f"- regime: {r.regime}")
        lines.append("- hard: " + ", ".join(f"{k} {v:,.2f}" for k, v in r.hard.items()))
        lines.append("- derived: " + ", ".join(
            f"{k} {v:.2%}" if ("ret" in k or "pct" in k or "vol_" in k or "dist" in k or "drawdown" in k)
            else f"{k} {v:,.2f}" for k, v in r.derived.items()))
        for i in r.invalidation:
            lines.append(f"- invalidation: {i}")
        lines.append("")
    lines.append("## Needs human review (not measured, never traded on)")
    lines += [f"- [ ] {h}" for h in HUMAN_REVIEW]
    return "\n".join(lines)
