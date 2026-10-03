#!/usr/bin/env python3
"""Single-symbol structure read for a Bybit USDT linear perpetual.

Public REST only. Pulls --lookback one-minute candles (default 120) and
reports VWAP, ATR(14), 60m and full-lookback swing high/low, a trend
classification, and the instrument's tick size / qty step for scalp-plan.

Trend: least-squares slope of the last 60 closes, projected over those 60
minutes, compared with ATR. |move| >= --trend-atr x ATR  ->  up / down,
otherwise range. A heuristic, not a signal.
"""
import argparse
import json
import sys

import requests

BASE = "https://api.bybit.com"
TIMEOUT = 10


def get(path, params):
    r = requests.get(BASE + path, params=params, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if data.get("retCode") != 0:
        raise RuntimeError(f"Bybit {path} retCode={data.get('retCode')} retMsg={data.get('retMsg')}")
    return data["result"]


def klines(symbol, limit):
    rows = get("/v5/market/kline", {"category": "linear", "symbol": symbol, "interval": "1", "limit": limit})["list"]
    rows = sorted(rows, key=lambda r: int(r[0]))
    return [
        {"t": int(r[0]), "o": float(r[1]), "h": float(r[2]), "l": float(r[3]), "c": float(r[4]), "v": float(r[5])}
        for r in rows
    ]


def instrument(symbol):
    lst = get("/v5/market/instruments-info", {"category": "linear", "symbol": symbol})["list"]
    if not lst:
        raise RuntimeError(f"unknown symbol {symbol}")
    i = lst[0]
    return {
        "tick_size": i["priceFilter"]["tickSize"],
        "qty_step": i["lotSizeFilter"]["qtyStep"],
        "min_qty": i["lotSizeFilter"]["minOrderQty"],
        "max_leverage": i.get("leverageFilter", {}).get("maxLeverage"),
    }


def vwap(candles):
    pv = sum((c["h"] + c["l"] + c["c"]) / 3 * c["v"] for c in candles)
    vol = sum(c["v"] for c in candles)
    return pv / vol if vol > 0 else None


def atr(candles, n=14):
    if len(candles) <= n:
        return None
    trs = [
        max(c["h"] - c["l"], abs(c["h"] - p["c"]), abs(c["l"] - p["c"]))
        for p, c in zip(candles, candles[1:])
    ]
    a = sum(trs[:n]) / n
    for tr in trs[n:]:
        a = (a * (n - 1) + tr) / n  # Wilder smoothing
    return a


def slope(values):
    n = len(values)
    xm = (n - 1) / 2
    ym = sum(values) / n
    num = sum((i - xm) * (y - ym) for i, y in enumerate(values))
    den = sum((i - xm) ** 2 for i in range(n))
    return num / den


def pct(a, b):
    return (a - b) / b * 100


def analyze(candles, trend_atr):
    last = candles[-1]["c"]
    w = vwap(candles)
    a = atr(candles)
    win = candles[-60:]
    hi60, lo60 = max(c["h"] for c in win), min(c["l"] for c in win)
    hi, lo = max(c["h"] for c in candles), min(c["l"] for c in candles)
    move60 = slope([c["c"] for c in win]) * (len(win) - 1)
    if a and abs(move60) >= trend_atr * a:
        trend = "up" if move60 > 0 else "down"
    else:
        trend = "range"
    return {
        "last": last,
        "candles": len(candles),
        "vwap": w,
        "vwap_dist_pct": pct(last, w) if w else None,
        "atr14": a,
        "atr14_pct": a / last * 100 if a else None,
        "swing_high_60m": hi60,
        "swing_high_60m_dist_pct": pct(hi60, last),
        "swing_low_60m": lo60,
        "swing_low_60m_dist_pct": pct(lo60, last),
        "swing_high": hi,
        "swing_high_dist_pct": pct(hi, last),
        "swing_low": lo,
        "swing_low_dist_pct": pct(lo, last),
        "regression_move_60m": move60,
        "regression_move_atr": move60 / a if a else None,
        "trend": trend,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("symbol")
    ap.add_argument("--lookback", type=int, default=120, help="1m candles, 60..1000")
    ap.add_argument("--trend-atr", type=float, default=1.5, help="regression move / ATR needed to call a trend")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    symbol = args.symbol.upper()
    lookback = max(60, min(1000, args.lookback))
    try:
        candles = klines(symbol, lookback)
        inst = instrument(symbol)
    except (requests.RequestException, RuntimeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    if len(candles) < 60:
        print(f"error: only {len(candles)} candles returned for {symbol}, need 60", file=sys.stderr)
        return 1

    out = {"symbol": symbol, **analyze(candles, args.trend_atr), **inst}

    if args.json:
        print(json.dumps(out, indent=2))
        return 0

    f = lambda v: f"{v:.6g}" if v is not None else "n/a"
    print(f"{symbol}  last {f(out['last'])}  trend {out['trend'].upper()}  ({out['candles']} x 1m)")
    print(f"  VWAP        {f(out['vwap'])}  ({out['vwap_dist_pct']:+.2f}% from last)")
    print(f"  ATR(14)     {f(out['atr14'])}  ({out['atr14_pct']:.3f}%)")
    print(f"  60m high    {f(out['swing_high_60m'])}  ({out['swing_high_60m_dist_pct']:+.2f}%)")
    print(f"  60m low     {f(out['swing_low_60m'])}  ({out['swing_low_60m_dist_pct']:+.2f}%)")
    print(f"  {lookback}m high   {f(out['swing_high'])}  ({out['swing_high_dist_pct']:+.2f}%)")
    print(f"  {lookback}m low    {f(out['swing_low'])}  ({out['swing_low_dist_pct']:+.2f}%)")
    print(f"  60m regression move {f(out['regression_move_60m'])} = {out['regression_move_atr']:+.2f} ATR")
    print(f"  tick {out['tick_size']}  qty step {out['qty_step']}  min qty {out['min_qty']}  max lev {out['max_leverage']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
