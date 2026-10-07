#!/usr/bin/env python3
"""
paper.py  --  forward test of crypto time-series momentum, one week at a time.

The rules were frozen in run_backtest.py on 2026-10-07. Every Sunday close
from START on, this records the signal the rule gives (hold BTC and ETH, half
each, only the coins up over the last 28 days) and the paper account since
START, against holding both. Rows are appended once and never rewritten, so
the ledger shows what the rule said at the time, before anyone knew what
happened next.

The paper account is the same engine as the backtest: a Sunday signal trades
at Monday's close, 7 bps per unit of turnover, cash earns T-bills.

  python3 trend/paper.py            # append any new Sunday, print the record
"""

from __future__ import annotations

import csv
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from run_backtest import load, run, stats   # noqa: E402

START = pd.Timestamp("2026-10-11")          # first Sunday after the rules were frozen
LEDGER = HERE / "paper" / "ledger.csv"
FIELDS = ["sunday", "btc_close", "eth_close", "btc_28d_pct", "eth_28d_pct", "w_btc", "w_eth",
          "paper_equity", "hold_equity", "recorded_at_utc"]


def main() -> None:
    px = load(["BTC-USD", "ETH-USD", "^IRX"])
    irx = px.pop("^IRX")
    res = run("cryptots", px, irx)
    sig, daily = res["target"], res["daily"]

    rows = []
    if LEDGER.exists():
        with LEDGER.open() as f:
            rows = list(csv.DictReader(f))
    have = {r["sunday"] for r in rows}

    # Paper equity from the first day the first forward signal earns (Tuesday).
    fwd = daily[daily.index > START + pd.Timedelta(days=1)]
    paper = (1 + fwd["strategy"]).cumprod()
    hold = (1 + fwd["benchmark"]).cumprod()

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    new = []
    for d in sig.index[sig.index >= START]:
        key = d.strftime("%Y-%m-%d")
        if key in have:
            continue
        b, e = px["BTC-USD"], px["ETH-USD"]
        back = d - pd.Timedelta(days=28)
        upto = paper[paper.index <= d]
        new.append({
            "sunday": key, "btc_close": round(float(b[d]), 2), "eth_close": round(float(e[d]), 2),
            "btc_28d_pct": round(float(b[d] / b[back] - 1) * 100, 2),
            "eth_28d_pct": round(float(e[d] / e[back] - 1) * 100, 2),
            "w_btc": float(sig.loc[d, "BTC-USD"]), "w_eth": float(sig.loc[d, "ETH-USD"]),
            "paper_equity": round(float(upto.iloc[-1]), 6) if len(upto) else 1.0,
            "hold_equity": round(float(hold[hold.index <= d].iloc[-1]), 6) if len(upto) else 1.0,
            "recorded_at_utc": now,
        })
    if new:
        LEDGER.parent.mkdir(exist_ok=True)
        write_header = not LEDGER.exists()
        with LEDGER.open("a", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            if write_header:
                w.writeheader()
            w.writerows(new)
        rows += new

    latest = sig.index[-1]
    print("rules frozen 2026-10-07; forward test from %s" % START.date())
    print("latest signal (Sunday %s close): BTC %.0f%%, ETH %.0f%%, cash %.0f%%"
          % (latest.date(), sig.loc[latest, "BTC-USD"] * 100, sig.loc[latest, "ETH-USD"] * 100,
             (1 - sig.loc[latest].sum()) * 100))
    if latest < START:
        print("forward test has not started yet: the first recorded Sunday is %s" % START.date())
    print("ledger: %d weeks recorded, %d new this run" % (len(rows), len(new)))
    if len(fwd) > 1:
        s, h = stats(fwd["strategy"], fwd["cash"], 365.0), stats(fwd["benchmark"], fwd["cash"], 365.0)
        print("paper since %s: %+.1f%% (max drawdown %.1f%%) vs holding %+.1f%% (max drawdown %.1f%%)"
              % (START.date(), s["total"], s["maxdd"], h["total"], h["maxdd"]))
        print("too early to judge anything before about 26 weeks" if len(rows) < 26 else
              "compare with the backtest: Sharpe 1.42 vs 0.93, max drawdown -48% vs -76%")


if __name__ == "__main__":
    main()
