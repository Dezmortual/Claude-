"""
execution.py  --  orders: approved, de-duplicated, risk-checked, filled, logged.

Life of an order

  1. created with a deterministic id: <rebalance or event>-<coin>-<side>-<reason>.
     The same decision always produces the same id, so a restart, a retry or
     a second copy of the loop cannot place it twice: submit() refuses any id
     the ledger has seen, whatever its status.
  2. entries wait in `pending_approval` when APPROVAL_MODE is manual
     (`python3 desk247/run.py approve`). Exits never wait: they reduce risk.
  3. immediately before the broker, risk.check_order() runs again against the
     current account, because prices and limits may have moved since creation.
  4. the broker is called with retries and backoff. A failure leaves the order
     open for the next tick and raises an alert; it is never silently dropped.
  5. a partial fill stays open with its remainder until filled or ORDER_TTL_HOURS
     passes, then expires. An unapproved entry expires the same way: a stale
     instruction is never executed late.

Every state change is appended to the event log with the order's full state.
"""

from __future__ import annotations

import json
import os
import tempfile
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional

import pandas as pd

import config as C
import risk
from portfolio import Holding, Portfolio

OPEN = ("pending_approval", "approved", "partially_filled")


@dataclass
class Order:
    id: str
    coin: str
    side: str                   # buy | sell
    qty: float
    ref_price: float
    reason: str                 # rebalance | stop | kill | manual
    created_at: str
    stop: float = 0.0           # for buys: the protective stop the new holding gets
    status: str = "approved"
    filled_qty: float = 0.0
    avg_price: float = 0.0
    fees: float = 0.0
    note: str = ""

    @property
    def remaining(self) -> float:
        return max(self.qty - self.filled_qty, 0.0)


@dataclass
class Fill:
    qty: float
    price: float
    fee: float


class BrokerError(Exception):
    pass


class PaperBroker:
    """Fills at the reference price plus slippage, capped by recent volume."""

    def __init__(self, fail_times: int = 0):
        self.fail_times = fail_times     # tests use this to simulate an exchange outage

    def place(self, coin: str, side: str, qty: float, price: float, hour_volume: float) -> Fill:
        if self.fail_times > 0:
            self.fail_times -= 1
            raise BrokerError("simulated exchange error")
        cap = C.MAX_FILL_FRACTION_OF_VOLUME * hour_volume
        q = min(qty, cap) if hour_volume > 0 else 0.0
        if q <= 0:
            raise BrokerError("no liquidity in the last hour")
        slip = C.SLIPPAGE_BPS / 1e4
        px = price * (1 + slip if side == "buy" else 1 - slip)
        return Fill(qty=q, price=px, fee=q * px * C.FEE_BPS / 1e4)


class Ledger:
    """All orders ever created, keyed by id. Atomic writes."""

    def __init__(self, path: Optional[Path] = None):
        self.path = path or C.WORK_DIR / "orders.json"
        self.orders: Dict[str, Order] = {}
        if self.path.exists():
            self.orders = {k: Order(**v) for k, v in json.loads(self.path.read_text()).items()}

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=str(self.path.parent), suffix=".tmp")
        with os.fdopen(fd, "w") as f:
            json.dump({k: asdict(v) for k, v in self.orders.items()}, f, indent=1)
        os.replace(tmp, self.path)

    def open_orders(self) -> List[Order]:
        return [o for o in self.orders.values() if o.status in OPEN]


Log = Callable[..., None]


def _noop(kind: str, **kw) -> None:
    pass


class Executor:
    def __init__(self, ledger: Ledger, broker: PaperBroker, log: Log = _noop,
                 approval_mode: str = C.APPROVAL_MODE, sleep: Callable[[float], None] = time.sleep):
        self.ledger, self.broker, self.log = ledger, broker, log
        self.approval_mode, self.sleep = approval_mode, sleep

    # ------------------------------------------------------------ intake
    def submit(self, o: Order) -> bool:
        if o.id in self.ledger.orders:
            self.log("order_duplicate", id=o.id, existing_status=self.ledger.orders[o.id].status)
            return False
        if o.side == "buy" and self.approval_mode == "manual":
            o.status = "pending_approval"
        self.ledger.orders[o.id] = o
        self.ledger.save()
        self.log("order", **asdict(o))
        return True

    def approve(self, order_id: str) -> bool:
        o = self.ledger.orders.get(order_id)
        if not o or o.status != "pending_approval":
            return False
        o.status = "approved"
        self.ledger.save()
        self.log("order", **asdict(o))
        return True

    def cancel_open(self, reason: str, side: Optional[str] = None) -> None:
        for o in self.ledger.open_orders():
            if side is None or o.side == side:
                o.status, o.note = "cancelled", reason
                self.log("order", **asdict(o))
        self.ledger.save()

    # ------------------------------------------------------------ work
    def process(self, p: Portfolio, prices: Dict[str, float], volumes: Dict[str, float],
                gate: risk.Gate, now: pd.Timestamp) -> List[str]:
        alerts = []
        for o in self.ledger.open_orders():
            age_h = (now - pd.Timestamp(o.created_at)).total_seconds() / 3600
            if age_h > C.ORDER_TTL_HOURS:
                o.status, o.note = "expired", f"open {age_h:.1f}h, over the {C.ORDER_TTL_HOURS}h limit"
                self.log("order", **asdict(o))
                continue
            if o.status == "pending_approval":
                continue
            qty = min(o.remaining, p.qty(o.coin)) if o.side == "sell" else o.remaining
            if qty <= 1e-12:
                o.status, o.note = "filled", "nothing left to sell"
                self.log("order", **asdict(o))
                continue
            ok, why = risk.check_order(o.side, o.coin, qty, prices[o.coin], p, prices, gate)
            if not ok:
                if o.side == "buy" and "not enough cash" not in why and "exceed" not in why:
                    o.note = f"held: {why}"          # temporary block (data, halt): retry next tick
                    self.log("order_blocked", id=o.id, reason=why)
                    continue
                o.status, o.note = "rejected", why
                self.log("order", **asdict(o))
                alerts.append(f"WARN order {o.id} rejected by risk: {why}")
                continue
            fill = self._place(o, qty, prices[o.coin], volumes.get(o.coin, 0.0))
            if fill is None:
                alerts.append(f"WARN order {o.id}: broker failed {C.BROKER_RETRIES} times, retrying next tick")
                continue
            self._apply(o, fill, p, now)
        self.ledger.save()
        return alerts

    def _place(self, o: Order, qty: float, price: float, vol: float) -> Optional[Fill]:
        for attempt in range(C.BROKER_RETRIES):
            try:
                return self.broker.place(o.coin, o.side, qty, price, vol)
            except BrokerError as e:
                self.log("error", where="broker", id=o.id, attempt=attempt + 1, error=str(e))
                if attempt + 1 < C.BROKER_RETRIES:
                    self.sleep(2 ** attempt)
        return None

    def _apply(self, o: Order, f: Fill, p: Portfolio, now: pd.Timestamp) -> None:
        if o.side == "buy":
            p.cash -= f.qty * f.price + f.fee
            h = p.positions.get(o.coin)
            if h:
                h.entry = (h.entry * h.qty + f.price * f.qty) / (h.qty + f.qty)
                h.qty += f.qty
                h.stop = max(h.stop, o.stop)
            else:
                p.positions[o.coin] = Holding(qty=f.qty, entry=f.price, stop=o.stop, opened_at=str(now))
        else:
            p.cash += f.qty * f.price - f.fee
            h = p.positions[o.coin]
            h.qty -= f.qty
            if h.qty <= 1e-12:
                del p.positions[o.coin]
        new = o.filled_qty + f.qty
        o.avg_price = (o.avg_price * o.filled_qty + f.price * f.qty) / new
        o.filled_qty, o.fees = new, o.fees + f.fee
        o.status = "filled" if o.remaining <= 1e-12 else "partially_filled"
        p.orders_today += 1
        self.log("fill", id=o.id, coin=o.coin, side=o.side, qty=f.qty, price=f.price, fee=f.fee,
                 status=o.status, cash=p.cash)
