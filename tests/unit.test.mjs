// Unit tests: URL parsing, validation, vCard, storage fallback, backup cleaning/merging.
// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Minimal fake of chrome.storage with a configurable sync quota.
const mem = { sync: {}, local: {} };
let syncFails = false;
const area = name => ({
  get: async k => (typeof k === 'string' ? (k in mem[name] ? { [k]: mem[name][k] } : {}) : { ...mem[name] }),
  set: async o => { if (name === 'sync' && syncFails) throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded'); Object.assign(mem[name], JSON.parse(JSON.stringify(o))); },
  remove: async k => { delete mem[name][k]; }
});
globalThis.chrome = { storage: { sync: area('sync'), local: area('local'), onChanged: { addListener() {} } }, i18n: { getMessage: () => '' } };
globalThis.SL = require('../src/platforms.js');
require('../src/i18n.js'); require('../src/store.js');
const SL = globalThis.SL;

test('profile URLs are recognised with platform and username', () => {
  const cases = [
    ['https://www.linkedin.com/in/jane-doe/?trk=x', 'linkedin', 'jane-doe', 'https://www.linkedin.com/in/jane-doe'],
    ['https://uk.linkedin.com/in/jane', 'linkedin', 'jane', 'https://www.linkedin.com/in/jane'],
    ['https://github.com/mukeshkbj/QNX/issues', 'github', 'mukeshkbj', 'https://github.com/mukeshkbj'],
    ['twitter.com/jack', 'x', 'jack', 'https://x.com/jack'],
    ['https://m.youtube.com/@mkbhd/videos', 'youtube', 'mkbhd', 'https://www.youtube.com/@mkbhd'],
    ['https://www.tiktok.com/@someone', 'tiktok', 'someone', 'https://www.tiktok.com/@someone'],
    ['mailto:a.b@example.co.uk?subject=hi', 'email', 'a.b@example.co.uk', 'mailto:a.b@example.co.uk'],
    ['me@example.com', 'email', 'me@example.com', 'mailto:me@example.com']
  ];
  for (const [inp, p, v, url] of cases) assert.deepEqual(SL.fromAnything(inp), { p, v, url }, inp);
});

test('non-profile pages and unknown sites become Other links', () => {
  assert.equal(SL.fromAnything('https://github.com/features/actions').p, 'custom');
  assert.equal(SL.fromAnything('https://www.instagram.com/p/abc123/').p, 'custom');
  const k = SL.fromAnything('https://www.kaggle.com/mukesh');
  assert.equal(k.p, 'custom'); assert.equal(k.label, 'Kaggle');   // well-known site name from SL.SITES
  assert.equal(SL.fromAnything('https://stackoverflow.com/users/1/x').p, 'stackoverflow');
});

test('junk and dangerous input is rejected', () => {
  for (const bad of ['', 'hello', 'javascript:alert(1)', 'ftp://x.com', 'file:///etc/passwd', 'data:text/html,hi', 'http://localhost'])
    assert.equal(SL.fromAnything(bad), null, bad);
});

test('popup validation', () => {
  const P = id => SL.platform(id);
  assert.deepEqual(SL.validate(P('github'), '@mukeshkbj'), { v: 'mukeshkbj', url: 'https://github.com/mukeshkbj' });
  assert.deepEqual(SL.validate(P('linkedin'), 'linkedin.com/in/jane/'), { v: 'jane', url: 'https://www.linkedin.com/in/jane' });
  assert.equal(SL.validate(P('linkedin'), 'https://github.com/x').e, 'errWrongSite');
  assert.equal(SL.validate(P('linkedin'), 'https://www.linkedin.com/feed/').e, 'errNotProfile');
  assert.equal(SL.validate(P('github'), 'bad name!').e, 'errUsername');
  assert.equal(SL.validate(P('email'), 'nope').e, 'errEmail');
  assert.equal(SL.validate(P('website'), 'mysite').e, 'errNeedUrl');
  assert.equal(SL.validate(P('custom'), 'behance.net/me').url, 'https://behance.net/me');
  assert.equal(SL.validate(P('x'), '').e, 'errEmpty');
});

test('vCard contains every link and escapes text', () => {
  const v = SL.vcard('Ada, Lovelace', [
    { p: 'linkedin', v: 'ada', url: 'https://www.linkedin.com/in/ada' },
    { p: 'email', v: 'ada@example.com', url: 'mailto:ada@example.com' },
    { p: 'custom', v: 'x', url: 'https://kaggle.com/ada', label: 'Kaggle' }]);
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  assert.match(v, /FN:Ada\\, Lovelace\r\n/);
  assert.match(v, /URL;TYPE=LinkedIn:https:\/\/www\.linkedin\.com\/in\/ada/);
  assert.match(v, /X-SOCIALPROFILE;TYPE=linkedin:/);
  assert.match(v, /EMAIL;TYPE=INTERNET:ada@example\.com/);
  assert.match(v, /URL;TYPE=Kaggle:https:\/\/kaggle\.com\/ada/);
  assert.match(v, /END:VCARD\r\n$/);
});

test('first run migrates v1 links into the Work profile', async () => {
  mem.sync = { links: [{ p: 'github', v: 'mk', url: 'https://github.com/mk' }] }; mem.local = {};
  const d = await SL.store.load();
  assert.deepEqual(d.profiles.map(p => p.name), ['Work', 'Personal']);
  assert.equal(d.profiles[0].links[0].url, 'https://github.com/mk');
  assert.ok(d.profiles[0].links[0].id, 'links get permanent ids');
  assert.equal(mem.sync.links, undefined, 'old key removed');
});

test('storage falls back to local when sync is over quota, and returns', async () => {
  mem.sync = {}; mem.local = {};
  const d = SL.store.fresh();
  for (let i = 0; i < 120; i++) d.profiles[0].links.push({ id: 'id' + i, p: 'custom', v: 'x', url: 'https://example' + i + '.com/a-fairly-long-path/' + i, label: 'Site ' + i });
  assert.equal(await SL.store.save(d), 'local');
  assert.equal(await SL.store.mode(), 'local');
  assert.equal((await SL.store.load()).profiles[0].links.length, 120);
  d.profiles[0].links.length = 3;
  assert.equal(await SL.store.save(d), 'sync');
  assert.equal(await SL.store.mode(), 'sync');
  syncFails = true;                                    // sync disabled / quota error
  assert.equal(await SL.store.save(d), 'local');
  syncFails = false;
});

test('backup import cleans data and merge keeps existing links', () => {
  const evil = JSON.stringify({ profiles: [{ name: 'Work', links: [
    { p: 'github', url: 'https://github.com/new' },
    { p: 'custom', url: 'javascript:alert(1)', label: 'x' },
    { p: 'custom', url: 'https://kaggle.com/me', label: 'Kaggle' }] },
    { name: 'Hackathons', links: [{ p: 'email', v: 'me@x.io' }] }] });
  const r = SL.store.parseBackup(evil);
  assert.ok(r.d);
  assert.equal(r.d.profiles[0].links.length, 2, 'javascript: link dropped');
  const cur = SL.store.fresh([{ id: 'a1b2', p: 'github', v: 'old', url: 'https://github.com/old' }]);
  const m = SL.store.merge(cur, r.d);
  const work = m.d.profiles.find(p => p.name === 'Work');
  assert.equal(work.links.find(l => l.p === 'github').url, 'https://github.com/old', 'existing platform kept');
  assert.ok(work.links.some(l => l.label === 'Kaggle'));
  assert.ok(m.d.profiles.some(p => p.name === 'Hackathons'));
  assert.deepEqual(m.stats, { added: 2, skipped: 1, profiles: 1 });
  assert.equal(SL.store.parseBackup('not json').e, 'errBackupJson');
  assert.equal(SL.store.parseBackup('{"x":1}').e, 'errBackupShape');
});

test('QR encoder picks a version that fits and has the right size', () => {
  require('../src/qr.js');
  const q = SL.qr.encode('https://github.com/mukeshkbj', 'M');
  assert.equal(q.size, q.version * 4 + 17);
  assert.throws(() => SL.qr.encode('x'.repeat(3000), 'M'));
});
