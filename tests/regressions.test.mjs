// Regression tests for bugs found in the 2.0.0 code review.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const mem = { sync: {}, local: {} }; let writes = 0;
const area = name => ({
  get: async k => (typeof k === 'string' ? (k in mem[name] ? { [k]: mem[name][k] } : {}) : { ...mem[name] }),
  set: async o => { writes++; Object.assign(mem[name], JSON.parse(JSON.stringify(o))); },
  remove: async k => { delete mem[name][k]; }
});
globalThis.chrome = { storage: { sync: area('sync'), local: area('local'), onChanged: { addListener() {} } }, i18n: { getMessage: () => '' } };
globalThis.SL = require('../src/platforms.js');
require('../src/i18n.js'); require('../src/store.js');
const SL = globalThis.SL;

test('first run on a new device does not write empty profiles over synced data', async () => {
  mem.sync = {}; mem.local = {}; writes = 0;
  const d = await SL.store.load();
  assert.equal(d.profiles.length, 2);
  assert.equal(writes, 0, 'nothing written until the user changes something');
  assert.equal(mem.sync.data, undefined);
});

test('v1 links are still migrated (and saved) on first run', async () => {
  mem.sync = { links: [{ p: 'github', v: 'a', url: 'https://github.com/a' }] }; mem.local = {}; writes = 0;
  const d = await SL.store.load();
  assert.equal(d.profiles[0].links[0].url, 'https://github.com/a');
  assert.ok(mem.sync.data, 'migrated data saved');
  assert.equal(mem.sync.links, undefined);
});

test('usernames with accents and other scripts are recognised', () => {
  assert.deepEqual(SL.fromAnything('https://www.linkedin.com/in/jos%C3%A9-garc%C3%ADa/'), { p: 'linkedin', v: 'josé-garcía', url: 'https://www.linkedin.com/in/josé-garcía' });
  assert.equal(SL.validate(SL.platform('linkedin'), 'josé-garcía').v, 'josé-garcía');
  assert.equal(SL.fromAnything('https://x.com/ユーザー').p, 'x');
  assert.equal(SL.validate(SL.platform('github'), 'bad name!').e, 'errUsername');
});

test('tracking parameters are removed from saved links', () => {
  assert.equal(SL.fromAnything('https://kaggle.com/me?utm_source=x&utm_medium=y&tab=code').url, 'https://kaggle.com/me?tab=code');
  assert.equal(SL.fromAnything('https://mysite.dev/?fbclid=abc').url, 'https://mysite.dev/');
  assert.equal(SL.validate(SL.platform('website'), 'https://mysite.dev/about?gclid=1&ref=hn').url, 'https://mysite.dev/about');
});

test('the same address written differently counts as a duplicate', () => {
  assert.ok(SL.sameUrl('https://kaggle.com/me', 'https://www.kaggle.com/me/'));
  assert.ok(SL.sameUrl('http://Kaggle.com/me', 'https://kaggle.com/me'));
  assert.ok(!SL.sameUrl('https://kaggle.com/me', 'https://kaggle.com/you'));
  assert.ok(SL.sameUrl('mailto:A@b.com', 'mailto:a@b.com'));
});

test('YouTube channel URLs and Medium subdomains keep their platform', () => {
  const yt = SL.fromAnything('https://www.youtube.com/channel/UC123abc/videos?si=x');
  assert.equal(yt.p, 'youtube'); assert.equal(yt.url, 'https://www.youtube.com/channel/UC123abc');
  assert.equal(SL.validate(SL.platform('youtube'), 'https://youtube.com/c/SomeName').e, undefined);
  assert.equal(SL.validate(SL.platform('youtube'), 'https://youtube.com/c/SomeName').url, 'https://youtube.com/c/SomeName');
  const md = SL.fromAnything('https://alex.medium.com/some-post-123');
  assert.equal(md.p, 'medium'); assert.equal(md.url, 'https://alex.medium.com/');
  assert.equal(SL.fromAnything('https://www.youtube.com/watch?v=abc').p, 'custom', 'a single video is not a channel');
});

test('merge treats differently-written URLs as the same link', () => {
  const cur = SL.store.fresh([{ id: 'a1b2', p: 'custom', v: 'x', url: 'https://kaggle.com/me', label: 'Kaggle' }]);
  const inc = SL.store.clean({ profiles: [{ name: 'Work', links: [{ p: 'custom', url: 'https://www.kaggle.com/me/', label: 'Kaggle' }] }] });
  assert.equal(SL.store.merge(cur, inc).stats.added, 0);
});
