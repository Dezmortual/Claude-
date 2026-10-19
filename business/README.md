# Business: strategy backtest audits

Work from the Show Me The Money (`money-*`) skills on turning the
`trading-desk/` audit method into a paid service.

- `sessions/`: `/money-save` snapshots, oldest first. `~/.smtm/` is wiped when a
  cloud container resets, so copy them back before running `/money-restore`:
  `mkdir -p ~/.smtm/sessions/claude- && cp business/sessions/*.md ~/.smtm/sessions/claude-/`
- `retros/`: weekly retros from the scheduled routine.
- `track-a/reddit-post.md`: the buyer-side post (draft, not posted).
- `track-b/before-after.png`: the proof chart for posts and email 1 (SVG too;
  rebuild with `python3 business/track-b/make_chart.py business/track-b/before-after.svg`).
- `track-b/email-1-first-5.md`: personalised first emails to the first 5 sellers.
- `track-b/`: the seller-side experiment, with 20 targets (`targets.csv`) and a
  3-email sequence (`messages.md`). Drafts only; nothing has been sent. Never pitch
  through TradingView private chat (House Rules ban solicitation there).

Re-check on day 14 against the pass marks in the latest snapshot.

## Scheduled routines

- **Weekly money retro:** Mondays at 07:58 Africa/Johannesburg (routine
  `trig_01DTWK5cte1BonhFfSuav81c`). Restores the snapshots, runs `/money-retro`
  on them and the tracking tables, and commits any updates. It never sends,
  posts or contacts anyone. Outreach and posting stay manual.
