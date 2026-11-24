// Builds the store images in store/release/ from the REAL extension:
// loads dist/chromium in Chrome (Playwright), seeds fictional demo data through SL.store.save in the
// service worker, screenshots the real popup at deviceScaleFactor 2, reads the real menu titles from
// globalThis.__sl.menu(), then composes 1280×800 store screenshots, a 440×280 promo tile, a 300×300
// Edge logo and a 128×128 AMO icon by rendering HTML pages with Playwright.
// The right-click menus in the screenshots are HTML drawings that use the extension's real menu
// titles; they are not captures of the browser's native menu.
// Run: node build.mjs && NODE_PATH=$(npm root -g) node store/release/make-assets.cjs [path/to/chrome]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const ROOT = path.resolve(__dirname, '../..');
const EXT = path.join(ROOT, 'dist/chromium');
const OUT = __dirname;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-assets-'));

const DEMO = { v: 2, active: 'work', profiles: [
  { id: 'work', name: 'Work', owner: 'Alex Morgan', links: [
    { id: 'li01', p: 'linkedin', v: 'alex-morgan-dev', url: 'https://www.linkedin.com/in/alex-morgan-dev' },
    { id: 'gh01', p: 'github', v: 'alex-morgan-dev', url: 'https://github.com/alex-morgan-dev' },
    { id: 'so01', p: 'stackoverflow', v: 'https://stackoverflow.com/users/000000/alex-morgan', url: 'https://stackoverflow.com/users/000000/alex-morgan' },
    { id: 'ws01', p: 'website', v: 'https://alexmorgan.example.com/', url: 'https://alexmorgan.example.com/' },
    { id: 'em01', p: 'email', v: 'alex.morgan@example.com', url: 'mailto:alex.morgan@example.com' }] },
  { id: 'personal', name: 'Personal', owner: 'Alex Morgan', links: [
    { id: 'ig01', p: 'instagram', v: 'alexmorgan.photos', url: 'https://www.instagram.com/alexmorgan.photos' },
    { id: 'yt01', p: 'youtube', v: 'alexmorgan-makes', url: 'https://www.youtube.com/@alexmorgan-makes' },
    { id: 'xx01', p: 'x', v: 'alexmorgan_dev', url: 'https://x.com/alexmorgan_dev' }] }] };

const dataUrl = f => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'sl-assets-prof-')), {
    executablePath: process.argv[2] || undefined, headless: true,
    args: ['--headless=new', '--disable-features=DisableLoadExtensionCommandLineSwitch',
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 400, height: 600 }, deviceScaleFactor: 2
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const POPUP = `chrome-extension://${sw.url().split('/')[2]}/popup.html`;
  const seed = d => sw.evaluate(async d => { await SL.store.save(d); await globalThis.__sl.rebuild(); }, d);
  await seed(DEMO);

  // the real menu model, for each profile
  const menuOf = () => sw.evaluate(() => globalThis.__sl.menu().then(m => m.map(x => ({ id: x.id, parentId: x.parentId, title: x.title, type: x.type, checked: x.checked, contexts: x.contexts }))));
  const workMenu = await menuOf();
  fs.writeFileSync(path.join(TMP, 'menu-work.json'), JSON.stringify(workMenu, null, 1));

  // ---- real popup screenshots (popup layout: 400 px wide, not the tab layout)
  const page = await ctx.newPage();
  async function popupShot(name, prep, opts = {}) {
    await page.emulateMedia({ colorScheme: opts.dark ? 'dark' : 'light' });
    await page.setViewportSize({ width: 400, height: 600 });
    await page.goto(POPUP); await page.waitForSelector('.item');
    await page.evaluate(() => document.body.classList.remove('tab'));
    if (prep) await prep(page);
    await page.waitForTimeout(250);
    const h = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
    await page.setViewportSize({ width: 400, height: Math.max(h, 220) });
    await page.waitForTimeout(150);
    const f = path.join(TMP, name + '.png');
    await page.screenshot({ path: f });
    return f;
  }
  const shots = {};
  shots.work = await popupShot('popup-work');
  shots.grid = await popupShot('popup-grid', async p => { await p.click('#addBtn'); await p.waitForSelector('#grid .pf'); });
  shots.share = await popupShot('popup-share', async p => { await p.click('#shareBtn'); await p.waitForTimeout(300); });
  await seed(Object.assign({}, DEMO, { active: 'personal' }));
  shots.personal = await popupShot('popup-personal');
  const persMenu = await menuOf();
  await seed(DEMO);

  // ---- compose
  const T = id => (workMenu.find(x => x.id === id) || {}).title;
  const kids = (m, pid) => m.filter(x => (x.parentId || null) === pid);
  const row = (x, hi) => x.type === 'separator' ? '<div class="sep"></div>'
    : `<div class="mi${hi ? ' hi' : ''}${x.enabled === false ? ' off' : ''}">${x.type === 'radio' ? `<span class="ck">${x.checked ? '●' : ''}</span>` : ''}<span>${esc(x.title)}</span>${hi === 'sub' || hasKids(x) ? '<span class="ar">›</span>' : ''}</div>`;
  const curMenu = workMenu;
  const hasKids = x => curMenu.some(y => y.parentId === x.id);
  // only the items Chrome would show for a context (e.g. 'editable' or 'link')
  const visible = (m, pid, ctxs) => kids(m, pid).filter(x => (x.contexts || ['page']).some(c => ctxs.includes(c)));
  const menuBox = (m, pid, ctxs, hiId, style, limit) => { const v = visible(m, pid, ctxs); const cut = limit && v.length > limit; return `<div class="menu" style="${style}">${v.slice(0, limit || v.length).map(x => row(x, x.id === hiId)).join('')}${cut ? '<div class="mi off">…</div>' : ''}</div>`; };
  // y offset of a row inside its menu box (rows 33 px, separators 11 px), to line up a submenu with it
  const rowY = (m, pid, ctxs, id) => { let y = 0; for (const x of visible(m, pid, ctxs)) { if (x.id === id) return y; y += x.type === 'separator' ? 11 : 33; } return y; };

  const CSS = `
  *{box-sizing:border-box} html,body{margin:0}
  body{width:1280px;height:800px;overflow:hidden;font-family:"Segoe UI",Roboto,Ubuntu,"Noto Sans",system-ui,sans-serif;background:#eef4f2;color:#17201e;position:relative}
  .cap{height:132px;background:#00685a;color:#fff;display:flex;align-items:center;padding:0 64px;gap:22px}
  .cap img{width:64px;height:64px;border-radius:14px}
  .cap h1{font-size:46px;font-weight:650;margin:0;letter-spacing:-.5px}
  .stage{position:absolute;left:0;right:0;top:132px;bottom:0}
  .pop{position:absolute;border-radius:12px;box-shadow:0 12px 40px rgba(0,40,34,.22),0 0 0 1px rgba(0,0,0,.08);background:#fff;overflow:hidden}
  .pop img{display:block}
  .menu{position:absolute;min-width:240px;background:#fff;border-radius:8px;box-shadow:0 8px 28px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.1);padding:6px 0;font-size:15px}
  .mi{display:flex;align-items:center;gap:8px;height:33px;padding:0 18px;white-space:nowrap}
  .mi.hi{background:#dcefea} .mi.off{color:#8a9491}
  .mi .ar{margin-left:auto;padding-left:22px;color:#5b6763} .ck{width:12px;color:#00685a;font-size:11px}
  .sep{height:1px;background:#e3e8e6;margin:5px 0}
  .win{position:absolute;background:#fff;border-radius:12px;box-shadow:0 10px 36px rgba(0,40,34,.16),0 0 0 1px rgba(0,0,0,.06);overflow:hidden}
  .bar{height:44px;background:#f1f4f3;border-bottom:1px solid #dde3e1;display:flex;align-items:center;padding:0 16px;gap:8px}
  .dot{width:11px;height:11px;border-radius:50%;background:#cfd6d4}
  .url{margin-left:14px;flex:1;height:28px;border-radius:14px;background:#fff;border:1px solid #dde3e1;font-size:13.5px;color:#55605d;display:flex;align-items:center;padding:0 14px}
  .note{position:absolute;font-size:22px;line-height:1.45;color:#1f2b28}
  .note b{color:#00685a}
  .note ul{margin:0;padding-left:24px} .note li{margin:0 0 12px}
  label.f{display:block;font-size:14px;color:#47524f;margin:16px 0 6px}
  .in{height:40px;border:1px solid #c9d2cf;border-radius:8px;background:#fff;padding:0 12px;display:flex;align-items:center;font-size:15px;color:#17201e}
  .in.focus{border:2px solid #00685a;box-shadow:0 0 0 3px rgba(0,104,90,.15)}
  .caret{display:inline-block;width:1.5px;height:20px;background:#17201e;margin-left:1px}
  .cursor{position:absolute;width:22px}
  .badge{position:absolute;width:24px;height:24px;border-radius:5px;background:#00685a;color:#fff;font:700 14px/24px system-ui;text-align:center}
  `;
  const ICON = dataUrl(path.join(ROOT, 'src/icons/icon128.png'));
  const CURSOR = `<svg class="cursor" viewBox="0 0 24 34" style="__"><path d="M2 2 L2 27 L8.5 21 L13 31.5 L17.3 29.6 L12.9 19.3 L21.5 19.3 Z" fill="#fff" stroke="#111" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
  const cursorAt = (x, y) => CURSOR.replace('__', `left:${x}px;top:${y}px`);
  const frame = (cap, body) => `<!doctype html><meta charset="utf-8"><style>${CSS}</style><div class="cap"><img src="${ICON}" alt=""><h1>${esc(cap)}</h1></div><div class="stage">${body}</div>`;
  // popup image at 1/2 of its 2x pixel size, scaled by k
  const sizeOf = f => { const b = fs.readFileSync(f); return { w: b.readUInt32BE(16) / 2, h: b.readUInt32BE(20) / 2 }; };
  const pop = (f, x, y, k = 1, maxH = 1e9) => { const s = sizeOf(f); return `<div class="pop" style="left:${x}px;top:${y}px;width:${s.w * k}px;height:${Math.min(s.h * k, maxH)}px"><img src="${dataUrl(f)}" style="width:${s.w * k}px;height:${s.h * k}px"></div>`; };

  // 1. paste into a form
  const E = ['editable'], L = ['link'], P = ['page'];
  const li = workMenu.find(x => x.id === 'l:li01');
  const m1 = { x: 204, y: 352 }, m1b = { x: m1.x + 222, y: m1.y + rowY(workMenu, null, E, 'root') }, m1c = { x: m1b.x + 432, y: m1b.y + rowY(workMenu, 'root', E, li.id) };
  const s1 = frame('Your links, one right-click away', `
    <div class="win" style="left:64px;top:40px;width:700px;height:590px">
      <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">careers.example.com/apply/junior-developer</span></div>
      <div style="padding:26px 40px">
        <div style="font-size:26px;font-weight:650">Apply: Junior Developer</div>
        <label class="f">Full name</label><div class="in">Alex Morgan</div>
        <label class="f">Email</label><div class="in">alex.morgan@example.com</div>
        <label class="f">LinkedIn profile</label><div class="in focus"><span class="caret"></span></div>
        <label class="f">GitHub or portfolio</label><div class="in"></div>
      </div>
    </div>
    ${menuBox(workMenu, null, E, 'root', `left:${m1.x}px;top:${m1.y}px;min-width:210px`)}
    ${menuBox(workMenu, 'root', E, li.id, `left:${m1b.x}px;top:${m1b.y}px`)}
    ${menuBox(workMenu, li.id, E, 'v:li01', `left:${m1c.x}px;top:${m1c.y}px;min-width:190px`)}
    ${cursorAt(m1.x - 2, m1.y - 2)}
    <div class="note" style="left:${m1c.x + 10}px;top:${m1c.y + 150}px;width:${1270 - m1c.x - 20}px;font-size:20px">Right-click in a text box and choose <b>Paste here</b>. Open or copy any saved link the same way.</div>`);

  // 2. add from a link
  const m2 = { x: 520, y: 176 }, m2b = { x: m2.x + 222, y: m2.y + rowY(workMenu, null, L, 'root') }, m2c = { x: m2b.x + 200, y: m2b.y + rowY(workMenu, 'root', L, 'add') };
  const s2 = frame('Save any profile by right-clicking it', `
    <div class="win" style="left:64px;top:40px;width:720px;height:590px">
      <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">code.example.org/projects/weather-dashboard</span></div>
      <div style="padding:30px 40px;font-size:16px;color:#2d3735">
        <div style="font-size:26px;font-weight:650;color:#17201e">weather-dashboard</div>
        <p>A small dashboard for local forecasts. Maintained by <a style="color:#0b57d0;text-decoration:underline">github.com/alex-morgan-dev</a>.</p>
        <div style="height:14px;background:#e9eeec;border-radius:7px;width:85%;margin:22px 0 12px"></div>
        <div style="height:14px;background:#e9eeec;border-radius:7px;width:70%;margin:0 0 12px"></div>
        <div style="height:14px;background:#e9eeec;border-radius:7px;width:78%"></div>
      </div>
    </div>
    ${menuBox(workMenu, null, L, 'root', `left:${m2.x}px;top:${m2.y}px;min-width:210px`)}
    ${menuBox(workMenu, 'root', L, 'add', `left:${m2b.x}px;top:${m2b.y}px`)}
    ${menuBox(workMenu, 'add', L, 'save-link', `left:${m2c.x}px;top:${m2c.y}px;min-width:230px`, 8)}
    ${cursorAt(m2.x - 2, m2.y - 2)}
    <div class="note" style="left:104px;top:440px;width:560px;font-size:21px">The platform and username are recognised for you. Platforms you've saved show <b style="white-space:nowrap">✎ Edit</b>; the rest show <b style="white-space:nowrap">+ Add</b>.</div>`);

  // 3. + and ✎ tiles (real popup)
  const s3 = frame('+ to add, ✎ to edit', `
    ${pop(shots.grid, 110, 28, 1, 612)}
    <div class="note" style="left:640px;top:120px;width:560px"><ul>
      <li><b>✎</b> marks a platform you've already saved; click it to edit.</li>
      <li><b>+</b> adds a new one by username or URL, with checks for typos and wrong sites.</li>
      <li><b>Other link</b> adds any site under your own name.</li></ul></div>`);

  // 4. profiles (two real popups + menu drawing)
  const m4 = { x: 730, y: 60 }, m4b = { x: m4.x + 210, y: m4.y + rowY(workMenu, 'root', P, 'prof') };
  const s4 = frame('Work and Personal profiles', `
    ${pop(shots.work, 48, 30, 0.8)}
    ${pop(shots.personal, 384, 30, 0.8)}
    ${menuBox(workMenu, 'root', P, 'prof', `left:${m4.x}px;top:${m4.y}px`)}
    ${menuBox(workMenu, 'prof', P, 'pr:work', `left:${m4b.x}px;top:${m4b.y + 22}px;min-width:200px`)}
    <div class="note" style="left:${m4.x}px;top:470px;width:470px;font-size:20px">Keep separate sets of links and switch from the toolbar or from the right-click menu.</div>`);

  // 5. share card (real popup)
  const s5 = frame('Share as a QR code or vCard', `
    ${pop(shots.share, 110, 28, 0.95, 612)}
    <div class="note" style="left:640px;top:120px;width:560px"><ul>
      <li>Phones scan the QR code straight into their contacts.</li>
      <li>Download a <b>vCard</b> or save the QR image.</li>
      <li>Back up to a file and restore with a preview.</li></ul></div>`);

  const comp = await ctx.newPage();
  await comp.setViewportSize({ width: 1280, height: 800 });
  const render = async (html, file, w = 1280, h = 800, transparent = false) => {
    await comp.setViewportSize({ width: w, height: h });
    const f = path.join(TMP, path.basename(file) + '.html'); fs.writeFileSync(f, html);
    await comp.goto('file://' + f); await comp.waitForTimeout(200);
    // deviceScaleFactor is 2 for this context; capture at CSS size then downscale with a 1x page
    await comp.screenshot({ path: file + '.2x.png', clip: { x: 0, y: 0, width: w, height: h }, omitBackground: transparent });
  };
  const outs = [['screenshot-1-paste.png', s1], ['screenshot-2-add-from-link.png', s2], ['screenshot-3-add-edit-tiles.png', s3], ['screenshot-4-profiles.png', s4], ['screenshot-5-share-card.png', s5]];
  for (const [n, html] of outs) await render(html, path.join(TMP, n));

  // promo tile 440×280 and logos (vector redraw of the icon for crisp large sizes)
  const LOGO = s => `<svg width="${s}" height="${s}" viewBox="0 0 128 128"><rect x="0" y="0" width="128" height="128" rx="28" fill="#00685a"/><rect x="21" y="49" width="86" height="30" rx="15" fill="#fff"/><rect x="36" y="62.5" width="14" height="3" rx="1.5" fill="#005e4f"/><rect x="78" y="62.5" width="14" height="3" rx="1.5" fill="#005e4f"/><circle cx="108" cy="20" r="15" fill="#3ecfb4"/><rect x="101" y="18.3" width="14" height="3.4" rx="1.7" fill="#05241e"/><rect x="106.3" y="13" width="3.4" height="14" rx="1.7" fill="#05241e"/></svg>`;
  const promo = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}body{width:440px;height:280px;overflow:hidden;background:linear-gradient(135deg,#f3faf8,#dcefea);color:#123b35;font-family:"Segoe UI",Roboto,Ubuntu,"Noto Sans",sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 34px;box-sizing:border-box}
    .t{display:flex;align-items:center;gap:16px}.t h1{font-size:38px;margin:0;font-weight:700;letter-spacing:-.3px;color:#00685a}p{font-size:20px;line-height:1.38;margin:20px 0 0;color:#24403b}</style>
    <div class="t">${LOGO(72)}<h1>Social Links</h1></div><p>Paste your LinkedIn, GitHub and other profile links into any form with one <span style="white-space:nowrap">right-click</span>.</p>`;
  const logoPage = s => `<!doctype html><style>html,body{margin:0;background:transparent}body{width:${s}px;height:${s}px}</style>${LOGO(s)}`;
  await render(promo, path.join(TMP, 'promo-small-440x280.png'), 440, 280);
  await render(logoPage(300), path.join(TMP, 'edge-logo-300x300.png'), 300, 300, true);
  await ctx.close();

  // downscale 2x renders to exact sizes with a 1x browser (keeps text crisp via supersampling)
  const b = await chromium.launch({ executablePath: process.argv[2] || undefined });
  const p1 = await b.newPage({ deviceScaleFactor: 1 });
  const down = async (src, dst, w, h, transparent) => {
    await p1.setViewportSize({ width: w, height: h });
    await p1.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${dataUrl(src)}" style="width:${w}px;height:${h}px;display:block">`);
    await p1.waitForTimeout(100);
    await p1.screenshot({ path: dst, omitBackground: !!transparent });
  };
  for (const [n] of outs) await down(path.join(TMP, n + '.2x.png'), path.join(OUT, n), 1280, 800);
  await down(path.join(TMP, 'promo-small-440x280.png.2x.png'), path.join(OUT, 'promo-small-440x280.png'), 440, 280);
  await down(path.join(TMP, 'edge-logo-300x300.png.2x.png'), path.join(OUT, 'edge-logo-300x300.png'), 300, 300, true);
  await b.close();
  fs.copyFileSync(path.join(ROOT, 'src/icons/icon128.png'), path.join(OUT, 'amo-icon-128x128.png'));
  fs.writeFileSync(path.join(OUT, 'menu-titles.txt'), '# Real menu titles from globalThis.__sl.menu() (Work profile, demo data)\n' +
    workMenu.filter(x => x.type !== 'separator').map(x => (x.parentId ? (kids(workMenu, null).some(r => r.id === x.parentId) ? '  ' : '    ') : '') + x.title + '   [' + (x.contexts || []).join(',') + ']').join('\n') + '\n');
  console.log('wrote', fs.readdirSync(OUT).filter(f => f.endsWith('.png')).join(', '));
  console.log('popup captures in', TMP);
})().catch(e => { console.error(e); process.exit(1); });
