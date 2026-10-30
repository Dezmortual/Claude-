#!/usr/bin/env python3
"""
run_backtest.py  --  the Anti-Climax strategy on crypto candles.

  python3 anticlimax/run_backtest.py
  python3 anticlimax/run_backtest.py --interval 1h --symbols SOLUSDT

Candles come from Binance's public mirror (core/binance_data.py), no key needed.
The book trades futures on 3 to 30 minute bars; 15-minute crypto is the nearest
thing this desk can test for free. The default coins are ten large Binance USDT
pairs chosen today, which flatters any result a little.

Two arms over the same patterns (strategy.py):
  rules   every Anti-climax pattern
  gated   the book's context rules: pivot structure and EMA slope

Every trade is reported in R (realised risk, entry to stop) and in percent of
notional, before costs and after 0.05% commission plus slippage per side.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "core"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import binance_data as data                                       # noqa: E402
from strategy import ACConfig, costs, simulate                    # noqa: E402

OUT = Path(__file__).resolve().parent / "out"
TOP10 = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
         "DOGEUSDT", "ADAUSDT", "TRXUSDT", "AVAXUSDT", "LINKUSDT"]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--symbols", nargs="+", default=TOP10)
    p.add_argument("--start", default="2020-01-01")
    p.add_argument("--interval", default="15m", choices=["1h", "15m", "5m"])
    p.add_argument("--split", default="2025-01-01", help="out-of-sample from this date")
    p.add_argument("--commission-pct", type=float, default=0.05, help="per side, as in the Pine script")
    p.add_argument("--slippage-bps", type=float, default=2.0, help="per side")
    p.add_argument("--arms", nargs="+", default=["rules", "gated"], choices=["rules", "gated"])
    p.add_argument("--target-r", type=float, default=2.0)
    p.add_argument("--no-opposite-exit", action="store_true")
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


def account(t: pd.DataFrame, symbols, risk_pct: float, col: str = "r_net") -> pd.Series:
    """Equal-weight account, each coin's sleeve risking risk_pct of itself per trade.
    Sized from the stop with no leverage cap, so a tight stop is a large position."""
    curves = []
    for s in symbols:
        r = t[t["symbol"] == s].sort_values("exit_time")
        if len(r) == 0:
            continue
        g = (1 + r[col].clip(lower=-100 / risk_pct).to_numpy() * risk_pct / 100).cumprod()
        curves.append(pd.Series(g, index=r["exit_time"].to_numpy()).groupby(level=0).last())
    if not curves:
        return pd.Series(dtype=float)
    return pd.concat(curves, axis=1, sort=True).ffill().fillna(1.0).mean(axis=1)


def main() -> None:
    args = parse_args()
    out = Path(args.out)
    out.mkdir(exist_ok=True)
    print("=== data (%s) ===" % args.interval)
    bars = {s: data.candles(s, args.start, args.interval) for s in args.symbols}
    bars = {s: b for s, b in bars.items() if len(b) > ACConfig().warmup}
    cut = pd.Timestamp(args.split, tz="UTC")
    summary = {}

    for arm in args.arms:
        cfg = ACConfig(gated=(arm == "gated"), target_r=args.target_r,
                       exit_opposite=not args.no_opposite_exit)
        rows = []
        for s, b in bars.items():
            rows += simulate(b, cfg, symbol=s)
        t = costs(pd.DataFrame(rows), args.commission_pct, args.slippage_bps)
        t.to_csv(out / ("trades_%s.csv" % arm), index=False)
        test = t[t["entry_time"] >= cut]

        print("\n=== arm=%s, split=%s ===" % (arm, args.split))
        print(line("all", t))
        print(line("train", t[t["entry_time"] < cut]))
        print(line("test", test))
        print(line("long", t[t["side"] == "long"]))
        print(line("short", t[t["side"] == "short"]))
        print("  by coin, net R per trade (t), before | from split:")
        for s in bars:
            a, b_ = t[(t["symbol"] == s) & (t["entry_time"] < cut)], test[test["symbol"] == s]
            print("    %-9s %5d trades  %+.3fR (t=%+.2f) | %+.3fR (t=%+.2f)"
                  % (s, len(a) + len(b_), a["r_net"].mean(), tstat(a["r_net"]),
                     b_["r_net"].mean(), tstat(b_["r_net"])))
        fric = (t["r_gross"] - t["r_net"])
        print("  exits %s   median hold %d bars   median risk %.2f%% of price   costs per trade: median %.2fR, mean %.2fR"
              % (t["reason"].value_counts().to_dict(), t["bars"].median(), t["risk_pct"].median(),
                 fric.median(), fric.mean()))
        for rp in (0.5, 1.0):
            eq = account(t, bars, rp)
            dd = (eq / eq.cummax() - 1).min() * 100
            eqg = account(t, bars, rp, "r_gross")
            print("  account risking %.1f%% per trade: net %+.1f%%, max drawdown %.1f%%   (before costs %+.1f%%)"
                  % (rp, (eq.iloc[-1] - 1) * 100, dd, (eqg.iloc[-1] - 1) * 100))
        nr = account(t.assign(one=t["ret_net"]), bars, 1.0, "one")
        print("  account at full notional per trade (the Pine default): net %+.1f%%, max drawdown %.1f%%"
              % ((nr.iloc[-1] - 1) * 100, (nr / nr.cummax() - 1).min() * 100))
        summary[arm] = {"trades": len(t), "win": float((t["r_net"] > 0).mean()),
                        "net_R": float(t["r_net"].mean()), "net_t": tstat(t["r_net"]),
                        "gross_R": float(t["r_gross"].mean()), "gross_t": tstat(t["r_gross"]),
                        "test_trades": len(test), "test_net_R": float(test["r_net"].mean()),
                        "test_net_t": tstat(test["r_net"])}

    (out / "summary.json").write_text(json.dumps(summary, indent=1))
    (out / "settings.json").write_text(json.dumps({**vars(args), "config": asdict(ACConfig())}, indent=1))
    print("\nwrote %s" % out)
    print("\nRead this before believing any of it:")
    print("  - a t-stat under 2 on net R per trade is not evidence of an edge.")
    print("  - is the test half as good as the train half? if not, it is fitted.")
    print("  - gross positive and net negative means costs kill it.")


if __name__ == "__main__":
    main()
