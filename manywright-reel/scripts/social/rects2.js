const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 740 } });
  const p = await ctx.newPage();
  await p.goto('https://manywright.com/services/social-and-email/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1000);
  const r = await p.evaluate(() => {
    const find = (sel, t) => [...document.querySelectorAll(sel)].find((e) => (e.innerText || e.textContent || '').trim().startsWith(t));
    const R = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
    const out = { price: R(find('p,div', 'FROM $995/MO')), art: R(find('svg', 'CALENDAR')) };
    for (const [k, t] of [['starter', 'Social Starter'], ['plus', 'Social Plus']]) {
      const card = find('h3', t).closest('article,li,div'); const c = card.getBoundingClientRect();
      const rel = (el) => { const b = el.getBoundingClientRect(); return { x: b.left - c.left, y: b.top - c.top, w: b.width, h: b.height }; };
      const priceEl = [...card.querySelectorAll('*')].find((e) => e.children.length <= 2 && /^\$[\d,]+/.test(e.innerText.trim()));
      const limitsEl = [...card.querySelectorAll('*')].find((e) => e.children.length === 0 && /platforms, \d+ posts/.test(e.textContent));
      out[k] = { price: rel(priceEl), priceText: priceEl.innerText.trim(), limits: rel(limitsEl), limitsText: limitsEl.textContent.trim() };
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  require('fs').writeFileSync('rects2.json', JSON.stringify(r));
  await b.close();
})();
