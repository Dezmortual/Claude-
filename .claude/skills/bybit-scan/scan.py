#!/usr/bin/env python3
"""15-minute volatility-spike screener for Bybit USDT linear perpetuals.

Public REST only. No keys, no state.

For every USDT linear perp that clears a 24h turnover floor and a spread
ceiling, pull the last 60 one-minute candles and compute:
  range_15m_pct   high-low range of the last 15 candles, % of last close
  range_prior_pct high-low range of the 45 candles before that
  spike_ratio     range_15m_pct / range_prior_pct
  change_15m_pct  close-to-close change over the last 15 candles
Candidates with spike >= --min-spike and range >= --min-range are ranked by
spike_ratio * range_15m_pct.
"""
import argparse
import json
import sys
import time

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


def tickers():
    return get("/v5/market/tickers", {"category": "linear"})["list"]


def klines(symbol, limit=60):
    rows = get("/v5/market/kline", {"category": "linear", "symbol": symbol, "interval": "1", "limit": limit})["list"]
    # Bybit returns newest first: [start, open, high, low, close, volume, turnover]
    rows = sorted(rows, key=lambda r: int(r[0]))
    return [{"t": int(r[0]), "o": float(r[1]), "h": float(r[2]), "l": float(r[3]), "c": float(r[4])} for r in rows]


def spread_bps(t):
    try:
        bid, ask = float(t["bid1Price"]), float(t["ask1Price"])
    except (KeyError, ValueError):
        return None
    if bid <= 0 or ask <= 0:
        return None
    return (ask - bid) / ((ask + bid) / 2) * 1e4


def metrics(candles):
    if len(candles) < 60:
        return None
    last15, prior45 = candles[-15:], candles[-60:-15]
    last = candles[-1]["c"]
    r15 = (max(c["h"] for c in last15) - min(c["l"] for c in last15)) / last * 100
    r45 = (max(c["h"] for c in prior45) - min(c["l"] for c in prior45)) / last * 100
    if r45 <= 0:
        return None
    base = candles[-16]["c"]
    return {
        "last": last,
        "range_15m_pct": r15,
        "range_prior_pct": r45,
        "spike_ratio": r15 / r45,
        "change_15m_pct": (last - base) / base * 100,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--min-turnover", type=float, default=50_000_000, help="24h USDT turnover floor")
    ap.add_argument("--max-spread-bps", type=float, default=5.0)
    ap.add_argument("--min-spike", type=float, default=1.3)
    ap.add_argument("--min-range", type=float, default=0.4, help="minimum 15m range in %%")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    try:
        universe = []
        for t in tickers():
            sym = t.get("symbol", "")
            if not sym.endswith("USDT"):
                continue
            turnover = float(t.get("turnover24h") or 0)
            sp = spread_bps(t)
            if turnover < args.min_turnover or sp is None or sp > args.max_spread_bps:
                continue
            universe.append((sym, turnover, sp))

        results = []
        for sym, turnover, sp in universe:
            try:
                m = metrics(klines(sym))
            except (requests.RequestException, RuntimeError) as e:
                print(f"warn: {sym}: {e}", file=sys.stderr)
                continue
            if not m or m["spike_ratio"] < args.min_spike or m["range_15m_pct"] < args.min_range:
                continue
            m.update(symbol=sym, turnover_24h=turnover, spread_bps=sp, score=m["spike_ratio"] * m["range_15m_pct"])
            results.append(m)
            time.sleep(0.05)  # stay well under public rate limits
    except (requests.RequestException, RuntimeError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    results.sort(key=lambda m: m["score"], reverse=True)
    results = results[: args.top]

    if args.json:
        print(json.dumps({"scanned": len(universe), "results": results}, indent=2))
        return 0

    print(f"scanned {len(universe)} liquid USDT perps; {len(results)} passed filters")
    if not results:
        return 0
    print(f"{'symbol':<16}{'last':>14}{'rng15%':>9}{'prior%':>9}{'spike':>7}{'chg15%':>9}{'sprd':>7}{'turn$M':>9}{'score':>8}")
    for m in results:
        print(
            f"{m['symbol']:<16}{m['last']:>14.6g}{m['range_15m_pct']:>9.2f}{m['range_prior_pct']:>9.2f}"
            f"{m['spike_ratio']:>7.2f}{m['change_15m_pct']:>+9.2f}{m['spread_bps']:>7.2f}"
            f"{m['turnover_24h'] / 1e6:>9.0f}{m['score']:>8.2f}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
