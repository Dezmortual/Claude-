# ARF-OS Agent Desk

A single-page web platform for working with the ten ARF-OS specialist agents
(Idea Scout through Portfolio Researcher). Each agent has a character, a name,
a skill set, and its full role prompt from `SPECIALIST_AGENT_PROMPTS.md`.

## Features
- **Ask all (the floor)**: one chat box for the whole team. A quick routing
  step reads each question and picks the 1–3 agents whose roles fit (you set
  the maximum). They answer automatically, one after another, and each sees
  what the colleagues before it said. Type `@name` (for example `@rook` or
  `@quill`) to pick an agent yourself. If routing fails, a keyword match is
  used as a fallback.
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

## GitHub Pages
`.github/workflows/pages.yml` deploys this folder to GitHub Pages on every push
to the default branch that touches `arf-os-studio/`. The site is served at
https://dezmortual.github.io/Claude-/
