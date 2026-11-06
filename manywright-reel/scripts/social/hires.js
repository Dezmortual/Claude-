const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 740 }, deviceScaleFactor: 8 });
  const p = await ctx.newPage();
  await p.goto('https://manywright.com/services/social-and-email/', { waitUntil: 'networkidle' });
  for (const [k, t] of [['starter', 'Social Starter'], ['plus', 'Social Plus']]) {
    const card = await p.evaluateHandle((t) => [...document.querySelectorAll('h3')].find((e) => e.innerText.trim() === t).closest('article,li,div'), t);
    await card.asElement().scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -100)); await p.waitForTimeout(1300);
    const price = await p.evaluateHandle((c) => [...c.querySelectorAll('*')].find((e) => e.children.length <= 2 && /^\$[\d,]+/.test(e.innerText.trim())), card);
    await price.asElement().screenshot({ path: `pieces/${k}_price_hi.png`, scale: 'device' });
    const lim = await p.evaluateHandle((c) => [...c.querySelectorAll('*')].find((e) => e.children.length === 0 && /platforms, \d+ posts/.test(e.textContent)), card);
    await lim.asElement().screenshot({ path: `pieces/${k}_limits_hi.png`, scale: 'device' });
  }
  await b.close();
})();
