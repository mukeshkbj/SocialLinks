// Unit tests for the address-bar shortcut (src/omnibox.js): parsing, matching/ranking, escaping.
// Run: node --test tests/omnibox.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);

// Real English strings, with $1 substitution like chrome.i18n.getMessage.
const MSG = JSON.parse(readFileSync(new URL('../src/_locales/en/messages.json', import.meta.url), 'utf8'));
const getMessage = (k, subs) => MSG[k] ? MSG[k].message.replace(/\$(\d)/g, (_, n) => (subs || [])[n - 1] ?? '') : '';
globalThis.chrome = { runtime: {}, storage: { sync: {}, local: {}, onChanged: { addListener() {} } }, i18n: { getMessage } };
globalThis.SL = require('../src/platforms.js');
require('../src/i18n.js'); require('../src/omnibox.js');
const SL = globalThis.SL, O = SL.omni;

const L = [
  { id: 'a', p: 'github', v: 'mukeshkbj', url: 'https://github.com/mukeshkbj' },
  { id: 'b', p: 'linkedin', v: 'jane-doe', url: 'https://www.linkedin.com/in/jane-doe' },
  { id: 'c', p: 'email', v: 'me@example.com', url: 'mailto:me@example.com' },
  { id: 'd', p: 'custom', v: 'https://mukesh.dev/?a=1&b=<2>', url: 'https://mukesh.dev/?a=1&b=<2>', label: 'Tom & "Jerry" <Portfolio>' },
  { id: 'e', p: 'x', v: 'jack', url: 'https://x.com/jack' },
  { id: 'f', p: 'custom', v: 'https://gitlab.com/mk', url: 'https://gitlab.com/mk', label: 'GitLab' },
  { id: 'g', p: 'website', v: 'https://example.org/', url: 'https://example.org/' }
];
const DATA = { active: 'w', profiles: [{ id: 'w', name: 'Work', links: L }, { id: 'p', name: 'Personal', links: [] }] };
const ids = ls => ls.map(l => l.id).join('');

test('parse: copy / c prefixes, manage, plain text', () => {
  assert.deepEqual(O.parse('git'), { cmd: 'open', q: 'git' });
  assert.deepEqual(O.parse('  copy  git hub '), { cmd: 'copy', q: 'git hub' });
  assert.deepEqual(O.parse('c git'), { cmd: 'copy', q: 'git' });
  assert.deepEqual(O.parse('C Git'), { cmd: 'copy', q: 'Git' });
  assert.deepEqual(O.parse('copy'), { cmd: 'copy', q: '' });
  assert.deepEqual(O.parse('c'), { cmd: 'open', q: 'c' }, 'a lone "c" is still a search');
  assert.deepEqual(O.parse('copywriting'), { cmd: 'open', q: 'copywriting' });
  assert.deepEqual(O.parse('cv'), { cmd: 'open', q: 'cv' });
  assert.deepEqual(O.parse('manage'), { cmd: 'manage', q: '' });
  assert.deepEqual(O.parse('Manage '), { cmd: 'manage', q: '' });
  assert.deepEqual(O.parse('manager'), { cmd: 'open', q: 'manager' });
  assert.deepEqual(O.parse(''), { cmd: 'open', q: '' });
});

test('rank: prefix beats word start beats substring; name, platform and address all match', () => {
  assert.equal(ids(O.rank(L, 'git')), 'af', 'GitHub (prefix) then GitLab (prefix, later in list)');
  assert.equal(ids(O.rank(L, 'github')), 'a', 'exact name');
  assert.equal(ids(O.rank(L, 'hub')), 'a', 'substring of the name');
  assert.equal(ids(O.rank(L, 'twitter')), 'e', 'word inside "X (Twitter)"');
  assert.equal(ids(O.rank(L, 'jane')), 'b', 'matches the address');
  assert.equal(ids(O.rank(L, 'example')), 'gc', 'example.org starts with it; me@example.com has it after @');
  assert.equal(ids(O.rank(L, 'mukesh')), 'da', 'address prefix (mukesh.dev) beats word start (github.com/mukeshkbj)');
  assert.equal(ids(O.rank(L, 'other')), 'df', 'platform name of Other links');
  assert.equal(ids(O.rank(L, 'portfolio')), 'd');
  assert.equal(ids(O.rank(L, 'git mk')), 'f', 'every word must match');
  assert.equal(ids(O.rank(L, 'zzz')), '');
  assert.equal(ids(O.rank(L, '')), 'abcdefg', 'empty query keeps the list order');
  // exact beats prefix beats substring on the same field
  const T = [
    { id: '1', p: 'custom', url: 'https://a.example/', label: 'Notebook' },
    { id: '2', p: 'custom', url: 'https://b.example/', label: 'My book' },
    { id: '3', p: 'custom', url: 'https://c.example/', label: 'Book' },
    { id: '4', p: 'custom', url: 'https://d.example/', label: 'Bookshop' }
  ];
  assert.equal(ids(O.rank(T, 'book')), '3421');
  assert.equal(ids(O.rank(T, 'BOOK')), '3421', 'case-insensitive');
});

test('suggestions: up to 6, best first, Chrome markup with escaping', () => {
  const r = O.suggestFor(DATA, 'e', true);
  assert.ok(r.suggestions.length === 6, 'capped at 6');
  const all = O.suggestFor(DATA, '', true);
  assert.equal(all.suggestions.length, 6);
  assert.equal(all.suggestions.map(s => s.content).join('|'), 'github.com/mukeshkbj|linkedin.com/in/jane-doe|me@example.com|mukesh.dev/?a=1&b=<2>|x.com/jack|gitlab.com/mk');
  assert.equal(all.default, 'Type a link name to open it, copy &lt;name&gt; to copy it, or manage to edit your links', 'usage hint is escaped');

  const g = O.suggestFor(DATA, 'git', true);
  assert.equal(g.suggestions[0].content, 'github.com/mukeshkbj');
  assert.equal(g.suggestions[0].description, 'Open <match>Git</match>Hub<dim> — </dim><url><match>git</match>hub.com/mukeshkbj</url>');
  assert.equal(g.default, g.suggestions[0].description, 'Enter on the typed text does the top suggestion');

  const p = O.suggestFor(DATA, 'portfolio', true).suggestions[0];
  assert.equal(p.description, 'Open Tom &amp; &quot;Jerry&quot; &lt;<match>Portfolio</match>&gt;<dim> — </dim><url>mukesh.dev/?a=1&amp;b=&lt;2&gt;</url>');
  assert.ok(!/[<>&"'](?!\/?(match|url|dim)>|amp;|lt;|gt;|quot;|apos;)/.test(p.description.replace(/<\/?(match|url|dim)>/g, '')), 'no raw XML specials left');
  assert.equal(O.strip(p.description), 'Open Tom & "Jerry" <Portfolio> — mukesh.dev/?a=1&b=<2>');

  const e = O.suggestFor(DATA, 'email', true).suggestions[0];
  assert.ok(e.description.startsWith('Copy '), 'email links say Copy even without the copy prefix');
  assert.equal(e.content, 'me@example.com');

  const c = O.suggestFor(DATA, 'c git', true);
  assert.equal(c.suggestions[0].content, 'copy github.com/mukeshkbj');
  assert.ok(c.suggestions[0].description.startsWith('Copy '));

  const n = O.suggestFor(DATA, 'a<b&', true);
  assert.equal(n.suggestions.length, 0);
  assert.equal(n.default, 'No link matches &quot;a&lt;b&amp;&quot;. Try a site name, copy &lt;name&gt;, or manage');

  const m = O.suggestFor(DATA, 'man', true);
  assert.equal(m.suggestions.at(-1).content, 'manage', '"man" offers manage');
  assert.equal(O.suggestFor(DATA, 'manage', true).suggestions.length, 0);
  assert.ok(/manage/.test(O.suggestFor(DATA, 'manage', true).default));

  const empty = O.suggestFor({ active: 'p', profiles: DATA.profiles }, 'git', true);
  assert.equal(empty.default, 'No links in Personal yet. Press Enter to add some');
  assert.equal(empty.suggestions[0].content, 'manage');
});

test('Firefox (plain text): no markup, no entities', () => {
  const p = O.suggestFor(DATA, 'portfolio', false);
  assert.equal(p.suggestions[0].description, 'Open Tom & "Jerry" <Portfolio> — mukesh.dev/?a=1&b=<2>');
  assert.equal(O.suggestFor(DATA, '', false).default, 'Type a link name to open it, copy <name> to copy it, or manage to edit your links');
  assert.equal(O.suggestFor(DATA, 'git', false).suggestions[0].description, 'Open GitHub — github.com/mukeshkbj');
  for (const q of ['', 'git', 'c e', 'man', 'nothing']) {
    const r = O.suggestFor(DATA, q, false);
    for (const s of [r.default, ...r.suggestions.map(x => x.description)]) assert.ok(!/<\/?(match|url|dim)>|&(amp|lt|gt|quot|apos);/.test(s), q + ': ' + s);
  }
});

test('resolve: what Enter does', () => {
  const r = (t) => { const x = O.resolve(DATA, t); return x.act + (x.link ? ':' + x.link.id : ''); };
  assert.equal(r('git'), 'open:a');
  assert.equal(r('gitlab.com/mk'), 'open:f', 'a chosen suggestion (its address) picks that link');
  assert.equal(r('copy gitlab.com/mk'), 'copy:f');
  assert.equal(r('c linked'), 'copy:b');
  assert.equal(r('copy jane'), 'copy:b');
  assert.equal(r('email'), 'copy:c', 'email cannot be opened: copied');
  assert.equal(r('me@example.com'), 'copy:c');
  assert.equal(r('manage'), 'manage');
  assert.equal(r(''), 'manage');
  assert.equal(r('zzz'), 'none');
  assert.equal(O.resolve({ active: 'p', profiles: DATA.profiles }, 'git').act, 'manage', 'no links: Enter opens the manager');
});

test('esc covers all XML specials', () => {
  assert.equal(O.esc(`a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&apos;f');
});
