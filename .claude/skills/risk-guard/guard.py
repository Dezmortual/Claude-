#!/usr/bin/env python3
"""Stateful risk kill-switch: per-trade cap and daily drawdown limit.

State: ~/.claude/skills/risk-guard/state.json (override with RISK_GUARD_STATE).

  init   --equity N [--per-trade-cap 50] [--daily-limit 200]
  check  --risk-usd N          exit 0 = OK, exit 2 = VETO
  open   --order-link-id ... --symbol ... --side ... --qty ... --entry ...
         --sl ... --tp ... --risk-usd ...
  close  --order-link-id ... --exit ... --realized-pnl ...
  status [--json]

check vetoes when:
  - there is no state file, or the session is from an earlier UTC day
  - risk-usd exceeds the per-trade cap
  - realized P&L is already at or below -daily-limit
  - realized P&L minus the risk of all open trades minus this trade's risk
    would breach -daily-limit

A session can't be re-initialised on the same UTC day once it has trades,
so the daily limit can't be reset by re-running init. There is no override.
"""
import argparse
import contextlib
import datetime as dt
import fcntl
import json
import os
import sys
import tempfile

STATE = os.environ.get("RISK_GUARD_STATE") or os.path.expanduser("~/.claude/skills/risk-guard/state.json")
VETO = 2


def today():
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


@contextlib.contextmanager
def locked():
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with open(STATE + ".lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def load():
    if not os.path.exists(STATE):
        return None
    with open(STATE) as f:
        return json.load(f)


def save(state):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(STATE), prefix=".state.")
    with os.fdopen(fd, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE)


def open_risk(state):
    return sum(t["risk_usd"] for t in state["open_trades"])


def veto(msg):
    print(f"VETO: {msg}", file=sys.stderr)
    return VETO


def cmd_init(a):
    with locked():
        s = load()
        carried = []
        if s:
            if s["session_date"] == today() and (s["closed_trades"] or s["open_trades"]):
                return veto(
                    f"session for {today()} already has trades "
                    f"(realized {s['realized_pnl']:+.2f}); daily limits cannot be reset today"
                )
            carried = s["open_trades"]
        s = {
            "session_date": today(),
            "started_at": now(),
            "start_equity": a.equity,
            "per_trade_cap": a.per_trade_cap,
            "daily_limit": a.daily_limit,
            "realized_pnl": 0.0,
            "open_trades": carried,
            "closed_trades": [],
        }
        save(s)
    print(f"session {s['session_date']} equity {a.equity:.2f} cap {a.per_trade_cap:.2f}/trade "
          f"daily limit -{a.daily_limit:.2f}" + (f"; carried {len(carried)} open trade(s)" if carried else ""))
    return 0


def evaluate(s, risk):
    if s is None:
        return f"no state at {STATE}; run `guard.py init --equity N` first"
    if s["session_date"] != today():
        return f"session is from {s['session_date']}, today is {today()} (UTC); run init"
    if risk <= 0:
        return "risk-usd must be positive"
    if risk > s["per_trade_cap"]:
        return f"risk {risk:.2f} exceeds per-trade cap {s['per_trade_cap']:.2f}"
    floor = -s["daily_limit"]
    if s["realized_pnl"] <= floor:
        return f"daily drawdown hit: realized {s['realized_pnl']:+.2f} <= {floor:.2f}"
    worst = s["realized_pnl"] - open_risk(s) - risk
    if worst < floor:
        return (f"worst case {worst:+.2f} (realized {s['realized_pnl']:+.2f}, open risk "
                f"{open_risk(s):.2f}, this trade {risk:.2f}) breaches {floor:.2f}")
    return None


def cmd_check(a):
    with locked():
        s = load()
    reason = evaluate(s, a.risk_usd)
    if reason:
        return veto(reason)
    headroom = s["daily_limit"] + s["realized_pnl"] - open_risk(s) - a.risk_usd
    print(f"OK: risk {a.risk_usd:.2f} within cap {s['per_trade_cap']:.2f}; headroom after {headroom:.2f}")
    return 0


def cmd_open(a):
    with locked():
        s = load()
        if s is None:
            return veto(f"no state at {STATE}; run init")
        if any(t["order_link_id"] == a.order_link_id for t in s["open_trades"] + s["closed_trades"]):
            print(f"error: order-link-id {a.order_link_id} already recorded", file=sys.stderr)
            return 1
        s["open_trades"].append({
            "order_link_id": a.order_link_id, "symbol": a.symbol.upper(), "side": a.side.lower(),
            "qty": a.qty, "entry": a.entry, "sl": a.sl, "tp": a.tp, "risk_usd": a.risk_usd,
            "opened_at": now(),
        })
        save(s)
    print(f"recorded open {a.order_link_id} {a.symbol.upper()} {a.side} {a.qty} @ {a.entry} risk {a.risk_usd:.2f}")
    return 0


def cmd_close(a):
    with locked():
        s = load()
        if s is None:
            return veto(f"no state at {STATE}; run init")
        match = [t for t in s["open_trades"] if t["order_link_id"] == a.order_link_id]
        if not match:
            print(f"error: no open trade with order-link-id {a.order_link_id}", file=sys.stderr)
            return 1
        t = match[0]
        s["open_trades"].remove(t)
        t.update(exit=a.exit, realized_pnl=a.realized_pnl, closed_at=now())
        s["closed_trades"].append(t)
        s["realized_pnl"] = round(s["realized_pnl"] + a.realized_pnl, 8)
        save(s)
    print(f"recorded close {a.order_link_id} @ {a.exit} pnl {a.realized_pnl:+.2f}; "
          f"session realized {s['realized_pnl']:+.2f}")
    if s["realized_pnl"] <= -s["daily_limit"]:
        print(f"KILL-SWITCH: daily limit -{s['daily_limit']:.2f} reached; new trades vetoed until next UTC day")
    return 0


def cmd_status(a):
    with locked():
        s = load()
    if s is None:
        print(f"no state at {STATE}; run init", file=sys.stderr)
        return 1
    stale = s["session_date"] != today()
    halted = s["realized_pnl"] <= -s["daily_limit"]
    if a.json:
        print(json.dumps({**s, "state_path": STATE, "open_risk": open_risk(s), "stale": stale, "halted": halted}, indent=2))
        return 0
    print(f"session {s['session_date']}{' (STALE)' if stale else ''}  equity {s['start_equity']:.2f}  "
          f"realized {s['realized_pnl']:+.2f}  limit -{s['daily_limit']:.2f}  cap {s['per_trade_cap']:.2f}/trade"
          f"{'  HALTED' if halted else ''}")
    print(f"open trades ({len(s['open_trades'])}, risk {open_risk(s):.2f}):")
    for t in s["open_trades"]:
        print(f"  {t['order_link_id']}  {t['symbol']} {t['side']} {t['qty']} @ {t['entry']}  sl {t['sl']} tp {t['tp']}  risk {t['risk_usd']:.2f}")
    print(f"closed trades ({len(s['closed_trades'])}):")
    for t in s["closed_trades"]:
        print(f"  {t['order_link_id']}  {t['symbol']} {t['side']} {t['qty']} {t['entry']} -> {t['exit']}  pnl {t['realized_pnl']:+.2f}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("init")
    p.add_argument("--equity", type=float, required=True)
    p.add_argument("--per-trade-cap", type=float, default=50.0)
    p.add_argument("--daily-limit", type=float, default=200.0)

    p = sub.add_parser("check")
    p.add_argument("--risk-usd", type=float, required=True)

    p = sub.add_parser("open")
    for f in ("order-link-id", "symbol", "side"):
        p.add_argument(f"--{f}", required=True)
    for f in ("qty", "entry", "sl", "tp", "risk-usd"):
        p.add_argument(f"--{f}", type=float, required=True)

    p = sub.add_parser("close")
    p.add_argument("--order-link-id", required=True)
    p.add_argument("--exit", type=float, required=True)
    p.add_argument("--realized-pnl", type=float, required=True)

    p = sub.add_parser("status")
    p.add_argument("--json", action="store_true")

    a = ap.parse_args()
    if a.cmd == "init" and (a.equity <= 0 or a.per_trade_cap <= 0 or a.daily_limit <= 0):
        print("error: equity, per-trade-cap and daily-limit must be positive", file=sys.stderr)
        return 1
    return {"init": cmd_init, "check": cmd_check, "open": cmd_open, "close": cmd_close, "status": cmd_status}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
