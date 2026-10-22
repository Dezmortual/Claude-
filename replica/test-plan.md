# Test plan: forecast app (private build)

Build: see the commit that last updated this file. Env: local production build (`next build && next start`, port 3100),
Postgres `forecast_test`, `MARKET_DATA=demo` (deterministic, no network), `EMAIL_OUTBOX=true`.
Owner accounts are created by the e2e setup. Live market data is covered separately by `npm run test:api` and the
manual pass.

Flows come from `replica/recon.md`, adapted to the private, owner-only build: F03 (sign up and subscribe) becomes
owner account setup, F07 (paywall) becomes the private-access gate, F09 (mobile app) is not applicable until the app
exists. Account management (A) is added because the backend introduced it.

Every e2e test also fails on any console error, any 5xx response, and any axe accessibility violation (WCAG 2.1 A/AA)
on the screens it visits. Specs live in `apps/web/e2e/`, one per flow; desktop runs at 1440px, the `mobile` project
re-runs the specs tagged `@mobile` at 390px.

`auto`: e2e = Playwright, api = `tests/api.test.mts`, manual = manual pass below.

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | find a strong signal | happy | open /forecasts, pick Crypto, filter signal, open first asset | table filters in place, asset page opens with its forecast | e2e || pass |
| F01-E1 | | edge: no results | search "zzzz" | empty state with a working "Clear filters" | e2e || pass |
| F01-E2 | | edge: emoji, accents, long input | search "₿ Ünïcødé 🚀" and a 200-char string | no error; input capped at 60 chars; empty state | e2e || pass |
| F01-E3 | | edge: sort and paginate | sort by 7-day, change rows per page, go to page 2, back button | order changes; page 2 rows differ; back returns to page 1 | e2e || pass (after BUG-001) |
| F01-E4 | | edge: keyboard only | Tab to the signal filter, change it with arrows | URL updates, focus stays on the select | e2e || pass (after BUG-001) |
| F01-E5 | | edge: mobile width | open /forecasts at 390px | card list instead of table, no horizontal scroll | e2e @mobile || pass |
| F01-E6 | | edge: refresh mid-flow | apply filters, reload | same filters and results | e2e || pass |
| F02-H1 | read an outlook and size a position | happy | open /assets/bitcoin, run the calculator with 1000 | three results, low < mid < high | e2e || pass |
| F02-E1 | | edge: invalid amount | "12,5x", empty, "-5", "🚀" | inline error, no results, no crash | e2e || pass |
| F02-E2 | | edge: chart range | switch 3M → 1Y → 1D | chart reloads without errors | e2e || pass |
| F02-E3 | | edge: market without intraday data | open /assets/eurusd/signals (demo) and a pulse timeframe without bars | "not enough history" state, not an error | e2e || pass |
| F02-N1 | | negative: unknown asset | open /assets/not-a-coin | 404 page with a way back | e2e || pass (after BUG-002) |
| F02-E4 | | edge: mobile width | asset page at 390px | stacked layout, no horizontal scroll | e2e @mobile || pass (after BUG-005) |
| F03-H1 | set up the owner account | happy | sign up with an owner email, open the emailed link, sign in | "check your email", then "Email confirmed", then signed in | e2e || pass |
| F03-E1 | | edge: name with emoji and accents, 80 chars | sign up with such a name | account created, name shown on /account | e2e || pass |
| F03-E2 | | edge: double click on submit | double click "Create account" | one account, one success message | e2e || pass |
| F03-E3 | | edge: link used twice | open the verify link again | "already used" message | e2e || pass |
| F03-N1 | | negative: not the owner | sign up with another email | "sign-ups are closed", no account | e2e || pass |
| F03-N2 | | negative: wrong password | sign in with a wrong password | generic "don't match" error, still signed out | e2e || pass |
| F03-N3 | | negative: unverified | sign in before confirming | asked to confirm, new link sent | e2e || pass |
| F03-N4 | | negative: password reset | forgot → link → new password → old session gone | reset works once, other sessions signed out | e2e + api || pass |
| F03-N5 | | negative: mismatched or short password | sign up with 7 chars / different confirm | inline errors, nothing sent | e2e || pass |
| F04-H1 | watch an asset | happy | star Bitcoin on its page, open /watchlist | Bitcoin listed with price and signal | e2e || pass |
| F04-E1 | | edge: double click the star | double click Watch | one item, consistent state | e2e || pass |
| F04-E2 | | edge: two tabs | add in tab 1, remove in tab 2, refresh tab 1 | tab 1 shows the removal | e2e || pass |
| F04-E3 | | edge: second user's data | owner B opens /watchlist | sees none of A's items | e2e + api || pass |
| F04-E4 | | edge: empty watchlist | open /watchlist with nothing on it | empty state with a link to forecasts | e2e || pass |
| F05-H1 | set an alert | happy | create "price above" alert from an asset page | alert listed, active | e2e || pass |
| F05-E1 | | edge: signal alert | create "signal turns strong buy, 1 day" | listed with a readable description | e2e || pass |
| F05-E2 | | edge: pause, resume, delete | toggle Active, delete | state persists after reload; delete removes it | e2e || pass (after BUG-006) |
| F05-N1 | | negative: invalid threshold | -5, empty, letters | inline error, nothing saved | e2e || pass |
| F05-E3 | | edge: fires once, emails once | price condition true, run the job twice | one event, one email | api (job test) + manual || pass (job test + M-2) |
| F05-E4 | | edge: second user's alerts | B lists, patches, deletes A's alert | nothing visible, nothing changed | api || pass (api) |
| F06-H1 | check an intraday signal | happy | Day trading tab, open an asset's signals, pick 1 hour | indicator tables for that timeframe | e2e || pass (after BUG-001) |
| F07-H1 | private gate | happy | as a guest open /, /forecasts, /assets/bitcoin, /alerts | redirected to sign-in, `next` kept | e2e || pass |
| F07-N1 | | negative: API as guest | GET /api/v1/forecasts, /api/v1/me/alerts | 401 | e2e + api || pass |
| F07-N2 | | negative: open redirect | sign in with next=//evil.example | lands on /forecasts, never off-site | e2e || pass |
| F07-E1 | | edge: expired or deleted session | delete the session server-side, reload | back to sign-in | e2e || pass |
| F07-E2 | | edge: pricing hidden | owner opens /pricing | redirected to /account | e2e || pass |
| F08-H1 | customise columns | happy | open Columns, turn on 1 year, Done | column appears, persists after reload | e2e || pass |
| F08-E1 | | edge: reset and Escape | Reset then Escape | dialog closes, nothing saved | e2e || pass |
| F08-E2 | | edge: last column | try to turn every column off | at least one stays on | e2e || pass |
| F09 | mobile app: alert push opens the asset | n/a | the app isn't built | n/a | n/a | n/a |
| A-H1 | account | happy | change name and time zone, save, reload | saved; times shown in the new zone | e2e || pass |
| A-E1 | | edge: sign out everywhere | two browser contexts signed in, sign out everywhere in one | the other is signed out on next request | e2e || pass |
| A-N1 | | negative: delete with wrong confirmation | type a different email | error, account kept | e2e || pass |
| A-H2 | | delete account | type own email, delete | signed out, cannot sign in, data gone | e2e + api || pass |
| L-N1 | landing page | negative: private build | guest opens /welcome | redirected to sign-in | e2e || pass |
| L-H1 | | happy: owner preview | owner opens /welcome | preview note, every section, screenshot loads, axe clean | e2e || pass |
| L-E1 | | edge: mobile width | /welcome at 390px | no sideways scroll, axe clean | e2e @mobile || pass |
| L-E2 | | edge: public mode | PUBLIC_LANDING=true: guest opens /, /welcome, /forecasts | / → /welcome, 200, /forecasts → sign-in, robots index | manual || pass |
| X-1 | all screens | accessibility | axe on every screen visited | 0 violations | e2e || pass (after BUG-003/004/005) |
| X-2 | all screens | dark mode | toggle theme on each main screen | readable, no contrast failures (axe) | e2e || pass |

## Manual pass

| case | what | why manual | result |
| --- | --- | --- | --- |
| M-1 | live prices: Binance, ECB, CoinPaprika cross-check render on asset pages | external APIs; e2e runs on demo data || pass |
| M-2 | alert job against live prices sends one email (outbox) | needs the job runner and live data || pass |
| M-3 | real email delivery through Resend | needs the owner's Resend key | owner to check after setup |
| M-4 | visual pass of every screen, light and dark, 1440 and 390 | glitches axe can't see || pass |
| M-5 | screen reader labels on the forecast table and charts | spot check of names and roles || pass |

## Regression tests added for bugs

| case | bug | where |
| --- | --- | --- |
| R-009 | BUG-009 cross-check claim | e2e/f02-asset.spec.ts |
| R-010 | BUG-010 phone search box | e2e/f01-find-signal.spec.ts @mobile |
| R-011 | BUG-011 chart name | e2e/f02-asset.spec.ts |
| R-007 | BUG-007 forged X-Forwarded-For | tests/api.test.mts |

## Last run

- e2e: 63 tests (2 setup, 58 desktop at 1440px, 3 mobile at 390px): **63 passed, 0 failed, 0 flaky**, 118 s,
  production build on `forecast_test`. Run: `cd apps/web && npx playwright test`.
- API: **13 of 13 passed** against `next dev` on the dev database. Run: `npm run test:api` (see replica/backend.md).
- Manual: M-1, M-2, M-4, M-5 done; M-3 waits for the owner's Resend key.
