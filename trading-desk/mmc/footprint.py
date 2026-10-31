"""
footprint.py  --  the MMC footprint with leverage (notes p.11-12).

  footprint   a trendline the market has touched twice: the last two swing lows,
              the newer one higher (an up-line), or the last two swing highs,
              the newer one lower (a down-line)
  entry       "a horizontal line on the previous high": the latest swing high
              after the second touch. The first close above it buys (mirror
              for sells). No entry until that line exists and breaks.
  stop        below the second touch of the trendline
  leverage    "enter more trades on a winning trade, never when the market goes
              against you": while the open position is in profit, each close
              above a newer swing high adds one unit, up to `max_units`
  trail       every newer swing low raises the stop of all units ("dragging a
              winning trade"); the notes give no target, so the units ride
              until the shared stop is hit
  sizing      each unit risks the same 1% on its own distance to the stop at
              the time it is added

The stop is the only resting order, so a bar either reaches it or not; it
fills at the stop, or at the open if the bar gapped through it. Entries and
adds are at bar closes. One campaign at a time per pair.
"""

from __future__ import annotations

from typing import List

import numpy as np
import pandas as pd

from setups import PIV, pivots


def run(x: pd.DataFrame, pair: str, start: pd.Timestamp, max_units: int = 5) -> List[dict]:
    o, h, l, c = (x[k].to_numpy() for k in ("open", "high", "low", "close"))
    ts = x.index
    ph, pl = pivots(x)
    n = len(c)
    i0 = int(np.searchsorted(ts.as_unit("ns").asi8, start.as_unit("ns").value))
    lows, highs = [], []                  # confirmed swings: (bar, level)
    camp = None                           # dict(side, stop, units=[(bar, entry, stop_at_add)], last_add_level)
    out, cid = [], 0

    def close_all(i, px, why):
        for (b, e, s0, k) in camp["units"]:
            out.append({"pair": pair, "campaign": cid, "unit": k, "side": "long" if camp["side"] > 0 else "short",
                        "entry_time": ts[b], "exit_time": ts[i], "entry": e, "stop": s0, "exit": px, "reason": why,
                        "bars": i - b})

    for i in range(n):
        # stop first: it rests from the previous close
        if camp is not None and i >= i0:
            sd, st = camp["side"], camp["stop"]
            if (sd > 0 and l[i] <= st) or (sd < 0 and h[i] >= st):
                px = min(o[i], st) if sd > 0 else max(o[i], st)
                close_all(i, px, "STOP")
                camp = None
        if ph[i]:
            highs.append((i - PIV, h[i - PIV]))
        if pl[i]:
            lows.append((i - PIV, l[i - PIV]))
        if i < i0:
            continue
        if camp is not None:
            sd = camp["side"]
            # trail to the newest swing on the protective side
            if sd > 0 and pl[i] and lows[-1][1] > camp["stop"] and lows[-1][1] < c[i]:
                camp["stop"] = lows[-1][1]
            if sd < 0 and ph[i] and highs[-1][1] < camp["stop"] and highs[-1][1] > c[i]:
                camp["stop"] = highs[-1][1]
            # leverage: a close through a newer swing, only while the position is in profit
            first = camp["units"][0][1]
            ref = highs if sd > 0 else lows
            if len(camp["units"]) < max_units and ref and ref[-1][0] > camp["last_ref"]:
                lvl = ref[-1][1]
                through = c[i] > lvl if sd > 0 else c[i] < lvl
                winning = (c[i] > first) if sd > 0 else (c[i] < first)
                safe = (camp["stop"] < c[i]) if sd > 0 else (camp["stop"] > c[i])
                if through and winning and safe:
                    camp["units"].append((i, c[i], camp["stop"], len(camp["units"])))
                    camp["last_ref"] = ref[-1][0]
            continue
        # a new campaign
        if len(lows) >= 2 and highs:
            (b1, l1), (b2, l2) = lows[-2], lows[-1]
            hb, hl = highs[-1]
            if l2 > l1 and hb > b2 and c[i] > hl and c[i - 1] <= hl and l2 < c[i]:
                cid += 1
                camp = {"side": 1, "stop": l2, "units": [(i, c[i], l2, 0)], "last_ref": hb}
                continue
        if len(highs) >= 2 and lows:
            (b1, h1), (b2, h2) = highs[-2], highs[-1]
            lb, ll = lows[-1]
            if h2 < h1 and lb > b2 and c[i] < ll and c[i - 1] >= ll and h2 > c[i]:
                cid += 1
                camp = {"side": -1, "stop": h2, "units": [(i, c[i], h2, 0)], "last_ref": lb}
    return out
