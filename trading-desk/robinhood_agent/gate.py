#!/usr/bin/env python3
"""Order gate and trade log for the Robinhood agent.

The agent must run `gate.py check` before every order and may only place the
order when it exits 0 with "approved": true. The limits live in rules.json
and are applied here, in code, so the model cannot talk itself past them.

    python3 gate.py check --side buy --symbol NVDA --qty 1 --limit-price 120.50 \
        --bid 120.40 --ask 120.55 --equity 5000 --cash 3000 \
        --position-value 0 --open-positions 2 --day-pnl -12.40
    python3 gate.py log --side buy --symbol NVDA --qty 1 --price 120.50 \
        --status dry_run --reason "pullback to 20 SMA in uptrend"
    python3 gate.py status
"""

import argparse
import json
import sys
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
RULES = HERE / "rules.json"
WATCHLIST = HERE / "watchlist.txt"
LOG = HERE / "trade_log.jsonl"
ET = ZoneInfo("America/New_York")

# Statuses that count as an order the agent sent (or would have sent)
COUNTED = {"dry_run", "placed", "filled"}


def load_rules():
    return json.loads(RULES.read_text())


def load_watchlist():
    lines = (l.split("#")[0].strip().upper() for l in WATCHLIST.read_text().splitlines())
    return {l for l in lines if l}


def load_log():
    if not LOG.exists():
        return []
    return [json.loads(l) for l in LOG.read_text().splitlines() if l.strip()]


def now_et():
    return datetime.now(timezone.utc).astimezone(ET)


def market_open(t):
    # Regular session only; exchange holidays are not modelled
    return t.weekday() < 5 and time(9, 30) <= t.time() < time(16, 0)


def todays_orders(log, t):
    day = t.date().isoformat()
    return [e for e in log if e["ts"][:10] == day and e["status"] in COUNTED]


def check(a):
    rules = load_rules()
    log = load_log()
    t = now_et()
    sym = a.symbol.upper()
    reasons = []

    if a.order_type not in rules["allowed_order_types"]:
        reasons.append(f"order type {a.order_type} not allowed ({rules['allowed_order_types']})")
    if rules["market_hours_only"] and not market_open(t):
        reasons.append(f"market closed at {t:%a %H:%M} ET")
    if a.qty <= 0 or a.limit_price <= 0:
        reasons.append("qty and limit price must be positive")
    if a.bid <= 0 or a.ask < a.bid:
        reasons.append("no valid two-sided quote")
    else:
        spread = (a.ask - a.bid) / ((a.ask + a.bid) / 2) * 100
        if spread > rules["max_spread_pct"]:
            reasons.append(f"spread {spread:.2f}% > {rules['max_spread_pct']}%")

    notional = a.qty * a.limit_price

    if a.side == "buy":
        if rules["watchlist_only"] and sym not in load_watchlist():
            reasons.append(f"{sym} is not on the watchlist")
        if a.ask > 0 and a.limit_price > a.ask * 1.005:
            reasons.append(f"buy limit {a.limit_price} is more than 0.5% above ask {a.ask}")
        if notional > rules["max_order_usd"]:
            reasons.append(f"order ${notional:.2f} > max ${rules['max_order_usd']}")
        if a.equity <= 0:
            reasons.append("account equity must be positive")
        else:
            pct = (a.position_value + notional) / a.equity * 100
            if pct > rules["max_position_pct"]:
                reasons.append(f"position would be {pct:.1f}% of equity > {rules['max_position_pct']}%")
        if a.position_value == 0 and a.open_positions >= rules["max_open_positions"]:
            reasons.append(f"already {a.open_positions} open positions (max {rules['max_open_positions']})")
        if a.cash - notional < rules["min_cash_buffer_usd"]:
            reasons.append(f"cash after order ${a.cash - notional:.2f} < buffer ${rules['min_cash_buffer_usd']}")
        if a.day_pnl <= -rules["daily_loss_limit_usd"]:
            reasons.append(f"daily loss ${a.day_pnl:.2f} hit the ${rules['daily_loss_limit_usd']} limit; no new buys today")
        buys_today = [e for e in todays_orders(log, t) if e["side"] == "buy"]
        if len(buys_today) >= rules["max_trades_per_day"]:
            reasons.append(f"{len(buys_today)} buys already today (max {rules['max_trades_per_day']})")
        cutoff = datetime.now(timezone.utc) - timedelta(hours=rules["symbol_cooldown_hours"])
        recent = [e for e in log if e["symbol"] == sym and e["side"] == "buy"
                  and e["status"] in COUNTED and datetime.fromisoformat(e["ts"]) > cutoff]
        if recent:
            reasons.append(f"{sym} bought within the last {rules['symbol_cooldown_hours']}h")
    else:
        # Exits are never blocked by the daily count or loss limit
        if a.qty > a.held_qty:
            reasons.append(f"sell qty {a.qty} > held qty {a.held_qty}; no short selling")

    out = {
        "approved": not reasons,
        "mode": rules["mode"],
        "action": ("place the order" if rules["mode"] == "live" else
                   "do NOT place; preview/review it only and log status dry_run")
                  if not reasons else "do not trade",
        "symbol": sym, "side": a.side, "qty": a.qty,
        "limit_price": a.limit_price, "notional": round(notional, 2),
        "reasons": reasons,
    }
    print(json.dumps(out, indent=2))
    return 0 if not reasons else 1


def log_trade(a):
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "symbol": a.symbol.upper(), "side": a.side, "qty": a.qty,
        "price": a.price, "status": a.status, "order_id": a.order_id,
        "reason": a.reason,
    }
    with LOG.open("a") as f:
        f.write(json.dumps(entry) + "\n")
    print(json.dumps(entry))
    return 0


def status(_):
    rules = load_rules()
    t = now_et()
    today = todays_orders(load_log(), t)
    buys = sum(e["side"] == "buy" for e in today)
    print(json.dumps({
        "mode": rules["mode"],
        "now_et": t.strftime("%Y-%m-%d %H:%M %a"),
        "market_open": market_open(t),
        "buys_today": buys,
        "buys_left_today": max(0, rules["max_trades_per_day"] - buys),
        "orders_today": today,
        "watchlist": sorted(load_watchlist()),
        "rules": rules,
    }, indent=2))
    return 0


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("check", help="approve or reject an order against rules.json")
    c.add_argument("--side", choices=["buy", "sell"], required=True)
    c.add_argument("--symbol", required=True)
    c.add_argument("--qty", type=float, required=True)
    c.add_argument("--limit-price", type=float, required=True)
    c.add_argument("--order-type", default="limit")
    c.add_argument("--bid", type=float, required=True)
    c.add_argument("--ask", type=float, required=True)
    c.add_argument("--equity", type=float, default=0, help="total account value")
    c.add_argument("--cash", type=float, default=0, help="buying power")
    c.add_argument("--position-value", type=float, default=0, help="current value held in this symbol")
    c.add_argument("--held-qty", type=float, default=0, help="shares held in this symbol (sells)")
    c.add_argument("--open-positions", type=int, default=0)
    c.add_argument("--day-pnl", type=float, default=0, help="today's account P&L in dollars")
    c.set_defaults(fn=check)

    l = sub.add_parser("log", help="append an order to trade_log.jsonl")
    l.add_argument("--side", choices=["buy", "sell"], required=True)
    l.add_argument("--symbol", required=True)
    l.add_argument("--qty", type=float, required=True)
    l.add_argument("--price", type=float, required=True)
    l.add_argument("--status", choices=["dry_run", "placed", "filled", "cancelled", "rejected"], required=True)
    l.add_argument("--order-id", default="")
    l.add_argument("--reason", required=True)
    l.set_defaults(fn=log_trade)

    s = sub.add_parser("status", help="mode, market hours, today's orders, rules")
    s.set_defaults(fn=status)

    a = p.parse_args()
    sys.exit(a.fn(a))


if __name__ == "__main__":
    main()
