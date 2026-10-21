# Components

These are the design system for the forecast-signals clone. They come from
the recon component list (`replica/recon.md`); screen IDs refer to it.
Tokens are the Tailwind names from `tailwind.preset.cjs`, never hex. The
base is **Radix primitives + shadcn/ui patterns** on web and **React Native
core + NativeWind** on mobile, with **Lucide** icons (ISC licence). All copy
here is placeholder and gets written fresh in /replica-build. Nothing is
taken from the original's text.

The HTML reference for every primitive below is in `preview.html`
(screenshots `preview-light.png`, `preview-dark.png`, `preview-mobile.png`).

## Global rules

- **Focus:** every interactive element shows `:focus-visible` as a 2px ring
  (`ring` = focus) with a 2px offset. Never `outline: none` without a
  replacement.
- **Tap targets:** at least 44 × 44px on touch (`min-h-tap min-w-tap`),
  even when the visible control is smaller.
- **Numbers:** prices, % changes and table figures use `tabular-nums`,
  right-aligned in tables.
- **Never colour alone:** up and down always pair colour with a sign and an
  arrow (▲ +2.1% / ▼ −1.9%). Signal badges always carry their word.
  Colour-blind users read the word.
- **Motion:** `duration-fast` for hover and press, `duration-base` for
  open and close, all off under `prefers-reduced-motion`.
- **Theme:** light and dark come from the same roles. The theme toggle sets
  `data-theme` on `<html>`, and with no choice it follows the OS.
- **Data freshness:** anything showing a live number can be `stale` or
  `loading`. A stale value stays visible, gets muted, and gains an "as of"
  time. Never show a blank "—" where a stale value exists.
- **Locked data never reaches the client.** Locked states render a
  placeholder shape, not blurred real numbers (see architecture.md).

---

## Primitives

```
Button
  variants  primary, secondary, ghost, danger, link
  sizes     sm 32px, md 40px, lg 48px (touch: md/lg only)
  states    default, hover, active, focus-visible, disabled, loading
  tokens    primary: bg-accent text-on-accent hover:bg-accent-hover; secondary: bg-surface border text-fg
            hover:bg-surface-sunken; ghost: text-fg hover:bg-surface-sunken; danger: bg-danger text-white;
            radius md; font sm/600; icon 16px gap 2
  a11y      real <button> (or <a> when it navigates); loading sets aria-busy and keeps the label (spinner
            is aria-hidden); disabled uses the disabled attribute, never only a class
  used on   all
```

```
IconButton
  variants  ghost, outline, header (on header bg)
  sizes     sm 32px, md 40px (hit area always >= 44px)
  states    default, hover, active (pressed/toggled: aria-pressed), focus-visible, disabled, badge (count dot)
  tokens    radius md; icon 18px; active: bg-accent-soft text-accent
  a11y      aria-label required ("Add to watchlist"); a toggle exposes aria-pressed; a badge count goes in the label
  used on   header (watchlist, alerts, theme, account), S06 star, table rows
```

```
Input / Search
  variants  text, email, password (show/hide), number (amount, with unit prefix), search (leading icon, clear button)
  sizes     md 40px, lg 48px (forms on mobile)
  states    default, hover, focus-visible, filled, disabled, invalid, read-only
  tokens    bg-surface border-input radius md text-fg placeholder:text-subtle; invalid: border-danger + message text-danger xs
  a11y      visible <label> (never placeholder-only); errors linked by aria-describedby and announced;
            password toggle is a button with aria-pressed; number inputs use inputmode="decimal"
  used on   S02 search, S06 calculators, S10-S12, S14
```

```
Select
  variants  native (mobile, forms), listbox (Radix Select: filters)
  states    closed, open, focus-visible, disabled, has-value
  tokens    same as Input; menu: bg-surface shadow-pop radius md; option hover bg-surface-sunken; selected check text-accent
  a11y      Radix Select: arrow keys, type-ahead, Esc closes, focus returns to trigger
  used on   S02 signal-strength + volatility filters, S06 horizon pickers, S14 alert condition
```

```
Checkbox / Switch
  states    off, on, indeterminate (checkbox), focus-visible, disabled
  tokens    on: bg-accent; off: border-input; radius sm (checkbox) / pill (switch)
  a11y      real input or Radix with role; label is clickable
  used on   S11 terms, S03 column toggles (switch), S14 channels
```

```
SegmentedControl  (tabs that switch a view in place)
  variants  pill (Investing / Day Trading, Overview / Historical), compact chips (1D 1W 1M 3M 1Y 5Y All)
  states    default, hover, selected, focus-visible, disabled (e.g. timeframe without data)
  tokens    track bg-surface-sunken radius pill; selected bg-surface shadow-card text-fg (pill) or bg-accent text-on-accent (chips)
  a11y      role=radiogroup with radios (it filters a view) or Radix Tabs when it swaps panels; arrow keys move
  used on   S01, S02, S06, S07, S09 billing toggle
```

```
Tabs (navigation tabs)
  variants  underline (asset section tabs: Overview, Live price, Forecast, Signals, History, Converter)
  states    default, hover, current, focus-visible
  tokens    current: text-fg + 2px bar bg-accent; others text-muted
  a11y      these are links, so <nav> with aria-current="page", not role=tablist
  used on   S04-S08
```

```
Chip (filter chip)
  variants  market chip (All, Crypto, Forex...), removable active filter
  states    default, hover, selected, locked (plan), focus-visible
  tokens    border radius pill sm/500; selected bg-accent text-on-accent; locked text-subtle + lock icon
  a11y      a selected chip is aria-pressed; a locked chip stays focusable and says "Forex, requires Pro plan"
  used on   S01, S02
```

```
Badge
  variants  neutral, accent, warning, plan ("Most popular"), status (stale, live)
  tokens    xs/600 radius pill px-2 h-5; soft bg + strong text from the same role (accent on accent-soft, warning on warning-soft)
  a11y      text, not icon-only
  used on   S09, S06 provenance, S13
```

```
Tooltip / Popover
  states    closed, open (hover + focus for tooltip; click for popover)
  tokens    bg-fg text-bg (inverted) xs radius sm shadow-pop (tooltip); popover bg-surface shadow-pop radius lg p-4
  a11y      tooltip is supplementary only (never the only label); Radix, Esc closes
  used on   column header help (what Sharpe means), chart crosshair, methodology terms
```

```
Modal (Dialog) / Sheet
  variants  dialog (desktop, centred, max 520px), sheet (mobile, bottom, drag handle)
  states    closed, opening, open, closing
  tokens    overlay bg-overlay/50; panel bg-surface radius xl shadow-pop p-6; motion base
  a11y      Radix Dialog: focus trap, Esc closes, focus returns, aria-labelledby title, scroll lock
  used on   S03 column picker, S14 new alert, upgrade prompt
```

```
Toast
  variants  success, error, info (with an optional action: "Undo")
  states    entering, visible (5s; paused on hover/focus), leaving
  tokens    bg-surface border shadow-raised radius lg; leading icon in role colour
  a11y      role=status (polite), role=alert for errors; never the only place an error shows
  used on   watchlist add/remove, alert saved, copy link
```

```
Skeleton / Loading
  variants  text line, number, table row, chart block, card
  tokens    bg-surface-sunken radius sm; shimmer off under reduced motion
  a11y      the container gets aria-busy=true; one sr-only "Loading forecasts" per region, not per row
  used on   everywhere data loads (recon saw "Loading live signals...", "Building today's outlook...")
```

```
EmptyState
  variants  no results (filter/search), nothing yet (empty watchlist/alerts), unavailable (not enough data), error (with retry)
  tokens    centred, icon 24px text-subtle, title base/600 text-fg, body sm text-muted, one action button
  a11y      a heading; a retry button keeps focus after the retry
  used on   S02, S06 (pulse timeframe without candles), S13, S14
```

```
Banner (inline notice)
  variants  info, warning (stale or diverged quote, data-quality notice), risk (disclaimer), upgrade
  tokens    soft bg of the role + strong text, radius md, p-3, leading icon
  a11y      role=status for live changes; dismissible ones have a labelled close button
  used on   S06 quarantine notice, every page footer (risk), S02 locked market
```

## Navigation and layout

```
Header
  variants  desktop (logo, nav with dropdowns, icon buttons, account), mobile (logo, account, menu -> drawer)
  states    logged-out (Sign in + Sign up), logged-in (avatar menu), scrolled (shadow-card)
  tokens    h-header bg-surface border-b; sticky z-header; content max-w-wide px-4 lg:px-6
  a11y      <header><nav aria-label="Main">; dropdowns are Radix NavigationMenu (keyboard + hover); skip-to-content link first
  used on   all
  note      the original's header is a saturated brand-colour gradient bar; ours is surface-coloured so the brand
            colour goes on actions, not chrome (trade-dress distance, see Rebuilt vs original)
```

```
Footer
  contents  risk disclaimer (always), legal links, product links, theme + locale
  tokens    bg-surface-sunken text-muted sm; max-w-content
  used on   all
```

```
Breadcrumb
  tokens    xs text-muted, separators aria-hidden, current item text-fg aria-current="page"
  a11y      <nav aria-label="Breadcrumb"><ol>
  used on   S04-S08
```

```
Pagination
  parts     rows-per-page select (10/20/50/100), prev / next, page numbers with ellipsis, "1-20 of 198"
  states    first page (prev disabled), middle, last page, single page (hidden)
  tokens    IconButton outline for prev/next; current page bg-accent text-on-accent
  a11y      <nav aria-label="Pagination">, aria-current="page", disabled ends keep focusability off
  used on   S02
```

```
Page shell
  widths    content 1200 (default), wide 1360 (forecast table), prose 760 (methodology, FAQ, legal)
  gutters   16px mobile, 24px >= lg
  grid      12 columns >= lg; stat cards 4-up lg, 2-up md, 1-up (horizontal scroll strip on mobile)
```

## Data display

```
DataTable  (the forecast table: the product)
  variants  full (S02: 15 columns), compact (S01 home, S13 watchlist), plain (forecast-range tables on S06)
  parts     sticky header, sticky first column (asset) on horizontal scroll, sortable headers, row link to asset,
            column visibility (ColumnPicker), pagination, row actions (watchlist star)
  sizes     row 48px (comfortable), 40px (compact, user setting)
  states    loading (skeleton rows), filled, empty (no results), error (retry), locked rows, sorted asc/desc,
            stale (run older than 2h: banner above table)
  tokens    bg-surface border radius lg; header 2xs uppercase text-subtle bg-surface-sunken;
            row border-b hover:bg-surface-sunken; numbers right-aligned tabular
  a11y      a real <table> with <th scope>; sort buttons inside <th> with aria-sort; a row is a link via
            the asset-name cell (not a click-anywhere div); locked cells read "Locked, requires Pro"
  mobile    < md: becomes an AssetCard list (asset, price, one chosen horizon, signal badge); a horizon
            SegmentedControl picks which forecast column shows
  used on   S01, S02, S06, S13
```

```
ColumnPicker
  parts     Modal/Sheet with one Switch per column, grouped (Forecasts, Technicals, Risk), Reset, Done
  states    default, all-hidden guard (Asset column cannot be hidden; at least one data column stays)
  persistence  signed in: table_preferences; guest: localStorage
  used on   S03
```

```
AssetCell
  parts     icon 24px (own or licensed set; generic letter monogram fallback), name (link), ticker (xs mono text-subtle)
  states    default, delisted (text-subtle + "inactive" badge)
  used on   S02, S05, S13, M01
```

```
PriceChange
  variants  inline (+2.07%), with absolute value ($217.58 −1.98%), large (asset header)
  states    up (text-up ▲), down (text-down ▼), flat (text-flat –), stale (text-subtle + as-of tooltip)
  a11y      sr-only text "up 2.07 percent"; arrow glyph aria-hidden
  used on   everywhere
```

```
SignalBadge
  variants  strong-buy, buy, neutral, sell, strong-sell, unavailable
  tokens    signal-* text on up-soft / down-soft / surface-sunken; strong variants are 600 weight + a double chevron
  a11y      text label always; probability in the label when shown ("Buy, 61% up")
  used on   S01, S02, S06, S08, S13, M01
```

```
TrendPill
  variants  macd (bullish / bearish / neutral), ma-cross (golden / death / none), ma200 (up / down, with % from MA),
            volatility (low / medium / high, with %)
  tokens    like SignalBadge but outline (border + role text) to read as secondary to the signal
  used on   S02, S06
```

```
StatCard
  parts     2xs label, xl value, xs sub-line (source, rank, link)
  states    filled, loading, unavailable ("Not provided by source"), stale
  tokens    bg-surface border radius lg p-4 shadow-card
  used on   S06, S07
```

```
ProvenanceStrip
  parts     source name, cross-check status (agrees / diverged spread %), checked-at time (user timezone), methodology link
  states    fresh, stale (warning badge), diverged (warning banner)
  tokens    xs text-muted, status badges
  note      replaces the original's author/reviewer byline: say where the number came from and when, not who
  used on   S06, S07
```

```
PriceChart
  variants  line (default), candles, linear / log scale
  parts     range SegmentedControl (1D 1W 1M 3M 1Y 5Y All), History / Forecast toggle, forecast horizon chips,
            forecast band (chart-band fill) + midpoint (dashed chart-line), "today" divider, crosshair tooltip
  states    loading (skeleton block), filled, insufficient data (EmptyState inside frame), error
  tokens    line chart-line 2px; grid chart-grid; up/down candles use up/down roles; band 100% opaque chart-band (no alpha muddiness in dark)
  a11y      role=img with an aria-label summarising range and last value; a visually-hidden data table alternative
            (last 30 points) below; range buttons are a radiogroup
  lib       TradingView Lightweight Charts (web), react-native-wagmi-charts (mobile)
  used on   S06, S07
```

```
ScenarioChart
  parts     history line + bear / base / bull paths to the final year + shaded fan; legend with the assumptions
  tokens    base chart-line; bull up; bear down; fan chart-band
  a11y      same as PriceChart; the yearly table below is the accessible alternative
  used on   S06
```

```
TechnicalPulse
  parts     5 timeframe cards (5m 30m 1h 1d 1w) each with SignalBadge + vote counts; the selected card opens two
            tables (moving averages, oscillators: indicator, value, signal)
  states    card: default, selected, unavailable (not enough candles: explains why), loading
  a11y      the cards are a radiogroup controlling the tables region (aria-controls)
  used on   S06, S08
```

```
ForecastRangeTable
  variants  daily (14 sessions), weekly (4), monthly (12), yearly scenarios (2026-2036: bear / base / bull / avg ROI)
  tokens    DataTable plain; change column uses PriceChange; scenario rows labelled "scenario" not "forecast"
  used on   S06
```

```
MoversList
  parts     two columns (gainers / losers), 7 rows each, horizon SegmentedControl
  used on   S02
```

```
Calculator
  variants  scenario (amount + horizon -> upper / mid / lower), contributions / DCA (monthly + years -> bull / base / bear),
            converter (amount <-> asset)
  states    empty, computed, invalid input, data unavailable
  tokens    Card with Input + Select + Button; result rows tabular; assumptions in an xs text-muted note
  a11y      results region aria-live=polite; calculating on Enter
  used on   S06, S07
```

```
YearCard
  parts     year, theme line, bear / base / bull values, a short narrative
  used on   S06
```

```
Accordion (FAQ)
  states    collapsed, expanded, focus-visible
  a11y      Radix Accordion: buttons in headings, aria-expanded; works with no JS as <details>
  used on   S02, S06
```

```
AssetGridCard
  parts     AssetCell, current signal badge, "Open" affordance (the whole card is one link)
  used on   S05
```

## Commerce and account

```
PricingCard
  parts     plan name, price (xl) + "/mo", billed-yearly note, feature list with check icons, CTA Button,
            optional "Most popular" Badge
  states    default, highlighted (border-accent 2px), current plan (CTA disabled: "Current plan"), loading (checkout redirect)
  tokens    bg-surface border radius xl p-6 shadow-raised (highlighted)
  used on   S09, M05
```

```
BillingToggle
  SegmentedControl pill: Monthly / Yearly with a savings Badge
  used on   S09, M05
```

```
FeatureMatrix
  a real table; check icon (text-success) and cross (text-subtle) each with sr-only "Included" / "Not included"
  mobile    collapses to one plan per card with its feature list
  used on   S09
```

```
Paywall
  variants  inline row lock (table), section lock (asset page section), chip lock (market chip), full-screen (mobile M05)
  parts     lock icon, one-line reason ("Forex forecasts are on Pro"), CTA to pricing with the plan preselected
  states    guest (sign up), signed-in under-plan (upgrade), loading
  a11y      a real link or button, named for the plan it needs
  used on   S02, S06, S07, M05
```

```
AuthForm
  variants  sign in, sign up, forgot password, reset password
  parts     OAuth buttons (Google; Apple on iOS and also on web for parity), divider, Inputs, terms Checkbox (sign up), submit
  states    default, submitting (Button loading), field error, form error (Banner danger), success (check email)
  a11y      autocomplete attributes (email, current-password, new-password); errors summarised at top + per field;
            "Show password" button
  used on   S10, S11, S12, M06
```

```
AlertForm
  parts     asset (prefilled from context), condition Select (price above / below, signal becomes, forecast move),
            threshold Input or signal Select + timeframe, channels (email, push), cooldown
  states    default, invalid, plan-limit reached (Paywall inline), push permission denied (Banner with "Open settings")
  used on   S14, S06, M04
```

```
WatchlistRow / AlertRow
  WatchlistRow: AssetCell, price, PriceChange, SignalBadge, remove IconButton, drag handle (desktop), swipe-to-remove (mobile)
  AlertRow: asset, condition summary, channels, Switch (active), last fired, menu (edit, delete)
  used on   S13, S14, M03, M04
```

## Mobile-only

```
TabBar (M01-M04, M07)
  items     Signals, Watchlist, Alerts, Account; icon + label always
  tokens    bg-surface border-t; active text-accent; inactive text-muted; height 56 + safe area
  a11y      accessibilityRole="tab", selected state
```

```
AssetCard (list replacement for DataTable rows)
  parts     AssetCell, price + PriceChange, SignalBadge, chosen-horizon forecast; whole card pressable
  states    pressed (bg-surface-sunken), locked
```

```
PushPrompt
  a pre-permission explainer sheet before the OS dialog; "Not now" never re-asks within 7 days
```

## Rebuilt vs original

| kept (the system, users expect it) | changed (theirs) |
| --- | --- |
| forecast table with sticky header, sortable columns, column picker, pagination | header: brand-gradient bar → neutral surface; brand colour only on actions |
| market chips + signal-strength + volatility filters | 5 typefaces incl. display serif headlines → one sans + one mono |
| five-step signal scale with probability bands | indigo brand accent → neutral placeholder until /replica-brand |
| asset page section order (price → stats → chart → pulse → tables → scenarios → method → FAQ) | author/reviewer byline + reviewer portraits → ProvenanceStrip (source + time) |
| pill segmented controls, chip timeframes, stat cards | testimonial block, accuracy stat bar → measured track record (could) |
| pricing cards + feature matrix | chat widget and cookie bar overlapping content → none / non-blocking banner |
| | all copy, icons (open set: Lucide), illustrations, avatars |
