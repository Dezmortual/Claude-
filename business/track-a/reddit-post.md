# Track A: Reddit post (draft, not posted)

**Where:** r/algotrading first (it allows method posts but is strict about
promotion, so read its rules on the day and keep the offer in one line at the
end). Cross-post to r/TradingView 2–3 days later if the first post does well.

**Attach:** `business/track-b/before-after.png` as the post image, or upload it
and link it in the first line.

**Title options** (pick one):
1. My strategy showed a 78% win rate in TradingView's tester. With honest fills it's 38% and loses money.
2. Why trailing-stop strategies show 90% win rates on TradingView (and how to check yours)
3. Same rules, only the fill model changed: 93% → 53% win rate

---

## Post

I've been porting TradingView strategies to Python and re-testing them with a
stricter fill model. Two of them turned out to be the same story, and I think
it explains a lot of the 80–90% win rates people post (and sell).

**The short version:** if a strategy uses a tight trailing stop, the tester
(without Bar Magnifier) lets a bar's own high move the stop *up*, then fills
the stop on that same bar's low. On an OHLC bar you don't know whether the
high or the low came first. Assuming the high always came first books most of
the bar's range as profit.

**Strategy 1: Sweep** (hourly, 10 Binance coins, 2020 to now, 69,442 trades).
Long when a 4-period EMA crosses above session VWAP, short when it crosses
below, always in the market, trailing stop 0.005 ATR, no hard stop.

- Same-bar fills: **78% win rate, +0.52% per trade.** The equity curve
  "grows" by a number with 22 digits.
- Honest fills (the stop only uses bars that have already closed):
  **38% win rate, −0.13% per trade** after 0.05% commission and 2 bps
  slippage per side. Every coin loses money, both before and after 2025.
- Before costs it's +0.007% per trade, which is basically zero.

**Strategy 2: Donchian breakout** (daily, BTC/ETH/SOL). 20-day breakout in
the direction of the 200-day SMA, 1.5 ATR hard stop, 0.02 ATR trail.

- Same-bar fills: **93% win rate.**
- Honest fills: **53%,** and the 2025+ out-of-sample half has t = 0.74,
  so no edge where it matters. When I re-checked every same-bar trade
  against the rules, 373 of 381 couldn't have happened as booked.

Same rules in both runs. The only thing that changed is when the trailing stop
is allowed to move.

**How to check a strategy yourself:**

1. **Turn on Bar Magnifier** in the strategy properties, if your plan has it,
   and see whether the win rate collapses.
2. **Compare the trail distance with a normal bar's range.** A trail that's a
   small fraction of one bar's range is the warning sign: the tester can
   ratchet it up and get stopped out "in profit" on the same bar.
3. **Ignore win rate and look at net profit per trade** after realistic
   commission *and* slippage. TradingView's own help page lists "the vendor
   advertises its win rate" as a reason not to pay for a script.
4. **Check how long trades last.** If almost every trade exits one or two
   bars after entry, the trail is doing the "winning", not the signal.

Happy to share more of the method in the comments.

*Disclosure: I'm thinking about offering this as a paid audit. Before that,
I'll audit 3 strategies for free, especially ones you're thinking of buying.
Comment or DM with the script name.*

---

## Notes before posting

- Every number above comes from `trading-desk/sweep/README.md` and
  `trading-desk/donchian/README.md`. Don't round them further or add new ones.
- The orange numbers come from re-running the tester's same-bar assumption in
  Python (`--trail-mode same_bar`), not from TradingView screenshots. If
  someone asks, say so. Better still, take a real Strategy Tester screenshot of
  the Pine version first, so you can show the tester's own number next to
  yours.
- If r/algotrading's rules on the day forbid the disclosure line, remove it
  and only take audit requests that come in through the comments.
- Track replies in the table in `business/track-b/messages.md`, or start one
  here. Track A passes if at least 1 person pays $49 on day 14, or at least 2
  of the 3 free-audit users say they would have paid and name a script they
  were about to buy.
