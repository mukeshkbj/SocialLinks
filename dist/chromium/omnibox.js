// Social Links — address-bar shortcut. Type "sl", a space, then:
//   <name>          open the best-matching link (email links are copied instead)
//   copy <name>     copy it (also "c <name>")
//   manage          open the Social Links manager
// Loaded before background.js (importScripts in Chrome, background.scripts in Firefox).
// Pure helpers live on SL.omni so they can be unit-tested; browser events use SL.bg,
// which background.js fills in.
var SL = globalThis.SL || (globalThis.SL = {});
(function () {
  const api = (typeof browser !== 'undefined' && browser.runtime) ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  // Chrome renders XML markup in descriptions; Firefox shows descriptions as plain text.
  const RICH = !(api && api.runtime && typeof api.runtime.getBrowserInfo === 'function');
  const MAX = 6;
  const MARK = '\u0001';

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const strip = s => String(s).replace(/<\/?(match|url|dim)>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

  // "copy git" → {cmd:'copy', q:'git'}; "manage" → {cmd:'manage'}; anything else opens.
  function parse(text) {
    const raw = String(text || '').replace(/^\s+/, '');
    let m;
    if (/^manage\s*$/i.test(raw)) return { cmd: 'manage', q: '' };
    if ((m = raw.match(/^(?:copy(?:\s+|$)|c\s+)([\s\S]*)$/i))) return { cmd: 'copy', q: m[1].trim() };
    return { cmd: 'open', q: raw.trim() };
  }
  const tokens = q => String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  // Other links match on their own name and address only: the generic platform name "Other link"
  // would otherwise make every one of them match words like "lin" or "link".
  const fields = l => [SL.linkName(l), SL.platform(l.p).many ? '' : SL.platform(l.p).name, SL.display(l)];

  // exact > prefix > start of a word > anywhere
  function fieldScore(f, tok) {
    f = f.toLowerCase();
    if (f === tok) return 100;
    if (f.startsWith(tok)) return 80;
    const i = f.indexOf(tok);
    if (i < 0) return 0;
    return /[^\p{L}\p{N}]/u.test(f[i - 1]) ? 60 : 40;
  }
  // 0 = no match. Every word typed must match the name, platform or address.
  function score(l, q) {
    const toks = tokens(q);
    if (!toks.length) return 1;
    let total = 0;
    for (const tok of toks) {
      let best = 0;
      fields(l).forEach((f, i) => { const s = fieldScore(f, tok); if (s) best = Math.max(best, s - i * 5); });
      if (!best) return 0;
      total += best;
    }
    return total;
  }
  // Best matches first; ties keep the user's own order.
  function rank(links, q) {
    return links.map((l, i) => ({ l, i, s: score(l, q) })).filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.l);
  }

  // Wrap the typed words in <match> (Chrome only); everything else escaped.
  function hl(s, toks, rich) {
    if (!rich) return s;
    const low = s.toLowerCase(), on = new Array(s.length).fill(false);
    for (const tok of toks) { const i = low.indexOf(tok); if (i >= 0) for (let k = i; k < i + tok.length; k++) on[k] = true; }
    let out = '', open = false;
    for (let k = 0; k < s.length; k++) {
      if (on[k] !== open) { out += on[k] ? '<match>' : '</match>'; open = on[k]; }
      out += esc(s[k]);
    }
    return out + (open ? '</match>' : '');
  }
  // A translated string with one piece of markup put in for $1.
  function msg(key, body, rich) {
    let tpl = SL.t(key, MARK);
    if (!tpl.includes(MARK)) tpl += ' ' + MARK;
    return rich ? esc(tpl).split(MARK).join(body) : tpl.split(MARK).join(body);
  }
  const plainMsg = (key, subs, rich) => rich ? esc(SL.t(key, subs)) : SL.t(key, subs);

  const willCopy = (l, cmd) => cmd === 'copy' || !SL.openUrl(l);
  function describe(l, cmd, q, rich) {
    const toks = tokens(q);
    const body = rich
      ? hl(SL.linkName(l), toks, true) + '<dim> — </dim><url>' + hl(SL.display(l), toks, true) + '</url>'
      : SL.linkName(l) + ' — ' + SL.display(l);
    return msg(willCopy(l, cmd) ? 'omniCopy' : 'omniOpen', body, rich);
  }
  const content = (l, cmd) => (cmd === 'copy' ? 'copy ' : '') + SL.display(l);
  const activeProfile = d => d.profiles.find(p => p.id === d.active) || d.profiles[0];

  // → { default: description for Enter on the typed text, suggestions: [{content, description}], matches: [link] }
  function suggestFor(data, text, rich) {
    const prof = activeProfile(data), p = parse(text);
    const manage = { content: 'manage', description: msg('omniManage', rich ? '<match>manage</match>' : 'manage', rich) };
    if (p.cmd === 'manage') return { default: manage.description, suggestions: [], matches: [] };
    if (!prof.links.length) return { default: plainMsg('omniNoLinks', prof.name, rich), suggestions: [manage], matches: [] };
    const matches = rank(prof.links, p.q).slice(0, MAX);
    const suggestions = matches.map(l => ({ content: content(l, p.cmd), description: describe(l, p.cmd, p.q, rich) }));
    const wantsManage = p.cmd === 'open' && p.q.length >= 2 && 'manage'.startsWith(p.q.toLowerCase());
    if (wantsManage) { if (suggestions.length >= MAX) suggestions.pop(); suggestions.push(manage); }
    if (!p.q) return { default: plainMsg('omniUsage', null, rich), suggestions, matches };
    if (!matches.length) return { default: plainMsg('omniNoMatch', p.q, rich), suggestions, matches };
    return { default: suggestions[0].description, suggestions, matches, topIsDefault: true };
  }

  // What Enter does with `text` → {act:'open'|'copy'|'manage'|'none', link?}
  function resolve(data, text) {
    const prof = activeProfile(data), p = parse(text);
    if (p.cmd === 'manage') return { act: 'manage' };
    if (!p.q || !prof.links.length) return { act: 'manage' };                 // Enter on a bare "sl": open the manager
    const q = p.q.toLowerCase();
    // a chosen suggestion comes back as its exact address
    const l = prof.links.find(x => SL.display(x).toLowerCase() === q || String(SL.linkValue(x)).toLowerCase() === q) || rank(prof.links, p.q)[0];
    if (!l) return { act: 'none' };
    return { act: willCopy(l, p.cmd) ? 'copy' : 'open', link: l };
  }

  // ---------------- browser wiring ----------------
  function openIn(url, disposition) {
    if (disposition === 'currentTab') return api.tabs.update({ url });
    return api.tabs.create({ url, active: disposition !== 'newBackgroundTab' });
  }
  async function enter(text, disposition) {
    const bg = SL.bg, r = resolve(await bg.getData(), text);
    if (r.act === 'manage') { const url = api.runtime.getURL('popup.html'); await openIn(url, disposition); return { act: 'manage', url }; }
    if (r.act === 'none') { bg.badge(null, '?', bg.MUTED); return { act: 'none' }; }
    if (r.act === 'copy') {
      const value = SL.linkValue(r.link), ok = await bg.copyText(value);
      bg.badge(null, ok ? '⧉' : '!', ok ? bg.OK : bg.BAD);
      return { act: 'copy', text: value, ok };
    }
    const url = SL.openUrl(r.link);
    await openIn(url, disposition);
    return { act: 'open', url, disposition: disposition || 'currentTab' };
  }
  async function suggest(text) { return suggestFor(await SL.bg.getData(), text, RICH); }

  if (api && api.omnibox) {
    const setDefault = description => { try { api.omnibox.setDefaultSuggestion({ description }); } catch (e) {} };
    const usage = () => plainMsg('omniUsage', null, RICH);
    setDefault(usage());
    let seq = 0;
    if (api.omnibox.onInputStarted) api.omnibox.onInputStarted.addListener(() => setDefault(usage()));
    api.omnibox.onInputChanged.addListener((text, cb) => {
      const n = ++seq;
      suggest(text).then(r => { if (n !== seq) return; setDefault(r.default); cb(r.topIsDefault ? r.suggestions.slice(1) : r.suggestions); }).catch(() => {});   // the best match is already the default row; don't list it twice
    });
    api.omnibox.onInputEntered.addListener((text, disposition) => { enter(text, disposition).catch(() => {}); });
  }

  SL.omni = {
    parse, rank, score, describe, suggestFor, resolve, esc, strip, RICH, MAX,
    hooks: { omniSuggest: suggest, omniEnter: enter }
  };
})();
if (typeof module !== 'undefined') module.exports = SL;
