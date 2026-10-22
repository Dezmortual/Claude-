# Pricing

**The private build has no pricing.** Only the owner can sign in, and every feature is free. Nothing below
is on sale. This page is the plan for the day Proofcast opens to the public, so the research isn't lost.

## What others charge

Prices were read from the public pricing pages on 2026-10-22. Prices change, so read them again before
setting yours.

| product | free plan | paid plans, per month | billed yearly | cancel and refund terms | source |
| --- | --- | --- | --- | --- | --- |
| BeCoin (the original) | none mentioned | Day Trader $12, Starter $24, Pro $59, Unlimited $109 | $9, $19, $49 or $99 a month ($108 to $1,188 a year) | "cancel anytime from our chat", and access runs to the end of the period. No refund terms on the page | https://becoin.net/tariff-plan |
| TradingView (charts, indicators, alerts) | Basic, free "forever", no card | not stated on the page | Essential $12.95, Plus $29.95, Premium $59.95, Ultimate $199.95 a month | won't auto-renew once cancelled. Refunds only on annual plans, within 14 days | https://www.tradingview.com/pricing/ |
| DappRadar price predictions | free, with no plans shown | n/a | n/a | n/a | https://dappradar.com/token/price-predictions |

What this shows:
- **The original gates by market.** Crypto costs $19 to $24 a month, forex comes at $49 to $59, and
  everything costs $99 to $109.
- **Cancelling the original goes through a chat**, not a button.
- **A free alternative exists.** DappRadar gives algorithmic forecasts away. The forecasts alone are not
  something people will pay much for. The track record, the signals and the alerts are.

## What reviewers said about price and billing

These counts come from `replica/feedback.md`: 434 reviews, almost all about comparable apps (see the note
at the top of that file).

| theme | reviews | sources | avg ★ |
| --- | --- | --- | --- |
| Price and paywalls | 70 | 2 | 2.0 |
| Billing, cancelling and refunds | 50 | 2 | 1.4 |
| Called a scam (often about billing) | 27 | 2 | 1.3 |

Summed up (not quotes):
- They can't try anything without paying.
- They can't find how to cancel.
- They're asked to renew after cancelling.
- They're told a refund is impossible.

## The model, for a public launch

Two tiers. The free one must be useful on its own, because that's the answer to the biggest complaint.

| tier | for | price | what's in it |
| --- | --- | --- | --- |
| **Free** | people checking whether the forecasts are any good | $0, no card | every daily forecast and signal for every live asset, the full track record, a 5-asset watchlist, 3 alerts |
| **Trader** | people who act on signals during the day | $8 a month, or $80 a year (2 months free) | intraday signals (5m to 1h), unlimited alerts, the daily digest, and the forecast and signal history exports |

Why it's built this way:
- **One price, not one per market.** Gating by market is what the original does, and paywalls are the top
  complaint. Live data comes from free public APIs, so markets cost nothing extra to serve.
- **$8 sits below every paid tier of the original.** Its cheapest monthly plan is $12. It also sits below
  TradingView's cheapest yearly plan.
- **The track record is never paywalled.** It's the angle. Hiding it would undo it.
- **No trial that turns into a charge.** The free tier does the trial's job, so there's no card up front
  and no surprise charge.

## Fixing billing in the product

These go in the product before any paid plan launches:
- **Cancelling is one click** on `/account`, in Stripe's Customer Portal. There's no chat, no "are you
  sure" maze and no retention offer wall.
- **After cancelling**, access continues to the end of the paid period. The app shows the end date and
  never asks the user to renew.
- **A renewal email 7 days before each yearly renewal**, and 3 days before monthly ones (opt-in), with the
  amount, the date and a cancel link.
- **Refunds:** a full refund within 14 days of any first payment or yearly renewal, no questions asked.
- **No price increase without 30 days' notice.** Existing subscribers keep their price for a year.

## Stripe, when it's time

You create these in Stripe, in test mode first. Claude doesn't create accounts or keys. The schema already
has `plans` and `subscriptions` tables for them.

| product | price ID to create | amount | interval |
| --- | --- | --- | --- |
| Proofcast Trader | `trader_monthly` | 8.00 USD | month |
| Proofcast Trader | `trader_yearly` | 80.00 USD | year |

You'll also need:
- **Customer Portal:** turn on "cancel at period end", plan switching and invoice history.
- **Webhooks:** `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted` and `invoice.payment_failed`. Build them with `/replica-backend` when
  the private build goes public.
