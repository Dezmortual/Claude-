# ARF-OS Agent Desk

A single-page web platform for working with the ten ARF-OS specialist agents
(Idea Scout through Portfolio Researcher). Each agent has a character, a name,
a skill set, and its full role prompt from `SPECIALIST_AGENT_PROMPTS.md`.

## Features
- **Team view**: character cards with bio, skills, and trait meters.
- **Workspace**: chat with any agent. The agent runs with the shared ARF-OS
  policy plus its own role prompt.
- **Hand off**: send an agent's last reply to the next stage of the pipeline
  (Scout → Indicator → Architect → Pine → Backtest → Validator → Judge →
  Forward Test → Portfolio). The Data Integrity Analyst supports any stage.
- **Dossier panel**: method, deliverables, "will never" rules, and the full prompt.
- Sessions are saved in your browser (localStorage).

## Running it
Open `index.html` in a browser, or host the folder on any static host
(GitHub Pages, Netlify, Vercel). When hosted outside Claude, paste an Anthropic
API key in the left panel. The key stays in your browser and calls go
directly to `api.anthropic.com`. Reasoning depth picks the model:
Quick = Haiku 4.5, Balanced = Sonnet 5.5, Deep = Opus 5.5.

## Customising
Agents live in the `AGENTS` array near the top of the `<script>`. Edit names,
bios, skills, starter tasks, or prompts there. `SHARED_POLICY` stands in for
the Leader Agent System Prompt; replace it with your real one.
