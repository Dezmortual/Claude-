// node build/render.js pdf <in.html> <out.pdf>   |   node build/render.js png <in.html> <out.png> <selector> [w] [h]
const { chromium } = require('playwright');
(async () => {
  const [mode, inp, out, sel, w, h] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +(w||1200), height: +(h||1200) } });
  await p.goto('file://' + require('path').resolve(inp), { waitUntil: 'networkidle' }).catch(()=>{});
  await p.evaluate(() => document.fonts.ready);
  if (mode === 'pdf') await p.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
  else if (sel && sel.startsWith('.all-')) { const els = await p.$$(sel.slice(5)); for (let i=0;i<els.length;i++) await els[i].screenshot({ path: out.replace('%d', i+1) }); }
  else await p.locator(sel).screenshot({ path: out });
  await b.close();
})();
