// Two computers sharing chrome.storage.sync with delayed propagation.
// Each "device" runs its own copy of the store (separate JS context) against its own replica of sync
// storage plus its own local storage. Writes land on the device's replica straight away and reach the
// other device only when the test calls propagate(), like the real sync service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = ['platforms.js', 'i18n.js', 'store.js'].map(f => [f, readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')]);
const j = x => JSON.parse(JSON.stringify(x));
const LIMITS = { item: 8192, total: 102400, items: 512 };
const size = (k, v) => new TextEncoder().encode(k + JSON.stringify(v)).length;

let clock = 1_800_000_000_000;
const tick = (ms = 1000) => (clock += ms);

function world() {
  const server = {}, devices = [];
  let seq = 0;
  function device(name) {
    const dev = { name, sync: {}, local: {}, outbox: [], listeners: [], calls: { set: 0, remove: 0, localSet: 0 } };
    const fire = (changes, area) => { if (Object.keys(changes).length) for (const f of dev.listeners) f(j(changes), area); };
    const pick = (o, k) => k == null ? j(o) : Object.fromEntries([].concat(k).filter(x => x in o).map(x => [x, j(o[x])]));
    const apply = (o, items, area) => {
      const ch = {};
      for (const k in items) { ch[k] = { oldValue: o[k], newValue: items[k] }; o[k] = j(items[k]); }
      fire(ch, area);
    };
    const drop = (o, keys, area) => {
      const ch = {};
      for (const k of [].concat(keys)) if (k in o) { ch[k] = { oldValue: o[k] }; delete o[k]; }
      fire(ch, area);
    };
    const sync = {
      get: async k => pick(dev.sync, k),
      set: async items => {
        dev.calls.set++;
        const next = Object.assign({}, dev.sync, j(items));
        let total = 0;
        for (const k in next) { const s = size(k, next[k]); if (s > LIMITS.item) throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded'); total += s; }
        if (total > LIMITS.total) throw new Error('QUOTA_BYTES quota exceeded');
        if (Object.keys(next).length > LIMITS.items) throw new Error('MAX_ITEMS quota exceeded');
        apply(dev.sync, items, 'sync');
        dev.outbox.push({ seq: seq++, set: j(items) });
      },
      remove: async keys => { dev.calls.remove++; drop(dev.sync, keys, 'sync'); dev.outbox.push({ seq: seq++, remove: [].concat(keys) }); }
    };
    const local = {
      get: async k => pick(dev.local, k),
      set: async items => { dev.calls.localSet++; apply(dev.local, items, 'local'); },
      remove: async keys => drop(dev.local, keys, 'local')
    };
    const chrome = { storage: { sync, local, onChanged: { addListener: f => dev.listeners.push(f) } }, i18n: { getMessage: () => '' } };
    const ctx = vm.createContext({ chrome, console, URL, Blob, TextEncoder, setTimeout, clockNow: () => clock });
    ctx.globalThis = ctx;
    vm.runInContext('Date.now = () => clockNow();', ctx);
    for (const [f, s] of SRC) vm.runInContext(s, ctx, { filename: f });
    dev.store = ctx.SL.store;
    dev.load = async () => j(await dev.store.load());
    dev.save = d => dev.store.save(d);
    // edit helper: load fresh, change, save (what the popup and the menu do)
    dev.edit = async fn => { const d = await dev.store.load(); fn(d); return dev.store.save(d); };
    dev.resetCalls = () => { dev.calls = { set: 0, remove: 0, localSet: 0 }; };
    devices.push(dev);
    return dev;
  }
  // Deliver queued writes (all devices, or only `only`) to the server in the order they were made,
  // then bring every replica up to date with the server.
  function propagate(only) {
    const ops = [];
    for (const d of devices) if (!only || only.includes(d)) { ops.push(...d.outbox); d.outbox = []; }
    ops.sort((a, b) => a.seq - b.seq);
    for (const op of ops) {
      if (op.set) Object.assign(server, j(op.set));
      if (op.remove) for (const k of op.remove) delete server[k];
    }
    for (const d of devices) {
      const ch = {};
      for (const k in server) if (JSON.stringify(d.sync[k]) !== JSON.stringify(server[k])) ch[k] = { oldValue: d.sync[k], newValue: j(server[k]) };
      for (const k in d.sync) if (!(k in server)) ch[k] = { oldValue: d.sync[k] };
      // a device's own writes not yet delivered stay on its replica
      const pending = new Set(d.outbox.flatMap(o => o.set ? Object.keys(o.set) : o.remove));
      for (const k in ch) {
        if (pending.has(k)) { delete ch[k]; continue; }
        if ('newValue' in ch[k]) d.sync[k] = ch[k].newValue; else delete d.sync[k];
      }
      if (Object.keys(ch).length) for (const f of d.listeners) f(j(ch), 'sync');
    }
  }
  return { server, device, propagate };
}

const link = (id, p, user, extra) => Object.assign(
  p === 'email' ? { id, p, v: user, url: 'mailto:' + user } : { id, p, v: user, url: p === 'github' ? 'https://github.com/' + user : p === 'x' ? 'https://x.com/' + user : 'https://' + user + '.example.com/' },
  p === 'custom' ? { label: user } : {}, extra || {});
const seed = () => ({ v: 2, active: 'work', profiles: [
  { id: 'work', name: 'Work', owner: 'Ada', links: [link('gh01', 'github', 'ada'), link('xx01', 'x', 'ada'), link('em01', 'email', 'ada@example.com')] },
  { id: 'personal', name: 'Personal', owner: '', links: [link('cu01', 'custom', 'blog')] }] });

// two devices that both start from the same synced data
async function pair() {
  const w = world(), A = w.device('A'), B = w.device('B');
  await A.save(seed()); w.propagate();
  await A.load(); await B.load();
  return { w, A, B };
}
const urls = (d, pid = 'work') => d.profiles.find(p => p.id === pid).links.map(l => l.url);
const work = d => d.profiles.find(p => p.id === 'work');

test('concurrent adds on two computers both survive', async () => {
  const { w, A, B } = await pair();
  tick(); await A.edit(d => work(d).links.push(link('ln01', 'linkedin', 'x', { url: 'https://www.linkedin.com/in/ada' })));
  tick(); await B.edit(d => work(d).links.push(link('cu02', 'custom', 'portfolio')));
  w.propagate();
  for (const dev of [A, B]) {
    const u = urls(await dev.load());
    assert.ok(u.includes('https://www.linkedin.com/in/ada'), dev.name + ' has A\'s link');
    assert.ok(u.includes('https://portfolio.example.com/'), dev.name + ' has B\'s link');
    assert.equal(u.length, 5);
  }
  assert.deepEqual(await A.load(), await B.load(), 'both computers show the same thing');
});

test('concurrent edits to different links both survive', async () => {
  const { w, A, B } = await pair();
  tick(); await A.edit(d => { Object.assign(work(d).links[0], { v: 'ada2', url: 'https://github.com/ada2' }); });
  tick(); await B.edit(d => { Object.assign(work(d).links[1], { v: 'ada3', url: 'https://x.com/ada3' }); });
  w.propagate();
  for (const dev of [A, B]) {
    const u = urls(await dev.load());
    assert.deepEqual(u, ['https://github.com/ada2', 'https://x.com/ada3', 'mailto:ada@example.com'], dev.name);
  }
});

test('the same link edited on both computers: the newer edit wins', async () => {
  const { w, A, B } = await pair();
  tick(); await A.edit(d => { Object.assign(work(d).links[0], { v: 'older', url: 'https://github.com/older' }); });
  tick(); await B.edit(d => { Object.assign(work(d).links[0], { v: 'newer', url: 'https://github.com/newer' }); });
  w.propagate();
  for (const dev of [A, B]) assert.equal(urls(await dev.load())[0], 'https://github.com/newer', dev.name);
  // and a later edit on the computer that lost wins again
  tick(); await A.edit(d => { Object.assign(work(d).links[0], { v: 'latest', url: 'https://github.com/latest' }); });
  w.propagate();
  for (const dev of [A, B]) assert.equal(urls(await dev.load())[0], 'https://github.com/latest', dev.name);
});

test('delete on one computer + edit of another link on the other', async () => {
  const { w, A, B } = await pair();
  tick(); await A.edit(d => { work(d).links = work(d).links.filter(l => l.id !== 'xx01'); });
  tick(); await B.edit(d => { Object.assign(work(d).links.find(l => l.id === 'gh01'), { v: 'edited', url: 'https://github.com/edited' }); });
  w.propagate();
  for (const dev of [A, B]) assert.deepEqual(urls(await dev.load()), ['https://github.com/edited', 'mailto:ada@example.com'], dev.name);
});

test('a deleted link is not brought back by a computer holding an old copy', async () => {
  const { w, A, B } = await pair();
  const stale = await B.store.load();               // e.g. the menu's cached copy on B
  tick(); await A.edit(d => { work(d).links = work(d).links.filter(l => l.id !== 'xx01'); });
  // B saves an unrelated change from its stale copy, before the delete has reached it…
  tick(); stale.profiles[1].links.push(link('cu03', 'custom', 'shop')); await B.save(stale);
  w.propagate();
  for (const dev of [A, B]) {
    const d = await dev.load();
    assert.ok(!urls(d).includes('https://x.com/ada'), dev.name + ': still deleted');
    assert.ok(urls(d, 'personal').includes('https://shop.example.com/'), dev.name + ': B\'s change kept');
  }
  // …and again after the delete has reached it
  tick(); stale.profiles[0].owner = 'Ada L'; await B.save(stale);
  w.propagate();
  for (const dev of [A, B]) {
    const d = await dev.load();
    assert.ok(!urls(d).includes('https://x.com/ada'), dev.name + ': still deleted');
    assert.equal(work(d).owner, 'Ada L');
  }
  assert.equal(w.server.l_xx01.deleted, true, 'tombstone kept');
});

test('a deleted profile stays deleted and takes its links with it', async () => {
  const { w, A, B } = await pair();
  const stale = await B.store.load();
  tick(); await A.edit(d => { d.profiles = d.profiles.filter(p => p.id !== 'personal'); d.active = 'work'; });
  tick(); work(stale).links.push(link('cu04', 'custom', 'notes')); await B.save(stale);
  w.propagate();
  for (const dev of [A, B]) {
    const d = await dev.load();
    assert.deepEqual(d.profiles.map(p => p.id), ['work'], dev.name);
    assert.ok(urls(d).includes('https://notes.example.com/'), dev.name);
  }
  assert.equal(w.server.p_personal.deleted, true);
  assert.equal(w.server.l_cu01.deleted, true, 'links of a deleted profile become tombstones');
});

test('profile rename on one computer vs link add on the other', async () => {
  const { w, A, B } = await pair();
  tick(); await A.edit(d => { work(d).name = 'Job'; });
  tick(); await B.edit(d => { work(d).links.push(link('cu05', 'custom', 'cv')); });
  w.propagate();
  for (const dev of [A, B]) {
    const d = await dev.load();
    assert.equal(work(d).name, 'Job', dev.name + ': rename kept');
    assert.ok(urls(d).includes('https://cv.example.com/'), dev.name + ': new link kept');
  }
});

test('concurrent new profiles on two computers both survive', async () => {
  const { w, A, B } = await pair();
  tick(); await A.edit(d => { d.profiles.push({ id: 'hack', name: 'Hackathons', owner: '', links: [link('gh02', 'github', 'h')] }); });
  tick(); await B.edit(d => { d.profiles.push({ id: 'club', name: 'Club', owner: '', links: [] }); });
  w.propagate();
  for (const dev of [A, B]) assert.deepEqual((await dev.load()).profiles.map(p => p.id), ['work', 'personal', 'club', 'hack'], dev.name);
});

test('reordering on one computer while adding on the other keeps both', async () => {
  const { w, A, B } = await pair();
  tick(); await A.edit(d => { work(d).links.reverse(); });
  tick(); await B.edit(d => { work(d).links.push(link('cu06', 'custom', 'talks')); });
  w.propagate();
  for (const dev of [A, B]) {
    const ids = work(await dev.load()).links.map(l => l.id);
    assert.equal(ids.length, 4, dev.name);
    assert.ok(ids.includes('cu06') && ids.indexOf('em01') < ids.indexOf('gh01'), dev.name + ': ' + ids);
  }
});

test('the active profile is chosen per computer', async () => {
  const { w, A, B } = await pair();
  tick(); await A.edit(d => { d.active = 'personal'; });
  w.propagate();
  assert.equal((await A.load()).active, 'personal');
  assert.equal((await B.load()).active, 'work');
  assert.equal(A.local.sl_active, 'personal');
  assert.ok(!Object.values(w.server).some(v => v && v.active), 'nothing about the active profile in sync');
  // switching profile writes nothing to sync
  A.resetCalls(); A.outbox.length = 0;
  tick(); await A.edit(d => { d.active = 'work'; });
  assert.equal(A.calls.set, 0); assert.equal(A.calls.remove, 0);
  // the active profile deleted elsewhere → falls back to the first one
  tick(); await A.edit(d => { d.active = 'personal'; });
  tick(); await B.edit(d => { d.profiles = d.profiles.filter(p => p.id !== 'personal'); });
  w.propagate();
  assert.equal((await A.load()).active, 'work');
});

test('first run on a new computer writes nothing, then keeps the synced data once it arrives', async () => {
  const w = world(), A = w.device('A');
  await A.save(seed()); w.propagate();
  const B = w.device('B');                       // new computer: sync data not downloaded yet
  const d = await B.load();
  assert.deepEqual(d.profiles.map(p => p.name), ['Work', 'Personal']);
  assert.deepEqual(B.calls, { set: 0, remove: 0, localSet: 0 }, 'nothing written');
  assert.deepEqual(B.sync, {}); assert.deepEqual(B.local, {});
  // the user adds a link before the download finishes; then it arrives
  tick(); work(d).links.push(link('ln02', 'linkedin', 'b', { url: 'https://www.linkedin.com/in/bee' }));
  await B.save(d);
  w.propagate();
  for (const dev of [A, B]) {
    const r = await dev.load();
    assert.deepEqual(urls(r), ['https://github.com/ada', 'https://x.com/ada', 'mailto:ada@example.com', 'https://www.linkedin.com/in/bee'], dev.name);
    assert.equal(work(r).owner, 'Ada', dev.name + ': synced profile details kept, not replaced by defaults');
    assert.equal(urls(r, 'personal')[0], 'https://blog.example.com/', dev.name);
  }
});

test('migration from the 2.x whole-document format', async () => {
  const w = world(), A = w.device('A');
  A.sync.data = seed(); A.sync.data.active = 'personal';
  const d = await A.load();
  assert.deepEqual(d, j(Object.assign(seed(), { active: 'personal' })), 'same document after migration');
  assert.equal(A.sync.data, undefined, 'old key removed');
  assert.equal(A.sync.l_gh01.url, 'https://github.com/ada');
  assert.deepEqual(A.sync.o_work.order, ['gh01', 'xx01', 'em01']);
  assert.equal(A.local.sl_active, 'personal', 'active profile kept, on this computer');
  assert.equal(A.calls.set, 1, 'one write'); assert.equal(A.calls.remove, 1, 'one remove');
  // a second load changes nothing
  A.resetCalls(); assert.deepEqual(await A.load(), d); assert.deepEqual(A.calls, { set: 0, remove: 0, localSet: 0 });
});

test('migration from 2.x local mode', async () => {
  const w = world(), A = w.device('A');
  A.local.data = seed(); A.local.sl_mode = 'local';
  A.sync.data = { v: 2, active: 'work', profiles: [{ id: 'work', name: 'Old', owner: '', links: [] }] };   // the stale copy 2.x left behind
  const d = await A.load();
  assert.deepEqual(urls(d), ['https://github.com/ada', 'https://x.com/ada', 'mailto:ada@example.com']);
  assert.equal(A.local.data, undefined);
  assert.equal(await A.store.mode(), 'sync', 'it fits in sync now, so it moved back');
  assert.equal(A.sync.data, undefined, 'stale copy removed');
  assert.equal(work(await A.load()).name, 'Work');
});

test('migration from 1.0 links', async () => {
  const w = world(), A = w.device('A');
  A.sync.links = [{ p: 'github', v: 'mk', url: 'https://github.com/mk' }];
  const d = await A.load();
  assert.equal(urls(d)[0], 'https://github.com/mk');
  assert.equal(A.sync.links, undefined);
  assert.ok(Object.keys(A.sync).some(k => k.startsWith('l_')));
  assert.equal(A.calls.set, 1);
});

test('a computer still on 2.x writing the old format: its new links are picked up, nothing else undone', async () => {
  const { w, A, B } = await pair();
  tick(); await A.edit(d => { work(d).links = work(d).links.filter(l => l.id !== 'xx01'); work(d).name = 'Job'; });
  w.propagate();
  // an old version on a third computer writes its whole (stale) document with one new link
  const old = seed(); old.profiles[0].links.push(link('cu07', 'custom', 'oldnew'));
  B.sync.data = old;
  const d = await B.load();
  assert.equal(work(d).name, 'Job', 'rename not undone');
  assert.ok(!urls(d).includes('https://x.com/ada'), 'delete not undone');
  assert.ok(urls(d).includes('https://oldnew.example.com/'), 'new link picked up');
  assert.equal(B.sync.data, undefined);
});

test('falls back to local storage when it outgrows sync, and moves back', async () => {
  const { w, A, B } = await pair();
  const big = await A.store.load();
  big.profiles.push({ id: 'more', name: 'More', owner: '', links: [] });     // 3 x 200 links > 512 items
  for (const [n, pr] of big.profiles.entries())
    for (let i = 0; i < 200; i++) pr.links.push(link('big' + n + '-' + i, 'custom', 'site' + i + 'x' + n));
  tick(); assert.equal(await A.save(big), 'local');
  assert.equal(await A.store.mode(), 'local');
  assert.equal(A.local.sl_mode, 'local');
  assert.equal(work(await A.load()).links.length, 200);
  assert.equal(urls(await B.load()).length, 3, 'other computers keep the last synced data');
  for (const pr of big.profiles) pr.links = pr.links.filter(l => !l.id.startsWith('big'));
  work(big).links.push(link('cu08', 'custom', 'back'));
  tick(); assert.equal(await A.save(big), 'sync');
  assert.equal(await A.store.mode(), 'sync');
  assert.ok(!Object.keys(A.local).some(k => /^[plo]_|^profiles$/.test(k)), 'local copy cleared');
  w.propagate();
  assert.ok(urls(await B.load()).includes('https://back.example.com/'));
  assert.equal(urls(await B.load()).length, 4);
  // a single link too big for one sync item
  const huge = await A.store.load();
  work(huge).links.push(link('cu09', 'custom', 'long', { url: 'https://long.example.com/' + 'a'.repeat(9000) }));
  tick(); assert.equal(await A.save(huge), 'local');
});

test('each save is one sync write (and at most one remove)', async () => {
  const { w, A } = await pair();
  const d = await A.store.load();
  A.resetCalls();
  tick();
  work(d).links.push(link('cu10', 'custom', 'one'), link('cu11', 'custom', 'two'));
  work(d).links.splice(0, 1);                  // delete
  work(d).links[0].v = 'edit';                 // edit
  work(d).name = 'Job';                        // rename
  d.profiles.push({ id: 'new1', name: 'New', owner: '', links: [link('gh03', 'github', 'n')] });
  d.profiles = d.profiles.filter(p => p.id !== 'personal');
  d.active = 'new1';
  await A.save(d);
  assert.equal(A.calls.set, 1, 'one sync set');
  assert.ok(A.calls.remove <= 1, 'at most one sync remove');
  const keys = Object.keys(A.outbox.find(o => o.set).set).sort();
  // (order items aren't rewritten for plain additions/removals: load() appends new links in creation order)
  assert.deepEqual(keys, ['l_cu01', 'l_cu10', 'l_cu11', 'l_gh01', 'l_gh03', 'l_xx01', 'p_new1', 'p_personal', 'p_work'], 'only what changed');
  assert.deepEqual(await A.load(), j(A.store.clean(d)), 'reads back the same');
  A.resetCalls();
  await A.save(d);
  assert.deepEqual(A.calls, { set: 0, remove: 0, localSet: 0 }, 'saving without changes writes nothing');
});

test('tombstones are purged after 30 days', async () => {
  const { w, A } = await pair();
  tick(); await A.edit(d => { work(d).links = work(d).links.filter(l => l.id !== 'xx01'); });
  assert.equal(A.sync.l_xx01.deleted, true);
  tick(10 * 864e5); await A.edit(d => { work(d).owner = 'x'; });
  assert.equal(A.sync.l_xx01.deleted, true, 'kept for now');
  tick(21 * 864e5); A.resetCalls(); await A.edit(d => { work(d).owner = 'y'; });
  assert.equal(A.sync.l_xx01, undefined, 'purged');
  assert.equal(A.calls.set, 1); assert.equal(A.calls.remove, 1);
  w.propagate();
});

test('many deletions never push the data out of sync: oldest tombstones go first', async () => {
  const w = world(), A = w.device('A');
  const d = seed();
  for (let i = 0; i < 190; i++) d.profiles[1].links.push(link('m' + i, 'custom', 'm' + i));
  await A.save(d);
  for (let round = 0; round < 3; round++) {
    const cur = await A.store.load();
    cur.profiles[1].links = cur.profiles[1].links.slice(0, 1);
    for (let i = 0; i < 190; i++) cur.profiles[1].links.push(link('r' + round + '-' + i, 'custom', 'r' + round + 'x' + i));
    tick(); assert.equal(await A.save(cur), 'sync', 'round ' + round);
  }
  assert.ok(Object.keys(A.sync).length <= 512);
  assert.equal((await A.load()).profiles[1].links.length, 191);
});

test('the ★ main flag is kept, true or false', async () => {
  const { w, A, B } = await pair();
  tick(); await A.edit(d => { work(d).links[0].main = true; work(d).links[1].main = false; work(d).links[2].main = 'yes'; });
  w.propagate();
  const d = await B.load();
  assert.equal(work(d).links[0].main, true);
  assert.equal(work(d).links[1].main, false);
  assert.equal('main' in work(d).links[2], false, 'non-boolean dropped');
  assert.equal(w.server.l_gh01.main, true);
  const c = A.store.clean({ profiles: [{ name: 'W', links: [link('aa11', 'github', 'z', { main: false })] }] });
  assert.equal(c.profiles[0].links[0].main, false);
});

test('changes from the other computer are announced through onChange', async () => {
  const { w, A, B } = await pair();
  const seen = [];
  B.store.onChange(area => seen.push(area));
  tick(); await A.edit(d => { work(d).links.push(link('cu12', 'custom', 'ping')); });
  w.propagate();
  assert.ok(seen.includes('sync'));
  seen.length = 0;
  await B.edit(d => { d.active = 'personal'; });
  assert.ok(seen.includes('local'), 'active profile change announced');
});

test('two contexts on the same computer (popup and menu) editing at once both keep their changes', async () => {
  const w = world(), A = w.device('A');
  await A.save(seed());
  const popup = await A.store.load(), menu = await A.store.load();
  work(popup).links.push(link('cu13', 'custom', 'frompopup'));
  work(menu).links.push(link('cu14', 'custom', 'frommenu'));
  tick(); await Promise.all([A.save(popup), A.save(menu)]);
  const u = urls(await A.load());
  assert.ok(u.includes('https://frompopup.example.com/') && u.includes('https://frommenu.example.com/'));
});
