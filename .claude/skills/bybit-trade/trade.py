#!/usr/bin/env python3
"""Direct Bybit v5 execution for USDT linear perps. TESTNET BY DEFAULT.

  place      market IOC entry with native stopLoss / takeProfit
  close      flatten a position with a reduceOnly market order
  positions  list open USDT positions
  sync       record risk-guard closes for trades the exchange already
             closed (SL/TP hit)

Safety, hard-coded:
  - Keys come from BYBIT_API_KEY / BYBIT_API_SECRET only, never argv.
  - Mainnet needs BOTH --live and BYBIT_ENV=live.
  - `risk-guard check` runs as a subprocess before every entry; any
    non-zero exit aborts.
  - Aborts if qty x stop distance (plus fees) exceeds --risk-usd by >10%,
    so the risk passed to risk-guard can't be understated.
  - Idempotent orderLinkId clive-{symbol}-{unix_ms}.
  - Refuses to stack onto an existing position.
  - Qty and prices are rounded to the instrument's qtyStep / tickSize.
  - Bybit errors are printed verbatim. No retries on order endpoints.
"""
import argparse
import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal
from urllib.parse import urlencode

import requests

TESTNET = "https://api-testnet.bybit.com"
MAINNET = "https://api.bybit.com"
RECV_WINDOW = "5000"
TIMEOUT = 10
TAKER_FEE = Decimal("0.00055")
RISK_TOLERANCE = Decimal("1.10")
GUARD = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "risk-guard", "guard.py")


class BybitError(Exception):
    pass


class Client:
    def __init__(self, base, key, secret):
        self.base, self.key, self.secret = base, key, secret

    def _headers(self, payload):
        ts = str(int(time.time() * 1000))
        sign = hmac.new(self.secret.encode(), (ts + self.key + RECV_WINDOW + payload).encode(), hashlib.sha256).hexdigest()
        return {
            "X-BAPI-API-KEY": self.key,
            "X-BAPI-TIMESTAMP": ts,
            "X-BAPI-RECV-WINDOW": RECV_WINDOW,
            "X-BAPI-SIGN": sign,
            "Content-Type": "application/json",
        }

    @staticmethod
    def _unwrap(r, path):
        try:
            data = r.json()
        except ValueError:
            raise BybitError(f"{path} HTTP {r.status_code}: {r.text[:500]}")
        if data.get("retCode") != 0:
            raise BybitError(f"{path} {json.dumps(data)}")
        return data

    def public(self, path, params):
        return self._unwrap(requests.get(self.base + path, params=params, timeout=TIMEOUT), path)["result"]

    def get(self, path, params):
        qs = urlencode(params)
        r = requests.get(f"{self.base}{path}?{qs}", headers=self._headers(qs), timeout=TIMEOUT)
        return self._unwrap(r, path)["result"]

    def post(self, path, body):
        raw = json.dumps(body, separators=(",", ":"))
        r = requests.post(self.base + path, data=raw, headers=self._headers(raw), timeout=TIMEOUT)
        return self._unwrap(r, path)

    def signed_preview(self, body):
        raw = json.dumps(body, separators=(",", ":"))
        h = self._headers(raw)
        h["X-BAPI-API-KEY"] = mask(h["X-BAPI-API-KEY"])
        h["X-BAPI-SIGN"] = h["X-BAPI-SIGN"][:12] + "..."
        return raw, h


def mask(s):
    return s[:4] + "..." if len(s) > 8 else "***"


def fmt(d):
    return format(d.normalize(), "f")


def to_step(value, step, rounding):
    return (value / step).quantize(Decimal(1), rounding=rounding) * step


def die(msg, code=1):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(code)


def resolve_base(live_flag):
    env_live = os.environ.get("BYBIT_ENV", "").lower() == "live"
    if live_flag and not env_live:
        die("--live given but BYBIT_ENV is not 'live'; refusing mainnet")
    if env_live and not live_flag:
        print("note: BYBIT_ENV=live but --live not given; using TESTNET", file=sys.stderr)
    base = MAINNET if (live_flag and env_live) else TESTNET
    print(f"[{'MAINNET — REAL MONEY' if base == MAINNET else 'testnet'}] {base}", file=sys.stderr)
    return base


def client(base, allow_placeholder=False):
    key, secret = os.environ.get("BYBIT_API_KEY"), os.environ.get("BYBIT_API_SECRET")
    if not key or not secret:
        if allow_placeholder:
            print("note: no BYBIT_API_KEY/SECRET in env; dry-run signs with a placeholder", file=sys.stderr)
            return Client(base, "DRYRUN_PLACEHOLDER", "DRYRUN_PLACEHOLDER"), False
        die("BYBIT_API_KEY and BYBIT_API_SECRET must be set in the environment")
    return Client(base, key, secret), True


def guard(*args):
    return subprocess.run([sys.executable, GUARD, *args], capture_output=True, text=True, env=os.environ.copy())


def link_id(symbol):
    return f"clive-{symbol}-{int(time.time() * 1000)}"[:36]


def instrument(c, symbol):
    lst = c.public("/v5/market/instruments-info", {"category": "linear", "symbol": symbol})["list"]
    if not lst:
        die(f"unknown linear symbol {symbol}")
    i = lst[0]
    if i.get("status") != "Trading":
        die(f"{symbol} status is {i.get('status')}, not Trading")
    return {
        "tick": Decimal(i["priceFilter"]["tickSize"]),
        "step": Decimal(i["lotSizeFilter"]["qtyStep"]),
        "min_qty": Decimal(i["lotSizeFilter"]["minOrderQty"]),
        "max_qty": Decimal(i["lotSizeFilter"].get("maxMktOrderQty") or i["lotSizeFilter"]["maxOrderQty"]),
    }


def last_price(c, symbol):
    return Decimal(c.public("/v5/market/tickers", {"category": "linear", "symbol": symbol})["list"][0]["lastPrice"])


def positions(c, symbol=None):
    params = {"category": "linear", "symbol": symbol} if symbol else {"category": "linear", "settleCoin": "USDT"}
    return [p for p in c.get("/v5/position/list", params)["list"] if Decimal(p.get("size") or "0") > 0]


def cmd_place(a):
    symbol, side = a.symbol.upper(), a.side.capitalize()
    risk_usd = Decimal(a.risk_usd)
    if side not in ("Buy", "Sell"):
        die("--side must be buy or sell")
    if risk_usd <= 0 or Decimal(a.qty) <= 0:
        die("--qty and --risk-usd must be positive")

    base = resolve_base(a.live)
    c, real_keys = client(base, allow_placeholder=a.dry_run)

    g = guard("check", "--risk-usd", str(risk_usd))
    if g.returncode != 0:
        sys.stderr.write(g.stderr)
        die(f"risk-guard vetoed (exit {g.returncode}); order not sent", 2)
    print(g.stdout.strip())

    try:
        inst = instrument(c, symbol)
        last = last_price(c, symbol)
    except (BybitError, requests.RequestException) as e:
        die(str(e))

    qty = to_step(Decimal(a.qty), inst["step"], ROUND_FLOOR)
    if qty < inst["min_qty"]:
        die(f"qty {fmt(qty)} below minOrderQty {fmt(inst['min_qty'])}")
    if qty > inst["max_qty"]:
        die(f"qty {fmt(qty)} above max market qty {fmt(inst['max_qty'])}")
    rnd = ROUND_FLOOR if side == "Buy" else ROUND_CEILING  # stop away from, TP toward entry
    sl = to_step(Decimal(a.sl), inst["tick"], rnd)
    tp = to_step(Decimal(a.tp), inst["tick"], rnd)
    if side == "Buy" and not (sl < last < tp):
        die(f"buy needs sl < last < tp; got sl={fmt(sl)} last={fmt(last)} tp={fmt(tp)}")
    if side == "Sell" and not (tp < last < sl):
        die(f"sell needs tp < last < sl; got tp={fmt(tp)} last={fmt(last)} sl={fmt(sl)}")

    est_risk = qty * abs(last - sl) + qty * (last + sl) * TAKER_FEE
    print(f"{symbol} {side} {fmt(qty)} @ ~{fmt(last)}  sl {fmt(sl)}  tp {fmt(tp)}  est. risk {est_risk:.2f}")
    if est_risk > risk_usd * RISK_TOLERANCE:
        die(f"qty x stop distance at last price risks {est_risk:.2f}, more than declared --risk-usd "
            f"{risk_usd} (+10%); re-plan with scalp-plan", 2)

    if real_keys:
        try:
            existing = positions(c, symbol)
        except (BybitError, requests.RequestException) as e:
            die(str(e))
        if existing:
            p = existing[0]
            die(f"position already open on {symbol}: {p['side']} {p['size']} @ {p['avgPrice']}; refusing to stack")
    else:
        print("note: position check skipped (no keys)", file=sys.stderr)

    oid = link_id(symbol)
    body = {
        "category": "linear", "symbol": symbol, "side": side, "orderType": "Market",
        "qty": fmt(qty), "timeInForce": "IOC", "positionIdx": 0, "orderLinkId": oid,
        "stopLoss": fmt(sl), "takeProfit": fmt(tp), "tpslMode": "Full",
        "slTriggerBy": "LastPrice", "tpTriggerBy": "LastPrice",
    }

    if a.dry_run:
        raw, headers = c.signed_preview(body)
        print(json.dumps({"dry_run": True, "POST": base + "/v5/order/create", "headers": headers, "body": json.loads(raw)}, indent=2))
        return 0

    try:
        resp = c.post("/v5/order/create", body)
    except (BybitError, requests.RequestException) as e:
        die(f"order rejected: {e}")
    print(json.dumps(resp))

    fill = None
    for _ in range(10):
        try:
            orders = c.get("/v5/order/realtime", {"category": "linear", "orderLinkId": oid})["list"]
        except (BybitError, requests.RequestException) as e:
            print(f"warn: fill lookup: {e}", file=sys.stderr)
            orders = []
        if orders and orders[0].get("orderStatus") in ("Filled", "PartiallyFilledCanceled", "Cancelled", "Rejected"):
            fill = orders[0]
            break
        time.sleep(0.5)
    if not fill:
        die(f"could not confirm fill for {oid}; check `positions` and record with risk-guard open manually")
    filled = Decimal(fill.get("cumExecQty") or "0")
    if filled <= 0:
        die(f"order {oid} ended {fill.get('orderStatus')} with no fill; nothing recorded")
    entry = Decimal(fill.get("avgPrice") or last)
    print(f"filled {fmt(filled)} @ {fmt(entry)} ({fill['orderStatus']})")

    g = guard("open", "--order-link-id", oid, "--symbol", symbol, "--side", side.lower(),
              "--qty", fmt(filled), "--entry", fmt(entry), "--sl", fmt(sl), "--tp", fmt(tp),
              "--risk-usd", str(risk_usd))
    if g.returncode != 0:
        sys.stderr.write(g.stderr)
        die(f"POSITION IS OPEN but risk-guard open failed; record {oid} manually")
    print(g.stdout.strip())
    return 0


def guard_open_trades():
    g = guard("status", "--json")
    if g.returncode != 0:
        return []
    return json.loads(g.stdout)["open_trades"]


def closed_pnl(c, symbol, since_ms, order_id=None):
    rows = c.get("/v5/position/closed-pnl", {"category": "linear", "symbol": symbol, "limit": 50})["list"]
    rows = [r for r in rows if int(r["createdTime"]) >= since_ms]
    if order_id:
        rows = [r for r in rows if r.get("orderId") == order_id]
    return rows


def record_close(c, symbol, since_ms, order_id=None, attempts=10):
    rows = []
    for _ in range(attempts):
        try:
            rows = closed_pnl(c, symbol, since_ms, order_id)
        except (BybitError, requests.RequestException) as e:
            print(f"warn: closed-pnl lookup: {e}", file=sys.stderr)
        if rows:
            break
        time.sleep(1)
    if not rows:
        return None
    pnl = sum(Decimal(r["closedPnl"]) for r in rows)
    exit_px = Decimal(max(rows, key=lambda r: int(r["createdTime"]))["avgExitPrice"])
    return pnl, exit_px


def iso_ms(iso):
    from datetime import datetime
    return int(datetime.fromisoformat(iso).timestamp() * 1000)


def cmd_close(a):
    symbol = a.symbol.upper()
    base = resolve_base(a.live)
    c, _ = client(base)
    try:
        pos = positions(c, symbol)
    except (BybitError, requests.RequestException) as e:
        die(str(e))
    if not pos:
        die(f"no open position on {symbol}")
    p = pos[0]
    body = {
        "category": "linear", "symbol": symbol, "side": "Sell" if p["side"] == "Buy" else "Buy",
        "orderType": "Market", "qty": p["size"], "timeInForce": "IOC", "reduceOnly": True,
        "positionIdx": 0, "orderLinkId": link_id(symbol),
    }
    if a.dry_run:
        raw, headers = c.signed_preview(body)
        print(json.dumps({"dry_run": True, "POST": base + "/v5/order/create", "headers": headers, "body": json.loads(raw)}, indent=2))
        return 0

    started = int(time.time() * 1000) - 5000
    try:
        resp = c.post("/v5/order/create", body)
    except (BybitError, requests.RequestException) as e:
        die(f"close rejected: {e}")
    print(json.dumps(resp))

    res = record_close(c, symbol, started, resp["result"].get("orderId"))
    trades = [t for t in guard_open_trades() if t["symbol"] == symbol]
    if not res:
        die(f"position closed but closed-pnl not available yet; run `trade.py sync` shortly")
    pnl, exit_px = res
    print(f"closed {symbol} @ {fmt(exit_px)} realized {pnl:+.4f}")
    if not trades:
        print(f"warn: no risk-guard open trade for {symbol}; nothing to record", file=sys.stderr)
        return 0
    g = guard("close", "--order-link-id", trades[0]["order_link_id"], "--exit", fmt(exit_px), f"--realized-pnl={pnl}")
    sys.stdout.write(g.stdout)
    sys.stderr.write(g.stderr)
    return g.returncode


def cmd_sync(a):
    base = resolve_base(a.live)
    c, _ = client(base)
    trades = guard_open_trades()
    if not trades:
        print("no open trades in risk-guard")
        return 0
    try:
        live_syms = {p["symbol"] for p in positions(c)}
    except (BybitError, requests.RequestException) as e:
        die(str(e))
    rc = 0
    for t in trades:
        if t["symbol"] in live_syms:
            print(f"{t['order_link_id']}: still open on exchange")
            continue
        res = record_close(c, t["symbol"], iso_ms(t["opened_at"]) - 5000, attempts=1)
        if not res:
            print(f"{t['order_link_id']}: no position and no closed-pnl found; check manually", file=sys.stderr)
            rc = 1
            continue
        pnl, exit_px = res
        g = guard("close", "--order-link-id", t["order_link_id"], "--exit", fmt(exit_px), f"--realized-pnl={pnl}")
        sys.stdout.write(g.stdout)
        sys.stderr.write(g.stderr)
        rc = rc or g.returncode
    return rc


def cmd_positions(a):
    base = resolve_base(a.live)
    c, _ = client(base)
    try:
        pos = positions(c)
    except (BybitError, requests.RequestException) as e:
        die(str(e))
    if a.json:
        print(json.dumps(pos, indent=2))
        return 0
    if not pos:
        print("no open positions")
    for p in pos:
        print(f"{p['symbol']:<14} {p['side']:<4} {p['size']:>12} @ {p['avgPrice']:<12} mark {p.get('markPrice')}  "
              f"uPnL {p.get('unrealisedPnl')}  sl {p.get('stopLoss') or '-'}  tp {p.get('takeProfit') or '-'}  lev {p.get('leverage')}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("place")
    p.add_argument("--symbol", required=True)
    p.add_argument("--side", required=True, choices=["buy", "sell"])
    p.add_argument("--qty", required=True)
    p.add_argument("--sl", required=True)
    p.add_argument("--tp", required=True)
    p.add_argument("--risk-usd", required=True)
    p.add_argument("--dry-run", action="store_true", help="sign the request but never POST")
    p.add_argument("--live", action="store_true", help="mainnet; also requires BYBIT_ENV=live")

    p = sub.add_parser("close")
    p.add_argument("--symbol", required=True)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--live", action="store_true")

    p = sub.add_parser("positions")
    p.add_argument("--json", action="store_true")
    p.add_argument("--live", action="store_true")

    p = sub.add_parser("sync")
    p.add_argument("--live", action="store_true")

    a = ap.parse_args()
    return {"place": cmd_place, "close": cmd_close, "positions": cmd_positions, "sync": cmd_sync}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
