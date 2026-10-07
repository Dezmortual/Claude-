"""
ta_decider.py
=============
TradingAgents (TauricResearch/TradingAgents) on Anthropic models as a decision
layer: the strategy still proposes every entry, and a full TradingAgents run
(analysts, bull/bear debate, trader, risk team, portfolio manager) on that
ticker and date answers "take it or stand aside".

TradingAgents needs Python >= 3.11 and pandas 3, so it lives in its own venv
(tradingagents_gate/.venv, built by tradingagents_gate/setup.sh). This module
only speaks to it through tradingagents_gate/worker.py over a subprocess: one
JSON request on stdin, one JSON answer on stdout.

How a rating becomes a decision
  TradingAgents returns one of Buy / Overweight / Hold / Underweight / Sell, or
  REVIEW when its output had no readable rating. A long candidate is taken on
  the bullish ratings, a short on the bearish ones, everything else waits. The
  model never flips the side and never sizes the trade.

What it may see
  The analysis date is the signal bar's date for a strategy that decides on a
  daily close, and the day BEFORE for an intraday strategy, because
  TradingAgents reads the whole daily bar of its analysis date and an intraday
  entry happens before that bar closes.

  The run is a pure function of (ticker, analysis date, models, analysts,
  rounds). Each call gets a fresh, empty TradingAgents memory log, so one
  decision cannot learn from another's outcome. That is what makes caching and
  concurrent prefetch legitimate, and what keeps the A/B readable.

Every answer is cached to cache/ta_cache.jsonl keyed on that request. A re-run
costs nothing and returns identical decisions; without the cache an LLM arm is
not reproducible from one run to the next.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import threading
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional

import pandas as pd

from contracts import Action, Decision, ENTRIES, Snapshot
from decision import Decider

ROOT = Path(__file__).resolve().parent.parent
GATE_DIR = ROOT / "tradingagents_gate"
WORKER = GATE_DIR / "worker.py"
VENV_PY = GATE_DIR / ".venv" / "bin" / "python"
DEFAULT_CACHE = Path(__file__).parent / "cache" / "ta_cache.jsonl"

# The TradingAgents commit setup.sh installs. Part of the cache key, so an
# upgrade never silently reuses answers from different code.
TA_PIN = "1394a3f72aa4393e1a98f51b382434c4b4c2d972"

QUICK_MODEL = "claude-sonnet-5-5"   # analysts, researchers, debaters, trader
DEEP_MODEL = "claude-opus-5-5"      # research manager, portfolio manager

# $ per million tokens (input, output), Anthropic first-party list prices.
PRICES = {
    "claude-fable-5-1": (10.0, 50.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-haiku-4-5": (1.0, 5.0),
}

RATINGS = ("Buy", "Overweight", "Hold", "Underweight", "Sell")
# Signed, so a side-adjusted score can be read for ranking power afterwards.
RATING_SCORE = {"Buy": 2, "Overweight": 1, "Hold": 0, "Underweight": -1, "Sell": -2}

# TradingAgents caches five years of Yahoo prices back from today, and its
# analysts read indicators over a lookback inside that. Older dates get a
# truncated or empty price history, so they are not asked at all.
MAX_AGE_DAYS = 4 * 365


def is_crypto(symbol: str) -> bool:
    return symbol.upper().endswith(("-USD", "-USDT", "-EUR"))


def analysis_date(ts: pd.Timestamp, intraday: bool) -> str:
    d = ts.date()
    if intraday:
        # TradingAgents keeps rows <= the analysis date, so the previous calendar
        # day leaves it the last COMPLETED session, weekends included.
        d = d - timedelta(days=1)
    return d.isoformat()


def cost_usd(usage: Dict[str, Dict[str, int]]) -> float:
    total = 0.0
    for model, u in (usage or {}).items():
        pin, pout = PRICES.get(model, (0.0, 0.0))
        total += u.get("input_tokens", 0) / 1e6 * pin + u.get("output_tokens", 0) / 1e6 * pout
    return total


class TradingAgentsDecider(Decider):
    name = "ta"

    def __init__(
        self,
        intraday: bool = False,
        quick_model: str = QUICK_MODEL,
        deep_model: str = DEEP_MODEL,
        analysts: Optional[List[str]] = None,      # None: market, social, news (+ fundamentals for stocks)
        debate_rounds: int = 1,
        risk_rounds: int = 1,
        effort: Optional[str] = None,              # anthropic effort; None = model default
        approve_long: Iterable[str] = ("Buy", "Overweight"),
        approve_short: Iterable[str] = ("Sell", "Underweight"),
        offline: bool = False,
        max_calls: int = 25,
        timeout: float = 1800.0,
        python: Optional[str] = None,
        cache_path: Path = DEFAULT_CACHE,
        log_path: Optional[Path] = None,
    ):
        self.intraday = intraday
        self.quick_model = quick_model
        self.deep_model = deep_model
        self.analysts = list(analysts) if analysts else None
        self.debate_rounds = debate_rounds
        self.risk_rounds = risk_rounds
        self.effort = effort
        self.approve_long = set(approve_long)
        self.approve_short = set(approve_short)
        self.offline = offline
        self.max_calls = max_calls
        self.timeout = timeout
        self.python = python or os.environ.get("TA_PYTHON") or str(VENV_PY)
        self.cache_path = Path(cache_path)
        self.log_path = Path(log_path) if log_path else None
        if self.log_path:
            self.log_path.parent.mkdir(parents=True, exist_ok=True)
            self.log_path.write_text("")

        self.cache: Dict[str, Dict] = {}
        self._lock = threading.Lock()
        self.calls = 0
        self.cache_hits = 0
        self.errors = 0
        self.not_asked = 0
        self.ratings: Dict[str, int] = {}
        self.usage: Dict[str, Dict[str, int]] = {}
        self.seconds: List[float] = []
        self._load_cache()

    # -- requests and cache ------------------------------------------

    def request_for(self, snap: Snapshot) -> Dict:
        crypto = is_crypto(snap.symbol)
        analysts = self.analysts or (["market", "social", "news"] if crypto
                                     else ["market", "social", "news", "fundamentals"])
        if crypto:
            # TradingAgents has no fundamentals for a coin; the CLI drops it too.
            analysts = [a for a in analysts if a != "fundamentals"]
        return {
            "ticker": snap.symbol,
            "date": analysis_date(snap.timestamp, self.intraday),
            "asset_type": "crypto" if crypto else "stock",
            "analysts": analysts,
            "quick_model": self.quick_model,
            "deep_model": self.deep_model,
            "debate_rounds": self.debate_rounds,
            "risk_rounds": self.risk_rounds,
            "effort": self.effort,
            "ta_pin": TA_PIN,
        }

    @staticmethod
    def key(req: Dict) -> str:
        return hashlib.sha256(json.dumps(req, sort_keys=True).encode()).hexdigest()[:32]

    def _load_cache(self) -> None:
        if not self.cache_path.exists():
            return
        with open(self.cache_path) as f:
            for line in f:
                try:
                    rec = json.loads(line)
                    self.cache[rec["key"]] = rec["response"]
                except (json.JSONDecodeError, KeyError):
                    continue

    def _save(self, key: str, req: Dict, resp: Dict) -> None:
        with self._lock:
            self.cache[key] = resp
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.cache_path, "a") as f:
                f.write(json.dumps({"key": key, "request": req, "response": resp}) + "\n")

    @staticmethod
    def too_old(req: Dict) -> bool:
        return date.fromisoformat(req["date"]) < date.today() - timedelta(days=MAX_AGE_DAYS)

    # -- transport ---------------------------------------------------

    def _run_worker(self, req: Dict) -> Optional[Dict]:
        """One TradingAgents run. Failures are counted and return None; they are
        never cached, so a re-run retries them."""
        if not Path(self.python).exists():
            raise RuntimeError(
                f"TradingAgents venv not found at {self.python}. "
                "Run tradingagents_gate/setup.sh first, or set TA_PYTHON.")
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY is not set (put it in trading-desk/.env), "
                               "or pass --ta-offline to run from cache only.")
        t0 = time.time()
        try:
            proc = subprocess.run(
                [self.python, "-I", str(WORKER)], input=json.dumps(req),
                capture_output=True, text=True, timeout=self.timeout,
                cwd=str(GATE_DIR),
            )
        except subprocess.TimeoutExpired:
            with self._lock:
                self.errors += 1
            print(f"[ta] {req['ticker']} {req['date']}: timed out after {self.timeout:.0f}s")
            return None
        lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
        try:
            resp = json.loads(lines[-1]) if lines else None
        except json.JSONDecodeError:
            resp = None
        if proc.returncode != 0 or not isinstance(resp, dict) or "error" in resp:
            with self._lock:
                self.errors += 1
            why = (resp or {}).get("error") if isinstance(resp, dict) else None
            tail = (why or proc.stderr.strip()[-400:] or "no output")
            print(f"[ta] {req['ticker']} {req['date']}: failed: {tail}")
            return None
        with self._lock:
            self.calls += 1
            self.seconds.append(time.time() - t0)
            for model, u in (resp.get("usage") or {}).items():
                agg = self.usage.setdefault(model, {"input_tokens": 0, "output_tokens": 0})
                agg["input_tokens"] += u.get("input_tokens", 0)
                agg["output_tokens"] += u.get("output_tokens", 0)
        return resp

    def _answer(self, req: Dict) -> Optional[Dict]:
        k = self.key(req)
        if k in self.cache:
            return self.cache[k]
        if self.offline:
            return None
        with self._lock:
            if self.calls + self.errors >= self.max_calls:
                raise RuntimeError(
                    f"--ta-max-calls ({self.max_calls}) reached mid-run. Nothing past "
                    "this point was asked; raise the cap or narrow the window.")
        resp = self._run_worker(req)
        if resp is not None:
            self._save(k, req, resp)
        return resp

    # -- planning ----------------------------------------------------

    def plan(self, snapshots: Iterable[Snapshot]) -> Dict:
        """Unique requests behind these candidates, split into cached and not."""
        seen: Dict[str, Dict] = {}
        old = 0
        for s in snapshots:
            req = self.request_for(s)
            if self.too_old(req):
                old += 1
                continue
            seen.setdefault(self.key(req), req)
        new = [r for k, r in seen.items() if k not in self.cache]
        return {"unique": len(seen), "new": new, "cached": len(seen) - len(new), "too_old": old}

    def prefetch(self, snapshots: Iterable[Snapshot], workers: int = 2) -> None:
        """
        Run every uncached request up front, concurrently. Legitimate because a
        request depends only on (ticker, date, settings) and every run gets its
        own empty memory log: no answer can change another's input.
        """
        from concurrent.futures import ThreadPoolExecutor

        new = self.plan(snapshots)["new"]
        if not new or self.offline:
            return
        if len(new) > self.max_calls:
            raise RuntimeError(f"{len(new)} new TradingAgents runs exceeds --ta-max-calls "
                               f"({self.max_calls}).")
        print(f"[ta] prefetch: {len(new)} runs on {workers} workers")
        done = 0
        with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
            for _ in ex.map(self._answer, new):
                done += 1
                if done % 5 == 0 or done == len(new):
                    print(f"[ta] {done}/{len(new)} done, {self.errors} failed, "
                          f"${cost_usd(self.usage):.2f} so far")

    # -- decide ------------------------------------------------------

    def decide(self, snap: Snapshot) -> Decision:
        if snap.proposed not in ENTRIES:
            return Decision(action=snap.proposed, source="ta", note="not_asked")
        req = self.request_for(snap)
        if self.too_old(req):
            # The runner keeps candidates inside the window; reaching here is a bug.
            raise RuntimeError(f"{snap.symbol} {req['date']} is older than TradingAgents' "
                               "price window. Trade a later window (--trade-from).")
        cached = self.key(req) in self.cache
        resp = self._answer(req)
        if resp is None:
            self.not_asked += 1
            note = "not_cached" if self.offline else "no_answer"
            dec = Decision(action=Action.WAIT, confidence=0.0, source="ta", note=note)
            self._log(snap, req, None, dec)
            return dec
        if cached:
            self.cache_hits += 1

        rating = str(resp.get("rating") or "REVIEW")
        self.ratings[rating] = self.ratings.get(rating, 0) + 1
        side = 1 if snap.proposed == Action.ENTER_LONG else -1
        approve = self.approve_long if side == 1 else self.approve_short
        action = snap.proposed if rating in approve else Action.WAIT
        aux = {"ta_score": float(side * RATING_SCORE[rating])} if rating in RATING_SCORE else {}
        dec = Decision(action=action, probabilities={action.value: 1.0}, confidence=1.0,
                       source="ta", cached=cached, note=f"rating:{rating}", aux=aux)
        self._log(snap, req, resp, dec)
        return dec

    def _log(self, snap: Snapshot, req: Dict, resp: Optional[Dict], dec: Decision) -> None:
        if not self.log_path:
            return
        rec = {
            "timestamp": snap.timestamp.isoformat(),
            "symbol": snap.symbol,
            "price": snap.price,
            "proposed": snap.proposed.value,
            "analysis_date": req["date"],
            "rating": (resp or {}).get("rating"),
            "action": dec.action.value,
            "taken": dec.action in ENTRIES,
            "note": dec.note,
            "cached": dec.cached,
            "decision_text": (resp or {}).get("decision", "")[:2000],
        }
        with open(self.log_path, "a") as f:
            f.write(json.dumps(rec) + "\n")

    def stats(self) -> Dict:
        sec = sorted(self.seconds)
        return {
            "runs": self.calls,
            "cache_hits": self.cache_hits,
            "errors": self.errors,
            "not_answered": self.not_asked,
            "ratings": dict(sorted(self.ratings.items(), key=lambda kv: -kv[1])),
            "usage": self.usage,
            "cost_usd_this_run": round(cost_usd(self.usage), 2),
            "seconds_p50": round(sec[len(sec) // 2], 1) if sec else 0.0,
        }


# ------------------------------------------------------------ runner glue

def add_ta_args(p) -> None:
    g = p.add_argument_group("tradingagents (ta arm)")
    g.add_argument("--trade-from", default=None,
                   help="first date ANY arm may trade. With the ta arm it defaults to "
                        "--split, so all arms see the same candidates")
    g.add_argument("--ta-quick-model", default=QUICK_MODEL)
    g.add_argument("--ta-deep-model", default=DEEP_MODEL)
    g.add_argument("--ta-analysts", nargs="+", default=None,
                   choices=["market", "social", "news", "fundamentals"])
    g.add_argument("--ta-debate-rounds", type=int, default=1)
    g.add_argument("--ta-effort", default=None, choices=["low", "medium", "high", "xhigh", "max"])
    g.add_argument("--ta-approve", default="lean", choices=["lean", "strong"],
                   help="lean: Buy/Overweight approve longs, Sell/Underweight shorts. "
                        "strong: only Buy / only Sell")
    g.add_argument("--ta-max-calls", type=int, default=25,
                   help="abort before running up a bill. Each run is many LLM calls")
    g.add_argument("--ta-workers", type=int, default=2)
    g.add_argument("--ta-offline", action="store_true", help="cached decisions only")
    g.add_argument("--ta-estimate", action="store_true",
                   help="print how many runs the ta arm needs, then stop")


def build_ta_decider(args, intraday: bool, log_path: Path) -> TradingAgentsDecider:
    strong = args.ta_approve == "strong"
    return TradingAgentsDecider(
        intraday=intraday,
        quick_model=args.ta_quick_model, deep_model=args.ta_deep_model,
        analysts=args.ta_analysts, debate_rounds=args.ta_debate_rounds,
        risk_rounds=args.ta_debate_rounds, effort=args.ta_effort,
        approve_long=("Buy",) if strong else ("Buy", "Overweight"),
        approve_short=("Sell",) if strong else ("Sell", "Underweight"),
        offline=args.ta_offline, max_calls=args.ta_max_calls, log_path=log_path,
    )


def candidate_snapshots(plans: Dict[str, pd.DataFrame], strat) -> List[Snapshot]:
    snaps = []
    for sym, plan in plans.items():
        for ts, row in plan[plan["signal"] != ""].iterrows():
            snaps.append(strat.snapshot(sym, ts, row))
    return snaps


def restrict_window(plans: Dict[str, pd.DataFrame], trade_from: Optional[str]) -> None:
    """Blank every signal before `trade_from`, for every arm alike. Indicators keep
    their warm-up; only the candidates are removed."""
    if not trade_from:
        return
    for sym, plan in plans.items():
        cut = pd.Timestamp(trade_from)
        cut = cut.tz_localize(plan.index.tz) if plan.index.tz is not None else cut
        plan.loc[plan.index < cut, "signal"] = ""


def prepare_ta(decider: TradingAgentsDecider, plans, strat, args) -> bool:
    """Print the bill before spending it. Returns False when the arm must not run."""
    snaps = candidate_snapshots(plans, strat)
    p = decider.plan(snaps)
    print(f"[ta] {len(snaps)} candidates -> {p['unique']} unique (ticker, date) runs: "
          f"{p['cached']} cached, {len(p['new'])} new")
    if p["too_old"]:
        print(f"[ta] {p['too_old']} candidates are older than TradingAgents' price window. "
              "Move --trade-from later.")
        return False
    if args.ta_estimate:
        print("[ta] each new run is roughly 15 to 40 Claude calls; measure the real cost "
              "with one run (--ta-max-calls 1) before a batch")
        return False
    if args.ta_offline:
        return True
    if len(p["new"]) > args.ta_max_calls:
        print(f"[ta] {len(p['new'])} new runs exceeds --ta-max-calls ({args.ta_max_calls}). "
              "Narrow --trade-from or raise the cap.")
        return False
    if args.ta_workers > 0 and p["new"]:
        decider.prefetch(snaps, workers=args.ta_workers)
    return True


CONTAMINATION_NOTE = (
    "  - the ta arm reads Claude, which was trained on market history. On any date\n"
    "    before the model's training cutoff it may simply remember what happened next.\n"
    "    A ta result on past dates is an upper bound, not evidence; only dates after\n"
    "    the cutoff (paper trading) can show real judgement."
)
