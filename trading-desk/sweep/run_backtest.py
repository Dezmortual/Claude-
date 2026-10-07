#!/usr/bin/env python3
"""
run_backtest.py  --  the Sweep strategy on hourly crypto.

  python3 sweep/run_backtest.py
  python3 sweep/run_backtest.py --symbols SOLUSDT --trail-mode same_bar

Candles come from Binance's public mirror (sweep/data.py), no key needed. The
default coins are ten large Binance USDT pairs chosen today, which flatters any
result a little: coins that died or shrank since 2020 are not in the list.

Every trade is reported three ways, as a percentage of its notional:
  gross   no costs at all
  comm    the Pine dashboard's figure: 0.05% commission per side
  net     commission plus slippage on both fills (the honest one)
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import data                                                       # noqa: E402
from strategy import SweepConfig, costs, simulate                 # noqa: E402

OUT = Path(__file__).resolve().parent / "out"
TOP10 = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
         "DOGEUSDT", "ADAUSDT", "TRXUSDT", "AVAXUSDT", "LINKUSDT"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--symbols", nargs="+", default=TOP10)
    p.add_argument("--start", default="2020-01-01")
    p.add_argument("--interval", default="1h", choices=["1h", "15m", "5m"])
    p.add_argument("--split", default="2025-01-01", help="out-of-sample from this date")
    p.add_argument("--commission-pct", type=float, default=0.05, help="per side, as in the Pine script")
    p.add_argument("--slippage-bps", type=float, default=2.0, help="per side")
    p.add_argument("--trail-mode", nargs="+", default=["causal", "same_bar"],
                   choices=["causal", "same_bar"])
    return p.parse_args()


def tstat(x) -> float:
    x = np.asarray(x, dtype=float)
    if len(x) < 2 or x.std(ddof=1) == 0:
        return 0.0
    return float(x.mean() / (x.std(ddof=1) / np.sqrt(len(x))))


def line(tag: str, t: pd.DataFrame) -> str:
    if len(t) == 0:
        return "  %-10s     0 trades" % tag
    return ("  %-10s %6d trades  %5.1f%% win  net %+.3f%% (t=%+.2f)  comm-only %+.3f%%  gross %+.3f%% (t=%+.2f)"
            % (tag, len(t), (t["ret_net"] > 0).mean() * 100, t["ret_net"].mean(), tstat(t["ret_net"]),
               t["ret_comm"].mean(), t["ret_gross"].mean(), tstat(t["ret_gross"])))


def portfolio(t: pd.DataFrame, symbols, col: str = "ret_net") -> pd.Series:
    """Equal weight: each coin gets 1/N of the account and compounds its own trades."""
    curves = []
    for s in symbols:
        r = t[t["symbol"] == s].sort_values("exit_time")
        if len(r) == 0:
            continue
        g = (1 + r[col].to_numpy() / 100).cumprod()
        curves.append(pd.Series(g, index=r["exit_time"].to_numpy()).groupby(level=0).last())
    if not curves:
        return pd.Series(dtype=float)
    df = pd.concat(curves, axis=1, sort=True).ffill().fillna(1.0)
    return df.mean(axis=1)


def main() -> None:
    args = parse_args()
    OUT.mkdir(exist_ok=True)
    cfg = SweepConfig()
    print("=== data (%s) ===" % args.interval)
    bars = {s: data.candles(s, args.start, args.interval) for s in args.symbols}
    bars = {s: b for s, b in bars.items() if len(b) > cfg.warmup}
    cut = pd.Timestamp(args.split, tz="UTC")
    summary = {}

    for mode in args.trail_mode:
        rows = []
        for s, b in bars.items():
            rows += simulate(b, cfg, mode=mode, symbol=s)
        t = costs(pd.DataFrame(rows), args.commission_pct, args.slippage_bps)
        t.to_csv(OUT / ("trades_%s.csv" % mode), index=False)

        print("\n=== trail=%s, split=%s ===" % (mode, args.split))
        print(line("all", t))
        print(line("train", t[t["entry_time"] < cut]))
        print(line("test", t[t["entry_time"] >= cut]))
        print(line("long", t[t["side"] == "long"]))
        print(line("short", t[t["side"] == "short"]))
        print("  by coin, net % per trade (t), before | from split:")
        for s in bars:
            a, b_ = t[(t["symbol"] == s) & (t["entry_time"] < cut)], t[(t["symbol"] == s) & (t["entry_time"] >= cut)]
            print("    %-9s %5d trades  %+.3f%% (t=%+.2f) | %+.3f%% (t=%+.2f)"
                  % (s, len(a) + len(b_), a["ret_net"].mean(), tstat(a["ret_net"]),
                     b_["ret_net"].mean(), tstat(b_["ret_net"])))
        eq = portfolio(t, bars)
        dd = (eq / eq.cummax() - 1).min() * 100 if len(eq) else 0.0
        hold = t["bars"].median()
        print("  exits %s   median hold %d bars   trades per coin per day %.1f"
              % (t["reason"].value_counts().to_dict(), hold,
                 len(t) / len(bars) / max(1, (t["exit_time"].max() - t["entry_time"].min()).days)))
        print("  equal-weight account: %+.1f%% total, max drawdown %.1f%%  (net of costs)"
              % ((eq.iloc[-1] - 1) * 100 if len(eq) else 0.0, dd))
        eqg = portfolio(t, bars, "ret_gross")
        print("  same account before any costs: %+.1f%%" % ((eqg.iloc[-1] - 1) * 100 if len(eqg) else 0.0))
        eq.rename("equity").to_frame().to_csv(OUT / ("equity_%s.csv" % mode))
        summary[mode] = {"trades": len(t), "net_mean_pct": float(t["ret_net"].mean()),
                         "net_t": tstat(t["ret_net"]),
                         "test_net_mean_pct": float(t[t["entry_time"] >= cut]["ret_net"].mean()),
                         "test_net_t": tstat(t[t["entry_time"] >= cut]["ret_net"])}

    (OUT / "summary.json").write_text(json.dumps(summary, indent=1))
    (OUT / "settings.json").write_text(json.dumps(vars(args), indent=1))
    print("\nwrote %s" % OUT)
    print("\nRead this before believing any of it:")
    print("  - a t-stat under 2 on the net return per trade is not evidence of an edge.")
    print("  - is the test half as good as the train half? if not, it is fitted.")
    print("  - gross positive and net negative means costs kill it.")


if __name__ == "__main__":
    main()
