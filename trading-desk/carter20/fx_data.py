"""
fx_data.py  --  1-minute forex bars from HistData.com (free, BID prices),
cached in core/cache/fx_1m/<PAIR>_<YEAR>.npz, and resampling to 5m/15m/1h/4h.

HistData serves one zip per pair per finished year, and one per month for the
current year. Its timestamps are New York standard time with no daylight saving
(UTC-5 all year); they are shifted to UTC here. Prices are kept as integer
points (1e-5, or 1e-3 for JPY pairs).

BID prices only: the cost of the spread is added per trade by the runner.
"""

from __future__ import annotations

import datetime as dt
import io
import re
import time
import urllib.parse
import urllib.request
import zipfile
from http.cookiejar import CookieJar
from pathlib import Path

import numpy as np
import pandas as pd

CACHE = Path(__file__).resolve().parent.parent / "core" / "cache" / "fx_1m"
PAGE = "https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/{pair}/{period}"
GET = "https://www.histdata.com/get.php"
PAIRS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "GBPJPY"]


INDICES = {"NSXUSD", "SPXUSD", "UDXUSD"}       # HistData index CFDs, quoted to 3 decimals


def point(pair: str) -> float:
    return 1e-3 if pair.endswith("JPY") or pair in INDICES else 1e-5


def pip(pair: str) -> float:
    """One pip; for an index, one index point."""
    if pair in INDICES:
        return 1.0
    return 0.01 if pair.endswith("JPY") else 0.0001


def _zip(pair: str, year: int, month=None) -> bytes:
    period = "%d" % year if month is None else "%d/%d" % (year, month)
    jar = CookieJar()
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    op.addheaders = [("User-Agent", "Mozilla/5.0")]
    page_url = PAGE.format(pair=pair.lower(), period=period)
    for attempt in range(6):
        try:
            html = op.open(page_url, timeout=60).read().decode("utf-8", "replace")
            tk = re.search(r'id="tk" value="([^"]*)"', html).group(1)
            dm = re.search(r'id="datemonth" value="([^"]*)"', html).group(1)
            data = urllib.parse.urlencode({"tk": tk, "date": str(year), "datemonth": dm, "platform": "ASCII",
                                           "timeframe": "M1", "fxpair": pair}).encode()
            req = urllib.request.Request(GET, data=data, headers={"Referer": page_url})
            raw = op.open(req, timeout=120).read()
            if raw[:2] == b"PK":
                return raw
        except Exception:
            pass
        time.sleep(2 ** attempt)
    raise RuntimeError("no data for %s %s" % (pair, period))


def _parse(raw: bytes, pair: str):
    z = zipfile.ZipFile(io.BytesIO(raw))
    name = next(n for n in z.namelist() if n.endswith(".csv"))
    df = pd.read_csv(z.open(name), sep=";", header=None, names=["t", "o", "h", "l", "c", "v"],
                     dtype={"t": str})
    t = pd.to_datetime(df["t"], format="%Y%m%d %H%M%S") + pd.Timedelta(hours=5)      # EST (UTC-5, no DST) -> UTC
    pts = 1 / point(pair)
    return (t.to_numpy().astype("datetime64[s]").astype(np.int64),) + tuple(np.rint(df[k].to_numpy() * pts).astype(np.int32)
                                                           for k in ("o", "h", "l", "c"))


def download(pairs=PAIRS, start_year: int = 2018, verbose: bool = True) -> None:
    CACHE.mkdir(parents=True, exist_ok=True)
    this_year = dt.date.today().year
    for p in pairs:
        for y in range(start_year, this_year + 1):
            path = CACHE / f"{p}_{y}.npz"
            if path.exists() and y < this_year:
                continue
            if y < this_year:
                parts = [_parse(_zip(p, y), p)]
            else:
                parts = []
                for m in range(1, dt.date.today().month + 1):
                    try:
                        parts.append(_parse(_zip(p, y, m), p))
                    except RuntimeError:
                        break                   # the current month is published after it ends
            cols = [np.concatenate([q[k] for q in parts]) for k in range(5)]
            np.savez_compressed(path, t=cols[0], o=cols[1], h=cols[2], l=cols[3], c=cols[4])
            if verbose:
                last = dt.datetime.fromtimestamp(int(cols[0][-1]), dt.timezone.utc).date()
                print("  %s %d: %d minutes, to %s" % (p, y, len(cols[0]), last), flush=True)


def minutes(pair: str, start: str = "2018-01-01") -> pd.DataFrame:
    """1-minute bars as floats, indexed by UTC open time."""
    frames = []
    for path in sorted(CACHE.glob(f"{pair}_*.npz")):
        z = np.load(path)
        frames.append(pd.DataFrame({k: z[k] for k in ("o", "h", "l", "c")}, index=pd.to_datetime(z["t"], unit="s", utc=True)))
    df = pd.concat(frames).sort_index()
    df = df[~df.index.duplicated()]
    df = df[df.index >= pd.Timestamp(start, tz="UTC")] * point(pair)
    df.columns = ["open", "high", "low", "close"]
    return df


def resample(m1: pd.DataFrame, rule: str) -> pd.DataFrame:
    """Bars labelled by their open time; only minutes that traded count."""
    g = m1.resample(rule, label="left", closed="left")
    out = pd.DataFrame({"open": g["open"].first(), "high": g["high"].max(), "low": g["low"].min(), "close": g["close"].last()})
    return out.dropna()


if __name__ == "__main__":
    download()
