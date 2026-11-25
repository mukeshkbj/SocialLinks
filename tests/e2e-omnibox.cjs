// End-to-end test for the address-bar shortcut ("sl" keyword) in real Chrome via Playwright.
// Automation can't type into the real address bar, so the omnibox handlers are driven through
// the background's test hooks (__sl.omniSuggest / __sl.omniEnter), which are the same functions
// the omnibox events call.
// Run: node build.mjs && NODE_PATH=$(npm root -g) node tests/e2e-omnibox.cjs  [path/to/chrome]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const EXT = path.resolve(__dirname, '../dist/chromium');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } };

(async () => {
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<!doctype html><title>' + q.url.replace(/[<&]/g, '') + '</title>'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${srv.address().port}`;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-omni-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: process.argv[2] || undefined, headless: true,
    args: ['--headless=new', '--disable-features=DisableLoadExtensionCommandLineSwitch',
      `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    viewport: { width: 420, height: 720 }
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const clip = await ctx.newPage(); await clip.goto(BASE + '/clip');
  const readClip = async () => { await clip.bringToFront(); return clip.evaluate(() => navigator.clipboard.readText()); };
  const writeClip = async s => { await clip.bringToFront(); await clip.evaluate(t => navigator.clipboard.writeText(t), s); };

  // --- manifest and install warnings
  const manifest = JSON.parse(fs.readFileSync(EXT + '/manifest.json', 'utf8'));
  ok(manifest.omnibox && manifest.omnibox.keyword === 'sl', 'manifest has omnibox keyword "sl"');
  ok((await sw.evaluate(() => chrome.runtime.getManifest().omnibox.keyword)) === 'sl', 'Chrome sees the keyword');
  ok(JSON.stringify(manifest.permissions) === JSON.stringify(['contextMenus', 'storage', 'offscreen', 'clipboardWrite', 'activeTab', 'scripting']), 'no new permissions');
  const warnings = await sw.evaluate(s => new Promise(r => chrome.management.getPermissionWarningsByManifest(s, r)), JSON.stringify(manifest));
  console.log('  install warnings:', JSON.stringify(warnings));
  ok(JSON.stringify(warnings) === JSON.stringify(['Modify data you copy and paste']), 'install warnings unchanged: ' + warnings.join('; '));
  ok(await sw.evaluate(() => typeof chrome.omnibox.onInputEntered.hasListeners === 'function' ? chrome.omnibox.onInputEntered.hasListeners() && chrome.omnibox.onInputChanged.hasListeners() : true), 'omnibox listeners registered');

  // --- seed data through the store
  const DEMO = { v: 2, active: 'work', profiles: [
    { id: 'work', name: 'Work', owner: '', links: [
      { id: 'gh01', p: 'github', v: 'mukeshkbj', url: 'https://github.com/mukeshkbj' },
      { id: 'li01', p: 'linkedin', v: 'jane-doe', url: 'https://www.linkedin.com/in/jane-doe' },
      { id: 'em01', p: 'email', v: 'me@example.com', url: 'mailto:me@example.com' },
      { id: 'site', p: 'website', v: BASE + '/site', url: BASE + '/site' },
      { id: 'pf01', p: 'custom', v: BASE + '/portfolio?a=1&b=2', url: BASE + '/portfolio?a=1&b=2', label: 'Tom & Jerry <Portfolio>' },
      { id: 'gl01', p: 'custom', v: 'https://gitlab.com/mk', url: 'https://gitlab.com/mk', label: 'GitLab' },
      { id: 'x001', p: 'x', v: 'jack', url: 'https://x.com/jack' },
      { id: 'yt01', p: 'youtube', v: 'mk', url: 'https://www.youtube.com/@mk' }] },
    { id: 'personal', name: 'Personal', owner: '', links: [] }] };
  await sw.evaluate(() => globalThis.__sl.menu());      // let the first load finish so it can't overwrite the cache with stale data
  await sw.evaluate(d => SL.store.save(d), DEMO);
  const suggest = text => sw.evaluate(t => globalThis.__sl.omniSuggest(t), text);
  const enter = (text, disp) => sw.evaluate(([t, d]) => globalThis.__sl.omniEnter(t, d), [text, disp]);
  for (let i = 0; i < 40 && (await suggest('')).suggestions.length < 6; i++) await clip.waitForTimeout(100);

  // --- suggestions
  let r = await suggest('');
  ok(r.suggestions.length === 6, 'empty text lists up to 6 links (' + r.suggestions.length + ')');
  ok(r.suggestions[0].content === 'github.com/mukeshkbj' && r.suggestions[5].content === 'gitlab.com/mk', 'empty text keeps the saved order');
  ok(r.default === 'Type a link name to open it, copy &lt;name&gt; to copy it, or manage to edit your links', 'usage hint as default, XML-escaped');
  r = await suggest('git');
  ok(r.suggestions.map(s => s.content).join() === 'github.com/mukeshkbj,gitlab.com/mk', '"git" → GitHub then GitLab');
  ok(r.suggestions[0].description === 'Open <match>Git</match>Hub<dim> — </dim><url><match>git</match>hub.com/mukeshkbj</url>', 'description uses match/dim/url markup');
  ok(r.default === r.suggestions[0].description, 'default suggestion is the best match');
  r = await suggest('jane');
  ok(r.suggestions.length === 1 && r.suggestions[0].content === 'linkedin.com/in/jane-doe', 'matches the address');
  r = await suggest('twit');
  ok(r.suggestions.length === 1 && r.suggestions[0].content === 'x.com/jack', 'matches inside the platform name (X (Twitter))');
  r = await suggest('portfolio');
  ok(r.suggestions[0].description.startsWith('Open Tom &amp; Jerry &lt;<match>Portfolio</match>&gt;') && r.suggestions[0].description.includes('?a=1&amp;b=2'), 'special characters escaped: ' + r.suggestions[0].description);
  r = await suggest('mail');
  ok(r.suggestions[0].content === 'me@example.com' && r.suggestions[0].description.startsWith('Copy '), 'email suggestion says Copy');
  r = await suggest('c lin');
  ok(r.suggestions[0].content === 'copy linkedin.com/in/jane-doe' && r.suggestions[0].description.startsWith('Copy '), '"c lin" → copy suggestion');
  r = await suggest('copy yout');
  ok(r.suggestions[0].content === 'copy youtube.com/@mk', '"copy yout" → copy YouTube');
  r = await suggest('zzz<');
  ok(r.suggestions.length === 0 && r.default.startsWith('No link matches &quot;zzz&lt;&quot;'), 'nothing matches: explanatory default');
  r = await suggest('man');
  ok(r.suggestions.some(s => s.content === 'manage'), '"man" offers manage');
  // real Chrome accepts the descriptions (malformed XML would throw)
  ok(await sw.evaluate(async () => { for (const q of ['', 'git', 'portfolio', 'zzz<', 'man']) { const x = await globalThis.__sl.omniSuggest(q); chrome.omnibox.setDefaultSuggestion({ description: x.default }); } return true; }).catch(e => String(e)) === true, 'Chrome accepts the default suggestion markup');

  // --- Enter: open with each disposition
  // (no "tabs" permission, so tab URLs are hidden from the extension: find the new tab by id)
  const tabIds = () => sw.evaluate(async () => (await chrome.tabs.query({})).map(t => t.id));
  const newTab = before => sw.evaluate(async b => (await chrome.tabs.query({})).filter(t => !b.includes(t.id)).map(t => ({ id: t.id, active: t.active })), before);
  const cur = await ctx.newPage(); await cur.goto(BASE + '/start'); await cur.bringToFront();
  const nPages = ctx.pages().length;
  r = await enter('website', 'currentTab');
  await cur.waitForURL(BASE + '/site', { timeout: 5000 }).catch(() => {});
  ok(r.act === 'open' && cur.url() === BASE + '/site', 'Enter (currentTab) opens in the current tab: ' + cur.url());
  ok(ctx.pages().length === nPages, 'currentTab opens no new tab');

  let ids = await tabIds();
  let [pg] = await Promise.all([ctx.waitForEvent('page'), enter('portfolio', 'newForegroundTab')]);
  await pg.waitForURL(/portfolio/, { timeout: 5000 }).catch(() => {});
  let tb = await newTab(ids);
  ok(pg.url() === BASE + '/portfolio?a=1&b=2' && tb.length === 1 && tb[0].active, 'newForegroundTab opens an active new tab: ' + pg.url());
  await pg.close();

  ids = await tabIds();
  [pg] = await Promise.all([ctx.waitForEvent('page'), enter('127.0.0.1', 'newBackgroundTab')]);
  await pg.waitForURL(/site/, { timeout: 5000 }).catch(() => {});
  tb = await newTab(ids);
  ok(pg.url() === BASE + '/site' && tb.length === 1 && tb[0].active === false, 'newBackgroundTab opens an inactive new tab: ' + pg.url() + ' ' + JSON.stringify(tb));
  await pg.close();

  // a chosen suggestion comes back as its content
  [pg] = await Promise.all([ctx.waitForEvent('page'), enter('gitlab.com/mk', 'newForegroundTab')]);
  await pg.waitForLoadState('commit').catch(() => {});
  ok(/gitlab\.com\/mk/.test(pg.url()), 'choosing a suggestion opens that link: ' + pg.url());
  await pg.close();

  // --- copy
  await writeClip('-');
  r = await enter('copy github', 'currentTab');
  ok(r.act === 'copy' && r.ok && await readClip() === 'https://github.com/mukeshkbj', '"copy github" copies the URL');
  r = await enter('c lin', 'currentTab');
  ok(await readClip() === 'https://www.linkedin.com/in/jane-doe', '"c lin" copies LinkedIn');
  r = await enter('copy youtube.com/@mk', 'currentTab');
  ok(await readClip() === 'https://www.youtube.com/@mk', 'chosen copy suggestion copies that link');
  let pagesBefore = ctx.pages().length;
  r = await enter('email', 'newForegroundTab');
  await clip.waitForTimeout(300);
  ok(r.act === 'copy' && await readClip() === 'me@example.com' && ctx.pages().length === pagesBefore, 'Enter on an email link copies the address and opens nothing');
  r = await enter('zzz', 'newForegroundTab');
  await clip.waitForTimeout(300);
  ok(r.act === 'none' && ctx.pages().length === pagesBefore, 'no match: nothing opens');

  // --- manage
  [pg] = await Promise.all([ctx.waitForEvent('page'), enter('manage', 'newForegroundTab')]);
  await pg.waitForLoadState('domcontentloaded').catch(() => {});
  ok(pg.url() === `chrome-extension://${extId}/popup.html`, '"sl manage" opens popup.html in a tab');
  await pg.waitForSelector('.item', { timeout: 5000 }).catch(() => {});
  ok((await pg.locator('.item').count()) === 8, 'manager shows the seeded links');
  await pg.close();

  // --- active profile is used
  await sw.evaluate(d => SL.store.save(Object.assign({}, d, { active: 'personal' })), DEMO);
  for (let i = 0; i < 40 && !/Personal/.test((await suggest('git')).default); i++) await clip.waitForTimeout(100);
  r = await suggest('git');
  ok(r.default === 'No links in Personal yet. Press Enter to add some' && r.suggestions[0].content === 'manage', 'empty active profile → hint to add links');

  await ctx.close(); srv.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
