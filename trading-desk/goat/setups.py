"""
setups.py  --  the three setups of "FX GOAT: NASDAQ Trading Strategy" as fixed
rules on NASDAQ-100 bars. Every decision uses completed bars only.

Shared pieces
  swing high/low   a high/low beyond the PIV = 3 bars on each side, known PIV
                   bars later ("mark your previous high/low")
  near             within 0.25 x ATR(14) of a level counts as a retest
  rejection        a candle that closes back on the right side of the level
                   and is either a close in the trade's direction or has a
                   wick at least twice its body toward the level
  day direction    "wait for NASDAQ to pick a direction for the day": buys only
                   while price is above the day's open (00:00 UTC), sells
                   only below it
  stop             "5 points away from your previous support or resistance",
                   beyond the retest bar's wick if that went further

1. V pattern and inverse (p.3-6)
   long    a swing low L, then a swing high at least 1 ATR above it (price
           moved away), then price comes back, retests L without closing
           below it and rejects: buy at the close. Target: that swing high
           ("target previous highs and lows"). One trade per swing low.
2. Z pattern (p.7-12)
   long    price closes above the latest swing high H (the breakout); within
           30 bars it pulls back to retest H and rejects: buy at the close.
           Target: the highest high since the breakout (the top of the Z).
3. Support and resistance with rejection candles (p.13-23)
   long    a hammer (lower wick >= 2 x body, upper wick <= body) whose low
           retests one of the last 10 swing lows and closes above it: buy.
           Stop 5 points under the hammer's wick; target the nearest swing
           high above the entry ("buy at support, sell at resistance").
Sells mirror each rule.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "carter20"))

PIV, NEAR, PTS = 3, 0.25, 5.0


def atr(x: pd.DataFrame, n: int = 14) -> np.ndarray:
    c = x["close"]
    tr = pd.concat([x["high"] - x["low"], (x["high"] - c.shift()).abs(), (x["low"] - c.shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean().to_numpy()


def pivots(h: np.ndarray, l: np.ndarray):
    n = len(h)
    ph, pl = np.zeros(n, bool), np.zeros(n, bool)
    for i in range(2 * PIV, n):
        m = i - PIV
        wh = np.r_[h[m - PIV:m], h[m + 1:i + 1]]
        wl = np.r_[l[m - PIV:m], l[m + 1:i + 1]]
        ph[i], pl[i] = h[m] > wh.max(), l[m] < wl.min()
    return ph, pl


def _base(x: pd.DataFrame):
    o, h, l, c = (x[k].to_numpy() for k in ("open", "high", "low", "close"))
    day = x.index.normalize()
    day_open = x["open"].groupby(day).transform("first").to_numpy()
    body = np.abs(c - o)
    lw, uw = np.minimum(o, c) - l, h - np.maximum(o, c)
    return o, h, l, c, day_open, body, lw, uw


def _out(x, n):
    return {"long": np.zeros(n, bool), "short": np.zeros(n, bool), "stop_long": np.full(n, np.nan),
            "stop_short": np.full(n, np.nan), "tgt_long": np.full(n, np.nan), "tgt_short": np.full(n, np.nan)}


def _series(x, d):
    return {k: pd.Series(v, index=x.index) for k, v in d.items()}


def vpattern(x: pd.DataFrame) -> dict:
    o, h, l, c, dopen, body, lw, uw = _base(x)
    a = atr(x)
    ph, pl = pivots(h, l)
    n = len(c)
    d = _out(x, n)
    lowL = highH = None              # (level, bar, swing-away level or None)
    for i in range(n):
        if pl[i]:
            lowL = [l[i - PIV], i - PIV, None]
        if ph[i]:
            highH = [h[i - PIV], i - PIV, None]
            if lowL is not None and h[i - PIV] >= lowL[0] + a[i] and i - PIV > lowL[1]:
                lowL[2] = h[i - PIV]                      # moved away from the low: the V's left top
        if pl[i] and highH is not None and l[i - PIV] <= highH[0] - a[i] and i - PIV > highH[1]:
            highH[2] = l[i - PIV]
        # long: back to the swing low, respected, rejected
        if lowL is not None and lowL[2] is not None and not pl[i]:
            lvl, tgt = lowL[0], lowL[2]
            if l[i] <= lvl + NEAR * a[i] and c[i] > lvl and (c[i] > o[i] or lw[i] >= 2 * body[i]) \
                    and c[i] > dopen[i] and tgt > c[i]:
                d["long"][i], d["stop_long"][i], d["tgt_long"][i] = True, min(lvl, l[i]) - PTS, tgt
                lowL = None
            elif c[i] < lvl:
                lowL = None                               # closed through: not respected
        if highH is not None and highH[2] is not None and not ph[i]:
            lvl, tgt = highH[0], highH[2]
            if h[i] >= lvl - NEAR * a[i] and c[i] < lvl and (c[i] < o[i] or uw[i] >= 2 * body[i]) \
                    and c[i] < dopen[i] and tgt < c[i]:
                d["short"][i], d["stop_short"][i], d["tgt_short"][i] = True, max(lvl, h[i]) + PTS, tgt
                highH = None
            elif c[i] > lvl:
                highH = None
    return _series(x, d)


def zpattern(x: pd.DataFrame) -> dict:
    o, h, l, c, dopen, body, lw, uw = _base(x)
    a = atr(x)
    ph, pl = pivots(h, l)
    n = len(c)
    d = _out(x, n)
    H = L = None                     # latest unbroken swing high / low
    up = dn = None                   # (level, breakout bar, extreme since)
    for i in range(n):
        if ph[i]:
            H = h[i - PIV]
        if pl[i]:
            L = l[i - PIV]
        if up is not None:
            lvl, b, top = up
            top = max(top, h[i])
            if i - b > 30 or c[i] < lvl - a[i]:
                up = None
            elif i > b and l[i] <= lvl + NEAR * a[i] and c[i] > lvl and (c[i] > o[i] or lw[i] >= 2 * body[i]) \
                    and c[i] > dopen[i] and top > c[i]:
                d["long"][i], d["stop_long"][i], d["tgt_long"][i] = True, min(lvl, l[i]) - PTS, top
                up = None
            else:
                up = (lvl, b, top)
        if dn is not None:
            lvl, b, bot = dn
            bot = min(bot, l[i])
            if i - b > 30 or c[i] > lvl + a[i]:
                dn = None
            elif i > b and h[i] >= lvl - NEAR * a[i] and c[i] < lvl and (c[i] < o[i] or uw[i] >= 2 * body[i]) \
                    and c[i] < dopen[i] and bot < c[i]:
                d["short"][i], d["stop_short"][i], d["tgt_short"][i] = True, max(lvl, h[i]) + PTS, bot
                dn = None
            else:
                dn = (lvl, b, bot)
        if H is not None and c[i] > H and (i == 0 or c[i - 1] <= H):
            up, H = (H, i, h[i]), None
        if L is not None and c[i] < L and (i == 0 or c[i - 1] >= L):
            dn, L = (L, i, l[i]), None
    return _series(x, d)


def srcandle(x: pd.DataFrame) -> dict:
    o, h, l, c, dopen, body, lw, uw = _base(x)
    a = atr(x)
    ph, pl = pivots(h, l)
    n = len(c)
    d = _out(x, n)
    lows, highs = [], []             # (bar, level) of confirmed swings
    for i in range(n):
        if pl[i]:
            lows = (lows + [(i - PIV, l[i - PIV])])[-10:]
        if ph[i]:
            highs = (highs + [(i - PIV, h[i - PIV])])[-10:]
        hammer = lw[i] >= 2 * max(body[i], 1e-9) and uw[i] <= body[i]
        star = uw[i] >= 2 * max(body[i], 1e-9) and lw[i] <= body[i]
        if hammer:
            sup = [v for b, v in lows if i - b >= 5 and abs(l[i] - v) <= NEAR * a[i] and c[i] > v]
            res = [v for b, v in highs if v > c[i]]
            if sup and res:
                d["long"][i], d["stop_long"][i], d["tgt_long"][i] = True, l[i] - PTS, min(res)
        if star:
            res = [v for b, v in highs if i - b >= 5 and abs(h[i] - v) <= NEAR * a[i] and c[i] < v]
            sup = [v for b, v in lows if v < c[i]]
            if res and sup:
                d["short"][i], d["stop_short"][i], d["tgt_short"][i] = True, h[i] + PTS, max(sup)
    return _series(x, d)


SETUPS = {"v": ("V pattern and inverse", vpattern), "z": ("Z pattern (break and retest)", zpattern),
          "sr": ("Support/resistance + rejection candle", srcandle)}
