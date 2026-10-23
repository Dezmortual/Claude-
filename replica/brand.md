# Brand: FXDEZ

**Renamed 2026-10-23.** The owner renamed the app FXDEZ and supplied its logo: a gold-and-green FX mark with a rising
candle chart and arrow, and the FXDEZ wordmark, on dark navy (`#0b0f18`). Every icon is cut from that image:
`apps/web/public/icons/` (app icons, badge, shortcuts), `public/brand/mark-*.png` (header) and `src/app/` (favicon,
Apple icon, link preview). The palette below is still the original plum one; only the name and logo changed. The
notes below are kept as the history of the first name.


Working name: **Proofcast**. It's a mix of *proof* and *forecast*. It carries angle A from `replica/fixes.md`:
"publishes every forecast it ever made, and scores the misses too."

This is a private, owner-only build, so the name only matters in public if the app ever launches. The
checks below are **screening, not legal clearance**. Before spending money on the name (a domain, a logo,
a filing), have a trademark lawyer run a proper search.

## 1. Name

### 20 candidates

| style | candidates |
| --- | --- |
| descriptive | Forecast Ledger, Scored Calls, Signal Record, Every Call |
| compound | Proofcast, Hitbook, Callmark, Tallyline, Missmark, Callledger |
| invented | Verana, Tallowcast, Keelcast, Reckonly |
| metaphor | Plumbline, Hindcast, Open Ledger, Truemark |
| verb | Tally, Reckon |

Cut, and why:
- **Tally and Reckon.** Both are existing software brands (forms, accounting).
- **Truemark.** Too close to Truecaller in sound and look.
- **Reckonly.** An "-ly" name.
- **Hindcast.** A generic technical term, so it's weak as a mark.
- **Every Call, Open Ledger, Scored Calls, Forecast Ledger, Signal Record.** Too descriptive to protect.
- **Callledger, Tallowcast.** Hard to spell.
- **Tallyline, Fairtally and Callmark.** Their .com and .app domains are both registered, and an app
  called Callmark is already in the App Store.

None of the 20 echo the original's name in sound, look or meaning. None use "Be-", "coin" or a pun on
either.

### Shortlist of 5, with the checks

Checks run 2026-10-22:
- **Domains:** read from the official RDAP registries (Verisign for .com, Google Registry for .app).
  "taken" means the domain is registered. The registry checks were sanity-tested with a made-up name,
  which correctly came back free.
- **App Store:** Apple's official Search API, US store.
- **Web:** a web search for the name plus the category.
- Everything else is marked **to run**.

| check | Proofcast | Keelcast | Missmark | Hitbook | Verana |
| --- | --- | --- | --- | --- | --- |
| US trademark, classes 9, 36, 42 (tmsearch.uspto.gov) | to run | to run | to run | to run | to run |
| EU trademark (euipo.europa.eu, or TMview) | to run | to run | to run | to run | to run |
| Canada (ised-isde.canada.ca) | to run | to run | to run | to run | to run |
| WIPO Global Brand Database | to run | to run | to run | to run | to run |
| .com | taken | taken | taken | taken | taken |
| .app | **free** | **free** | **free** | **free** | **free** |
| App Store, exact name | no app by that name (results were screen-casting apps) | no app by that name | no app by that name | **Hitbook.io exists** (Business category) | no app by that name (results were unrelated apps) |
| Google Play, exact name | to run | to run | to run | to run | to run |
| handles: X, Instagram, TikTok, GitHub | to run (GitHub's API refused the check from here) | to run | to run | to run | to run |
| web, name plus category | nothing found for forecasting, trading or signals | nothing found | nothing found | nothing found for trading (but see Hitbook.io) | only "Vena", a finance planning tool, close in look |

What the shortlist says:
1. **Proofcast. Recommended.**
   - It says the angle in one word, and it's easy to spell after hearing it once.
   - The .app domain is free, and no app or product by the name turned up.
   - The .com is registered, so look at what's there before deciding.
2. **Keelcast.** "Steady forecasts." It's clear, but it doesn't say proof.
3. **Missmark.** "We mark the misses." It's honest, but it reads oddly ("Miss Mark").
4. **Hitbook.** An existing Business app called Hitbook.io makes it the riskiest of the five.
5. **Verana.** Invented and pleasant, but it says nothing, and it's close in look to Vena (finance
   software).

If Proofcast fails a trademark search in class 9, 36 or 42, fall back to Keelcast.

## 2. Palette

The original's brand is an **indigo/periwinkle gradient at hue ≈ 233**. I measured it from the reference
screenshots (for example `#5363df` and `#6272e8`), together with a navy text colour, `#1a1f36`. All of
those are in `replica/brand.json`, so the sweep catches them.

Proofcast uses **plum** (hue ≈ 322) with warm neutrals. That's about 90° away from the original, not a
neighbouring blue. It also stays clear of the green, red and amber the app already uses for up, down and
warning. The token role names didn't change, only their values.

| role | light | dark |
| --- | --- | --- |
| accent | `#7a2a5e` | `#e69ac8` |
| accent-hover | `#62204b` | `#f0b8da` |
| accent-soft | `#f5e6ef` | `#3a1830` |
| on-accent | `#ffffff` | `#120f14` |
| bg / surface / sunken | `#f8f7f8` / `#ffffff` / `#f0eef1` | `#120f14` / `#1b171d` / `#0e0b10` |
| text / muted / subtle | `#1d1a1f` / `#5a5560` / `#67616d` | `#eeeaf0` / `#b0a8b5` / `#968e9c` |
| border / input border | `#e5e1e6` / `#807887` | `#2f2832` / `#786f7e` |
| chart line / band | `#7a2a5e` / `#ecd2e2` | `#e69ac8` / `#3d1f33` |

The up, down, signal and warning colours are unchanged. They're meanings, not brand.

How it was checked:
- `contrast.py`: 66 pairs, **0 failing AA**.
- Playwright: axe checks pass in light and dark mode on every screen, 63 of 63 tests.
- A scan for any colour within hue 215 to 250 in `apps/web` found none, so there are no near misses of
  the original's indigo either.

## 3. Logo brief

- **The idea.** A forecast with its result attached: a short line ending in a check-shaped tick. One stroke
  says "we called it, and here's how it went". Tie it to the "P" only if that reads at small sizes.
- **Mark type.** A symbol plus a wordmark. The symbol must work alone as the app icon.
- **Wordmark.** Inter, semibold, sentence case: "Proofcast". No custom letterform tricks.
- **Colour.** Plum `#7a2a5e` on white, or white on plum. One colour, no gradient.
- **Sizes.** It must work at 16px as a favicon (check it at that size) and as a 1024px app icon.
- **Deliverables:**
  - SVG (symbol, wordmark, lockup)
  - iOS app icon at 1024×1024 with **no transparency**
  - Android adaptive icon (foreground and background)
  - a favicon set (16, 32 and 180px, plus an SVG)
  - a social image at 1200×630
- **Must not look like the original's mark.**
  - No indigo or periwinkle, and no blue-to-violet gradient.
  - No coin, no "B", no circle-in-circle coin shape.
  - Put the original's logo next to every draft and check for any shared shape, colour pair or
    letterform trick.
  - Also avoid the generic crypto clichés: rockets, moons, candlestick bars.
- **The logo (2026-10-22), files in `design/logo/`.** The "Proof P": one thick rounded stroke where a tick's
  short arm runs into the slanted stem of a P. It's dimensional, warm peach where the tick lands (the result)
  rising to ivory, on a deep aubergine-to-plum tile with a soft forecast fan and a faint grid. The owner asked
  for a "more alive" look than the first flat draft, so the one-colour, no-gradient rule above was lifted.
  No blue, indigo or violet, no coin, no B.

  | file | used for |
  | --- | --- |
  | `apps/web/src/app/icon.svg` | browser tab, a simplified tile that reads at 16px |
  | `apps/web/src/app/apple-icon.png` | phone home screen, 180px |
  | `apps/web/src/app/opengraph-image.png` | link previews, 1200x630, with the tagline only |
  | `apps/web/public/brand/mark-animated.svg` | header in light mode: draws itself once in about 2.7 s, static under reduced motion |
  | `apps/web/public/brand/mark-light.svg` | header in dark mode |
  | `design/logo/icon-1024.png` | the master app icon (RGB, no alpha) for the stores |
  | `design/logo/lockup-*.svg` | mark plus the wordmark outlined from Inter SemiBold |

  Still to make before a store launch: an Android adaptive icon.

## 4. Voice

Three words, and what each does not mean:
- **Plain, not dumbed down.** Short words and real numbers. The method is still there for anyone who
  wants it.
- **Accountable, not apologetic.** We show the misses as a matter of fact, without grovelling or spin.
- **Calm, not cold.** No hype and no urgency, but still a person talking.

| do | don't |
| --- | --- |
| "61% chance it's higher in a week" | "Strong bullish momentum incoming!" |
| "Missed: forecast $70,100, closed $66,400" | leave a miss out, or call it "a learning" |
| "Statistics, not advice" | "Our AI knows where the market goes" |
| "This page didn't load. Try again." | "Oops! Something went wrong 😅" |
| "Stop these alerts" | "Are you sure? You'll miss out on opportunities" |

### The 10 most-seen strings, rewritten

All are new wording. None echo the original's.

| where | before | after |
| --- | --- | --- |
| browser title (every page) | App name: price forecasts with a public track record | Proofcast: price forecasts with every result kept |
| home title | App name: price forecasts you can check | Proofcast: forecasts with the misses left in |
| header | App name | Proofcast |
| sign-up heading | Create your account | Set up your account |
| forecasts heading | Where each market could be next | Where each market could go next |
| track record heading | How often the forecasts were right | Every forecast, scored. Misses included. |
| track record, empty | No scored forecasts yet | Nothing scored yet |
| watchlist, empty | Nothing on your watchlist yet / Tap the star next to any asset to follow it here. | Your watchlist is empty / Star any asset to keep it here. |
| no results | Nothing matches these filters | No assets match these filters |
| error page | Something went wrong loading this page / Your data is safe… | This page didn't load / Nothing you saved is lost. Try again, or come back in a minute. |
| 404 | We couldn't find that page | There's nothing at this address |
| email sender | Forecasts | Proofcast |

Other strings already in the voice were left as they were: the alert and verification emails, "Email
confirmed", and the "statistics, not financial advice" footer.

## 5. Sweep

```bash
python3 .claude/skills/replica-brand/sweep.py . --config replica/brand.json
```

Result on 2026-10-22: **Clean.**
- It searched every file and folder name in the repo, except `replica/` (where the original's name
  belongs), `node_modules` and build output.
- It looked for "BeCoin", "Be Coin" and `becoin.net`, and for the original's 12 measured colours.
- The sweep matches exact colours only, so I also ran the hue scan above, which found no near misses.

Checked by eye:
- **Page titles:** above.
- **Header:** the screenshots in `replica/clone-screens/S02`, `S06` and `S12` were retaken with the new
  brand.
- **Email templates:** plain text with no brand except the sender name.
- **Favicon, OG image and app icon:** none exist yet, so there's nothing left over (see the logo brief).
