# Email 1: first 5 sellers (drafts, nothing sent)

Send by email, website contact form, Patreon or Telegram. **Never** through
TradingView private chat or comments (House Rules ban solicitation there).

Before sending:
- Fill in `{chart link}` (the hosted `before-after.png`) and `{write-up link}`.
- Fill in `{name}` from their site or About page. Use the brand name if
  there's no person's name.
- Check the "verify" line under each email. If it turns out false, rewrite
  that email's first two lines, or skip the seller.
- Send one a day, Tuesday to Thursday, and log it in the tracking table in
  `messages.md`.

pristinecap was dropped from the list. Its "audited" returns turned out to be
U.S. Investing Championship contest results, not script backtests, so the
hook doesn't apply. AlgoAlpha takes its place.

---

## 1. Zeiierman

**To:** contact or support form on zeiiermantrading.com
**Verify:** which of their paid scripts are *strategies* that use a trailing stop.

Subject: Testing trailing-stop strategies with honest fills

Hi {name},

You publish Trailing Management, so you've probably thought harder about
trailing stops than most vendors.

Without Bar Magnifier, TradingView's tester lets a bar's own high move a
trailing stop before it checks the low. When I re-ran two of my own strategies
with and without that assumption, it was the difference between a 38% and a
78% win rate, and between 53% and 93% ({chart link}).

I re-test strategies with honest fills and re-check every trade against the
rules. If one of your strategies passes, you get a public report you can link
from your sales page. $99 per strategy, verdict in 48 hours.

Would one of yours be worth running?

{your name}

---

## 2. loxx (Algx Trading)

**To:** Patreon message (patreon.com/algxtrading) or the public Telegram group
admin (t.me/algxtrading_public)
**Verify:** whether any of the "Backtest (Simple)" scripts or the paid systems
use a trailing exit. If they only use a fixed TP/SL, lead with the
re-check-every-trade part and leave out the trailing-stop numbers.

Subject: Independent check on your Backtest [Loxx] scripts

Hi {name},

Your "Backtest (Simple) [Loxx]" scripts put strategy-tester results in front
of buyers, and with 25+ systems in the membership, that's a lot of backtests
people take on trust.

I re-run strategies outside TradingView with conservative fills and re-check
every trade against the rules as written. On my own work, the tester's
same-bar trailing-stop fill was the difference between a 38% and a 78% win
rate ({chart link}).

If a system passes, you get a public report to link from Patreon. $99 per
system, verdict in 48 hours. Interested in trying one?

{your name}

---

## 3. Trading-IQ

**To:** contact form or support email on tradingiq.io
**Verify:** that their premium "algorithms" are strategies with Strategy
Tester results, and which exits they use.

Subject: An independent audit for TradingIQ's algorithms

Hi {name},

You sell trading algorithms, so your Strategy Tester results are the first
thing a buyer checks, and the thing they trust least.

Without Bar Magnifier, the tester lets a bar's own high move a trailing stop
before it checks the low. When I re-ran two of my own strategies with and
without that assumption, it was the difference between a 38% and a 78% win
rate ({chart link}).

I re-test strategies with honest fills and re-check every trade. A passing
algorithm gets a public report you can link on tradingiq.io, which is proof
most vendors can't show. $99 per algorithm, verdict in 48 hours.

Worth running one?

{your name}

---

## 4. EdgeTools

**To:** they have no website. Look for an email on their TradingView profile
signature or their Lemon Squeezy page. **If there's no off-platform contact,
skip them.** Don't use TradingView chat.
**Verify:** whether their models are strategies (with tester results) or
indicators only.

Subject: Your models are "validated through rigorous backtesting"

Hi {name},

Your marketplace listing says EdgeTools models are "validated through rigorous
backtesting". An independent check would let buyers see that for themselves.

I re-run strategies outside TradingView with conservative fills and re-check
every trade against the rules as written. On my own strategies, the tester's
same-bar trailing-stop fill was the difference between a 38% and a 78% win
rate ({chart link}), which is the kind of gap buyers can't see on their own.

A model that passes gets a public report you can link from your listing. $99
per model, verdict in 48 hours. Interested?

{your name}

---

## 5. AlgoAlpha

**To:** contact or support on AlgoAlpha's official site (confirm the domain
first; one page I found was on an unofficial host).
**Verify:** that the Backtest Strategy Builder supports trailing stops.
This one may be a **partner** (referrals) more than a customer.

Subject: Your Backtest Strategy Builder and trailing-stop fills

Hi {name},

Your Backtest Strategy Builder lets traders build and test strategies without
code, which means their results inherit TradingView's fill assumptions.
Without Bar Magnifier, a bar's own high can move a trailing stop before the
low is checked. On two of my strategies, that was the difference between a
38% and a 78% win rate ({chart link}).

Two ways this could help you: an independent audit of the builder's
trailing-stop handling ($99, public report if it passes), or a referral
arrangement where your users can get a strategy checked before they trade it.

Would either be useful?

{your name}

---

## Notes

- Every email says the numbers came from re-running the assumption on your own
  strategies, which is true (`trail_mode same_bar` in `trading-desk/`). None
  of them claims anything about the seller's own results.
- The integrity rule (every report is published, pass or fail) goes in
  email 2, so email 1 stays short. If anyone asks first, answer it straight.
