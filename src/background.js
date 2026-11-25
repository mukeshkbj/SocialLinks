// Social Links — background (Chrome/Edge: service worker; Firefox: background scripts).
// Never reads or changes web pages: the browser hands us the URL of what you right-clicked.
if (typeof SL === 'undefined' || !SL.store) {
  if (typeof importScripts === 'function') importScripts('platforms.js', 'i18n.js', 'store.js');
}
const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
const MENU = api.contextMenus || api.menus;
const ALL = ['page', 'link', 'editable', 'selection', 'image', 'video', 'audio'];
const t = SL.t;

let cache = null;
const getData = async () => cache || (cache = await SL.store.load());
async function setData(d) { cache = d; await SL.store.save(d); }
const activeProfile = d => d.profiles.find(p => p.id === d.active) || d.profiles[0];
SL.store.onChange(() => { cache = null; rebuild(); });

// ---------------- right-click menu ----------------
let model = [];                       // mirror of what we created (used by tests)
let building = Promise.resolve();
function rebuild() { building = building.then(build, build); return building; }
const removeAll = () => new Promise(res => { try { MENU.removeAll(() => { void api.runtime.lastError; res(); }); } catch (e) { res(); } });
function add(o) {
  if (!o.contexts) o.contexts = ALL;
  model.push(o);
  MENU.create(o, () => { void api.runtime.lastError; });
}
const short = s => s.length > 48 ? s.slice(0, 47) + '…' : s;

async function build() {
  await removeAll(); model = [];
  const d = await getData(), prof = activeProfile(d);
  add({ id: 'root', title: t('extShortName') });

  // 1. saved links first (permanent ids, never list positions).
  //    In a text box each link offers Paste first; Open isn't offered for email.
  for (const l of prof.links) {
    const label = short(SL.linkName(l) + ' — ' + SL.display(l));
    add({ id: 'l:' + l.id, parentId: 'root', title: label });
    add({ id: 'v:' + l.id, parentId: 'l:' + l.id, title: '⤵ ' + t('menuPaste'), contexts: ['editable'] });
    if (SL.openUrl(l)) add({ id: 'o:' + l.id, parentId: 'l:' + l.id, title: '↗ ' + t('menuOpen') });
    add({ id: 'c:' + l.id, parentId: 'l:' + l.id, title: '⧉ ' + t('menuCopy') });
  }
  if (!prof.links.length) add({ id: 'none', parentId: 'root', title: t('menuNoLinks', prof.name), enabled: false });
  add({ id: 'sep1', parentId: 'root', type: 'separator' });

  // 2. + Add / ✎ Edit
  add({ id: 'add', parentId: 'root', title: t('menuAddEdit') });
  add({ id: 'save-link', parentId: 'add', title: '+ ' + t('menuAddThisLink'), contexts: ['link'] });
  add({ id: 'save-page', parentId: 'add', title: '+ ' + t('menuAddThisPage'), contexts: ['page'] });
  add({ id: 'save-sel', parentId: 'add', title: '+ ' + t('menuAddSelection'), contexts: ['selection'] });
  add({ id: 'sep-add', parentId: 'add', type: 'separator', contexts: ['link', 'page', 'selection'] });
  for (const p of SL.PLATFORMS) {
    const has = !p.many && prof.links.some(l => l.p === p.id);
    add({ id: 'new:' + p.id, parentId: 'add', title: has ? '✎ ' + t('menuEditPlatform', p.name) : '+ ' + t('menuAddPlatform', p.name) });
  }

  // 3. profiles
  add({ id: 'prof', parentId: 'root', title: t('menuSwitchProfile', prof.name) });
  for (const p of d.profiles) add({ id: 'pr:' + p.id, parentId: 'prof', type: 'radio', checked: p.id === d.active, title: p.name + ' (' + p.links.length + ')' });

  add({ id: 'manage', parentId: 'root', title: t('menuManage') });
}

api.runtime.onInstalled.addListener(rebuild);
if (api.runtime.onStartup) api.runtime.onStartup.addListener(rebuild);
rebuild();

// ---------------- feedback ----------------
function badge(tab, text, color) {
  const o = tab && tab.id >= 0 ? { tabId: tab.id } : {};
  try {
    api.action.setBadgeBackgroundColor(Object.assign({ color }, o));
    api.action.setBadgeText(Object.assign({ text }, o));
    setTimeout(() => api.action.setBadgeText(Object.assign({ text: '' }, o)), 2500);
  } catch (e) {}
}
const OK = '#00685a', MUTED = '#5b6763', BAD = '#b3261e';

// ---------------- clipboard ----------------
let offscreenReady = null;
async function ensureOffscreen() {
  if (api.runtime.getContexts) {
    const ctx = await api.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (ctx.length) return;
  }
  if (!offscreenReady) {
    offscreenReady = api.offscreen.createDocument({
      url: 'offscreen.html', reasons: ['CLIPBOARD'],
      justification: 'Copy a saved link to the clipboard when chosen from the right-click menu.'
    }).catch(e => { if (!/single offscreen/i.test(String(e && e.message))) throw e; })
      .finally(() => { offscreenReady = null; });
  }
  await offscreenReady;
}
async function copyText(text) {
  try {
    if (api.offscreen) {                                  // Chrome / Edge
      await ensureOffscreen();
      const r = await api.runtime.sendMessage({ target: 'sl-offscreen', type: 'copy', text });
      return !!(r && r.ok);
    }
    try { await navigator.clipboard.writeText(text); return true; }   // Firefox background page (clipboardWrite)
    catch (e) {                                                        // older Firefox: execCommand in the background page
      if (typeof document === 'undefined') return false;
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    }
  } catch (e) { return false; }
}

// ---------------- paste ----------------
// Runs inside the page, only for the tab you right-clicked and only when you choose Paste
// (activeTab). It types into the focused text box and reads nothing from the page.
function insertIntoField(text) {
  let el = document.activeElement;
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
  if (!el) return false;
  if (el.isContentEditable) { el.focus(); return document.execCommand('insertText', false, text); }
  const isText = el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search|url|email|tel|)$/i.test(el.getAttribute('type') || ''));
  if (!isText || el.readOnly || el.disabled) return false;
  el.focus();
  // execCommand keeps the field's undo history and fires the events page frameworks listen for
  try { if (document.execCommand('insertText', false, text)) return true; } catch (e) {}
  try { el.setRangeText(text, el.selectionStart, el.selectionEnd, 'end'); }
  catch (e) {                                         // email/url inputs have no selection API
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
async function pasteInto(tab, frameId, text) {
  let ok = false;
  try {
    const res = await api.scripting.executeScript({ target: { tabId: tab.id, frameIds: [frameId || 0] }, func: insertIntoField, args: [text] });
    ok = !!(res && res[0] && res[0].result);
  } catch (e) { ok = false; }        // browser pages and stores block extensions
  if (ok) return badge(tab, '✓', OK);
  // couldn't type here: copy instead so Ctrl+V / Cmd+V still works
  return badge(tab, (await copyText(text)) ? '⧉' : '!', OK);
}

// ---------------- actions ----------------
async function saveFromMenu(raw, tab) {
  const item = SL.fromAnything(raw);
  if (!item) return badge(tab, '!', BAD);
  const d = await getData(), prof = activeProfile(d);
  if (prof.links.some(l => SL.sameUrl(l.url, item.url))) return badge(tab, '=', MUTED);
  const i = SL.platform(item.p).many ? -1 : prof.links.findIndex(l => l.p === item.p);
  if (i >= 0) { item.id = prof.links[i].id; prof.links[i] = item; await setData(d); return badge(tab, '✎', OK); }
  item.id = SL.newId(); prof.links.push(item);
  await setData(d); badge(tab, '✓', OK);
}

function openManager(hash) { return api.tabs.create({ url: api.runtime.getURL('popup.html') + (hash ? '#' + hash : '') }); }

async function onClick(info, tab) {
  const id = String(info.menuItemId);
  const [kind, ref] = id.includes(':') ? [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)] : [id, ''];
  switch (kind) {
    case 'save-link': return saveFromMenu(info.linkUrl, tab);
    case 'save-page': return saveFromMenu(info.pageUrl || (tab && tab.url), tab);
    case 'save-sel': return saveFromMenu(info.selectionText, tab);
    case 'manage': return openManager();
    case 'new': return openManager('add-' + ref);
    case 'pr': {
      const d = await getData();
      if (d.profiles.some(p => p.id === ref) && d.active !== ref) { d.active = ref; await setData(d); }
      return;
    }
    case 'o': case 'c': case 'v': {
      const d = await getData();
      const l = activeProfile(d).links.find(x => x.id === ref);   // look up by permanent id
      if (!l) return badge(tab, '!', BAD);
      if (kind === 'v' && tab && tab.id >= 0) return pasteInto(tab, info.frameId, SL.linkValue(l));
      if (kind === 'o' && SL.openUrl(l)) {
        const o = { url: SL.openUrl(l) };
        if (tab && tab.id >= 0) { o.index = tab.index + 1; o.openerTabId = tab.id; }
        return api.tabs.create(o);
      }
      return badge(tab, (await copyText(SL.linkValue(l))) ? '⧉' : '!', OK);
    }
  }
}
MENU.onClicked.addListener((info, tab) => { onClick(info, tab); });

// Test hook (no effect in normal use)
globalThis.__sl = { onClick, menu: () => building.then(() => model), data: getData, rebuild, insertIntoField };
