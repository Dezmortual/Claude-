"""
setups.py  --  the setups of "MMC Footprint" (D'Operandi Capital notes), as
fixed rules. Every decision uses completed bars only.

Swing points: a swing high is a high strictly above the `PIV` highs on each
side, known `PIV` bars later (likewise swing lows). PIV = 3.

1. 2B with pokebar (notes p.2-3)
   top     a swing high H1 is set; a later bar (the pokebar) is the first to
           close above H1, within 60 bars of it and no more than 1 ATR(14)
           above it ("two close-by tops"); then, within 5 bars, a bearish
           candle closes below the pokebar's low: sell at that close
   stop    the high of the second top (highest high from the pokebar to the
           signal bar)
   target  none given in the notes: 2R
   bottom  the mirror image
   gated   "best traded in line with a dominant daily chart trend": tops only
           when the last daily close is below its 50-day EMA, bottoms only
           above it

2. Divergence at the second touch (notes p.9-10)
   bearish two consecutive swing highs within 50 bars, the second higher in
           price but lower in RSI(14); at the bar the second is confirmed,
           if the close is still below it, sell at the close
   stop    the second swing high; target 2R
   bullish the mirror image

3. MMC footprint with leverage (notes p.11-12): see footprint.py
"""

from __future__ import annotations

import numpy as np
import pandas as pd

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "carter20"))
from indicators import ema, htf, rsi                                 # noqa: E402

PIV = 3


def atr(x: pd.DataFrame, n: int = 14) -> pd.Series:
    c = x["close"]
    tr = pd.concat([x["high"] - x["low"], (x["high"] - c.shift()).abs(), (x["low"] - c.shift()).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def pivots(x: pd.DataFrame, L: int = PIV):
    """(is_high, is_low) arrays marking the bar where a swing is CONFIRMED, plus
    the swing's own bar index."""
    h, l = x["high"].to_numpy(), x["low"].to_numpy()
    n = len(h)
    ph = np.zeros(n, bool)
    pl = np.zeros(n, bool)
    for i in range(2 * L, n):
        m = i - L
        win_h = np.r_[h[m - L:m], h[m + 1:i + 1]]
        win_l = np.r_[l[m - L:m], l[m + 1:i + 1]]
        ph[i] = h[m] > win_h.max()
        pl[i] = l[m] < win_l.min()
    return ph, pl


def daily_trend(x: pd.DataFrame):
    d = htf(x, "1D", lambda b: pd.DataFrame({"up": b["close"] > ema(b["close"], 50),
                                              "dn": b["close"] < ema(b["close"], 50)}))
    return d["up"].fillna(False).astype(bool), d["dn"].fillna(False).astype(bool)


def s2b(x: pd.DataFrame, gated: bool = False, rr: float = 2.0) -> dict:
    o, h, l, c = (x[k].to_numpy() for k in ("open", "high", "low", "close"))
    a = atr(x).to_numpy()
    ph, pl = pivots(x)
    n = len(c)
    short, long_ = np.zeros(n, bool), np.zeros(n, bool)
    stop_s, stop_l = np.full(n, np.nan), np.full(n, np.nan)
    H1 = L1 = None          # (level, swing bar)
    pokeH = pokeL = None    # (pokebar index, pokebar low/high, highest high / lowest low since)
    for i in range(n):
        if ph[i]:
            H1 = (h[i - PIV], i - PIV)
        if pl[i]:
            L1 = (l[i - PIV], i - PIV)
        # -- top: pokebar, then a bearish close below its low --
        if pokeH is not None:
            j, plow, hh = pokeH
            hh = max(hh, h[i])
            if i - j > 5:
                pokeH = None
            elif i > j and c[i] < o[i] and c[i] < plow:
                short[i], stop_s[i] = True, hh
                pokeH = None
            else:
                pokeH = (j, plow, hh)
        if pokeH is None and H1 is not None and c[i] > H1[0] and i - H1[1] <= 60:
            if h[i] - H1[0] <= a[i]:
                pokeH = (i, l[i], h[i])
            H1 = None                                                    # one break per swing
        # -- bottom: the mirror --
        if pokeL is not None:
            j, phigh, ll = pokeL
            ll = min(ll, l[i])
            if i - j > 5:
                pokeL = None
            elif i > j and c[i] > o[i] and c[i] > phigh:
                long_[i], stop_l[i] = True, ll
                pokeL = None
            else:
                pokeL = (j, phigh, ll)
        if pokeL is None and L1 is not None and c[i] < L1[0] and i - L1[1] <= 60:
            if L1[0] - l[i] <= a[i]:
                pokeL = (i, h[i], l[i])
            L1 = None
    idx = x.index
    L, S = pd.Series(long_, idx), pd.Series(short, idx)
    if gated:
        up, dn = daily_trend(x)
        L, S = L & up, S & dn
    cs = x["close"]
    sl, ss = pd.Series(stop_l, idx), pd.Series(stop_s, idx)
    return {"long": L, "short": S, "stop_long": sl, "stop_short": ss,
            "tgt_long": cs + rr * (cs - sl), "tgt_short": cs - rr * (ss - cs)}


def sdiv(x: pd.DataFrame, rr: float = 2.0) -> dict:
    h, l, c = (x[k].to_numpy() for k in ("high", "low", "close"))
    r = rsi(x["close"], 14).to_numpy()
    ph, pl = pivots(x)
    n = len(c)
    short, long_ = np.zeros(n, bool), np.zeros(n, bool)
    stop_s, stop_l = np.full(n, np.nan), np.full(n, np.nan)
    lastH = lastL = None
    for i in range(n):
        if ph[i]:
            m = i - PIV
            if lastH is not None and m - lastH <= 50 and h[m] > h[lastH] and r[m] < r[lastH] and c[i] < h[m]:
                short[i], stop_s[i] = True, h[m]
            lastH = m
        if pl[i]:
            m = i - PIV
            if lastL is not None and m - lastL <= 50 and l[m] < l[lastL] and r[m] > r[lastL] and c[i] > l[m]:
                long_[i], stop_l[i] = True, l[m]
            lastL = m
    idx, cs = x.index, x["close"]
    sl, ss = pd.Series(stop_l, idx), pd.Series(stop_s, idx)
    return {"long": pd.Series(long_, idx), "short": pd.Series(short, idx), "stop_long": sl, "stop_short": ss,
            "tgt_long": cs + rr * (cs - sl), "tgt_short": cs - rr * (ss - cs)}
