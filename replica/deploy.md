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
- [ ] **Env vars set in Netlify.** You do this. The phone steps below use default scopes, which is fine
  with previews off. The table shows the tighter setup if you want it. Variables in `netlify.toml` reach
  the build only.

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

## Host: step by step from a phone

All of this works in a phone browser. If a Netlify page looks cramped, use the browser's "Request desktop site".

1. **Neon** (neon.tech, sign in with GitHub).
   - New project: name it `proofcast-prod`, region **AWS US East 2 (Ohio)**. That's next to Netlify's default
     functions region.
   - Open **Connect**. Copy the connection string with **Connection pooling on**: that's `DATABASE_URL`.
   - Turn pooling **off** and copy again: that's `DATABASE_URL_DIRECT`.
   - Keep both in your phone's notes for a few minutes, then delete the note.
2. **Resend** (resend.com).
   - Sign up **with the email you'll use as the owner**.
   - API Keys, then Create, with permission "Sending access". Copy the key.
3. **A cron secret.** Any random string of 32 or more characters. A phone password generator works:
   iPhone's Passwords app, Google Password Manager, or 1Password.
4. **Netlify** (app.netlify.com, sign up with GitHub).
   - Add new project, then Import an existing project, then GitHub. Authorise, then pick
     `dezmortual/Claude-`.
   - **Branch to deploy:** `claude/install-replica-skills-4jsrht`.
   - **Project name:** pick one, for example `proofcast-yourname`. Your URL becomes
     `https://proofcast-yourname.netlify.app`.
   - Leave the base directory, build command and publish directory as they are. They come from
     `netlify.toml`.
   - **Add environment variables** on the same screen, before deploying (default scopes are fine):

     | key | value |
     | --- | --- |
     | `DATABASE_URL` | Neon pooled string |
     | `DATABASE_URL_DIRECT` | Neon direct string |
     | `OWNER_EMAILS` | your email (the one Resend is under) |
     | `RESEND_API_KEY` | the Resend key |
     | `CRON_SECRET` | the random string |
     | `APP_URL` | `https://<project-name>.netlify.app` |
     | `PRIVATE_MODE` | `true` |
     | `NETLIFY` | `true` |
     | `EMAIL_FROM` | `Proofcast <onboarding@resend.dev>` |

   - Tap **Deploy**. It takes about 3 to 5 minutes. The deploy log should show "applied 0001_init.sql",
     then the Next.js build.
5. **Turn previews off**, so a branch can never write to the production database. Go to Project
   configuration, then Build & deploy, then Branches and deploy contexts, then Configure:
   - Deploy previews: **Don't deploy**
   - Branch deploys: **Deploy only the production branch**
6. **Fill the prices once.** Go to Logs, then Functions, then **jobs**, then **Run now**. The function also
   runs by itself every 30 minutes (alerts every run, forecasts hourly, cleanup daily). You don't need
   GitHub secrets, and the GitHub workflow is an alternative that stays idle without them.
7. **Sign in.**
   - Open your URL and choose "Set up the owner account".
   - Open the confirmation email on the same phone, then sign in.
   - Do the core flow (below, under Watch).

## Vercel instead (from a phone)

This is the fallback while Netlify's build pipeline is degraded. Use **one** host, not both: two hosts would both
run the jobs against the same database. Checked here 2026-10-22 with Vercel's own build tool (`vercel build`,
CLI 62.7.0) on a fresh clone:
- the production build ran the migrations and the seed on an empty database, then built the app and middleware
- all 3 daily jobs were registered
- `GET /api/cron/alerts` answers 200 with the secret and 401 without

1. **vercel.com.** Sign up with GitHub (the free Hobby plan).
2. **Add New → Project.** Import `dezmortual/Claude-`, and give Vercel access to that repo if it asks.
   - **Project name:** for example `proofcast-yourname`. The URL becomes `https://proofcast-yourname.vercel.app`.
   - **Root Directory:** tap Edit and choose `apps/web`. The framework shows Next.js. Leave the build settings
     alone, because they come from `apps/web/vercel.json`.
   - **Environment Variables:** paste the same values as for Netlify, except `NETLIFY`:
     - `DATABASE_URL`
     - `DATABASE_URL_DIRECT`
     - `OWNER_EMAILS`
     - `RESEND_API_KEY`
     - `CRON_SECRET`
     - `APP_URL` = `https://<project-name>.vercel.app`
     - `PRIVATE_MODE` = `true`
     - `EMAIL_FROM`
   - Tap **Deploy**. **This first deploy fails, and that's expected.** Vercel builds the repo's default branch,
     which doesn't have the app.
3. **Point production at the app's branch.** Go to Project → Settings → Environments → Production → Branch
   Tracking, and set it to `claude/install-replica-skills-4jsrht`. Save.
4. **Only build production.** Go to Settings → Git → Ignored Build Step and choose **"Only build production"**.
   The repo has other branches that get daily commits, and this stops them building previews.
5. **Deploy the branch.** Go to Deployments → Create Deployment (or the ⋯ menu → "Create Deployment"), enter
   `claude/install-replica-skills-4jsrht`, and deploy. Wait for **Ready** (about 2 to 4 minutes). The build log
   should show `migrate.mts: connecting to …` then "applied 0001_init.sql".
6. **Sign in.** Open the URL, choose "Set up the owner account", confirm the email, then sign in.
7. **Jobs.** Vercel's free plan runs scheduled jobs **once a day**, within the hour:
   - forecasts publish and score at 00:05 UTC
   - alerts run at 12:10 UTC
   - cleanup runs at 03:17 UTC

   Prices themselves load fresh whenever you open a page.
8. **Optional: run them more often, free.** Use cron-job.org, which works in a phone browser:
   - **alerts:** `https://<project-name>.vercel.app/api/cron/alerts`, every 30 minutes
   - **publish:** `…/api/cron/publish`, every hour, at minute 5
   - For both: method GET, and in Advanced → Headers add `Authorization` = `Bearer <your CRON_SECRET>`.
9. **Tidy up Netlify.** Delete the Netlify project (Project configuration → General → Danger zone), or at least
   remove its environment variables, so it can never run jobs against the same database.

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

- [ ] **Uptime.** The jobs run inside Netlify, so they can't watch Netlify itself. For an outside check,
  add a free monitor on `https://<project-name>.netlify.app/sign-in`. UptimeRobot and Better Stack both
  have phone apps. (The GitHub workflow's health check only runs if you use the workflow, which needs it
  on the repo's default branch plus the `APP_URL` and `CRON_SECRET` secrets.)
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
   - Check the first runs of the `jobs` function are green (Netlify: Logs, then Functions, then jobs).
   - Check the asset page's source line isn't stale.
2. **Days 1 and 2.** Look for function timeouts in Netlify's function logs ("Task timed out after 10
   seconds"). If the `ingest` or `publish` job shows them, tell me. Splitting the job is the fix.
3. **Day 2.** `/track-record` shows the first scored next-day forecasts. They should be coming in every
   hour.
4. **Every few days.** Check database size against Neon's free limit. Price bars are trimmed to a fixed
   count per series, so growth should come from the scored forecasts only.
5. **End of the week.**
   - Take a `pg_dump`.
   - Check Netlify usage (Functions invocations): about 1,440 scheduled runs a month, well inside the free plan.

## Mobile

Not applicable: there's no phone app yet. The store listing is ready in `launch/listing.json` for when
there is one.

## Live URL

**https://proofcastd.netlify.app**: live since 2026-10-22, Netlify project `proofcastd`, Neon project
`proofcast-prod` (`ancient-breeze-37357590`, AWS US East 2).

How it got there:
- The owner connected the Netlify and Neon connectors.
- Through those connectors, Claude:
  - created the Neon project
  - replaced the placeholder env values (`DATABASE_URL`, `DATABASE_URL_DIRECT`, `APP_URL`, `CRON_SECRET`)
  - uploaded a clean clone of the branch with Netlify's own deploy tool
- The first upload published static files only, because Netlify hadn't added its Next.js adapter.
  `@netlify/plugin-nextjs` is now pinned and declared in `netlify.toml`.
- Netlify refuses `NETLIFY` as a variable name (it's reserved), so rate limits share one bucket. That's
  fine for an owner-only app.

Checked on the live site, 2026-10-22:

| check | result |
| --- | --- |
| `/` and `/forecasts` as a guest | 307 to sign-in |
| `/sign-in`, `/legal/privacy`, `/icon.svg` | 200 |
| guest API | 401 |
| `/api/cron/*` without the secret | 401 |
| `alerts` job | 200, 0.3 s |
| `ingest` job | 200, 42 live assets, 10.1 s |
| `publish` job | 200, 126 forecasts |
| database | migration `0001_init.sql` applied; 60 assets, 97,094 bars, newest 5-minute bar 02:55 UTC (Binance answers from Netlify's region) |
| scheduled function `jobs` | registered (`4,34 * * * *`) |

Still to do:
- **`RESEND_API_KEY` is still the placeholder text.** Sign-up emails can't be sent until the owner
  pastes a real key, and after that a redeploy is needed.
- Turn deploy previews off.
- The database password and the cron secret passed through the Claude session. Rotate them when
  convenient: in Neon, Roles, then reset password; in Netlify, update the variables and redeploy.
- `ingest` took 10.1 s. It finished, but sits right at the reported 10-second function limit. The
  scheduled runs don't call `ingest` (pages and `publish` load prices as needed). If timeouts appear in
  the function logs, splitting it is the fix.
