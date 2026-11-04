---
name: content-calendar
description: Plan a week or month of social media posts for manywright.com — a posting schedule across platforms balanced over the brand's content pillars, with every post drafted. Use when the user asks for a content calendar, posting schedule, content plan, or "a month of posts".
---

# Content calendar for manywright.com

## 1. Ground it

Read `.claude/skills/social-content/references/brand.md`. If it is not yet
filled, run the brand discovery step from the `social-content` skill first.
Fetch the site's blog/news page (if there is one) for recent material to reuse.

## 2. Plan

Defaults unless the user says otherwise: 4 weeks, starting next Monday, the
platforms under `Active platforms`, at this cadence:

| Platform | Posts / week |
|---|---|
| LinkedIn | 3 |
| Instagram | 3 (at least 1 carousel, 1 Reel) |
| X / Twitter | 5 |
| Facebook | 2 |
| TikTok | 2 |

Rules:
- Rotate the content pillars evenly; no pillar more than 40% of posts.
- No more than 1 in 4 posts is a direct "buy / sign up" push.
- Turn each site page or blog post into several posts across platforms
  rather than writing everything from scratch.
- Put dated events (launches, holidays the audience cares about) on their dates.

## 3. Draft

Write every post with the `social-content` skill's rules (hooks, limits,
UTM links, visual briefs, self-check), one variant each.

## 4. Save

Write `social/calendar-YYYY-MM.md`:

```markdown
# Content calendar — <month year>

| Date | Day | Platform | Pillar | Format | Hook | Link |
|---|---|---|---|---|---|---|

## Posts
### <date> · <platform> · <pillar>
<post text>
Link · Visual · Alt text · Chars
```

Also write `social/calendar-YYYY-MM.csv` (columns: date, time, platform,
text, link, image_brief) so it can be imported into Buffer, Hootsuite,
Later or Meta Business Suite. Default times: 9:00 local for LinkedIn,
12:00 for X/Facebook, 18:00 for Instagram/TikTok.

Then show the user the summary table and ask what to change.
