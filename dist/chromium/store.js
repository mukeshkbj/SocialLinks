// Storage: one JSON document {v, active, profiles:[{id, name, owner, links:[{id,p,v,url,label?}]}]}.
// Kept in browser sync storage; if it outgrows the sync per-item quota it moves to local storage
// (and moves back automatically when it fits again).
var SL = globalThis.SL || (globalThis.SL = {});
(function () {
  const api = (typeof browser !== 'undefined' && browser.storage) ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  const KEY = 'data', MODE = 'sl_mode';
  const SYNC_LIMIT = 7800; // chrome.storage.sync QUOTA_BYTES_PER_ITEM is 8192 incl. key

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
    return out;
  }

  function clean(d) {
    if (!d || !Array.isArray(d.profiles) || !d.profiles.length) return null;
    const seen = new Set();
    const profiles = d.profiles.slice(0, 20).map(pr => {
      let id = /^[\w-]{1,40}$/.test(pr && pr.id || '') ? pr.id : SL.newId();
      while (seen.has(id)) id = SL.newId();
      seen.add(id);
      const ids = new Set(), links = [];
      for (const raw of (Array.isArray(pr.links) ? pr.links : []).slice(0, 200)) {
        const l = cleanLink(raw); if (!l) continue;
        while (ids.has(l.id)) l.id = SL.newId();
        ids.add(l.id); links.push(l);
      }
      return { id, name: String(pr.name || 'Profile').slice(0, 30), owner: String(pr.owner || '').slice(0, 60), links };
    });
    const active = profiles.some(p => p.id === d.active) ? d.active : profiles[0].id;
    return { v: 2, active, profiles };
  }

  async function mode() {
    try { const r = await api.storage.local.get(MODE); return r[MODE] === 'local' ? 'local' : 'sync'; } catch (e) { return 'local'; }
  }

  async function load() {
    const m = await mode();
    let d = null;
    try { d = (await api.storage[m].get(KEY))[KEY]; } catch (e) {}
    d = clean(d);
    if (!d) {
      // Nothing saved yet. On a new computer the browser may still be downloading synced data,
      // so don't write empty defaults here — they could replace the user's links everywhere.
      // Defaults stay in memory until the user changes something. Only a 1.0 upgrade is saved.
      let old = [];
      try { const r = await api.storage.sync.get('links'); old = Array.isArray(r.links) ? r.links : []; } catch (e) {}
      d = clean(fresh(old)) || fresh();
      if (old.length) {
        await save(d);
        try { await api.storage.sync.remove('links'); } catch (e) {}
      }
    }
    return d;
  }

  // Returns 'sync' or 'local' (where it ended up).
  async function save(d) {
    const size = new Blob([KEY + JSON.stringify(d)]).size;
    if (size <= SYNC_LIMIT) {
      try {
        await api.storage.sync.set({ [KEY]: d });
        if ((await mode()) === 'local') { await api.storage.local.set({ [MODE]: 'sync' }); await api.storage.local.remove(KEY); }
        return 'sync';
      } catch (e) { /* quota or sync disabled → fall through */ }
    }
    await api.storage.local.set({ [KEY]: d, [MODE]: 'local' });
    return 'local';
  }

  function onChange(cb) {
    api.storage.onChanged.addListener((ch, area) => {
      if (ch[KEY] || ch[MODE]) cb(area);
    });
  }

  // Backup files
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
