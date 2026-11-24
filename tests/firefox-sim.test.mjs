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
  const area = n => ({ get: async k => (k in store[n] ? { [k]: store[n][k] } : {}), set: async o => Object.assign(store[n], JSON.parse(JSON.stringify(o))), remove: async k => { delete store[n][k]; } });
  const browser = {
    runtime: { onInstalled: { addListener() {} }, onStartup: { addListener() {} }, lastError: null, getBrowserInfo: async () => ({ name: 'Firefox' }), getURL: p => 'moz-extension://x/' + p },
    storage: { sync: area('sync'), local: area('local'), onChanged: { addListener() {} } },
    i18n: { getMessage: () => '' },
    menus: { removeAll(cb) { created.length = 0; cb(); }, create(o, cb) { created.push(o); cb && cb(); }, onClicked: { addListener(f) { clicked = f; } } },
    action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
    tabs: { create: async o => { tabs.push(o); } }
  };
  const ctx = vm.createContext({ browser, globalThis: null, navigator: { clipboard: { writeText: async s => { clipboard = s; } } }, console, setTimeout, URL, Blob, TextEncoder });
  ctx.globalThis = ctx;
  for (const f of manifest.background.scripts) vm.runInContext(readFileSync('dist/firefox/' + f, 'utf8'), ctx, { filename: f });

  await ctx.__sl.menu();
  assert.equal(created[0].id, 'root');
  await clicked({ menuItemId: 'save-link', linkUrl: 'https://www.linkedin.com/in/jane/' }, { id: 3, index: 0 });
  await ctx.__sl.rebuild();
  const li = store.sync.data.profiles[0].links[0];
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
});
