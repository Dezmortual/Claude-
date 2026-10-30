#!/usr/bin/env python3
"""
audit.py  --  re-verify every trade in out/trades_<arm>_<intrabar>.csv against
the rules as written, from the cached daily bars, sharing no code with
strategy.py.

For each stock it recomputes the scan, the base and the Bollinger and market
filters by loop, replays the two-half trade bar by bar and checks that every
logged trade (entry, both exits and their reasons) is exactly what the rules
produce, and that none is missing.

  python3 breakout/audit.py [--arms rules gated random]
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
import zlib
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / "core" / "cache" / "stocks_1d"
P = dict(L=15, touches=2, tol=0.01, age=5, depth=0.12, near=0.03, buf=0.001, stop_len=10,
         t1=1.0, t2=2.0, accel=3, trail=5, hold=20, bb_q=0.30, every=20, min_risk=0.01)


def same(a, b) -> bool:
    if a is None or b is None or (isinstance(b, float) and math.isnan(b)):
        return a is None and (b is None or (isinstance(b, float) and math.isnan(b)))
    return math.isclose(a, b, rel_tol=1e-7, abs_tol=1e-9)


def quantile(vals, q):
    """pandas' default linear interpolation."""
    s = sorted(vals)
    pos = (len(s) - 1) * q
    lo = math.floor(pos)
    return s[lo] + (s[min(lo + 1, len(s) - 1)] - s[lo]) * (pos - lo)


def setups(b: pd.DataFrame, arm: str, spy_up: dict) -> list:
    o, h, l, c, v = (b[k].tolist() for k in ("open", "high", "low", "close", "volume"))
    days = list(b.index)
    n, L = len(c), P["L"]
    out = [None] * n          # (trigger or None, stop, planned price)
    bbw = [math.nan] * n
    for i in range(19, n):
        w = c[i - 19:i + 1]
        m = sum(w) / 20
        bbw[i] = 4 * statistics.pstdev(w) / m
    for i in range(max(63, 50, L) - 1, n):
        if i < 21:
            continue
        sma50 = sum(c[i - 49:i + 1]) / 50
        scan = 2 <= c[i] <= 2000 and sum(v[i - 62:i + 1]) / 63 >= 400_000 and c[i] > c[i - 21] and c[i] > sma50
        if not scan:
            continue
        stop = min(l[i - P["stop_len"] + 1:i + 1]) * (1 - P["buf"])
        if arm == "random":
            if zlib.crc32(days[i].strftime("%Y%m%d").encode()) % P["every"] != 0:
                continue
            if c[i] - stop >= P["min_risk"] * c[i]:
                out[i] = (None, stop, c[i])
            continue
        R = max(h[i - L + 1:i + 1])
        ks = [k for k in range(L) if h[i - k] >= R * (1 - P["tol"])]
        if len(ks) < P["touches"] or max(ks) < P["age"]:
            continue
        if (R - min(l[i - L + 1:i + 1])) / R > P["depth"]:
            continue
        if not (R * (1 - P["near"]) <= c[i] < R):
            continue
        if arm == "gated":
            hist = [x for x in bbw[i - 125:i + 1]] if i >= 125 + 19 else None
            if hist is None or any(math.isnan(x) for x in hist) or bbw[i] > quantile(hist, P["bb_q"]):
                continue
            if not spy_up.get(days[i], False):
                continue
        trig = R * (1 + P["buf"])
        if trig - stop >= P["min_risk"] * trig:
            out[i] = (trig, stop, trig)
    return out


def replay(b: pd.DataFrame, arm: str, best: bool, start: pd.Timestamp, spy_up: dict) -> list:
    o, h, l, c = (b[k].tolist() for k in ("open", "high", "low", "close"))
    days = list(b.index)
    n = len(c)
    su = setups(b, arm, spy_up)
    first = max(1, next((i for i, d in enumerate(days) if d >= start), n))
    trades, pos, order = [], None, None

    def leg(i, stop, tgt, entry_bar):
        hit_s, hit_t = l[i] <= stop, h[i] >= tgt
        if entry_bar:
            if not best and hit_s:
                return (stop, "STOP")
            if best and hit_t:
                return (tgt, "TARGET")
            return None
        if hit_s and o[i] <= stop:
            return (o[i], "STOP")
        if hit_t and o[i] >= tgt:
            return (o[i], "TARGET")
        if hit_s and hit_t:
            return (tgt, "TARGET") if best else (stop, "STOP")
        if hit_s:
            return (stop, "STOP")
        if hit_t:
            return (tgt, "TARGET")
        return None

    for i in range(first, n):
        if pos and i > pos["in"]:
            if pos["a"] is None:
                pos["a"] = leg(i, pos["stop"], pos["t1"], False)
                pos["won1"] = bool(pos["a"]) and pos["a"][1] == "TARGET"
            if pos["b"] is None:
                pos["b"] = leg(i, pos["s2"], pos["t2"], False)
        if pos is None and order:
            trig, stop, plan = order
            px = o[i] if trig is None else (max(o[i], trig) if h[i] >= trig else None)
            if px is not None and px > stop:
                risk = plan - stop
                pos = {"in": i, "px": px, "stop": stop, "s2": stop, "t1": plan + P["t1"] * risk,
                       "t2": plan + P["t2"] * risk}
                pos["a"] = leg(i, stop, pos["t1"], True)
                pos["won1"] = bool(pos["a"]) and pos["a"][1] == "TARGET"
                pos["b"] = leg(i, stop, pos["t2"], True)
        order = None
        if pos:
            held = i - pos["in"]
            if pos["a"] is None and held >= P["accel"]:
                pos["a"] = (c[i], "NO_ACCEL")
            if pos["won1"] and pos["b"] is None:
                pos["s2"] = max(pos["s2"], min(l[i - P["trail"] + 1:i + 1]))
            if held >= P["hold"]:
                pos["a"] = pos["a"] or (c[i], "TIME")
                pos["b"] = pos["b"] or (c[i], "TIME")
            if pos["a"] and pos["b"]:
                trades.append((days[pos["in"]], days[i], pos["px"], pos["a"][0], pos["a"][1], pos["b"][0], pos["b"][1]))
                pos = None
        if pos is None and su[i] is not None and i + 1 < n:
            order = su[i]
    return trades


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "out"))
    ap.add_argument("--arms", nargs="+", default=None)
    a = ap.parse_args()
    out = Path(a.out)
    st = json.loads((out / "settings.json").read_text())
    members = pd.read_csv(CACHE / "members.csv", parse_dates=["added"])
    added = dict(zip(members["symbol"], members["added"]))
    spy = pd.read_csv(CACHE / "SPY.csv", index_col=0, parse_dates=True)
    spy = spy[spy.index < pd.Timestamp.now().normalize()]
    sc = spy["close"].tolist()
    spy_up = {d: (k >= 49 and sc[k] > sum(sc[k - 49:k + 1]) / 50) for k, d in enumerate(spy.index)}
    failed = False
    for mode in st["intrabar"]:
        for arm in a.arms or st["arms"]:
            log = pd.read_csv(out / f"trades_{arm}_{mode}.csv", parse_dates=["entry_time", "exit_time"])
            ok = total = 0
            for sym, g in log.groupby("symbol"):
                b = pd.read_csv(CACHE / f"{sym}.csv", index_col=0, parse_dates=True)
                b = b[b.index < pd.Timestamp.now().normalize()]
                start = pd.Timestamp(st["start"])
                if not st["ignore_added"] and pd.notna(added.get(sym)):
                    start = max(start, added[sym])
                want = replay(b, arm, mode == "best", start, spy_up)
                got = list(g.sort_values("entry_time")[["entry_time", "exit_time", "entry", "exit1", "why1", "exit2", "why2"]]
                           .itertuples(index=False, name=None))
                for k, (w, t) in enumerate(zip(want, got)):
                    if (w[0] == t[0] and w[1] == t[1] and w[4] == t[4] and w[6] == t[6]
                            and same(w[2], t[2]) and same(w[3], t[3]) and same(w[5], t[5])):
                        ok += 1
                    elif total - ok < 10:
                        print("  FAIL %s/%s %s #%d: expected %s, logged %s" % (arm, mode, sym, k, w, t))
                if len(want) != len(got):
                    print("  FAIL %s/%s %s: rules produce %d trades, log has %d" % (arm, mode, sym, len(want), len(got)))
                total += max(len(want), len(got))
            print("[%s, %s] %d/%d trades satisfy the rules as written" % (arm, mode, ok, total))
            failed |= ok != total
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
