// Simulated Firefox: runs the Firefox build's background scripts against a fake `browser` API
// (menus namespace, no offscreen API, clipboard via navigator). Not a substitute for a real
// Firefox run (see README → Testing), but catches Chrome-only assumptions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('Firefox background builds the menu and copies without offscreen', async () => {
  const manifest = JSON.parse(readFileSync('dist/firefox/manifest.json', 'utf8'));
  assert.deepEqual(manifest.permissions, ['menus', 'storage', 'clipboardWrite', 'activeTab', 'scripting']);
  assert.ok(!manifest.background.service_worker, 'Firefox uses background scripts');

  const store = { sync: {}, local: {} }, created = [], tabs = [];
  let clicked, clipboard = '';
  const pick = (o, k) => k == null ? JSON.parse(JSON.stringify(o)) : Object.fromEntries([].concat(k).filter(x => x in o).map(x => [x, JSON.parse(JSON.stringify(o[x]))]));
  const area = n => ({ get: async k => pick(store[n], k), set: async o => Object.assign(store[n], JSON.parse(JSON.stringify(o))), remove: async k => { for (const x of [].concat(k)) delete store[n][x]; } });
  const browser = {
    runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getBrowserInfo: async () => ({ name: 'Firefox' }), getURL: p => 'moz-extension://x/' + p },
    storage: { sync: area('sync'), local: area('local'), onChanged: { addListener() {} } },
    i18n: { getMessage: () => '' },
    menus: { removeAll(cb) { created.length = 0; cb(); }, create(o, cb) { created.push(o); cb && cb(); }, onClicked: { addListener(f) { clicked = f; } } },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    tabs: { create: async o => { tabs.push(o); }, update: async o => { tabs.push(Object.assign({ updated: true }, o)); } },
    omnibox: {
      setDefaultSuggestion(o) { omni.default = o.description; },
      onInputStarted: { addListener() {} },
      onInputChanged: { addListener(f) { omni.changed = f; } },
      onInputEntered: { addListener(f) { omni.entered = f; } }
    }
  };
  const omni = {};
  const ctx = vm.createContext({ browser, globalThis: null, navigator: { clipboard: { writeText: async s => { clipboard = s; } } }, console, setTimeout, URL, Blob, TextEncoder });
  ctx.globalThis = ctx;
  for (const f of manifest.background.scripts) vm.runInContext(readFileSync('dist/firefox/' + f, 'utf8'), ctx, { filename: f });

  await ctx.__sl.menu();
  assert.equal(created[0].id, 'root');
  await clicked({ menuItemId: 'save-link', linkUrl: 'https://www.linkedin.com/in/jane/' }, { id: 3, index: 0 });
  await ctx.__sl.rebuild();
  const li = (await ctx.SL.store.load()).profiles[0].links[0];
  assert.equal(store.sync['l_' + li.id].url, li.url, 'saved to sync as its own item');
  assert.equal(li.url, 'https://www.linkedin.com/in/jane');
  assert.ok(created.some(o => o.id === 'c:' + li.id));
  await clicked({ menuItemId: 'c:' + li.id }, { id: 3, index: 0 });
  assert.equal(clipboard, 'https://www.linkedin.com/in/jane');
  let injected = null;
  browser.scripting = { executeScript: async o => { injected = o; return [{ result: true }]; } };
  await clicked({ menuItemId: 'v:' + li.id, frameId: 7 }, { id: 3, index: 0 });
  assert.equal(JSON.stringify(injected.target), JSON.stringify({ tabId: 3, frameIds: [7] }));
  assert.equal(JSON.stringify(injected.args), JSON.stringify(['https://www.linkedin.com/in/jane']));
  await clicked({ menuItemId: 'o:' + li.id }, { id: 3, index: 0 });
  assert.equal(tabs[0].url, 'https://www.linkedin.com/in/jane');
  assert.equal(tabs[0].openerTabId, 3);

  // address-bar shortcut (omnibox.js) loads in the Firefox background and uses plain text
  assert.ok(manifest.background.scripts.includes('omnibox.js'));
  assert.equal(manifest.omnibox.keyword, 'sl');
  assert.ok(omni.changed && omni.entered, 'omnibox listeners registered');
  const got = await new Promise(res => omni.changed('link', res));
  // the single match is the default (top) row and is not repeated in the list below it
  assert.equal(got.length, 0);
  assert.equal(omni.default, 'omniOpen LinkedIn — linkedin.com/in/jane');
  assert.ok(!/[<>&]/.test(omni.default), 'Firefox suggestions are plain text');
  clipboard = '';
  const r = await ctx.__sl.omniEnter('c jane', 'currentTab');
  assert.equal(r.act, 'copy');
  assert.equal(clipboard, 'https://www.linkedin.com/in/jane');
  await ctx.__sl.omniEnter('link', 'newBackgroundTab');
  assert.deepEqual({ ...tabs.at(-1) }, { url: 'https://www.linkedin.com/in/jane', active: false });
});
