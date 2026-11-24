// End-to-end test: loads dist/chromium as a real unpacked extension in Chrome via Playwright.
// Native context menus can't be clicked by automation, so menu items are fired through the
// background's own onClick handler (the same function the browser calls) and the menu that
// was built is read back from the background's mirror of it.
// Run: node build.mjs && NODE_PATH=$(npm root -g) node tests/e2e.cjs  [path/to/chrome]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os');
const EXT = path.resolve(__dirname, '../dist/chromium');
const SHOTS = process.env.SHOTS || path.resolve(__dirname, '../store/screenshots');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } };

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-e2e-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.argv[2] || undefined, headless: true,
    args: ['--headless=new', '--disable-features=DisableLoadExtensionCommandLineSwitch',
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 420, height: 720 }, acceptDownloads: true
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const POPUP = `chrome-extension://${extId}/popup.html`;
  // a tiny local page we can grant clipboard-read to (extension origins can't be granted it)
  const http = require('http');
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>clip</title>'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const CLIP = `http://127.0.0.1:${srv.address().port}/`;
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: CLIP.slice(0, -1) });
  const clip = await ctx.newPage(); await clip.goto(CLIP);
  const readClip = async () => { await clip.bringToFront(); return clip.evaluate(() => navigator.clipboard.readText()); };
  const menu = () => sw.evaluate(() => globalThis.__sl.menu().then(m => m.map(x => ({ id: x.id, parentId: x.parentId, title: x.title, type: x.type, checked: x.checked, contexts: x.contexts }))));
  const click = (info, tab) => sw.evaluate(([i, t]) => globalThis.__sl.onClick(i, t).then(() => globalThis.__sl.rebuild()), [info, tab || { id: -1, index: 0 }]);
  const data = () => sw.evaluate(() => chrome.storage.sync.get('data').then(r => r.data));

  // --- permissions
  const perms = await sw.evaluate(() => chrome.runtime.getManifest().permissions);
  ok(JSON.stringify(perms) === JSON.stringify(['contextMenus', 'storage', 'offscreen', 'clipboardWrite', 'activeTab', 'scripting']), 'only contextMenus, storage, offscreen, clipboardWrite, activeTab, scripting permissions');
  const warnings = await sw.evaluate(s => new Promise(r => chrome.management.getPermissionWarningsByManifest(s, r)), fs.readFileSync(EXT + '/manifest.json', 'utf8'));
  ok(JSON.stringify(warnings) === JSON.stringify(['Modify data you copy and paste']), 'Chrome install warning is only: ' + warnings.join('; '));
  ok(await sw.evaluate(() => chrome.permissions.contains({ permissions: ['favicon'] })) === false, 'site icons are opt-in (favicon is optional)');
  ok(!(await sw.evaluate(() => chrome.runtime.getManifest().host_permissions)), 'no host permissions');

  // --- initial menu
  let m = await menu();
  ok(m[0].id === 'root' && m[0].title === 'Social links', 'top-level "Social links" item');
  ok(m.some(x => x.id === 'none' && /No links in Work/.test(x.title)), 'empty profile message');
  const adds = m.filter(x => x.id.startsWith('new:'));
  ok(adds.length === 13 && adds.every(x => x.title.startsWith('+ Add ')), 'all 13 platforms offered with "+"');
  ok(m.filter(x => x.parentId === 'prof' && x.type === 'radio').length === 2, 'profile radio items');

  // --- add from right-click
  await click({ menuItemId: 'save-link', linkUrl: 'https://github.com/mukeshkbj/QNX/pulls' });
  let d = await data();
  const gh = d.profiles[0].links[0];
  ok(gh && gh.p === 'github' && gh.url === 'https://github.com/mukeshkbj', 'right-click on repo link saves GitHub profile');
  m = await menu();
  ok(m.some(x => x.id === 'new:github' && x.title === '✎ Edit GitHub'), 'GitHub now shows ✎ Edit');
  ok(m.some(x => x.id === 'l:' + gh.id) && m.some(x => x.id === 'o:' + gh.id && x.parentId === 'l:' + gh.id) && m.some(x => x.id === 'c:' + gh.id) && m.some(x => x.id === 'v:' + gh.id && x.contexts.join() === 'editable'), 'link submenu (Paste in text boxes, Open, Copy) uses permanent id');
  ok(m.findIndex(x => x.id === 'l:' + gh.id) < m.findIndex(x => x.id === 'add'), 'links listed before submenus');

  await click({ menuItemId: 'save-link', linkUrl: 'https://github.com/someone-else' });
  d = await data();
  ok(d.profiles[0].links.length === 1 && d.profiles[0].links[0].id === gh.id && d.profiles[0].links[0].v === 'someone-else', 'second GitHub link updates, keeps id');
  await click({ menuItemId: 'save-link', linkUrl: 'https://github.com/mukeshkbj' });
  await click({ menuItemId: 'save-sel', selectionText: ' me@example.com ' });
  await click({ menuItemId: 'save-page', pageUrl: 'https://www.kaggle.com/mukesh' });
  await click({ menuItemId: 'save-link', linkUrl: 'javascript:alert(1)' });
  d = await data();
  const W = d.profiles[0].links;
  ok(W.length === 3 && W.some(l => l.p === 'email') && W.some(l => l.p === 'custom' && l.label === 'Kaggle'), 'selection email + page as Other link saved; javascript: rejected');
  const em = W.find(l => l.p === 'email');
  m = await menu();
  ok(m.some(x => x.id === 'c:' + em.id && x.parentId === 'l:' + em.id) && m.some(x => x.id === 'v:' + em.id) && !m.some(x => x.id === 'o:' + em.id), 'email can be copied or pasted, never opened');

  // --- copy from the menu (offscreen document)
  await click({ menuItemId: 'c:' + gh.id });
  ok(await readClip() === 'https://github.com/mukeshkbj', 'menu Copy puts the URL on the clipboard');
  await click({ menuItemId: 'c:' + em.id });
  ok(await readClip() === 'me@example.com', 'email Copy gives the address');
  const page = await ctx.newPage();
  await page.goto(POPUP);

  // --- open from the menu
  const [opened] = await Promise.all([ctx.waitForEvent('page'), click({ menuItemId: 'o:' + gh.id })]);
  await opened.waitForLoadState('commit').catch(() => {});
  ok(/github\.com\/mukeshkbj/.test(opened.url()), 'menu Open opens the link in a new tab');
  await opened.close();

  // --- stale id never opens the wrong link
  await sw.evaluate(async id => { const r = await chrome.storage.sync.get('data'); r.data.profiles[0].links = r.data.profiles[0].links.filter(l => l.id !== id); await chrome.storage.sync.set({ data: r.data }); }, gh.id);
  await page.waitForTimeout(300);
  let extra = false; ctx.once('page', () => { extra = true; });
  await click({ menuItemId: 'o:' + gh.id });
  await page.waitForTimeout(500);
  ok(!extra, 'deleted link id opens nothing');

  // --- switch profile from the menu
  await click({ menuItemId: 'pr:personal' });
  ok((await data()).active === 'personal', 'menu switches profile');
  m = await menu();
  ok(m.some(x => x.id === 'pr:personal' && x.checked) && m.some(x => x.id === 'prof' && /Personal/.test(x.title)), 'menu shows current profile');
  await click({ menuItemId: 'pr:work' });

  // --- popup UI
  await page.goto(POPUP); await page.waitForSelector('.item');
  await page.click('#addBtn');
  ok(await page.textContent('[data-p=email] .ed') === '✎' && await page.textContent('[data-p=linkedin] .ed') === '+' && await page.textContent('[data-p=custom] .ed') === '+', 'tiles show ✎ for saved, + for not saved, + for Other');
  await page.click('[data-p=linkedin]');
  await page.fill('#val', 'https://github.com/x'); await page.click('#save');
  ok((await page.textContent('#err')).includes('linkedin.com'), 'wrong-site URL rejected with a clear message');
  await page.fill('#val', 'jane-doe'); await page.click('#save');
  await page.waitForTimeout(200);
  await page.click('#addBtn'); await page.click('[data-p=custom]');
  ok(!(await page.isHidden('#nameRow')), 'Other link asks for a name');
  await page.fill('#nm', 'Portfolio'); await page.fill('#val', 'https://mukesh.dev'); await page.click('#save');
  await page.waitForTimeout(200);
  ok((await page.locator('.item').count()) === 4, 'links added in popup');
  await page.click('#addBtn'); await page.click('[data-p=linkedin]');
  ok((await page.inputValue('#val')) === 'jane-doe' && (await page.textContent('#save')).includes('Save changes'), 'clicking a ✎ tile edits the existing link');
  await page.keyboard.press('Escape');

  // keyboard reorder
  const first = await page.getAttribute('.item:nth-child(1)', 'data-id');
  await page.focus('.item:nth-child(1) .grip'); await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  ok((await page.getAttribute('.item:nth-child(2)', 'data-id')) === first, 'grip + ArrowDown reorders');
  ok(await page.evaluate(() => document.activeElement.classList.contains('grip')), 'focus stays on the moved grip');
  // remove + undo
  await page.click('.item:nth-child(1) [data-act=del]');
  ok((await page.locator('.item').count()) === 3, 'remove');
  await page.click('#undo');
  ok((await page.locator('.item').count()) === 4, 'undo restores');
  // a11y basics
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => !b.hidden && b.offsetParent && !(b.getAttribute('aria-label') || b.textContent.trim())).length);
  ok(unlabeled === 0, 'every visible button has an accessible name');
  ok(await page.getAttribute('.item:nth-child(1) .grip', 'aria-label') !== null, 'drag handle has a screen-reader label');
  await page.screenshot({ path: path.join(SHOTS, '01-popup-links.png') });

  // search appears after 10 links
  ok(await page.isHidden('#searchWrap'), 'no search with few links');
  await sw.evaluate(async () => { const r = await chrome.storage.sync.get('data'); for (let i = 0; i < 8; i++) r.data.profiles[0].links.push({ id: 'zz' + i, p: 'custom', v: 'x', url: 'https://site' + i + '.example.org/', label: 'Site ' + i }); await chrome.storage.sync.set({ data: r.data }); });
  await page.reload(); await page.waitForSelector('.item');
  ok(!(await page.isHidden('#searchWrap')), 'search appears with more than 10 links');
  await page.fill('#search', 'portfolio');
  ok((await page.locator('.item').count()) === 1, 'search filters the list');
  await page.fill('#search', '');

  // profiles: new, rename, delete
  await page.click('#profNew'); await page.fill('#profName', 'Hackathons'); await page.click('#profForm [type=submit]');
  await page.waitForTimeout(150);
  d = await data();
  ok(d.profiles.length === 3 && d.profiles.find(p => p.id === d.active).name === 'Hackathons', 'create profile and switch to it');
  await page.click('#profRename'); await page.fill('#profName', 'Events'); await page.click('#profForm [type=submit]');
  await page.waitForTimeout(150);
  ok((await data()).profiles.some(p => p.name === 'Events'), 'rename profile');
  await page.click('#profDel'); await page.click('#profDelYes');
  await page.waitForTimeout(150);
  ok((await data()).profiles.length === 2, 'delete profile after confirmation');
  await page.selectOption('#profSel', 'work'); await page.waitForTimeout(150);

  // share card
  await page.click('#shareBtn');
  await page.fill('#owner', 'Mukesh A');
  const qrInk = await page.evaluate(() => { const c = document.getElementById('qr'), g = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < g.length; i += 4) if (g[i] < 50) k++; return { k, w: c.width }; });
  ok(qrInk.w > 100 && qrInk.k > 1000, 'QR code drawn');
  await page.screenshot({ path: path.join(SHOTS, '03-share-card.png') });
  const [vcf] = await Promise.all([page.waitForEvent('download'), page.click('#dlVcf')]);
  const vtxt = fs.readFileSync(await vcf.path(), 'utf8');
  ok(vcf.suggestedFilename() === 'mukesh-a.vcf' && /FN:Mukesh A/.test(vtxt) && /linkedin\.com\/in\/jane-doe/.test(vtxt), 'vCard downloads with links');
  const [png] = await Promise.all([page.waitForEvent('download'), page.click('#dlPng')]);
  ok(png.suggestedFilename().endsWith('-qr.png'), 'QR image downloads');
  fs.copyFileSync(await png.path(), path.join(os.tmpdir(), 'sl-share-qr.png'));
  await page.click('#shareClose');

  // backup and restore
  const [bk] = await Promise.all([page.waitForEvent('download'), page.click('#exportBtn')]);
  const bkPath = path.join(os.tmpdir(), 'sl-backup.json'); fs.copyFileSync(await bk.path(), bkPath);
  const bkJson = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
  ok(bkJson.app === 'social-links' && bkJson.profiles.length === 2, 'backup exports all profiles');
  // wipe a link, then restore with merge from a tab
  await sw.evaluate(async () => { const r = await chrome.storage.sync.get('data'); r.data.profiles[0].links = r.data.profiles[0].links.filter(l => l.p !== 'linkedin'); await chrome.storage.sync.set({ data: r.data }); });
  const tab = await ctx.newPage(); await tab.goto(POPUP + '#import');
  await tab.waitForSelector('#importPanel:not([hidden])');
  await tab.setInputFiles('#file', bkPath);
  await tab.waitForSelector('#preview:not([hidden])');
  ok(/2 profile\(s\)/.test(await tab.textContent('#previewText')), 'import shows a preview before applying');
  await tab.screenshot({ path: path.join(SHOTS, '04-restore-preview.png') });
  await tab.click('#applyImport'); await tab.waitForTimeout(200);
  d = await data();
  ok(d.profiles[0].links.some(l => l.p === 'linkedin'), 'merge restores the missing link');
  ok(/1 added/.test(await tab.textContent('#toast')), 'merge reports what changed');
  fs.writeFileSync(path.join(os.tmpdir(), 'sl-bad.json'), '{"profiles":"nope"}');
  await tab.click('#importBtn');
  await tab.setInputFiles('#file', path.join(os.tmpdir(), 'sl-bad.json'));
  await tab.waitForFunction(() => document.getElementById('importErr').textContent.length > 5, null, { timeout: 3000 }).catch(() => {});
  ok(/isn't a Social Links backup/.test(await tab.textContent('#importErr')), 'bad backup file rejected with a clear message');
  await tab.close();

  // --- 2.0.1 regressions: changes from elsewhere while a form is open ---
  const r = await ctx.newPage(); await r.goto(POPUP); await r.waitForSelector('.item');
  await r.click('#addBtn'); await r.click('[data-p=custom]');               // form open…
  await click({ menuItemId: 'save-link', linkUrl: 'https://dribbble.com/alexmorgan' });   // …while the menu saves a link
  await r.waitForTimeout(300);
  await r.fill('#nm', 'Behance'); await r.fill('#val', 'https://www.behance.net/alexmorgan?utm_source=x'); await r.click('#save');
  await r.waitForTimeout(300);
  d = await data();
  let W2 = d.profiles.find(p => p.id === d.active).links;
  ok(W2.some(l => /dribbble/.test(l.url)) && W2.some(l => l.label === 'Behance'), 'menu save made while the popup form is open is kept');
  ok(W2.find(l => l.label === 'Behance').url === 'https://www.behance.net/alexmorgan', 'tracking parameters stripped on save');
  // edit a link that another window deletes before saving
  const beh = W2.find(l => l.label === 'Behance');
  await r.click(`[data-id="${beh.id}"] [data-act=edit]`);
  await sw.evaluate(async id => { const x = await chrome.storage.sync.get('data'); const P = x.data.profiles.find(p => p.id === x.data.active); P.links = P.links.filter(l => l.id !== id); await chrome.storage.sync.set({ data: x.data }); }, beh.id);
  await r.waitForTimeout(300);
  await r.fill('#val', 'https://www.behance.net/alexmorgan2'); await r.click('#save'); await r.waitForTimeout(300);
  d = await data(); W2 = d.profiles.find(p => p.id === d.active).links;
  ok(W2.some(l => l.url === 'https://www.behance.net/alexmorgan2'), 'editing a link deleted elsewhere saves it instead of losing it');
  // undo after the link's profile was deleted
  await r.click('#profNew'); await r.fill('#profName', 'Temp'); await r.click('#profForm [type=submit]'); await r.waitForTimeout(200);
  await r.click('#addBtn'); await r.click('[data-p=github]'); await r.fill('#val', 'tempuser'); await r.click('#save'); await r.waitForTimeout(200);
  await r.click('.item [data-act=del]'); await r.waitForTimeout(150);
  await r.click('#profDel'); await r.click('#profDelYes'); await r.waitForTimeout(200);
  ok(await r.isHidden('#undo'), 'deleting a profile clears its pending undo');
  await r.close();

  // add-from-menu deep link opens the right form
  const deep = await ctx.newPage(); await deep.goto(POPUP + '#add-x');
  ok(!(await deep.isHidden('#form')) && /X \(Twitter\)/.test(await deep.textContent('#lab')), '"+ Add X" from the menu opens the X form');
  await deep.close();

  // menu screenshot stand-in: render the built menu as text
  m = await menu();
  fs.writeFileSync(path.join(SHOTS, '02-right-click-menu.txt'), m.filter(x => x.type !== 'separator').map(x => (x.parentId === 'root' ? '  ' : x.parentId ? '    ' : '') + x.title).join('\n') + '\n');

  // dark mode render
  await page.emulateMedia({ colorScheme: 'dark' }); await page.reload(); await page.waitForSelector('.item');
  await page.screenshot({ path: path.join(SHOTS, '05-popup-dark.png') });

  await ctx.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
