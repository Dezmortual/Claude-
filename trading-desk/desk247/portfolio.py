"""
portfolio.py  --  the paper account, persisted after every change.

One JSON file holds cash, positions with their stops, peak equity, the UTC
day's opening equity, halt flags and the last rebalance acted on. It is
written atomically, so a crash mid-write leaves the previous good copy.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, Optional

import config as C


@dataclass
class Holding:
    qty: float
    entry: float
    stop: float
    opened_at: str


@dataclass
class Portfolio:
    cash: float = C.START_EQUITY
    positions: Dict[str, Holding] = field(default_factory=dict)
    peak_equity: float = C.START_EQUITY
    day: str = ""                       # UTC date the day-open equity belongs to
    day_open_equity: float = C.START_EQUITY
    daily_halt: bool = False            # daily loss limit hit: no entries until next UTC day
    kill: bool = False                  # drawdown kill switch: flat, no trading until a human resets
    kill_reason: str = ""
    last_rebalance: str = ""            # open time of the Sunday bar last acted on
    orders_today: int = 0

    def equity(self, prices: Dict[str, float]) -> float:
        return self.cash + sum(h.qty * prices[c] for c, h in self.positions.items())

    def exposure(self, prices: Dict[str, float]) -> float:
        return sum(abs(h.qty) * prices[c] for c, h in self.positions.items())

    def qty(self, coin: str) -> float:
        h = self.positions.get(coin)
        return h.qty if h else 0.0


def load(path: Optional[Path] = None) -> Portfolio:
    path = path or C.WORK_DIR / "portfolio.json"
    if not path.exists():
        return Portfolio()
    raw = json.loads(path.read_text())
    raw["positions"] = {c: Holding(**h) for c, h in raw.get("positions", {}).items()}
    return Portfolio(**raw)


def save(p: Portfolio, path: Optional[Path] = None) -> None:
    path = path or C.WORK_DIR / "portfolio.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(asdict(p), f, indent=1)
        os.replace(tmp, path)
    except Exception:
        Path(tmp).unlink(missing_ok=True)
        raise
