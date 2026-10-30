"""
strategy.py — Successful Breakout Trading
=========================================
Sinisa Persic, "Successful Breakout Trading: A Practical Guide" (2013), turned
into fixed rules on daily bars. The author picks patterns by eye and refines
entries on 5-60 minute charts; this is the mechanical core of his process.

  scan (book p.4 and flow chart)   2 <= close <= 2000, 63-day average volume
                                   >= 400k shares, close above its level 21
                                   sessions ago (1-month change > 0)
  base (a flat-topped consolidation under resistance, Part I and figs. 6-11)
    resistance R   highest high of the last `base_len` sessions
    tested         at least `touches` sessions in that window with a high within
                   `touch_tol` of R, the oldest at least `min_age` sessions ago,
                   so R is a level price has tried before, not today's new high
    tight          (R - lowest low of the window) / R <= `max_depth`
    approaching    close within `near` of R, and still below it
    uptrend        close above the 50-day SMA
  entry            buy stop at R x (1 + `entry_buf`) for the next session only
                   (the flow chart's order "expires the following day"); the
                   setup is re-checked every close, so the order is renewed for
                   as long as the pattern holds
  initial stop     lowest low of the last `stop_len` sessions x (1 - `entry_buf`),
                   below the support line of the base
  two halves (Part II, "Trade Management" flow chart)
    half 1         target T1 = trigger + `t1_r` x planned risk. "Up or out": if
                   T1 is not reached within `accel_bars` sessions of the entry,
                   half 1 is sold at that close
    half 2         target T2 = trigger + `t2_r` x planned risk. Keeps the initial
                   stop until T1 is hit, then trails at the lowest low of the
                   last `trail_len` sessions (below the latest consolidation)
    time stop      anything still open after `max_hold` sessions (the book's
                   1-20 day horizon) is sold at that close

Arms
  rules    the scan and the base
  gated    plus the book's context filters: S&P 500 (SPY) above its 50-day SMA
           ("stay in cash" otherwise, fig. 13) and Bollinger Band (20, 2) width
           in the bottom `bb_q` of its last 126 sessions (contraction before
           the expansion the book asks for, fig. 14)
  random   the control. Same stocks and scan, but no pattern: on a fixed
           pseudo-random 1 in `rand_every` scan-passing days it buys the next
           open with the same stop and exits. Today's S&P 500 members did well
           by construction, so a long-only rule must beat this to show an edge.

Sizing sanity: a setup whose stop sits under `min_risk` (1%) below the planned
entry is skipped in every arm; at 1% account risk it would need more than the
whole account. R is measured against the planned risk (planned entry to stop).

Not modelled: the earnings/FDA calendar filter, the intraday-chart confirmation,
hand-drawn trend lines and Fibonacci targets (T1/T2 as risk multiples stand in;
the book's own two trades had T1 at 0.5-0.9R and T2 at 1.4-2.5R).

Fills, all decided at a close and resting from the next open:
  - a stop order fills at its price, or at the open if price gaps through it
  - targets are limit orders: their price, or the open on a gap through them
  - a bar's high and low carry no order, so two readings bracket the truth:
      worst  on the entry bar only the stop can be hit after the fill; a later
             bar touching a half's stop and target takes the stop
      best   on the entry bar only targets can be hit; a later bar touching
             both takes the target
"""

from __future__ import annotations

import zlib
from dataclasses import dataclass
from typing import List, Optional

import numpy as np
import pandas as pd


@dataclass
class BOConfig:
    base_len: int = 15
    touches: int = 2
    touch_tol: float = 0.01
    min_age: int = 5
    max_depth: float = 0.12
    near: float = 0.03
    entry_buf: float = 0.001
    stop_len: int = 10
    t1_r: float = 1.0
    t2_r: float = 2.0
    accel_bars: int = 3
    trail_len: int = 5
    max_hold: int = 20
    bb_q: float = 0.30
    rand_every: int = 20
    min_risk: float = 0.01       # skip setups whose stop is under 1% below the planned entry
    arm: str = "rules"           # rules, gated or random
    intrabar: str = "worst"      # worst or best


def indicators(df: pd.DataFrame, cfg: BOConfig, spy_up: Optional[pd.Series] = None) -> pd.DataFrame:
    x = df[["open", "high", "low", "close", "volume"]].copy()
    h, l, c, v = x["high"], x["low"], x["close"], x["volume"]
    L = cfg.base_len
    # Causal: every rolling window ends at this bar.
    scan = (c >= 2) & (c <= 2000) & (v.rolling(63).mean() >= 400_000) & (c > c.shift(21))
    sma50 = c.rolling(50).mean()
    R = h.rolling(L).max()
    oldest = pd.Series(-1, index=x.index)
    count = pd.Series(0, index=x.index)
    for k in range(L):
        t = h.shift(k) >= R * (1 - cfg.touch_tol)
        count += t.astype(int)
        oldest = oldest.where(~t, k)          # largest k with a touch wins (loop runs upward)
    depth = (R - l.rolling(L).min()) / R
    base = ((count >= cfg.touches) & (oldest >= cfg.min_age) & (depth <= cfg.max_depth)
            & (c >= R * (1 - cfg.near)) & (c < R) & (c > sma50))
    x["R"] = R
    x["stop_lvl"] = l.rolling(cfg.stop_len).min() * (1 - cfg.entry_buf)
    x["trail"] = l.rolling(cfg.trail_len).min()
    x["scan"] = scan.fillna(False) & (c > sma50)

    if cfg.arm == "random":
        # Deterministic pseudo-random day pick, the same on every run.
        pick = np.array([zlib.crc32(d.strftime("%Y%m%d").encode()) % cfg.rand_every == 0 for d in x.index])
        x["setup"] = x["scan"] & pick
    else:
        setup = scan & base
        if cfg.arm == "gated":
            m = c.rolling(20).mean()
            bbw = 4 * c.rolling(20).std(ddof=0) / m
            squeeze = bbw <= bbw.rolling(126).quantile(cfg.bb_q)
            mkt = spy_up.reindex(x.index).ffill().fillna(False).astype(bool) if spy_up is not None else True
            setup = setup & squeeze & mkt
        x["setup"] = setup.fillna(False)
    return x


def simulate(df: pd.DataFrame, cfg: BOConfig, symbol: str = "", start: Optional[pd.Timestamp] = None,
             spy_up: Optional[pd.Series] = None) -> List[dict]:
    x = indicators(df, cfg, spy_up)
    ts = x.index
    o, h, l, c = (x[k].to_numpy() for k in ("open", "high", "low", "close"))
    R, stop_lvl, trail, setup = (x[k].to_numpy() for k in ("R", "stop_lvl", "trail", "setup"))
    first = 0 if start is None else int(np.searchsorted(ts, start))
    worst = cfg.intrabar == "worst"

    trades: List[dict] = []
    order = None              # (trigger or None for market-at-open, stop, t1, t2, setup bar, planned price)
    pos = None                # dict for the open trade

    def half_exit(i: int, stop: float, tgt: float, entry_bar: bool):
        hs, ht = l[i] <= stop, h[i] >= tgt
        if entry_bar:
            if worst and hs:
                return stop, "STOP"
            if not worst and ht:
                return tgt, "TARGET"
            return None
        if hs and o[i] <= stop:
            return o[i], "STOP"
        if ht and o[i] >= tgt:
            return o[i], "TARGET"
        if hs and ht:
            return (stop, "STOP") if worst else (tgt, "TARGET")
        if hs:
            return stop, "STOP"
        if ht:
            return tgt, "TARGET"
        return None

    def finish(i: int) -> None:
        p = pos
        trades.append({"symbol": symbol, "setup_time": ts[p["setup"]], "entry_time": ts[p["i_in"]],
                       "exit_time": ts[i], "entry": p["entry"], "plan": p["plan"], "stop": p["stop0"], "t1": p["t1"], "t2": p["t2"],
                       "exit1": p["x1"], "why1": p["w1"], "exit2": p["x2"], "why2": p["w2"],
                       "bars": i - p["i_in"]})

    for i in range(max(first, 1), len(x)):
        # --- 1. resting orders of an open trade (bars after the entry bar) ---
        if pos is not None and i > pos["i_in"]:
            if pos["x1"] is None:
                r = half_exit(i, pos["stop0"], pos["t1"], False)
                if r:
                    pos["x1"], pos["w1"] = r
                    pos["t1_hit"] = r[1] == "TARGET"
            if pos["x2"] is None:
                r = half_exit(i, pos["s2"], pos["t2"], False)
                if r:
                    pos["x2"], pos["w2"] = r

        # --- 2. entry order placed at the previous close ---
        if pos is None and order is not None:
            trig, stop, t1, t2, sb, plan = order
            fill = None
            if trig is None:
                fill = o[i]
            elif h[i] >= trig:
                fill = max(o[i], trig)
            if fill is not None and fill > stop:
                pos = {"i_in": i, "entry": fill, "plan": plan, "stop0": stop, "s2": stop, "t1": t1, "t2": t2, "setup": sb,
                       "x1": None, "w1": None, "x2": None, "w2": None, "t1_hit": False}
                r = half_exit(i, stop, t1, True)
                if r:
                    pos["x1"], pos["w1"] = r
                    pos["t1_hit"] = r[1] == "TARGET"
                r = half_exit(i, stop, t2, True)
                if r:
                    pos["x2"], pos["w2"] = r
        order = None

        # --- 3. decisions at the close ---
        if pos is not None:
            held = i - pos["i_in"]
            if pos["x1"] is None and held >= cfg.accel_bars:
                pos["x1"], pos["w1"] = c[i], "NO_ACCEL"
            if pos["t1_hit"] and pos["x2"] is None:
                pos["s2"] = max(pos["s2"], trail[i])
            if held >= cfg.max_hold:
                if pos["x1"] is None:
                    pos["x1"], pos["w1"] = c[i], "TIME"
                if pos["x2"] is None:
                    pos["x2"], pos["w2"] = c[i], "TIME"
            if pos["x1"] is not None and pos["x2"] is not None:
                finish(i)
                pos = None
        if pos is None and setup[i] and np.isfinite(stop_lvl[i]) and i + 1 < len(x):
            if cfg.arm == "random":
                # Market order at the next open; targets from the close as the planned price.
                risk = c[i] - stop_lvl[i]
                if risk >= cfg.min_risk * c[i]:
                    order = (None, stop_lvl[i], c[i] + cfg.t1_r * risk, c[i] + cfg.t2_r * risk, i, c[i])
            else:
                trig = R[i] * (1 + cfg.entry_buf)
                risk = trig - stop_lvl[i]
                if risk >= cfg.min_risk * trig:
                    order = (trig, stop_lvl[i], trig + cfg.t1_r * risk, trig + cfg.t2_r * risk, i, trig)
    return trades


def costs(trades: pd.DataFrame, slippage_bps: float) -> pd.DataFrame:
    """R per half, in units of the planned risk (planned entry to initial stop), so a
    fill that gaps far from the plan cannot make the unit tiny; the trade is the
    average of its two halves."""
    t = trades.copy()
    risk = t["plan"] - t["stop"]
    t["risk_pct"] = risk / t["plan"] * 100
    t["r1"] = (t["exit1"] - t["entry"]) / risk
    t["r2"] = (t["exit2"] - t["entry"]) / risk
    t["r_gross"] = (t["r1"] + t["r2"]) / 2
    t["ret_gross"] = ((t["exit1"] + t["exit2"]) / 2 - t["entry"]) / t["entry"] * 100
    cost_pct = 2 * slippage_bps / 100                     # both fills, per half, in %
    t["ret_net"] = t["ret_gross"] - cost_pct
    t["r_net"] = t["r_gross"] - cost_pct / t["risk_pct"]
    return t
