"""
engine.py  --  one position at a time, decisions at 5-minute closes, fills on
the 1-minute path.

A system hands over, per 5-minute bar (all decided at that bar's close):
  long / short          enter at this close (market order)
  or pend_long/_short   a stop-entry price resting for the next `pend_bars`
                        bars (entry when price trades through it)
  stop_*                initial protective stop price at entry
  tgt_*                 profit target price at entry (NaN = none)
  exit_*                close the trade at this close
  trail_*               candidate stop level; the stop only ratchets toward
                        price, applied from the next bar (on a split system,
                        to the second half once the first has taken profit)
  partial_r             if set, the trade is two halves: half A takes profit at
                        partial_r x the initial risk and then the stop of half B
                        moves to break-even; half B has no target

Within a 5-minute bar the 1-minute bars are walked in order, so a stop and a
target in the same 5-minute bar are filled in the order price reached them. A
stop or target gapped through at a minute's open fills at that open. Only when
both sit inside the same single minute is the order unknown; the stop is
taken (the worse case) and the count is reported.
"""

from __future__ import annotations

from typing import Dict, List

import numpy as np
import pandas as pd

EPS = 1e-8          # prices are on a 1e-5 / 1e-3 grid; levels built from pips carry float noise


def run(x: pd.DataFrame, sig: Dict[str, pd.Series], m1: pd.DataFrame, pair: str, system: int,
        start: pd.Timestamp, pend_bars: int = 1) -> List[dict]:
    n = len(x)
    ts = x.index
    c5 = x["close"].to_numpy()
    h5, l5 = x["high"].to_numpy(), x["low"].to_numpy()

    def arr(k, default=np.nan, dtype=float):
        s = sig.get(k)
        if s is None:
            return np.full(n, default, dtype=dtype)
        return s.reindex(ts).to_numpy(dtype=dtype, na_value=default)

    L, S = arr("long", False, bool), arr("short", False, bool)
    PL, PS = arr("pend_long"), arr("pend_short")
    SL, SS, TL, TS = arr("stop_long"), arr("stop_short"), arr("tgt_long"), arr("tgt_short")
    XL, XS = arr("exit_long", False, bool), arr("exit_short", False, bool)
    RL, RS = arr("trail_long"), arr("trail_short")
    partial = sig.get("partial_r")

    mt = m1.index.as_unit("ns").asi8
    mo, mh, ml, mc = (m1[k].to_numpy() for k in ("open", "high", "low", "close"))
    bar_ns = pd.Timedelta("5min").value
    tns = ts.as_unit("ns").asi8
    lo_idx = np.searchsorted(mt, tns)
    hi_idx = np.searchsorted(mt, tns + bar_ns)

    trades: List[dict] = []
    pos = None
    pend = []              # [(side, price, stop, tgt, last bar it rests)]
    ambiguous = 0
    i0 = int(np.searchsorted(tns, start.as_unit("ns").value))

    def close_half(p, k, px, why, j):
        p["x"][k], p["why"][k], p["xbar"][k] = px, why, j

    def finish(p, j):
        risk = abs(p["entry"] - p["stop0"])
        trades.append({"system": system, "pair": pair, "side": "long" if p["side"] > 0 else "short",
                       "entry_time": ts[p["bar"]], "exit_time": ts[j], "entry": p["entry"], "stop": p["stop0"],
                       "target": p["tgt"], "exit_a": p["x"][0], "why_a": p["why"][0],
                       "exit_b": p["x"][1], "why_b": p["why"][1], "risk": risk, "bars": j - p["bar"],
                       "time_a": ts[p["xbar"][0]], "time_b": ts[p["xbar"][1]]})

    def walk(p, j, a, b):
        """Settle stop/target/partial for position p over minutes a..b-1 of bar j."""
        nonlocal ambiguous
        sd = p["side"]
        for m in range(a, b):
            for k in (0, 1):
                if p["x"][k] is not None:
                    continue
                stop = p["stop"][k]
                tgt = p["tgt"] if (k == 0 or partial is None) else np.nan
                if partial is not None and k == 0:
                    tgt = p["entry"] + sd * partial * abs(p["entry"] - p["stop0"])
                hit_s = ml[m] <= stop + EPS if sd > 0 else mh[m] >= stop - EPS
                hit_t = (not np.isnan(tgt)) and (mh[m] >= tgt - EPS if sd > 0 else ml[m] <= tgt + EPS)
                gap_s = hit_s and (mo[m] <= stop if sd > 0 else mo[m] >= stop)
                gap_t = hit_t and (mo[m] >= tgt if sd > 0 else mo[m] <= tgt)
                if gap_s:
                    close_half(p, k, mo[m], "STOP", j)
                elif gap_t:
                    close_half(p, k, mo[m], "TARGET", j)
                elif hit_s:
                    if hit_t:
                        ambiguous += 1
                    close_half(p, k, stop, "STOP", j)
                elif hit_t:
                    close_half(p, k, tgt, "TARGET", j)
                    if partial is not None and k == 0:
                        p["stop"][1] = max(p["stop"][1], p["entry"]) if sd > 0 else min(p["stop"][1], p["entry"])
            if p["x"][0] is not None and p["x"][1] is not None:
                return

    for j in range(max(i0, 1), n):
        a, b = lo_idx[j], hi_idx[j]
        # --- resting stop-entry orders (one-cancels-other when there are two) ---
        if pos is None and pend:
            pend = [q for q in pend if j <= q[4]]
            hit = [q for q in pend if (q[0] > 0 and h5[j] >= q[1] - EPS) or (q[0] < 0 and l5[j] <= q[1] + EPS)]
            if hit:
                for m in range(a, b):
                    q = next((q for q in pend if (q[0] > 0 and mh[m] >= q[1] - EPS) or (q[0] < 0 and ml[m] <= q[1] + EPS)), None)
                    if q is None:
                        continue
                    side, px, stop, tgt, _ = q
                    fill = max(mo[m], px) if side > 0 else min(mo[m], px)
                    if (side > 0 and fill <= stop) or (side < 0 and fill >= stop):
                        break
                    pos = {"side": side, "entry": fill, "stop0": stop, "stop": [stop, stop], "tgt": tgt,
                           "bar": j, "x": [None, None], "why": [None, None], "xbar": [None, None]}
                    # the fill minute itself: only the stop can count after the fill
                    if (ml[m] <= stop + EPS) if side > 0 else (mh[m] >= stop - EPS):
                        close_half(pos, 0, stop, "STOP", j)
                        close_half(pos, 1, stop, "STOP", j)
                    else:
                        walk(pos, j, m + 1, b)
                    break
                pend = []
        # --- open position: stops and targets inside this bar ---
        if pos is not None and j > pos["bar"]:
            sd = pos["side"]
            lvl = [pos["stop"][k] for k in (0, 1) if pos["x"][k] is None]
            near = (l5[j] <= max(lvl) + EPS) if sd > 0 else (h5[j] >= min(lvl) - EPS)
            t_a = pos["tgt"] if partial is None else pos["entry"] + sd * partial * abs(pos["entry"] - pos["stop0"])
            if not np.isnan(t_a):
                near = near or (h5[j] >= t_a - EPS if sd > 0 else l5[j] <= t_a + EPS)
            if near:
                walk(pos, j, a, b)

        # --- decisions at the close of bar j ---
        if pos is not None:
            sd = pos["side"]
            if (sd > 0 and XL[j]) or (sd < 0 and XS[j]):
                for k in (0, 1):
                    if pos["x"][k] is None:
                        close_half(pos, k, c5[j], "EXIT", j)
            tr = RL[j] if sd > 0 else RS[j]
            if not np.isnan(tr):
                for k in (0, 1):
                    # split systems trail the second half only once the first has taken profit
                    if pos["x"][k] is None and (partial is None or (k == 1 and pos["x"][0] is not None)):
                        pos["stop"][k] = max(pos["stop"][k], tr) if sd > 0 else min(pos["stop"][k], tr)
            if pos["x"][0] is not None and pos["x"][1] is not None:
                finish(pos, max(pos["xbar"]))
                pos = None
                continue          # no new entry on the bar a trade closed
        if pos is None and not pend:
            if L[j] and np.isfinite(SL[j]) and SL[j] < c5[j]:
                pos = {"side": 1, "entry": c5[j], "stop0": SL[j], "stop": [SL[j], SL[j]], "tgt": TL[j], "bar": j,
                       "x": [None, None], "why": [None, None], "xbar": [None, None]}
            elif S[j] and np.isfinite(SS[j]) and SS[j] > c5[j]:
                pos = {"side": -1, "entry": c5[j], "stop0": SS[j], "stop": [SS[j], SS[j]], "tgt": TS[j], "bar": j,
                       "x": [None, None], "why": [None, None], "xbar": [None, None]}
            else:
                if np.isfinite(PL[j]) and np.isfinite(SL[j]) and SL[j] < PL[j]:
                    pend.append((1, PL[j], SL[j], TL[j], j + pend_bars))
                if np.isfinite(PS[j]) and np.isfinite(SS[j]) and SS[j] > PS[j]:
                    pend.append((-1, PS[j], SS[j], TS[j], j + pend_bars))
    run.ambiguous = ambiguous
    return trades
