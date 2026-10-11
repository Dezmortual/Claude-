# Recon map: TradingView Supercharts (web)

Scope: the chart (symbols, intervals, chart types, indicators, drawings,
multi-chart layouts, watchlist, bar replay) and alerts (create, manage, log,
notify). Not the social network, screeners, news, broker trading or Pine
Script as a language.
For: personal use. One user, no sign-up, no billing, runs next to
`trading-desk/`.
Date: 2026-10-11

How this was gathered: tradingview.com cannot be reached from this container,
so everything below comes from TradingView's public help center, blog and Pine
Script docs, read through search results. No account was used and no screens
were captured yet. `replica/screens/` is empty: add your own screenshots of
S01, S11 and S12 from your account before `/replica-design`. Rows marked
"docs" were described in help articles, not seen.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | help: Supercharts guide | https://www.tradingview.com/support/solutions/43000746464-getting-started-with-supercharts/ | three toolbars + bottom panel, magnet mode, overlays vs panes, object tree |
| 2 | help: chart types | https://www.tradingview.com/support/solutions/43000703407-chart-types-available-on-tradingview/ | time-based vs price-based (Renko, Line Break, Kagi, P&F, Range) |
| 3 | help: drawing tools | https://in.tradingview.com/support/solutions/43000703396 | tool groups: trend/patterns, shapes, measure/forecast, levels, text |
| 4 | help: multi-chart layouts | https://www.tradingview.com/support/solutions/43000629990-leveraging-multi-chart-layouts-in-your-analysis/ | grid of charts per tab |
| 5 | help: sync charts | https://www.tradingview.com/support/solutions/43000629992-how-to-sync-the-charts-of-my-layout/ | sync symbol, interval, crosshair, time, date range |
| 6 | help: sync selected charts | https://www.tradingview.com/support/solutions/43000761094-how-to-sync-selected-charts/ | sync groups |
| 7 | help: drawings sync | https://www.tradingview.com/support/solutions/43000629998-my-drawings-do-not-get-synchronized-across-charts-or-layouts/ | drawings sync per symbol, per layout or global |
| 8 | help: bar replay | https://www.tradingview.com/support/solutions/43000712747-bar-replay-how-and-why-to-test-a-strategy-in-the-past/ | pick start bar, play/step, synced across layout |
| 9 | help: introduction to alerts | https://www.tradingview.com/support/solutions/43000520149-introduction-to-tradingview-alerts/ | alert types |
| 10 | help: configure alerts | https://www.tradingview.com/support/solutions/43000763312-learn-how-to-configure-alerts/ | condition, trigger, expiration, message, notifications |
| 11 | help: alert frequencies | https://www.tradingview.com/support/solutions/43000474415-differences-between-alert-frequencies/ | only once, once per bar, once per bar close, once per minute |
| 12 | help: manage alerts | https://www.tradingview.com/support/solutions/43000595311-manage-alerts/ | sort, stop, resume, edit, delete; log exportable to CSV |
| 13 | help: multi-condition alerts | https://www.tradingview.com/support/solutions/43000761492-multi-condition-alerts/ | up to 5 conditions, same symbol, AND |
| 14 | help: watchlist alerts | https://www.tradingview.com/support/solutions/43000739708-watchlist-alerts-your-trading-edge/ | one alert evaluated per symbol of a list |
| 15 | Pine docs: alerts | https://www.tradingview.com/pine-script-docs/concepts/alerts/ | alertcondition() vs alert(), placeholders like {{close}}, {{plot_0}} |
| 16 | pricing (third party, official page unreachable) | https://chartwisehub.com/tradingview-plan-comparison/ | what the plans gate: charts per tab, indicators per chart, alert counts, webhooks |
| 17 | policies | https://in.tradingview.com/policies | data only for human-readable display; see "Terms" below |
| 18 | Lightweight Charts (TradingView, Apache 2.0) | https://github.com/tradingview/lightweight-charts | open-source charting library you can use legally with attribution |

### Terms

You are building this for yourself, not as a competing product, and only from
public docs, so the competing-use concern does not apply. Two things do:
TradingView's market data is licensed for on-screen display only, so the clone
uses your own feeds (below), never data copied out of TradingView. And
Lightweight Charts is Apache 2.0: keep its attribution (the default logo link,
or the NOTICE file and a link to tradingview.com).

## Core loop

Open a chart of a symbol, read it with indicators and drawings, then set an
alert on a price, a line or an indicator so you get notified when the setup
happens instead of watching the screen.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Chart workspace | `/chart` | the whole app: top toolbar, left drawing bar, right panel, bottom panel, chart grid | Toolbar, ChartPane, PriceScale, TimeScale, Legend, Crosshair | loading, filled, no data for symbol, market closed, feed disconnected (docs) |
| S02 | Symbol search | top toolbar symbol button, or start typing on the chart | find and switch symbol | SearchInput, Tabs (asset class), ResultList | empty query, results, no results (docs) |
| S03 | Interval menu | top toolbar interval button, or type a number | pick timeframe, add custom, mark favourites | Menu, FavouriteStar | default list, custom added (docs) |
| S04 | Chart type menu | top toolbar | candles, bars, hollow, Heikin Ashi, line, area, baseline, Renko etc. | Menu | (docs) |
| S05 | Indicators dialog | top toolbar "Indicators" | search and add built-in and my own indicators | Modal, SearchInput, CategoryList, ResultList | empty search, results, at the per-chart limit (docs) |
| S06 | Indicator settings | gear on an indicator legend row | inputs, style, visibility per interval | Modal, Tabs (Inputs/Style/Visibility), NumberInput, ColorPicker | defaults, edited, invalid input (guess) |
| S07 | Drawing toolbar + object tree | left bar; object tree in right panel | draw, select, lock, hide, delete, magnet | IconToolbar, Flyout, FloatingStyleBar, TreeList | idle, tool armed, drawing in progress, selected (docs) |
| S08 | Layout picker | top toolbar grid icon | choose a 1 to 16 chart grid, set sync options | GridPicker, Toggle list (symbol/interval/crosshair/time/date range) | single, multi, synced (docs) |
| S09 | Save / load layout | top toolbar layout name menu | name, save, autosave, open another layout | Menu, Modal, ListItem | unsaved changes, saved, list of layouts (docs) |
| S10 | Watchlist panel | right panel | symbols with last, change, change %; click to load | Table, ListSection, AddSymbol | empty list, filled, flagged rows (docs) |
| S11 | Create alert dialog | alarm-clock button, right-click on chart, or on a drawing/indicator | set condition, trigger, expiration, message, notifications | Modal, Tabs (Settings/Message/Notifications), Select, DateTimePicker, Toggle, Textarea | price condition, indicator condition, drawing condition, multi-condition, validation error (docs) |
| S12 | Alerts manager | right panel "Alerts" | list, sort, stop, resume, edit, delete, clone | Table, RowActions, SortMenu, StatusBadge | empty, active, stopped, triggered, expired (docs) |
| S13 | Alerts log | Alerts panel "Log" tab | every trigger with time and message; export CSV | Table, ExportButton | empty, filled (docs) |
| S14 | Alert popup + toast | when an alert fires, in any tab | show the message, play a sound, open the chart | Toast, Modal, SoundToggle | single, stacked (docs) |
| S15 | Bar replay controls | top toolbar "Replay" | choose start bar, play, pause, step, speed, jump to realtime | FloatingControlBar, SpeedMenu, ScissorCursor | selecting start, paused, playing, end of data (docs) |
| S16 | Chart settings | right-click chart > Settings | colours, scales, status line, timezone, session | Modal, Tabs, ColorPicker, Select | defaults, edited (docs) |
| S17 | Data window | right panel | OHLCV and indicator values under the crosshair | KeyValueList | no hover, values (docs) |

## Flows

```
F01 Open a symbol and read the chart
    S01 -> S02 type "SOLUSDT", Enter -> S01 -> S03 pick 1h -> S04 Heikin Ashi
    happy path clicks: 4 (typing on the chart opens search)
    edge: unknown symbol, no bars for the interval, feed down mid-session,
          switching symbol keeps drawings that belong to the old symbol hidden

F02 Add and tune an indicator
    S01 -> S05 search "Donchian", add -> S06 set length 20 -> S01
    happy path clicks: 4
    edge: indicator needs more history than loaded, invalid input,
          oscillator goes in a new pane, overlay on price

F03 Draw a level and alert on it
    S07 pick horizontal line -> click price -> right-click line -> S11
    "crossing", once per bar close -> create -> S12 shows it active
    happy path clicks: 6
    edge: magnet snaps to OHLC, line moved after the alert is made (alert must
          follow the line), drawing deleted while its alert is active

F04 Price alert
    S01 alarm button (or Alt+A, shortcut not verified) -> S11 condition "Crossing 150.00", only once,
    expiry in 30 days, notify toast + sound + webhook -> create
    happy path clicks: 4
    edge: price already past the level when created, expiry passed,
          browser closed when it fires (must still fire and log)

F05 Indicator alert with message placeholders
    S01 -> S11 condition: my Donchian "breakout", once per bar close, message
    "{{ticker}} {{close}} broke out" ({{ticker}} not verified) -> create -> fires -> S14 -> S13
    happy path clicks: 5
    edge: intrabar trigger then bar closes back inside (repaint), indicator
          inputs changed after the alert was made (alert keeps a snapshot)

F06 Manage and review alerts
    S12 sort by trigger time -> stop one, edit one, delete one -> S13 export CSV
    happy path clicks: 5
    edge: editing a fired "only once" alert re-arms it, bulk delete

F07 Multi-chart layout, synced
    S08 pick 2x2, sync symbol + crosshair -> set 15m, 1h, 4h, 1D -> S09 save
    happy path clicks: 7
    edge: drawings shared only between charts of the same symbol, reopen
          restores every chart's indicators and drawings

F08 Bar replay
    S15 replay -> click a start bar -> play at 1x, step forward -> jump to realtime
    happy path clicks: 4
    edge: replay on a multi-chart layout (all charts follow one clock), larger
          interval charts wait for the smaller ones, alerts must not fire in replay

F09 Watchlist alert
    S10 list of 20 coins -> S11 condition on the list "my Donchian breakout"
    -> each symbol fires on its own
    happy path clicks: 5
    edge: symbol added to the list later is covered, no open-ended expiry
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| ChartPane | main price pane, indicator pane | loading, filled, empty, crosshair active, replay | S01 |
| PriceScale | linear, log, percent, indexed to 100 | auto, manual drag, inverted | S01 |
| TimeScale | intraday, daily+ | scrolled, zoomed, at realtime | S01 |
| Legend row | symbol, indicator | visible, hidden, settings hover | S01 |
| Toolbar | top, left icon bar, right panel switcher, bottom | default, active item | S01 |
| Flyout menu | interval, chart type, drawing group | open, favourites | S03, S04, S07 |
| Modal | small, large with tabs | open, dirty, error | S05, S06, S09, S11, S16 |
| Search list | symbol, indicator | empty, results, no results, keyboard focus | S02, S05 |
| Drawing | line, ray, horizontal, rectangle, fib, text, path | preview, selected, locked, hidden | S01, S07 |
| Floating style bar | per drawing | colour, width, style, alert, delete | S07 |
| Table | watchlist, alerts, log | empty, sorted, row hover, row selected | S10, S12, S13 |
| Status badge | active, stopped, triggered, expired | | S12 |
| Toast | alert fired, info, error | stacked, dismissed | S14 |
| Replay bar | | selecting, paused, playing, end | S15 |
| Inputs | number, select, toggle, colour, date-time, textarea | default, focus, invalid, disabled | S06, S11, S16 |
| Button | primary, secondary, ghost, icon, danger | default, hover, focus, disabled, loading | all |

## Inferred data model

```
Symbol      id, exchange, ticker, asset_class (crypto | stock | index), tick_size,
            session, timezone
            evidence: S02 tabs, S16 session/timezone   confidence: high

Bar         symbol_id, interval, time, open, high, low, close, volume
            evidence: S17 data window                   confidence: high
            (cache only, from your own feeds; never stored from TradingView)

Layout      id, name, grid (1x1 .. 4x4), sync {symbol, interval, crosshair,
            time, date_range}, autosave, updated_at
            evidence: S08, S09, source 5                confidence: high

Chart       id, layout_id, position, symbol_id, interval, chart_type, style (json),
            price_scale_mode
            evidence: S01, S04, S16                     confidence: high

Study       id, chart_id, indicator_key, inputs (json), style (json), pane_index,
            visible_intervals
            evidence: S05, S06                          confidence: high

Drawing     id, symbol_id, layout_id (null when synced globally), tool, points
            (json: [{time, price}]), style (json), locked, hidden,
            visible_intervals
            evidence: S07, source 7 (drawings belong to a symbol)  confidence: medium

Watchlist   id, name, symbols (ordered), flags
            evidence: S10                               confidence: high

Alert       id, name, target (symbol_id | watchlist_id), conditions (json, 1..5,
            each {source: price | study | drawing, study_id/drawing_id, op:
            crossing | crossing_up | crossing_down | greater | less |
            entering_channel | exiting_channel | moving_up_pct ..., value}),
            trigger (only_once | once_per_bar | once_per_bar_close |
            once_per_minute), interval, expires_at (null = open-ended),
            message_template, notify {toast, sound, email, webhook_url},
            status (active | stopped | triggered | expired), created_at
            evidence: S11, sources 10, 11, 13, 14       confidence: high on fields,
            guess on the exact operator list

AlertEvent  id, alert_id, symbol_id, fired_at, bar_time, price, message
            (rendered), delivered {toast, webhook_status}
            evidence: S13, source 12                    confidence: high
```

Relationships: Layout 1-n Chart, Chart 1-n Study, Symbol 1-n Drawing,
Alert n-1 (Symbol | Watchlist), Alert 0-n Study/Drawing via conditions,
Alert 1-n AlertEvent, Watchlist n-n Symbol.

## Feature matrix

See `features.csv`. Must: 21, should: 15, could: 10, skip: 8.

## Out of scope (cannot or should not be cloned)

- TradingView's market data. Their feeds are licensed for display. Use your
  own: Binance public klines (`trading-desk/core/binance_data.py`, no key) and
  Alpaca for US stocks (`core/data.py`, free paper key already in `.env`).
- Pine Script as a language and the community script library. Your indicators
  are Python (the Donchian and Sweep ports in `trading-desk/` already exist).
- The social layer: ideas, streams, chat, followers.
- Broker trading panel and paper trading on their side.
- Screeners, news, fundamentals, economic calendar.
- Their mobile apps and push notifications through their app.

## Size

Screens 17, flows 9, entities 9. Hard parts:

1. **Alerts that fire when your browser is closed.** Needs a server process
   that streams live bars for every symbol with an active alert, recomputes the
   indicators on each bar, and applies the trigger rules (once per bar close vs
   intrabar) without repainting. This is the part worth getting exactly right.
2. **Drawings engine.** Hit-testing, dragging handles, magnet to OHLC, and
   storing points as (time, price) so they survive zoom, interval change and
   alerts on a moving line.
3. **Live data plumbing.** Binance websocket for crypto, Alpaca stream for
   stocks, gap-filling on reconnect, and aggregating 1m into higher intervals.

Easy parts thanks to Lightweight Charts: candles, scales, panes, crosshair and
time scale come free.

Size: **L** for everything in the matrix. **M** for the must rows only, which
is the useful version for one person: one chart and a 2x2 layout, your own
indicators, horizontal-line, trendline and indicator alerts with webhook and
toast, an alerts manager and a log.
