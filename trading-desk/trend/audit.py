#!/usr/bin/env python3
"""
audit.py  --  recompute every rebalance signal and every daily return of the
three strategies from raw closes, by loop, sharing no code with
run_backtest.py, and compare with what it wrote to out/.

  python3 trend/audit.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parent / "out"


def closes(symbols):
    import yfinance as yf
    out = {}
    for s in symbols:
        d = yf.download(s, start="1990-01-01", progress=False, auto_adjust=True)
        if isinstance(d.columns, pd.MultiIndex):
            d.columns = d.columns.get_level_values(0)
        c = d["Close"].dropna()
        c.index = pd.to_datetime(c.index).tz_localize(None)
        out[s] = c
    return out


def last_of_month(idx):
    out, prev = [], None
    for i, d in enumerate(idx):
        if prev is not None and (d.year, d.month) != (prev.year, prev.month):
            out.append(prev)
        prev = d
    out.append(prev)
    return out


def check_signals(key, px, irx_daily):
    sig = pd.read_csv(OUT / f"signals_{key}.csv", index_col=0, parse_dates=True)
    bad = 0
    if key == "faber":
        spy = px["SPY"]
        me = last_of_month(spy.index)
        for k, d in enumerate(me):
            if d not in sig.index:
                continue
            window = [spy[m] for m in me[k - 9:k + 1]] if k >= 9 else None
            want = 1.0 if window and spy[d] > sum(window) / 10 else 0.0
            bad += abs(sig.loc[d, "SPY"] - want) > 1e-9
    elif key == "cryptots":
        btc = px["BTC-USD"]
        for d in sig.index:
            live = []
            for s in ("BTC-USD", "ETH-USD"):
                p = px[s]
                back = d - pd.Timedelta(days=28)
                if d in p.index and back in p.index:
                    live.append((s, p[d] / p[back] - 1 > 0))
            for s in ("BTC-USD", "ETH-USD"):
                hit = [ok for name, ok in live if name == s]
                want = (1.0 / len(live)) if hit and hit[0] else 0.0
                bad += abs(sig.loc[d, s] - want) > 1e-9
    else:
        spy = px["SPY"]
        me = last_of_month(spy.index)
        tb = irx_daily.add(1).cumprod()
        for k, d in enumerate(me):
            if d not in sig.index or k < 12:
                continue
            a = me[k - 12]
            r = {s: px[s][d] / px[s][a] - 1 for s in ("SPY", "EFA", "AGG")}
            t = tb[d] / tb[a] - 1
            pick = ("SPY" if r["SPY"] >= r["EFA"] else "EFA") if r["SPY"] > t else "AGG"
            bad += any(abs(sig.loc[d, s] - (1.0 if s == pick else 0.0)) > 1e-9 for s in ("SPY", "EFA", "AGG"))
    return len(sig) - bad, len(sig)


def check_returns(key, px, crypto):
    d = pd.read_csv(OUT / f"daily_{key}.csv", index_col=0, parse_dates=True)
    cost = 0.0007 if crypto else 0.0002
    wcols = [c for c in d.columns if c.startswith("w_")]
    bad, prev = 0, None
    for day, row in d.iterrows():
        w = {c[2:]: row[c] for c in wcols}
        ret = 0.0
        for s, wt in w.items():
            p = px[s]
            if wt and day in p.index:
                i = p.index.get_loc(day)
                ret += wt * (p.iloc[i] / p.iloc[i - 1] - 1)
        ret += (1 - sum(w.values())) * row["cash"]
        turn = sum(abs(w[s] - prev[s]) for s in w) if prev else sum(abs(v) for v in w.values())
        want = ret - turn * cost
        # Yahoo's dividend-adjusted ETF closes shift by a few parts per million
        # between downloads, so daily returns are compared to 1e-5, not 1e-9.
        bad += abs(want - row["strategy"]) > 1e-5
        prev = w
    return len(d) - bad, len(d)


def main():
    px = closes(["SPY", "EFA", "AGG", "BTC-USD", "ETH-USD", "^IRX"])
    irx = px.pop("^IRX")
    spy_idx = px["SPY"].index
    y = irx.reindex(spy_idx, method="ffill").bfill() / 100
    gaps = pd.Series(spy_idx, index=spy_idx).diff().dt.days.fillna(1)
    irx_daily = (1 + y) ** (gaps / 365) - 1
    fails = 0
    for key, crypto in (("faber", False), ("cryptots", True), ("gem", False)):
        ok, n = check_signals(key, px, irx_daily)
        rok, rn = check_returns(key, px, crypto)
        print("[%s] signals %d/%d, daily returns %d/%d" % (key, ok, n, rok, rn))
        fails += (n - ok) + (rn - rok)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
