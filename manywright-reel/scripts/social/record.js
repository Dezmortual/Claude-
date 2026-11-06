// Records (in slow motion, R = 0.18, for full 3x-density frames) a real, scripted session on manywright.com/services/social-and-email/ in iPhone 15 Pro
// emulation. Frames come from the CDP screencast (60 fps, 1179x2556). Taps are real touch events.
// Writes frames/, frames.json (timestamps), events.json (taps + element rects in CSS px).
const { chromium, devices } = require('playwright');
const fs = require('fs');
const OUT = __dirname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = 0.18; // real seconds run at 18% speed; everything is converted back to session time
const sleepV = (ms) => sleep(ms / R);

(async () => {
  fs.rmSync(`${OUT}/frames`, { recursive: true, force: true });
  fs.mkdirSync(`${OUT}/frames`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 740 } });
  const page = await ctx.newPage();
  await page.goto('https://manywright.com/services/social-and-email/', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await sleep(1500);

  const cdp = await ctx.newCDPSession(page);
  const slow = async () => { await cdp.send('Animation.enable'); await cdp.send('Animation.setPlaybackRate', { playbackRate: R }); };
  await slow();
  page.on('load', () => slow().catch(() => {}));
  const frames = [];
  let capturing = true;
  const capture = (async () => {
    while (capturing) {
      const t1 = Date.now() / 1000;
      try {
        const buf = await page.screenshot({ type: 'jpeg', quality: 92, scale: 'device' });
        const t2 = Date.now() / 1000, n = frames.length;
        fs.writeFileSync(`${OUT}/frames/f${String(n).padStart(5, '0')}.jpg`, buf);
        frames.push({ n, real: (t1 + t2) / 2 });
      } catch (e) { await sleep(30); }
    }
  })();
  await sleepV(500);
  const T0 = Date.now() / 1000;
  const events = [];
  const now = () => (Date.now() / 1000 - T0) * R; // session time
  const at = async (t) => { const w = (t - now()) * 1000; if (w > 0) await sleepV(w); };
  // smooth eased scroll executed inside the page so it is frame-accurate
  const scrollTo = (y, dur) => page.evaluate(([y, dur]) => new Promise((res) => {
    const y0 = window.scrollY, s = performance.now();
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const step = () => { const k = Math.min(1, (performance.now() - s) / (dur / 0.18)); window.scrollTo(0, y0 + (y - y0) * ease(k)); k < 1 ? requestAnimationFrame(step) : res(); };
    requestAnimationFrame(step);
  }), [y, dur]);
  const docY = (sel, text) => page.evaluate(([sel, text]) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.innerText.trim().startsWith(text));
    return el.getBoundingClientRect().top + window.scrollY;
  }, [sel, text]);
  const rect = async (key, sel, text, up = 'article,li,div') => {
    const r = await page.evaluate(([sel, text, up]) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.innerText.trim().startsWith(text));
      const box = (up ? el.closest(up) : el) || el;
      const b = box.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    }, [sel, text, up]);
    events.push({ t: now(), type: 'rect', key, rect: r });
  };
  const tap = async (key, sel, text) => {
    const b = await page.evaluate(([sel, text]) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.innerText.trim().startsWith(text));
      const r = el.getBoundingClientRect();
      return { x: r.left + Math.min(r.width / 2, 140), y: r.top + r.height / 2 };
    }, [sel, text]);
    events.push({ t: now(), type: 'tap', key, x: b.x, y: b.y });
    await page.touchscreen.tap(b.x, b.y);
  };

  // ---------- the session ----------
  // S0 hero
  await rect('hero', 'h1', 'Post every week', 'section,header');
  await at(1.4); await scrollTo(60, 1500);
  // S1 who it's for
  await at(3.0); await scrollTo((await docY('h2', 'For owners who know')) - 150, 750);
  await rect('whofor', 'p', 'Your Facebook page', null);
  await scrollTo((await docY('h2', 'For owners who know')) + 60, 2000);
  // S2 the six monthly cards, 2.5 s each
  const cards = ['A planned calendar', 'Captions and graphics', 'Scheduled for you', 'Seasonal promotions', 'Short videos (Plus)', 'Email newsletter (Plus)'];
  for (let i = 0; i < cards.length; i++) {
    await at(6.0 + i * 2.5);
    await scrollTo((await docY('h3', cards[i])) - 330, 550);
    await sleepV(250);
    await rect(`card${i}`, 'h3', cards[i]);
  }
  // S3 packages: back up to the hero button, tap it, land on the packages
  await at(21.0); await scrollTo((await docY('a', 'See packages and prices')) - 520, 650);
  await at(22.0); await tap('packagesBtn', 'a', 'See packages and prices');
  await sleepV(900);
  await scrollTo((await docY('h3', 'Social Starter')) - 120, 450);
  await sleepV(200); await rect('starter', 'h3', 'Social Starter');
  await at(24.6); await scrollTo((await docY('h3', 'Social Plus')) - 120, 600);
  await sleepV(200); await rect('plus', 'h3', 'Social Plus');
  // S4 founding terms
  await at(27.0); await scrollTo((await docY('h3', 'Founding terms')) - 300, 600);
  await sleepV(200); await rect('founding', 'h3', 'Founding terms');
  // S5 how it works
  await at(29.5); await scrollTo((await docY('h2', 'From brief to scheduled posts')) - 120, 600);
  await rect('steps', 'h2', 'From brief to scheduled posts', 'section');
  await scrollTo((await docY('h3', 'Deliver')) - 520, 2600);
  // S6 line-up
  await at(33.0); await scrollTo((await docY('h2', 'The line-up for this work')) - 120, 600);
  await rect('lineup', 'h2', 'The line-up for this work', 'section');
  await scrollTo((await docY('h2', 'The line-up for this work')) + 260, 2100);
  // S7 FAQ: open two answers
  await at(36.0); await scrollTo((await docY('h2', 'Straight answers')) - 140, 600);
  await at(37.0); await tap('faq1', 'summary', 'Do I have to approve every post?');
  await sleepV(700); await rect('faq1open', 'summary', 'Do I have to approve every post?', 'details');
  await at(39.0); await tap('faq4', 'summary', 'Which platforms are covered?');
  await sleepV(700); await rect('faq4open', 'summary', 'Which platforms are covered?', 'details');
  // S8 call to action → the real proposal form
  await at(41.0); await scrollTo((await docY('h2', 'Ready to post regularly again?')) - 260, 650);
  await rect('cta', 'h2', 'Ready to post regularly again?', 'section,div');
  await at(43.0);
  const ctaY = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((e) => e.innerText.startsWith('Ready to post'));
    const a = [...h.parentElement.querySelectorAll('a')].find((e) => e.innerText.trim() === 'Request a proposal');
    const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  events.push({ t: now(), type: 'tap', key: 'proposal', x: ctaY.x, y: ctaY.y });
  await page.touchscreen.tap(ctaY.x, ctaY.y);
  await sleepV(1800);
  events.push({ t: now(), type: 'url', url: page.url() });
  await at(46.5);

  capturing = false; await capture;
  fs.writeFileSync(`${OUT}/frames.json`, JSON.stringify({ T0, R, frames: frames.map((f) => ({ n: f.n, t: (f.real - T0) * R })) }, null, 0));
  fs.writeFileSync(`${OUT}/events.json`, JSON.stringify(events, null, 1));
  console.log('frames', frames.length, 'span', ((frames.at(-1).real - T0) * R).toFixed(2), 'events', events.length, 'final url', page.url());
  await browser.close();
})();
