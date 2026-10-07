#!/usr/bin/env python3
"""
run_backtest.py  --  three published allocation strategies, tested after
their publication dates.

Chosen before any result was seen, with the rules exactly as published and no
parameter changed. Testing only the years after each was published means
nobody could have fitted the rules to them.

  faber    Faber (2007), "A Quantitative Approach to Tactical Asset
           Allocation". Month end: hold SPY if its close is above the average
           of the last 10 month-end closes, else T-bills.
           Benchmark: SPY.  Out of sample from 2007-01-01.
  cryptots Liu & Tsyvinski (SSRN 2018, RFS 2021), "Risks and Returns of
           Cryptocurrency": coin returns show time-series momentum at 1 to 4
           week horizons. Each week: hold each of BTC and ETH, equal weight,
           if its last 28-day return was positive, else cash.
           Benchmark: BTC and ETH held, equal weight.  Out of sample from 2019-01-01.
  gem      Antonacci (SSRN 2012, book 2014), global equities momentum. Month
           end: if SPY's 12-month return beats T-bills, hold whichever of SPY
           and EFA had the higher 12-month return, else AGG.
           Benchmark: SPY.  Out of sample from 2013-01-01.

Execution: a signal formed at one day's close trades at the next day's close,
so a position earns returns from the day after that. Costs per unit of
turnover: 2 bps for ETFs; 5 bps commission plus 2 bps slippage for crypto.
Cash earns the 13-week T-bill rate (^IRX).

Pass rule, fixed before running: after its publication date a strategy
passes only if (1) its Sharpe ratio beats the benchmark's with a one-sided
p-value under 0.05/3 = 0.0167 (Memmel-corrected Jobson-Korkie test; three
strategies are tested, so the threshold is split three ways), and (2) its
mean excess return over cash has t of 2 or more. Drawdown is reported, not
scored.

  python3 trend/run_backtest.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

OUT = Path(__file__).resolve().parent / "out"
ALPHA = 0.05 / 3

STRATS = {
    "faber":    {"name": "Faber 10-month SMA on SPY", "oos": "2007-01-01", "assets": ["SPY"],
                 "bench": {"SPY": 1.0}, "crypto": False},
    "cryptots": {"name": "Crypto time-series momentum (BTC, ETH)", "oos": "2019-01-01",
                 "assets": ["BTC-USD", "ETH-USD"], "bench": {"BTC-USD": 0.5, "ETH-USD": 0.5}, "crypto": True},
    "gem":      {"name": "Antonacci dual momentum (SPY, EFA, AGG)", "oos": "2013-01-01",
                 "assets": ["SPY", "EFA", "AGG"], "bench": {"SPY": 1.0}, "crypto": False},
}


# ------------------------------------------------------------------ data

def load(symbols) -> dict:
    import yfinance as yf
    out = {}
    for s in symbols:
        d = yf.download(s, start="1990-01-01", progress=False, auto_adjust=True)
        if isinstance(d.columns, pd.MultiIndex):
            d.columns = d.columns.get_level_values(0)
        c = d["Close"].dropna()
        c.index = pd.to_datetime(c.index).tz_localize(None)
        # Drop today's bar: it is still forming.
        out[s] = c[c.index < pd.Timestamp.now().normalize()]
    return out


def cash_daily(irx: pd.Series, index: pd.DatetimeIndex, crypto: bool) -> pd.Series:
    """Daily T-bill return on `index`: the annual yield accrued per calendar day."""
    y = irx.reindex(index, method="ffill").bfill() / 100.0
    days = pd.Series(index, index=index).diff().dt.days.fillna(1.0)
    return (1 + y) ** (days / 365.0) - 1


# ------------------------------------------------------------------ signals
# Each returns target weights on the dates the signal is formed (rebalance
# dates), using only closes up to and including that date.

def month_ends(idx: pd.DatetimeIndex) -> pd.DatetimeIndex:
    s = pd.Series(idx, index=idx)
    return pd.DatetimeIndex(s.groupby([idx.year, idx.month]).max().values)


def sig_faber(px: dict, irx: pd.Series) -> pd.DataFrame:
    spy = px["SPY"]
    me = month_ends(spy.index)
    m = spy.loc[me]
    # Causal: the 10-month average of month-end closes up to this month end.
    sma = m.rolling(10, min_periods=10).mean()
    w = pd.DataFrame({"SPY": (m > sma).astype(float)}, index=me)
    return w[sma.notna()]


def sig_cryptots(px: dict, irx: pd.Series) -> pd.DataFrame:
    idx = px["BTC-USD"].index
    weekly = idx[idx.dayofweek == 6]                  # Sunday closes, UTC
    w = pd.DataFrame(index=weekly, columns=["BTC-USD", "ETH-USD"], dtype=float)
    for s in w.columns:
        p = px[s].reindex(idx)
        # Causal: return over the 28 days ending at this close.
        r28 = p / p.shift(28) - 1
        w[s] = np.where(r28.loc[weekly] > 0, 1.0, 0.0)
        w.loc[r28.loc[weekly].isna().values, s] = np.nan
    # Equal weight across the coins that exist; a coin not yet trading drops out.
    n = w.notna().sum(axis=1)
    w = w.div(n.replace(0, np.nan), axis=0).fillna(0.0)
    return w[n > 0]


def sig_gem(px: dict, irx: pd.Series) -> pd.DataFrame:
    idx = px["SPY"].index
    me = month_ends(idx)
    m = pd.DataFrame({s: px[s].reindex(idx).loc[me] for s in ["SPY", "EFA", "AGG"]})
    r12 = m / m.shift(12) - 1
    # T-bill return over the same 12 months, compounded from the daily yield.
    cd = cash_daily(irx, idx, crypto=False)
    tb = (1 + cd).cumprod().loc[me]
    tb12 = tb / tb.shift(12) - 1
    w = pd.DataFrame(0.0, index=me, columns=["SPY", "EFA", "AGG"])
    for d in me:
        if r12.loc[d].isna().any() or pd.isna(tb12.loc[d]):
            w.loc[d] = np.nan
            continue
        if r12.loc[d, "SPY"] > tb12.loc[d]:
            w.loc[d, "SPY" if r12.loc[d, "SPY"] >= r12.loc[d, "EFA"] else "EFA"] = 1.0
        else:
            w.loc[d, "AGG"] = 1.0
    return w.dropna()


SIGNALS = {"faber": sig_faber, "cryptots": sig_cryptots, "gem": sig_gem}


# ------------------------------------------------------------------ engine

def run(key: str, px: dict, irx: pd.Series) -> dict:
    cfg = STRATS[key]
    assets = cfg["assets"]
    idx = px[assets[0]].index
    rets = pd.DataFrame({s: px[s].reindex(idx).pct_change() for s in assets}).fillna(0.0)
    cash = cash_daily(irx, idx, cfg["crypto"])
    cost = (0.0005 + 0.0002) if cfg["crypto"] else 0.0002

    target = SIGNALS[key](px, irx)
    start = target.index[0]
    # Held weights: a signal at close t trades at close t+1, so it earns from t+2.
    held = target.reindex(idx).ffill().shift(2).loc[start:].dropna()
    days = held.index
    w_cash = 1.0 - held.sum(axis=1)
    gross = (held * rets.loc[days]).sum(axis=1) + w_cash * cash.loc[days]
    turnover = held.diff().abs().sum(axis=1)
    turnover.iloc[0] = held.iloc[0].abs().sum()     # the first purchase pays costs too
    strat = gross - turnover * cost

    bw = pd.Series(cfg["bench"])
    if cfg["crypto"]:
        # The benchmark holds, equal weight, the coins that are trading that day.
        avail = pd.DataFrame({s: px[s].reindex(days).notna() for s in assets}).astype(float)
        bwd = avail.div(avail.sum(axis=1), axis=0)
        bench = (bwd.shift(1).fillna(bwd) * rets.loc[days]).sum(axis=1)
    else:
        bench = (rets.loc[days][bw.index] * bw).sum(axis=1)

    df = pd.DataFrame({"strategy": strat, "gross": gross, "benchmark": bench, "cash": cash.loc[days],
                       "turnover": turnover})
    for s in assets:
        df["w_" + s] = held[s]
    return {"daily": df, "target": target}


# ------------------------------------------------------------------ stats

def stats(r: pd.Series, cash: pd.Series, per_year: float) -> dict:
    ex = r - cash
    eq = (1 + r).cumprod()
    years = len(r) / per_year
    sd = ex.std(ddof=1)
    return {"cagr": (eq.iloc[-1] ** (1 / years) - 1) * 100 if years > 0 else 0.0,
            "vol": r.std(ddof=1) * math.sqrt(per_year) * 100,
            "sharpe": ex.mean() / sd * math.sqrt(per_year) if sd > 0 else 0.0,
            "maxdd": (eq / eq.cummax() - 1).min() * 100,
            "t_excess": ex.mean() / (sd / math.sqrt(len(ex))) if sd > 0 else 0.0,
            "total": (eq.iloc[-1] - 1) * 100}


def memmel(a: pd.Series, b: pd.Series) -> tuple:
    """One-sided test that Sharpe(a) > Sharpe(b), on per-period excess returns."""
    T = len(a)
    s1, s2 = a.mean() / a.std(ddof=1), b.mean() / b.std(ddof=1)
    rho = np.corrcoef(a, b)[0, 1]
    var = (2 - 2 * rho + 0.5 * (s1 ** 2 + s2 ** 2 - 2 * s1 * s2 * rho ** 2)) / T
    z = (s1 - s2) / math.sqrt(var) if var > 0 else 0.0
    p = 0.5 * math.erfc(z / math.sqrt(2))
    return z, p


def main() -> None:
    OUT.mkdir(exist_ok=True)
    syms = sorted({s for c in STRATS.values() for s in c["assets"]} | {"^IRX"})
    print("=== data ===")
    px = load(syms)
    for s in syms:
        print("  %-8s %d days, %s to %s" % (s, len(px[s]), px[s].index[0].date(), px[s].index[-1].date()))
    irx = px.pop("^IRX")

    summary = {}
    for key, cfg in STRATS.items():
        res = run(key, px, irx)
        d = res["daily"]
        d.to_csv(OUT / ("daily_%s.csv" % key))
        res["target"].to_csv(OUT / ("signals_%s.csv" % key))
        per_year = 365.0 if cfg["crypto"] else 252.0
        oos = pd.Timestamp(cfg["oos"])
        print("\n=== %s ===  (out of sample from %s)" % (cfg["name"], cfg["oos"]))
        print("  %-22s %8s %7s %7s %8s %9s" % ("", "CAGR", "vol", "Sharpe", "max DD", "t excess"))
        rows = {}
        for per, sel in (("full", d.index >= d.index[0]), ("before publication", d.index < oos),
                         ("after publication", d.index >= oos)):
            x = d[sel]
            for col, lab in (("strategy", "strategy"), ("benchmark", "buy and hold")):
                s = stats(x[col], x["cash"], per_year)
                rows[(per, col)] = s
                print("  %-22s %7.1f%% %6.1f%% %7.2f %7.1f%% %9.2f" % (
                    (per + ", " + lab)[:22] if lab == "strategy" else "  " + lab, s["cagr"], s["vol"],
                    s["sharpe"], s["maxdd"], s["t_excess"]))
        x = d[d.index >= oos]
        z, p = memmel(x["strategy"] - x["cash"], x["benchmark"] - x["cash"])
        t_ex = rows[("after publication", "strategy")]["t_excess"]
        passed = p < ALPHA and t_ex >= 2
        in_mkt = (d[[c for c in d if c.startswith("w_")]].sum(axis=1) > 0).mean() * 100
        switches = int((d["turnover"] > 0).sum())
        print("  after publication: Sharpe difference z = %+.2f, one-sided p = %.4f (needs < %.4f); "
              "t excess = %.2f (needs >= 2)" % (z, p, ALPHA, t_ex))
        print("  invested %.0f%% of days, %d trades, costs %.2f%% a year"
              % (in_mkt, switches, (d["gross"] - d["strategy"]).mean() * per_year * 100))
        print("  VERDICT: %s" % ("PASS" if passed else "FAIL"))
        summary[key] = {"name": cfg["name"], "oos": cfg["oos"], "z": z, "p": p, "pass": passed,
                        "stats": {f"{a}|{b}": v for (a, b), v in rows.items()}}

    (OUT / "summary.json").write_text(json.dumps(summary, indent=1, default=float))
    print("\nwrote %s" % OUT)


if __name__ == "__main__":
    main()
