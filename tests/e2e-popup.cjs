// Real-Chrome test for the popup's "Other link" site suggestions (combobox) and ★ main links on the share card.
// Run: node build.mjs && NODE_PATH=$(npm root -g) node tests/e2e-popup.cjs [path/to/chrome]
// Screenshots go to $SHOTS (default /tmp/popup-shots).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const EXT = path.resolve(__dirname, '../dist/chromium');
const SHOTS = process.env.SHOTS || '/tmp/popup-shots';
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log(c ? 'PASS' : 'FAIL', n); };

const DEMO = { v: 2, active: 'work', profiles: [
  { id: 'work', name: 'Work', owner: 'Ada Lovelace', links: [
    { id: 'lnk001', p: 'linkedin', v: 'ada', url: 'https://www.linkedin.com/in/ada' },
    { id: 'lnk002', p: 'github', v: 'ada', url: 'https://github.com/ada' },
    { id: 'lnk003', p: 'x', v: 'ada', url: 'https://x.com/ada' },
    { id: 'lnk004', p: 'email', v: 'ada@example.com', url: 'mailto:ada@example.com' }] },
  { id: 'personal', name: 'Personal', owner: '', links: [] }] };

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'sl-e2e-popup-')), {
    executablePath: process.argv[2] || undefined, headless: true,
    args: ['--headless=new', '--disable-features=DisableLoadExtensionCommandLineSwitch',
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 400, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const POPUP = `chrome-extension://${sw.url().split('/')[2]}/popup.html`;
  await sw.evaluate(d => SL.store.save(d), DEMO);
  const links = () => sw.evaluate(() => SL.store.load().then(d => d.profiles.find(p => p.id === d.active).links));

  const page = await ctx.newPage();
  await page.goto(POPUP); await page.waitForSelector('.item');

  // ---------- Feature 1: Other link combobox ----------
  await page.click('#addBtn'); await page.click('[data-p=custom]');
  const nm = page.locator('#nm');
  ok(await nm.getAttribute('role') === 'combobox' && await nm.getAttribute('aria-controls') === 'nmList' && await nm.getAttribute('aria-autocomplete') === 'list', 'Name field is an ARIA combobox');
  ok(await page.evaluate(() => document.activeElement.id) === 'nm', 'Name field focused after choosing Other link');
  ok(await nm.getAttribute('aria-expanded') === 'true' && await page.locator('#nmList [role=option]').count() >= 35, 'suggestions open with all well-known sites');
  ok(await page.getAttribute('#nmList', 'role') === 'listbox' && !!(await page.getAttribute('#nmList', 'aria-labelledby')), 'listbox role and label');

  await nm.pressSequentially('hug');
  let names = await page.locator('#nmList [role=option] .nm').allTextContents();
  ok(names.length >= 1 && names[0] === 'Hugging Face' && names.every(n => /hug/i.test(n)), 'typing filters the list: ' + names.join(', '));
  await page.screenshot({ path: path.join(SHOTS, 'e2e-01-combobox-filter.png'), fullPage: true });

  await nm.fill(''); await nm.pressSequentially('kag');
  ok((await page.locator('#nmList [role=option]').count()) === 1, 'filter "kag" leaves Kaggle only');
  await page.keyboard.press('ArrowDown');
  ok(await nm.getAttribute('aria-activedescendant') === 'nmOpt0' && await page.getAttribute('#nmOpt0', 'aria-selected') === 'true', 'ArrowDown sets aria-activedescendant and aria-selected');
  ok(await page.evaluate(() => document.activeElement.id) === 'nm', 'DOM focus stays on the combobox while moving');
  await page.keyboard.press('Enter');
  ok(await nm.inputValue() === 'Kaggle', 'Enter fills the name');
  ok(await page.isHidden('#nmList') && await nm.getAttribute('aria-expanded') === 'false', 'list closes after choosing');
  ok(await page.isVisible('#form') && !(await page.isHidden('#sheet')), 'Enter did not submit or close the form');
  ok(await page.textContent('#prefix') === 'kaggle.com/' && await page.isVisible('#prefix'), 'URL field shows the site prefix');
  ok(/Kaggle username/.test(await page.textContent('#lab')), 'value label names the site: ' + await page.textContent('#lab'));
  ok(await page.evaluate(() => document.activeElement.id) === 'val', 'focus moves to the username field');
  await page.screenshot({ path: path.join(SHOTS, 'e2e-02-kaggle-prefix.png'), fullPage: true });

  // wrong host rejected
  await page.fill('#val', 'https://github.com/ada'); await page.click('#save');
  ok((await page.textContent('#err')).includes('kaggle.com'), 'URL on another host rejected: ' + await page.textContent('#err'));
  await page.screenshot({ path: path.join(SHOTS, 'e2e-03-wrong-host.png'), fullPage: true });
  await page.fill('#val', 'ada'); await page.click('#save'); await page.waitForTimeout(250);
  let L = await links();
  let kg = L.find(l => l.label === 'Kaggle');
  ok(kg && kg.p === 'custom' && kg.url === 'https://www.kaggle.com/ada', 'saved as custom, label Kaggle, URL built from the pattern');
  ok(kg && !('main' in kg), 'new link has no explicit main (follows the default)');

  // editing a saved site link shows prefix + username again
  await page.click(`[data-id="${kg.id}"] [data-act=edit]`);
  ok(await page.inputValue('#val') === 'ada' && await page.textContent('#prefix') === 'kaggle.com/' && await page.isVisible('#prefix') && await nm.inputValue() === 'Kaggle', 'edit shows prefix + username');
  await page.keyboard.press('Escape');

  // mouse selection
  await page.click('#addBtn'); await page.click('[data-p=custom]');
  await nm.fill(''); await nm.pressSequentially('blue');
  await page.click('#nmList [role=option]:has-text("Bluesky")');
  ok(await nm.inputValue() === 'Bluesky' && await page.textContent('#prefix') === 'bsky.app/profile/', 'mouse click chooses a site');
  await page.fill('#val', 'ada.bsky.social'); await page.click('#save'); await page.waitForTimeout(250);
  L = await links();
  ok(L.some(l => l.label === 'Bluesky' && l.url === 'https://bsky.app/profile/ada.bsky.social'), 'Bluesky handle saved');

  // Escape closes only the list
  await page.click('#addBtn'); await page.click('[data-p=custom]');
  await nm.pressSequentially('co');
  await page.keyboard.press('Escape');
  ok(await page.isHidden('#nmList') && !(await page.isHidden('#form')), 'Escape closes the list, keeps the form');
  await page.keyboard.press('ArrowUp');
  ok(!(await page.isHidden('#nmList')) && /nmOpt\d+/.test(await nm.getAttribute('aria-activedescendant') || ''), 'ArrowUp reopens on the last option');
  await page.keyboard.press('Escape');

  // free text still works
  await nm.fill('Portfolio');
  ok(await page.isHidden('#nmList') && await page.isHidden('#prefix'), 'unknown name: no suggestions, no prefix');
  await page.fill('#val', 'https://ada.dev/work'); await page.click('#save'); await page.waitForTimeout(250);
  L = await links();
  ok(L.some(l => l.label === 'Portfolio' && l.url === 'https://ada.dev/work'), 'free-text name and URL saved');

  // URL typed without picking: name auto-filled from SL.SITES
  await page.click('#addBtn'); await page.click('[data-p=custom]');
  await page.fill('#val', 'https://huggingface.co/ada'); await page.locator('#val').blur();
  ok(await nm.inputValue() === 'Hugging Face', 'typing a known URL fills the name');
  await page.click('#save'); await page.waitForTimeout(250);
  L = await links();
  ok(L.some(l => l.label === 'Hugging Face' && l.url === 'https://huggingface.co/ada'), 'saved with the site name, not the host');

  // Mastodon: URL only
  await page.click('#addBtn'); await page.click('[data-p=custom]');
  await nm.pressSequentially('Mastodon');
  ok(await page.isHidden('#prefix') && await page.getAttribute('#val', 'type') === 'url', 'Mastodon asks for a full URL, no prefix');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

  // right-click label
  await sw.evaluate(() => globalThis.__sl.onClick({ menuItemId: 'save-link', linkUrl: 'https://www.devpost.com/ada' }, { id: -1, index: 0 }));
  L = await links();
  ok(L.some(l => l.label === 'Devpost' && l.p === 'custom'), 'right-click on a devpost.com link saves label Devpost');

  // ---------- Feature 2: ★ main links ----------
  await page.reload(); await page.waitForSelector('.item');
  const star = id => page.locator(`[data-id="${id}"] [data-act=main]`);
  ok(await star('lnk001').getAttribute('aria-pressed') === 'true' && await star('lnk002').getAttribute('aria-pressed') === 'true' && await star('lnk004').getAttribute('aria-pressed') === 'true', 'LinkedIn, GitHub, Email are main by default');
  ok(await star('lnk003').getAttribute('aria-pressed') === 'false' && await star(kg.id).getAttribute('aria-pressed') === 'false', 'X and Kaggle are not main by default');
  ok(await star('lnk003').getAttribute('aria-label') === 'Show X (Twitter) on the share card', 'star has an accessible name: ' + await star('lnk003').getAttribute('aria-label'));

  // share card before toggling
  await page.click('#shareBtn');
  const qrPixels = () => page.evaluate(() => { const c = document.getElementById('qr'); return c.toDataURL(); });
  const qr1 = await qrPixels();
  ok(/^3 main link/.test(await page.textContent('#mainCount')), 'share card shows the main count: ' + await page.textContent('#mainCount'));

  await star('lnk003').click(); await page.waitForTimeout(200);
  ok(await star('lnk003').getAttribute('aria-pressed') === 'true', '★ toggles aria-pressed on');
  ok(await page.evaluate(() => document.activeElement.dataset.act === 'main' && document.activeElement.closest('.item').dataset.id === 'lnk003'), 'focus stays on the toggled star');
  await star('lnk002').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  ok(await star('lnk002').getAttribute('aria-pressed') === 'false', 'keyboard Enter toggles GitHub off');
  ok(/^3 main link/.test(await page.textContent('#mainCount')), 'count updates live');
  const qr2 = await qrPixels();
  ok(qr1 !== qr2, 'QR redraws after a ★ change');
  L = await links();
  ok(L.find(l => l.id === 'lnk003').main === true && L.find(l => l.id === 'lnk002').main === false, 'explicit main stored as true/false');

  await page.reload(); await page.waitForSelector('.item');
  ok(await star('lnk003').getAttribute('aria-pressed') === 'true' && await star('lnk002').getAttribute('aria-pressed') === 'false', '★ state persists after reload');

  // editing keeps the ★ choice
  await page.click('[data-id="lnk002"] [data-act=edit]'); await page.fill('#val', 'ada2'); await page.click('#save'); await page.waitForTimeout(200);
  ok((await links()).find(l => l.id === 'lnk002').main === false, 'editing a link keeps its ★ choice');

  await page.click('#shareBtn'); await page.fill('#owner', 'Ada Lovelace');
  const ink = await page.evaluate(() => { const c = document.getElementById('qr'), g = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < g.length; i += 4) if (g[i] < 50) k++; return k; });
  ok(ink > 1000, 'QR code drawn');
  await page.screenshot({ path: path.join(SHOTS, 'e2e-04-share-main.png'), fullPage: true });
  const [vcf] = await Promise.all([page.waitForEvent('download'), page.click('#dlVcf')]);
  const v = fs.readFileSync(await vcf.path(), 'utf8');
  ok(/linkedin\.com\/in\/ada/.test(v) && /x\.com\/ada/.test(v) && /EMAIL;TYPE=INTERNET:ada@example\.com/.test(v), 'vCard has the main links');
  ok(!/github\.com/.test(v) && !/kaggle/.test(v) && !/huggingface/.test(v) && !/ada\.dev/.test(v), 'vCard leaves out links that are not main');

  // none main → explanation
  for (const id of ['lnk001', 'lnk003', 'lnk004']) { await star(id).click(); await page.waitForTimeout(150); }
  ok(/No main links/.test(await page.textContent('#mainCount')) && /☆/.test(await page.textContent('#mainCount')), 'with no main links the card explains how to mark them');
  await page.screenshot({ path: path.join(SHOTS, 'e2e-05-share-none.png'), fullPage: true });

  // a11y: every visible button named, star buttons are toggle buttons
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent && !(b.getAttribute('aria-label') || b.textContent.trim())).length);
  ok(unlabeled === 0, 'every visible button has an accessible name');
  const snap = await page.locator('.item').first().ariaSnapshot();
  ok(/button "Show LinkedIn on the share card"/.test(snap), 'star exposed to assistive tech as a named button');

  // narrow popup: combobox fits at 380px
  await page.setViewportSize({ width: 380, height: 900 }); await page.reload(); await page.waitForSelector('.item');
  await page.click('#addBtn'); await page.click('[data-p=custom]');
  const fits = await page.evaluate(() => { const r = document.getElementById('nmList').getBoundingClientRect(); return r.right <= document.documentElement.clientWidth && document.documentElement.scrollWidth <= document.documentElement.clientWidth; });
  ok(fits, 'list fits a 380px popup without horizontal scroll');
  await page.screenshot({ path: path.join(SHOTS, 'e2e-06-combobox-380.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' }); await page.keyboard.press('Escape'); await page.reload(); await page.waitForSelector('.item');
  await page.click('#addBtn'); await page.click('[data-p=custom]'); await page.keyboard.type('s'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await page.screenshot({ path: path.join(SHOTS, 'e2e-07-dark.png'), fullPage: true });

  await ctx.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
