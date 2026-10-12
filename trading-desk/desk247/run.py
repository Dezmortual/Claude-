#!/usr/bin/env python3
"""
run.py  --  operate desk247, the 24/7 paper trading system.

  python3 desk247/run.py once            one tick now (cron-friendly)
  python3 desk247/run.py loop            tick every hour at hh:02 UTC, forever
  python3 desk247/run.py research        print the research read and the review checklist
  python3 desk247/run.py status          account, positions, open orders, limits
  python3 desk247/run.py approve [ID|all]    approve entries waiting in manual mode
  python3 desk247/run.py summary [DAY]   write the end-of-day summary (default: today so far)
  python3 desk247/run.py health          exit 1 if the last tick is over 2h old (for a watchdog)
  python3 desk247/run.py reset-kill --confirm "reason"   clear the kill switch after review

Paper only. There is no live broker in this code on purpose.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import asdict
from pathlib import Path

os.environ["TZ"] = "UTC"
time.tzset()

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

import pandas as pd                                         # noqa: E402

import config as C                                          # noqa: E402
import monitor                                              # noqa: E402
import portfolio as pf                                      # noqa: E402
import research                                             # noqa: E402
from core.botstate import BotState, Candidate, Position     # noqa: E402
from execution import Executor, Ledger, PaperBroker         # noqa: E402

BOT = "desk247"


def make_state(p: pf.Portfolio) -> BotState:
    return BotState(BOT, persona="Systematic swing", strategy="BTC/ETH 28-day momentum + hard risk",
                    broker="paper", start_equity=C.START_EQUITY, state_dir=C.STATE_DIR)


def read_events() -> list:
    path = C.STATE_DIR / f"{BOT}.events.jsonl"
    if not path.exists():
        return []
    out = []
    for line in path.read_text().splitlines():
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def write_summary(day: str, p: pf.Portfolio, equity: float, prices: dict) -> Path:
    out = C.WORK_DIR / "summaries" / f"{day}.md"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(monitor.summary(day, p, read_events(), equity, prices))
    return out


def cmd_once() -> int:
    now = pd.Timestamp.now(tz="UTC")
    p = pf.load()
    state = make_state(p)
    ex = Executor(Ledger(), PaperBroker(), log=state.event)
    data, err = None, None
    try:
        data = research.fetch(now)
    except research.BadData as e:
        err = str(e)
    res = monitor.tick(now, p, ex, state.event, data=data, data_error=err)
    pf.save(p)

    prices = res["prices"]
    eq = res["equity"] if res["equity"] is not None else state.snapshot.equity
    if res.get("day_rolled"):
        path = write_summary(res["prev_day"], p, eq, prices)
        monitor.send_alert("INFO", f"end-of-day summary written: {path}", state.event)
    cands = [Candidate(symbol=c, note=r.regime, proposed="hold" if r.derived["ret_28d"] > 0 else "cash",
                       aux={"ret_28d": r.derived["ret_28d"], "atr20_pct": r.derived["atr20_pct"]})
             for c, r in res["reads"].items()]
    positions = [Position(symbol=c, qty=h.qty, side="long", entry=h.entry, last=prices.get(c, h.entry),
                          unrealized=(prices.get(c, h.entry) - h.entry) * h.qty, opened_at=h.opened_at)
                 for c, h in p.positions.items()]
    status = "halted" if p.kill else ("error" if not res["ok"] else "running")
    msg = "; ".join(res["alerts"][-3:]) or "ok"
    state.update(status=status, equity=eq, cash=p.cash, day_pnl=eq - p.day_open_equity,
                 open_positions=positions, candidates=cands, message=msg,
                 next_wake=str((now.floor("h") + pd.Timedelta(hours=1, minutes=C.TICK_MINUTE))))
    state.event("heartbeat", equity=eq, ok=res["ok"])
    print(f"{now:%Y-%m-%d %H:%M} UTC  equity {eq:,.2f}  positions {list(p.positions) or 'none'}  "
          f"status {status}")
    return 0 if res["ok"] else 2


def cmd_loop() -> int:
    while True:
        try:
            cmd_once()
        except Exception as e:                      # never let one bad tick end the loop
            print(f"[CRITICAL] tick crashed: {type(e).__name__}: {e}", flush=True)
            try:
                make_state(pf.load()).event("error", where="tick", error=repr(e))
            except Exception:
                pass
        now = pd.Timestamp.now(tz="UTC")
        nxt = now.floor("h") + pd.Timedelta(hours=1, minutes=C.TICK_MINUTE)
        time.sleep(max((nxt - now).total_seconds(), 30))


def cmd_status() -> int:
    p = pf.load()
    led = Ledger()
    print(json.dumps(asdict(p), indent=1))
    opn = led.open_orders()
    print(f"open orders: {len(opn)}")
    for o in opn:
        print(f"  {o.id}  {o.side} {o.qty:.6f} {o.coin}  status {o.status}  {o.note}")
    return 0


def cmd_approve(target: str) -> int:
    p = pf.load()
    ex = Executor(Ledger(), PaperBroker(), log=make_state(p).event)
    pend = [o for o in ex.ledger.open_orders() if o.status == "pending_approval"]
    if not pend:
        print("nothing waiting for approval")
        return 0
    for o in pend:
        if target in ("all", o.id):
            ex.approve(o.id)
            print(f"approved {o.id}: buy {o.qty:.6f} {o.coin} (ref {o.ref_price:,.2f}, stop {o.stop:,.2f}); "
                  f"it fills on the next tick")
        elif not target:
            print(f"waiting: {o.id}: buy {o.qty:.6f} {o.coin} ~${o.qty * o.ref_price:,.0f}, stop {o.stop:,.2f}")
    return 0


def cmd_research() -> int:
    data = research.fetch()
    print(research.report({c: research.read_coin(c, d["daily"], d["hourly"]) for c, d in data.items()}))
    return 0


def cmd_health() -> int:
    snap = C.STATE_DIR / f"{BOT}.json"
    if not snap.exists():
        print("no snapshot yet")
        return 1
    s = json.loads(snap.read_text())
    age = (pd.Timestamp.now(tz="UTC") - pd.Timestamp(s["updated_at"])).total_seconds()
    print(f"last tick {age / 60:.0f} min ago, status {s['status']}, equity {s['equity']:,.2f}")
    return 0 if age < 2 * 3600 and s["status"] in ("running",) else 1


def cmd_reset_kill(reason: str) -> int:
    p = pf.load()
    if not p.kill:
        print("kill switch is not on")
        return 0
    if not reason:
        print("refused: give the reason you reviewed, e.g. --confirm \"reviewed drawdown, rules unchanged\"")
        return 1
    make_state(p).event("alert", level="INFO", message=f"kill switch reset by human: {reason}")
    eq = p.cash + sum(h.qty * h.entry for h in p.positions.values())
    p.kill, p.kill_reason, p.peak_equity = False, "", eq      # drawdown is measured from here on
    pf.save(p)
    print(f"kill switch cleared; new peak {eq:,.2f}. Trading resumes at the next weekly rebalance.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["once", "loop", "research", "status", "approve", "summary", "health",
                                    "reset-kill"])
    ap.add_argument("arg", nargs="?", default="")
    ap.add_argument("--confirm", default="")
    a = ap.parse_args()
    if a.cmd == "summary":
        p = pf.load()
        day = a.arg or pd.Timestamp.now(tz="UTC").strftime("%Y-%m-%d")
        eq = p.cash + sum(h.qty * h.entry for h in p.positions.values())
        print(write_summary(day, p, eq, {}).read_text())
        return 0
    if a.cmd == "approve":
        return cmd_approve(a.arg)
    if a.cmd == "reset-kill":
        return cmd_reset_kill(a.confirm)
    return {"once": cmd_once, "loop": cmd_loop, "research": cmd_research, "status": cmd_status,
            "health": cmd_health}[a.cmd]()

if __name__ == "__main__":
    sys.exit(main())
