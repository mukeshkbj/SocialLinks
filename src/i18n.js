// Translation helper: every user-facing string lives in _locales/<lang>/messages.json.
var SL = globalThis.SL || (globalThis.SL = {});
(function () {
  const api = (typeof browser !== 'undefined' && browser.i18n) ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  SL.t = function (key, subs) {
    let s = '';
    try { s = api.i18n.getMessage(key, subs == null ? undefined : [].concat(subs).map(String)); } catch (e) {}
    return s || key;
  };
  // Fill [data-i18n], [data-i18n-label] (aria-label), [data-i18n-title], [data-i18n-ph] in a page.
  SL.localise = function (root) {
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = SL.t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = SL.t(el.dataset.i18nHtml); }); // our own strings only
    root.querySelectorAll('[data-i18n-label]').forEach(el => el.setAttribute('aria-label', SL.t(el.dataset.i18nLabel)));
    root.querySelectorAll('[data-i18n-title]').forEach(el => el.setAttribute('title', SL.t(el.dataset.i18nTitle)));
    root.querySelectorAll('[data-i18n-ph]').forEach(el => el.setAttribute('placeholder', SL.t(el.dataset.i18nPh)));
  };
})();
