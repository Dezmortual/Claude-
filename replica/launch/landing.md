# Landing page

- **Where:** `apps/web/src/app/welcome/page.tsx` at `/welcome`.
- **Who sees it:** while the build is private, only the signed-in owner, as a preview with a banner. Set
  `PUBLIC_LANDING=true` and it becomes the signed-out home: `/` sends guests to `/welcome`, and the page
  can be indexed.
- **What it doesn't change:** sign-up. `OWNER_EMAILS` still decides who can get in.
- **The button:** links to `WAITLIST_URL` (a form you own) if set. Otherwise it says "Sign in", or "Open the
  forecasts" for the owner.

**Rule for this page:** every claim must be true of the running product. Fixes F1 to F6 from `fixes.md`
aren't built yet, so the only one shown (the ledger, F1 and F2) carries an **In progress** badge. When one
ships, move it up and drop the badge. No testimonials, no user counts, no ratings, no press logos, and no
reviewer quotes. There's no proof section, because there's no real proof yet beyond the track record
itself.

## Sections

1. **Hero** (angle A from `fixes.md`)
   - Eyebrow: "Price forecasts with receipts"
   - H1: "Forecasts that keep score, misses included."
   - Line: "Each forecast is locked when it's made and scored when it's due, so the hit rate you see is
     measured, not claimed."
   - Buttons: "Get early access" (or "Sign in"), plus "How it works".
   - A screenshot of the real asset page, taken from the clone (`public/welcome/asset-page.webp`). Retake it
     after the design changes.
2. **The problem.** "Signal apps grade their own homework". These are the top two hate themes, paraphrased,
   not quoted:
   - "You only see the wins": wrong signals and hidden losses (51 and 12 reviews), and scam (27).
   - "Paying is easy. Leaving isn't.": paywalls (70) and billing (50).
3. **How it works.** Three steps from the core flow (F01, F02, F05): pick an asset, check the reading, get
   told when it changes.
4. **Features.** "Built to be checked". Each one is tied to a fix theme:

   | feature | theme it answers | built? |
   | --- | --- | --- |
   | A track record you can check | no track record (14 reviews, 3 sources) | yes: `/track-record` |
   | The why behind every signal | no explanation (4, thin) | yes: the indicator tables |
   | Signals that don't flicker | flip-flopping (2, thin) and late signals (11, thin) | yes: closed bars only |
   | Alerts that leave you alone | notifications (22, thin) | yes: fires once, cooldown, one-click pause |
   | Every call, one by one | hidden losses (12), wrong signals (51) | **no**: F1 and F2, badge "In progress" |

5. **Pricing.** The two planned tiers from `pricing.md`, under the line "Nothing is on sale yet". Keep that
   line until Stripe is live.
6. **FAQ.** Is it advice; how accuracy is measured; where the prices come from; cancelling; the phone app.
   There's no importer, so there's no import question.
7. **Final call.** "See how often it's right before you trust it", with the same button as the hero.

## Checks

- Colours are token roles only, so the palette's contrast check covers the page (66 pairs, 0 AA failures).
- e2e `launch-landing.spec.ts`:
  - a guest is redirected while the build is private
  - the owner preview renders every section
  - the screenshot loads
  - axe passes at 1440px and at 390px, with no sideways scroll
- Checked by hand with `PUBLIC_LANDING=true`:
  - `/` sends a guest to `/welcome` (307)
  - `/welcome` returns 200
  - the screenshot loads, original and optimised
  - `/forecasts` still sends a guest to sign-in
  - the robots meta tag says `index, follow`
