// Storage. Callers see one document {v, active, profiles:[{id, name, owner, links:[{id,p,v,url,label?,main?}]}]},
// but it is kept in browser sync storage as one small item per thing, so two computers editing at
// the same time only overwrite each other when they change the very same thing:
//   profiles      {order:[profileIds], updatedAt}                 order of the profiles
//   p_<profileId> {id, name, owner, updatedAt}                     a profile (or {id, deleted, updatedAt})
//   o_<profileId> {order:[linkIds], updatedAt}                     order of that profile's links
//   l_<linkId>    {id, pid, p, v, url, label?, main?, updatedAt}   a link (or {id, pid, deleted, updatedAt})
// save() writes only the items the caller changed (one storage.set per save). The same item changed on
// two computers: the later write wins. Deleted links/profiles leave a small tombstone for 30 days so a
// computer with an old copy can't bring them back. Name and link order are separate items, so a rename
// on one computer and a new link on another both survive; order items are rewritten only when things
// are reordered, and a link missing from its profile's order (added on another computer at the same
// time) is shown at the end, in creation order, rather than dropped. The untouched default profiles
// (work, personal) are not written until changed. The active profile is per computer (storage.local
// `sl_active`). The 2.x whole document under `data` (and 1.0 `links`) is converted on load.
// If everything doesn't fit the sync quotas it all moves to local storage (`sl_mode: 'local'`) and moves
// back automatically when it fits again.
var SL = globalThis.SL || (globalThis.SL = {});
(function () {
  const api = (typeof browser !== 'undefined' && browser.storage) ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  const LEGACY = 'data', MODE = 'sl_mode', ACTIVE = 'sl_active', ORDER = 'profiles';
  const TOMBSTONE_TTL = 30 * 24 * 3600 * 1000;
  // chrome.storage.sync: QUOTA_BYTES_PER_ITEM 8192, QUOTA_BYTES 102400, MAX_ITEMS 512 — keep some room.
  const QUOTA = { item: 8000, total: 100000, items: 500 };
  const isRec = k => k === ORDER || /^[plo]_/.test(k);

  const tr = (k, d) => { const v = SL.t ? SL.t(k) : ''; return v && v !== k ? v : d; };
  function fresh(links) {
    return { v: 2, active: 'work', profiles: [
      { id: 'work', name: tr('profileWork', 'Work'), owner: '', links: links || [] },
      { id: 'personal', name: tr('profilePersonal', 'Personal'), owner: '', links: [] }] };
  }

  // Clean anything that comes from storage or an imported file.
  function cleanLink(l) {
    if (!l || typeof l !== 'object') return null;
    const p = SL.PLATFORMS.some(x => x.id === l.p) ? l.p : 'custom';
    let out;
    if (p === 'email') {
      const v = String(l.v || l.url || '').replace(/^mailto:/i, '').trim();
      if (!SL.EMAIL_RE.test(v)) return null;
      out = { p, v, url: 'mailto:' + v };
    } else {
      let u; try { u = new URL(String(l.url || '')); } catch (e) { return null; }
      if (!/^https?:$/.test(u.protocol)) return null;           // never javascript:, data:, file: …
      out = { p, v: String(l.v || u.href).slice(0, 300), url: u.href };
    }
    if (p === 'custom') out.label = String(l.label || SL.cleanHost(new URL(out.url).hostname)).slice(0, 40);
    out.id = /^[\w-]{4,40}$/.test(l.id || '') ? l.id : SL.newId();
    if (typeof l.main === 'boolean') out.main = l.main;
    return out;
  }

  // A repeated id gets a predictable new one (same input → same output), because ids are storage keys.
  function uniq(id, seen) {
    if (!seen.has(id)) return id;
    for (let n = 2; ; n++) { const c = id.slice(0, 39 - String(n).length) + '-' + n; if (!seen.has(c)) return c; }
  }

  function clean(d) {
    if (!d || !Array.isArray(d.profiles) || !d.profiles.length) return null;
    const seen = new Set(), ids = new Set();                    // link ids are unique across all profiles
    const profiles = d.profiles.slice(0, 20).map(pr => {
      const id = uniq(/^[\w-]{1,40}$/.test(pr && pr.id || '') ? pr.id : SL.newId(), seen);
      seen.add(id);
      const links = [];
      for (const raw of (Array.isArray(pr && pr.links) ? pr.links : []).slice(0, 200)) {
        const l = cleanLink(raw); if (!l) continue;
        l.id = uniq(l.id, ids);
        ids.add(l.id); links.push(l);
      }
      return { id, name: String(pr && pr.name || 'Profile').slice(0, 30), owner: String(pr && pr.owner || '').slice(0, 60), links };
    });
    const active = profiles.some(p => p.id === d.active) ? d.active : profiles[0].id;
    return { v: 2, active, profiles };
  }

  // ---------- document <-> storage items ----------
  function linkRec(l, pid) {
    const r = { id: l.id, pid, p: l.p, v: l.v, url: l.url };
    if (l.label !== undefined) r.label = l.label;
    if (typeof l.main === 'boolean') r.main = l.main;
    return r;
  }
  function explode(d) {
    const out = { [ORDER]: { order: d.profiles.map(p => p.id) } };
    for (const pr of d.profiles) {
      out['p_' + pr.id] = { id: pr.id, name: pr.name, owner: pr.owner };
      out['o_' + pr.id] = { order: pr.links.map(l => l.id) };
      for (const l of pr.links) out['l_' + l.id] = linkRec(l, pr.id);
    }
    return out;
  }
  const alive = r => !!r && typeof r === 'object' && !r.deleted;
  // Comparable form of an item without its timestamp; null for a tombstone or nothing.
  function canon(k, r) {
    if (!alive(r)) return null;
    if (k === ORDER || k.startsWith('o_')) return JSON.stringify(Array.isArray(r.order) ? r.order : []);
    if (k.startsWith('p_')) return JSON.stringify({ id: r.id, name: r.name, owner: r.owner });
    return JSON.stringify(linkRec(r, r.pid));
  }
  // Items missing from an order item (added elsewhere, or not listed yet) come last: default profiles
  // first, then by id — new ids start with the time, so that is the order they were made in.
  const DEFAULTS = ['work', 'personal'];
  const tailKey = (k, id) => k === ORDER && DEFAULTS.includes(id) ? '\u0000' + DEFAULTS.indexOf(id) : id;
  const tail = (k, ids) => ids.slice().sort((a, b) => { const x = tailKey(k, a), y = tailKey(k, b); return x < y ? -1 : x > y ? 1 : 0; });
  function snapOf(d) { const e = explode(d), s = {}; for (const k in e) s[k] = canon(k, e[k]); return s; }

  function assemble(all, active) {
    const profs = new Map(), links = {};
    for (const k in all) {
      const r = all[k];
      if (!alive(r) || r.id !== k.slice(2)) continue;
      if (k.startsWith('p_')) profs.set(r.id, r);
      else if (k.startsWith('l_') && typeof r.pid === 'string') (links[r.pid] || (links[r.pid] = [])).push(r);
    }
    if (!Object.keys(all).some(isRec)) return null;                   // nothing saved in this format
    // The two default profiles are written only once changed, so they may be referenced without an item.
    const listed = alive(all[ORDER]) && Array.isArray(all[ORDER].order) ? all[ORDER].order : [];
    for (const dp of fresh().profiles)
      if (!profs.has(dp.id) && !all['p_' + dp.id] && (links[dp.id] || listed.includes(dp.id) || !all[ORDER])) profs.set(dp.id, dp);
    if (!profs.size) return null;
    const ordered = (k, order, items) => {
      const m = new Map(items.map(x => [x.id, x])), used = new Set(), out = [];
      for (const id of (Array.isArray(order) ? order : [])) if (m.has(id) && !used.has(id)) { used.add(id); out.push(m.get(id)); }
      return out.concat(tail(k, items.filter(x => !used.has(x.id)).map(x => x.id)).map(id => m.get(id)));
    };
    const ord = k => alive(all[k]) ? all[k].order : [];
    const profiles = ordered(ORDER, ord(ORDER), [...profs.values()]).map(p =>
      ({ id: p.id, name: p.name, owner: p.owner, links: ordered('o_', ord('o_' + p.id), links[p.id] || []) }));
    return clean({ v: 2, active, profiles });
  }

  // What this context last read or wrote, per document (and the latest overall). save() writes only what
  // the caller changed since then, so a stale copy can't undo changes made elsewhere in the meantime.
  const bases = new WeakMap();
  let lastBase = {};
  function remember(d, snap) { lastBase = snap; if (d && typeof d === 'object') bases.set(d, snap); }

  let queue = Promise.resolve();
  const run = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };

  const bytes = s => typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : new Blob([s]).size;
  // Which tombstones (oldest first) must go so that `o` fits in sync; null if it can't fit at all.
  // A dropped tombstone means the key is simply removed — it only guards against very stale computers.
  function squeeze(o) {
    let total = 0, n = 0;
    const size = {};
    for (const k in o) { const b = size[k] = bytes(k + JSON.stringify(o[k])); if (b > QUOTA.item) return null; total += b; n++; }
    const out = [];
    if (n <= QUOTA.items && total <= QUOTA.total) return out;
    const ts = Object.keys(o).filter(k => isRec(k) && o[k] && o[k].deleted).sort((a, b) => (o[a].updatedAt || 0) - (o[b].updatedAt || 0));
    for (const k of ts) {
      out.push(k); total -= size[k]; n--;
      if (n <= QUOTA.items && total <= QUOTA.total) return out;
    }
    return null;
  }
  async function readAll(area) { try { return (await api.storage[area].get(null)) || {}; } catch (e) { return {}; } }
  // this computer's settings: where the data is kept, and which profile is active
  async function here() {
    try { const r = await api.storage.local.get([MODE, ACTIVE]); return { m: r[MODE] === 'local' ? 'local' : 'sync', active: r[ACTIVE] }; }
    catch (e) { return { m: 'local' }; }
  }

  async function mode() { return (await here()).m; }

  async function loadNow() {
    const { m, active } = await here();
    const all = await readAll(m);
    let d = assemble(all, active);
    if (all[LEGACY] !== undefined) {
      const old = clean(all[LEGACY]);
      if (!d) {
        if (old) { d = old; await saveNow(d, { base: {}, drop: [[m, LEGACY]] }); return d; }   // 2.0/2.1 → per-item keys
      } else {
        // Items exist already, so a computer still on 2.x wrote a whole document: take only links and
        // profiles nobody here has seen (never undo edits or deletions made in the new format).
        const before = snapOf(d);
        for (const op of (old ? old.profiles : [])) {
          if (all['p_' + op.id] && !alive(all['p_' + op.id])) continue;              // deleted here
          let tp = d.profiles.find(p => p.id === op.id);
          if (!tp) { if (d.profiles.length >= 20) continue; tp = { id: op.id, name: op.name, owner: op.owner, links: [] }; d.profiles.push(tp); }
          for (const l of op.links) if (!all['l_' + l.id] && tp.links.length < 200) tp.links.push(l);
        }
        d = clean(d);
        await saveNow(d, { base: before, drop: [[m, LEGACY]] });
        return d;
      }
    }
    if (!d) {
      // Nothing saved yet. On a new computer the browser may still be downloading synced data,
      // so don't write empty defaults here — they could replace the user's links everywhere.
      // Defaults stay in memory until the user changes something. Only a 1.0 upgrade is saved.
      let old = [];
      try { const r = await api.storage.sync.get('links'); old = Array.isArray(r.links) ? r.links : []; } catch (e) {}
      d = clean(fresh(old)) || fresh();
      if (old.length) await saveNow(d, { base: {}, drop: [['sync', 'links']] });
      else remember(d, {});                 // nothing is stored: a later save writes everything
      return d;
    }
    remember(d, snapOf(d));
    return d;
  }

  // Returns 'sync' or 'local' (where it ended up).
  async function saveNow(d, opts) {
    opts = opts || {};
    const doc = clean(d);
    if (!doc) return mode();
    const now = Date.now();
    const base = opts.base || bases.get(d) || lastBase;
    const next = explode(doc), snap = snapOf(doc);
    const { m, active } = await here();
    const cur = await readAll(m);
    const writes = {}, removes = new Set();
    const tomb = (id, pid) => pid === undefined ? { id, deleted: true, updatedAt: now } : { id, pid, deleted: true, updatedAt: now };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

    // changed or new items
    for (const k in next) {
      const mine = snap[k];
      const st = cur[k], stc = canon(k, st);
      // An untouched default profile is never written (load() supplies it): on a computer that hasn't
      // seen the synced data yet it must not replace the real one, renamed or with an owner, still on its way.
      const def = !st && k.startsWith('p_') && fresh().profiles.find(p => 'p_' + p.id === k);
      if (def && mine === canon(k, def)) continue;
      if (base[k] === mine && st !== undefined) continue;              // not changed by us (rewritten if it went missing)
      if (k === ORDER || k.startsWith('o_')) {
        const pre = k === ORDER ? 'p_' : 'l_';
        const bo = base[k] ? JSON.parse(base[k]) : null, so = stc ? JSON.parse(stc) : [], mo = next[k].order;
        const inMine = new Set(mo), inBase = new Set(bo || []);
        const reordered = !!bo && !same(mo.filter(x => inBase.has(x)), bo.filter(x => inMine.has(x)));
        let order;
        if (!reordered) {
          // Only added or removed: leave the order item alone when load() already puts the new ones at
          // the end (it appends unlisted items sorted by id, and new ids sort by time), so a reorder made
          // elsewhere at the same time isn't overwritten. Otherwise keep the stored order and append ours.
          const ss = new Set(so), add = mo.filter(x => !ss.has(x));
          if (same(add, tail(k, add))) continue;
          order = so.filter(x => inMine.has(x) || (!inBase.has(x) && alive(cur[pre + x]))).concat(add);
        } else {
          order = mo.concat(so.filter(x => !inBase.has(x) && !inMine.has(x) && alive(cur[pre + x])));   // keep others' additions
        }
        if (stc !== JSON.stringify(order)) writes[k] = { order, updatedAt: now };
        continue;
      }
      if (stc === mine) continue;                                       // already stored
      if (k.startsWith('p_') && base[k] === undefined && stc) continue;  // made elsewhere first (e.g. on another computer)
      if (st && st.updatedAt > now) continue;                           // a newer edit from elsewhere
      writes[k] = Object.assign({}, next[k], { updatedAt: now });
    }
    // removed by us → tombstones
    for (const k in base) {
      if (k in next || base[k] === null) continue;
      const st = cur[k];
      if (k.startsWith('l_')) {
        if (!st || alive(st)) writes[k] = tomb(k.slice(2), JSON.parse(base[k]).pid);
      } else if (k.startsWith('p_')) {
        const pid = k.slice(2);
        if (!st || alive(st)) writes[k] = tomb(pid);
        for (const kk in cur) if (kk.startsWith('l_') && alive(cur[kk]) && cur[kk].pid === pid && !(kk in next)) writes[kk] = tomb(kk.slice(2), pid);
      }
    }
    // tombstones older than 30 days go (a deleted profile takes its order and any leftover links with it)
    for (const k in cur) {
      const r = cur[k];
      if (!isRec(k) || !r || typeof r !== 'object' || !r.deleted || k in writes || now - (r.updatedAt || 0) <= TOMBSTONE_TTL) continue;
      removes.add(k);
      if (k.startsWith('p_')) {
        if (!(('o_' + r.id) in next)) removes.add('o_' + r.id);
        for (const kk in cur) if (kk.startsWith('l_') && cur[kk] && cur[kk].pid === r.id && !(kk in next)) removes.add(kk);
      }
    }
    for (const k of removes) delete writes[k];
    const drops = { sync: [], local: [] };
    for (const [a, k] of (opts.drop || [])) drops[a].push(k);
    const act = doc.active !== active ? { [ACTIVE]: doc.active } : {};
    const done = where => { remember(d, snap); return where; };
    const has = o => Object.keys(o).length > 0;
    const fitsNow = o => { const r = squeeze(o); return !!r && !r.length; };
    const S = api.storage;
    const state = Object.assign({}, cur, writes);
    for (const k of removes) delete state[k];
    const recState = {};
    for (const k in state) if (isRec(k)) recState[k] = state[k];

    // Write `items` to sync and remove `gone` (tombstones / expired items — safe to remove first when
    // the quota needs room, since the browser checks it at set time) and then `after` (old-format keys,
    // only once the new items are safely stored). Normally one set and at most one remove.
    async function toSync(have, items, gone, after) {
      const first = gone.length && !fitsNow(Object.assign({}, have, items));
      if (first) await S.sync.remove(gone);
      if (has(items)) await S.sync.set(items);
      const rest = (first ? [] : gone).concat(after);
      if (rest.length) await S.sync.remove(rest);
    }

    if (m === 'sync') {
      for (const k of drops.sync) delete state[k];
      const drop = squeeze(state);
      if (drop) {
        for (const k of drop) { delete writes[k]; delete recState[k]; if (k in cur) removes.add(k); }
        try {
          await toSync(cur, writes, [...removes], drops.sync);
          if (has(act)) await S.local.set(act);
          if (drops.local.length) await S.local.remove(drops.local);
          return done('sync');
        } catch (e) { /* quota or sync disabled → local */ }
      }
      await S.local.set(Object.assign(recState, { [MODE]: 'local' }, act));
      if (drops.local.length) await S.local.remove(drops.local);
      if (drops.sync.length) { try { await S.sync.remove(drops.sync); } catch (e) {} }
      return done('local');
    }

    // local mode: move back to sync when it all fits there again
    const sc = await readAll('sync');
    const up = {};                                                      // ours, unless sync has a newer copy
    for (const k in recState) if (!sc[k] || !(sc[k].updatedAt > recState[k].updatedAt) || k in writes) up[k] = recState[k];
    const merged = Object.assign({}, sc, up);
    const after = drops.sync.concat(LEGACY in sc && !drops.sync.includes(LEGACY) ? [LEGACY] : []);
    for (const k of after) delete merged[k];
    const drop = squeeze(merged);
    if (drop) {
      const gone = [];
      for (const k of drop) { delete up[k]; if (k in sc) gone.push(k); }
      try {
        await toSync(sc, up, gone, after);
        await S.local.set(Object.assign({ [MODE]: 'sync' }, act));
        await S.local.remove(Object.keys(cur).filter(isRec).concat(drops.local));
        return done('sync');
      } catch (e) { /* stay local */ }
    }
    if (has(writes) || has(act)) await S.local.set(Object.assign({}, writes, act));
    const lr = [...removes].concat(drops.local);
    if (lr.length) await S.local.remove(lr);
    if (drops.sync.length) { try { await S.sync.remove(drops.sync); } catch (e) {} }
    return done('local');
  }

  const load = () => run(loadNow);
  const save = d => run(() => saveNow(d));

  function onChange(cb) {
    api.storage.onChanged.addListener((ch, area) => {
      if (Object.keys(ch).some(k => isRec(k) || k === LEGACY || k === MODE || k === ACTIVE)) cb(area);
    });
  }

  // Backup files (whole-document format)
  function exportJson(d) {
    return JSON.stringify({ app: 'social-links', v: 2, exported: new Date().toISOString(), active: d.active, profiles: d.profiles }, null, 2);
  }
  function parseBackup(text) {
    let j; try { j = JSON.parse(text); } catch (e) { return { e: 'errBackupJson' }; }
    if (Array.isArray(j)) j = { profiles: [{ name: 'Imported', links: j }] };          // a bare list of links
    if (j && Array.isArray(j.links) && !j.profiles) j = { profiles: [{ name: 'Imported', links: j.links }] }; // v1 shape
    const d = clean(j);
    if (!d) return { e: 'errBackupShape' };
    return { d };
  }
  // Merge: profiles matched by name; links added unless already there (same URL); a named
  // platform that already exists in that profile keeps its current link.
  function merge(cur, inc) {
    const out = JSON.parse(JSON.stringify(cur));
    if (bases.has(cur)) bases.set(out, bases.get(cur));
    const stats = { added: 0, skipped: 0, profiles: 0 };
    for (const ip of inc.profiles) {
      let tp = out.profiles.find(p => p.name.toLowerCase() === ip.name.toLowerCase());
      if (!tp) { tp = { id: SL.newId(), name: ip.name, owner: ip.owner, links: [] }; out.profiles.push(tp); stats.profiles++; }
      if (!tp.owner && ip.owner) tp.owner = ip.owner;
      for (const l of ip.links) {
        const dupUrl = tp.links.some(x => SL.sameUrl(x.url, l.url));
        const dupPlat = !SL.platform(l.p).many && tp.links.some(x => x.p === l.p);
        if (dupUrl || dupPlat) { stats.skipped++; continue; }
        tp.links.push(Object.assign({}, l, { id: SL.newId() })); stats.added++;
      }
    }
    out.profiles = out.profiles.slice(0, 20);
    return { d: out, stats };
  }

  SL.store = { load, save, mode, onChange, clean, exportJson, parseBackup, merge, fresh };
})();
if (typeof module !== 'undefined') module.exports = SL;
