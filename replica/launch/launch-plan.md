# Launch plan

## Where this stands

Proofcast is a **private build**: only the owner signs in, and nothing is sold. "Launch" happens in two
stages, and only the first is on the table now.

| stage | what | what it takes |
| --- | --- | --- |
| **1. Private, on Netlify** (now) | the owner uses it daily, and the track record starts filling | `/replica-deploy` to Netlify, with the steps in `replica/backend.md` |
| 2. Public (later, if ever) | landing page on, free plan, paid tier | Stripe, a privacy policy and terms written with a lawyer, F1 to F6 built, the trademark search on the name |

The track record needs time. A public launch with an empty one would undercut the angle, so stage 1 is
what makes stage 2 possible. **Aim for at least 3 months of scored forecasts before going public.**

## Stage 1: private on Netlify

The app is ready for Netlify:
- **`netlify.toml`** at the repo root. It builds `apps/web` on Node 22, and Netlify adds its Next.js
  adapter itself.
- **Rate limits** read Netlify's client-address header. Set `NETLIFY=true` in the site's environment
  variables, with scope Functions.
- **The database pool** is kept small on serverless.
- **Daily cleanup** runs from the same GitHub Actions workflow as the other jobs, so no host-specific
  cron is needed. `vercel.json` is gone.

Set these environment variables in the Netlify UI, scope **Functions** (variables in `netlify.toml` reach
the build only):
- `DATABASE_URL`, the pooled string
- `OWNER_EMAILS`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `CRON_SECRET`
- `APP_URL`
- `PRIVATE_MODE=true`
- `NETLIFY=true`
- optional: `ALPACA_KEY_ID` and `ALPACA_SECRET_KEY`

Watch-outs to check after the first deploy:
- **Function time limit.** Netlify's synchronous functions are reported to stop at 10 seconds by default.
  Netlify's own pages disagree on this, so check the current docs. Raising it to 26 seconds needs a paid
  plan and a request to support. The jobs measured here take 0.1 to 2.7 s once the database holds price
  history. On an empty database, the first page load fetches all the history (about 7 s locally) and could
  time out. Run `npm run db:setup` against the production database and trigger the `ingest` job once by
  hand (from the workflow's "Run workflow" button) before opening pages. A timed-out run keeps what it
  stored, and the next run carries on.
- **Region.** Netlify functions run in one US region by default. Check that Binance's market-data host
  answers from there, on the asset page's source line. If it doesn't, crypto falls back to stored bars
  and shows a stale warning.
- **Previews.** Deploy previews get the same environment unless you scope variables by deploy context.
  Give previews a separate database, or turn previews off, so a branch can't write to the real track
  record.

## Stage 2: before going public

- **Waitlist before launch.** Point `WAITLIST_URL` at a form you own, then set `PUBLIC_LANDING=true`. The
  landing page goes public, and the rest of the app stays owner-only.
- **Analytics and errors.**
  - Privacy-friendly page analytics with no cookie banner needed: Plausible or a self-hosted Umami.
  - Sentry's free tier for errors.
  - Add both processors to the privacy policy.
  - The job log (`job_runs`) already records every scheduled run and its errors.
- **Where unhappy users talk.** The research found almost no discussion of the original itself: one
  Trustpilot review, no Reddit threads, no Hacker News threads. The talk is about the category:
  - **App Store reviews of AI signal apps**: 429 reviews across 7 apps. This is research only. Never post
    in review sections, and never contact reviewers.
  - **Hacker News threads on trading signal services and price predictions**: items
    [25622763](https://news.ycombinator.com/item?id=25622763) and
    [44320945](https://news.ycombinator.com/item?id=44320945).
  - Before posting anywhere, search Reddit's trading and crypto communities for "signal app",
    "track record" and "scam", and read each community's self-promotion rules. Most ban it outright.
- **Show HN post, leading with the fix**, once the record has 3 months in it. Draft: "Show HN: Proofcast,
  price forecasts that are locked when published and scored when due". Write about how it's measured,
  what the hit rate turned out to be (whatever it is), and what doesn't work. No claims beyond the
  numbers on the page.
- **Product Hunt.** Optional, after HN. Use the same lead.
- **The first 10 users, by hand.**
  - Find people who already trade with signals: friends, colleagues, people who post their own track
    records in public.
  - Give each of them access by adding their email to `OWNER_EMAILS`, which makes them an owner with
    full access. That's fine for 10 people you trust, but it isn't a user system.
  - Talk to each one for 20 minutes after a week. Ask what they checked, what they didn't trust, and
    what would make them pay $8.
  - Real users who agree can be quoted later, with written permission. Reviewers of other apps never can.

## Store listing (needs the phone app)

`listing.json` passes `listing.py`: 0 errors, 0 warnings, and BeCoin's name doesn't appear in it. It
waits for the phone app, which isn't built. When it exists, you'll also need:
- **Screenshots:** check the current required sizes in App Store Connect and the Play Console when
  uploading. Make the fixes visible in them: the track record, and the readings behind a signal. That's
  what gets the app through App Review Guideline 4.1 (Copycats).
- **Privacy:** the App Store privacy labels and Google Play's data safety form. Data collected: email,
  name, watchlist and alerts. No tracking, no ads.
- **Pages and rating:** privacy policy and support URLs on your domain, and the age rating questionnaire.
  The finance content asks about gambling; the answer is none.
- **Review notes:** a demo account the reviewer can use. In the private build that means adding a
  reviewer email to `OWNER_EMAILS` for the review period, then removing it.
