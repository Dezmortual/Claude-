#!/usr/bin/env python3
"""
run_backtest.py  --  Successful Breakout Trading on today's S&P 500 stocks.

  python3 breakout/run_backtest.py
  python3 breakout/run_backtest.py --arms rules --intrabar worst

Daily bars from yfinance (breakout/stock_data.py), no key needed. Trades start
on 2014-01-01, after the book was published (2013), and a stock is traded only
from the date it joined the index. Split at 2021-01-01.

Three arms over the same stocks (strategy.py): rules, gated (the book's market
and Bollinger filters) and random (the survivorship control). Each runs under
the worst and best reading of a bar's high/low order.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import stock_data                                                  # noqa: E402
from strategy import BOConfig, costs, simulate                     # noqa: E402

OUT = Path(__file__).resolve().parent / "out"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--start", default="2014-01-01", help="first trade date")
    p.add_argument("--split", default="2021-01-01")
    p.add_argument("--slippage-bps", type=float, default=5.0, help="per side, commission-free broker")
    p.add_argument("--arms", nargs="+", default=["rules", "gated", "random"], choices=["rules", "gated", "random"])
    p.add_argument("--intrabar", nargs="+", default=["worst", "best"], choices=["worst", "best"])
    p.add_argument("--ignore-added", action="store_true", help="trade stocks before they joined the index")
    p.add_argument("--out", default=str(OUT))
    return p.parse_args()


def tstat(x) -> float:
    x = np.asarray(x, dtype=float)
    if len(x) < 2 or x.std(ddof=1) == 0:
        return 0.0
    return float(x.mean() / (x.std(ddof=1) / np.sqrt(len(x))))


def line(tag: str, t: pd.DataFrame) -> str:
    if len(t) == 0:
        return "  %-8s      0 trades" % tag
    return ("  %-8s %6d trades  %5.1f%% win  net %+.3fR (t=%+.2f)  gross %+.3fR (t=%+.2f)  net %+.3f%%/trade"
            % (tag, len(t), (t["r_net"] > 0).mean() * 100, t["r_net"].mean(), tstat(t["r_net"]),
               t["r_gross"].mean(), tstat(t["r_gross"]), t["ret_net"].mean()))


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out.mkdir(exist_ok=True)
    members = stock_data.sp500()
    print("=== data: %d S&P 500 members + SPY ===" % len(members))
    px = stock_data.daily(list(members["symbol"]) + ["SPY"])
    spy = px.pop("SPY")
    spy_up = spy["close"] > spy["close"].rolling(50).mean()
    t0, cut = pd.Timestamp(args.start), pd.Timestamp(args.split)
    added = dict(zip(members["symbol"], members["added"]))
    print("  %d stocks with data, %s to %s" % (len(px), min(b.index[0] for b in px.values()).date(),
                                               max(b.index[-1] for b in px.values()).date()))
    summary = {}

    for mode in args.intrabar:
        for arm in args.arms:
            cfg = BOConfig(arm=arm, intrabar=mode)
            rows = []
            for s, b in px.items():
                st = t0
                if not args.ignore_added and pd.notna(added.get(s)):
                    st = max(st, added[s])
                rows += simulate(b, cfg, symbol=s, start=st, spy_up=spy_up)
            t = costs(pd.DataFrame(rows), args.slippage_bps)
            t.to_csv(out / ("trades_%s_%s.csv" % (arm, mode)), index=False)
            test = t[t["entry_time"] >= cut]
            print("\n=== arm=%s, intrabar=%s ===" % (arm, mode))
            print(line("all", t))
            print(line("train", t[t["entry_time"] < cut]))
            print(line("test", test))
            yr = t.groupby(t["entry_time"].dt.year)["r_net"]
            print("  net R per trade by year: " + "  ".join("%d %+.2f" % (y, m) for y, m in yr.mean().items()))
            print("  exits half1 %s   half2 %s" % (t["why1"].value_counts().to_dict(), t["why2"].value_counts().to_dict()))
            print("  median hold %d days   median risk %.1f%% of price   stocks traded %d"
                  % (t["bars"].median(), t["risk_pct"].median(), t["symbol"].nunique()))
            summary["%s_%s" % (arm, mode)] = {
                "trades": len(t), "win": float((t["r_net"] > 0).mean()),
                "net_R": float(t["r_net"].mean()), "net_t": tstat(t["r_net"]),
                "gross_R": float(t["r_gross"].mean()), "gross_t": tstat(t["r_gross"]),
                "net_pct": float(t["ret_net"].mean()),
                "test_trades": len(test), "test_net_R": float(test["r_net"].mean()), "test_net_t": tstat(test["r_net"])}

    # Does the pattern beat buying the same stocks on random days? Difference in mean net R.
    print("\n=== pattern minus random control (net R per trade) ===")
    for mode in args.intrabar:
        if "random_%s" % mode not in summary:
            continue
        rnd = pd.read_csv(out / ("trades_random_%s.csv" % mode))["r_net"]
        for arm in [a for a in args.arms if a != "random"]:
            a = pd.read_csv(out / ("trades_%s_%s.csv" % (arm, mode)))["r_net"]
            se = np.sqrt(a.var(ddof=1) / len(a) + rnd.var(ddof=1) / len(rnd))
            d = a.mean() - rnd.mean()
            print("  %-6s %-5s  %+.3fR  (t=%+.2f)" % (arm, mode, d, d / se))
            summary["%s_%s" % (arm, mode)]["minus_random_R"] = float(d)
            summary["%s_%s" % (arm, mode)]["minus_random_t"] = float(d / se)

    (out / "summary.json").write_text(json.dumps(summary, indent=1))
    (out / "settings.json").write_text(json.dumps({**vars(args), "config": asdict(BOConfig())}, indent=1, default=str))
    print("\nwrote %s" % out)
    print("\nRead this before believing any of it:")
    print("  - a t-stat under 2 on net R per trade is not evidence of an edge.")
    print("  - the random arm is what today's S&P 500 gave anyone; the pattern has to beat it.")
    print("  - is the test half as good as the train half? if not, it is fitted.")


if __name__ == "__main__":
    main()
