#!/usr/bin/env python3
"""Position-sizing math for a USDT linear perp scalp. No network, no keys.

Given equity, dollar risk, side, entry, and a stop/TP (as % or price), this
returns tick-rounded prices, a lot-floored quantity, notional, margin, R:R
and warnings.

Rounding bias, so the plan never overstates reward or understates risk:
  entry  nearest tick
  stop   away from entry   (long: down, short: up)
  TP     toward entry      (long: down, short: up)
  qty    floored to lot    (actual risk <= requested risk)

Sizing includes taker fees on entry and stop by default (--fee-pct 0.055),
so a full stop-out, fees included, costs at most --risk.
"""
import argparse
import json
import sys
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal, InvalidOperation


def D(x):
    try:
        return Decimal(str(x))
    except InvalidOperation:
        raise SystemExit(f"error: not a number: {x!r}")


def to_step(value, step, rounding):
    return (value / step).quantize(Decimal(1), rounding=rounding) * step


def plan(equity, risk, side, entry, tick, lot, leverage, stop=None, stop_pct=None, tp=None, tp_pct=None,
         min_qty=None, fee_pct=Decimal("0.055")):
    long = side == "long"
    warnings = []
    entry = to_step(entry, tick, ROUND_HALF_UP)

    if stop is None:
        stop = entry * (1 - stop_pct / 100) if long else entry * (1 + stop_pct / 100)
    if tp is None:
        tp = entry * (1 + tp_pct / 100) if long else entry * (1 - tp_pct / 100)
    # Long: stop rounds down (away), TP rounds down (toward). Short: both round up.
    stop = to_step(stop, tick, ROUND_FLOOR if long else ROUND_CEILING)
    tp = to_step(tp, tick, ROUND_FLOOR if long else ROUND_CEILING)

    if long and not (stop < entry < tp):
        raise SystemExit(f"error: long needs stop < entry < tp, got stop={stop} entry={entry} tp={tp}")
    if not long and not (tp < entry < stop):
        raise SystemExit(f"error: short needs tp < entry < stop, got tp={tp} entry={entry} stop={stop}")

    fee = fee_pct / 100
    stop_dist = abs(entry - stop)
    tp_dist = abs(tp - entry)
    loss_per_unit = stop_dist + (entry + stop) * fee
    qty = to_step(risk / loss_per_unit, lot, ROUND_FLOOR)

    if min_qty is not None and qty < min_qty:
        warnings.append(f"qty {qty} is below exchange minimum {min_qty}; trade not possible at this risk")
    if qty <= 0:
        warnings.append("qty rounded to zero: risk too small for this stop distance and lot size")

    notional = qty * entry
    margin = notional / leverage
    actual_risk = qty * loss_per_unit
    reward = qty * (tp_dist - (entry + tp) * fee)
    rr = (tp_dist / stop_dist) if stop_dist else Decimal(0)

    if margin > equity:
        warnings.append(f"margin {margin:.2f} exceeds equity {equity}; raise leverage or cut size")
    elif margin > equity * Decimal("0.5"):
        warnings.append(f"margin {margin:.2f} is over 50% of equity")
    if risk > equity * Decimal("0.05"):
        warnings.append(f"risk {risk} is over 5% of equity")
    if rr < 1:
        warnings.append(f"R:R {rr:.2f} is below 1")
    if stop_dist / entry < fee * 4:
        warnings.append("stop is within ~4x the taker fee of entry; fees dominate this trade")

    return {
        "side": side,
        "entry": str(entry),
        "stop": str(stop),
        "tp": str(tp),
        "qty": str(qty.normalize() if qty else qty),
        "stop_dist_pct": float(stop_dist / entry * 100),
        "tp_dist_pct": float(tp_dist / entry * 100),
        "notional": float(notional),
        "margin": float(margin),
        "leverage": float(leverage),
        "risk_requested": float(risk),
        "risk_actual": float(actual_risk),
        "reward_net": float(reward),
        "rr": float(rr),
        "fee_pct": float(fee_pct),
        "warnings": warnings,
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--equity", required=True)
    ap.add_argument("--risk", required=True, help="max USDT loss if stopped out, fees included")
    ap.add_argument("--side", required=True, choices=["long", "short"])
    ap.add_argument("--entry", required=True)
    ap.add_argument("--symbol", default="")
    ap.add_argument("--tick", required=True, help="instrument tickSize")
    ap.add_argument("--lot", required=True, help="instrument qtyStep")
    ap.add_argument("--min-qty", help="instrument minOrderQty")
    ap.add_argument("--leverage", default="10")
    stop = ap.add_mutually_exclusive_group()
    stop.add_argument("--stop", help="stop price")
    stop.add_argument("--stop-pct", default="1.0", help="stop distance in %% (default 1.0)")
    tp = ap.add_mutually_exclusive_group()
    tp.add_argument("--tp", help="take-profit price")
    tp.add_argument("--tp-pct", default="2.0", help="TP distance in %% (default 2.0)")
    ap.add_argument("--fee-pct", default="0.055", help="taker fee %% per side (default 0.055)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    nums = {k: D(getattr(args, k)) for k in ("equity", "risk", "entry", "tick", "lot", "leverage", "fee_pct")}
    for k in ("equity", "risk", "entry", "tick", "lot", "leverage"):
        if nums[k] <= 0:
            raise SystemExit(f"error: --{k} must be positive")

    p = plan(
        side=args.side,
        stop=D(args.stop) if args.stop else None,
        stop_pct=D(args.stop_pct),
        tp=D(args.tp) if args.tp else None,
        tp_pct=D(args.tp_pct),
        min_qty=D(args.min_qty) if args.min_qty else None,
        **nums,
    )
    p["symbol"] = args.symbol.upper()

    if args.json:
        print(json.dumps(p, indent=2))
    else:
        print(f"{p['symbol'] or 'plan'}  {p['side'].upper()}")
        print(f"  entry   {p['entry']}")
        print(f"  stop    {p['stop']}  (-{p['stop_dist_pct']:.3f}%)")
        print(f"  tp      {p['tp']}  (+{p['tp_dist_pct']:.3f}%)")
        print(f"  qty     {p['qty']}")
        print(f"  notional {p['notional']:.2f}  margin {p['margin']:.2f} @ {p['leverage']:g}x")
        print(f"  risk    {p['risk_actual']:.2f} of {p['risk_requested']:.2f} requested (fees incl.)")
        print(f"  reward  {p['reward_net']:.2f} net   R:R {p['rr']:.2f}")
        for w in p["warnings"]:
            print(f"  WARNING: {w}")
    return 1 if any("not possible" in w or "zero" in w for w in p["warnings"]) else 0


if __name__ == "__main__":
    sys.exit(main())
