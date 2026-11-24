// Real-Chrome test for the right-click "Paste here" action.
// A real right-click grants activeTab; automation can't make one, so this loads a TEST-ONLY copy of
// dist/chromium that may access http://127.0.0.1 and fires the menu item through the background's own
// onClick handler. The shipped extension has no host permissions.
// Run: node build.mjs && NODE_PATH=$(npm root -g) node tests/e2e-paste.cjs [path/to/chrome]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
let pass = 0, fail = 0;
const ok = (c, n) => { c ? pass++ : fail++; console.log(c ? 'PASS' : 'FAIL', n); };

const PAGE = `<!doctype html><meta charset="utf-8"><title>form</title>
<input id="plain" type="text">
<input id="email" type="email">
<textarea id="ta">Hello  world</textarea>
<div id="ce" contenteditable="true">Profile: </div>
<input id="ro" type="text" readonly>
<input id="react" type="text">
<iframe id="fr" src="/frame"></iframe>
<script>
  // a "framework" listening for input events, like React's onChange
  window.events = []; document.getElementById('react').addEventListener('input', e => events.push(e.target.value));
</script>`;
const FRAME = `<!doctype html><meta charset="utf-8"><input id="inner" type="url">`;

(async () => {
  const src = path.resolve(__dirname, '../dist/chromium');
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-paste-ext-'));
  fs.cpSync(src, ext, { recursive: true });
  const m = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'), 'utf8'));
  m.host_permissions = ['http://127.0.0.1/*'];                       // test-only
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(m));

  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(q.url === '/frame' ? FRAME : PAGE); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const URL = `http://127.0.0.1:${srv.address().port}/`;

  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'sl-paste-')), {
    executablePath: process.argv[2] || undefined, headless: true,
    args: ['--headless=new', '--disable-features=DisableLoadExtensionCommandLineSwitch', `--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL.slice(0, -1) });
  await sw.evaluate(() => SL.store.save({ v: 2, active: 'work', profiles: [{ id: 'work', name: 'Work', owner: '', links: [
    { id: 'li01', p: 'linkedin', v: 'jane', url: 'https://www.linkedin.com/in/jane' },
    { id: 'em01', p: 'email', v: 'jane@example.com', url: 'mailto:jane@example.com' }] }] }));
  await sw.evaluate(() => globalThis.__sl.rebuild());

  // menu shape: Paste is offered in text boxes, first in each link's submenu
  const menu = await sw.evaluate(() => globalThis.__sl.menu().then(m => m.map(x => ({ id: x.id, parentId: x.parentId, contexts: x.contexts, title: x.title }))));
  const kids = menu.filter(x => x.parentId === 'l:li01');
  ok(kids[0].id === 'v:li01' && JSON.stringify(kids[0].contexts) === '["editable"]' && /Paste here/.test(kids[0].title), 'Paste here is the first item, shown only in text boxes');
  ok(menu.some(x => x.id === 'v:em01') && !menu.some(x => x.id === 'o:em01'), 'email can be pasted and copied, not opened');

  const page = await ctx.newPage(); await page.goto(URL); await page.waitForTimeout(300);
  const tab = await sw.evaluate(async u => { const [t] = await chrome.tabs.query({ url: u + '*' }); return { id: t.id, index: t.index }; }, URL);
  const frames = await sw.evaluate(async id => (await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, func: () => location.pathname })).map(r => [r.result, r.frameId]), tab.id);
  const frameId = Object.fromEntries(frames)['/frame'];
  const paste = (link, fid = 0) => sw.evaluate(([l, t, f]) => globalThis.__sl.onClick({ menuItemId: 'v:' + l, frameId: f }, t), [link, tab, fid]);
  const val = sel => page.evaluate(s => { const e = document.querySelector(s); return e.isContentEditable ? e.textContent : e.value; }, sel);

  await page.focus('#plain'); await paste('li01');
  ok(await val('#plain') === 'https://www.linkedin.com/in/jane', 'pastes into a plain text box');

  await page.focus('#email'); await paste('em01');
  ok(await val('#email') === 'jane@example.com', 'pastes an email address into an email field');

  await page.focus('#ta'); await page.evaluate(() => { const t = document.getElementById('ta'); t.setSelectionRange(6, 6); });
  await paste('li01');
  ok(await val('#ta') === 'Hello https://www.linkedin.com/in/jane world', 'pastes at the cursor inside existing text');
  await page.keyboard.press('Control+Z');
  ok(await val('#ta') === 'Hello  world', 'Ctrl+Z undoes the paste');

  await page.click('#ce'); await page.keyboard.press('End'); await paste('li01');
  ok((await val('#ce')).endsWith('https://www.linkedin.com/in/jane'), 'pastes into a rich-text (contenteditable) box');

  await page.focus('#react'); await paste('li01');
  ok((await page.evaluate(() => window.events)).includes('https://www.linkedin.com/in/jane'), 'fires the input event page frameworks listen for');

  await page.frameLocator('#fr').locator('#inner').focus(); await paste('li01', frameId);
  ok(await page.frameLocator('#fr').locator('#inner').inputValue() === 'https://www.linkedin.com/in/jane', 'pastes into a field inside an iframe');

  await page.focus('#ro'); await paste('li01');
  ok(await val('#ro') === '', 'does not change a read-only field');
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'https://www.linkedin.com/in/jane', '…and copies the link instead so Ctrl+V works');

  // a page the extension may not touch (no host permission in this test copy either)
  await sw.evaluate(() => navigator.clipboard ? 0 : 0);
  const other = await ctx.newPage(); await other.goto('data:text/html,<input id=x autofocus>');
  const otherTab = await sw.evaluate(async () => { const t = (await chrome.tabs.query({})).find(t => !t.url || t.url.startsWith('data:')); return { id: t.id, index: t.index }; });
  await page.evaluate(() => navigator.clipboard.writeText('-'));
  await sw.evaluate(([t]) => globalThis.__sl.onClick({ menuItemId: 'v:li01', frameId: 0 }, t), [otherTab]);
  ok(await other.evaluate(() => document.getElementById('x').value) === '', 'cannot type into a page it has no access to');
  await page.bringToFront();
  ok(await page.evaluate(() => navigator.clipboard.readText()) === 'https://www.linkedin.com/in/jane', '…and falls back to copying');

  await ctx.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
