# Bugs

Found by `/replica-test` (plus BUG-008, found by the API tests during `/replica-backend`). Every bug below was
reproduced, has a test that failed before the fix and passes after it, and is fixed. Builds: local production build
(`next build && next start`), Chromium 141 (Playwright 1.56.1), 1440px and 390px.

| ID | severity | title | status |
| --- | --- | --- | --- |
| BUG-001 | S2 | Filters, tabs and sorting sometimes do nothing | fixed in e60811d |
| BUG-002 | S3 | Unknown asset page answers 200 instead of 404 | fixed in e60811d |
| BUG-003 | S3 | Signal badge probability text fails AA contrast | fixed in e60811d |
| BUG-004 | S3 | Price chart is an image wrapped around a focusable link | fixed in e60811d |
| BUG-005 | S3 | Sideways-scrolling tables can't be reached by keyboard | fixed in e60811d |
| BUG-006 | S4 | Alert on/off switch doesn't move until the server answers | fixed in e60811d |
| BUG-007 | S2 | Per-IP rate limits can be dodged with a forged X-Forwarded-For | fixed in e60811d |
| BUG-008 | S2 | Every DELETE route answered 500 | fixed in e80f07e |
| BUG-009 | S3 | Asset page claims a cross-check that doesn't exist | fixed in b6405c7 |
| BUG-010 | S3 | Search box collapses to 54px on phones | fixed in b6405c7 |
| BUG-011 | S4 | Price chart has no accessible name | fixed in b6405c7 |

By severity: S1 0 · S2 3 · S3 6 · S4 2. Open: 0.

---

### BUG-001: Filters, tabs and sorting sometimes do nothing

- Severity: S2
- Flow / case: F01 / F01-E3, F01-E4; F06 / F06-H1
- Screen: S02
- Build: 6290845  Browser / device: Chromium 141, 1440px

Steps
1. Sign in, open /forecasts and wait for it to finish loading.
2. Change the Signal filter, or click "Day trading", or click a column header.

Expected: the table updates and the URL gains the new parameter.
Actual: in about half of attempts nothing happens: the request for the new page returns 200, then the router drops it
and never commits the navigation (measured 5 of 10 stuck).
Evidence: e2e F01-E4 failed 5/5, F06-H1 2/5; probe with `history.replaceState` instrumentation showed no commit on
stuck runs; 20/20 succeed after the fix.
Suspected cause: the `loading.tsx` Suspense boundary on these dynamic routes. Removing `forecasts/loading.tsx` and
`assets/[slug]/loading.tsx` fixed it. Pages render in about 100 ms, so the skeletons weren't needed.
Status: fixed in e60811d

### BUG-002: Unknown asset page answers 200 instead of 404

- Severity: S3
- Flow / case: F02 / F02-N1
- Screen: S06
- Build: 6290845  Browser / device: Chromium 141, 1440px

Steps
1. Open /assets/not-a-coin.

Expected: the not-found page with HTTP status 404.
Actual: the not-found page with HTTP status 200 (the loading boundary had already started streaming a 200).
Evidence: e2e F02-N1 (`Expected: 404, Received: 200`).
Status: fixed in e60811d (same change as BUG-001)

### BUG-003: Signal badge probability text fails AA contrast

- Severity: S3
- Flow / case: X-1 (accessibility) / F01-H1
- Screen: S02, S03
- Build: 6290845  Browser / device: Chromium 141, 1440px

Steps
1. Open /forecasts and look at a "Buy · 61% up" badge.

Expected: every text pair at least 4.5:1 (the tokens pass at 4.71:1).
Actual: the "· 61% up" part used `opacity-90`, which pushed it below 4.5:1. axe: `color-contrast`, 5 nodes.
Evidence: e2e F01-H1 axe scan on /forecasts and the columns dialog.
Status: fixed in e60811d (opacity removed; contrast stays in the tokens)

### BUG-004: Price chart is an image wrapped around a focusable link

- Severity: S3
- Flow / case: X-1 / F02-H1
- Screen: S06, S07
- Build: 6290845  Browser / device: Chromium 141, 1440px and 390px, light and dark

Steps
1. Open /assets/bitcoin with a screen reader or keyboard.

Expected: the chart is described, and the chart library's attribution link is reachable normally.
Actual: the chart host had `role="img"`, but the library puts a focusable attribution link inside it. axe:
`nested-interactive`.
Evidence: e2e axe scans on /assets/bitcoin, /assets/bitcoin/live, mobile and dark.
Status: fixed in e60811d (a `figure` described by the text summary instead)

### BUG-005: Sideways-scrolling tables can't be reached by keyboard

- Severity: S3
- Flow / case: X-1 / F02-E4
- Screen: S06 (and every wide table at phone width)
- Build: 6290845  Browser / device: Chromium 141, 390px

Steps
1. At 390px, open /assets/bitcoin and try to scroll the forecast tables sideways with the keyboard.

Expected: the scroll area can take focus and scroll with the arrow keys.
Actual: it couldn't. axe: `scrollable-region-focusable`, 4 nodes.
Evidence: e2e F02-E4 @mobile.
Status: fixed in e60811d (scroll areas are focusable, named regions)

### BUG-006: Alert on/off switch doesn't move until the server answers

- Severity: S4
- Flow / case: F05 / F05-E2
- Screen: S14
- Build: 6290845  Browser / device: Chromium 141, 1440px

Steps
1. Open /alerts with at least one alert and click its Active switch.

Expected: the switch moves at once.
Actual: it stayed put until the request and page refresh finished, so it looked unresponsive.
Evidence: e2e F05-E2 (`Clicking the checkbox did not change its state`).
Status: fixed in e60811d (optimistic state, rolled back with a message if the request fails)

### BUG-007: Per-IP rate limits can be dodged with a forged X-Forwarded-For

- Severity: S2 (a protection broken; the per-email limits still held, and only owner emails can sign up)
- Flow / case: F03 / rate limits
- Screen: API (/api/auth/*)
- Build: 6290845  Browser / device: API client against `next dev`

Steps
1. Send seven sign-up requests, each with a different made-up `X-Forwarded-For` value.

Expected: the sixth or seventh is refused with 429 (5 sign-ups per hour per address).
Actual: all seven went through (403 each, never 429): the app trusted a header any client can set.
Evidence: `npm run test:api` check "a forged X-Forwarded-For can't dodge the per-IP sign-up limit" failed with
`statuses: 403,403,403,403,403,403,403`.
Status: fixed in e60811d (forwarding headers trusted only on Vercel or with `TRUST_PROXY_HEADERS=true`)

### BUG-008: Every DELETE route answered 500

- Severity: S2
- Flow / case: F04 / F04-E2, F05 / F05-E2, A-H2
- Screen: S13, S14, S15 (API)
- Build: 34646e5  Browser / device: API client

Steps
1. Remove a watchlist item, delete an alert, or delete the account.

Expected: 204, item gone.
Actual: the item was removed, then the route crashed building a 204 response with a JSON body and answered 500,
so the UI showed an error toast for a change that had worked.
Evidence: `npm run test:api` "deleting an account removes all of its rows" (`500 !== 204`).
Status: fixed in e80f07e

### BUG-009: Asset page claims a cross-check that doesn't exist

- Severity: S3
- Flow / case: M-1 (manual) / F02
- Screen: S06, S07, S08
- Build: e60811d  Browser / device: Chromium 141, 1440px, live data

Steps
1. Open /assets/eurusd or /assets/gold.

Expected: no cross-check claim (only crypto has a second source).
Actual: "Cross-check: agrees within 0.00%".
Evidence: manual pass M-1; regression test BUG-009 in e2e/f02-asset.spec.ts.
Status: fixed in b6405c7 ("Cross-check: none for this source"; crypto names its source)

### BUG-010: Search box collapses to 54px on phones

- Severity: S3
- Flow / case: M-4 (manual) / F01-E5
- Screen: S02 at 390px
- Build: e60811d  Browser / device: Chromium 141, 390px, dark

Steps
1. Open /forecasts at 390px wide.

Expected: a full-width search box above the filters.
Actual: the search box was 54px wide and overlapped the Signal dropdown.
Evidence: manual screenshot; regression test BUG-010 @mobile (`Received: 54`).
Suspected cause: `basis-56` isn't on the token spacing scale, so it generated nothing. The same scan found two more
off-scale classes that silently did nothing (heading scroll margin under the sticky header, watchlist row basis).
Status: fixed in b6405c7

### BUG-011: Price chart has no accessible name

- Severity: S4
- Flow / case: M-5 (manual)
- Screen: S06, S07
- Build: e60811d  Browser / device: Chromium 141, accessibility tree

Steps
1. Inspect the chart in the accessibility tree.

Expected: a named figure ("Bitcoin price chart") with its description.
Actual: an unnamed figure.
Evidence: manual pass M-5 (`- figure`); regression test BUG-011.
Status: fixed in b6405c7

---

## Test-harness findings (not app bugs)

- Playwright's context-wide `extraHTTPHeaders` breaks Next.js client-side navigation; per-test client addresses are
  sent only on direct API calls now.
- `networkidle` never settles on pages that refresh streamed responses; tests wait for visible results instead.
- The e2e build overwrote a running dev server's `.next`; e2e now builds into `.next-e2e`.

## To check (not reproduced, can't be from here)

- Binance's market-data host from Vercel's default region. If it's refused, set `"regions": ["fra1"]` (backend.md).
- Real email delivery through Resend with the owner's key (manual case M-3).
- The pooled Supabase/Neon connection string with `prepare: false`; tested only against local Postgres 16.
- The first page load on a fresh database fetches all live history (about 7 s) with no skeleton now that the loading
  boundaries are gone. A per-section Suspense boundary inside the page would bring the skeleton back without BUG-001.
