// Builds the Manywright Facebook cover and ad images from HTML and exports pixel-exact PNGs.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const FONTS = path.join(__dirname, '../manywright-reel/public');
const photo = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(DIR, 'portrait.jpg')).toString('base64');
const font = (f) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(FONTS, f)).toString('base64');

// the M, traced from the logo (512px master coordinates)
const M = `<svg viewBox="118 144 275 223" class="m"><polygon points="122,168 170,249 170,363 122,363" fill="#F4F6FA"/><polygon points="122,148 178,148 252,274 252,363 249,363" fill="#F4F6FA"/><polygon points="389,148 333,148 259,276 259,363 262,363" fill="#F5A524"/><polygon points="389,168 341,249 341,363 389,363" fill="#F4F6FA"/></svg>`;
const SERVICES = ['Websites', 'Local search', 'Social + email', 'Bookkeeping', 'Customer inbox', 'Online booking', 'Logo + brand', 'Security'];

const css = `
@font-face { font-family: Archivo; src: url(${font('Archivo-var.woff2')}) format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; }
@font-face { font-family: Mono; src: url(${font('JetBrainsMono-var.woff2')}) format('woff2'); font-weight: 100 800; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0F1B2D; }
.frame { position: relative; overflow: hidden; background: radial-gradient(ellipse at 75% 40%, #16283f 0%, #0F1B2D 60%); color: #F4F6FA; font-family: Archivo, sans-serif; }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(244,246,250,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(244,246,250,0.045) 1px, transparent 1px); background-size: 48px 48px; }
.photo { position: absolute; background-image: url(${photo}); background-size: cover; background-position: center top; mix-blend-mode: screen; filter: grayscale(1) contrast(1.12) brightness(1.02); }
.wordmark { display: flex; align-items: center; gap: 0.45em; font-stretch: 112%; letter-spacing: 0.02em; white-space: nowrap; }
.wordmark .m { height: 1em; width: auto; }
.wordmark b { font-weight: 900; } .wordmark span { font-weight: 300; }
.tag { font-weight: 800; font-stretch: 110%; line-height: 0.98; letter-spacing: -0.01em; }
.tag em { font-style: normal; color: #F5A524; }
.mono { font-family: Mono, monospace; letter-spacing: 0.12em; text-transform: uppercase; }
.chips { display: flex; flex-wrap: wrap; }
.chip { font-family: Mono, monospace; border: 1.5px solid rgba(244,246,250,0.35); color: #F4F6FA; white-space: nowrap; }
.chip:nth-child(3n+1) { border-color: rgba(245,165,36,0.85); }
.btn { display: inline-flex; align-items: center; background: #F5A524; color: #0F1B2D; font-weight: 800; font-stretch: 105%; border-radius: 6px; }
.url { font-family: Mono, monospace; color: #F5A524; letter-spacing: 0.04em; }
.rule { height: 3px; background: #F5A524; }
`;

const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="frame" style="width:${w}px;height:${h}px"><div class="grid"></div>${body}</div></body></html>`;

const designs = {
  // Facebook cover: 1640x624. Phones show only about the middle 1110px (x 265–1375), so all text lives inside that.
  'facebook-cover-1640x624': [1640, 624, `
    <div class="photo" style="left:820px;top:-30px;width:690px;height:690px;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 32%,#000 80%,transparent 100%),linear-gradient(0deg,transparent 0%,#000 14%);-webkit-mask-composite:source-in;"></div>
    <div style="position:absolute;left:300px;top:78px;width:700px;">
      <div class="wordmark" style="font-size:40px;">${M}<div><b>MANY</b><span>WRIGHT</span></div></div>
      <div class="tag" style="font-size:78px;margin-top:34px;">Every specialist.<br><em>One firm.</em></div>
      <div class="chips" style="gap:9px;margin-top:30px;width:690px;">${SERVICES.map((s) => `<div class="chip" style="font-size:15px;padding:7px 11px;">${s}</div>`).join('')}</div>
      <div style="display:flex;align-items:center;gap:22px;margin-top:28px;"><div class="url" style="font-size:26px;">manywright.com</div><div class="mono" style="font-size:13px;color:#8EA7BB;">Knysna · South Africa &amp; the US</div></div>
      <div class="mono" style="font-size:13px;color:#C9D3DD;margin-top:12px;">The founder stays your single point of contact</div>
    </div>`],

  // Feed ad, square
  'ad-square-1080x1080': [1080, 1080, `
    <div class="photo" style="left:360px;top:150px;width:930px;height:930px;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 34%),linear-gradient(0deg,transparent 0%,#000 18%);-webkit-mask-composite:source-in;"></div>
    <div style="position:absolute;left:72px;top:70px;">
      <div class="wordmark" style="font-size:44px;">${M}<div><b>MANY</b><span>WRIGHT</span></div></div>
      <div class="tag" style="font-size:96px;margin-top:46px;">Every<br>specialist.<br><em>One firm.</em></div>
      <div class="mono" style="font-size:20px;color:#C9D3DD;margin-top:30px;line-height:1.6;width:520px;">Websites, local search, social, books, inbox and security. One brief, one accountable lead.</div>
    </div>
    <div class="chips" style="position:absolute;left:72px;top:800px;gap:10px;width:560px;">${SERVICES.slice(0, 6).map((s) => `<div class="chip" style="font-size:17px;padding:8px 12px;background:rgba(15,27,45,0.75);">${s}</div>`).join('')}</div>
    <div style="position:absolute;left:72px;bottom:66px;display:flex;align-items:center;gap:26px;"><div class="btn" style="font-size:30px;padding:18px 30px;">Request a proposal</div><div class="url" style="font-size:24px;">manywright.com</div></div>`],

  // Feed ad, portrait 4:5
  'ad-portrait-1080x1350': [1080, 1350, `
    <div class="photo" style="left:300px;top:300px;width:1050px;height:1050px;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 36%),linear-gradient(0deg,transparent 0%,#000 22%),linear-gradient(180deg,transparent 0%,#000 14%);-webkit-mask-composite:source-in;"></div>
    <div style="position:absolute;left:72px;top:80px;">
      <div class="wordmark" style="font-size:46px;">${M}<div><b>MANY</b><span>WRIGHT</span></div></div>
      <div class="tag" style="font-size:104px;margin-top:48px;">Every specialist.<br><em>One firm.</em></div>
    </div>
    <div style="position:absolute;left:72px;top:930px;width:500px;">
      <div class="mono" style="font-size:20px;color:#C9D3DD;line-height:1.6;">Eight services for local and small businesses, each with a published starting price.</div>
      <div class="chips" style="gap:10px;margin-top:24px;">${SERVICES.slice(0, 6).map((s) => `<div class="chip" style="font-size:17px;padding:8px 12px;background:rgba(15,27,45,0.78);">${s}</div>`).join('')}</div>
    </div>
    <div style="position:absolute;left:72px;bottom:60px;display:flex;align-items:center;gap:26px;"><div class="btn" style="font-size:30px;padding:18px 30px;">Request a proposal</div><div class="url" style="font-size:24px;">manywright.com</div></div>`],

  // Link ad, landscape
  'ad-landscape-1200x628': [1200, 628, `
    <div class="photo" style="left:640px;top:-20px;width:640px;height:640px;-webkit-mask-image:linear-gradient(90deg,transparent 0%,#000 30%),linear-gradient(0deg,transparent 0%,#000 14%);-webkit-mask-composite:source-in;"></div>
    <div style="position:absolute;left:64px;top:60px;width:640px;">
      <div class="wordmark" style="font-size:36px;">${M}<div><b>MANY</b><span>WRIGHT</span></div></div>
      <div class="tag" style="font-size:74px;margin-top:34px;">Every specialist.<br><em>One firm.</em></div>
      <div class="mono" style="font-size:17px;color:#C9D3DD;margin-top:24px;line-height:1.6;width:560px;">Websites, local search, social, books, inbox and security. One brief, one accountable lead.</div>
      <div style="display:flex;align-items:center;gap:22px;margin-top:34px;"><div class="btn" style="font-size:24px;padding:14px 24px;">Request a proposal</div><div class="url" style="font-size:20px;">manywright.com</div></div>
    </div>`],

  // Profile picture: Facebook shows it as a circle, so everything sits inside the inscribed circle.
  // The logo stays small and quiet: a thin ring and a little wordmark under the photo, nothing over the face.
  'profile-picture-1080x1080': [1080, 1080, `
    <div class="photo" style="left:-55px;top:30px;width:1190px;height:1190px;-webkit-mask-image:linear-gradient(0deg,transparent 22%,#000 46%),radial-gradient(circle at 50% 40%,#000 50%,transparent 74%);-webkit-mask-composite:source-in;"></div>
    <div style="position:absolute;inset:26px;border-radius:50%;border:3px solid rgba(245,165,36,0.75);"></div>
    <div style="position:absolute;left:0;right:0;top:790px;height:290px;background:linear-gradient(180deg,rgba(15,27,45,0) 0%,rgba(15,27,45,0.92) 30%,#0F1B2D 60%);"></div>
    <div class="wordmark" style="position:absolute;left:0;right:0;top:858px;justify-content:center;font-size:58px;color:#FFFFFF;text-shadow:0 0 28px rgba(245,165,36,0.35),0 2px 10px rgba(0,0,0,0.6);">${M}<div><b>MANY</b><span style="font-weight:500;">WRIGHT</span></div></div>`],
};

(async () => {
  const b = await chromium.launch();
  const out = path.join(DIR, 'out'); fs.mkdirSync(out, { recursive: true });
  for (const [name, [w, h, body]] of Object.entries(designs)) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.setContent(page(w, h, body), { waitUntil: 'load' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(out, `${name}.png`), clip: { x: 0, y: 0, width: w, height: h } });
    // a 2x version for the cover, so it stays sharp on high-density screens
    if (name.startsWith('facebook-cover')) {
      const p2 = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
      await p2.setContent(page(w, h, body), { waitUntil: 'load' }); await p2.evaluate(() => document.fonts.ready); await p2.waitForTimeout(300);
      await p2.screenshot({ path: path.join(out, `${name}@2x.png`), clip: { x: 0, y: 0, width: w, height: h } });
    }
    console.log('wrote', name);
  }
  await b.close();
})();
