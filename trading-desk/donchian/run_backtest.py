#!/usr/bin/env python3
"""
run_backtest.py  --  SOL Donchian on daily crypto, rules and gated arms.

  python3 donchian/run_backtest.py
  python3 donchian/run_backtest.py --trail-mode same_bar   # the Pine assumption
  python3 donchian/run_backtest.py --symbols SOL-USD
  python3 donchian/run_backtest.py --arms rules gated ta --ta-estimate
  python3 donchian/run_backtest.py --arms rules gated ta --ta-max-calls 1

Data comes from Yahoo via yfinance, so no API key is needed. The default split
is 2025-01-01 because the TradingView strategy this ports is named
"OOS 2025-2026": everything before that is the half it was developed on.

The `ta` arm filters the same candidates through TradingAgents, a multi-agent
LLM framework (tradingagents_gate/). It spends real money per decision, so it
never runs without --ta-max-calls, and --ta-estimate prices a run without
making any call. By default it only decides candidates from the split date on:
the out-of-sample window is the one that matters, and a model filter has
nothing to fit on the earlier half. All arms are compared on that window.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "core"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import metrics as M                                              # noqa: E402
from decision import GateDecider, RuleDecider                     # noqa: E402
from engine import CRYPTO, Engine, EngineConfig                   # noqa: E402

from strategy import DonchianConfig, DonchianStrategy             # noqa: E402

OUT = Path(__file__).resolve().parent / "out"


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--symbols", nargs="+", default=["BTC-USD", "ETH-USD", "SOL-USD"])
    p.add_argument("--start", default="2014-01-01")
    p.add_argument("--end", default=None)
    p.add_argument("--split", default="2025-01-01",
                   help="train/test boundary. Both halves are always reported.")
    p.add_argument("--arms", nargs="+", default=["rules", "gated"],
                   choices=["rules", "gated", "ta"])
    # Pine defaults: $25k, 0.25% risk, 50% max notional, 0.05% commission per side.
    p.add_argument("--equity", type=float, default=25_000)
    p.add_argument("--risk-pct", type=float, default=0.0025)
    p.add_argument("--max-notional-pct", type=float, default=0.50)
    p.add_argument("--commission-bps", type=float, default=5.0)
    p.add_argument("--slippage-bps", type=float, default=2.0)
    p.add_argument("--fill", default="close", choices=["close", "next_open"])
    p.add_argument("--trail-mode", default="causal", choices=["causal", "same_bar"])
    p.add_argument("--ta-estimate", action="store_true",
                   help="price the ta arm without making any model call")
    p.add_argument("--ta-max-calls", type=int, default=None,
                   help="cap on real TradingAgents runs; cached answers are free")
    p.add_argument("--ta-from", default=None,
                   help="first date the ta arm decides (default: --split)")
    args = p.parse_args()
    if "ta" in args.arms and not args.ta_estimate and args.ta_max_calls is None:
        p.error("the ta arm spends money on every decision: pass --ta-max-calls N, "
                "or --ta-estimate to price it first")
    return args


def fetch(symbols, start, end) -> dict:
    try:
        import yfinance as yf
    except ImportError:
        sys.exit("this strategy uses yfinance for keyless data: pip install yfinance")
    out = {}
    for sym in symbols:
        df = yf.download(sym, start=start, end=end, progress=False, auto_adjust=True)
        if df.empty:
            print("  %s: no data" % sym)
            continue
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        df.columns = [c.lower() for c in df.columns]
        df = df[["open", "high", "low", "close", "volume"]].dropna()
        if df.index.tz is None:
            df.index = df.index.tz_localize("UTC")
        # Yahoo's last daily row is the bar still forming. Trading on it would
        # use a close that does not exist yet.
        today = pd.Timestamp.now(tz="UTC").normalize()
        df = df[df.index < today]
        out[sym] = df
        print("  %s: %d daily bars, %s to %s"
              % (sym, len(df), df.index[0].date(), df.index[-1].date()))
    return out


def t_stat(rs) -> float:
    rs = np.asarray(rs, dtype=float)
    if len(rs) < 2 or rs.std(ddof=1) == 0:
        return 0.0
    return float(rs.mean() / (rs.std(ddof=1) / np.sqrt(len(rs))))


def gross_r(tdf: pd.DataFrame) -> pd.Series:
    """R before any slippage or fees: ideal P&L over the same initial risk."""
    risk = (tdf["net_pnl"] / tdf["R"]).where(tdf["R"] != 0)
    return tdf["ideal_pnl"] / risk


def line(tag: str, tdf: pd.DataFrame) -> str:
    if len(tdf) == 0:
        return "  %-12s    0 trades" % tag
    g = gross_r(tdf).dropna()
    return ("  %-12s %4d trades  %5.1f%% win  net %+.3f R (t=%+.2f)  "
            "gross %+.3f R (t=%+.2f)"
            % (tag, len(tdf), (tdf["net_pnl"] > 0).mean() * 100,
               tdf["R"].mean(), t_stat(tdf["R"]), g.mean(), t_stat(g)))


def report_ta(ta, args) -> None:
    st = ta.stats()
    print("  decisions: %d new runs, %d from cache, %d before the window, %d left for budget"
          % (st["real_calls"], st["cached"], st["before_window"], st["undecided_budget"]))
    print("  ratings: %s" % st["ratings"])
    if st["real_calls"]:
        for model, r in st["session_usage"].items():
            print("  %-20s %3d calls  %9d in (%d cache read, %d cache write)  %7d out"
                  % (model, r["calls"], r["in"], r["cache_read"], r["cache_write"], r["out"]))
        c = st["session_cost_usd"]
        if c is None:
            print("  cost: unknown (a model has no price in tradingagents_gate/gate.py PRICES)")
        else:
            print("  cost this run: $%.2f  ($%.3f per decision)" % (c, c / st["real_calls"]))


def estimate_ta(plans, rules_tdf, ta_from) -> None:
    """Price the ta arm without calling anything."""
    sys.path.insert(0, str(ROOT / "tradingagents_gate"))
    from gate import TADecider, estimate_per_decision
    probe = TADecider(max_calls=0, window_from=ta_from, verbose=False)
    wcut = pd.Timestamp(ta_from, tz="UTC")
    bars, cached = 0, 0
    for sym, plan in plans.items():
        sig = plan[(plan["signal"] != "") & (plan.index >= wcut)]
        bars += len(sig)
        cached += sum(1 for ts, r in sig.iterrows()
                      if probe.key(sym, ts.strftime("%Y-%m-%d"), r["signal"]) in probe.cache)
    low = 0 if rules_tdf is None else int((rules_tdf["entry_time"] >= wcut).sum())
    low = min(low, bars)
    measured = probe.measured()
    if measured:
        per = sum(r["cost"] for r in measured) / len(measured)
        basis = "measured over %d real run(s) under these settings" % len(measured)
    else:
        per = estimate_per_decision(probe.models)
        basis = "ASSUMED, not measured: run --ta-max-calls 1 to measure it"
    lo_calls, hi_calls = max(0, low - cached), max(0, bars - cached)
    print("\n[ta] estimate (no model calls made)")
    print("  models: deep=%s quick=%s" % (probe.models["deep"], probe.models["quick"]))
    print("  window: from %s. %d signal bars, %d already cached" % (ta_from, bars, cached))
    print("  new runs needed: %d if it takes every signal, up to %d if it vetoes them all"
          % (lo_calls, hi_calls))
    print("  cost per run: $%.2f (%s)" % (per, basis))
    print("  estimated cost: $%.0f to $%.0f" % (lo_calls * per, hi_calls * per))
    print("  to run it: --arms rules gated ta --ta-max-calls %d" % hi_calls)


def main() -> None:
    args = parse_args()
    OUT.mkdir(exist_ok=True)
    print("=== data ===")
    raw = fetch(args.symbols, args.start, args.end)
    if not raw:
        sys.exit("no data fetched")
    # Keep the exact bars used, so audit.py checks trades against the same data.
    for sym, df in raw.items():
        df.to_csv(OUT / ("bars_%s.csv" % sym))

    strat = DonchianStrategy(DonchianConfig())
    plans, n = {}, 0
    print("\n=== signals ===")
    for sym, df in raw.items():
        plan = strat.prepare(df)
        longs = int((plan["signal"] == "long").sum())
        shorts = int((plan["signal"] == "short").sum())
        n += longs + shorts
        plans[sym] = plan
        print("  %s: %d long, %d short candidate bars" % (sym, longs, shorts))
    if n == 0:
        sys.exit("no candidates; nothing to test")

    ecfg = EngineConfig(
        starting_equity=args.equity, risk_pct=args.risk_pct,
        max_notional_pct=args.max_notional_pct, slippage_bps=args.slippage_bps,
        commission_bps=args.commission_bps, fill=args.fill,
        instrument=CRYPTO, fractional_units=True, gap_fills=True,
        trail_mode=args.trail_mode,
        max_positions=len(raw), max_trades_per_day=1,
        # Daily bars, 24/7 market: never flatten, let the stops do the exiting.
        flat_at_minute=10_000, max_bars_held=None,
    )

    print("\n=== arms (fill=%s, trail=%s, split=%s) ===" % (args.fill, args.trail_mode, args.split))
    summary, tdfs = {}, {}
    cut = pd.Timestamp(args.split, tz="UTC")
    ta_from = args.ta_from or args.split
    ta = None
    for arm in args.arms:
        if arm == "ta":
            if args.ta_estimate:
                continue
            sys.path.insert(0, str(ROOT / "tradingagents_gate"))
            from gate import TADecider
            ta = decider = TADecider(max_calls=args.ta_max_calls, window_from=ta_from,
                                     log_path=OUT / "ta_decisions.jsonl")
            print("\n[ta] TradingAgents, deep=%s quick=%s, deciding from %s, at most %d new runs"
                  % (ta.models["deep"], ta.models["quick"], ta_from, args.ta_max_calls))
        elif arm == "rules":
            decider = RuleDecider()
        else:
            decider = GateDecider(strat.gates())
        engine = Engine(ecfg)
        engine.set_feature_cols(strat.feature_cols)
        res = engine.run(plans, strat, decider, verbose=False)
        m = M.summarize(res.trades, res.equity_curve, args.equity)
        summary[arm] = {"metrics": m, "diagnostics": res.diagnostics,
                        "decider": decider.stats()}
        res.equity_curve.rename("equity").to_frame().to_csv(OUT / ("equity_%s.csv" % arm))

        print("\n[%s]" % arm)
        if arm == "ta":
            report_ta(ta, args)
            if not ta.complete():
                print("  INCOMPLETE: %d candidates were left undecided when the budget ran out, "
                      "so this arm's trades are not a result. Nothing below is reported for it."
                      % ta.skipped_budget)
                continue
        if not res.trades:
            print("  no trades. If this is the gated arm, a gate can never pass: that is a bug.")
            continue
        tdf = res.trades_df()
        tdf.to_csv(OUT / ("trades_%s.csv" % arm), index=False)
        tdf["entry_time"] = pd.to_datetime(tdf["entry_time"], utc=True)
        tdfs[arm] = tdf

        print(line("all", tdf))
        print(line("train", tdf[tdf["entry_time"] < cut]))
        print(line("test", tdf[tdf["entry_time"] >= cut]))
        for sym in raw:
            print(line(sym, tdf[tdf["symbol"] == sym]))
        print("  total %+.1f%%  maxDD %.1f%%  PF %.2f  before costs $%.0f  net $%.0f  "
              "friction %s%% of winners"
              % (m["total_return_pct"], m["max_drawdown_pct"], m["profit_factor"],
                 m["pnl_before_costs_$"], m["net_pnl_$"], m["friction_pct_of_ideal_profit"]))
        print("  exits %s   achieved risk %.3f%% of starting equity   ambiguous bars %d"
              % (m["exit_reasons"], m["avg_risk_pct_of_equity"],
                 res.diagnostics["ambiguous_bars"]))
        print("  candidates %d  approved %d  skipped(max positions) %d  skipped(no size) %d"
              % (res.diagnostics["candidates"], res.diagnostics["approved"],
                 res.diagnostics["skipped_max_positions"], res.diagnostics["skipped_no_size"]))
        if arm == "gated":
            print("  vetoes %s" % decider.stats()["veto_breakdown"])

    if "ta" in args.arms and args.ta_estimate:
        estimate_ta(plans, tdfs.get("rules"), ta_from)
    if ta is not None and ta.complete() and "ta" in tdfs:
        wcut = pd.Timestamp(ta_from, tz="UTC")
        print("\n=== all arms on the ta window (from %s) ===" % ta_from)
        for arm, tdf in tdfs.items():
            print(line(arm, tdf[tdf["entry_time"] >= wcut]))
        print("  If ta does not beat gated here, TradingAgents added nothing a few "
              "if-statements could not.")

    hero = "gated" if "gated" in summary else args.arms[0]
    src = OUT / ("equity_%s.csv" % hero)
    if src.exists():
        (OUT / "equity.csv").write_text(src.read_text())
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1, default=str))
    print("\nwrote %s" % OUT)
    print("\nRead this before believing any of it:")
    print("  - a t-stat under 2 on R/trade is not evidence of an edge.")
    print("  - is the test half as good as the train half? if not, it is fitted.")
    print("  - is gross positive and net negative? then friction kills it.")


if __name__ == "__main__":
    main()
