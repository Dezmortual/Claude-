"""
systems.py  --  Thomas Carter, "20 Forex Trading Strategies (5 Minute Time
Frame)" (2014), one function per system. Each takes 5-minute bars and the
pair's pip size and returns the signal dict engine.run expects. Every signal
is decided at a 5-minute close from completed bars only.

Where the book is vague, the plainest reading is used and written down here:
  - a pip range ("stop 10-15 pips") uses its midpoint, rounded down
  - "recent swing low/high" is the lowest low / highest high of the last 10 bars
  - a state rule with no trigger ("WMA above SMA, SAR below, DI+ above DI-")
    enters on the bar all its conditions first hold together
  - "trend" with no definition (system 3) is the slope of the 50 EMA over 10 bars
  - custom indicators the book does not define are left out and the system is
    flagged: GHL and QTI (system 5) and the arrow of system 15 (replaced by the
    close crossing the 15 EMA)
  - Bollinger "(20, 20)" in system 6 means 20 deviations, so "EMA 50 inside the
    bands" is always true; it is kept as written
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from indicators import (bands, cci, cross_dn, cross_up, di, ema, first, htf, laguerre, macd,
                        psar, rsi, sma, stoch, within, wma)

NAMES = {
    1: "Stochastic + MACD + EMA5 close/open",
    2: "EMA 10/21 zone pullback",
    3: "Bollinger close outside + stochastic",
    4: "Bollinger middle-band touch",
    5: "Shifted EMA ribbon, 15m/5m (no GHL/QTI)",
    6: "EMA 14/21/50 on 5m and 1h",
    7: "New York 08:00 box breakout",
    8: "Bollinger 50 + RSI 3 + stochastic reversal",
    9: "EMA 50/100 + MACD, half at 2R",
    10: "EMA 40/80 + CCI zero cross",
    11: "4h trend + EMA 5/10 cross + RSI/stoch/MACD",
    12: "EMA 16/48 + Laguerre",
    13: "CCI 100 break + MACD",
    14: "WMA/SMA + slow stoch + RSI 28 + MACD",
    15: "EMA 15 over EMA 50 high/low channel + MACD",
    16: "WMA 5/SMA 11 + Parabolic SAR + DI",
    17: "EMA 3/8 + SAR + MACD + stoch + std dev",
    18: "EMA 20 cross + MACD, half at 1R",
    19: "EMA 100 + SAR + MACD 64/128",
    20: "EMA 3 through Bollinger middle + MACD",
}

ANY = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD"]
PAIRS = {1: ["EURUSD"], 2: ["EURUSD"], 3: ["EURUSD", "GBPUSD", "USDJPY", "USDCHF"],
         4: ["EURUSD", "GBPUSD", "GBPJPY"], 5: ANY, 6: ["EURUSD"], 7: ["GBPJPY", "GBPUSD"],
         8: ANY, 9: ANY, 10: ANY, 11: ANY, 12: ANY, 13: ["EURUSD", "GBPUSD", "AUDUSD"], 14: ANY,
         15: ANY, 16: ["EURUSD", "GBPUSD", "AUDUSD", "USDCHF"], 17: ANY, 18: ANY,
         19: ["EURUSD", "GBPUSD", "AUDUSD"], 20: ANY}
PEND_BARS = {7: 12, 18: 6}          # how long a stop-entry order rests, in 5m bars


def fixed(x, p, sl_pips, tp_pips, long, short, **extra):
    c = x["close"]
    out = {"long": long, "short": short,
           "stop_long": c - sl_pips * p, "stop_short": c + sl_pips * p,
           "tgt_long": c + tp_pips * p, "tgt_short": c - tp_pips * p}
    out.update(extra)
    return out


def swing(x, p, long, short, rr=1.0, n=10, **extra):
    """Stop at the recent swing, target `rr` times that distance (NaN rr = no target)."""
    c = x["close"]
    sl, ss = x["low"].rolling(n).min(), x["high"].rolling(n).max()
    out = {"long": long, "short": short, "stop_long": sl, "stop_short": ss,
           "tgt_long": c + rr * (c - sl) if rr == rr else pd.Series(np.nan, index=x.index),
           "tgt_short": c - rr * (ss - c) if rr == rr else pd.Series(np.nan, index=x.index)}
    out.update(extra)
    return out


def s1(x, p, pair):
    c, o = x["close"], x["open"]
    K, D = stoch(x, 5, 3, 3)
    m, _ = macd(c, 12, 26, 1)
    ec, eo = ema(c, 5), ema(o, 5)
    long = cross_up(K, 20) & (K < 80) & (m > m.shift()) & (c > o) & (ec > eo)
    short = cross_dn(K, 80) & (K > 20) & (m < m.shift()) & (c < o) & (ec < eo)
    return {"long": long, "short": short, "stop_long": c - 20 * p, "stop_short": c + 20 * p,
            "exit_long": cross_dn(ec, eo), "exit_short": cross_up(ec, eo)}


def s2(x, p, pair):
    c, l, h = x["close"], x["low"], x["high"]
    e10, e21, e50 = ema(c, 10), ema(c, 21), ema(c, 50)
    hour = x.index.hour
    sess = pd.Series((hour >= 7) & (hour < 15), index=x.index)        # London + NY overlap, no Asia, no session ends
    up = (e10 > e21) & (e21 > e50) & (e50 > e50.shift(10)) & (h.rolling(12).max() > h.shift(12).rolling(12).max())
    dn = (e10 < e21) & (e21 < e50) & (e50 < e50.shift(10)) & (l.rolling(12).min() < l.shift(12).rolling(12).min())
    long = up & sess & (l <= e10) & (c >= e21) & (c > x["open"])       # dipped into the zone, turned up
    short = dn & sess & (h >= e10) & (c <= e21) & (c < x["open"])
    return fixed(x, p, 5 + 1, 10, long, short)                         # 5 pips + a 1-pip spread


def s3(x, p, pair):
    c, o = x["close"], x["open"]
    lo, mid, hi = bands(c, 20, 2)
    K, _ = stoch(x, 5, 3, 3)
    e = ema(c, 50)
    up, dn = e > e.shift(10), e < e.shift(10)
    long = up & (c < lo) & (K < 20) & (c < o)
    short = dn & (c > hi) & (K > 80) & (c > o)
    return fixed(x, p, 20, 10, long, short)


def s4(x, p, pair):
    c, l, h = x["close"], x["low"], x["high"]
    lo, mid, hi = bands(c, 20, 2)
    long = (mid > mid.shift()) & (l <= mid) & (l.shift() > mid.shift())
    short = (mid < mid.shift()) & (h >= mid) & (h.shift() < mid.shift())
    return {"long": long, "short": short,
            "stop_long": np.maximum(lo, c - 15 * p), "stop_short": np.minimum(hi, c + 15 * p),
            "tgt_long": hi, "tgt_short": lo}


def s5(x, p, pair):
    def ribbon(b):
        c = b["close"]
        return pd.DataFrame({"c": c, "e3": ema(c, 3).shift(1), "e5": ema(c, 5).shift(3),
                             "e15": ema(c, 15).shift(3), "e45": ema(c, 45).shift(3), "low": b["low"], "high": b["high"]})
    H = htf(x, "15min", ribbon)
    up_h = (H["e5"] > H["e15"]) & (H["e15"] > H["e45"])
    dn_h = (H["e5"] < H["e15"]) & (H["e15"] < H["e45"])
    full_up = up_h & (H["c"] > H["e3"]) & (H["e3"] > H["e5"])
    full_dn = dn_h & (H["c"] < H["e3"]) & (H["e3"] < H["e5"])
    touch_up = (H["low"] <= H["e5"]) & full_up.shift(3, fill_value=False)     # aligned, then pulled back to the 5 EMA
    touch_dn = (H["high"] >= H["e5"]) & full_dn.shift(3, fill_value=False)
    armed_up = within(first(touch_up), 36) & up_h                               # stays armed up to 3 hours
    armed_dn = within(first(touch_dn), 36) & dn_h
    R = ribbon(x)
    above = (x["close"] > R[["e3", "e5", "e15", "e45"]].max(axis=1)) & (R["e15"] > R["e45"])
    below = (x["close"] < R[["e3", "e5", "e15", "e45"]].min(axis=1)) & (R["e15"] < R["e45"])
    return swing(x, p, armed_up & first(above), armed_dn & first(below), rr=1.0)


def s6(x, p, pair):
    def cond(b):
        c = b["close"]
        e14, e21, e50 = ema(c, 14), ema(c, 21), ema(c, 50)
        lo, _, hi = bands(c, 20, 20)
        inside = (e50 > lo) & (e50 < hi)
        touch = ((b["low"] <= e14) & (b["high"] >= e14)) | ((b["low"] <= e21) & (b["high"] >= e21))
        return pd.DataFrame({"up": (e14 > e21) & (e21 > e50) & inside, "dn": (e14 < e21) & (e21 < e50) & inside,
                             "tu": touch & (c > b["open"]), "td": touch & (c < b["open"])})
    m5, h1 = cond(x), htf(x, "1h", cond).fillna(False).astype(bool)
    long = m5["up"] & h1["up"] & h1["tu"]
    short = m5["dn"] & h1["dn"] & h1["td"]
    c = x["close"]
    # No stop in the book: a 100-pip disaster stop, exit when the order breaks on either chart.
    return {"long": first(long), "short": first(short), "stop_long": c - 100 * p, "stop_short": c + 100 * p,
            "exit_long": ~(m5["up"] & h1["up"]), "exit_short": ~(m5["dn"] & h1["dn"])}


def s7(x, p, pair):
    ny = x.index.tz_convert("America/New_York")
    t = pd.Series(ny.hour * 60 + ny.minute, index=x.index)
    day = pd.Series(ny.date, index=x.index)
    in_box = (t >= 7 * 60) & (t < 8 * 60)
    bh = x["high"].where(in_box).groupby(day).transform("max")
    bl = x["low"].where(in_box).groupby(day).transform("min")
    place = (t == 7 * 60 + 55)                          # the 07:55 bar closes at 08:00: box complete, orders go in
    bh, bl = bh.where(place), bl.where(place)
    size = (bh - bl).ffill()                            # known from 08:00 on, kept until the next box
    # A buy stop and a sell stop, one cancels the other, valid for one hour. The stop
    # trails the best price since entry by one box height (the engine ratchets it).
    return {"pend_long": bh + 0.2 * size.where(place), "pend_short": bl - 0.2 * size.where(place),
            "stop_long": bl, "tgt_long": bh + 4 * size.where(place),
            "stop_short": bh, "tgt_short": bl - 4 * size.where(place),
            "trail_long": x["high"] - size, "trail_short": x["low"] + size}


def s8(x, p, pair):
    c = x["close"]
    lo2, mid, hi2 = bands(c, 50, 2)
    lo3, _, hi3 = bands(c, 50, 3)
    r = rsi(c, 3)
    K, D = stoch(x, 6, 3, 3)
    pre_l = (x["low"] <= lo2) & (r < 20) & (K < 20)
    pre_s = (x["high"] >= hi2) & (r > 80) & (K > 80)
    long = pre_l.shift(fill_value=False) & (c > lo2) & (r > 20) & cross_up(K, D) & (K < 40)
    short = pre_s.shift(fill_value=False) & (c < hi2) & (r < 80) & cross_dn(K, D) & (K > 60)
    return {"long": long, "short": short, "stop_long": lo3, "stop_short": hi3, "tgt_long": mid, "tgt_short": mid}


def s9(x, p, pair):
    c = x["close"]
    e50, e100 = ema(c, 50), ema(c, 100)
    m, _ = macd(c, 12, 26, 9)
    long = (c > e50) & (c > e100) & (c >= e50 + 10 * p) & within(cross_up(m, 0), 5)
    short = (c < e50) & (c < e100) & (c <= e50 - 10 * p) & within(cross_dn(m, 0), 5)
    return {"long": long, "short": short,
            "stop_long": x["low"].rolling(5).min(), "stop_short": x["high"].rolling(5).max(),
            "partial_r": 2.0, "exit_long": c < e50 - 10 * p, "exit_short": c > e50 + 10 * p}


def s10(x, p, pair):
    c = x["close"]
    e40, e80 = ema(c, 40), ema(c, 80)
    k = cci(x, 21)
    return fixed(x, p, 12, 12, (e40 > e80) & cross_up(k, 0), (e40 < e80) & cross_dn(k, 0))


def s11(x, p, pair):
    c = x["close"]
    H = htf(x, "4h", lambda b: pd.DataFrame({"up": ema(b["close"], 5) > ema(b["close"], 10),
                                             "dn": ema(b["close"], 5) < ema(b["close"], 10)})).fillna(False).astype(bool)
    e5, e10 = ema(c, 5), ema(c, 10)
    r = rsi(c, 14)
    K, _ = stoch(x, 5, 3, 3)
    m, s = macd(c, 12, 26, 9)
    hist = m - s
    long = H["up"] & cross_up(e5, e10) & (r > 50) & (K > K.shift()) & (K < 80) & (hist > hist.shift())
    short = H["dn"] & cross_dn(e5, e10) & (r < 50) & (K < K.shift()) & (K > 20) & (hist < hist.shift())
    return fixed(x, p, 25, 25, long, short)


def s12(x, p, pair):
    c = x["close"]
    e16, e48 = ema(c, 16), ema(c, 48)
    lg = laguerre(c, 0.5)
    return fixed(x, p, 30, 25, (c > e16) & (e16 > e48) & cross_up(lg, 0.8), (c < e16) & (e16 < e48) & cross_dn(lg, 0.2))


def s13(x, p, pair):
    c = x["close"]
    k = cci(x, 14)
    m, s = macd(c, 12, 26, 9)
    tp = {"EURUSD": 8, "GBPUSD": 10, "AUDUSD": 7}[pair]
    return fixed(x, p, 13, tp, cross_up(k, 100) & (s < m) & (m > m.shift()),
                 cross_dn(k, -100) & (s > m) & (m < m.shift()))


def s14(x, p, pair):
    c = x["close"]
    w, s20 = wma(c, 10), sma(c, 20)
    K, D = stoch(x, 10, 6, 6, d_ema=True)
    r = rsi(c, 28)
    m, _ = macd(c, 24, 52, 18)
    return swing(x, p, first((w > s20) & (K > D) & (r > 50) & (m > 0)), first((w < s20) & (K < D) & (r < 50) & (m < 0)))


def s15(x, p, pair):
    c = x["close"]
    e15, eh, el = ema(c, 15), ema(x["high"], 50), ema(x["low"], 50)
    m, _ = macd(c, 15, 70, 1)
    return swing(x, p, (e15 > eh) & (m > 0) & cross_up(c, e15), (e15 < el) & (m < 0) & cross_dn(c, e15))


def s16(x, p, pair):
    c = x["close"]
    w, s11 = wma(c, 5), sma(c, 11)
    sar = psar(x, 0.01, 0.1)
    dp, dm = di(x, 14)
    long = first((w > s11) & (sar < x["low"]) & (dp > dm))
    short = first((w < s11) & (sar > x["high"]) & (dm > dp))
    return swing(x, p, long, short, rr=np.nan, exit_long=sar > x["high"], exit_short=sar < x["low"])


def s17(x, p, pair):
    c = x["close"]
    e3, e8 = ema(c, 3), ema(c, 8)
    sar = psar(x, 0.02, 0.2)
    m, _ = macd(c, 12, 26, 9)
    K, D = stoch(x, 10, 15, 15)
    sd = c.rolling(20).std(ddof=0)
    strong = sd >= (0.10 if pair.endswith("JPY") else 0.0005)          # "medium or strong"
    long = (e3 > e8) & (sar < x["low"]) & (m > 0) & cross_up(K, D) & strong
    short = (e3 < e8) & (sar > x["high"]) & (m < 0) & cross_dn(K, D) & strong
    return swing(x, p, long, short, rr=np.nan, exit_long=e3 < e8, exit_short=e3 > e8)


def s18(x, p, pair):
    c = x["close"]
    e20 = ema(c, 20)
    m, _ = macd(c, 12, 26, 9)
    was_below = within((c < e20) & (m < 0), 12).shift(fill_value=False)
    was_above = within((c > e20) & (m > 0), 12).shift(fill_value=False)
    mac_up = within(cross_up(m, 0), 5) | ((m < 0) & (m > m.shift()))
    mac_dn = within(cross_dn(m, 0), 5) | ((m > 0) & (m < m.shift()))
    long = was_below & cross_up(c, e20) & mac_up
    short = was_above & cross_dn(c, e20) & mac_dn
    return {"pend_long": (e20 + 10 * p).where(long), "pend_short": (e20 - 10 * p).where(short),
            "stop_long": e20 - 20 * p, "stop_short": e20 + 20 * p, "partial_r": 1.0,
            "trail_long": e20 - 15 * p, "trail_short": e20 + 15 * p}


def s19(x, p, pair):
    c = x["close"]
    e100 = ema(c, 100)
    sar = psar(x, 0.01, 0.01)
    m, _ = macd(c, 64, 128, 9)
    long = first((c > e100) & (sar < x["low"]) & (m > 0))
    short = first((c < e100) & (sar > x["high"]) & (m < 0))
    return {"long": long, "short": short, "stop_long": sar - 3 * p, "stop_short": sar + 3 * p,
            "tgt_long": c + 10 * p, "tgt_short": c - 10 * p}


def s20(x, p, pair):
    c = x["close"]
    e3 = ema(c, 3)
    _, mid, _ = bands(c, 20, 3)
    m, _ = macd(c, 12, 26, 9)
    long = cross_up(e3, mid) & (m > m.shift()) & ((m < 0) | within(cross_up(m, 0), 3))
    short = cross_dn(e3, mid) & (m < m.shift()) & ((m > 0) | within(cross_dn(m, 0), 3))
    return fixed(x, p, 12, 12, long, short)


SYSTEMS = {k: globals()["s%d" % k] for k in range(1, 21)}
