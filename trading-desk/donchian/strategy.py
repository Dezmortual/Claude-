"""
strategy.py — SOL Donchian
==========================
A port of sol_donchian_indicator.pine at the repo root, the indicator version
of the "SOL Donchian OOS 2025-2026" TradingView strategy.

  entry long    close above the highest high of the previous `breakout_len`
                bars, close above the `sma_len` SMA, and ATR above its own
                `vol_len` average
  entry short   the mirror image: close below the prior channel low, below the
                SMA, ATR above its average
  fill          the signal bar's close (Pine: process_orders_on_close=true)
  hard stop     `stop_mult` x ATR from the entry
  trailing stop arms once price moves `trail_mult` x ATR in the trade's favour,
                then follows the best price by that distance
  one position per symbol

Two differences from the Pine version, both deliberate:

  1. Pine re-places its exits every bar using the previous bar's ATR, so the
     hard stop and trail distance drift as volatility changes. Here both are
     fixed from the ATR at entry. R is then measured against a risk that was
     actually known when the trade was opened.
  2. Pine without bar magnifier lets a bar's own high move the trailing stop
     before checking its low. On a daily bar the order of the high and the low
     is unknown, so the default here trails only from bars already closed. The
     Pine behaviour is available as --trail-mode same_bar, to measure how much
     it flatters the result.

Nothing in here filters by context. That belongs to the decision layer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import numpy as np
import pandas as pd

from contracts import Action, Snapshot
from decision import JevPrompt


@dataclass
class DonchianConfig:
    # Defaults are the Pine script's inputs, unchanged.
    atr_len: int = 14
    trail_mult: float = 0.02      # trail distance in ATRs
    stop_mult: float = 1.5        # hard stop distance in ATRs
    sma_len: int = 200
    breakout_len: int = 20
    vol_len: int = 20
    slope_len: int = 20           # gates only: bars over which SMA slope is read


FEATURE_COLS = [
    "breakout_atr", "sma_dist_atr", "sma_slope_atr", "atr_ratio",
    "channel_width_atr", "atr_pct",
]


def wilder_atr(df: pd.DataFrame, n: int) -> pd.Series:
    """
    Pine's ta.atr: true range smoothed with Wilder's RMA (alpha = 1/n).
    Causal: true range at bar t uses t's high/low and t-1's close only, and the
    RMA is a recursive average of past and current values.
    """
    prev_close = df["close"].shift(1)
    tr = pd.concat([
        df["high"] - df["low"],
        (df["high"] - prev_close).abs(),
        (df["low"] - prev_close).abs(),
    ], axis=1).max(axis=1)
    return tr.ewm(alpha=1.0 / n, adjust=False, min_periods=n).mean()


class DonchianStrategy:
    name = "donchian"

    def __init__(self, cfg: Optional[DonchianConfig] = None):
        self.cfg = cfg or DonchianConfig()
        self.feature_cols = FEATURE_COLS

    # ------------------------------------------------------------ prep

    def prepare(self, df: pd.DataFrame) -> pd.DataFrame:
        """Daily OHLCV in, a plan with signal/stop/target/trail/features out."""
        cfg = self.cfg
        out = df.copy()
        # Crypto trades around the clock; there is no session to flatten at.
        out["minutes_from_open"] = 0.0

        # Causal: rolling mean of closes ending at the current bar, never centred.
        out["sma"] = out["close"].rolling(cfg.sma_len, min_periods=cfg.sma_len).mean()
        # Causal: see wilder_atr.
        out["atr"] = wilder_atr(out, cfg.atr_len)
        # Causal: rolling mean of ATR values up to and including this bar.
        out["atr_avg"] = out["atr"].rolling(cfg.vol_len, min_periods=cfg.vol_len).mean()
        # Causal: shift(1) first, so the channel is the PREVIOUS breakout_len bars
        # and excludes the bar being tested (Pine: ta.highest(high, n)[1]).
        out["chan_hi"] = out["high"].shift(1).rolling(cfg.breakout_len,
                                                      min_periods=cfg.breakout_len).max()
        out["chan_lo"] = out["low"].shift(1).rolling(cfg.breakout_len,
                                                     min_periods=cfg.breakout_len).min()
        # Causal: SMA now versus SMA slope_len bars ago, both already computed.
        out["sma_slope"] = out["sma"] - out["sma"].shift(cfg.slope_len)

        c = out["close"]
        vol_ok = out["atr"] > out["atr_avg"]
        # Strict inequalities everywhere: a close exactly on the channel edge or
        # the SMA is not a breakout. Decided here, in one place.
        long_c = (c > out["chan_hi"]) & (c > out["sma"]) & vol_ok
        short_c = (c < out["chan_lo"]) & (c < out["sma"]) & vol_ok

        # Drop candidates with any missing input rather than filling with zero.
        needed = ["sma", "atr", "atr_avg", "chan_hi", "chan_lo", "sma_slope"]
        complete = out[needed].notna().all(axis=1) & (out["atr"] > 0)

        side = np.where(long_c & complete, 1, np.where(short_c & complete, -1, 0))
        out["signal"] = np.select([side == 1, side == -1], ["long", "short"], default="")

        atr = out["atr"]
        out["stop"] = np.where(side != 0, c - side * cfg.stop_mult * atr, np.nan)
        # No profit target: exits are the hard stop or the trailing stop.
        out["target"] = np.nan
        out["trail"] = np.where(side != 0, cfg.trail_mult * atr, np.nan)

        # Features, side-adjusted so positive always means "in the trade's favour".
        sgn = pd.Series(np.where(side == 0, np.nan, side), index=out.index)
        edge = np.where(side == 1, out["chan_hi"], out["chan_lo"])
        out["breakout_atr"] = sgn * (c - edge) / atr
        out["sma_dist_atr"] = sgn * (c - out["sma"]) / atr
        out["sma_slope_atr"] = sgn * out["sma_slope"] / atr
        out["atr_ratio"] = atr / out["atr_avg"]
        out["channel_width_atr"] = (out["chan_hi"] - out["chan_lo"]) / atr
        out["atr_pct"] = atr / c
        return out

    # -------------------------------------------------------- snapshot

    def snapshot(self, symbol: str, ts: pd.Timestamp, row: pd.Series) -> Snapshot:
        side = str(row["signal"])
        proposed = Action.ENTER_LONG if side == "long" else Action.ENTER_SHORT
        feats = {c: float(row[c]) for c in self.feature_cols if pd.notna(row.get(c))}
        cfg = self.cfg

        def g(k: str) -> float:
            return float(row[k])

        edge_word = "above the prior high" if side == "long" else "below the prior low"
        slope = g("sma_slope_atr")
        lines = [
            f"Symbol: {symbol}",
            f"Date: {ts.strftime('%Y-%m-%d')} (daily bar)",
            f"Price: {g('close'):.2f}",
            f"Breakout: closed {g('breakout_atr'):.2f} ATR {edge_word} of the last "
            f"{cfg.breakout_len} days (channel {g('chan_lo'):.2f} to {g('chan_hi'):.2f}, "
            f"{g('channel_width_atr'):.2f} ATR wide)",
            f"Trend: price is {g('sma_dist_atr'):.2f} ATR on the trade's side of the "
            f"{cfg.sma_len}-day SMA, and that SMA has moved {slope:+.2f} ATR in the "
            f"trade's direction over the last {cfg.slope_len} days",
            f"Volatility: ATR is {g('atr_ratio'):.2f}x its {cfg.vol_len}-day average, "
            f"{g('atr_pct')*100:.1f}% of price",
            f"Planned hard stop: {g('stop'):.2f} ({cfg.stop_mult} ATR away); a trailing "
            f"stop {cfg.trail_mult} ATR behind the best price arms once the trade "
            f"moves that far in its favour. There is no profit target.",
            "Position: flat",
        ]
        return Snapshot(
            symbol=symbol, timestamp=ts, price=g("close"), proposed=proposed,
            features=feats, context_lines=lines, stop=g("stop"), target=None,
        )

    # ----------------------------------------------------------- gates

    def gates(self, max_breakout_atr: float = 1.0) -> List:
        """
        The control arm. Two judgement calls a trend follower makes by eye,
        written before any result was seen:

          the long-term average should be moving the trade's way, not just be
          on the right side of price
          a bar that has already run far past the channel is a chase: the
          1.5 ATR stop then sits inside the breakout move itself
        """
        def trend_gate(s: Snapshot) -> Optional[str]:
            if s.f("sma_slope_atr") <= 0:
                return "sma_not_turning_with_trade"
            return None

        def extension_gate(s: Snapshot) -> Optional[str]:
            if s.f("breakout_atr") > max_breakout_atr:
                return "chased_too_far"
            return None

        return [trend_gate, extension_gate]

    # ------------------------------------------------------ jev prompt

    def jev_prompt(self) -> JevPrompt:
        return JevPrompt(
            entry_instructions=(
                "A daily Donchian breakout system on a crypto asset has fired and wants "
                "to enter at today's close, with a hard stop {stop} ATR away and a very "
                "tight trailing stop. Many breakouts fail within a day or two and "
                "reverse into the old range. Using only the state above, decide whether "
                "to take this trade now or stand aside."
            ).format(stop=self.cfg.stop_mult),
            entry_criteria={
                Action.ENTER_LONG.value:
                    "The upside breakout is likely to follow through over the next few "
                    "days. Buy now.",
                Action.ENTER_SHORT.value:
                    "The downside breakout is likely to follow through over the next few "
                    "days. Sell short now.",
                Action.WAIT.value:
                    "This breakout is likely to fail or the setup is not clean enough to "
                    "risk capital on. Take no position.",
            },
        )
