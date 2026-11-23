{
const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
const t = SL.t;
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IS_FIREFOX = typeof browser !== 'undefined' && !!(browser.runtime && browser.runtime.getBrowserInfo);
const CAN_FAVICON = (() => { try { return (api.runtime.getManifest().optional_permissions || []).includes('favicon'); } catch (e) { return false; } })();
let favOn = false;   // site icons are opt-in: Chrome warns "Read the icons of the websites you visit"

let data = null, cur = null, editId = null, lastRemoved = null, dragId = null, inTab = false, query = '';
const prof = () => data.profiles.find(p => p.id === data.active) || data.profiles[0];

SL.localise(document);

// ---------- icons ----------
function badgeHtml(p, l) {
  if (favOn && l && p.id === 'custom') {
    const src = api.runtime.getURL('/_favicon/?pageUrl=' + encodeURIComponent(l.url) + '&size=32');
    return `<span class="mono fav" aria-hidden="true"><img src="${esc(src)}" alt="" data-ab="${esc(p.ab)}" data-c="${p.c}"></span>`;
  }
  return `<span class="mono" style="background:${p.c}" aria-hidden="true">${esc(p.ab)}</span>`;
}
// fall back to a letter badge if a favicon can't load (no inline handlers allowed in extensions)
document.addEventListener('error', e => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.ab) { const s = img.parentNode; s.classList.remove('fav'); s.style.background = img.dataset.c; s.textContent = img.dataset.ab; }
}, true);

// ---------- persistence ----------
async function persist() {
  const where = await SL.store.save(data);
  $('localWarn').hidden = where !== 'local';
}

// ---------- render ----------
function renderProfiles() {
  $('profSel').innerHTML = data.profiles.map(p => `<option value="${esc(p.id)}"${p.id === data.active ? ' selected' : ''}>${esc(p.name)} (${p.links.length})</option>`).join('');
  $('profDel').disabled = data.profiles.length < 2;
}

function render() {
  renderProfiles();
  const P = prof(), links = P.links;
  const q = query.trim().toLowerCase();
  $('searchWrap').hidden = links.length <= 10 && !q;
  const shown = q ? links.filter(l => (SL.linkName(l) + ' ' + SL.display(l)).toLowerCase().includes(q)) : links;
  const canMove = !q;
  $('links').innerHTML = shown.map(l => {
    const p = SL.platform(l.p), i = links.indexOf(l), name = SL.linkName(l), open = SL.openUrl(l);
    const nameEl = open ? `<a class="n" href="${esc(open)}" target="_blank" rel="noopener noreferrer" title="${esc(t('btnOpen'))}">${esc(name)}</a>` : `<span class="n">${esc(name)}</span>`;
    const urlEl = open ? `<a class="u" href="${esc(open)}" target="_blank" rel="noopener noreferrer" tabindex="-1">${esc(SL.display(l))}</a>` : `<span class="u">${esc(SL.display(l))}</span>`;
    return `<li class="item" data-id="${esc(l.id)}">
      ${canMove ? `<button class="grip" data-act="grip" aria-label="${esc(t('lblReorder', name))}" title="${esc(t('lblReorderTip'))}">⋮⋮</button>` : ''}
      ${badgeHtml(p, l)}
      <div class="txt">${nameEl}${urlEl}</div>
      <button class="ib" data-act="copy" aria-label="${esc(t('btnCopyX', name))}" title="${esc(t('btnCopy'))}">⧉</button>
      ${canMove ? `<button class="ib" data-act="up" aria-label="${esc(t('btnUpX', name))}" title="${esc(t('btnUp'))}" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="ib" data-act="down" aria-label="${esc(t('btnDownX', name))}" title="${esc(t('btnDown'))}" ${i === links.length - 1 ? 'disabled' : ''}>↓</button>` : ''}
      <button class="ib" data-act="edit" aria-label="${esc(t('btnEditX', name))}" title="${esc(t('btnEdit'))}">✎</button>
      <button class="ib" data-act="del" aria-label="${esc(t('btnRemoveX', name))}" title="${esc(t('btnRemove'))}">×</button></li>`;
  }).join('');
  $('empty').hidden = links.length > 0;
  $('noMatch').hidden = !(links.length && q && !shown.length);
  $('grid').innerHTML = SL.PLATFORMS.map(p => {
    const used = !p.many && links.some(l => l.p === p.id);
    const verb = used ? t('btnEditX', p.name) : t('btnAddX', p.name);
    return `<button type="button" class="pf${used ? ' used' : ''}" data-p="${p.id}" aria-pressed="${!!(cur && cur.id === p.id)}" aria-label="${esc(verb)}" title="${esc(verb)}">${badgeHtml(p)}<span class="nm">${esc(p.name)}</span><span class="ed" aria-hidden="true">${used ? '✎' : '+'}</span></button>`;
  }).join('');
}

// ---------- add / edit ----------
function closeAllPanels(except) {
  for (const id of ['sheet', 'profForm', 'profDelPanel', 'sharePanel', 'importPanel']) if (id !== except) $(id).hidden = true;
  $('addBtn').setAttribute('aria-expanded', except === 'sheet');
  if (except !== 'sheet') { cur = null; editId = null; $('form').hidden = true; }
}
function openSheet(show) {
  closeAllPanels(show ? 'sheet' : null);
  $('sheet').hidden = !show;
  if (show) scrollTo(0, 0);
  if (!show) { cur = null; editId = null; $('form').hidden = true; }
  render();
  if (show) $('grid').querySelector('.pf')?.focus();
}
function choose(pid) {
  const p = SL.platform(pid);
  const l = p.many ? null : prof().links.find(x => x.p === pid);
  editId = l ? l.id : null;
  pick(p, l);
}
function pick(p, l) {
  cur = p; $('form').hidden = false; $('err').textContent = '';
  $('nameRow').hidden = !p.custom; $('nm').value = (l && l.label) || '';
  $('lab').textContent = p.email ? t('lblEmail') : p.url ? t('lblUrl', p.name) : t('lblUsername', p.name);
  $('prefix').textContent = p.pre || ''; $('prefix').hidden = !p.pre;
  $('val').type = p.email ? 'email' : p.url ? 'url' : 'text';
  $('val').placeholder = p.email ? 'you@example.com' : p.url ? 'https://…' : t('phUsername');
  $('save').textContent = editId ? '✎ ' + t('btnSaveChanges') : '+ ' + t('btnAdd');
  $('val').value = l ? l.v : '';
  render();
  (p.custom && !l ? $('nm') : $('val')).focus();
}

$('addBtn').onclick = () => openSheet($('sheet').hidden);
$('grid').onclick = e => { const b = e.target.closest('.pf'); if (b) choose(b.dataset.p); };
$('cancel').onclick = () => openSheet(false);
$('form').onsubmit = async e => {
  e.preventDefault();
  const r = SL.validate(cur, $('val').value);
  if (r.e) { $('err').textContent = t(r.e, r.sub); $('val').focus(); return; }
  const P = prof();
  const item = { id: editId || SL.newId(), p: cur.id, v: r.v, url: r.url };
  if (cur.custom) {
    let label = $('nm').value.trim();
    if (!label) { try { label = SL.cleanHost(new URL(r.url).hostname); } catch (err) { label = cur.name; } }
    item.label = label.slice(0, 40);
  }
  if (P.links.some(l => l.url === item.url && l.id !== item.id)) { $('err').textContent = t('errDuplicate'); return; }
  const wasEdit = !!editId;
  if (wasEdit) P.links[P.links.findIndex(l => l.id === editId)] = item; else P.links.push(item);
  await persist(); openSheet(false); toast(wasEdit ? t('toastSaved') : t('toastAdded'));
  $('addBtn').focus();
};

// ---------- list actions ----------
const byId = id => prof().links.find(l => l.id === id);
async function move(id, d) {
  const L = prof().links, i = L.findIndex(l => l.id === id), j = i + d;
  if (i < 0 || j < 0 || j >= L.length) return false;
  [L[i], L[j]] = [L[j], L[i]]; await persist(); render(); return true;
}
$('links').onclick = async e => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.closest('.item').dataset.id, l = byId(id); if (!l) return;
  const act = b.dataset.act;
  if (act === 'copy') copy(SL.linkValue(l));
  else if (act === 'up' || act === 'down') {
    if (await move(id, act === 'up' ? -1 : 1)) {
      const nb = $('links').querySelector(`[data-id="${CSS.escape(id)}"] [data-act="${act}"]`);
      (nb && !nb.disabled ? nb : $('links').querySelector(`[data-id="${CSS.escape(id)}"] .grip`))?.focus();
      announce(t('srMoved', [SL.linkName(l), String(prof().links.indexOf(l) + 1)]));
    }
  } else if (act === 'edit') { openSheet(true); editId = id; pick(SL.platform(l.p), l); }
  else if (act === 'del') {
    const L = prof().links, i = L.indexOf(l);
    lastRemoved = { profile: data.active, index: i, link: l };
    L.splice(i, 1); await persist(); render(); $('undo').hidden = false;
    toast(t('toastRemoved', SL.linkName(l)));
    ($('links').querySelectorAll('.item')[Math.min(i, L.length - 1)]?.querySelector('[data-act=del]') || $('addBtn')).focus();
  }
};
// keyboard reordering on the grip: ↑ / ↓
$('links').addEventListener('keydown', async e => {
  if (!e.target.classList.contains('grip') || !/^Arrow(Up|Down)$/.test(e.key)) return;
  e.preventDefault();
  const id = e.target.closest('.item').dataset.id;
  if (await move(id, e.key === 'ArrowUp' ? -1 : 1)) {
    $('links').querySelector(`[data-id="${CSS.escape(id)}"] .grip`)?.focus();
    announce(t('srMoved', [SL.linkName(byId(id)), String(prof().links.findIndex(l => l.id === id) + 1)]));
  }
});
$('undo').onclick = async () => {
  if (!lastRemoved) return;
  const P = data.profiles.find(p => p.id === lastRemoved.profile);
  if (P) { P.links.splice(Math.min(lastRemoved.index, P.links.length), 0, lastRemoved.link); data.active = P.id; }
  lastRemoved = null; $('undo').hidden = true; await persist(); render(); toast(t('toastRestored'));
};

// drag to reorder (mouse, pen, touch)
$('links').addEventListener('pointerdown', e => {
  const g = e.target.closest('.grip'); if (!g || e.button > 0) return;
  const li = g.closest('.item'); dragId = li.dataset.id; li.classList.add('drag');
  g.setPointerCapture(e.pointerId);
});
$('links').addEventListener('pointermove', e => {
  if (!dragId) return;
  const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.item');
  if (!over || over.dataset.id === dragId) return;
  const L = prof().links, from = L.findIndex(l => l.id === dragId), to = L.findIndex(l => l.id === over.dataset.id);
  const [m] = L.splice(from, 1); L.splice(to, 0, m); render();
  const li = $('links').querySelector(`[data-id="${CSS.escape(dragId)}"]`); li?.classList.add('drag');
  li?.querySelector('.grip')?.setPointerCapture?.(e.pointerId);
});
const endDrag = () => { if (!dragId) return; dragId = null; persist(); render(); };
$('links').addEventListener('pointerup', endDrag); $('links').addEventListener('pointercancel', endDrag);

$('search').addEventListener('input', e => { query = e.target.value; render(); });

// ---------- profiles ----------
let profMode = null;
$('profSel').onchange = async e => { data.active = e.target.value; query = ''; $('search').value = ''; closeAllPanels(); await persist(); render(); toast(t('toastProfile', prof().name)); };
function openProfForm(mode) {
  closeAllPanels('profForm'); profMode = mode; $('profForm').hidden = false; $('profErr').textContent = '';
  $('profFormLab').textContent = mode === 'new' ? t('lblNewProfile') : t('lblRenameProfile');
  $('profName').value = mode === 'new' ? '' : prof().name; $('profName').focus(); $('profName').select();
}
$('profRename').onclick = () => openProfForm('rename');
$('profNew').onclick = () => openProfForm('new');
$('profCancel').onclick = () => { $('profForm').hidden = true; $('profSel').focus(); };
$('profForm').onsubmit = async e => {
  e.preventDefault();
  const name = $('profName').value.trim().slice(0, 30);
  if (!name) { $('profErr').textContent = t('errProfileName'); return; }
  if (data.profiles.some(p => p.name.toLowerCase() === name.toLowerCase() && (profMode === 'new' || p.id !== data.active))) { $('profErr').textContent = t('errProfileExists'); return; }
  if (profMode === 'new') {
    if (data.profiles.length >= 20) { $('profErr').textContent = t('errProfileMax'); return; }
    const p = { id: SL.newId(), name, owner: prof().owner || '', links: [] }; data.profiles.push(p); data.active = p.id;
  } else prof().name = name;
  $('profForm').hidden = true; await persist(); render(); toast(t('toastSaved')); $('profSel').focus();
};
$('profDel').onclick = () => {
  if (data.profiles.length < 2) return;
  closeAllPanels('profDelPanel');
  $('profDelMsg').textContent = t('confirmDeleteProfile', [prof().name, String(prof().links.length)]);
  $('profDelPanel').hidden = false; $('profDelNo').focus();
};
$('profDelNo').onclick = () => { $('profDelPanel').hidden = true; $('profDel').focus(); };
$('profDelYes').onclick = async () => {
  const name = prof().name;
  data.profiles = data.profiles.filter(p => p.id !== data.active); data.active = data.profiles[0].id;
  $('profDelPanel').hidden = true; await persist(); render(); toast(t('toastProfileDeleted', name)); $('profSel').focus();
};

// ---------- copy ----------
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(t('toastCopied')); }
  catch (e) {                                       // older Firefox popups
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); toast(ok ? t('toastCopied') : t('toastCopyFailed'));
  }
}
$('cpAll').onclick = () => copy(prof().links.map(l => SL.linkName(l) + ': ' + SL.linkValue(l)).join('\n'));
$('cpJson').onclick = () => copy(JSON.stringify(prof().links.map(l => ({ platform: l.p, name: SL.linkName(l), value: l.v, url: l.url })), null, 2));

// ---------- downloads ----------
function download(name, blob) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const safeName = s => (s || 'social-links').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'social-links';
// Firefox popups close before a download or file picker finishes, so those open in a tab there.
const needsTab = () => !inTab && IS_FIREFOX;
function openInTab(hash) { api.tabs.create({ url: api.runtime.getURL('popup.html#' + hash) }); window.close(); }

// ---------- share card ----------
function drawShare() {
  const P = prof(), text = SL.vcard($('owner').value || P.name, P.links);
  try {
    const q = SL.qr.encode(text, 'M');
    SL.qr.toCanvas(q, $('qr'), 440);
    $('qr').hidden = false;
    $('qrNote').textContent = !P.links.length ? t('qrEmpty') : q.version > 20 ? t('qrDense') : t('qrHint', String(P.links.length));
  } catch (e) { $('qr').hidden = true; $('qrNote').textContent = t('qrTooLong'); }
}
$('shareBtn').onclick = () => {
  if (needsTab()) return openInTab('share');
  closeAllPanels('sharePanel'); $('sharePanel').hidden = false; $('owner').value = prof().owner || ''; drawShare(); $('sharePanel').scrollIntoView({ block: 'nearest' }); $('owner').focus();
};
let ownerTimer;
$('owner').addEventListener('input', () => { drawShare(); clearTimeout(ownerTimer); ownerTimer = setTimeout(() => { prof().owner = $('owner').value.trim().slice(0, 60); persist(); }, 500); });
$('dlVcf').onclick = () => { const P = prof(); download(safeName($('owner').value || P.name) + '.vcf', new Blob([SL.vcard($('owner').value || P.name, P.links)], { type: 'text/vcard' })); toast(t('toastDownloaded')); };
$('dlPng').onclick = () => $('qr').toBlob(b => { if (b) { download(safeName($('owner').value || prof().name) + '-qr.png', b); toast(t('toastDownloaded')); } });
$('shareClose').onclick = () => { $('sharePanel').hidden = true; $('shareBtn').focus(); };

// ---------- backup / restore ----------
let pending = null;
$('exportBtn').onclick = () => {
  if (needsTab()) return openInTab('export');
  const d = new Date().toISOString().slice(0, 10);
  download('social-links-backup-' + d + '.json', new Blob([SL.store.exportJson(data)], { type: 'application/json' }));
  toast(t('toastBackup'));
};
$('importBtn').onclick = () => {
  if (!inTab) return openInTab('import');          // file pickers close popups, so restore runs in a tab
  closeAllPanels('importPanel'); $('importPanel').hidden = false; $('importPanel').scrollIntoView({ block: 'nearest' }); $('preview').hidden = true; $('importErr').textContent = ''; $('file').value = ''; $('file').focus();
};
$('importClose').onclick = () => { $('importPanel').hidden = true; pending = null; $('importBtn').focus(); };
$('file').onchange = async () => {
  const f = $('file').files[0]; $('preview').hidden = true; $('importErr').textContent = ''; pending = null;
  if (!f) return;
  if (f.size > 1024 * 1024) { $('importErr').textContent = t('errBackupSize'); return; }
  const r = SL.store.parseBackup(await f.text());
  if (r.e) { $('importErr').textContent = t(r.e); return; }
  pending = r.d;
  const n = pending.profiles.reduce((a, p) => a + p.links.length, 0);
  $('previewText').textContent = t('previewSummary', [String(pending.profiles.length), String(n)]);
  $('previewList').innerHTML = pending.profiles.map(p => `<li>${esc(p.name)}: ${esc(p.links.map(SL.linkName).join(', ') || '—')}</li>`).join('');
  $('preview').hidden = false; $('applyImport').focus();
};
$('applyImport').onclick = async () => {
  if (!pending) return;
  const mode = document.querySelector('input[name=mode]:checked').value;
  if (mode === 'replace') { data = pending; toast(t('toastReplaced')); }
  else { const m = SL.store.merge(data, pending); data = m.d; toast(t('toastMerged', [String(m.stats.added), String(m.stats.skipped)])); }
  pending = null; $('importPanel').hidden = true; await persist(); render();
};

// ---------- optional site icons (Chrome/Edge) ----------
function favLabel() { $('favBtn').textContent = favOn ? t('btnHideIcons') : t('btnShowIcons'); $('favBtn').setAttribute('aria-pressed', favOn); }
$('favBtn').onclick = async () => {
  try {
    if (favOn) favOn = !(await api.permissions.remove({ permissions: ['favicon'] }));
    else favOn = await api.permissions.request({ permissions: ['favicon'] });
  } catch (e) {}
  favLabel(); render();
};

// ---------- misc ----------
let tt; function toast(m) { $('toast').textContent = m; clearTimeout(tt); tt = setTimeout(() => $('toast').textContent = '', 3000); }
const announce = toast;
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = ['sheet', 'profForm', 'profDelPanel', 'sharePanel', 'importPanel'].find(id => !$(id).hidden);
  if (open) { e.preventDefault(); closeAllPanels(); render(); $('addBtn').focus(); }
});

SL.store.onChange(async () => {
  if (dragId || !$('form').hidden || !$('profForm').hidden) return; // don't disturb an edit in progress
  const fresh = await SL.store.load();
  if (JSON.stringify(fresh) === JSON.stringify(SL.store.clean(data))) return;   // our own save echoing back
  data = fresh; render();
});

(async function init() {
  try { const tab = await api.tabs.getCurrent(); inTab = !!tab; } catch (e) { inTab = false; }
  if (inTab) document.body.classList.add('tab');
  if (CAN_FAVICON) { try { favOn = await api.permissions.contains({ permissions: ['favicon'] }); } catch (e) {} $('favBtn').hidden = false; favLabel(); }
  data = await SL.store.load();
  $('localWarn').hidden = (await SL.store.mode()) !== 'local';
  render();
  const h = location.hash.slice(1);
  const m = h.match(/^add-([\w-]+)$/);
  if (m && SL.PLATFORMS.some(p => p.id === m[1])) { openSheet(true); choose(m[1]); }
  else if (h === 'import') $('importBtn').click();
  else if (h === 'share') $('shareBtn').click();
  else if (h === 'export') $('exportBtn').click();
})();
}
