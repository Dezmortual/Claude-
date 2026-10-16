#!/bin/sh
# SessionStart hook: start the OpenBB MCP server (registered as `openbb` in
# .mcp.json) on http://127.0.0.1:8001/mcp unless it is already running.
# The cloud environment's setup script should `pip install openbb-mcp-server`;
# this installs it as a fallback when that hasn't happened.

URL="http://127.0.0.1:8001/mcp"
LOG="${TMPDIR:-/tmp}/openbb-mcp.log"

is_up() {
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$URL")
  [ -n "$code" ] && [ "$code" != "000" ]
}

is_up && exit 0

if ! command -v openbb-mcp >/dev/null 2>&1; then
  pip install -q openbb-mcp-server >>"$LOG" 2>&1 || {
    echo "openbb-mcp: install failed, see $LOG" >&2
    exit 0
  }
fi

nohup setsid openbb-mcp --tool-discovery >>"$LOG" 2>&1 </dev/null &

# Wait so the server is answering when Claude Code connects to it.
i=0
while [ $i -lt 40 ]; do
  is_up && exit 0
  sleep 1
  i=$((i + 1))
done
echo "openbb-mcp: not answering on $URL yet, see $LOG (reconnect with /mcp)" >&2
exit 0
