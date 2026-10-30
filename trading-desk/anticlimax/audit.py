#!/usr/bin/env python3
"""
audit.py  --  re-verify every trade in out/trades_<arm>_<intrabar>.csv against the rules as
written, from the cached candles, sharing no code with strategy.py.

For each symbol it recomputes the patterns, pivots and EMA by loop, replays the
orders bar by bar and checks that every logged trade is exactly the trade the
rules produce, and that none is missing:

  - each entry is a stop fill at a setup bar's extreme (or the open on a gap)
    within the expiry window of a pattern that passed the arm's filters, and no
    bar in between cleared the limit line
  - each exit is the limit-line stop, the R target, an opposite pattern's close,
    or a reversal by the opposite entry, with the run's worst/best reading of
    a bar's high/low order
  - trades follow each other with no overlap

  python3 anticlimax/audit.py [--out anticlimax/out]
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / "core" / "cache"
INC, EXPIRY, PIV, EMA, SLOPE, WARMUP = 3, 10, 5, 50, 5, 200


def same(a: float, b: float) -> bool:
    return math.isclose(a, b, rel_tol=1e-7, abs_tol=1e-9)


def replay(bars: pd.DataFrame, gated: bool, target_r: float, opp_exit: bool, best: bool) -> list:
    o, h, l, c = (bars[k].tolist() for k in ("open", "high", "low", "close"))
    n = len(c)

    bear_ac, bull_ac = [False] * n, [False] * n
    for i in range(INC + 1, n):
        ups = [h[i - k] - h[i - k - 1] for k in range(INC)]       # newest first
        dns = [l[i - k - 1] - l[i - k] for k in range(INC)]
        bear_ac[i] = all(u > 0 for u in ups) and all(ups[k] > ups[k + 1] for k in range(INC - 1))
        bull_ac[i] = all(d > 0 for d in dns) and all(dns[k] > dns[k + 1] for k in range(INC - 1))

    last_ph, last_pl = [math.nan] * n, [math.nan] * n
    ph = pl = math.nan
    for i in range(n):
        m = i - PIV
        if m - PIV >= 0:
            others = [j for j in range(m - PIV, i + 1) if j != m]
            if all(h[m] > h[j] for j in others):
                ph = h[m]
            if all(l[m] < l[j] for j in others):
                pl = l[m]
        last_ph[i], last_pl[i] = ph, pl

    ema = [math.nan] * n
    a = 2.0 / (EMA + 1)
    for i in range(EMA - 1, n):
        ema[i] = sum(c[:EMA]) / EMA if i == EMA - 1 else a * c[i] + (1 - a) * ema[i - 1]

    def bear_ok(i: int) -> bool:
        if not bear_ac[i]:
            return False
        if not gated:
            return True
        hc = max(c[i - INC:i + 1])
        return (not math.isnan(last_ph[i]) and hc <= last_ph[i]
                and i >= SLOPE and ema[i] < ema[i - SLOPE])

    def bull_ok(i: int) -> bool:
        if not bull_ac[i]:
            return False
        if not gated:
            return True
        lc = min(c[i - INC:i + 1])
        return (not math.isnan(last_pl[i]) and lc >= last_pl[i]
                and i >= SLOPE and ema[i] > ema[i - SLOPE])

    out = []
    side = 0                          # open trade: +1 long, -1 short
    t_in = t_entry = t_stop = t_tgt = None
    setup = None                      # dict(side, limit, trig, born)
    order = None                      # order resting through the next bar

    def exit_on(i: int, entry_bar: bool):
        if side == 1:
            stop_hit, tgt_hit = l[i] <= t_stop, t_tgt is not None and h[i] >= t_tgt
            stop_gap, tgt_gap = o[i] <= t_stop, t_tgt is not None and o[i] >= t_tgt
        else:
            stop_hit, tgt_hit = h[i] >= t_stop, t_tgt is not None and l[i] <= t_tgt
            stop_gap, tgt_gap = o[i] >= t_stop, t_tgt is not None and o[i] <= t_tgt
        if entry_bar:
            if not best and stop_hit:
                return t_stop, "STOP"
            if best and tgt_hit:
                return t_tgt, "TARGET"
            return None
        if stop_hit and stop_gap:
            return o[i], "STOP"
        if tgt_hit and tgt_gap:
            return o[i], "TARGET"
        if stop_hit and tgt_hit:
            return (t_tgt, "TARGET") if best else (t_stop, "STOP")
        if stop_hit:
            return t_stop, "STOP"
        if tgt_hit:
            return t_tgt, "TARGET"
        return None

    for i in range(WARMUP, n):
        if side and i > t_in:
            r = exit_on(i, False)
            if r:
                out.append((t_in, i, side, t_entry, r[0], r[1])); side = 0

        if order and order["side"] != side:
            s = order["side"]
            if (s == 1 and h[i] >= order["trig"]) or (s == -1 and l[i] <= order["trig"]):
                px = max(o[i], order["trig"]) if s == 1 else min(o[i], order["trig"])
                if side:
                    out.append((t_in, i, side, t_entry, px, "REVERSE"))
                side, t_in, t_entry, t_stop, t_tgt = s, i, px, order["stop"], order["tgt"]
                r = exit_on(i, True)
                if r:
                    out.append((t_in, i, side, t_entry, r[0], r[1])); side = 0

        if setup and setup["side"] == side:
            setup = None
        if opp_exit and side == 1 and bear_ac[i]:
            out.append((t_in, i, side, t_entry, c[i], "OPP_AC")); side = 0
        elif opp_exit and side == -1 and bull_ac[i]:
            out.append((t_in, i, side, t_entry, c[i], "OPP_AC")); side = 0
        if setup:
            s = setup["side"]
            cleared = l[i] > setup["limit"] if s == -1 else h[i] < setup["limit"]
            if cleared or i - setup["born"] > EXPIRY:
                setup = None
            elif s == -1 and c[i] < o[i]:
                setup["trig"] = l[i]
            elif s == 1 and c[i] > o[i]:
                setup["trig"] = h[i]
        if bear_ok(i):
            setup = {"side": -1, "limit": h[i], "born": i, "trig": l[i] if c[i] < o[i] else None}
        elif bull_ok(i):
            setup = {"side": 1, "limit": l[i], "born": i, "trig": h[i] if c[i] > o[i] else None}

        order = None
        if setup and setup["trig"] is not None and setup["trig"] != setup["limit"] and setup["side"] != side:
            tr, lim = setup["trig"], setup["limit"]
            order = {"side": setup["side"], "trig": tr, "stop": lim,
                     "tgt": tr + target_r * (tr - lim) if target_r > 0 else None}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(HERE / "out"))
    out_dir = Path(ap.parse_args().out)
    st = json.loads((out_dir / "settings.json").read_text())
    failed = False
    for arm, mode in [(a, m) for m in st["intrabar"] for a in st["arms"]]:
        log = pd.read_csv(out_dir / f"trades_{arm}_{mode}.csv", parse_dates=["entry_time", "exit_time"])
        ok = total = 0
        for sym in st["symbols"]:
            g = log[log["symbol"] == sym]
            bars = pd.read_csv(CACHE / f"{sym}_{st['interval']}.csv", index_col=0, parse_dates=True)
            bars = bars[bars.index >= pd.Timestamp(st["start"], tz="UTC")]
            if len(g):
                bars = bars[bars.index <= g["exit_time"].max()]
            exp = replay(bars, arm == "gated", st["target_r"], not st["no_opposite_exit"], mode == "best")
            idx = bars.index
            want = [(idx[a], idx[b], "long" if p > 0 else "short", e, x, r) for a, b, p, e, x, r in exp]
            got = list(g.sort_values(["entry_time", "exit_time"])[
                ["entry_time", "exit_time", "side", "entry", "exit", "reason"]].itertuples(index=False, name=None))
            for k, (w, t) in enumerate(zip(want, got)):
                if (w[0] == t[0] and w[1] == t[1] and w[2] == t[2] and w[5] == t[5]
                        and same(w[3], t[3]) and same(w[4], t[4])):
                    ok += 1
                elif total - ok < 10:
                    print("  FAIL %s %s #%d: expected %s, logged %s" % (arm + "/" + mode, sym, k, w, t))
            if len(want) != len(got):
                print("  FAIL %s %s: rules produce %d trades, log has %d" % (arm + "/" + mode, sym, len(want), len(got)))
            total += max(len(want), len(got))
        print("[%s, %s] %d/%d trades satisfy the rules as written" % (arm, mode, ok, total))
        failed |= ok != total
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
