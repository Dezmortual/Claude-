# Deploy checklist: Proofcast (private build) on Netlify

- **Date:** 2026-10-22
- **Commit:** the one that adds this file, on `claude/install-replica-skills-4jsrht`. The checks below ran
  on that commit's code.
- **Go from user:** **not yet**. Every account step below is yours: Claude doesn't create accounts, buy
  domains or handle keys.

## Preflight (all must pass)

- [x] **e2e suite green:** 66 passed of 66 (2 setup, 60 desktop at 1440px, 4 mobile at 390px), with axe
  on every screen, on a production build. Run: `cd apps/web && npx playwright test`.
- [x] **API tests:** 13 of 13 (`npm run test:api`), including the second-user isolation checks.
- [x] **No open S1 or S2 bugs.** `replica/bugs.md` lists S1 0, S2 3, S3 6, S4 2, and open 0.
- [x] **Parity:** all must-haves done (20 of 20), feature score 89.5 (`parity.py`).
- [x] **Rebrand sweep clean.** `sweep.py . --config replica/brand.json` said "Clean" and exited 0.
- [x] **Store listing passes:** `listing.py` exited 0 with 0 warnings. It doesn't ship yet, because there's
  no phone app.
- [x] **Production build passes.** `npm run build` (Next 15.5.27): 30 routes plus middleware, no errors.
- [x] **Migrations from an empty database** in one production-style run: `0001_init.sql` applied, 60
  assets and 4 plans seeded, and a second run said "up to date". The scratch database was dropped
  afterwards.
- [x] **Privacy policy and terms are live** (`/legal/privacy`, `/legal/terms`), and every processor is
  listed: Netlify, the Postgres provider and Resend. Market-data providers get no personal data.
  - **Note:** the text is placeholder structure. That's fine while you are the only user. It must be
    written properly, with a lawyer, before anyone else signs in (see `launch/launch-plan.md`).
- [x] **Account deletion works:** e2e A-H2 and the API test "deleting an account removes all of its
  rows".
- [x] **Favicon, titles, OG image, emails and app icon are yours.**
  - The favicon is a temporary plum "P" (`src/app/icon.svg`), checked by eye at 16 to 128px.
  - Titles say Proofcast, and the email sender is "Proofcast".
  - There's no OG image (the site is `noindex` while private) and no app icon (no phone app). Both are in
    the logo brief.
- [x] **No cookie banner needed.** The only cookies are the session cookie and the theme setting, both
  essential. There's no analytics yet.

Result: **preflight passes.**

## Production

- [ ] **A separate production database, with backups.** You do this.
  1. Neon (free): create a **new project** called `proofcast-prod`. Never reuse the dev database.
  2. Copy two connection strings:
     - **pooled** (host contains `-pooler`) goes in `DATABASE_URL`
     - **direct** goes in `DATABASE_URL_DIRECT`
  3. Check what history and restore the free plan keeps (Neon: Settings, then Storage or Backup). Keep
     your own copy now and then with `pg_dump "$DATABASE_URL_DIRECT" > proofcast-$(date +%F).sql`.
     Losing the database loses the track record.
- [x] **Migrations run in the deploy, not by hand.** In `netlify.toml`, `[context.production]` runs
  `npm run db:setup` (migrations, then the idempotent seed) on `DATABASE_URL_DIRECT` before
  `npm run build`. Deploy previews and branch deploys only build.
- [ ] **Env vars set in Netlify.** You do this. Go to Site configuration, then Environment variables. Set
  the **scopes** as below, because variables in `netlify.toml` reach the build only.

  | name | value | scopes | deploy contexts |
  | --- | --- | --- | --- |
  | `DATABASE_URL` | Neon **pooled** string | Builds, Functions | Production only |
  | `DATABASE_URL_DIRECT` | Neon **direct** string | Builds | Production only |
  | `OWNER_EMAILS` | your email | Functions | all |
  | `PRIVATE_MODE` | `true` | Functions | all |
  | `NETLIFY` | `true` | Functions | all |
  | `APP_URL` | `https://<your-site>.netlify.app` (or your domain later) | Builds, Functions | Production |
  | `CRON_SECRET` | output of `openssl rand -base64 32` | Functions | Production only |
  | `RESEND_API_KEY` | your Resend key | Functions | Production only |
  | `EMAIL_FROM` | `Proofcast <onboarding@resend.dev>` until a domain is verified | Functions | all |
  | `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY` | optional: real stock and ETF prices | Functions | Production |

  Leave unset: `TRUST_PROXY_HEADERS`, `MARKET_DATA`, `EMAIL_OUTBOX` and `PUBLIC_LANDING` (the landing page
  stays private). If an edge function can't read an env var, the middleware falls back to private, and
  the server checks the session again either way.
- [ ] **Deploy previews and branch deploys off.** You do this. Go to Site configuration, then Build &
  deploy, then Branches and deploy contexts, and choose "None" for both. That way a branch can't reach
  production data. (The database variables are also production-only, as above.)
- [x] **Stripe:** n/a. The private build takes no payments.
- [x] **OAuth:** n/a. There's no Google or Apple sign-in in this build.
- [ ] **Email.** Without a domain, Resend sends only to the address that owns the Resend account. Use
  your owner email there, and the owner-only app works as is. Add a domain later (see below).

## Host

You do these steps:
1. Netlify, then **Add new site**, then **Import an existing project**, then GitHub, then this repo.
2. Pick the branch to deploy: `main` once this branch is merged, or `claude/install-replica-skills-4jsrht`
   to try it first. The base directory, build command and Node version come from `netlify.toml`, so leave
   those fields as they are.
3. Add the env vars above **before** the first deploy, so the production build can run its migrations.
4. Deploy. In the deploy log, look for "applied 0001_init.sql" (first time) or "migrations up to date",
   then the Next.js build. Netlify's Next.js adapter is added for you.
5. GitHub repo, then Settings, then Secrets and variables, then Actions. Add `APP_URL` (the site URL) and
   `CRON_SECRET` (the same value as in Netlify).
6. Actions, then **forecast-jobs**, then **Run workflow**, with job `ingest`. That fills the price history
   once, so the first page loads don't hit Netlify's function time limit. Then run it again with an empty
   job to check health, alerts and publish.
7. Open `https://<your-site>.netlify.app`. Choose "Set up the owner account", confirm the emailed link,
   and sign in.

## Domain (optional for a private app)

`<your-site>.netlify.app` works with HTTPS from the start. If you buy a domain, use any registrar.

Use `www` as the primary domain, as Netlify recommends with external DNS. Values from Netlify's
external-DNS docs, read 2026-10-22:

| record | name | value |
| --- | --- | --- |
| ALIAS, ANAME or flattened CNAME (preferred) | `@` | `apex-loadbalancer.netlify.com` |
| A (only if your DNS can't do the above) | `@` | `75.2.60.5` |
| CNAME | `www` | `<your-site>.netlify.app` |

Then:
- In Netlify, go to Domain management. Add the domain, set `www` as primary (the apex redirects to it),
  and wait for the certificate to show as issued.
- Update `APP_URL` in Netlify and in the GitHub secret, then redeploy.

Email DNS, once you add the domain to Resend (copy the exact values from Resend's domain page; these are
the shapes):

| record | name | value |
| --- | --- | --- |
| MX | `send` | Resend's feedback host, priority 10 |
| TXT (SPF) | `send` | `v=spf1 include:amazonses.com ~all` (use Resend's exact text) |
| TXT (DKIM) | `resend._domainkey` | the public key Resend shows |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:you@yourdomain` |

Tighten DMARC to `p=quarantine` once two weeks of reports are clean. Then set
`EMAIL_FROM=Proofcast <alerts@yourdomain>`.

Checklist once a domain exists:
- [ ] apex (ALIAS) and `www` (CNAME) set
- [ ] SPF, DKIM and DMARC set
- [ ] `www` canonical, apex redirects
- [ ] HTTPS valid

## Watch

- [x] **Uptime.** Every 30-minute run of the `forecast-jobs` workflow now checks the sign-in page first,
  then the job endpoints. Any failure fails the run, and GitHub emails the repo owner by default. Check
  that Settings, then Notifications, then Actions says "failed workflows only".
- [ ] **Errors.**
  - Netlify, then Logs, then Functions, shows server errors. The free plan keeps them for a short time.
  - The `job_runs` table records every scheduled run with its error.
  - For alerts on errors, add Sentry's free tier later, and list it in the privacy policy.
- [x] **Analytics:** none, by choice, in a private build.
- [ ] **Core flow on the live site**, done by you on desktop **and** on your phone:
  1. Sign in.
  2. Forecasts, then filter to Crypto, then open Bitcoin.
  3. Check that the source line says Binance with a recent "Checked" time, which proves Netlify's
     region reaches Binance.
  4. Star it, then set an alert.
  5. Open Track record.
  6. Sign out.

## First week

1. **Day 1.**
   - Check the deploy log shows the migrations ran.
   - Check the first `forecast-jobs` runs are green (Actions tab).
   - Check the asset page's source line isn't stale.
2. **Days 1 and 2.** Look for function timeouts in Netlify's function logs ("Task timed out after 10
   seconds"). If the `ingest` or `publish` job shows them, tell me. Splitting the job is the fix.
3. **Day 2.** `/track-record` shows the first scored next-day forecasts. They should be coming in every
   hour.
4. **Every few days.** Check database size against Neon's free limit. Price bars are trimmed to a fixed
   count per series, so growth should come from the scored forecasts only.
5. **End of the week.**
   - Take a `pg_dump`.
   - Check GitHub Actions minutes: about 1,440 a month at this schedule, within the 2,000 free.

## Mobile

Not applicable: there's no phone app yet. The store listing is ready in `launch/listing.json` for when
there is one.

## Live URL

Not live yet. It goes live when you've done the steps above and given the go. Then add the URL here and
in `APP_URL`.
