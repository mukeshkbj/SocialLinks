# Social Links — browser extension

Your LinkedIn, GitHub and other profile links, one right-click away on any website: paste them straight into a form, open or copy them, or add new ones. Works in Chrome, Edge, Brave, Opera, Firefox and Safari on Windows, macOS and Linux.

**Never reads the websites you visit.** It only types into a page when you choose **Paste here**, and only into the box you right-clicked. No host permissions, no content scripts, no analytics, no network requests.

## Demo

[![Social Links demo video: all your links, one right-click](docs/demo/social-links-thumbnail.png)](docs/demo/social-links-demo.mp4)

A 95-second walkthrough ([MP4](docs/demo/social-links-demo.mp4), [captions](docs/demo/social-links-demo.en.srt)): paste, copy and open links from the right-click menu, the `sl` address-bar shortcut, saving a link by right-clicking it, the toolbar panel with site suggestions, ★ main links on the share card, profiles and backup. The source that renders it is in [`docs/demo/source`](docs/demo/source).

## Features

- **Paste straight into forms** — right-click in a text box › Social links › LinkedIn › **Paste here**. Works in plain fields, rich-text editors and fields inside frames, keeps Ctrl+Z, and falls back to copying where a page can't be typed into.
- **Address-bar shortcut** — type `sl` and a space in the address bar, then a name: `sl linkedin` opens it, `sl copy github` (or `sl c github`) copies it, `sl manage` opens the manager. No mouse needed.
- **Right-click menu everywhere** — open or copy any saved link; add the link, page or text you right-clicked; add or edit any platform; switch profile.
- **Built-in platforms** — LinkedIn, GitHub, X, Instagram, YouTube, Facebook, TikTok, Medium, DEV, Stack Overflow, Website, Email — plus **Other link** for any site under your own name, as many as you like. When adding an Other link, a searchable list suggests 35 well-known sites (Kaggle, Hugging Face, Devpost, Behance, Dribbble, GitLab, Bluesky, LeetCode, Substack, ORCID …) and sets up the address so you only type your username.
- **Smart detection** — right-click a GitHub repo, a LinkedIn post or a YouTube video and it saves the owner's profile. Unknown sites become an Other link named after the site.
- **+ and ✎** — platforms you haven't added show **+**; ones you have show **✎** and open for editing. One link per platform, so you never get duplicates.
- **Profiles** — separate sets such as Work and Personal; create, rename, delete and switch from the popup or the menu.
- **Share card** — a QR code that phones scan straight into contacts, plus a downloadable vCard (.vcf). Only links marked **★ main** go on the card; LinkedIn, GitHub, Website and Email are main by default, and you can change it per link.
- **Backup and restore** — export everything to a JSON file; import with a preview, then merge or replace.
- **Everyday polish** — search once you have more than 10 links, drag or keyboard reordering, Undo after remove, Copy all / Copy JSON, Alt+Shift+L shortcut, light and dark mode, high-contrast support, full keyboard and screen-reader support.
- **Syncs** through your browser account, one link at a time: edits made on two computers at about the same time both survive (the same link edited on both keeps the newer edit). The profile you're using is chosen per computer. If you outgrow the sync quota it saves on this computer instead and tells you.

## Right-click menu

| Where you right-click | What *Social links* offers |
|---|---|
| In a text box | Each saved link › **⤵ Paste here** / ↗ Open / ⧉ Copy |
| Anywhere | Each saved link › **↗ Open** / **⧉ Copy** (email: copy only) · **+ Add / ✎ Edit ›** each platform · **Profile ›** switch · **Manage links…** |
| On a link | **+ Add / ✎ Edit › + Add this link** |
| On empty page space | **+ Add / ✎ Edit › + Add this page** |
| On selected text | **+ Add / ✎ Edit › + Add "…"** (a URL, domain or email address) |

Toolbar badge after a menu action: **✓** added or pasted · **✎** updated · **⧉** copied (also shown when a page blocks typing, so you can press Ctrl+V) · **=** already saved · **!** not a valid link.

## Install

Two ready-built folders are in `dist/` (zips alongside):

| Browser | Folder |
|---|---|
| Chrome, Edge, Brave, Opera, Vivaldi; Safari via converter | `dist/chromium` |
| Firefox 121+ | `dist/firefox` |

**Chrome / Edge / Brave / Opera**
1. Open `chrome://extensions` (Edge: `edge://extensions`), turn on **Developer mode**.
2. **Load unpacked** → choose `dist/chromium`.
3. Pin it from the puzzle-piece menu.

*Upgrading from 1.0:* Chrome ties an unpacked extension's saved data to its folder. Copy the contents of `dist/chromium` **into your existing `social-links-ext` folder** (replace everything) and press **Reload** on the extensions page — your links move into the Work profile automatically. Loading from a new folder starts empty.

**Firefox**
- Try it: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `dist/firefox/manifest.json` (removed when Firefox restarts).
- Keep it: `npm run firefox:sign` (needs free addons.mozilla.org API keys) gives a signed .xpi you can install permanently; or publish it (see `store/PUBLISHING.md`).

**Safari (macOS)**
```
xcrun safari-web-extension-converter dist/chromium --app-name "Social Links"
```
Open the generated Xcode project, **Run**, then enable it in Safari › Settings › Extensions (for local testing also turn on *Allow unsigned extensions* in the Develop menu). Not tested here — see below.

## Permissions

| Permission | Browser | Why | Install warning |
|---|---|---|---|
| `contextMenus` / `menus` | all | the right-click menu | none |
| `storage` | all | save your links (browser sync, local fallback) | none |
| `offscreen` | Chrome/Edge | a hidden extension page that performs **Copy** from the menu | none |
| `clipboardWrite` | all | write (never read) the clipboard for **Copy** | "Modify data you copy and paste" |
| `activeTab` | all | when you choose **Paste here**, lets the extension into *that one tab, that one time* | none |
| `scripting` | all | types the link into the box you right-clicked (it reads nothing from the page) | none |
| `omnibox` keyword `sl` *(manifest key, not a permission)* | all | the address-bar shortcut | none |
| `favicon` *(optional, off by default)* | Chrome/Edge | real site icons for Other links — only if you click **Show site icons** | "Read the icons of the websites you visit" |

Chrome reports exactly one install warning for this extension: *Modify data you copy and paste* (verified with `chrome.management.getPermissionWarningsByManifest`). Adding Paste (`activeTab` + `scripting`) did not add a warning, because there are no host permissions: the extension can only reach a page in the moment you pick **Paste here** on it. It cannot read your clipboard, your tabs, your history or any page content.

## Develop

```
npm run build        # dist/chromium, dist/firefox + zips
npm test             # unit + regression tests + simulated-Firefox background test
npm run test:qr      # QR encoder round-trip, decoded by OpenCV (python3 + opencv)
npm run test:e2e     # loads dist/chromium in real Chrome with Playwright
```
Source is in `src/` (plain JavaScript, no build step, no dependencies); `manifests/` holds the per-browser manifests; strings are in `src/_locales/en/messages.json` — copy that folder to e.g. `_locales/fr/` to translate.

## Testing status (v2.2.0)

| Check | Result |
|---|---|
| Unit tests: URL parsing, validation, vCard, storage fallback, v1 migration, backup cleaning/merge, QR | 9/9 pass |
| Regression tests for the 2.0.1 fixes: no first-run overwrite, accented usernames, tracking parameters, duplicate URLs, YouTube channels, Medium subdomains | 7/7 pass |
| QR encoder decoded by OpenCV (versions 1–19, levels M and L, incl. Unicode) | 20/20 pass |
| Real Chrome (Playwright, unpacked extension): permissions and install warnings, menu structure, add/update/copy/open from the menu, stale-ID safety, profile switching, popup add/edit/validate, + and ✎ tiles, keyboard reorder, remove/undo, search, profiles, share card + vCard + QR image, backup/restore with preview, deep links, accessibility names, and the 2.0.1 fixes (menu save while a form is open, editing a link deleted elsewhere, undo after a profile is deleted) | 51/51 pass |
| Paste in real Chrome (`tests/e2e-paste.cjs`): plain, email, textarea at the cursor, Ctrl+Z undo, rich-text, framework input events, iframes, read-only fields and blocked pages fall back to copy | 13/13 pass |
| Sync (`tests/sync.test.mjs`): two simulated computers with delayed sync: concurrent adds, edits, deletes, reorders, renames, per-computer profile, migration from 2.x, quota fallback, tombstones | 22/22 pass |
| Address bar (`tests/omnibox.test.mjs` + real Chrome `tests/e2e-omnibox.cjs`): matching and ranking, open in current/new/background tab, copy, email, manage, escaping, install warnings | 6/6 + 33/33 pass |
| Other-link site list and ★ main links (`tests/popup-features.test.mjs` + real Chrome `tests/e2e-popup.cjs`): keyboard and mouse combobox, prefixes, wrong-site check, ★ toggle saved, vCard has only main links | 9/9 + 47/47 pass |
| Simulated Firefox background (fake `browser` API), including Paste and the address bar | pass |

**Not tested:**
- **Real Firefox and Safari.** Neither was available in the build environment. Run `npm run firefox:lint` and `npm run firefox:run` to check Firefox.
- **Clicking the native right-click menu itself.** Browsers don't let automation open their own menus, so the tests call the same handler the menu uses and check the menu that was built. For Paste, a real right-click grants `activeTab`; the test instead loads a test-only copy that may reach the local test page.
- **Phone scanning of the QR code.** Large cards (around 15+ links) produce dense codes; the popup warns and suggests the vCard instead.
