---
name: social-content
description: Write on-brand social media posts for manywright.com — X/Twitter, LinkedIn, Instagram, Facebook, Threads, TikTok/Reels scripts, Pinterest, YouTube Shorts. Use when the user asks for social posts, captions, threads, hooks, a launch announcement, or wants a page, blog post or product on manywright.com turned into social content.
---

# Social content for manywright.com

Every post is grounded in what manywright.com actually says. Never invent
features, prices, results, testimonials, stats or customer names.

## Step 1 — Load the brand profile

Read `references/brand.md`.

- If it still contains `STATUS: NOT YET FILLED`, run **Brand discovery** (below)
  before writing anything.
- If it is filled but older than 60 days (see `Last updated`), offer to refresh it.

### Brand discovery

1. Fetch https://manywright.com/ and every page linked from its main
   navigation and footer (about, pricing, features/products, blog, FAQ).
   Use WebFetch; if the host can't be reached, ask the user to paste the
   homepage and about-page text, or to allow `manywright.com` in the
   session's network settings.
2. Fill in every section of `references/brand.md` using only what the site
   says. Quote taglines verbatim. Mark anything you could not find as
   `UNKNOWN — ask user` instead of guessing.
3. Show the user the filled profile and ask them to correct it, especially
   audience, tone and the things they never want said. Save their edits.

## Step 2 — Pin down the brief

Settle these, taking sensible defaults instead of asking when the request
already implies them:

| Field | Default |
|---|---|
| Platform(s) | the ones listed under `Active platforms` in brand.md |
| Goal | traffic to the site |
| Source | a specific URL/page on manywright.com, or a topic from `Content pillars` |
| Number of variants | 3 per platform |
| Link | the most specific manywright.com page for the topic, with UTM tags |

If the source is a URL on the site, fetch it and work from its real content.

## Step 3 — Write

Follow `references/platforms.md` for each platform's length, format and
hashtag rules. For every post:

- **Hook first.** The first line must earn the next one. Use one of the hook
  patterns in `references/platforms.md` and vary them across variants.
- **One idea per post.** One takeaway, one call to action.
- **Brand voice.** Match the tone and vocabulary in brand.md; avoid every
  phrase on its `Never say` list.
- **Plain, specific language.** No "unlock", "elevate", "game-changer",
  "in today's fast-paced world", "dive in", or emoji walls.
- **CTA + link.** Link to the page that matches the post, tagged
  `?utm_source=<platform>&utm_medium=social&utm_campaign=<slug>`.
- **Visual brief.** For image/video platforms, add a short brief: what's in
  the image or each scene, on-screen text, and alt text.

## Step 4 — Self-check before showing

Reject and rewrite any post that:
- states a fact, number or claim not found on the site or given by the user;
- goes over the platform's character limit (count it);
- opens with the brand name or a generic question ("Did you know…?");
- repeats the same hook pattern as another variant.

## Step 5 — Save and present

Save to `social/YYYY-MM-DD-<slug>.md` in the repo, using this layout:

```markdown
# <Campaign / topic> — <date>
Source: <url>  ·  Goal: <goal>

## LinkedIn
### Variant A — <hook pattern>
<post text>

Link: <utm url>
Visual: <brief>  ·  Alt text: <alt>
Chars: <n>/<limit>
```

Then show the user the posts in chat and ask which variants to keep or tweak.
