"""
risk.py  --  hard limits, enforced in code. No model output can override them.

Every order passes check_order() immediately before it reaches the broker, and
the account passes update_limits() on every tick. The numbers live in config.py.

  per trade     the loss if the stop is hit is at most RISK_PER_TRADE of equity
  per position  at most MAX_POSITION_PCT of equity in one coin
  exposure      positions sum to at most MAX_GROSS_EXPOSURE of equity (no leverage)
  daily loss    equity down MAX_DAILY_LOSS from the UTC day's open -> no entries until tomorrow
  drawdown      equity down MAX_DRAWDOWN from its peak -> kill switch: flatten and stop
  bad data      no entries; exits still run (they reduce risk)
  volatility    a day's range over VOL_SPIKE_MULT x ATR -> no entries in that coin today
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple

import config as C
from portfolio import Portfolio


class SizingError(ValueError):
    pass


def size_position(weight: float, equity: float, price: float, atr: float) -> Tuple[float, float]:
    """Quantity and stop for a target weight, after the per-trade and per-position caps."""
    for name, v in (("weight", weight), ("equity", equity), ("price", price), ("atr", atr)):
        if not isinstance(v, (int, float)) or not math.isfinite(v):
            raise SizingError(f"{name} is not a finite number: {v!r}")
    if weight < 0 or weight > 1:
        raise SizingError(f"weight {weight} outside [0, 1]")
    if equity <= 0 or price <= 0 or atr <= 0:
        raise SizingError(f"equity, price and atr must be positive ({equity}, {price}, {atr})")
    stop = price - C.STOP_ATR_MULT * atr
    if stop <= 0:
        raise SizingError(f"stop {stop:.2f} is not above zero: ATR too large for price")
    if weight == 0:
        return 0.0, stop
    by_weight = min(weight, C.MAX_POSITION_PCT) * equity / price
    by_risk = C.RISK_PER_TRADE * equity / (price - stop)
    return min(by_weight, by_risk), stop


@dataclass
class Gate:
    """Why entries are blocked this tick. Empty means entries are allowed."""
    reasons: List[str] = field(default_factory=list)
    coin_blocks: Dict[str, str] = field(default_factory=dict)

    def entries_ok(self, coin: str) -> Tuple[bool, str]:
        if self.reasons:
            return False, "; ".join(self.reasons)
        if coin in self.coin_blocks:
            return False, self.coin_blocks[coin]
        return True, ""


def gate_for(p: Portfolio, data_ok: bool, data_reason: str = "",
             vol_spikes: Optional[Set[str]] = None) -> Gate:
    g = Gate()
    if p.kill:
        g.reasons.append(f"kill switch on ({p.kill_reason})")
    if p.daily_halt:
        g.reasons.append("daily loss limit hit")
    if not data_ok:
        g.reasons.append(f"bad data: {data_reason}")
    if p.orders_today >= C.MAX_ORDERS_PER_DAY:
        g.reasons.append("max orders per day reached")
    for c in vol_spikes or ():
        g.coin_blocks[c] = "volatility spike: range over 3x ATR"
    return g


def check_order(side: str, coin: str, qty: float, price: float, p: Portfolio,
                prices: Dict[str, float], gate: Gate) -> Tuple[bool, str]:
    """Last check before the broker. Returns (allowed, reason)."""
    if side not in ("buy", "sell"):
        return False, f"unknown side {side!r}"
    if not (isinstance(qty, (int, float)) and math.isfinite(qty) and qty > 0):
        return False, f"quantity {qty!r} is not a positive number"
    if not (math.isfinite(price) and price > 0):
        return False, f"price {price!r} is not a positive number"
    if side == "sell":
        if qty > p.qty(coin) * (1 + 1e-9):
            return False, f"sell {qty} exceeds holding {p.qty(coin)}: no shorting"
        return True, "exit or reduction: always allowed"
    ok, why = gate.entries_ok(coin)
    if not ok:
        return False, why
    eq = p.equity(prices)
    notional = qty * price
    if p.qty(coin) * price + notional > C.MAX_POSITION_PCT * eq * 1.001:
        return False, f"position would exceed {C.MAX_POSITION_PCT:.0%} of equity"
    if p.exposure(prices) + notional > C.MAX_GROSS_EXPOSURE * eq * 1.001:
        return False, f"gross exposure would exceed {C.MAX_GROSS_EXPOSURE:.0%} of equity"
    if notional * (1 + (C.FEE_BPS + C.SLIPPAGE_BPS) / 1e4) > p.cash:
        return False, "not enough cash: no leverage"
    return True, "within limits"


def update_limits(p: Portfolio, equity: float, utc_date: str) -> List[str]:
    """Roll the day, track the peak, trip the daily halt or the kill switch. Returns alerts."""
    alerts = []
    if p.day != utc_date:
        p.day, p.day_open_equity, p.daily_halt, p.orders_today = utc_date, equity, False, 0
    p.peak_equity = max(p.peak_equity, equity)
    if not p.daily_halt and equity <= p.day_open_equity * (1 - C.MAX_DAILY_LOSS):
        p.daily_halt = True
        alerts.append(f"WARN daily loss limit: equity {equity:,.2f} is "
                      f"{equity / p.day_open_equity - 1:.1%} on the day; no entries until 00:00 UTC")
    dd = equity / p.peak_equity - 1
    if not p.kill and dd <= -C.MAX_DRAWDOWN:
        p.kill = True
        p.kill_reason = f"drawdown {dd:.1%} from peak {p.peak_equity:,.2f}"
        alerts.append(f"CRITICAL kill switch: {p.kill_reason}; flattening, human reset required")
    return alerts


def stop_fill(stop: float, bar_open: float, bar_low: float) -> Optional[float]:
    """Where a stop fills on a bar, before slippage. A gap through the stop fills at the open."""
    if bar_low > stop:
        return None
    return min(stop, bar_open)
