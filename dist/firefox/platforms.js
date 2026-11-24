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
  const site = SL.siteByHost(u.href);
  return { p: 'custom', v: c, url: c, label: site ? site.name : host };
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

// Well-known sites offered as suggestions for an "Other link". Saved as p:'custom', label = name.
// pattern: profile address with {user}; no pattern (Mastodon) = full URL only, any host.
// handle: usernames look like domains (ada.bsky.social), so only https://… or a value with / is a URL.
// ab/c: small letter badge (no brand logos).
SL.SITES = [
  { name: 'Kaggle', ab: 'K', c: '#1a7fa8', host: ['kaggle.com'], pattern: 'https://www.kaggle.com/{user}' },
  { name: 'Hugging Face', ab: 'HF', c: '#a15c00', host: ['huggingface.co'], pattern: 'https://huggingface.co/{user}' },
  { name: 'Devpost', ab: 'DP', c: '#003e54', host: ['devpost.com'], pattern: 'https://devpost.com/{user}' },
  { name: 'Behance', ab: 'Bē', c: '#0057ff', host: ['behance.net'], pattern: 'https://www.behance.net/{user}' },
  { name: 'Dribbble', ab: 'Dr', c: '#c32361', host: ['dribbble.com'], pattern: 'https://dribbble.com/{user}' },
  { name: 'GitLab', ab: 'GL', c: '#b8461b', host: ['gitlab.com'], pattern: 'https://gitlab.com/{user}' },
  { name: 'Bitbucket', ab: 'BB', c: '#0052cc', host: ['bitbucket.org'], pattern: 'https://bitbucket.org/{user}' },
  { name: 'Bluesky', ab: 'BS', c: '#0a62c9', host: ['bsky.app'], pattern: 'https://bsky.app/profile/{user}', handle: true },
  { name: 'Threads', ab: 'Th', c: '#111111', host: ['threads.net', 'threads.com'], pattern: 'https://www.threads.net/@{user}' },
  { name: 'Mastodon', ab: 'Ma', c: '#563acc', host: [] },
  { name: 'LeetCode', ab: 'LC', c: '#9a5b00', host: ['leetcode.com'], pattern: 'https://leetcode.com/u/{user}' },
  { name: 'HackerRank', ab: 'HR', c: '#13783a', host: ['hackerrank.com'], pattern: 'https://www.hackerrank.com/profile/{user}' },
  { name: 'Codeforces', ab: 'CF', c: '#1f5fa8', host: ['codeforces.com'], pattern: 'https://codeforces.com/profile/{user}' },
  { name: 'CodePen', ab: 'CP', c: '#1e1f26', host: ['codepen.io'], pattern: 'https://codepen.io/{user}' },
  { name: 'Substack', ab: 'S', c: '#c2410c', host: ['substack.com'], pattern: 'https://{user}.substack.com' },
  { name: 'Hashnode', ab: 'H', c: '#2453c4', host: ['hashnode.com', 'hashnode.dev'], pattern: 'https://hashnode.com/@{user}' },
  { name: 'Product Hunt', ab: 'P', c: '#c4401f', host: ['producthunt.com'], pattern: 'https://www.producthunt.com/@{user}' },
  { name: 'ORCID', ab: 'iD', c: '#5c7a12', host: ['orcid.org'], pattern: 'https://orcid.org/{user}' },
  { name: 'Google Scholar', ab: 'GS', c: '#3367d6', host: ['scholar.google.com'], pattern: 'https://scholar.google.com/citations?user={user}' },
  { name: 'ResearchGate', ab: 'RG', c: '#0b7a6c', host: ['researchgate.net'], pattern: 'https://www.researchgate.net/profile/{user}' },
  { name: 'Linktree', ab: 'LT', c: '#2b6e1f', host: ['linktr.ee'], pattern: 'https://linktr.ee/{user}' },
  { name: 'Calendly', ab: 'Ca', c: '#0060e6', host: ['calendly.com'], pattern: 'https://calendly.com/{user}' },
  { name: 'Telegram', ab: 'Tg', c: '#1c7bb5', host: ['t.me', 'telegram.me'], pattern: 'https://t.me/{user}' },
  { name: 'WhatsApp', ab: 'WA', c: '#127a3a', host: ['wa.me', 'whatsapp.com'], pattern: 'https://wa.me/{user}', digits: true },
  { name: 'Discord', ab: 'Di', c: '#4752c4', host: ['discord.gg', 'discord.com'], pattern: 'https://discord.gg/{user}' },
  { name: 'Twitch', ab: 'Tw', c: '#6e2fd6', host: ['twitch.tv'], pattern: 'https://www.twitch.tv/{user}' },
  { name: 'Reddit', ab: 'R', c: '#c73a00', host: ['reddit.com'], pattern: 'https://www.reddit.com/user/{user}' },
  { name: 'Pinterest', ab: 'Pi', c: '#b60020', host: ['pinterest.com', 'pinterest.co.uk'], pattern: 'https://www.pinterest.com/{user}' },
  { name: 'Spotify', ab: 'Sp', c: '#137a3a', host: ['spotify.com'], pattern: 'https://open.spotify.com/user/{user}' },
  { name: 'SoundCloud', ab: 'SC', c: '#c24400', host: ['soundcloud.com'], pattern: 'https://soundcloud.com/{user}' },
  { name: 'Patreon', ab: 'Pa', c: '#1f1f1f', host: ['patreon.com'], pattern: 'https://www.patreon.com/{user}' },
  { name: 'Ko-fi', ab: 'Ko', c: '#1e6fa8', host: ['ko-fi.com'], pattern: 'https://ko-fi.com/{user}' },
  { name: 'Buy Me a Coffee', ab: 'BM', c: '#6b5200', host: ['buymeacoffee.com'], pattern: 'https://buymeacoffee.com/{user}' },
  { name: 'Upwork', ab: 'Up', c: '#14772a', host: ['upwork.com'], pattern: 'https://www.upwork.com/freelancers/{user}' },
  { name: 'Fiverr', ab: 'Fi', c: '#137a46', host: ['fiverr.com'], pattern: 'https://www.fiverr.com/{user}' }
];
SL.siteByName = n => { n = String(n || '').trim().toLowerCase(); return n ? SL.SITES.find(s => s.name.toLowerCase() === n) || null : null; };
SL.siteByHost = function (url) {
  let h; try { h = SL.cleanHost(new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).hostname); } catch (e) { return null; }
  return SL.SITES.find(s => s.host.length && SL.onHost(h, s.host)) || null;
};
// The site a saved Other link belongs to: its label is a site name (or, for older links, the bare host).
SL.siteOf = function (l) {
  if (!l || l.p !== 'custom') return null;
  const byName = SL.siteByName(l.label);
  if (byName) return byName;
  try { if (l.label && l.label === SL.cleanHost(new URL(l.url).hostname)) return SL.siteByHost(l.url); } catch (e) {}
  return null;
};
// Shown before the username, e.g. "kaggle.com/" (Substack: "substack.com ← name").
SL.sitePrefix = s => (s && s.pattern && /\{user\}$/.test(s.pattern)) ? s.pattern.replace(/^https?:\/\/(www\.)?/, '').replace('{user}', '') : '';
SL.siteBuild = (s, user) => s.pattern.replace('{user}', user);
// Placeholder for the value field, e.g. "username" or "username.substack.com".
SL.sitePlaceholder = (s, word) => !s.pattern ? 'https://…' : SL.sitePrefix(s) ? word : s.pattern.replace(/^https?:\/\//, '').replace('{user}', word);
// Username in a URL that is exactly the site's profile address (trailing slash allowed), else null.
SL.siteUser = function (s, url) {
  if (!s || !s.pattern) return null;
  const key = x => x.replace(/^https?:\/\//i, '').replace(/^(www|m|mobile)\./i, '');
  const [pre, post] = key(s.pattern).split('{user}');
  const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = key(String(url || '')).match(new RegExp('^' + rx(pre) + '([^/?#&.]+|[^/?#&]+(?=/?$))' + rx(post) + '/?$', 'i'));
  if (!m) return null;
  let u = m[1]; try { u = decodeURIComponent(u); } catch (e) {}
  return SL.USER_RE.test(u) ? u : null;
};
// What the user typed for a well-known site → {v, url} or {e: messageKey, sub}.
SL.siteLooksUrl = (s, v) => { v = String(v || '').trim(); return /^https?:\/\//i.test(v) || (/^([\w-]+\.)+[a-z]{2,}(:\d+)?(\/|$|\?)/i.test(v) && !(s && s.handle && !/[/?]/.test(v))); };
SL.validateSite = function (s, raw) {
  let v = String(raw || '').trim();
  if (!v) return { e: 'errEmpty' };
  if (SL.siteLooksUrl(s, v)) {
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    let u; try { u = new URL(v); } catch (e) { return { e: 'errUrl' }; }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return { e: 'errUrl' };
    if (s.host.length && !SL.onHost(SL.cleanHost(u.hostname), s.host)) return { e: 'errWrongSite', sub: s.host[0] };
    const c = SL.cleanUrl(u);
    return { v: c, url: c };
  }
  if (!s.pattern) return { e: 'errNeedUrl' };
  v = s.digits ? v.replace(/[\s()+\-]/g, '') : v.replace(/^@/, '').replace(/\/+$/, '');
  if (!SL.USER_RE.test(v) || (s.digits && !/^\d{6,15}$/.test(v))) return { e: s.digits ? 'errPhone' : 'errUsername' };
  const url = SL.siteBuild(s, v);
  return { v: url, url };
};

// Main links go on the share card (QR + vCard). Default: LinkedIn, GitHub, Website, Email.
SL.MAIN_DEFAULT = ['linkedin', 'github', 'website', 'email'];
SL.isMain = l => !!l && (typeof l.main === 'boolean' ? l.main : SL.MAIN_DEFAULT.includes(l.p));
SL.mainLinks = links => (links || []).filter(SL.isMain);

// vCard 3.0 for the share card (the popup passes SL.mainLinks(links)).
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
