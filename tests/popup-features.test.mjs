// Unit tests for the popup features: well-known site suggestions (SL.SITES) and main links (SL.isMain).
// Run: node --test tests/popup-features.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const mem = { sync: {}, local: {} };
const area = name => ({
  get: async k => (typeof k === 'string' ? (k in mem[name] ? { [k]: mem[name][k] } : {}) : { ...mem[name] }),
  set: async o => { Object.assign(mem[name], JSON.parse(JSON.stringify(o))); },
  remove: async k => { delete mem[name][k]; }
});
globalThis.chrome = { storage: { sync: area('sync'), local: area('local'), onChanged: { addListener() {} } }, i18n: { getMessage: () => '' } };
globalThis.SL = require('../src/platforms.js');
require('../src/i18n.js'); require('../src/store.js');
const SL = globalThis.SL;

const REQUIRED = ['Kaggle', 'Hugging Face', 'Devpost', 'Behance', 'Dribbble', 'GitLab', 'Bitbucket', 'Bluesky', 'Threads', 'Mastodon',
  'LeetCode', 'HackerRank', 'Codeforces', 'CodePen', 'Substack', 'Hashnode', 'Product Hunt', 'ORCID', 'Google Scholar', 'ResearchGate',
  'Linktree', 'Calendly', 'Telegram', 'WhatsApp', 'Discord', 'Twitch', 'Reddit', 'Pinterest', 'Spotify', 'SoundCloud', 'Patreon',
  'Ko-fi', 'Buy Me a Coffee', 'Upwork', 'Fiverr'];

test('SL.SITES lists every required site with a badge, hosts and a pattern', () => {
  for (const n of REQUIRED) assert.ok(SL.siteByName(n), n);
  const names = new Set();
  for (const s of SL.SITES) {
    assert.ok(!names.has(s.name), 'unique ' + s.name); names.add(s.name);
    assert.match(s.c, /^#[0-9a-f]{6}$/i); assert.ok(s.ab && s.ab.length <= 3, s.name);
    assert.ok(Array.isArray(s.host));
    if (s.name === 'Mastodon') { assert.equal(s.host.length, 0); assert.equal(s.pattern, undefined); continue; }
    assert.ok(s.host.length, s.name);
    assert.match(s.pattern, /^https:\/\/.*\{user\}/, s.name);
    assert.ok(SL.onHost(SL.cleanHost(new URL(s.pattern.replace('{user}', 'abc')).hostname), s.host), s.name + ' pattern is on its own host');
  }
  assert.equal(SL.siteByName('wa.me'), null);
  assert.equal(SL.siteByName(''), null);
  assert.equal(SL.siteByName('  hugging face ').name, 'Hugging Face');   // case and spaces ignored
});

test('site lookup by host', () => {
  assert.equal(SL.siteByHost('https://huggingface.co/ada').name, 'Hugging Face');
  assert.equal(SL.siteByHost('https://www.kaggle.com/ada').name, 'Kaggle');
  assert.equal(SL.siteByHost('wa.me/447700900123').name, 'WhatsApp');
  assert.equal(SL.siteByHost('https://ada.substack.com/p/post').name, 'Substack');
  assert.equal(SL.siteByHost('https://www.threads.com/@ada').name, 'Threads');
  assert.equal(SL.siteByHost('https://mastodon.social/@ada'), null);    // instance varies: never guessed
  assert.equal(SL.siteByHost('https://example.org/'), null);
  assert.equal(SL.siteByHost('not a url'), null);
});

test('right-click label comes from SL.SITES, unknown hosts keep the host', () => {
  const k = SL.fromAnything('https://www.kaggle.com/mukesh/code?utm_source=x');
  assert.deepEqual(k, { p: 'custom', v: 'https://www.kaggle.com/mukesh/code', url: 'https://www.kaggle.com/mukesh/code', label: 'Kaggle' });
  assert.equal(SL.fromAnything('huggingface.co/ada').label, 'Hugging Face');
  assert.equal(SL.fromAnything('https://example.org/me').label, 'example.org');
  assert.equal(SL.fromAnything('https://github.com/ada').p, 'github');       // built-ins still win
});

test('pattern: prefix, build and username strip', () => {
  const k = SL.siteByName('Kaggle'), b = SL.siteByName('Bluesky'), ss = SL.siteByName('Substack'), gs = SL.siteByName('Google Scholar');
  assert.equal(SL.sitePrefix(k), 'kaggle.com/');
  assert.equal(SL.sitePrefix(b), 'bsky.app/profile/');
  assert.equal(SL.sitePrefix(SL.siteByName('Threads')), 'threads.net/@');
  assert.equal(SL.sitePrefix(ss), '');                                       // {user} is a subdomain
  assert.equal(SL.sitePlaceholder(ss, 'username'), 'username.substack.com');
  assert.equal(SL.sitePlaceholder(SL.siteByName('Mastodon'), 'username'), 'https://…');
  assert.equal(SL.siteBuild(k, 'ada'), 'https://www.kaggle.com/ada');
  assert.equal(SL.siteUser(k, 'https://www.kaggle.com/ada'), 'ada');
  assert.equal(SL.siteUser(k, 'http://kaggle.com/ada/'), 'ada');
  assert.equal(SL.siteUser(k, 'https://www.kaggle.com/ada/code'), null);     // not the plain profile address
  assert.equal(SL.siteUser(b, 'https://bsky.app/profile/ada.bsky.social'), 'ada.bsky.social');
  assert.equal(SL.siteUser(ss, 'https://ada.substack.com/'), 'ada');
  assert.equal(SL.siteUser(gs, 'https://scholar.google.com/citations?user=AbC12xY'), 'AbC12xY');
  assert.equal(SL.siteUser(SL.siteByName('Mastodon'), 'https://mastodon.social/@ada'), null);
});

test('validateSite: username, URL, wrong host, URL-only sites', () => {
  const k = SL.siteByName('Kaggle');
  assert.deepEqual(SL.validateSite(k, ' @ada '), { v: 'https://www.kaggle.com/ada', url: 'https://www.kaggle.com/ada' });
  assert.deepEqual(SL.validateSite(k, 'kaggle.com/ada?utm_source=x'), { v: 'https://kaggle.com/ada', url: 'https://kaggle.com/ada' });
  assert.deepEqual(SL.validateSite(k, 'https://github.com/ada'), { e: 'errWrongSite', sub: 'kaggle.com' });
  assert.deepEqual(SL.validateSite(SL.siteByName('Hugging Face'), 'https://evil.example/huggingface.co'), { e: 'errWrongSite', sub: 'huggingface.co' });
  assert.deepEqual(SL.validateSite(k, ''), { e: 'errEmpty' });
  assert.deepEqual(SL.validateSite(k, 'bad name!'), { e: 'errUsername' });
  assert.deepEqual(SL.validateSite(k, 'javascript:alert(1)'), { e: 'errUsername' });
  const m = SL.siteByName('Mastodon');
  assert.deepEqual(SL.validateSite(m, 'ada'), { e: 'errNeedUrl' });
  assert.equal(SL.validateSite(m, 'https://hachyderm.io/@ada').url, 'https://hachyderm.io/@ada');
  const wa = SL.siteByName('WhatsApp');
  assert.equal(SL.validateSite(wa, '+44 7700 900123').url, 'https://wa.me/447700900123');
  assert.deepEqual(SL.validateSite(wa, 'ada'), { e: 'errPhone' });
  assert.equal(SL.validateSite(SL.siteByName('Substack'), 'ada').url, 'https://ada.substack.com');
  const bs = SL.siteByName('Bluesky');                       // handles look like domains
  assert.equal(SL.validateSite(bs, 'ada.bsky.social').url, 'https://bsky.app/profile/ada.bsky.social');
  assert.equal(SL.validateSite(bs, '@ada.bsky.social').url, 'https://bsky.app/profile/ada.bsky.social');
  assert.equal(SL.validateSite(bs, 'bsky.app/profile/ada.bsky.social').url, 'https://bsky.app/profile/ada.bsky.social');
  assert.deepEqual(SL.validateSite(bs, 'https://x.com/ada'), { e: 'errWrongSite', sub: 'bsky.app' });
});

test('siteOf: a saved Other link maps back to its site by label (or legacy bare-host label)', () => {
  assert.equal(SL.siteOf({ p: 'custom', url: 'https://www.kaggle.com/ada', label: 'Kaggle' }).name, 'Kaggle');
  assert.equal(SL.siteOf({ p: 'custom', url: 'https://www.kaggle.com/ada', label: 'kaggle.com' }).name, 'Kaggle');
  assert.equal(SL.siteOf({ p: 'custom', url: 'https://www.kaggle.com/ada', label: 'My notebooks' }), null);
  assert.equal(SL.siteOf({ p: 'github', url: 'https://github.com/ada', v: 'ada' }), null);
});

test('SL.isMain: defaults by platform, explicit values win', () => {
  for (const p of ['linkedin', 'github', 'website', 'email']) assert.equal(SL.isMain({ p }), true, p);
  for (const p of ['x', 'instagram', 'youtube', 'facebook', 'tiktok', 'medium', 'devto', 'stackoverflow', 'custom']) assert.equal(SL.isMain({ p }), false, p);
  assert.equal(SL.isMain({ p: 'github', main: false }), false);
  assert.equal(SL.isMain({ p: 'custom', main: true }), true);
  assert.equal(SL.isMain({ p: 'x', main: 'yes' }), false);     // only booleans count
  assert.equal(SL.isMain(null), false);
});

test('vCard for the share card includes only main links', () => {
  const links = [
    { p: 'linkedin', v: 'ada', url: 'https://www.linkedin.com/in/ada' },
    { p: 'github', v: 'ada', url: 'https://github.com/ada', main: false },
    { p: 'x', v: 'ada', url: 'https://x.com/ada' },
    { p: 'custom', v: 'https://www.kaggle.com/ada', url: 'https://www.kaggle.com/ada', label: 'Kaggle', main: true },
    { p: 'email', v: 'ada@example.com', url: 'mailto:ada@example.com' }];
  const main = SL.mainLinks(links);
  assert.deepEqual(main.map(l => l.p), ['linkedin', 'custom', 'email']);
  const v = SL.vcard('Ada Lovelace', main);
  assert.match(v, /linkedin\.com\/in\/ada/); assert.match(v, /URL;TYPE=Kaggle:https:\/\/www\.kaggle\.com\/ada/); assert.match(v, /EMAIL;TYPE=INTERNET:ada@example\.com/);
  assert.doesNotMatch(v, /github\.com/); assert.doesNotMatch(v, /x\.com/);
  assert.deepEqual(SL.mainLinks([]), []);
});

test('store cleanLink keeps main true/false and drops anything else', () => {
  const d = SL.store.clean({ profiles: [{ name: 'W', links: [
    { id: 'aaaa1', p: 'x', v: 'ada', url: 'https://x.com/ada', main: true },
    { id: 'aaaa2', p: 'github', v: 'ada', url: 'https://github.com/ada', main: false },
    { id: 'aaaa3', p: 'linkedin', v: 'ada', url: 'https://www.linkedin.com/in/ada', main: 'true' },
    { id: 'aaaa4', p: 'website', v: 'https://ada.dev', url: 'https://ada.dev/', main: 1, extra: 'x' }] }] });
  const L = d.profiles[0].links;
  assert.equal(L[0].main, true); assert.equal(L[1].main, false);
  assert.ok(!('main' in L[2])); assert.ok(!('main' in L[3])); assert.ok(!('extra' in L[3]));
  assert.equal(SL.isMain(L[2]), true);                       // no explicit value → default
  const back = SL.store.parseBackup(SL.store.exportJson(d));  // survives a backup round trip
  assert.equal(back.d.profiles[0].links[1].main, false);
});
