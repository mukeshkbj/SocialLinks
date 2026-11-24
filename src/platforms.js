// Platform definitions, URL parsing and validation. Shared by background, popup and tests.
// Plain script (no modules) so it loads as a service-worker importScripts, a Firefox
// background script, a <script> tag, and in Node tests.
var SL = globalThis.SL || (globalThis.SL = {});

SL.PLATFORMS = [
  { id: 'linkedin', name: 'LinkedIn', ab: 'in', c: '#0a66c2', host: ['linkedin.com'], pre: 'linkedin.com/in/', build: u => 'https://www.linkedin.com/in/' + u, user: /^\/in\/([^/?#]+)/ },
  { id: 'github', name: 'GitHub', ab: 'GH', c: '#24292f', host: ['github.com'], pre: 'github.com/', build: u => 'https://github.com/' + u, user: /^\/([^/?#]+)/, reserved: ['features', 'pricing', 'login', 'about', 'orgs', 'settings', 'marketplace', 'explore', 'topics', 'collections', 'sponsors', 'notifications'] },
  { id: 'x', name: 'X (Twitter)', ab: 'X', c: '#111111', host: ['x.com', 'twitter.com'], pre: 'x.com/', build: u => 'https://x.com/' + u, user: /^\/([^/?#]+)/, reserved: ['home', 'explore', 'search', 'i', 'settings', 'notifications', 'messages', 'intent', 'share'] },
  { id: 'instagram', name: 'Instagram', ab: 'IG', c: '#c13584', host: ['instagram.com'], pre: 'instagram.com/', build: u => 'https://www.instagram.com/' + u, user: /^\/([^/?#]+)/, reserved: ['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'direct'] },
  { id: 'youtube', name: 'YouTube', ab: 'YT', c: '#cc0000', host: ['youtube.com', 'youtu.be'], pre: 'youtube.com/@', build: u => 'https://www.youtube.com/@' + u, user: /^\/@([^/?#]+)/,
    alt: (u) => { const m = u.pathname.match(/^\/(channel|c|user)\/[^/?#]+/); return m && u.origin + m[0]; } },
  { id: 'facebook', name: 'Facebook', ab: 'f', c: '#1877f2', host: ['facebook.com', 'fb.com'], pre: 'facebook.com/', build: u => 'https://www.facebook.com/' + u, user: /^\/([^/?#]+)/, reserved: ['groups', 'events', 'watch', 'marketplace', 'pages', 'photo.php', 'profile.php', 'share', 'login'] },
  { id: 'tiktok', name: 'TikTok', ab: 'TT', c: '#010101', host: ['tiktok.com'], pre: 'tiktok.com/@', build: u => 'https://www.tiktok.com/@' + u, user: /^\/@([^/?#]+)/ },
  { id: 'medium', name: 'Medium', ab: 'M', c: '#292929', host: ['medium.com'], pre: 'medium.com/@', build: u => 'https://medium.com/@' + u, user: /^\/@([^/?#]+)/,
    alt: (u, host) => host !== 'medium.com' && host.endsWith('.medium.com') && u.origin + '/' },
  { id: 'devto', name: 'DEV', ab: 'DEV', c: '#3b49df', host: ['dev.to'], pre: 'dev.to/', build: u => 'https://dev.to/' + u, user: /^\/([^/?#]+)/, reserved: ['t', 'search', 'enter', 'settings', 'top', 'latest'] },
  { id: 'stackoverflow', name: 'Stack Overflow', ab: 'SO', c: '#c75d0e', host: ['stackoverflow.com'], url: true },
  { id: 'website', name: 'Website', ab: 'www', c: '#00685a', url: true },
  { id: 'email', name: 'Email', ab: '@', c: '#6b5b3e', email: true },
  { id: 'custom', name: 'Other link', ab: '+', c: '#55606b', url: true, custom: true, many: true }
];

SL.EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/;
SL.USER_RE = /^[\p{L}\p{N}\p{M}_.\-]{1,100}$/u;   // usernames in any script, e.g. josé-garcía

// Remove tracking parameters (utm_*, fbclid, gclid …) but keep meaningful ones.
SL.TRACKING = /^(utm_.*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igsh|igshid|si|ref|ref_src|ref_url|trk|trkinfo|_hsenc|_hsmi|mkt_tok|yclid|twclid)$/i;
SL.cleanUrl = function (u) {
  const out = new URL(u.href);
  for (const k of [...out.searchParams.keys()]) if (SL.TRACKING.test(k)) out.searchParams.delete(k);
  return out.href.replace(/\?$/, '');
};
// Same address written differently: http/https, www., letter case of the host, trailing slash.
SL.urlKey = function (s) {
  s = String(s || '');
  if (/^mailto:/i.test(s)) return s.toLowerCase();
  try {
    const u = new URL(s);
    return SL.cleanHost(u.hostname) + (u.port ? ':' + u.port : '') + decodeURIComponent(u.pathname).replace(/\/+$/, '') + u.search;
  } catch (e) { return s; }
};
SL.sameUrl = (a, b) => SL.urlKey(a) === SL.urlKey(b);
SL.platform = id => SL.PLATFORMS.find(p => p.id === id) || SL.PLATFORMS.find(p => p.id === 'custom');
SL.newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
SL.cleanHost = h => h.toLowerCase().replace(/^(www|m|mobile)\./, '');
SL.onHost = (host, list) => list.some(h => host === h || host.endsWith('.' + h));

SL.linkName = l => (l.p === 'custom' && l.label) ? l.label : SL.platform(l.p).name;
SL.linkValue = l => l.p === 'email' ? l.v : l.url;          // what gets copied
SL.openUrl = l => l.p === 'email' ? null : l.url;            // email is copy-only
SL.display = l => l.p === 'email' ? l.v : l.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

// Any URL / domain / email (e.g. from a right-click) → {p, v, url, label?} or null.
SL.fromAnything = function (raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (/^mailto:/i.test(s)) s = decodeURIComponent(s.slice(7).split('?')[0]);
  if (SL.EMAIL_RE.test(s)) return { p: 'email', v: s, url: 'mailto:' + s };
  if (!/^https?:\/\//i.test(s)) {
    if (!/^([\w-]+\.)+[a-z]{2,}(:\d+)?(\/|$|\?|#)/i.test(s)) return null;
    s = 'https://' + s;
  }
  let u; try { u = new URL(s); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return null;
  const host = SL.cleanHost(u.hostname);
  for (const p of SL.PLATFORMS) {
    if (!p.host || !SL.onHost(host, p.host)) continue;
    const m = p.user && u.pathname.match(p.user);
    if (m) {
      let name = m[1]; try { name = decodeURIComponent(name); } catch (e) {}
      if (!(p.reserved || []).includes(name.toLowerCase()) && SL.USER_RE.test(name)) return { p: p.id, v: name, url: p.build(name) };
    }
    const alt = p.alt && p.alt(u, host);
    if (alt) return { p: p.id, v: alt, url: alt };
    if (p.url) { const c = SL.cleanUrl(u); return { p: p.id, v: c, url: c }; }
    break; // a known platform's non-profile page → save as an Other link
  }
  const c = SL.cleanUrl(u);
  return { p: 'custom', v: c, url: c, label: host };
};

// What the user typed in the popup for platform p → {v, url} or {e: messageKey}.
SL.validate = function (p, raw) {
  let v = String(raw || '').trim();
  if (!v) return { e: 'errEmpty' };
  if (p.email) {
    v = v.replace(/^mailto:/i, '');
    return SL.EMAIL_RE.test(v) ? { v, url: 'mailto:' + v } : { e: 'errEmail' };
  }
  const looksUrl = /^https?:\/\//i.test(v) || /^([\w-]+\.)+[a-z]{2,}(\/|$)/i.test(v);
  if (looksUrl && (p.url || /[./]/.test(v))) {
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    let u; try { u = new URL(v); } catch (e) { return { e: 'errUrl' }; }
    if (!u.hostname.includes('.')) return { e: 'errUrl' };
    const host = SL.cleanHost(u.hostname);
    if (p.host && !SL.onHost(host, p.host)) return { e: 'errWrongSite', sub: p.host[0] };
    if (p.user) {
      const auto = SL.fromAnything(u.href);
      if (auto && auto.p === p.id) return { v: auto.v, url: auto.url };
      return { e: 'errNotProfile', sub: p.name };
    }
    const c = SL.cleanUrl(u);
    return { v: c, url: c };
  }
  if (p.url) return { e: 'errNeedUrl' };
  v = v.replace(/^@/, '').replace(/\/+$/, '');
  if (!SL.USER_RE.test(v)) return { e: 'errUsername' };
  return { v, url: p.build(v) };
};

// vCard 3.0 for the share card.
SL.vcard = function (name, links) {
  const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  const n = (name || 'Social links').trim();
  const parts = n.split(/\s+/);
  lines.push('N:' + esc(parts.length > 1 ? parts.slice(-1)[0] : n) + ';' + esc(parts.length > 1 ? parts.slice(0, -1).join(' ') : '') + ';;;');
  lines.push('FN:' + esc(n));
  for (const l of links) {
    if (l.p === 'email') lines.push('EMAIL;TYPE=INTERNET:' + esc(l.v));
    else {
      const type = SL.linkName(l).replace(/[^\w]/g, '');
      lines.push('URL;TYPE=' + (type || 'WEB') + ':' + l.url);
      if (l.p !== 'custom' && l.p !== 'website') lines.push('X-SOCIALPROFILE;TYPE=' + l.p + ':' + l.url);
    }
  }
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
};

if (typeof module !== 'undefined') module.exports = SL;
