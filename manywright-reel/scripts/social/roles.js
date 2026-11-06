const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 15 Pro'], viewport: { width: 393, height: 740 } });
  const p = await ctx.newPage();
  await p.goto('https://manywright.com/services/social-and-email/', { waitUntil: 'networkidle' });
  const info = await p.evaluate(() => [...document.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Content Creator').map((e) => { const chain = []; let x = e; for (let i = 0; i < 4 && x; i++) { chain.push(x.tagName + (x.className ? '.' + String(x.className).split(' ')[0] : '')); x = x.parentElement; } return chain.join(' < '); }));
  console.log(info);
  const roles = ['Content Creator', 'Social Media Strategist', 'Instagram Curator', 'Email Marketing Strategist', 'Visual Storyteller'];
  const meta = JSON.parse(require('fs').readFileSync('pieces/meta.json'));
  for (let i = 0; i < roles.length; i++) {
    const h = await p.evaluateHandle((t) => { const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === t); return el.parentElement.parentElement; }, roles[i]);
    const el = h.asElement(); await el.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, -120)); await p.waitForTimeout(1300);
    await el.screenshot({ path: `pieces/role${i}.png`, scale: 'device' });
    const box = await el.boundingBox(); meta[`role${i}`] = { w: Math.round(box.width), h: Math.round(box.height), text: (await el.innerText()).trim() };
    console.log(`role${i}`, Math.round(box.width) + 'x' + Math.round(box.height), JSON.stringify(meta[`role${i}`].text));
  }
  require('fs').writeFileSync('pieces/meta.json', JSON.stringify(meta, null, 1));
  await b.close();
})();
