"""
strategy.py — Anti-Climax
=========================
A port of anti_climax_strategy.pine at the repo root, from Galen Woods, "Day
Trading with the Anti-Climax Pattern" (2014).

  pattern       the last `inc_n` rises in the high (bearish) or drops in the low
                (bullish) are all positive and each is strictly larger than the
                one before it. Default 3 increments, so four bars (book fig. 2-1).
  limit line    the pattern bar's high (bearish) or low (bullish)
  setup bar     if the pattern bar closes against the thrust (bearish bar for a
                bearish pattern), it is the setup bar; otherwise the next such
                bar is. A later such bar replaces it while the order is unfilled.
  entry         stop order at the setup bar's low (short) or high (long). The
                Pine script adds one tick; crypto tick sizes vary per pair, so
                this uses zero ticks and fills on a touch.
  invalid       a whole bar beyond the limit line (low above it for a short),
                or `expiry` bars after the pattern, cancels the setup
  stop          the limit line (Pine adds one tick here too)
  target        `target_r` x the planned risk from the trigger price
  opposite exit any opposite pattern closes the trade at that bar's close
  new pattern   replaces a pending setup on the other side, and a pending
                opposite entry that fills reverses an open trade

Arms (the gated filters are the book's context rules, ch. 2.2.2 and 2.4):
  rules   every pattern
  gated   the pattern's closes stay inside the last confirmed pivot (a bearish
          pattern does not close above the last pivot high) and the 50 EMA
          slopes with the trade (EMA below its value 5 bars ago for a short)

Orders follow Pine with process_orders_on_close=true: everything is decided at
a bar's close and stop orders rest from the next bar's open. Fills:
  - a stop order fills at its price, or at the open if the bar gaps through it
  - a bar's high and low carry no order, so where it matters there are two
    readings, run separately to bracket the truth:
      worst  on the entry bar only the stop can be hit after the fill; a later
             bar touching both stop and target takes the stop
      best   on the entry bar only the target can be hit; a later bar touching
             both takes the target
    A gap through either level at the open fills there in both readings.
  - the exit orders keep the levels set when the entry was placed, so a gap
    fill changes the realised risk, which R uses

Pivots: a pivot high is a high strictly above the `piv_len` highs on each side,
confirmed `piv_len` bars later (ta.pivothigh; Pine's tie handling is not
documented, this uses strict on both sides).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

import numpy as np
import pandas as pd


@dataclass
class ACConfig:
    # The Pine script's defaults.
    inc_n: int = 3
    expiry: int = 10
    piv_len: int = 5
    ema_len: int = 50
    slope_len: int = 5
    target_r: float = 2.0
    exit_opposite: bool = True
    gated: bool = True
    intrabar: str = "worst"      # order of a bar's high and low when it matters: worst or best
    warmup: int = 200            # bars skipped before any signal


def pine_ema(c: np.ndarray, n: int) -> np.ndarray:
    """ta.ema: na until n bars, seeded with the SMA, then recursive."""
    out = np.full(len(c), np.nan)
    if len(c) < n:
        return out
    a = 2.0 / (n + 1)
    out[n - 1] = c[:n].mean()
    for i in range(n, len(c)):
        out[i] = a * c[i] + (1 - a) * out[i - 1]
    return out


def indicators(df: pd.DataFrame, cfg: ACConfig) -> pd.DataFrame:
    x = df[["open", "high", "low", "close"]].copy()
    h, l, c = x["high"], x["low"], x["close"]
    n = cfg.inc_n
    # Causal: increments end at this bar.
    up = [h.shift(k) - h.shift(k + 1) for k in range(n)]
    dn = [l.shift(k + 1) - l.shift(k) for k in range(n)]
    bear = up[0] > 0
    bull = dn[0] > 0
    for k in range(1, n):
        bear &= (up[k] > 0) & (up[k - 1] > up[k])
        bull &= (dn[k] > 0) & (dn[k - 1] > dn[k])
    x["bear_ac"], x["bull_ac"] = bear.fillna(False), bull.fillna(False)

    # Causal: a pivot centred at i-L is known at bar i; keep the last one.
    L = cfg.piv_len
    hv, lv = h.to_numpy(), l.to_numpy()
    ph = np.full(len(x), np.nan)
    pl = np.full(len(x), np.nan)
    for i in range(2 * L, len(x)):
        m = i - L
        left_h, right_h = hv[m - L:m], hv[m + 1:i + 1]
        if hv[m] > left_h.max() and hv[m] > right_h.max():
            ph[i] = hv[m]
        left_l, right_l = lv[m - L:m], lv[m + 1:i + 1]
        if lv[m] < left_l.min() and lv[m] < right_l.min():
            pl[i] = lv[m]
    x["last_ph"] = pd.Series(ph, index=x.index).ffill()
    x["last_pl"] = pd.Series(pl, index=x.index).ffill()
    # Causal: closes of the pattern's bars, this one included.
    x["pat_hi_close"] = c.rolling(n + 1).max()
    x["pat_lo_close"] = c.rolling(n + 1).min()
    ema = pd.Series(pine_ema(c.to_numpy(), cfg.ema_len), index=x.index)
    x["ema_dn"] = ema < ema.shift(cfg.slope_len)
    x["ema_up"] = ema > ema.shift(cfg.slope_len)

    struct_bear = x["last_ph"].notna() & (x["pat_hi_close"] <= x["last_ph"])
    struct_bull = x["last_pl"].notna() & (x["pat_lo_close"] >= x["last_pl"])
    if cfg.gated:
        x["bear_sig"] = x["bear_ac"] & struct_bear & x["ema_dn"]
        x["bull_sig"] = x["bull_ac"] & struct_bull & x["ema_up"]
    else:
        x["bear_sig"], x["bull_sig"] = x["bear_ac"], x["bull_ac"]
    return x


def simulate(df: pd.DataFrame, cfg: ACConfig, symbol: str = "") -> List[dict]:
    x = indicators(df, cfg)
    ts = x.index
    o, h, l, c = (x[k].to_numpy() for k in ("open", "high", "low", "close"))
    bear_ac, bull_ac = x["bear_ac"].to_numpy(), x["bull_ac"].to_numpy()
    bear_sig, bull_sig = x["bear_sig"].to_numpy(), x["bull_sig"].to_numpy()

    trades: List[dict] = []
    pos, entry, stop, tgt, i_in = 0, np.nan, np.nan, np.nan, -1
    pend, limit, trig, pend_bar = 0, np.nan, np.nan, -1
    # The order resting during the current bar (placed at the previous close).
    o_side, o_trig, o_stop, o_tgt = 0, np.nan, np.nan, np.nan

    def close(i: int, px: float, reason: str) -> None:
        trades.append({"symbol": symbol, "side": "long" if pos > 0 else "short",
                       "pattern_time": ts[pat_i], "entry_time": ts[i_in], "exit_time": ts[i],
                       "entry": entry, "exit": px, "stop": stop, "target": tgt,
                       "reason": reason, "bars": i - i_in})

    def exit_hit(i: int, entry_bar: bool):
        """Exit price and reason on bar i, or (nan, "") if the trade survives it."""
        hs = l[i] <= stop if pos > 0 else h[i] >= stop
        ht = not np.isnan(tgt) and (h[i] >= tgt if pos > 0 else l[i] <= tgt)
        if entry_bar:
            # The fill came somewhere inside the bar; which extreme came after it is unknown.
            if cfg.intrabar == "worst" and hs:
                return stop, "STOP"
            if cfg.intrabar == "best" and ht:
                return tgt, "TARGET"
            return np.nan, ""
        if hs and (o[i] <= stop if pos > 0 else o[i] >= stop):
            return o[i], "STOP"                      # gapped through the stop
        if ht and (o[i] >= tgt if pos > 0 else o[i] <= tgt):
            return o[i], "TARGET"                    # gapped through the target
        if hs and ht:
            return (stop, "STOP") if cfg.intrabar == "worst" else (tgt, "TARGET")
        if hs:
            return stop, "STOP"
        if ht:
            return tgt, "TARGET"
        return np.nan, ""

    pat_i = -1
    for i in range(cfg.warmup, len(x)):
        # --- 1. resting exit orders of a trade entered on an earlier bar ---
        if pos != 0 and i > i_in:
            px, why = exit_hit(i, False)
            if why:
                close(i, px, why); pos = 0

        # --- 2. resting entry order ---
        if o_side != 0 and o_side != pos:
            hit = h[i] >= o_trig if o_side > 0 else l[i] <= o_trig
            if hit:
                fill = max(o[i], o_trig) if o_side > 0 else min(o[i], o_trig)
                if pos != 0:
                    close(i, fill, "REVERSE")
                pos, entry, stop, tgt, i_in = o_side, fill, o_stop, o_tgt, i
                pat_i = o_pat
                px, why = exit_hit(i, True)
                if why:
                    close(i, px, why); pos = 0

        # --- 3. decisions at the close, in the Pine script's order ---
        if pend != 0 and pend == pos:
            pend = 0
        if cfg.exit_opposite:
            if pos > 0 and bear_ac[i]:
                close(i, c[i], "OPP_AC"); pos = 0
            elif pos < 0 and bull_ac[i]:
                close(i, c[i], "OPP_AC"); pos = 0
        if pend == -1:
            if l[i] > limit or i - pend_bar > cfg.expiry:
                pend = 0
            elif c[i] < o[i]:
                trig = l[i]
        elif pend == 1:
            if h[i] < limit or i - pend_bar > cfg.expiry:
                pend = 0
            elif c[i] > o[i]:
                trig = h[i]
        if bear_sig[i]:
            pend, limit, pend_bar = -1, h[i], i
            trig = l[i] if c[i] < o[i] else np.nan
        elif bull_sig[i]:
            pend, limit, pend_bar = 1, l[i], i
            trig = h[i] if c[i] > o[i] else np.nan

        o_side = 0
        if pend != 0 and not np.isnan(trig) and trig != limit and pos != pend:
            o_side, o_trig, o_stop, o_pat = pend, trig, limit, pend_bar
            o_tgt = trig + cfg.target_r * (trig - limit) if cfg.target_r > 0 else np.nan

    return trades


def costs(trades: pd.DataFrame, commission_pct: float, slippage_bps: float) -> pd.DataFrame:
    """Returns in percent of notional and in R (realised risk = entry to stop)."""
    t = trades.copy()
    sgn = np.where(t["side"] == "long", 1.0, -1.0)
    t["ret_gross"] = sgn * (t["exit"] - t["entry"]) / t["entry"] * 100
    t["ret_comm"] = t["ret_gross"] - 2 * commission_pct
    t["ret_net"] = t["ret_comm"] - 2 * slippage_bps / 100
    risk_pct = (t["entry"] - t["stop"]).abs() / t["entry"] * 100
    t["risk_pct"] = risk_pct
    t["r_gross"] = t["ret_gross"] / risk_pct
    t["r_net"] = t["ret_net"] / risk_pct
    return t
