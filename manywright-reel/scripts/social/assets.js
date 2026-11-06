// Element screenshots (3x) of the real page, used as the pieces that "break out" of the phone.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const OUT = `${__dirname}/pieces`;
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 740 } });
  const p = await ctx.newPage();
  await p.goto('https://manywright.com/services/social-and-email/', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const meta = {};
  // find the element whose own text starts with `text`, then climb to a container
  const grab = async (name, sel, text, up, opts = {}) => {
    const h = await p.evaluateHandle(([sel, text, up]) => {
      const el = [...document.querySelectorAll(sel)].find((e) => (e.innerText || e.textContent || "").trim().startsWith(text));
      if (!el) return null;
      return up ? el.closest(up) || el : el;
    }, [sel, text, up]);
    const el = h.asElement();
    if (!el) { console.log('MISSING', name); return; }
    await el.scrollIntoViewIfNeeded();
    await p.evaluate(() => window.scrollBy(0, -120));
    await p.waitForTimeout(1300);
    await el.screenshot({ path: `${OUT}/${name}.png`, scale: 'device', ...opts });
    const box = await el.boundingBox();
    meta[name] = { w: Math.round(box.width), h: Math.round(box.height), text: (await el.evaluate((e) => (e.innerText || e.textContent || ''))).trim().slice(0, 200) };
  };
  await grab('heroH1', 'h1', 'Post every week', null);
  await grab('heroPrice', 'p,div', 'FROM $995/MO', null);
  await grab('heroArt', 'svg', 'CALENDAR', null);
  await grab('whoforP', 'p', 'Your Facebook page', null);
  const cards = ['A planned calendar', 'Captions and graphics', 'Scheduled for you', 'Seasonal promotions', 'Short videos (Plus)', 'Email newsletter (Plus)'];
  for (let i = 0; i < cards.length; i++) await grab(`card${i}`, 'h3', cards[i], 'article,li,div');
  await grab('starter', 'h3', 'Social Starter', 'article,li,div');
  await grab('plus', 'h3', 'Social Plus', 'article,li,div');
  await grab('founding', 'h3', 'Founding terms', 'article,aside,div');
  const steps = ['Brief', 'Propose', 'Make', 'Deliver'];
  for (let i = 0; i < steps.length; i++) await grab(`step${i}`, 'h3', steps[i], 'li,article,div');
  const roles = ['Content Creator', 'Social Media Strategist', 'Instagram Curator', 'Email Marketing Strategist', 'Visual Storyteller'];
  for (let i = 0; i < roles.length; i++) await grab(`role${i}`, 'h3,h4,strong,dt,p,span', roles[i], 'li,article,div');
  // FAQ answers, opened by a real tap
  for (const [name, q] of [['faq1', 'Do I have to approve every post?'], ['faq4', 'Which platforms are covered?']]) {
    const s = p.locator('summary', { hasText: q });
    await s.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
    await s.tap(); await p.waitForTimeout(900);
    await grab(name, 'summary', q, 'details');
  }
  await grab('cta', 'h2', 'Ready to post regularly again?', 'section,div');
  // the real proposal page reached from the CTA
  await p.goto('https://manywright.com/#proposal', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await grab('proposal', 'h2', 'Tell us what you need', 'section,div');
  fs.writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 1));
  for (const [k, v] of Object.entries(meta)) console.log(k, v.w + 'x' + v.h, JSON.stringify(v.text.slice(0, 70)));
  await b.close();
})();
