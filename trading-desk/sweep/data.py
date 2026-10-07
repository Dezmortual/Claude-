"""
data.py  --  hourly spot candles from Binance's public market-data mirror.

data-api.binance.vision serves the same klines as the exchange API with no key
and no account. Candles are cached per symbol in sweep/cache/ and only the
missing tail is fetched on a rerun.

Each row is one 1-hour bar, indexed by its OPEN time in UTC. Volume is in the
base asset, which is what TradingView's BINANCE:<PAIR> charts use for VWAP.
"""

from __future__ import annotations

import json
import time
import urllib.request
from pathlib import Path

import pandas as pd

URL = "https://data-api.binance.vision/api/v3/klines?symbol={sym}&interval={iv}&startTime={start}&limit=1000"
CACHE = Path(__file__).resolve().parent / "cache"
STEP_MS = {"1h": 3_600_000, "15m": 900_000, "5m": 300_000}


def _get(url: str) -> list:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                return json.loads(r.read())
        except Exception:
            if attempt == 3:
                raise
            time.sleep(2 ** attempt)
    return []


def candles(symbol: str, start: str, interval: str = "1h", verbose: bool = True) -> pd.DataFrame:
    CACHE.mkdir(exist_ok=True)
    path = CACHE / f"{symbol}_{interval}.csv"
    have = pd.read_csv(path, index_col=0, parse_dates=True) if path.exists() else None
    t0 = int(pd.Timestamp(start, tz="UTC").timestamp() * 1000)
    if have is not None and len(have):
        t0 = max(t0, int(have.index[-1].timestamp() * 1000) + STEP_MS[interval])
    now = int(time.time() * 1000)
    rows = []
    while t0 < now:
        batch = _get(URL.format(sym=symbol, iv=interval, start=t0))
        if not batch:
            break
        rows += batch
        t0 = batch[-1][0] + STEP_MS[interval]
        if len(batch) < 1000:
            break
        time.sleep(0.05)
    if rows:
        new = pd.DataFrame([r[:6] for r in rows], columns=["t", "open", "high", "low", "close", "volume"])
        new.index = pd.to_datetime(new.pop("t"), unit="ms", utc=True)
        new = new.astype(float)
        df = new if have is None else pd.concat([have, new])
        df = df[~df.index.duplicated(keep="last")].sort_index()
        df.to_csv(path)
    else:
        df = have if have is not None else pd.DataFrame()
    # The last bar may still be forming; never trade on a close that does not exist yet.
    if len(df):
        df = df[df.index + pd.Timedelta(milliseconds=STEP_MS[interval]) <= pd.Timestamp.now(tz="UTC")]
    if verbose and len(df):
        print("  %s: %d bars, %s to %s" % (symbol, len(df), df.index[0].date(), df.index[-1].date()))
    return df
