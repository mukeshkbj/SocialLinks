#!/usr/bin/env python3
"""Real-Firefox test: installs the Firefox build as a temporary add-on in headless Firefox (Selenium +
geckodriver) and drives the real popup page and the real background page.

Native context menus can't be clicked by automation, so (as in tests/e2e.cjs) menu items are fired
through the background's own onClick handler, reached with browser.runtime.getBackgroundPage(), and the
built menu is read back from the background's mirror of it.

A real right-click grants activeTab; automation can't make one, so this installs a TEST-ONLY copy of
dist/firefox that may reach http://127.0.0.1 (for Paste) and may read the clipboard (to check Copy).
The shipped manifest is checked separately and has neither.

Run: node build.mjs && pip install selenium && python3 tests/firefox-real.py
Env: FIREFOX_BIN (optional), FF_SHOTS (screenshot folder, default $RUNNER_TEMP/ff-shots or /tmp/ff-shots)
"""
import http.server
import json
import os
import shutil
import sys
import tempfile
import threading
import time

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.support.ui import Select, WebDriverWait

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'dist', 'firefox')
ADDON_ID = 'social-links@mukeshkbj'
UUID = '6f1c3b9e-2d4a-4c8e-9a51-5b7d0e3f1a22'
BASE = f'moz-extension://{UUID}/'
SHOTS = os.environ.get('FF_SHOTS') or os.path.join(os.environ.get('RUNNER_TEMP', '/tmp'), 'ff-shots')
os.makedirs(SHOTS, exist_ok=True)

results = []


def ok(cond, name, detail=''):
    results.append(bool(cond))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''), flush=True)
    return bool(cond)


DEMO = {'v': 2, 'active': 'work', 'profiles': [
    {'id': 'work', 'name': 'Work', 'owner': 'Alex Morgan', 'links': [
        {'id': 'li01', 'p': 'linkedin', 'v': 'alex-morgan-dev', 'url': 'https://www.linkedin.com/in/alex-morgan-dev'},
        {'id': 'gh01', 'p': 'github', 'v': 'alex-morgan-dev', 'url': 'https://github.com/alex-morgan-dev'},
        {'id': 'em01', 'p': 'email', 'v': 'alex@example.com', 'url': 'mailto:alex@example.com'}]},
    {'id': 'personal', 'name': 'Personal', 'owner': '', 'links': [
        {'id': 'ig01', 'p': 'instagram', 'v': 'alexmorgan', 'url': 'https://www.instagram.com/alexmorgan'}]}]}

PAGE = b'''<!doctype html><meta charset="utf-8"><title>form</title>
<input id="plain" type="text"><input id="email" type="email"><textarea id="ta">Hello  world</textarea>
<input id="ro" type="text" readonly>'''


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('content-type', 'text/html')
        self.end_headers()
        self.wfile.write(PAGE)

    def log_message(self, *a):
        pass


def make_test_copy():
    d = tempfile.mkdtemp(prefix='sl-ff-ext-')
    ext = os.path.join(d, 'ext')
    shutil.copytree(SRC, ext)
    mpath = os.path.join(ext, 'manifest.json')
    m = json.load(open(mpath))
    m['host_permissions'] = ['http://127.0.0.1/*']          # test-only: stands in for activeTab
    m['permissions'] = m['permissions'] + ['clipboardRead']   # test-only: lets the test check Copy
    json.dump(m, open(mpath, 'w'))
    return ext


def main():
    shipped = json.load(open(os.path.join(SRC, 'manifest.json')))
    ok(shipped['permissions'] == ['menus', 'storage', 'clipboardWrite', 'activeTab', 'scripting']
       and 'host_permissions' not in shipped, 'shipped Firefox manifest: only menus, storage, clipboardWrite, activeTab, scripting; no host permissions')

    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    URL = f'http://127.0.0.1:{srv.server_address[1]}/'

    opts = Options()
    opts.add_argument('-headless')
    if os.environ.get('FIREFOX_BIN'):
        opts.binary_location = os.environ['FIREFOX_BIN']
    opts.set_preference('extensions.webextensions.uuids', json.dumps({ADDON_ID: UUID}))
    driver = webdriver.Firefox(options=opts)
    driver.set_window_size(1000, 1000)
    driver.set_script_timeout(30)
    caps = driver.capabilities
    print(f"Firefox {caps.get('browserVersion')} / geckodriver {caps.get('moz:geckodriverVersion')}", flush=True)

    def js(code, *args):
        """Run async JS in the current page; returns its value or raises with the JS error."""
        r = driver.execute_async_script(
            'const __done = arguments[arguments.length - 1];'
            '(async () => {' + code + '})().then(v => __done({ v: v === undefined ? null : JSON.parse(JSON.stringify(v)) }),'
            ' e => __done({ e: String(e && (e.message || e)) + "\\n" + String(e && e.stack || "") }));', *args)
        if r and 'e' in r:
            raise RuntimeError(r['e'])
        return r['v'] if r else None

    def shot(name):
        try:
            driver.save_screenshot(os.path.join(SHOTS, name))
        except Exception as e:
            print('screenshot failed', name, e)

    def wait(fn, timeout=5):
        try:
            WebDriverWait(driver, timeout, 0.1).until(lambda d: fn())
            return True
        except Exception:
            return False

    def items():
        return len(driver.find_elements(By.CSS_SELECTOR, '#links .item'))

    try:
        addon = driver.install_addon(make_test_copy(), temporary=True)
        ok(addon == ADDON_ID, 'installs as a temporary add-on with gecko id ' + ADDON_ID, addon)

        # ---------------- popup page ----------------
        driver.get(BASE + 'popup.html')
        ok(wait(lambda: driver.execute_script('return !!(window.SL && SL.store)')), 'popup.html loads from moz-extension:// with SL.store')
        info = js('return { m: browser.runtime.getManifest().manifest_version, ua: navigator.userAgent, menus: !!browser.menus }')
        ok(info['m'] == 3 and 'Firefox' in info['ua'], 'running a Manifest V3 extension in real Firefox', info['ua'])

        js('await SL.store.save(arguments[0]);', DEMO)
        driver.refresh()
        ok(wait(lambda: items() == 3), 'popup renders the 3 seeded Work links', str(items()))
        text = driver.find_element(By.ID, 'links').text
        ok('alex-morgan-dev' in text and 'alex@example.com' in text, 'link list shows usernames / email', text[:200])
        shot('ff-01-popup.png')

        driver.find_element(By.ID, 'addBtn').click()
        ok(wait(lambda: driver.find_element(By.ID, 'grid').is_displayed()), 'Add opens the platform grid')
        ed = lambda p: driver.find_element(By.CSS_SELECTOR, f'[data-p={p}] .ed').text
        ok(ed('linkedin') == '✎' and ed('email') == '✎' and ed('x') == '+' and ed('custom') == '+',
           'tiles show ✎ for saved (LinkedIn, Email), + for not saved (X) and + for Other',
           f"{ed('linkedin')} {ed('email')} {ed('x')} {ed('custom')}")
        shot('ff-02-grid.png')
        driver.find_element(By.CSS_SELECTOR, '[data-p=custom]').click()
        ok(wait(lambda: driver.find_element(By.ID, 'nameRow').is_displayed()), 'Other link asks for a name')
        driver.find_element(By.ID, 'nm').send_keys('Portfolio')
        driver.find_element(By.ID, 'val').send_keys('https://alexmorgan.example.org/?utm_source=x')
        driver.find_element(By.ID, 'save').click()
        ok(wait(lambda: items() == 4), 'Other link added in the popup', str(items()))
        d = js('return await SL.store.load()')
        w = next(p for p in d['profiles'] if p['id'] == 'work')['links']
        port = [l for l in w if l.get('label') == 'Portfolio']
        ok(port and port[0]['p'] == 'custom' and port[0]['url'] == 'https://alexmorgan.example.org/',
           'Other link saved through SL.store with tracking parameter stripped', json.dumps(port))

        # wrong-site validation
        driver.find_element(By.ID, 'addBtn').click()
        driver.find_element(By.CSS_SELECTOR, '[data-p=x]').click()
        driver.find_element(By.ID, 'val').send_keys('https://github.com/x')
        driver.find_element(By.ID, 'save').click()
        ok(wait(lambda: 'x.com' in driver.find_element(By.ID, 'err').text or 'twitter' in driver.find_element(By.ID, 'err').text.lower()),
           'wrong-site URL rejected with a message', driver.find_element(By.ID, 'err').text)
        driver.find_element(By.ID, 'cancel').click()

        # profile switching
        Select(driver.find_element(By.ID, 'profSel')).select_by_value('personal')
        ok(wait(lambda: items() == 1 and 'alexmorgan' in driver.find_element(By.ID, 'links').text), 'switching to Personal shows its link', str(items()))
        ok(js('return (await SL.store.load()).active') == 'personal', 'profile switch saved (active = personal)')
        Select(driver.find_element(By.ID, 'profSel')).select_by_value('work')
        ok(wait(lambda: items() == 4), 'switching back to Work', str(items()))

        # share card
        driver.find_element(By.ID, 'shareBtn').click()
        owner = driver.find_element(By.ID, 'owner')
        owner.clear()
        owner.send_keys('Alex Morgan')
        time.sleep(0.3)
        ink = driver.execute_script('const c = document.getElementById("qr"), g = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;'
                                    'let k = 0; for (let i = 0; i < g.length; i += 4) if (g[i] < 50) k++; return { k, w: c.width };')
        ok(ink['w'] > 100 and ink['k'] > 1000, 'share card QR canvas drawn', json.dumps(ink))
        shot('ff-03-share.png')
        driver.find_element(By.ID, 'shareClose').click()

        # ---------------- background page ----------------
        has_bg = js('return typeof browser.runtime.getBackgroundPage === "function"')
        ok(has_bg, 'browser.runtime.getBackgroundPage is available (MV3 event page)')
        BG = 'const bg = await browser.runtime.getBackgroundPage(); if (!bg || !bg.__sl) throw new Error("no __sl on background page");'
        bginfo = js(BG + 'return { menus: !!bg.browser.menus, offscreen: !!bg.browser.offscreen, sw: typeof bg.importScripts }')
        ok(bginfo['menus'] and not bginfo['offscreen'], 'background page is real: browser.menus present, no offscreen API', json.dumps(bginfo))

        menu = lambda: js(BG + 'await bg.__sl.rebuild(); return (await bg.__sl.menu()).map(x => ({ id: x.id, parentId: x.parentId, title: x.title, type: x.type, checked: x.checked, contexts: x.contexts }))')
        m = menu()
        ok(m[0]['id'] == 'root' and m[0]['title'] == 'Social links', 'menu: top-level "Social links"', m[0].get('title'))
        kids = [x for x in m if x.get('parentId') == 'l:li01']
        ok([k['id'] for k in kids] == ['v:li01', 'o:li01', 'c:li01'] and kids[0]['contexts'] == ['editable'],
           'menu: each link has Paste (text boxes only), Open, Copy', json.dumps(kids))
        ok(any(x['id'] == 'c:em01' for x in m) and not any(x['id'] == 'o:em01' for x in m), 'menu: email can be copied, not opened')
        ok(any(x['id'] == 'new:github' and x['title'].startswith('✎') for x in m)
           and any(x['id'] == 'new:x' and x['title'].startswith('+ Add') for x in m), 'menu: ✎ Edit GitHub, + Add X')
        ok(len([x for x in m if x.get('parentId') == 'prof' and x.get('type') == 'radio']) == 2, 'menu: 2 profile radio items')
        json.dump(m, open(os.path.join(SHOTS, 'ff-menu.json'), 'w'), ensure_ascii=False, indent=1)

        # add from right-click
        js(BG + 'await bg.__sl.onClick({ menuItemId: "save-link", linkUrl: "https://github.com/someone" }, { id: -1, index: 0 });')
        d = js('return await SL.store.load()')
        gh = [l for l in d['profiles'][0]['links'] if l['p'] == 'github']
        ok(len(gh) == 1 and gh[0]['id'] == 'gh01' and gh[0]['url'] == 'https://github.com/someone',
           'menu "+ Add this link" on a GitHub link updates the GitHub entry, keeps its id (SL.store.load)', json.dumps(gh))
        js(BG + 'await bg.__sl.onClick({ menuItemId: "save-sel", selectionText: " dev@example.org " }, { id: -1, index: 0 });')
        js(BG + 'await bg.__sl.onClick({ menuItemId: "save-link", linkUrl: "javascript:alert(1)" }, { id: -1, index: 0 });')
        d = js('return await SL.store.load()')
        W = d['profiles'][0]['links']
        ok(any(l['p'] == 'email' and l['v'] == 'dev@example.org' for l in W) and not any('javascript' in l['url'] for l in W),
           'menu adds a selected email; javascript: link rejected')
        ok(wait(lambda: items() == 6), 'open popup refreshes when the background saves', str(items()))

        # switch profile from the menu
        js(BG + 'await bg.__sl.onClick({ menuItemId: "pr:personal" }, { id: -1, index: 0 });')
        ok(js('return (await SL.store.load()).active') == 'personal', 'menu switches profile')
        m = menu()
        ok(any(x['id'] == 'pr:personal' and x.get('checked') for x in m), 'menu shows Personal checked')
        js(BG + 'await bg.__sl.onClick({ menuItemId: "pr:work" }, { id: -1, index: 0 });')

        # open from the menu
        before = len(driver.window_handles)
        js(BG + 'await bg.__sl.onClick({ menuItemId: "o:li01" }, { id: -1, index: 0 });')
        ok(wait(lambda: len(driver.window_handles) == before + 1), 'menu Open opens a new tab')
        urls = js('return (await browser.tabs.query({})).map(t => t.url)')
        ok(any('linkedin.com/in/alex-morgan-dev' in (u or '') for u in urls), 'new tab is the LinkedIn profile', json.dumps(urls))
        js('const t = (await browser.tabs.query({})).filter(t => /linkedin/.test(t.url || "")); await browser.tabs.remove(t.map(x => x.id));')

        # copy from the menu (background page navigator.clipboard, clipboardWrite)
        try:
            js('await navigator.clipboard.writeText("-")')
            js(BG + 'await bg.__sl.onClick({ menuItemId: "c:li01" }, { id: -1, index: 0 });')
            clip = js('return await navigator.clipboard.readText()')
            ok(clip == 'https://www.linkedin.com/in/alex-morgan-dev', 'menu Copy puts the URL on the clipboard', repr(clip))
            js(BG + 'await bg.__sl.onClick({ menuItemId: "c:em01" }, { id: -1, index: 0 });')
            clip = js('return await navigator.clipboard.readText()')
            ok(clip == 'alex@example.com', 'email Copy gives the bare address', repr(clip))
        except Exception as e:
            ok(False, 'menu Copy (clipboard check)', str(e).splitlines()[0])

        # ---------------- paste into a real web page ----------------
        ext_handle = driver.current_window_handle
        driver.switch_to.new_window('tab')
        driver.get(URL)
        page_handle = driver.current_window_handle
        driver.switch_to.window(ext_handle)
        perm = js('return await browser.permissions.contains({ origins: ["http://127.0.0.1/*"] })')
        print('host permission for 127.0.0.1 granted at install (test copy):', perm, flush=True)
        tab = js('const t = (await browser.tabs.query({})).find(t => (t.url || "").startsWith(arguments[0])); return t && { id: t.id, index: t.index };', URL)
        ok(tab is not None, 'found the web page tab via browser.tabs.query')

        def paste(field, link, prep=''):
            # schedule the menu click in the background, then bring the page to the front with the field focused
            js(BG + 'bg.setTimeout(() => bg.__sl.onClick({ menuItemId: "v:" + arguments[0], frameId: 0 }, arguments[1]), 1200);', link, tab)
            driver.switch_to.window(page_handle)
            driver.execute_script('const e = document.getElementById(arguments[0]); e.focus();' + prep, field)
            time.sleep(2.2)
            v = driver.execute_script('return document.getElementById(arguments[0]).value', field)
            driver.switch_to.window(ext_handle)
            return v

        if tab:
            v = paste('plain', 'li01')
            ok(v == 'https://www.linkedin.com/in/alex-morgan-dev', 'Paste here fills a plain text box', repr(v))
            v = paste('email', 'em01')
            ok(v == 'alex@example.com', 'Paste here fills an email field', repr(v))
            v = paste('ta', 'li01', 'e.setSelectionRange(6, 6);')
            ok(v == 'Hello https://www.linkedin.com/in/alex-morgan-dev world', 'Paste here inserts at the cursor in a textarea', repr(v))
            js('await navigator.clipboard.writeText("-")')
            v = paste('ro', 'li01')
            ok(v == '', 'read-only field is not changed', repr(v))
            try:
                clip = js('return await navigator.clipboard.readText()')
                ok(clip == 'https://www.linkedin.com/in/alex-morgan-dev', '…and Paste falls back to copying', repr(clip))
            except Exception as e:
                ok(False, '…and Paste falls back to copying (clipboard check)', str(e).splitlines()[0])
            driver.switch_to.window(page_handle)
            shot('ff-04-paste-page.png')
            driver.switch_to.window(ext_handle)
    except Exception as e:
        import traceback
        traceback.print_exc()
        ok(False, 'test run crashed: ' + str(e).splitlines()[0])
        shot('ff-crash.png')
    finally:
        driver.quit()
        srv.shutdown()

    passed, failed = results.count(True), results.count(False)
    print(f'\n{passed} passed, {failed} failed', flush=True)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
