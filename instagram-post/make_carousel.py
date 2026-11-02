"""Builds carousel.html (all 6 slides of the Business Model post) from business-model.html.

Render:  node ../paid-on-time/build/render.js png carousel.html slide-%d.png .all-.post 1200 1500
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(HERE, "business-model.html")).read()
css = src[src.index("<style>"):src.index("</style>") + 8]
fonts = '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">'
slide2 = src[src.index('<div class="post">'):src.rindex("</div>\n</body>") + 6]

BRAND, HANDLE = "Dezlin Oliver", "@dezlinoliver"
LOGO = ('<svg width="44" height="40" viewBox="0 0 44 40"><path d="M4 26 L22 8 L40 8 L22 26 Z" fill="#7BC043"/>'
        '<path d="M4 34 L14 24 L30 24 L20 34 Z" fill="#3FA34D"/></svg>')
O = '<b style="color:var(--orange)">{}</b>'.format


def top(n):
    return (f'<div class="top"><div class="brand">{LOGO}{BRAND}</div>'
            f'<div class="handle">{HANDLE}</div><div class="page">0{n}/06</div></div>')


def card(icon, title, desc, label=""):
    lab = f'<div class="num">{label}</div>' if label else ""
    return (f'<div class="card"><div class="icon"><svg viewBox="0 0 24 24">{icon}</svg></div>'
            f'<div>{lab}<div class="title">{title}</div><div class="desc">{desc}</div></div></div>')


def steps(cards):
    return '<div class="steps">' + '<div class="link"></div>'.join(cards) + "</div>"


def row(state, cls, title, desc):
    return (f'<div class="trow"><div class="st {cls}">{state}</div><div>'
            f'<div class="title" style="font-size:38px">{title}</div><div class="desc">{desc}</div></div></div>')


I = dict(
    user='<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    chat='<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    star='<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    q='<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>',
    grid='<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    doc='<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
    bolt='<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    hand='<path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"/>',
    box='<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    tag='<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.5"/>',
    store='<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',
    send='<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
)

slides = []

# 1 — cover
slides.append(f"""<div class="post">{top(1)}
<h1 style="margin-top:120px;font-size:128px">The Easiest<br>Side Hustle.</h1>
<div class="tag" style="margin-top:40px;font-size:38px">No stock. No shop. No investors.</div>
<div class="flow">
  <div class="fbox"><b>1</b> problem</div><div class="arrow">→</div>
  <div class="fbox"><b>1</b> simple fix</div><div class="arrow">→</div>
  <div class="fbox">sold <b>online</b></div>
</div>
<div class="tag" style="margin-top:60px;color:var(--muted);font-size:30px;text-align:center;line-height:1.4">Here’s the whole model, and how I’m<br>using it right now.</div>
<div class="end" style="position:absolute;bottom:70px">Swipe {O('→')}</div>
</div>""")

# 2 — the business model (the original slide)
slides.append(slide2)

# 3 — find problems
slides.append(f"""<div class="post">{top(3)}
<h1>Where to Find<br>Problems.</h1>
<div class="tag">Listen for complaints. They’re everywhere.</div>
{steps([
    card(I['user'], 'Your own frustrations.', 'What annoyed you this week?<br>Someone else has the same problem.', 'Look here'),
    card(I['chat'], 'Reddit and forums.', 'Search “I hate when” or “is there a tool for”<br>plus your niche.', 'Look here'),
    card(I['star'], 'Bad reviews.', '1–3 star reviews of popular products<br>tell you exactly what’s missing.', 'Look here'),
    card(I['q'], 'Questions you get asked.', 'If friends keep asking you,<br>strangers will pay for the answer.', 'Look here'),
])}
<div class="end">Real pain + people already paying {O('= go')}</div>
</div>""")

# 4 — build solutions
slides.append(f"""<div class="post">{top(4)}
<h1>Build It<br>Small.</h1>
<div class="tag">The smallest thing that fixes the problem.</div>
{steps([
    card(I['grid'], 'A template.', 'Spreadsheet, Notion or Canva.<br>You can build one in a day.', 'Easiest'),
    card(I['doc'], 'A guide.', 'Step-by-step PDF with checklists<br>and copy-paste scripts.', 'Easy'),
    card(I['bolt'], 'A simple tool.', 'A one-page app. Can’t code?<br>Use AI to help you build it.', 'Medium'),
    card(I['hand'], 'A service.', 'Do it for clients by hand first.<br>Turn it into a product later.', 'Start today'),
])}
<div class="end">Done beats perfect. {O('Ship in a week.')}</div>
</div>""")

# 5 — sell solutions
slides.append(f"""<div class="post">{top(5)}
<h1>Sell It<br>Online.</h1>
<div class="tag">Package it. Price it. Share it.</div>
{steps([
    card(I['box'], 'Name the result.', '“Paid On Time”, not “Invoice Template v2”.<br>People buy outcomes.', '01'),
    card(I['tag'], 'Price it simply.', '$9–$29 for a first digital product.<br>A launch discount for early buyers.', '02'),
    card(I['store'], 'Use a ready store.', 'Gumroad or Payhip. Free to start,<br>and they handle the payments.', '03'),
    card(I['send'], 'Post the problem.', 'Not the product. Show the fix,<br>then say “comment for the link”.', '04'),
])}
<div class="end">Then improve it, and {O('repeat.')}</div>
</div>""")

# 6 — proof + CTA
slides.append(f"""<div class="post">{top(6)}
<h1>I’m Doing<br>This Now.</h1>
<div class="tag">Every step of the model, in public.</div>
<div class="tl">
  {row('Done', 'done', 'Found a problem.', 'Freelancers lose about 20 days a year<br>chasing late invoices.')}
  {row('Done', 'done', 'Built the fix.', 'Paid On Time: an app, a tracker and<br>12 reminder scripts.')}
  {row('Next', 'next', 'Selling it.', 'Launching it on this page.<br>You’ll see exactly how it goes.')}
  {row('Then', 'then', 'Repeat.', 'Improve it from buyer feedback,<br>then pick the next problem.')}
</div>
<div class="end" style="margin-top:44px">Follow {O(HANDLE)} for every step</div>
</div>""")

extra = """<style>
  body{display:flex;flex-direction:column;gap:30px;background:#ddd;padding:30px;align-items:flex-start}
  .flow{display:flex;align-items:center;gap:16px;margin-top:70px}
  .fbox{border:2px solid var(--line);border-radius:22px;box-shadow:0 6px 18px rgba(0,0,0,.06);padding:26px 28px;font-size:34px;font-weight:600;background:#fff}
  .fbox b{color:var(--orange);font-weight:800}
  .arrow{font-size:44px;color:var(--orange);font-weight:800}
  .tl{margin-top:34px;width:820px;border:2px solid var(--line);border-radius:22px;box-shadow:0 6px 18px rgba(0,0,0,.06);padding:10px 34px}
  .trow{display:flex;gap:28px;align-items:center;padding:34px 0;border-top:2px solid var(--line)}
  .trow:first-child{border-top:0}
  .st{flex:none;width:110px;text-align:center;border-radius:30px;padding:6px 0;font-weight:700;font-size:24px}
  .st.done{background:var(--orange);color:#fff}
  .st.next{background:var(--orange-soft);color:var(--orange);border:2px solid var(--orange)}
  .st.then{background:#f2f2f2;color:var(--muted)}
</style>"""

page = (f'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>Business Model Carousel</title>\n'
        f'{fonts}\n{css}\n{extra}\n</head><body>\n' + "\n\n".join(slides) + "\n</body></html>\n")
open(os.path.join(HERE, "carousel.html"), "w").write(page)
print(len(slides), "slides")
