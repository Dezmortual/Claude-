#!/usr/bin/env bash
# Install TradingAgents for the `ta` arm of donchian/run_backtest.py.
#
#   cd trading-desk
#   bash tradingagents_gate/setup.sh
#   echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
#
# Pinned to the commit this gate was written and reviewed against. Moving the
# pin changes the agents' prompts, so it changes the experiment: cached answers
# are keyed by settings, not by TradingAgents version, so clear
# tradingagents_gate/cache/ when you move it.
set -euo pipefail

TA_COMMIT="1394a3f72aa4393e1a98f51b382434c4b4c2d972"
PY="${PYTHON:-python3}"

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
desk="$(dirname "$here")"

"$PY" - <<'EOF'
import sys
if sys.version_info < (3, 11):
    sys.exit("TradingAgents needs Python 3.11 or newer; this is %s" % sys.version.split()[0])
EOF

echo "installing TradingAgents @ ${TA_COMMIT:0:7} into $("$PY" -c 'import sys; print(sys.executable)')"
"$PY" -m pip install --quiet "tradingagents @ git+https://github.com/TauricResearch/TradingAgents.git@${TA_COMMIT}"

"$PY" -c "import tradingagents, langchain_anthropic; print('tradingagents', tradingagents.__version__, 'ok')"

if [ ! -f "$desk/.env" ]; then
  cp "$desk/deploy/.env.example" "$desk/.env"
  echo "created $desk/.env from deploy/.env.example"
fi
if grep -qE '^ANTHROPIC_API_KEY=.+' "$desk/.env"; then
  echo "ANTHROPIC_API_KEY found in .env"
else
  echo "next: echo \"ANTHROPIC_API_KEY=sk-ant-...\" >> .env   (from $desk)"
fi
echo "then: python3 donchian/run_backtest.py --arms rules gated ta --ta-estimate"
