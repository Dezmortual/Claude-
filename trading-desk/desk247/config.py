"""
config.py  --  every number the system trades by, in one place.

Frozen 2026-10-12, before desk247/backtest.py was first run. The strategy rule
is the one frozen in trend/run_backtest.py on 2026-10-07. The risk numbers are
new and were picked as round, conventional values, not fitted: the backtest of
the risk overlay is therefore in-sample for those numbers and is reported that
way. Change a number here only with a dated note and a fresh paper period.
"""

from __future__ import annotations

import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
DESK = HERE.parent

# ------------------------------------------------------------------ market
# Spot only, long only, no leverage. Binance public candles price everything;
# the paper broker fills against them.
SYMBOLS = {"BTC": "BTCUSDT", "ETH": "ETHUSDT"}

# ------------------------------------------------------------------ edge
# Crypto time-series momentum (Liu & Tsyvinski). At each Sunday UTC close hold
# each coin whose 28-day return is positive, at 1/N of equity, else cash.
LOOKBACK_DAYS = 28
REBALANCE_WEEKDAY = 6            # Sunday's daily bar (closes Monday 00:00 UTC)

# ------------------------------------------------------------------ risk (hard limits)
START_EQUITY = 10_000.0          # paper USD
RISK_PER_TRADE = 0.02            # loss at the stop may not exceed 2% of equity
STOP_ATR_MULT = 3.0              # protective stop = entry - 3 x ATR(20, daily)
ATR_DAYS = 20
MAX_POSITION_PCT = 0.50          # per coin, of equity
MAX_GROSS_EXPOSURE = 1.00        # sum of positions / equity; no leverage
MAX_DAILY_LOSS = 0.05            # from the UTC day's opening equity -> no new entries today
MAX_DRAWDOWN = 0.25              # from peak equity -> kill switch: flatten, halt, human reset
MAX_ORDERS_PER_DAY = 6
MIN_ORDER_USD = 25.0             # below this a rebalance is noise, skip it

# ------------------------------------------------------------------ data quality
STALE_HOURLY_SECONDS = 2 * 3600  # newest closed hourly bar may be at most this old
MAX_BAR_MOVE = 0.20              # one hourly bar moving more than this is treated as bad data
VOL_SPIKE_MULT = 3.0             # today's true range > 3 x ATR -> no new entries

# ------------------------------------------------------------------ execution
FEE_BPS = 5.0                    # per side, Binance-like taker fee
SLIPPAGE_BPS = 2.0               # per side, assumed
MAX_FILL_FRACTION_OF_VOLUME = 0.01   # paper fills at most 1% of the last hour's volume
ORDER_TTL_HOURS = 6              # an unfilled or unapproved order expires after this
APPROVAL_MODE = os.environ.get("DESK247_APPROVAL", "manual")   # manual | auto
BROKER_RETRIES = 3

# ------------------------------------------------------------------ monitoring
STATE_DIR = Path(os.environ.get("BOT_STATE_DIR", DESK / "state"))
WORK_DIR = STATE_DIR / "desk247"     # portfolio, order ledger, summaries (not polled by the dashboard)
ALERT_WEBHOOK = os.environ.get("DESK247_ALERT_WEBHOOK", "")      # Slack/Discord-compatible, optional
TICK_MINUTE = 2                  # the loop wakes at hh:02 UTC, after the hourly bar closes
