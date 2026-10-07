#!/usr/bin/env python3
"""
worker.py -- one TradingAgents run, inside tradingagents_gate/.venv.

Reads one JSON request on stdin, writes one JSON line on stdout:

  in : {"ticker","date","asset_type","analysts","quick_model","deep_model",
        "debate_rounds","risk_rounds","effort", ...}
  out: {"rating","decision","usage":{model:{input_tokens,output_tokens}},"elapsed_s"}
       or {"error": "..."}

core/ta_decider.py is the only caller. Everything TradingAgents prints goes to
stderr so stdout carries nothing but the answer.

Each run gets a fresh temporary memory log and results directory. TradingAgents
would otherwise inject earlier decisions and their realised returns into the
next run for the same ticker, which makes every answer depend on the order the
backtest asked in.
"""

from __future__ import annotations

import contextlib
import json
import sys
import tempfile
import threading
import time
from pathlib import Path

CACHE = Path(__file__).resolve().parent / "cache" / "ta_data"


def usage_callback():
    from langchain_core.callbacks import BaseCallbackHandler

    class Usage(BaseCallbackHandler):
        """Sums token usage per model across every LLM call in the run."""

        def __init__(self):
            self.by_model = {}
            self._model_of = {}
            self._lock = threading.Lock()

        def on_chat_model_start(self, serialized, messages, *, run_id, **kwargs):
            params = kwargs.get("invocation_params") or {}
            self._model_of[run_id] = params.get("model") or params.get("model_name") or "unknown"

        def on_llm_end(self, response, *, run_id, **kwargs):
            model = self._model_of.pop(run_id, "unknown")
            for gens in response.generations:
                for g in gens:
                    meta = getattr(getattr(g, "message", None), "usage_metadata", None) or {}
                    with self._lock:
                        agg = self.by_model.setdefault(model, {"input_tokens": 0, "output_tokens": 0})
                        agg["input_tokens"] += int(meta.get("input_tokens", 0))
                        agg["output_tokens"] += int(meta.get("output_tokens", 0))

    return Usage()


def run(req: dict) -> dict:
    from tradingagents.default_config import build_default_config
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    tmp = Path(tempfile.mkdtemp(prefix="ta_run_"))
    config = build_default_config()
    config.update({
        "llm_provider": "anthropic",
        "quick_think_llm": req["quick_model"],
        "deep_think_llm": req["deep_model"],
        "max_debate_rounds": int(req.get("debate_rounds", 1)),
        "max_risk_discuss_rounds": int(req.get("risk_rounds", 1)),
        "anthropic_effort": req.get("effort"),
        "checkpoint_enabled": False,
        "memory_log_path": str(tmp / "memory.md"),
        "results_dir": str(tmp / "logs"),
        # Prices are cached per symbol and filtered to the analysis date on read,
        # so sharing this cache across runs leaks nothing forward.
        "data_cache_dir": str(CACHE),
    })
    usage = usage_callback()
    t0 = time.time()
    graph = TradingAgentsGraph(selected_analysts=tuple(req["analysts"]), config=config,
                               callbacks=[usage])
    final_state, rating = graph.propagate(req["ticker"], req["date"],
                                          asset_type=req.get("asset_type", "stock"))
    return {
        "rating": str(rating),
        "decision": str(final_state.get("final_trade_decision") or "")[:8000],
        "usage": usage.by_model,
        "elapsed_s": round(time.time() - t0, 1),
    }


def main() -> None:
    try:
        req = json.loads(sys.stdin.read())
        with contextlib.redirect_stdout(sys.stderr):
            out = run(req)
    except Exception as e:  # report, never hang the caller
        out = {"error": f"{type(e).__name__}: {str(e)[:500]}"}
        print(json.dumps(out))
        sys.exit(1)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
