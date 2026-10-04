// Ready-made strategy definitions for one-tap testing. MACD-CCI and R08 reproduce the user's own Pine scripts.
// R08 is hand-made: its signal uses bar-by-bar state (var / :=) that the automatic converter cannot follow.
export const EXAMPLES = [
 {
  "id": "ema",
  "label": "EMA trend (example)",
  "sdl": {
   "schemaVersion": "1.0.0",
   "strategy": {
    "name": "Example EMA trend with ATR stop",
    "family": "trend_following",
    "thesis": "Price trends persist after a fast/slow EMA cross on 4h bars.",
    "directions": [
     "long",
     "short"
    ]
   },
   "market": {
    "assetClass": "crypto",
    "symbols": [
     "BINANCE:BTCUSDT"
    ],
    "timeframe": "240",
    "timezone": "Etc/UTC",
    "session": "0000-2359:1234567",
    "chartType": "standard_ohlc"
   },
   "indicators": [
    {
     "id": "fast",
     "type": "ema",
     "source": "close",
     "length": {
      "parameter": "fast_length"
     }
    },
    {
     "id": "slow",
     "type": "ema",
     "source": "close",
     "length": {
      "parameter": "slow_length"
     }
    },
    {
     "id": "atr14",
     "type": "atr",
     "length": 14
    }
   ],
   "signals": {
    "longEntry": "crosses_above(fast, slow)",
    "shortEntry": "crosses_below(fast, slow)",
    "longExit": "",
    "shortExit": ""
   },
   "execution": {
    "entryOrder": "market_next_bar",
    "pyramiding": 0,
    "allowReversal": false,
    "processOnClose": false,
    "calcOnEveryTick": false
   },
   "risk": {
    "sizingModel": "percent_of_equity",
    "sizePercent": 10,
    "leverage": 1,
    "stopLoss": {
     "type": "atr_multiple",
     "valueParameter": "stop_atr",
     "atrIndicator": "atr14"
    },
    "takeProfit": {
     "type": "risk_multiple",
     "valueParameter": "target_r"
    },
    "oneStopOneTarget": true
   },
   "costs": {
    "commissionType": "percent",
    "commissionValue": 0.06,
    "slippageTicks": 2,
    "tickSize": 0.01
   },
   "parameters": [
    {
     "key": "fast_length",
     "type": "int",
     "default": 20,
     "min": 10,
     "max": 40,
     "step": 5,
     "rationale": "Responsive trend estimate"
    },
    {
     "key": "slow_length",
     "type": "int",
     "default": 100,
     "min": 60,
     "max": 160,
     "step": 20,
     "rationale": "Slow regime trend"
    },
    {
     "key": "stop_atr",
     "type": "float",
     "default": 2,
     "min": 1,
     "max": 3,
     "step": 0.5,
     "rationale": "Stop beyond typical bar noise"
    },
    {
     "key": "target_r",
     "type": "float",
     "default": 2,
     "min": 1,
     "max": 3,
     "step": 0.5,
     "rationale": "Target as a multiple of initial risk"
    }
   ],
   "segments": {
    "warmupBars": 300,
    "selectionMode": "rolling_walk_forward",
    "embargoBars": 10
   },
   "falsification": [
    "Validation-segment net profit is non-positive.",
    "Neighbouring parameters collapse.",
    "Doubling costs removes the edge."
   ]
  }
 },
 {
  "id": "rsi",
  "label": "RSI pullback",
  "sdl": {
   "schemaVersion": "1.0.0",
   "strategy": {
    "name": "RSI pullback in uptrend",
    "family": "mean_reversion",
    "thesis": "In an uptrend (close above the 200 SMA), RSI crossing back above 30 marks the end of a pullback.",
    "directions": [
     "long"
    ]
   },
   "market": {
    "assetClass": "crypto",
    "symbols": [
     "BINANCE:BTCUSDT"
    ],
    "timeframe": "240",
    "timezone": "Etc/UTC",
    "session": "0000-2359:1234567",
    "chartType": "standard_ohlc"
   },
   "indicators": [
    {
     "id": "rsi14",
     "type": "rsi",
     "source": "close",
     "length": {
      "parameter": "rsi_len"
     }
    },
    {
     "id": "sma200",
     "type": "sma",
     "source": "close",
     "length": 200
    },
    {
     "id": "atr14",
     "type": "atr",
     "length": 14
    }
   ],
   "signals": {
    "longEntry": "crosses_above(rsi14, oversold) AND close > sma200",
    "shortEntry": "",
    "longExit": "rsi14 > 70",
    "shortExit": ""
   },
   "execution": {
    "entryOrder": "market_next_bar",
    "pyramiding": 0,
    "allowReversal": false,
    "processOnClose": false,
    "calcOnEveryTick": false
   },
   "risk": {
    "sizingModel": "percent_of_equity",
    "sizePercent": 10,
    "leverage": 1,
    "stopLoss": {
     "type": "atr_multiple",
     "valueParameter": "stop_atr",
     "atrIndicator": "atr14"
    },
    "takeProfit": {
     "type": "none"
    },
    "oneStopOneTarget": true
   },
   "costs": {
    "commissionType": "percent",
    "commissionValue": 0.06,
    "slippageTicks": 2,
    "tickSize": 0.01
   },
   "parameters": [
    {
     "key": "rsi_len",
     "type": "int",
     "default": 14,
     "min": 8,
     "max": 20,
     "step": 2,
     "rationale": "RSI lookback"
    },
    {
     "key": "oversold",
     "type": "int",
     "default": 30,
     "min": 20,
     "max": 40,
     "step": 5,
     "rationale": "Oversold threshold"
    },
    {
     "key": "stop_atr",
     "type": "float",
     "default": 2,
     "min": 1,
     "max": 3,
     "step": 0.5,
     "rationale": "Stop beyond noise"
    }
   ],
   "segments": {
    "warmupBars": 300,
    "selectionMode": "rolling_walk_forward",
    "embargoBars": 10
   },
   "falsification": [
    "Validation-segment net profit is non-positive.",
    "Neighbouring parameters collapse.",
    "Doubling costs removes the edge."
   ]
  }
 },
 {
  "id": "donchian",
  "label": "Donchian breakout",
  "sdl": {
   "schemaVersion": "1.0.0",
   "strategy": {
    "name": "Donchian 20-bar breakout",
    "family": "breakout",
    "thesis": "A close above the prior 20-bar high (or below the low) starts a trend leg.",
    "directions": [
     "long",
     "short"
    ]
   },
   "market": {
    "assetClass": "crypto",
    "symbols": [
     "BINANCE:BTCUSDT"
    ],
    "timeframe": "240",
    "timezone": "Etc/UTC",
    "session": "0000-2359:1234567",
    "chartType": "standard_ohlc"
   },
   "indicators": [
    {
     "id": "hh",
     "type": "highest",
     "source": "high",
     "length": {
      "parameter": "channel"
     }
    },
    {
     "id": "ll",
     "type": "lowest",
     "source": "low",
     "length": {
      "parameter": "channel"
     }
    },
    {
     "id": "atr14",
     "type": "atr",
     "length": 14
    }
   ],
   "signals": {
    "longEntry": "close > hh[1]",
    "shortEntry": "close < ll[1]",
    "longExit": "",
    "shortExit": ""
   },
   "execution": {
    "entryOrder": "market_next_bar",
    "pyramiding": 0,
    "allowReversal": false,
    "processOnClose": false,
    "calcOnEveryTick": false
   },
   "risk": {
    "sizingModel": "percent_of_equity",
    "sizePercent": 10,
    "leverage": 1,
    "stopLoss": {
     "type": "atr_multiple",
     "valueParameter": "stop_atr",
     "atrIndicator": "atr14"
    },
    "takeProfit": {
     "type": "risk_multiple",
     "valueParameter": "target_r"
    },
    "oneStopOneTarget": true
   },
   "costs": {
    "commissionType": "percent",
    "commissionValue": 0.06,
    "slippageTicks": 2,
    "tickSize": 0.01
   },
   "parameters": [
    {
     "key": "channel",
     "type": "int",
     "default": 20,
     "min": 10,
     "max": 55,
     "step": 5,
     "rationale": "Breakout lookback"
    },
    {
     "key": "stop_atr",
     "type": "float",
     "default": 2,
     "min": 1,
     "max": 3,
     "step": 0.5,
     "rationale": "Stop beyond noise"
    },
    {
     "key": "target_r",
     "type": "float",
     "default": 2,
     "min": 1,
     "max": 4,
     "step": 0.5,
     "rationale": "Reward to risk"
    }
   ],
   "segments": {
    "warmupBars": 300,
    "selectionMode": "rolling_walk_forward",
    "embargoBars": 10
   },
   "falsification": [
    "Validation-segment net profit is non-positive.",
    "Neighbouring parameters collapse.",
    "Doubling costs removes the edge."
   ]
  }
 },
 {
  "id": "macd_cci",
  "label": "MACD-CCI ctrl (your script)",
  "sdl": {
   "schemaVersion": "1.0.0",
   "strategy": {
    "name": "MACD-CCI ctrl",
    "family": "momentum",
    "thesis": "A MACD signal-line cross confirmed by CCI on the same side of zero starts a momentum swing; a tight ATR trail locks in profit.",
    "directions": [
     "long",
     "short"
    ]
   },
   "market": {
    "assetClass": "crypto",
    "symbols": [
     "BINANCE:BTCUSDT"
    ],
    "timeframe": "240",
    "timezone": "Etc/UTC",
    "session": "0000-2359:1234567",
    "chartType": "standard_ohlc"
   },
   "indicators": [
    {
     "id": "macdline",
     "type": "macd",
     "source": "close",
     "fast": 12,
     "slow": 26
    },
    {
     "id": "signalline",
     "type": "macd_signal",
     "source": "close",
     "fast": 12,
     "slow": 26,
     "signal": 9
    },
    {
     "id": "close_mean",
     "type": "sma",
     "source": "close",
     "length": 20
    },
    {
     "id": "atr",
     "type": "atr",
     "length": 14
    }
   ],
   "signals": {
    "longEntry": "crosses_above(macdline, signalline) AND close > close_mean",
    "shortEntry": "crosses_below(macdline, signalline) AND close < close_mean",
    "longExit": "",
    "shortExit": ""
   },
   "execution": {
    "entryOrder": "market_next_bar",
    "pyramiding": 0,
    "allowReversal": true,
    "processOnClose": true,
    "calcOnEveryTick": false
   },
   "risk": {
    "sizingModel": "percent_of_equity",
    "sizePercent": 100,
    "leverage": 1,
    "stopLoss": {
     "type": "percent",
     "value": 5
    },
    "takeProfit": {
     "type": "none"
    },
    "trailingStop": {
     "activation": {
      "type": "atr_multiple",
      "value": 0.015,
      "atrIndicator": "atr"
     },
     "offset": {
      "type": "atr_multiple",
      "value": 0.015,
      "atrIndicator": "atr"
     }
    },
    "oneStopOneTarget": true
   },
   "costs": {
    "commissionType": "percent",
    "commissionValue": 0.05,
    "slippageTicks": 0,
    "tickSize": 0.01
   },
   "parameters": [],
   "segments": {
    "warmupBars": 300,
    "selectionMode": "rolling_walk_forward",
    "embargoBars": 10
   },
   "falsification": [
    "Validation-segment net profit is non-positive.",
    "Doubling costs removes the edge.",
    "Profit disappears under the adverse intrabar path test."
   ]
  }
 },
 {
  "id": "r08",
  "label": "R08 profit-trigger (your script)",
  "sdl": {
   "schemaVersion": "1.0.0",
   "strategy": {
    "name": "R08 PROFIT-TRIGGER lab",
    "family": "mean_reversion_trend",
    "thesis": "When the fast 4-bar EMA crosses the daily-anchored VWAP, price is leaving the day's fair value in that direction; take the move with a 3% safety stop and lock profit with a trail once it is up 0.5%.",
    "directions": [
     "long",
     "short"
    ]
   },
   "market": {
    "assetClass": "crypto",
    "symbols": [
     "BINANCE:BTCUSDT"
    ],
    "timeframe": "240",
    "timezone": "Etc/UTC",
    "session": "0000-2359:1234567",
    "chartType": "standard_ohlc"
   },
   "indicators": [
    {
     "id": "ema4",
     "type": "ema",
     "source": "close",
     "length": 4
    },
    {
     "id": "vw",
     "type": "vwap_daily",
     "source": "close"
    },
    {
     "id": "atr14",
     "type": "atr",
     "length": 14
    }
   ],
   "signals": {
    "longEntry": "crosses_above(ema4, vw)",
    "shortEntry": "crosses_below(ema4, vw)",
    "longExit": "",
    "shortExit": ""
   },
   "execution": {
    "entryOrder": "market_next_bar",
    "pyramiding": 0,
    "allowReversal": true,
    "processOnClose": true,
    "calcOnEveryTick": false
   },
   "risk": {
    "sizingModel": "percent_of_equity",
    "sizePercent": 100,
    "leverage": 1,
    "stopLoss": {
     "type": "percent",
     "valueParameter": "stop_pct"
    },
    "takeProfit": {
     "type": "none"
    },
    "trailingStop": {
     "activation": {
      "type": "percent",
      "valueParameter": "trig_pct"
     },
     "offset": {
      "type": "atr_multiple",
      "value": 0.015,
      "atrIndicator": "atr14"
     }
    },
    "oneStopOneTarget": true
   },
   "costs": {
    "commissionType": "percent",
    "commissionValue": 0.05,
    "slippageTicks": 0,
    "tickSize": 0.01
   },
   "parameters": [
    {
     "key": "stop_pct",
     "type": "float",
     "default": 3,
     "min": 1.5,
     "max": 5,
     "step": 0.5,
     "rationale": "Safety stop distance from entry, as in the script input"
    },
    {
     "key": "trig_pct",
     "type": "float",
     "default": 0.5,
     "min": 0.25,
     "max": 1.5,
     "step": 0.25,
     "rationale": "Profit that arms the trail, as in the script input"
    }
   ],
   "segments": {
    "warmupBars": 200,
    "selectionMode": "rolling_walk_forward",
    "embargoBars": 10
   },
   "falsification": [
    "Validation-segment net profit is non-positive.",
    "Profit disappears under the adverse intrabar path test.",
    "Adding 1 tick of slippage removes the edge."
   ]
  }
 }
];
