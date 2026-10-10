#!/usr/bin/env python3
"""Build ruflo-dashboard/index.html from what Ruflo has installed and recorded.

Run from the repo root: python3 ruflo-dashboard/build.py
Reads .claude/{skills,commands,agents,settings.json}, .claude-flow/ metrics and
sessions, .swarm/memory.db, and asks the claude-flow MCP server for its tool list.
"""
import collections
import datetime as dt
import glob
import json
import os
import re
import sqlite3
import subprocess
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HERE = os.path.dirname(os.path.abspath(__file__))


def p(*parts):
    return os.path.join(ROOT, *parts)


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def front_matter(path):
    """Return (name, description) from a markdown file's YAML front matter."""
    try:
        text = open(path, encoding="utf-8", errors="replace").read(4000)
    except OSError:
        return None, ""
    m = re.match(r"---\s*\n(.*?)\n---", text, re.S)
    name, desc = None, ""
    if m:
        for line in m.group(1).splitlines():
            if line.startswith("name:"):
                name = line[5:].strip().strip("\"'")
            elif line.startswith("description:"):
                desc = line[12:].strip().strip("\"'")
    if not desc:
        h = re.search(r"^#\s+(.+)$", text, re.M)
        desc = h.group(1).strip() if h else ""
    return name, desc[:240]


def mcp_tools(version, timeout=60):
    """Start the MCP server, send initialize + tools/list, return the tools."""
    msgs = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize",
         "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                    "clientInfo": {"name": "ruflo-dashboard", "version": "1"}}},
        {"jsonrpc": "2.0", "method": "notifications/initialized"},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    ]
    try:
        proc = subprocess.Popen(
            ["npx", "-y", f"ruflo@{version}", "mcp", "start"], cwd=ROOT,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True)
    except OSError:
        return None
    timer = threading.Timer(timeout, proc.kill)
    timer.start()
    try:
        for m in msgs:
            proc.stdin.write(json.dumps(m) + "\n")
        proc.stdin.flush()
        for line in proc.stdout:
            try:
                m = json.loads(line)
            except ValueError:
                continue
            if m.get("id") == 2:
                return m.get("result", {}).get("tools", [])
    finally:
        timer.cancel()
        proc.kill()
    return None


def db_counts(path):
    out = {}
    if not os.path.exists(path):
        return out
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        for (t,) in con.execute("select name from sqlite_master where type='table'"):
            if t.startswith("sqlite_"):
                continue
            out[t] = con.execute(f'select count(*) from "{t}"').fetchone()[0]
        con.close()
    except sqlite3.Error:
        pass
    return out


def main():
    settings = load_json(p(".claude", "settings.json"), {})
    mcp = load_json(p(".mcp.json"), {})
    args = mcp.get("mcpServers", {}).get("claude-flow", {}).get("args", [])
    version = next((a.split("@", 1)[1] for a in args if a.startswith("ruflo@")), "latest")

    items = []
    for f in sorted(glob.glob(p(".claude", "skills", "*", "SKILL.md"))):
        slug = os.path.basename(os.path.dirname(f))
        name, desc = front_matter(f)
        group = slug.split("-")[0]
        items.append({"type": "Skill", "name": name or slug, "group": group, "desc": desc})
    for f in sorted(glob.glob(p(".claude", "commands", "**", "*.md"), recursive=True)):
        rel = os.path.relpath(f, p(".claude", "commands"))
        parts = rel.split(os.sep)
        group = parts[0] if len(parts) > 1 else "general"
        slug = os.path.splitext(parts[-1])[0]
        if slug.lower() == "readme":
            continue
        _, desc = front_matter(f)
        name = f"/{group}:{slug}" if len(parts) > 1 else f"/{slug}"
        items.append({"type": "Command", "name": name, "group": group, "desc": desc})
    for f in sorted(glob.glob(p(".claude", "agents", "**", "*.md"), recursive=True)):
        rel = os.path.relpath(f, p(".claude", "agents"))
        parts = rel.split(os.sep)
        if os.path.splitext(parts[-1])[0].lower() == "readme":
            continue
        name, desc = front_matter(f)
        group = parts[0] if len(parts) > 1 else "general"
        items.append({"type": "Agent", "name": name or os.path.splitext(parts[-1])[0],
                      "group": group, "desc": desc})

    tools = mcp_tools(version)
    if tools is None:
        tools = load_json(os.path.join(HERE, ".mcp-tools-cache.json"), []) or []
    else:
        with open(os.path.join(HERE, ".mcp-tools-cache.json"), "w") as f:
            json.dump([{"name": t["name"], "description": t.get("description", "")}
                       for t in tools], f)
    for t in tools:
        items.append({"type": "MCP tool", "name": t["name"],
                      "group": t["name"].split("_")[0],
                      "desc": (t.get("description") or "")[:240]})

    hooks = {ev: sum(len(h.get("hooks", [])) for h in v)
             for ev, v in settings.get("hooks", {}).items()}

    session = load_json(p(".claude-flow", "sessions", "current.json"), {})
    learning = load_json(p(".claude-flow", "metrics", "learning.json"), {})
    swarm = load_json(p(".claude-flow", "metrics", "swarm-activity.json"), {})
    security = load_json(p(".claude-flow", "security", "audit-status.json"), {})
    progress = load_json(p(".claude-flow", "metrics", "v3-progress.json"), {})
    insights = []
    try:
        for line in open(p(".claude-flow", "data", "pending-insights.jsonl")):
            try:
                insights.append(json.loads(line))
            except ValueError:
                pass
    except OSError:
        pass
    memory = db_counts(p(".swarm", "memory.db"))

    data = {
        "generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "version": version,
        "installed": (progress.get("initialized") or "")[:10],
        "plugins": [k for k, v in settings.get("enabledPlugins", {}).items() if v],
        "hooks": hooks,
        "statusLine": bool(settings.get("statusLine")),
        "items": items,
        "activity": {
            "session": session.get("id"),
            "sessionStarted": session.get("startedAt"),
            "edits": session.get("metrics", {}).get("edits", 0),
            "commands": session.get("metrics", {}).get("commands", 0),
            "tasks": session.get("metrics", {}).get("tasks", 0),
            "errors": session.get("metrics", {}).get("errors", 0),
            "insights": len(insights),
            "memoryEntries": memory.get("memory_entries", 0),
            "patterns": memory.get("patterns", 0),
            "trajectories": memory.get("trajectories", 0),
            "routingDecisions": learning.get("routing", {}).get("decisions", 0),
            "sessionsTotal": learning.get("sessions", {}).get("total", 0),
            "swarmActive": swarm.get("swarm", {}).get("active", False),
            "agentsActive": swarm.get("swarm", {}).get("agent_count", 0),
            "maxAgents": progress.get("swarm", {}).get("maxAgents", 0),
            "topology": progress.get("swarm", {}).get("topology", ""),
            "securityStatus": security.get("status", "UNKNOWN"),
            "lastScan": security.get("lastScan"),
        },
    }

    template = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
    payload = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    out = template.replace("/*__DATA__*/null", payload)
    with open(os.path.join(HERE, "index.html"), "w", encoding="utf-8") as f:
        f.write(out)
    counts = collections.Counter(i["type"] for i in items)
    print(f"wrote ruflo-dashboard/index.html: {dict(counts)}, "
          f"{sum(hooks.values())} hook handlers")


if __name__ == "__main__":
    main()
