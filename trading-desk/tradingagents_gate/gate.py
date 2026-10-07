"""
gate.py  --  TradingAgents as a decision layer: the `ta` arm.

TradingAgents (github.com/TauricResearch/TradingAgents) is a multi-agent LLM
framework: market, social and news analysts write reports, a bull and a bear
researcher debate them, a trader proposes, a risk panel argues, and a manager
issues a rating: Buy / Overweight / Hold / Underweight / Sell.

Here it filters the same candidates the rules and gated arms see:

  long candidate    taken only on Buy or Overweight
  short candidate   taken only on Sell or Underweight
  anything else     stand aside (Hold, REVIEW, an unparseable answer)

Three properties keep the arm honest:

  point in time     TradingAgents is run as of the signal bar's date. Its own
                    data layer clamps every price, news and social query to
                    that date (dataflows/date_window.py upstream), and its
                    memory of past lessons is filtered to lessons already
                    resolved by then. The daily bar for that date is complete
                    when the engine fills at its close, so nothing it reads is
                    from after the decision.
  reproducible      every answer is cached by (symbol, date, side, settings).
                    A rerun replays the cache and costs nothing.
  bounded spend     real calls stop at max_calls. Cached answers never count.

One difference from the gated arm: TradingAgents does not read the snapshot.
It does its own research on the ticker and date, and is never told a breakout
fired. So this arm asks "would TradingAgents be bullish (or bearish) here?",
not "is this breakout good?".
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import threading
import time
from pathlib import Path
from typing import Dict, Optional

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / "core"))

from contracts import Action, Decision, Snapshot   # noqa: E402
from decision import Decider                        # noqa: E402

CACHE_DIR = HERE / "cache"
CACHE_FILE = CACHE_DIR / "ta_cache.jsonl"

# Default models. The deep tier runs the research and risk managers (two calls
# per decision); the quick tier runs every analyst, researcher, debater and the
# trader. Override with TRADINGAGENTS_DEEP_THINK_LLM / TRADINGAGENTS_QUICK_THINK_LLM.
DEFAULT_DEEP = "claude-opus-5-5"
DEFAULT_QUICK = "claude-sonnet-5-5"
ANALYSTS = ("market", "social", "news")   # TradingAgents drops fundamentals for crypto

# US$ per million tokens, Anthropic first-party API (checked 2026-10-07).
# Cache writes bill 1.25x input; cache reads have their own rate.
PRICES = {
    "claude-fable-5-1":  {"in": 10.0, "out": 50.0, "cache_read": 0.25},
    "claude-opus-5-5":   {"in": 4.0,  "out": 20.0, "cache_read": 0.20},
    "claude-opus-5":     {"in": 5.0,  "out": 25.0, "cache_read": 0.50},
    "claude-sonnet-5-5": {"in": 2.0,  "out": 10.0, "cache_read": 0.20},
    "claude-sonnet-5":   {"in": 2.0,  "out": 10.0, "cache_read": 0.20},
    "claude-haiku-4-5":  {"in": 1.0,  "out": 5.0,  "cache_read": 0.10},
}
CACHE_WRITE_MULT = 1.25

# Used by --ta-estimate only until a real decision has been measured. These are
# a guess at one TradingAgents run with 3 analysts and one debate and risk
# round: about 25 model calls, most on the quick tier with growing context.
# The first real run replaces them with measured numbers.
ASSUMED = {"quick_in": 300_000, "quick_out": 20_000, "deep_in": 40_000, "deep_out": 6_000}

LONG_OK = {"buy", "overweight"}
SHORT_OK = {"sell", "underweight"}


def load_env() -> None:
    """Read trading-desk/.env into the environment without overriding it."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and v and k not in os.environ:
            os.environ[k] = v


def models() -> Dict[str, str]:
    return {
        "deep": os.environ.get("TRADINGAGENTS_DEEP_THINK_LLM") or DEFAULT_DEEP,
        "quick": os.environ.get("TRADINGAGENTS_QUICK_THINK_LLM") or DEFAULT_QUICK,
    }


def price_of(model: str) -> Optional[dict]:
    # Responses may report a dated or suffixed id; match on the known prefix.
    for k in sorted(PRICES, key=len, reverse=True):
        if model and model.startswith(k):
            return PRICES[k]
    return None


def cost_usd(model: str, inp: int, out: int, cache_read: int, cache_write: int) -> Optional[float]:
    p = price_of(model)
    if p is None:
        return None
    fresh = max(0, inp - cache_read - cache_write)
    return (fresh * p["in"] + cache_write * p["in"] * CACHE_WRITE_MULT
            + cache_read * p["cache_read"] + out * p["out"]) / 1e6


def estimate_per_decision(m: Dict[str, str]) -> float:
    q, d = price_of(m["quick"]), price_of(m["deep"])
    if q is None or d is None:
        return float("nan")
    return (ASSUMED["quick_in"] * q["in"] + ASSUMED["quick_out"] * q["out"]
            + ASSUMED["deep_in"] * d["in"] + ASSUMED["deep_out"] * d["out"]) / 1e6


class Usage:
    """Token and dollar totals per model, fed by a LangChain callback."""

    def __init__(self):
        self.lock = threading.Lock()
        self.by_model: Dict[str, Dict[str, float]] = {}

    def add(self, model: str, inp: int, out: int, cache_read: int, cache_write: int) -> None:
        with self.lock:
            r = self.by_model.setdefault(model or "unknown", {
                "calls": 0, "in": 0, "out": 0, "cache_read": 0, "cache_write": 0})
            r["calls"] += 1
            r["in"] += inp
            r["out"] += out
            r["cache_read"] += cache_read
            r["cache_write"] += cache_write

    def snapshot(self) -> Dict[str, Dict[str, float]]:
        with self.lock:
            return json.loads(json.dumps(self.by_model))

    @staticmethod
    def cost(by_model: Dict[str, Dict[str, float]]) -> Optional[float]:
        total = 0.0
        for model, r in by_model.items():
            c = cost_usd(model, r["in"], r["out"], r["cache_read"], r["cache_write"])
            if c is None:
                return None
            total += c
        return total

    @staticmethod
    def diff(after: dict, before: dict) -> dict:
        out = {}
        for model, r in after.items():
            b = before.get(model, {})
            d = {k: v - b.get(k, 0) for k, v in r.items()}
            if d["calls"]:
                out[model] = d
        return out


def _make_callback(usage: Usage):
    from langchain_core.callbacks import BaseCallbackHandler

    class UsageCallback(BaseCallbackHandler):
        def on_llm_end(self, response, **kwargs):
            for gens in response.generations:
                for g in gens:
                    msg = getattr(g, "message", None)
                    um = getattr(msg, "usage_metadata", None) if msg is not None else None
                    if not um:
                        continue
                    meta = getattr(msg, "response_metadata", {}) or {}
                    model = meta.get("model_name") or meta.get("model") or ""
                    det = um.get("input_token_details") or {}
                    usage.add(model, int(um.get("input_tokens", 0)), int(um.get("output_tokens", 0)),
                              int(det.get("cache_read", 0) or 0), int(det.get("cache_creation", 0) or 0))

    return UsageCallback()


class TADecider(Decider):
    name = "ta"

    def __init__(self, max_calls: int, window_from: Optional[str] = None,
                 log_path: Optional[Path] = None, verbose: bool = True):
        load_env()
        self.max_calls = max_calls
        self.window_from = window_from
        self.log_path = log_path
        self.verbose = verbose
        self.models = models()
        self.settings = {"framework": "tradingagents", "analysts": list(ANALYSTS),
                         "deep": self.models["deep"], "quick": self.models["quick"],
                         "debate_rounds": 1, "risk_rounds": 1}
        self.sig = hashlib.sha256(json.dumps(self.settings, sort_keys=True).encode()).hexdigest()[:12]
        self.cache = self._load_cache()
        self.usage = Usage()
        self._graph = None
        self.calls = 0             # real TradingAgents runs this session
        self.cached_hits = 0
        self.skipped_budget = 0    # candidates left undecided because the budget ran out
        self.before_window = 0
        self.ratings: Dict[str, int] = {}
        self.spent: list = []      # per-call cost records

    # ------------------------------------------------------------ cache

    def _load_cache(self) -> Dict[str, dict]:
        out = {}
        if CACHE_FILE.exists():
            for line in CACHE_FILE.read_text().splitlines():
                try:
                    rec = json.loads(line)
                    out[rec["key"]] = rec
                except (ValueError, KeyError):
                    continue
        return out

    def _save(self, rec: dict) -> None:
        CACHE_DIR.mkdir(exist_ok=True)
        with CACHE_FILE.open("a") as f:
            f.write(json.dumps(rec) + "\n")
        self.cache[rec["key"]] = rec

    def key(self, symbol: str, date: str, side: str) -> str:
        return hashlib.sha256(f"{symbol}|{date}|{side}|{self.sig}".encode()).hexdigest()[:24]

    def measured(self) -> list:
        """Cost records of every real run cached under these settings."""
        return [r for r in self.cache.values() if r.get("sig") == self.sig and r.get("cost") is not None]

    # ------------------------------------------------------------ graph

    def _graph_or_die(self):
        if self._graph is not None:
            return self._graph
        if not os.environ.get("ANTHROPIC_API_KEY"):
            sys.exit("ta arm: ANTHROPIC_API_KEY is not set. Add it to trading-desk/.env "
                     "(echo \"ANTHROPIC_API_KEY=sk-ant-...\" >> .env).")
        try:
            from tradingagents.default_config import DEFAULT_CONFIG
            from tradingagents.graph.trading_graph import TradingAgentsGraph
        except ImportError:
            sys.exit("ta arm: TradingAgents is not installed. Run: bash tradingagents_gate/setup.sh")
        cfg = DEFAULT_CONFIG.copy()
        cfg.update({
            "llm_provider": "anthropic",
            "deep_think_llm": self.models["deep"],
            "quick_think_llm": self.models["quick"],
            "max_debate_rounds": 1,
            "max_risk_discuss_rounds": 1,
            # Keep this experiment's files and memory apart from any other use
            # of TradingAgents on this machine, and per settings, so lessons
            # learned under one model mix never leak into another's run.
            "results_dir": str(CACHE_DIR / self.sig / "logs"),
            "data_cache_dir": str(CACHE_DIR / self.sig / "data"),
            "memory_log_path": str(CACHE_DIR / self.sig / "memory.md"),
        })
        self._graph = TradingAgentsGraph(selected_analysts=list(ANALYSTS), debug=False,
                                         config=cfg, callbacks=[_make_callback(self.usage)])
        return self._graph

    # ------------------------------------------------------------ decide

    def decide(self, snap: Snapshot) -> Decision:
        side = "long" if snap.proposed == Action.ENTER_LONG else "short"
        date = snap.timestamp.strftime("%Y-%m-%d")
        if self.window_from and date < self.window_from:
            self.before_window += 1
            return Decision(action=Action.WAIT, source="ta", note="before_window")

        k = self.key(snap.symbol, date, side)
        rec = self.cache.get(k)
        if rec is not None:
            self.cached_hits += 1
        elif self.calls >= self.max_calls:
            self.skipped_budget += 1
            return Decision(action=Action.WAIT, source="ta", note="budget")
        else:
            rec = self._run(snap.symbol, date, side, k)

        rating = str(rec.get("rating", "")).strip()
        self.ratings[rating or "none"] = self.ratings.get(rating or "none", 0) + 1
        ok = rating.lower() in (LONG_OK if side == "long" else SHORT_OK)
        return Decision(action=snap.proposed if ok else Action.WAIT,
                        source="ta", note="ta:" + (rating or "none"))

    def _run(self, symbol: str, date: str, side: str, k: str) -> dict:
        graph = self._graph_or_die()
        before = self.usage.snapshot()
        t0 = time.time()
        if self.verbose:
            print("  [ta] %s %s %s: running TradingAgents..." % (symbol, date, side), flush=True)
        state, rating = graph.propagate(symbol, date, asset_type="crypto")
        self.calls += 1
        used = Usage.diff(self.usage.snapshot(), before)
        cost = Usage.cost(used)
        rec = {"key": k, "sig": self.sig, "symbol": symbol, "date": date, "side": side,
               "rating": str(rating), "usage": used, "cost": cost,
               "seconds": round(time.time() - t0, 1)}
        self._save(rec)
        self.spent.append(rec)
        if self.log_path is not None:
            decision_text = ""
            if isinstance(state, dict):
                decision_text = str(state.get("final_trade_decision", ""))[:4000]
            with Path(self.log_path).open("a") as f:
                f.write(json.dumps({**rec, "decision": decision_text}) + "\n")
        if self.verbose:
            print("  [ta] %s %s: %s  %s  %.0fs" % (
                symbol, date, rating, "cost unknown" if cost is None else "$%.3f" % cost,
                rec["seconds"]), flush=True)
        return rec

    # ------------------------------------------------------------ report

    def stats(self) -> Dict:
        session = Usage.cost(self.usage.snapshot())
        return {
            "settings": self.settings, "settings_id": self.sig,
            "real_calls": self.calls, "cached": self.cached_hits,
            "undecided_budget": self.skipped_budget, "before_window": self.before_window,
            "ratings": self.ratings, "session_usage": self.usage.snapshot(),
            "session_cost_usd": session,
        }

    def complete(self) -> bool:
        return self.skipped_budget == 0
