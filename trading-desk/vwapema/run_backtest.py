#!/usr/bin/env python3
"""
run_backtest.py  --  VWAP EMA Trend on hourly crypto, rules vs gated.

  python3 vwapema/run_backtest.py
  python3 vwapema/run_backtest.py --interval 15m --start 2023-01-01

Same coins, costs and split as sweep/, so the two are comparable. Returns are
per trade, as a percentage of notional: gross (no costs) and net (0.05%
commission plus 2 bps slippage per side).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "core"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import binance_data as data                                     # noqa: E402
from strategy import VwapEmaConfig, costs, simulate             # noqa: E402

OUT = Path(__file__).resolve().parent / "out"
TOP10 = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
         "DOGEUSDT", "ADAUSDT", "TRXUSDT", "AVAXUSDT", "LINKUSDT"]


def tstat(x) -> float:
    x = np.asarray(x, dtype=float)
    if len(x) < 2 or x.std(ddof=1) == 0:
        return 0.0
    return float(x.mean() / (x.std(ddof=1) / np.sqrt(len(x))))


def line(tag: str, t: pd.DataFrame) -> str:
    if len(t) == 0:
        return "  %-8s      0 trades" % tag
    return ("  %-8s %6d trades  %5.1f%% win  net %+.3f%% (t=%+.2f)  gross %+.3f%% (t=%+.2f)"
            % (tag, len(t), (t["ret_net"] > 0).mean() * 100, t["ret_net"].mean(), tstat(t["ret_net"]),
               t["ret_gross"].mean(), tstat(t["ret_gross"])))


def portfolio(t: pd.DataFrame, symbols, col: str) -> pd.Series:
    """Equal weight: each coin gets 1/N of the account and compounds its own trades."""
    curves = []
    for s in symbols:
        r = t[t["symbol"] == s].sort_values("exit_time")
        if len(r):
            g = (1 + r[col].to_numpy() / 100).cumprod()
            curves.append(pd.Series(g, index=r["exit_time"].to_numpy()).groupby(level=0).last())
    if not curves:
        return pd.Series(dtype=float)
    return pd.concat(curves, axis=1, sort=True).ffill().fillna(1.0).mean(axis=1)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--symbols", nargs="+", default=TOP10)
    p.add_argument("--start", default="2020-01-01")
    p.add_argument("--interval", default="1h", choices=["1h", "15m", "5m"])
    p.add_argument("--split", default="2025-01-01")
    p.add_argument("--commission-pct", type=float, default=0.05)
    p.add_argument("--slippage-bps", type=float, default=2.0)
    args = p.parse_args()

    OUT.mkdir(exist_ok=True)
    cfg = VwapEmaConfig()
    bars = {s: data.candles(s, args.start, args.interval) for s in args.symbols}
    bars = {s: b for s, b in bars.items() if len(b) > cfg.warmup}
    cut = pd.Timestamp(args.split, tz="UTC")
    summary = {}

    for arm in ("rules", "gated"):
        rows = []
        for s, b in bars.items():
            rows += simulate(b, cfg, arm=arm, symbol=s)
        t = costs(pd.DataFrame(rows), args.commission_pct, args.slippage_bps)
        t.to_csv(OUT / ("trades_%s.csv" % arm), index=False)
        tr, te = t[t["entry_time"] < cut], t[t["entry_time"] >= cut]
        print("\n=== arm=%s, %s, split=%s ===" % (arm, args.interval, args.split))
        for tag, sub in (("all", t), ("train", tr), ("test", te),
                         ("long", t[t["side"] == "long"]), ("short", t[t["side"] == "short"])):
            print(line(tag, sub))
        print("  by coin, net %% per trade (t), before | from split:")
        neg = 0
        for s in bars:
            a, b_ = tr[tr["symbol"] == s], te[te["symbol"] == s]
            neg += (a["ret_net"].mean() < 0) + (b_["ret_net"].mean() < 0)
            print("    %-9s %5d trades  %+.3f%% (t=%+.2f) | %+.3f%% (t=%+.2f)"
                  % (s, len(a) + len(b_), a["ret_net"].mean(), tstat(a["ret_net"]),
                     b_["ret_net"].mean(), tstat(b_["ret_net"])))
        eq, eqg = portfolio(t, bars, "ret_net"), portfolio(t, bars, "ret_gross")
        dd = (eq / eq.cummax() - 1).min() * 100
        days = max(1, (t["exit_time"].max() - t["entry_time"].min()).days)
        print("  coin-halves negative: %d of %d   median hold %d bars   trades per coin per day %.2f"
              % (neg, 2 * len(bars), t["bars"].median(), len(t) / len(bars) / days))
        print("  equal-weight account: net %+.1f%%, max drawdown %.1f%%; before costs %+.1f%%"
              % ((eq.iloc[-1] - 1) * 100, dd, (eqg.iloc[-1] - 1) * 100))
        summary[arm] = {"trades": len(t), "win": float((t["ret_net"] > 0).mean()),
                        "net_mean_pct": float(t["ret_net"].mean()), "net_t": tstat(t["ret_net"]),
                        "gross_mean_pct": float(t["ret_gross"].mean()), "gross_t": tstat(t["ret_gross"]),
                        "train_net_mean_pct": float(tr["ret_net"].mean()), "train_net_t": tstat(tr["ret_net"]),
                        "test_net_mean_pct": float(te["ret_net"].mean()), "test_net_t": tstat(te["ret_net"]),
                        "account_net_pct": float((eq.iloc[-1] - 1) * 100), "max_dd_pct": float(dd),
                        "account_gross_pct": float((eqg.iloc[-1] - 1) * 100)}

    (OUT / "summary.json").write_text(json.dumps(summary, indent=1))
    (OUT / "settings.json").write_text(json.dumps(vars(args), indent=1))
    print("\nwrote %s" % OUT)


if __name__ == "__main__":
    main()
