"""
indicators.py  --  the indicators the book uses, in their MetaTrader 4 form, all
causal (every value uses bars up to and including its own).
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False).mean()


def sma(s: pd.Series, n: int) -> pd.Series:
    return s.rolling(n).mean()


def wma(s: pd.Series, n: int) -> pd.Series:
    w = np.arange(1, n + 1, dtype=float)
    return s.rolling(n).apply(lambda a: np.dot(a, w) / w.sum(), raw=True)


def macd(c: pd.Series, fast: int, slow: int, sig: int):
    """MT4 MACD: main line = EMA(fast) - EMA(slow), signal = SMA(main, sig)."""
    m = ema(c, fast) - ema(c, slow)
    return m, sma(m, sig)


def stoch(df: pd.DataFrame, k: int, d: int, slowing: int, d_ema: bool = False):
    """MT4 stochastic: %K over `k` bars smoothed by `slowing`, %D = MA(%K, d)."""
    ll, hh = df["low"].rolling(k).min(), df["high"].rolling(k).max()
    num = (df["close"] - ll).rolling(slowing).sum()
    den = (hh - ll).rolling(slowing).sum()
    K = 100 * num / den.replace(0, np.nan)
    D = ema(K, d) if d_ema else sma(K, d)
    return K, D


def rsi(c: pd.Series, n: int) -> pd.Series:
    d = c.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def cci(df: pd.DataFrame, n: int) -> pd.Series:
    tp = (df["high"] + df["low"] + df["close"]) / 3
    m = tp.rolling(n).mean()
    md = tp.rolling(n).apply(lambda a: np.abs(a - a.mean()).mean(), raw=True)
    return (tp - m) / (0.015 * md)


def bands(c: pd.Series, n: int, k: float):
    m = sma(c, n)
    sd = c.rolling(n).std(ddof=0)
    return m - k * sd, m, m + k * sd


def psar(df: pd.DataFrame, step: float, mx: float) -> pd.Series:
    h, l = df["high"].to_numpy(), df["low"].to_numpy()
    n = len(h)
    out = np.full(n, np.nan)
    if n < 2:
        return pd.Series(out, index=df.index)
    up = True
    af, ep, sar = step, h[0], l[0]
    for i in range(1, n):
        sar = sar + af * (ep - sar)
        if up:
            sar = min(sar, l[i - 1], l[i - 2] if i > 1 else l[i - 1])
            if l[i] < sar:
                up, sar, ep, af = False, ep, l[i], step
            elif h[i] > ep:
                ep, af = h[i], min(af + step, mx)
        else:
            sar = max(sar, h[i - 1], h[i - 2] if i > 1 else h[i - 1])
            if h[i] > sar:
                up, sar, ep, af = True, ep, h[i], step
            elif l[i] < ep:
                ep, af = l[i], min(af + step, mx)
        out[i] = sar
    return pd.Series(out, index=df.index)


def di(df: pd.DataFrame, n: int = 14):
    h, l, c = df["high"], df["low"], df["close"]
    upm, dnm = h.diff(), -l.diff()
    plus = upm.where((upm > dnm) & (upm > 0), 0.0)
    minus = dnm.where((dnm > upm) & (dnm > 0), 0.0)
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    atr = tr.ewm(alpha=1 / n, adjust=False).mean()
    return (100 * plus.ewm(alpha=1 / n, adjust=False).mean() / atr,
            100 * minus.ewm(alpha=1 / n, adjust=False).mean() / atr)


def laguerre(c: pd.Series, gamma: float = 0.5) -> pd.Series:
    """Ehlers' Laguerre RSI, 0..1."""
    x = c.to_numpy()
    out = np.full(len(x), np.nan)
    l0 = l1 = l2 = l3 = x[0]
    for i in range(len(x)):
        p0, p1, p2 = l0, l1, l2
        l0 = (1 - gamma) * x[i] + gamma * l0
        l1 = -gamma * l0 + p0 + gamma * l1
        l2 = -gamma * l1 + p1 + gamma * l2
        l3 = -gamma * l2 + p2 + gamma * l3
        cu = max(l0 - l1, 0) + max(l1 - l2, 0) + max(l2 - l3, 0)
        cd = max(l1 - l0, 0) + max(l2 - l1, 0) + max(l3 - l2, 0)
        out[i] = cu / (cu + cd) if cu + cd > 0 else 0.0
    return pd.Series(out, index=c.index)


def cross_up(a, b) -> pd.Series:
    a = a if isinstance(a, pd.Series) else pd.Series(a)
    b = b if isinstance(b, pd.Series) else pd.Series(b, index=a.index)
    return (a > b) & (a.shift() <= b.shift())


def cross_dn(a, b) -> pd.Series:
    a = a if isinstance(a, pd.Series) else pd.Series(a)
    b = b if isinstance(b, pd.Series) else pd.Series(b, index=a.index)
    return (a < b) & (a.shift() >= b.shift())


def within(cond: pd.Series, n: int) -> pd.Series:
    """True if cond was true on this bar or any of the previous n-1 bars."""
    return cond.astype(float).rolling(n, min_periods=1).max().astype(bool)


def first(cond: pd.Series) -> pd.Series:
    """The bar a condition becomes true."""
    cond = cond.fillna(False).astype(bool)
    return cond & ~cond.shift(fill_value=False)


def htf(x5: pd.DataFrame, rule: str, fn) -> pd.DataFrame:
    """Compute fn on completed higher-timeframe bars and align each value to the
    5-minute bars that close at or after that bar's close (no look-ahead)."""
    g = x5.resample(rule, label="left", closed="left")
    hb = pd.DataFrame({"open": g["open"].first(), "high": g["high"].max(),
                       "low": g["low"].min(), "close": g["close"].last()}).dropna()
    res = fn(hb)
    period = pd.Timedelta(rule)
    # The higher bar opened at T is complete when the 5m bar opened at T + period - 5m closes.
    res.index = res.index + period - pd.Timedelta("5min")
    return res.reindex(x5.index, method="ffill")
