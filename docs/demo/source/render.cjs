// node render.cjs stills "2:4.2,3:2.8"   → ${process.env.STILLS || 'tmp'}/still-<scene>-<t>.jpg
// node render.cjs video [sceneIdx…]       → scenes/NN-name.mp4 (one encode per scene)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const FPS = 30;
(async () => {
  const [mode, arg, ...rest] = process.argv.slice(2);
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const pg = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await pg.goto('file://' + path.resolve('stage.html'));
  await pg.evaluate(() => document.fonts.ready);
  await pg.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => i.onload = r))));
  // preload popup images
  await pg.evaluate(() => Promise.all(['a-list','b-grid','c-other-form','d-added','f-personal','g-share','h-restore'].map(n => new Promise(r => { const i = new Image(); i.onload = r; i.src = 'shots/' + n + '.png'; }))));
  const scenes = await pg.evaluate(() => window.SCENES);
  fs.mkdirSync('scenes', { recursive: true }); fs.mkdirSync(process.env.STILLS || 'tmp', { recursive: true });
  const frame = async (i, t) => { await pg.evaluate(([i, t]) => window.render(i, t), [i, t]); return pg.screenshot({ type: 'jpeg', quality: 92 }); };
  if (mode === 'stills') {
    for (const s of arg.split(',')) { const [i, t] = s.split(':').map(Number); fs.writeFileSync(`${process.env.STILLS || 'tmp'}/still-${i}-${t}.jpg`, await frame(i, t)); }
  } else {
    const list = arg ? [arg, ...rest].map(Number) : scenes.map((_, i) => i);
    for (const i of list) {
      const s = scenes[i], n = Math.round(s.dur * FPS);
      const out = `scenes/${String(i).padStart(2, '0')}-${s.name}.mp4`, tmp = out.replace('.mp4', '.part.mp4');
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart', tmp], { stdio: ['pipe', 'inherit', 'inherit'] });
      const t0 = Date.now();
      for (let f = 0; f < n; f++) { const buf = await frame(i, f / FPS); if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); }
      ff.stdin.end();
      const code = await new Promise(r => ff.on('close', r));
      if (code !== 0) throw new Error('ffmpeg failed on ' + s.name);
      fs.renameSync(tmp, out);
      console.log(out, n, 'frames', ((Date.now() - t0) / 1000).toFixed(1) + 's');
    }
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
