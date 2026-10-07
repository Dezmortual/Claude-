#!/usr/bin/env bash
# Builds tradingagents_gate/.venv with TradingAgents pinned to the commit
# core/ta_decider.py expects (TA_PIN). It needs Python >= 3.11 and pandas 3,
# which is why it does not share the desk's own environment.
set -euo pipefail
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
"$PY" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else "TradingAgents needs Python >= 3.11")'
"$PY" -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
.venv/bin/python -c "import tradingagents; print('tradingagents', tradingagents.__version__, 'ready in', '$(pwd)/.venv')"
