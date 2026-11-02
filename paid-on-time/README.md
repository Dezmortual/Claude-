# Paid On Time

The four steps from the "Business Model" card, done for one product:

| Step | What's here |
|---|---|
| **01 Find problems** | [`01-research.md`](01-research.md): the problems researched, how they scored, and why late invoices won |
| **02 Build solutions** | [`product/`](product/): the app (`Paid-On-Time-App.html`), the spreadsheet (`Paid-On-Time-Tracker.xlsx`) and the guide (`Paid-On-Time-Playbook.pdf`) |
| **03 Sell solutions** | [`sell/`](sell/): `Paid-On-Time-Kit.zip` (the file buyers download), the store listing, the 6-slide Instagram carousel, captions, DM script, 7-day launch plan |
| **04 Repeat forever** | [`repeat/`](repeat/): the weekly loop, scorecard and feedback log, the improvement backlog, and the next 3 problems |

## What you need to do (Claude can't do these for you)
1. Replace **YourBrand / @yourhandle** on the carousel (`build/visuals.html`).
2. Create the Gumroad/Payhip product with `sell/gumroad-listing.md` and connect payouts.
3. Post the carousel and answer the DMs using `sell/instagram-launch.md`.
4. Every Sunday, fill in `repeat/weekly-scorecard.csv` and follow `repeat/playbook.md`.

## Rebuilding files after edits (run from `paid-on-time/`)
```bash
python3 build/make_xlsx.py build product/Paid-On-Time-Tracker.xlsx
python3 build/make_guide.py build/guide.html && node build/render.js pdf build/guide.html product/Paid-On-Time-Playbook.pdf
node build/render.js png build/visuals.html sell/img/carousel-%d.png .all-.slide 1200 1500
node build/render.js png build/visuals.html sell/img/gumroad-cover.png .cover 1400 900
node build/render.js png build/visuals.html sell/img/gumroad-thumbnail.png .thumb 1400 900
cd product && zip -q -X ../sell/Paid-On-Time-Kit.zip READ-ME-FIRST.txt Paid-On-Time-App.html Paid-On-Time-Tracker.xlsx Paid-On-Time-Playbook.pdf
```
Reminder scripts live in `build/scripts.py` (spreadsheet + guide) and in the app's `template()` function. Keep the two in sync.
