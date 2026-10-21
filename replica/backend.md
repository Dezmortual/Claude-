# Backend

Private, owner-only build: the whole app sits behind sign-in, only the address(es) in `OWNER_EMAILS` can create
an account, and the owner gets every market and feature with no payments. Code: `apps/web`. Everything runs on
free tiers.

## What's in place

| area | how |
| --- | --- |
| database | Postgres via `DATABASE_URL`; `db/migrations/0001_init.sql`, `npm run db:migrate`, `npm run db:seed` (asset catalogue and plans, safe to rerun) |
| access rules | RLS enabled on every table with **no policies** (also closes Supabase's auto REST API); the app connects as table owner and every user-owned query is scoped by user id in `src/lib/data/live.ts`. Tested with a second user (below) |
| auth | email + password (scrypt), email verification (single-use link, 24 h), password reset (single-use, 1 h, signs out every device), http-only `secure` `SameSite=Lax` session cookie holding a random token; only its SHA-256 is stored. Sign out, sign out everywhere, account deletion that cascades |
| owner-only | `PRIVATE_MODE=true`: middleware + root layout redirect anyone who isn't the signed-in owner to `/sign-in`; every `/api/v1` route returns 401 without the owner's session; sign-up and sign-in refuse other emails |
| market data | Binance public market data (crypto, every timeframe), ECB reference rates via Frankfurter (forex, daily only), Alpaca with your own keys (stocks/ETFs, optional), CoinPaprika as the crypto cross-check. All official public APIs; no keys except Alpaca. Bars cached in `price_bars`, tails refreshed on demand. Commodities, indices and bonds have no free official source and stay on the demo series, marked **Demo** |
| jobs | `/api/cron/{ingest,publish,alerts,cleanup}` behind `CRON_SECRET`. GitHub Actions (`.github/workflows/forecast-jobs.yml`) every 30 min: alerts every run, publish + score hourly. Vercel Cron: daily cleanup. Every run is logged in `job_runs`; failures stay there (dead-letter log) and alert emails retry up to 5 times |
| forecasts | each hourly publish locks the next-day/7-day/1-month forecasts of every live asset; scoring compares them with the bar that closes at the target time. `/track-record` shows hit rate, range coverage and median error by market and horizon. Demo assets are never published or scored |
| email | Resend (plain text, templates written fresh). Without a key in development, mail goes to `apps/web/.data/outbox/` |
| payments | **none**: the private build takes no payments, so no Stripe. Plans and the subscriptions table are kept in the schema for a future public build |

## Set it up (about 20 minutes, all free)

You create every account and key; nothing here signs up for anything on your behalf.

1. **Postgres.** Create a free project on Neon (scales to zero, nothing to pause) or Supabase (free projects pause
   after a week without traffic). Copy the connection string; on Vercel use the pooled one.
2. **Email.** Create a free Resend account **with the same email you'll use as the owner**. Without a verified
   domain Resend only delivers to that address, which is exactly what an owner-only app needs. Create an API key.
3. **Secrets.** Generate `CRON_SECRET` with `openssl rand -base64 32`.
4. **Local run.** In `apps/web`: copy `.env.example` to `.env.local`, fill in `DATABASE_URL`, `OWNER_EMAILS`
   (your email), `RESEND_API_KEY`, `CRON_SECRET`, then `npm install && npm run db:setup && npm run dev`.
   Open http://localhost:3000, choose "Set up the owner account", confirm the emailed link, sign in.
5. **Deploy.** Vercel (Hobby) → import the repo → root directory `apps/web` → add the same env vars, with
   `APP_URL` set to the deployment URL. Run `npm run db:setup` once against the production `DATABASE_URL`.
6. **Schedule.** GitHub repo → Settings → Secrets and variables → Actions → add `APP_URL` and `CRON_SECRET`.
   Run the `forecast-jobs` workflow once by hand to check it.
7. **Optional.** Free Alpaca account → paper-trading API keys → `ALPACA_KEY_ID` / `ALPACA_SECRET_KEY` for real
   stock and ETF prices, then `npm run db:seed` again.

Watch-outs:
- If Vercel's region can't reach Binance's market-data host, pin functions to a European region
  (`"regions": ["fra1"]` in `vercel.json`).
- GitHub's free minutes for private repos (2,000 a month) cover the 30-minute schedule, about 1,440 a month.
  Don't make it more frequent without checking.
- **Backups:** free tiers keep little or no history. Check your provider's backup page, and keep your own copy
  with `pg_dump "$DATABASE_URL" > backup.sql` now and then. Losing it would cost the track record.

## Tests

`npm run test:api` (server running with `OWNER_EMAILS` including `a@test.example,b@test.example`, plus
`EMAIL_OUTBOX=true` for a production build) checks, against the real database:
second user sees none of the first's watchlist, alerts, events or preferences; cannot change or delete the
first user's alert or watchlist; guests get 401 everywhere; invalid input gets 422; strangers can't sign up;
sign-in rate limit returns 429; verification and reset links work once; a reset ends every session; forgot-password
gives the same answer for unknown emails; account deletion removes every row. Last run: 12 of 12 passing, twice, on
the production build.

The jobs were run by hand against live data: an alert fired once, emailed once, and stayed quiet on the next run;
publish stored 126 forecasts; scoring graded matured ones (test rows were deleted afterwards).

## Integrations

| integration | API | scopes / keys | review | limits |
| --- | --- | --- | --- | --- |
| Binance market data | `data-api.binance.vision` public REST | none | none | request-weight limits; we fetch only stale tails, 6 requests at a time, with backoff |
| ECB rates | Frankfurter `api.frankfurter.dev` | none | none | one rate per working day |
| CoinPaprika | `api.coinpaprika.com/v1/tickers` | none | none | free tier; one call every 2 minutes at most |
| Alpaca (optional) | `data.alpaca.markets/v2` | your API key pair | none | free plan: IEX feed only, 200 requests/min |
| Resend | `api.resend.com/emails` | your API key | domain verification only if you send to other addresses | 100 emails/day free |
| Google sign-in | not built | n/a | Google's consent-screen review applies only to a public app | n/a |

## Security checklist

- [x] secrets only in env vars; `.env*.local` gitignored; no `process.env` or `lib/server` import in any client component (checked)
- [x] input validated on the server with zod on every route that takes input
- [x] authorisation checked on every read and write, tested with a second user
- [x] rate limits on sign-in (per IP and per email), sign-up, password reset, resend-verification
- [x] webhooks verify signatures: no inbound webhooks in this build; the cron endpoint checks `CRON_SECRET` in constant time
- [x] uploads: none
- [x] no user data in URLs or logs: emails are hashed in rate-limit keys and masked in dev logs; the only URL tokens are single-use, expiring email links
- [x] dependencies audited: `npm audit` 0 vulnerabilities (Next's bundled PostCSS pinned to 8.5.29 with an override)
- [x] privacy policy lists every processor (Vercel, the Postgres provider, Resend; market-data providers receive no personal data)
- [ ] **you:** confirm backups with your Postgres provider (see above)

Not done, by choice for a private build: Google/Apple sign-in, Stripe, push notifications (with the mobile app).
