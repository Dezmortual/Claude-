# Fixes: what people hate about AI signal apps, and what this clone does about it

## The sample, honestly

- **434 unique reviews** (441 rows, 7 duplicates removed) from 3 sources, collected 2026-10-22:
  - **Trustpilot: 1.** BeCoin's only public review.
  - **App Store: 429.** Reviews of 7 comparable AI signal and forecast apps, read from Apple's official
    customer-reviews RSS feed: Bione, Bitcoin Trading Signals, Crypto AI, Stock Signal, Stocks Alerter,
    Stocks to Buy Now AI Signals, Trade AI.
  - **Hacker News: 4.** Comments from the official Algolia API.
- **There is almost nothing about BeCoin itself.** It has no app in the App Store, no Google Play reviews
  I could read, no Reddit or Hacker News threads, and one Trustpilot review. Everything below is
  **category evidence**: what people hate about apps like it, not about it.
- **Most themes come from one platform.** The App Store dominates, so most themes count as "one source"
  even when they span 4 to 7 different apps. Where that is the case, the theme is marked **thin**, and the
  number of apps is given so you can judge.
- Themes are matched by keyword (`reviews.py` plus `themes.json`). I read the quotes below by hand. Where
  the keyword count is known to include misfires, that's noted.
- Sources not used:
  - Google Play has no official public reviews feed, and scraping it breaks the rules.
  - Reddit had no threads about BeCoin.
  - BeCoin has no public feature board or changelog.

What the only review of the original says (Trustpilot, 5★, 2026-03-07):

> "A lot of forecasts are accessible for free, valuable data. I'm still not sure about the accuracy but it's
> trading. I don't think pros rely on one resource. I only use specific signals to confirm my strategy. It's
> totally helpful for pros and I don't know about newbies."
> https://www.trustpilot.com/reviews/69ac348087778b377f2ec982

"I'm still not sure about the accuracy" is the original's gap in one line. It matches the category's
biggest product complaint.

## 1. What they hate

Ranked by `reviews.py` score (low stars and recent reviews weigh more). Pricing and billing are ranked 1
and 2 but go to `/replica-launch`, because this build takes no payments.

| # | problem | reviews | sources | apps | avg ★ |
| --- | --- | --- | --- | --- | --- |
| 1 | Too expensive, everything behind a paywall | 70 | 2 | 7 + HN | 2.0 |
| 2 | Can't cancel, charged after cancelling, no refunds | 50 | 2 | 6 + HN | 1.4 |
| 3 | Signals are wrong and followers lose money (**thin**: one platform) | 51 | 1 | 6 | 1.7 |
| 4 | Called a scam outright (overlaps 1 to 3) | 27 | 2 | 6 + HN | 1.3 |
| 5 | Notifications they can't control (**thin**: one platform) | 22 | 1 | 4 | 1.9 |
| 6 | Support never answers (**thin**: one platform) | 13 | 1 | 3 | 1.8 |
| 7 | Signals arrive after the move (**thin**: one platform) | 11 | 1 | 4 | 2.5 |
| 8 | Results that hide losses or inflate returns (hand-read theme, **thin**: one platform) | 12 | 1 | 3 | n/a |
| 9 | Signals flip between strong buy and strong sell (hand-read, **thin**: 2 reviews) | 2 | 1 | 1 | n/a |

1. **Price and paywalls.**
   - "I just want something to check stocks on but this app gives no way to do that or even try it out
     without paying." https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-7390063217
   - "Pay, pay, and pay. Kinda worthless honestly. Also, not much good data you can’t get free a lot of
     other places." https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-7785255085
2. **Billing and cancelling.**
   - "No way to cancel" https://apps.apple.com/us/app/id6741457696?see-all=reviews#review-12982783708
   - "I cancelled the subscription. I should be able to still access till August 2026. App asking me to
     RENEW for 6 more months. No customer support."
     https://apps.apple.com/us/app/id1565527320?see-all=reviews#review-13977678770
3. **Wrong signals, lost money.**
   - "When it says strong buy the market could be going down and you lose so much money your position on a
     trading platform will automatically close you out."
     https://apps.apple.com/us/app/id1355493928?see-all=reviews#review-11904434796
   - "I lost a lot of money." https://apps.apple.com/us/app/id1545704110?see-all=reviews#review-13327150667
4. **Scam.**
   - "There are a lot of scams." https://news.ycombinator.com/item?id=44320945
   - "This app’s reviews are littered with fakes."
     https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-7758779932
5. **Notifications.**
   - "So they just bombard you with info you don’t want with no way to control."
     https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-7576904453
   - "Notification settings also appear to be malfunctioning; despite turning them off, I still receive
     alerts, and one recently directed me to a post from a year ago."
     https://apps.apple.com/us/app/id1565527320?see-all=reviews#review-14536803880
6. **Support.**
   - "Sent support message but no response."
     https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-13965992305
   - In a private build the owner is the only user, so support doesn't apply. It matters only for a
     public launch.
7. **Late signals.**
   - "Alert, after stocks going up. HaHa. There is no supervision."
     https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-11198026136
8. **Hidden losses.**
   - "They never include any losses in their returns."
     https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-8733195749
   - "When 3 stocks increase 3% each, this is NOT a 9% gain. It is 3%."
     https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-12924398161
   - "in the app signal history it only shows the signals that reached a sell price, but the story was that
     it probably was in negative 20%+ before it reached a 4% profit on a signal."
     https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-7144215579
9. **Flip-flopping.**
   - "it says strong but at 1237 then said strong sell at 1236"
     https://apps.apple.com/us/app/id1355493928?see-all=reviews#review-6884965475

Also seen, too small to rank:
- ads: 9, thin
- bugs and crashes: 10
- lost data: 8
- clunky UI: 5, thin

## 2. What is missing

| # | request | reviews | sources | apps | |
| --- | --- | --- | --- | --- | --- |
| 1 | A track record you can check, losses included | 14 | 3 | 5 + HN + Trustpilot | strongest request |
| 2 | Why a signal says what it says | 5 (4 after removing a misfire) | 1 | 4 | **thin** |
| 3 | Control over what you're alerted about | 5 | 1 | 3 | **thin** |

1. **Track record.**
   - "they should have a way of tracking the accuracy of people's past predictions. Otherwise, this is just
     noise" https://news.ycombinator.com/item?id=25622763
   - "The guidance provided in the app does not seem consistent or transparent."
     https://apps.apple.com/us/app/id1565527320?see-all=reviews#review-14536803880
   - "I'm still not sure about the accuracy" (BeCoin's own review, above).
2. **Explanations.**
   - "Signals are totally random, no explanation why are certain stocks are a buy."
     https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-7144215579
   - "Weak, lacking explanations and principles or references about collusions."
     https://apps.apple.com/us/app/id1567884537?see-all=reviews#review-7775713350
3. **Alert control.**
   - "Just need notifications on particular stocks."
     https://apps.apple.com/us/app/id1456114004?see-all=reviews#review-7472021744

Dropped:
- "Teams and sharing": all 10 are misfires on the word "share".
- "Integrations": 2 reviews, one of them a misfire.

## 3. What is unsolved

These are whole groups the category ignores. All are thin, and they're useful for positioning, not as
proof.

1. **Beginners.**
   - "It's totally helpful for pros and I don't know about newbies." (BeCoin's review, above)
   - "Someone just starting out needs all the help he can get but can’t get much because everyone is too
     greedy charging a arm and a leg to give decent guidance and advice!"
     https://apps.apple.com/us/app/id1355493928?see-all=reviews#review-9175909714
   - 2 reviews: **thin**.
2. **People who want to judge a signal service before trusting it.** The scam, fake-review and
   hidden-loss themes all point at one missing thing: a way to check the record.
   - "I guarantee the developers own the crypto they mark as “strong buy”."
     https://apps.apple.com/us/app/id1355493928?see-all=reviews#review-8312864055
   - That's 27 scam reviews and 6 fake-review mentions, across 6 apps and HN.
3. **Traders who use signals to confirm their own plan, not to replace it.**
   - "I only use specific signals to confirm my strategy." (BeCoin's review)
   - "I don't think pros rely on one resource." (same review)
   - 1 review: **thin**.

## 4. The fix plan

Already in the clone (so not "fixed" again):
- a public, scored out-of-sample track record (`/track-record`: hit rate, range coverage, median error)
- signals computed on closed bars only
- the indicator tables behind every pulse
- alert cooldowns and a per-alert pause
- no paywall at all in the private build

The plan below closes the gaps in those, chosen by evidence times how cheap each one is.

| # | build | size | skill | evidence |
| --- | --- | --- | --- | --- |
| F1 | **Forecast ledger.** Every locked forecast on `/track-record` and on each asset page, hits and misses alike, filterable by asset and horizon. Returns are never summed across assets | M | `/replica-build` | track record 14 reviews / 3 sources; hidden losses 12 / 3 apps |
| F2 | **Signal history with the bad part.** Each past signal change per asset: when, at what price, and the price after 1 day and 7 days, **including the worst move against it**, not only the exit | M | `/replica-build` | wrong signals 51 / 6 apps (thin); review-7144215579 |
| F3 | **"Why" line on every signal.** "13 of 20 indicators say buy (8 of 10 averages, 5 of 10 oscillators), on the 1 h bar that closed 14:00 UTC", linking to the tables | S | `/replica-build` | explanations 4 (thin); late 11 (thin) |
| F4 | **Timestamps on alerts.** Each alert email and event shows the bar or price time it fired on and when it was sent, so lateness is visible and measurable | S | `/replica-build` + `/replica-backend` | late signals 11 / 4 apps (thin) |
| F5 | **Signal damping.** A signal-change alert fires only after the new signal holds for 2 closed bars. The asset page shows "changed n times in 24 h" | S | `/replica-backend` | flip-flop 2 (thin); wrong signals 51 |
| F6 | **Notification controls.** A global mute, quiet hours in the owner's time zone, a daily digest option, and a one-click "stop these" link in every alert email | M | `/replica-backend` | notifications 22 / 4 apps (thin); alert control 5 |
| F7 | **Pricing and billing, if this ever goes public.** Free prices and forecasts without paying, every price on one page, cancelling in one click, access kept to the end of the paid period, no renewal prompts after cancelling | n/a | `/replica-launch` | price 70 / 2 sources; billing 50 / 2; scam 27 / 2 |

Order: F3, F4 and F5 first (small, and they reuse code that exists), then F1 and F2 (they need the ledger
to fill over time, so the sooner they ship the better), then F6. F7 waits for a public launch. The private
build has nothing to bill.

Rows F1 to F6 are in `replica/features.csv` with `original` = `no`.

## 5. The angle

```
A. For traders who are tired of signal apps that only show their wins,
   [app] publishes every forecast it ever made, and scores the misses too.
   Evidence: track record 14 reviews / 3 sources; hidden losses 12; scam 27 / 2 sources;
   wrong signals 51 / 6 apps.

B. For people who were burned by a "strong buy" they couldn't question,
   [app] shows the twenty readings behind every signal and the time it was made.
   Evidence: explanations 4 (thin); late signals 11 (thin); wrong signals 51 / 6 apps.

C. For traders who are sick of subscriptions they can't cancel,
   [app] shows prices and forecasts free, with one price and one-click cancel for the rest.
   Evidence: price 70 / 2 sources; billing 50 / 2 sources.
```

**I recommend A.**
- It rests on the biggest product complaint (wrong signals, scams), not on price, which any competitor
  can undercut.
- It's the one thing the original's own reviewer wasn't sure about.
- The clone already has the scored track record behind it, and F1 and F2 finish the job.
- B is a feature of A, and works as a supporting line.
- C matters only if the app goes public with paid plans, and it belongs to `/replica-launch`.

Watch-outs:
- Angle A only holds if the track record is real and complete. Never drop misses, never backfill
  forecasts, never sum returns across assets.
- Keep "not financial advice" next to the record.
- Don't use BeCoin's name in the app name, ads or listing. A comparison page is a question for a lawyer.
- Reviewers' quotes are research. None of them go on a landing page.
