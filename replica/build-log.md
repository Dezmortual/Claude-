# Build log

App: `apps/web` (Next.js 15, React 19, Tailwind on the replica-design preset). Data layer: `src/lib/data/fake.ts`,
deterministic demo series + a conditional-quantile baseline model + a JSON-file user store, behind the exports
/replica-backend implements on Supabase. Every data surface carries a "Demo data" badge.

Checked on every screen: 1440px and 390px with no horizontal overflow and no console errors (production build),
screenshots in `replica/clone-screens/`. Browser scripts cover the slice (sign up → forecasts → asset → checkout →
watch → watchlist), the account flows, and a keyboard-only run of the core loop.

| ID | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| shell | 2026-10-21 | done | n/a | Preset replaces Tailwind's spacing scale, so non-token sizes (h-72, h-3.5) silently do nothing; chart heights added to the tokens |
| S01 home | 2026-10-21 | done | n/a | n/a |
| S02 forecast hub | 2026-10-21 | done | n/a | `sr-only` text inside horizontal scrollers escaped the clip and widened the page on mobile; every scroller is now `relative`. Select auto-submit lost keyboard focus; filters now apply through the client router |
| S03 column picker | 2026-10-21 | done | n/a | n/a |
| S04 market overview | 2026-10-21 | done | n/a | n/a |
| S05 asset directory | 2026-10-21 | done | n/a | n/a |
| S06 asset forecast | 2026-10-21 | done | halving section, year narrative cards, support/resistance text (could/should rows) | Chart band drawn with two area series; demo series needed mean reversion or "all-time highs" were 10x today |
| S07 live price | 2026-10-21 | done | n/a | n/a |
| S08 signals | 2026-10-21 | done | n/a | n/a |
| S09 pricing | 2026-10-21 | done | final prices (/replica-launch) | n/a |
| S10 sign in | 2026-10-21 | partial | Google sign-in | n/a |
| S11 sign up | 2026-10-21 | partial | Google sign-in | n/a |
| S12 forgot password | 2026-10-21 | partial | email send + reset page (backend) | n/a |
| S13 watchlist | 2026-10-21 | done | n/a | n/a |
| S14 alerts | 2026-10-21 | partial | evaluation + delivery (worker) | n/a |
| S15 account | 2026-10-21 | done | email change (backend) | n/a |
| S16 checkout | 2026-10-21 | partial | Stripe; this is a labelled demo, nothing charged | n/a |
| S17 legal | 2026-10-21 | partial | final wording, reviewed by a lawyer | n/a |
| track record | 2026-10-21 | partial | real scored forecasts (worker + time) | n/a |
| M01-M07 mobile | n/a | not started | the whole Expo app | **Bigger than it looked**: a second client with its own navigation, push and store billing. The API it needs exists |

Decisions worth knowing:
- Accuracy is never claimed: the hub, asset pages and home all point to the track record, which stays empty until real forecasts are scored.
- Locked data is filtered on the server and never sent blurred.
- The pricing FAQ originally promised a 14-day refund; removed, since refunds are a business decision for the terms.
- Plan prices are drafts ($15 / $39 / $79 a month, 20% off yearly), set in `src/lib/data/catalogue.ts`.
