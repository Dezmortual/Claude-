"""
stock_data.py  --  daily US stock bars from yfinance, cached in core/cache/stocks_1d/.

The universe is today's S&P 500 (Wikipedia's list), with each stock's "Date
added". Only today's members are listed, so stocks that fell out of the index
are missing: survivorship bias, which flatters any long-only test. The runner
trades a stock only from its inclusion date onward and keeps a random-entry
control arm on the same stocks to measure how much of a result is just that.

Prices are split- and dividend-adjusted (auto_adjust=True), so a level such as
resistance is consistent across a split.
"""

from __future__ import annotations

import io
import time
import urllib.request
from pathlib import Path

import pandas as pd

CACHE = Path(__file__).resolve().parent.parent / "core" / "cache" / "stocks_1d"
WIKI = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"


def sp500() -> pd.DataFrame:
    """Symbol (yfinance spelling) and date added, cached as members.csv."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "members.csv"
    if path.exists():
        return pd.read_csv(path, parse_dates=["added"])
    req = urllib.request.Request(WIKI, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=30).read().decode()
    t = pd.read_html(io.StringIO(html))[0]
    out = pd.DataFrame({"symbol": t["Symbol"].str.replace(".", "-", regex=False),
                        "added": pd.to_datetime(t["Date added"], errors="coerce")})
    out.to_csv(path, index=False)
    return out


def daily(symbols, start: str = "2010-01-01", verbose: bool = True) -> dict:
    """{symbol: DataFrame open/high/low/close/volume}, completed sessions only."""
    import yfinance as yf
    CACHE.mkdir(parents=True, exist_ok=True)
    out, todo = {}, []
    for s in symbols:
        p = CACHE / f"{s}.csv"
        if p.exists():
            out[s] = pd.read_csv(p, index_col=0, parse_dates=True)
        else:
            todo.append(s)
    for k in range(0, len(todo), 50):
        batch = todo[k:k + 50]
        for attempt in range(4):
            try:
                d = yf.download(batch, start=start, auto_adjust=True, progress=False,
                                group_by="ticker", threads=True)
                break
            except Exception:
                time.sleep(2 ** attempt)
        for s in batch:
            try:
                x = d[s] if isinstance(d.columns, pd.MultiIndex) else d
            except KeyError:
                continue
            x = x.rename(columns=str.lower)[["open", "high", "low", "close", "volume"]].dropna()
            if len(x) == 0:
                continue
            x.index = pd.to_datetime(x.index).tz_localize(None)
            x.to_csv(CACHE / f"{s}.csv")
            out[s] = x
        if verbose:
            print("  downloaded %d/%d" % (min(k + 50, len(todo)), len(todo)))
    # Today's bar may still be forming.
    today = pd.Timestamp.now().normalize()
    return {s: x[x.index < today] for s, x in out.items()}
