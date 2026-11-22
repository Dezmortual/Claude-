// Renders scene.html to frames and pipes them into ffmpeg.
// usage: node render.js stills <outdir> <t1> <t2> ...   |   node render.js video <out.mp4> [start end]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path'); const fs = require('fs');
(async () => {
  const [mode, out, ...rest] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on('pageerror', e => console.error('PAGE ERROR', e.message));
  await p.goto('file://' + path.join(__dirname, 'scene.html'));
  await p.evaluate(() => window.ready);
  const grab = async T => Buffer.from((await p.evaluate(T => { render(T); return document.getElementById('c').toDataURL('image/jpeg', 0.93); }, T)).split(',')[1], 'base64');
  if (mode === 'stills') {
    for (const T of rest) fs.writeFileSync(path.join(out, `t${T}.jpg`), await grab(+T));
  } else {
    const FPS = 30, s = +(rest[0] || 0), e = +(rest[1] || 35);
    const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let f = Math.round(s * FPS); f < Math.round(e * FPS); f++) {
      const buf = await grab(f / FPS);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end(); await new Promise(r => ff.on('close', r));
  }
  await b.close();
})();
