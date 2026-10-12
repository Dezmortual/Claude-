"""
QA for desk247: the failure modes that lose money in a real system.
Synthetic data only, no network.  Run:  python3 -m unittest discover -s desk247/tests -v
"""

from __future__ import annotations

import math
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

import config as C                                     # noqa: E402
import monitor                                         # noqa: E402
import research                                        # noqa: E402
import risk                                            # noqa: E402
import strategy                                        # noqa: E402
from execution import Executor, Ledger, Order, PaperBroker   # noqa: E402
from portfolio import Holding, Portfolio               # noqa: E402

NOW = pd.Timestamp("2026-10-12 05:02", tz="UTC")       # a Monday, after the Sunday bar closed


def daily(drift: float, end: str = "2026-10-11", n: int = 400, start_px: float = 50_000.0) -> pd.DataFrame:
    idx = pd.date_range(end=pd.Timestamp(end, tz="UTC"), periods=n, freq="D")
    rng = np.random.default_rng(7)
    close = start_px * np.exp(np.cumsum(drift + rng.normal(0, 0.02, n)))
    op = np.r_[close[0], close[:-1]]
    hi = np.maximum(op, close) * 1.01
    lo = np.minimum(op, close) * 0.99
    return pd.DataFrame({"open": op, "high": hi, "low": lo, "close": close, "volume": 1e5}, index=idx)


def hourly(last: float, end_open: pd.Timestamp = NOW.floor("h") - pd.Timedelta(hours=1), n: int = 48,
           volume: float = 1e6) -> pd.DataFrame:
    idx = pd.date_range(end=end_open, periods=n, freq="h")
    c = np.full(n, last)
    return pd.DataFrame({"open": c, "high": c * 1.002, "low": c * 0.998, "close": c, "volume": volume},
                        index=idx)


def market(btc_drift=0.004, eth_drift=0.004, **hkw):
    out = {}
    for coin, px, dr in (("BTC", 50_000.0, btc_drift), ("ETH", 3_000.0, eth_drift)):
        d = daily(dr, start_px=px)
        out[coin] = {"daily": d, "hourly": hourly(float(d["close"].iloc[-1]), **hkw)}
    return out


class Rig:
    def __init__(self, approval="auto", broker=None):
        self.tmp = Path(tempfile.mkdtemp())
        self.events = []
        self.p = Portfolio()
        self.ex = Executor(Ledger(self.tmp / "orders.json"), broker or PaperBroker(),
                           log=lambda kind, **kw: self.events.append({"kind": kind, **kw}),
                           approval_mode=approval, sleep=lambda s: None)

    def tick(self, now=NOW, data=None, err=None):
        return monitor.tick(now, self.p, self.ex, self.ex.log, data=data, data_error=err)

    def kinds(self, k):
        return [e for e in self.events if e["kind"] == k]


class StalePrices(unittest.TestCase):
    def test_stale_hourly_feed_is_rejected(self):
        h = hourly(50_000.0, end_open=NOW - pd.Timedelta(hours=5))
        with self.assertRaises(research.BadData):
            research.validate_bars(h, "BTC hourly", now=NOW, max_age_s=C.STALE_HOURLY_SECONDS)

    def test_fresh_feed_passes(self):
        research.validate_bars(hourly(50_000.0), "BTC hourly", now=NOW, max_age_s=C.STALE_HOURLY_SECONDS)

    def test_no_entries_and_critical_alert_when_data_is_down_with_a_position(self):
        r = Rig()
        r.p.positions["BTC"] = Holding(qty=0.1, entry=50_000, stop=45_000, opened_at="")
        res = r.tick(data=None, err="BTC hourly: stale")
        self.assertFalse(res["ok"])
        self.assertEqual(r.ex.ledger.orders, {})
        self.assertTrue(any(a.startswith("CRITICAL") and "stops are NOT" in a for a in res["alerts"]))


class DuplicateOrders(unittest.TestCase):
    def test_same_id_is_refused(self):
        r = Rig()
        o = dict(id="rb20261011-BTC-buy", coin="BTC", side="buy", qty=0.01, ref_price=1, reason="rebalance",
                 created_at=str(NOW))
        self.assertTrue(r.ex.submit(Order(**o)))
        self.assertFalse(r.ex.submit(Order(**o)))
        self.assertEqual(len(r.kinds("order_duplicate")), 1)

    def test_restart_does_not_rebuy_the_same_week(self):
        r = Rig()
        m = market()
        r.tick(data=m)
        n_orders = len(r.ex.ledger.orders)
        r.p.last_rebalance = ""             # simulate a crash before the portfolio was saved
        r.tick(now=NOW + pd.Timedelta(hours=1), data=m)
        buys = [o for o in r.ex.ledger.orders.values() if o.side == "buy"]
        self.assertEqual(len(r.ex.ledger.orders), n_orders)
        self.assertEqual(len(buys), 2)
        self.assertEqual(len(r.kinds("fill")), 2)


class PositionSizing(unittest.TestCase):
    def test_risk_cap_binds(self):
        qty, stop = risk.size_position(0.5, 10_000, 50_000, 1_500)
        self.assertAlmostEqual(stop, 50_000 - 3 * 1_500)
        self.assertAlmostEqual((50_000 - stop) * qty, C.RISK_PER_TRADE * 10_000)
        self.assertLessEqual(qty * 50_000, 0.5 * 10_000 + 1e-9)

    def test_garbage_inputs_raise(self):
        for args in [(0.5, 10_000, float("nan"), 1_000), (0.5, 10_000, 50_000, 0), (0.5, -1, 50_000, 1),
                     (1.5, 10_000, 50_000, 1_000), (0.5, 10_000, 50_000, 20_000)]:
            with self.assertRaises(risk.SizingError):
                risk.size_position(*args)

    def test_check_order_blocks_oversize_leverage_and_shorts(self):
        p = Portfolio()
        px = {"BTC": 50_000.0, "ETH": 3_000.0}
        g = risk.Gate()
        self.assertFalse(risk.check_order("buy", "BTC", 0.2, 50_000, p, px, g)[0])     # $10k = 100%
        self.assertFalse(risk.check_order("sell", "BTC", 0.1, 50_000, p, px, g)[0])    # no shorting
        self.assertFalse(risk.check_order("buy", "BTC", float("inf"), 50_000, p, px, g)[0])
        self.assertTrue(risk.check_order("buy", "BTC", 0.05, 50_000, p, px, g)[0])


class MissedStops(unittest.TestCase):
    def test_gap_fills_at_open_not_at_stop(self):
        self.assertEqual(risk.stop_fill(45_000, bar_open=42_000, bar_low=41_000), 42_000)
        self.assertEqual(risk.stop_fill(45_000, bar_open=46_000, bar_low=44_000), 45_000)
        self.assertIsNone(risk.stop_fill(45_000, bar_open=46_000, bar_low=45_500))

    def test_tick_exits_a_gapped_position_at_the_gap_price(self):
        r = Rig()
        m = market(btc_drift=-0.004, eth_drift=-0.004)       # momentum negative: no new entries
        last = float(m["BTC"]["hourly"]["close"].iloc[-1])
        stop = last * 1.10                                   # price is already 10% under the stop
        r.p.cash -= 0.1 * last
        r.p.positions["BTC"] = Holding(qty=0.1, entry=last * 1.2, stop=stop, opened_at="")
        r.p.last_rebalance = str(strategy.last_rebalance_bar(NOW))
        r.tick(data=m)
        self.assertNotIn("BTC", r.p.positions)
        fill = r.kinds("fill")[0]
        self.assertLess(fill["price"], stop)
        self.assertAlmostEqual(fill["price"], last * (1 - C.SLIPPAGE_BPS / 1e4))


class BadDataFeed(unittest.TestCase):
    def _bad(self, df):
        with self.assertRaises(research.BadData):
            research.validate_bars(df, "x")

    def test_rejections(self):
        h = hourly(50_000.0)
        a = h.copy(); a.iloc[-1, a.columns.get_loc("close")] = np.nan; self._bad(a)
        b = h.copy(); b.iloc[-1, b.columns.get_loc("low")] = -1.0; self._bad(b)
        self._bad(h.iloc[::-1])                                            # out of order
        c = h.copy(); c.iloc[-1, :4] = [50_000, 80_000, 50_000, 80_000]; self._bad(c)   # +60% print
        d = h.copy(); d.iloc[-1, d.columns.get_loc("high")] = 10.0; self._bad(d)        # high < close
        self._bad(h.iloc[0:0])

    def test_research_crash_is_treated_as_bad_data(self):
        r = Rig()
        m = market()
        m["BTC"]["daily"] = m["BTC"]["daily"].iloc[-5:]       # too short for any indicator
        res = r.tick(data=m)
        self.assertFalse(res["ok"])
        self.assertEqual(r.ex.ledger.orders, {})


class Limits(unittest.TestCase):
    def test_kill_switch_flattens_and_blocks(self):
        r = Rig()
        m = market()
        last = float(m["BTC"]["hourly"]["close"].iloc[-1])
        r.p.peak_equity = 20_000.0
        r.p.cash = 10_000.0 - 0.1 * last
        r.p.positions["BTC"] = Holding(qty=0.1, entry=last, stop=last * 0.5, opened_at="")
        r.tick(data=m)
        self.assertTrue(r.p.kill)
        self.assertEqual(r.p.positions, {})
        self.assertFalse([o for o in r.ex.ledger.orders.values() if o.side == "buy"])

    def test_daily_loss_halts_entries_but_not_exits(self):
        p = Portfolio()
        alerts = risk.update_limits(p, 10_000, "2026-10-12")
        self.assertEqual(alerts, [])
        alerts = risk.update_limits(p, 9_400, "2026-10-12")
        self.assertTrue(p.daily_halt and alerts)
        g = risk.gate_for(p, data_ok=True)
        px = {"BTC": 50_000.0}
        self.assertFalse(risk.check_order("buy", "BTC", 0.01, 50_000, p, px, g)[0])
        p.positions["BTC"] = Holding(qty=0.01, entry=50_000, stop=40_000, opened_at="")
        self.assertTrue(risk.check_order("sell", "BTC", 0.01, 50_000, p, px, g)[0])
        risk.update_limits(p, 9_400, "2026-10-13")
        self.assertFalse(p.daily_halt)


class ExecutionFlow(unittest.TestCase):
    def test_rebalance_buys_both_coins_within_limits(self):
        r = Rig()
        m = market()
        r.tick(data=m)
        self.assertEqual(set(r.p.positions), {"BTC", "ETH"})
        px = {c: float(m[c]["hourly"]["close"].iloc[-1]) for c in m}
        eq = r.p.equity(px)
        for c, h in r.p.positions.items():
            self.assertLessEqual(h.qty * px[c], C.MAX_POSITION_PCT * eq + 1)
            self.assertLessEqual((h.entry - h.stop) * h.qty, C.RISK_PER_TRADE * 10_000 * 1.01)
        self.assertGreaterEqual(r.p.cash, 0)

    def test_manual_approval_holds_entries(self):
        r = Rig(approval="manual")
        r.tick(data=market())
        self.assertEqual(r.p.positions, {})
        waiting = [o for o in r.ex.ledger.orders.values() if o.status == "pending_approval"]
        self.assertEqual(len(waiting), 2)
        for o in waiting:
            r.ex.approve(o.id)
        r.tick(now=NOW + pd.Timedelta(hours=1), data=market())
        self.assertEqual(set(r.p.positions), {"BTC", "ETH"})

    def test_unapproved_entry_expires(self):
        r = Rig(approval="manual")
        r.tick(data=market())
        r.tick(now=NOW + pd.Timedelta(hours=C.ORDER_TTL_HOURS + 1), data=market())
        self.assertTrue(all(o.status == "expired" for o in r.ex.ledger.orders.values()))

    def test_partial_fill_completes_over_ticks(self):
        r = Rig()
        m = market(volume=1.0)                 # 1 BTC/hour -> paper fills 0.01 per tick
        r.tick(data=m)
        btc = r.ex.ledger.orders["rb20261011-BTC-buy"]
        self.assertEqual(btc.status, "partially_filled")
        for i in range(1, 6):
            r.tick(now=NOW + pd.Timedelta(hours=i), data=market(volume=1e6))
        self.assertEqual(btc.status, "filled")
        self.assertAlmostEqual(r.p.positions["BTC"].qty, btc.qty)

    def test_broker_outage_retries_then_recovers(self):
        r = Rig(broker=PaperBroker(fail_times=C.BROKER_RETRIES))
        res = r.tick(data=market())
        self.assertTrue(any("broker failed" in a for a in res["alerts"]))
        r.tick(now=NOW + pd.Timedelta(hours=1), data=market())
        self.assertEqual(set(r.p.positions), {"BTC", "ETH"})

    def test_negative_momentum_sells(self):
        r = Rig()
        m = market(btc_drift=-0.004)
        last = float(m["BTC"]["hourly"]["close"].iloc[-1])
        r.p.cash -= 0.02 * last
        r.p.positions["BTC"] = Holding(qty=0.02, entry=last, stop=last * 0.5, opened_at="")
        r.tick(data=m)
        self.assertNotIn("BTC", r.p.positions)
        self.assertIn("ETH", r.p.positions)


class Rule(unittest.TestCase):
    def test_rebalance_bar_and_weights(self):
        self.assertEqual(strategy.last_rebalance_bar(NOW), pd.Timestamp("2026-10-11", tz="UTC"))
        self.assertEqual(strategy.last_rebalance_bar(pd.Timestamp("2026-10-11 23:00", tz="UTC")),
                         pd.Timestamp("2026-10-04", tz="UTC"))
        self.assertEqual(strategy.target_weights({"BTC": 0.1, "ETH": -0.1}), {"BTC": 0.5, "ETH": 0.0})
        self.assertEqual(strategy.target_weights({"BTC": math.nan, "ETH": 0.2}), {"BTC": 0.0, "ETH": 0.5})


if __name__ == "__main__":
    unittest.main()
