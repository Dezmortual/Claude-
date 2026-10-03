// Test-plane worker: runs CPU-heavy research jobs off the UI thread.
import { runBacktestStage, robustnessSuite, runHoldout } from "./research.js";
import { runBacktest } from "./runner.js";
import { computeMetrics } from "./metrics.js";

export async function execute(op, payload, progress = () => {}) {
  const { sdl, bars, params, policy } = payload;
  switch (op) {
    case "backtest": return runBacktestStage(sdl, bars, policy, progress);
    case "robustness": return robustnessSuite(sdl, bars, params, policy, progress);
    case "holdout": return runHoldout(sdl, bars, params);
    case "full": { const r = runBacktest(sdl, bars, params, payload.opts || {}); return { ...r, metrics: computeMetrics(r) }; }
  }
  throw new Error("Unknown op " + op);
}

if (typeof self !== "undefined" && typeof window === "undefined" && typeof self.postMessage === "function") {
  self.onmessage = async e => {
    const { id, op, payload } = e.data;
    try {
      const result = await execute(op, payload, msg => self.postMessage({ id, progress: msg }));
      self.postMessage({ id, result });
    } catch (err) { self.postMessage({ id, error: String(err && err.stack || err) }); }
  };
}
