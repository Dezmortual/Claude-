"""
monitor.py  --  one tick of the 24/7 loop, and the alerts and summaries it writes.

A tick (hourly, at hh:02 UTC) does, in order:

  1. fetch and validate data           bad or stale -> no entries, CRITICAL if a position is open
  2. check every protective stop        on the last closed hourly bar; a gap fills at the open
  3. mark to market, update limits      daily loss halt, drawdown kill switch
  4. kill switch on -> cancel buys, sell everything
  5. weekly rebalance, once per Sunday  the strategy rule, sized by risk.py
  6. work open orders                   approval, re-check, fill, log
  7. publish                            dashboard snapshot, events, end-of-day summary

Alert levels: INFO (logged), WARN (a human reads it within a day),
CRITICAL (trading stops for that reason until a human acts).
"""

from __future__ import annotations

import json
import urllib.request
from dataclasses import asdict
from typing import Dict, List, Optional

import pandas as pd

import config as C
import research
import risk
import strategy
from execution import Executor, Order
from portfolio import Portfolio


def send_alert(level: str, msg: str, log) -> None:
    if msg.startswith(level + " "):
        msg = msg[len(level) + 1:]
    log("alert", level=level, message=msg)
    print(f"[{level}] {msg}", flush=True)
    if C.ALERT_WEBHOOK and level in ("WARN", "CRITICAL"):
        try:
            body = json.dumps({"text": f"desk247 {level}: {msg}", "content": f"desk247 {level}: {msg}"})
            req = urllib.request.Request(C.ALERT_WEBHOOK, body.encode(), {"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=10).read()
        except Exception as e:                  # an alert failure must not stop the loop
            log("error", where="webhook", error=str(e))


def _level(a: str) -> str:
    return a.split(" ", 1)[0] if a.split(" ", 1)[0] in ("INFO", "WARN", "CRITICAL") else "WARN"


def tick(now: pd.Timestamp, p: Portfolio, ex: Executor, log, data=None,
         data_error: Optional[str] = None) -> Dict:
    """Run one cycle. `data` is research.fetch() output; tests pass synthetic frames."""
    alerts: List[str] = []
    reads: Dict[str, research.Read] = {}
    prices: Dict[str, float] = {}
    volumes: Dict[str, float] = {}
    data_ok = data is not None and data_error is None

    if data_ok:
        try:
            for coin, d in data.items():
                reads[coin] = research.read_coin(coin, d["daily"], d["hourly"])
                prices[coin] = float(d["hourly"]["close"].iloc[-1])
                volumes[coin] = float(d["hourly"]["volume"].iloc[-1])
        except Exception as e:
            data_ok, data_error = False, f"research failed: {e}"
    if not data_ok:
        held = ", ".join(p.positions) or "none"
        lvl = "CRITICAL" if p.positions else "WARN"
        alerts.append(f"{lvl} data unavailable ({data_error}); no entries; positions held: {held}"
                      + ("; stops are NOT being checked" if p.positions else ""))
        for a in alerts:
            send_alert(_level(a), a, log)
        return {"ok": False, "alerts": alerts, "equity": None, "prices": {}, "reads": {}}

    # 2. protective stops on the last closed hourly bar
    for coin, h in list(p.positions.items()):
        bar = data[coin]["hourly"].iloc[-1]
        fill = risk.stop_fill(h.stop, float(bar["open"]), float(bar["low"]))
        if fill is not None:
            t = data[coin]["hourly"].index[-1]
            o = Order(id=f"stop-{coin}-{t:%Y%m%dT%H}", coin=coin, side="sell", qty=h.qty, ref_price=fill,
                      reason="stop", created_at=str(now))
            if ex.submit(o):
                gap = " (gapped through the stop)" if fill < h.stop else ""
                alerts.append(f"WARN stop hit {coin}: stop {h.stop:,.2f}, fill ref {fill:,.2f}{gap}")
            prices[coin] = fill                 # this tick's exit is priced at the stop fill

    # 3. limits
    eq = p.equity(prices)
    prev_day = p.day
    alerts += risk.update_limits(p, eq, now.strftime("%Y-%m-%d"))

    # 4. kill switch
    if p.kill:
        ex.cancel_open("kill switch", side="buy")
        for coin, h in p.positions.items():
            ex.submit(Order(id=f"kill-{coin}-{now:%Y%m%d}", coin=coin, side="sell", qty=h.qty,
                            ref_price=prices[coin], reason="kill", created_at=str(now)))

    # 5. weekly rebalance
    spikes = {c for c, r in reads.items() if r.derived["vol_spike"]}
    gate = risk.gate_for(p, data_ok=True, vol_spikes=spikes)
    rb = strategy.last_rebalance_bar(now)
    if p.last_rebalance != str(rb) and not p.kill:
        late_h = (now - (rb + pd.Timedelta(days=1))).total_seconds() / 3600
        if late_h > C.ORDER_TTL_HOURS and p.last_rebalance:
            alerts.append(f"WARN rebalance for {rb.date()} is {late_h:.0f}h late (system was down)")
        mom = {c: strategy.momentum(data[c]["daily"]["close"], rb) for c in data}
        w = strategy.target_weights(mom)
        log("decision", rebalance=str(rb.date()), momentum=mom, weights=w)
        for coin, wt in w.items():
            held = p.qty(coin)
            if wt > 0 and held == 0:
                atr = float(research.atr(data[coin]["daily"].loc[:rb]).iloc[-1])
                try:
                    qty, stop = risk.size_position(wt, eq, prices[coin], atr)
                except risk.SizingError as e:
                    alerts.append(f"WARN sizing refused for {coin}: {e}")
                    continue
                if qty * prices[coin] >= C.MIN_ORDER_USD:
                    ex.submit(Order(id=f"rb{rb:%Y%m%d}-{coin}-buy", coin=coin, side="buy", qty=qty,
                                    ref_price=prices[coin], reason="rebalance", created_at=str(now),
                                    stop=stop))
            elif wt == 0 and held > 0:
                ex.submit(Order(id=f"rb{rb:%Y%m%d}-{coin}-sell", coin=coin, side="sell", qty=held,
                                ref_price=prices[coin], reason="rebalance", created_at=str(now)))
        p.last_rebalance = str(rb)

    # 6. orders
    if any(o.status == "pending_approval" for o in ex.ledger.open_orders()):
        alerts.append("INFO entries waiting for approval: python3 desk247/run.py approve")
    alerts += ex.process(p, prices, volumes, gate, now)

    eq = p.equity(prices)
    for a in alerts:
        send_alert(_level(a), a, log)
    return {"ok": True, "alerts": alerts, "equity": eq, "prices": prices, "reads": reads,
            "day_rolled": bool(prev_day) and prev_day != p.day, "prev_day": prev_day, "gate": gate}


def summary(day: str, p: Portfolio, events: List[dict], equity: float, prices: Dict[str, float]) -> str:
    """End-of-day report for one UTC date, from the event log."""
    ev = [e for e in events if str(e.get("ts", "")).startswith(day) or str(e.get("utc", "")).startswith(day)]
    fills = [e for e in ev if e.get("kind") == "fill"]
    alerts = [e for e in ev if e.get("kind") == "alert"]
    errors = [e for e in ev if e.get("kind") == "error"]
    lines = [f"# desk247 end of day {day} (UTC)", "",
             f"- equity {equity:,.2f} (start {C.START_EQUITY:,.2f}, peak {p.peak_equity:,.2f}, "
             f"drawdown {equity / p.peak_equity - 1:.1%})",
             f"- cash {p.cash:,.2f}; kill switch {'ON: ' + p.kill_reason if p.kill else 'off'}; "
             f"daily halt {'on' if p.daily_halt else 'off'}",
             f"- fills {len(fills)}, alerts {len(alerts)}, errors {len(errors)}", "", "## Positions"]
    if not p.positions:
        lines.append("- none (cash)")
    for c, h in p.positions.items():
        px = prices.get(c, h.entry)
        lines.append(f"- {c}: {h.qty:.6f} @ {h.entry:,.2f}, last {px:,.2f}, stop {h.stop:,.2f}, "
                     f"P&L {(px - h.entry) * h.qty:+,.2f}")
    if fills:
        lines += ["", "## Fills"] + [f"- {f['side']} {f['qty']:.6f} {f['coin']} @ {f['price']:,.2f} ({f['id']})"
                                     for f in fills]
    if alerts:
        lines += ["", "## Alerts"] + [f"- {a.get('level')}: {a.get('message')}" for a in alerts]
    lines += ["", "## Human checklist", "- [ ] Every alert above understood",
              "- [ ] Positions and stops match what the rule says",
              "- [ ] No order stuck in pending_approval or partially_filled"]
    return "\n".join(lines) + "\n"
