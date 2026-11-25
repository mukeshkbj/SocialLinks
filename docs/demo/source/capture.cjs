// Captures the real Social Links popup (dist/chromium) in Chrome with fictional demo data.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const EXT = path.resolve(__dirname, '../../../dist/chromium'), OUT = path.resolve(__dirname, 'shots');
const DEMO = { v: 2, active: 'work', profiles: [
  { id: 'work', name: 'Work', owner: 'Alex Morgan', links: [
    { id: 'lk01', p: 'linkedin', v: 'alex-morgan-dev', url: 'https://www.linkedin.com/in/alex-morgan-dev' },
    { id: 'lk02', p: 'github', v: 'alexmorgan', url: 'https://github.com/alexmorgan' },
    { id: 'lk03', p: 'email', v: 'alex@morgan.dev', url: 'mailto:alex@morgan.dev' },
    { id: 'lk04', p: 'custom', v: 'https://morgan.dev/', url: 'https://morgan.dev/', label: 'Portfolio' },
    { id: 'lk05', p: 'x', v: 'alexmorgan_dev', url: 'https://x.com/alexmorgan_dev' }] },
  { id: 'personal', name: 'Personal', owner: 'Alex Morgan', links: [
    { id: 'ps01', p: 'instagram', v: 'alex.makes', url: 'https://www.instagram.com/alex.makes' },
    { id: 'ps02', p: 'youtube', v: 'alexbuilds', url: 'https://www.youtube.com/@alexbuilds' }] }] };
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(os.tmpdir() + '/cap-'), {
    executablePath: process.env.CHROME || undefined, headless: true, deviceScaleFactor: 2, viewport: { width: 400, height: 900 },
    args: ['--headless=new', '--disable-features=DisableLoadExtensionCommandLineSwitch', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const id = sw.url().split('/')[2], URL = `chrome-extension://${id}/popup.html`;
  const seed = d => sw.evaluate(d => SL.store.save(d), d);
  await seed(DEMO);
  const pg = await ctx.newPage();
  // popup is 400px wide with body padding; shoot only the body box
  const shot = async name => {
    await pg.waitForTimeout(250);
    const h = await pg.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height + 28));
    await pg.screenshot({ path: path.join(OUT, name + '.png'), clip: { x: 0, y: 0, width: 400, height: Math.min(h, 900) } });
    console.log(name, h);
  };
  // positions (css px) of controls the video's cursor clicks, per captured state
  const coords = {};
  const at = async (state, sels) => {
    coords[state] = coords[state] || {};
    for (const [k, sel] of Object.entries(sels)) coords[state][k] = await pg.evaluate(s => {
      const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect();
      return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }, sel);
  };
  await pg.goto(URL); await pg.waitForSelector('.item');
  await at('a', { addBtn: '#addBtn', profSel: '#profSel', shareBtn: '#shareBtn', starPortfolio: '[data-id="lk04"] [data-act=main]' });
  await shot('a-list');
  await pg.click('#addBtn');
  await at('b', { custom: '[data-p=custom]', github: '[data-p=github]' });
  await shot('b-grid');
  // Other link: the site list opens; type "kag" and pick Kaggle from the suggestions
  await pg.click('[data-p=custom]'); await pg.waitForTimeout(200);
  await pg.keyboard.type('kag', { delay: 40 }); await pg.waitForTimeout(250);
  await pg.evaluate(() => scrollTo(0, 0));
  await at('c', { nm: '#nm', opt0: '#nmOpt0' });
  await shot('c-combo');
  await pg.keyboard.press('ArrowDown'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
  await pg.keyboard.type('alexmorgan', { delay: 30 }); await pg.waitForTimeout(200);
  await at('c2', { val: '#val', save: '#save' });
  await shot('c-picked');
  await pg.click('#save'); await pg.waitForTimeout(350);
  await pg.evaluate(() => { document.getElementById('toast').textContent = ''; });
  await shot('d-added');
  // ★: make Portfolio a main link
  await at('d', { starPortfolio: '[data-id="lk04"] [data-act=main]', shareBtn: '#shareBtn' });
  await pg.click('[data-id="lk04"] [data-act=main]'); await pg.waitForTimeout(250);
  await shot('j-star');
  await pg.evaluate(() => { document.getElementById('toast').textContent = ''; });
  await pg.click('#addBtn'); await pg.click('[data-p=github]'); await shot('e-edit-github');
  await pg.keyboard.press('Escape');
  await pg.selectOption('#profSel', 'personal'); await pg.waitForTimeout(200);
  await pg.evaluate(() => { document.getElementById('toast').textContent = ''; });
  await shot('f-personal');
  await pg.selectOption('#profSel', 'work'); await pg.waitForTimeout(200);
  await pg.evaluate(() => { document.getElementById('toast').textContent = ''; });
  await pg.click('#shareBtn'); await pg.waitForTimeout(300);
  await pg.evaluate(() => { scrollTo(0, 0); document.getElementById('owner').blur(); });
  await shot('g-share');
  fs.writeFileSync(path.join(OUT, 'coords.json'), JSON.stringify(coords, null, 1));
  // the real address-bar suggestions (Chrome markup) for the video's omnibox scene
  const omni = {};
  for (const q of ['l', 'li', 'lin', 'c', 'c g', 'c gi', 'c git']) omni[q] = await sw.evaluate(q => globalThis.__sl.omniSuggest(q), q);
  fs.writeFileSync(path.join(OUT, 'omni.json'), JSON.stringify(omni, null, 1));
  await pg.click('#shareClose');
  // restore preview in a tab-width page, but shoot it at popup width for consistency
  const bk = path.join(os.tmpdir(), 'demo-backup.json');
  fs.writeFileSync(bk, JSON.stringify({ app: 'social-links', v: 2, profiles: DEMO.profiles }));
  const t = await ctx.newPage(); await t.setViewportSize({ width: 400, height: 900 });
  await t.goto(URL + '#import'); await t.waitForSelector('#importPanel:not([hidden])');
  await t.setInputFiles('#file', bk); await t.waitForSelector('#preview:not([hidden])');
  await t.evaluate(() => { document.body.classList.remove('tab'); scrollTo(0, 0); });
  await t.waitForTimeout(250);
  const h = await t.evaluate(() => Math.ceil(document.getElementById('importPanel').getBoundingClientRect().bottom + 16));
  await t.screenshot({ path: path.join(OUT, 'h-restore.png'), clip: { x: 0, y: 0, width: 400, height: h } });
  console.log('h-restore', h);
  // dark mode list
  await pg.emulateMedia({ colorScheme: 'dark' }); await pg.goto(URL); await pg.waitForSelector('.item'); await shot('i-dark');
  // the real install warning list
  const m = fs.readFileSync(EXT + '/manifest.json', 'utf8');
  fs.writeFileSync(path.join(OUT, 'warnings.json'), JSON.stringify(await sw.evaluate(s => new Promise(r => chrome.management.getPermissionWarningsByManifest(s, r)), m)));
  await ctx.close();
})().catch(e => { console.error(e); process.exit(1); });
