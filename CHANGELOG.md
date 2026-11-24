# Changelog

## 2.2.0 — 2026-11-24
### Added
- **Address-bar shortcut:** type `sl` + space, then a name. Enter opens the best match (current, new or background tab, as the browser asks); `sl copy <name>` / `sl c <name>` copies; `sl manage` opens the manager; email links are copied. No new permissions or install warnings.
- **Site suggestions for Other links:** a keyboard- and screen-reader-friendly list of 35 well-known sites fills in the name and address pattern; typing a known site's URL names it automatically; right-clicking a known site's link saves it with the site's name (e.g. "Kaggle"); a URL on the wrong site is rejected.
- **★ main links:** the share card's QR code and vCard include only links marked main. LinkedIn, GitHub, Website and Email are main by default; toggle ★ on any link.

### Changed
- **Safer syncing:** links are stored one per sync item instead of one document, so edits made on two computers at about the same time both survive. Deletions are kept for 30 days so an out-of-date computer can't bring a link back. The profile you're using is now chosen per computer. Data from 2.x is migrated automatically on first run. **Update every computer to 2.2**: a computer still on 2.x won't see changes made on 2.2.
- The address bar no longer lists its top match twice.

### Fixed
- A load that started before a save could put older data back into the background's memory.

## 2.1.0 — 2026-11-24
### Added
- **Paste here**: right-click in a text box › Social links › any link › Paste here types it into that box. Works in plain fields, email/URL fields, textareas (at the cursor), rich-text editors and fields inside frames; Ctrl+Z undoes it; page frameworks see a normal input event. Where a page can't be typed into, the link is copied instead (badge ⧉) so Ctrl+V works.
- Email links now have a submenu (Paste here, Copy).
- New permissions `activeTab` and `scripting`. Chrome shows no new install warning (still only "Modify data you copy and paste"); the extension can only reach a page in the moment you choose Paste on it, and reads nothing from it.

## 2.0.1 — 2026-11-24
### Fixed
- **Installing on a new computer no longer risks wiping synced links.** 2.0.0 saved empty default profiles on first run, which could sync over links saved on other devices before the browser had downloaded them. Defaults now stay in memory until you change something.
- Usernames with accents or in other scripts (e.g. `linkedin.com/in/josé-garcía`) are recognised instead of being saved as an Other link or rejected.
- A link saved from the right-click menu while the popup's add/edit form is open is no longer overwritten when the form is saved.
- Editing a link that was removed in another window saves it, instead of silently losing the edit.
- "Undo remove" no longer reports "Restored" after the link's profile was deleted.
- Copy from the menu in Firefox falls back to the older copy method if the clipboard API is refused.

### Changed
- Tracking parameters (`utm_*`, `fbclid`, `gclid`, `si`, `ref` …) are removed from saved links.
- Duplicate detection ignores `http`/`https`, `www.`, host letter case and a trailing slash.
- YouTube `/channel/`, `/c/` and `/user/` links and `name.medium.com` pages are saved as YouTube and Medium links.

### Added
- Demo video (`docs/demo/social-links-demo.mp4`) with thumbnail, English captions, YouTube upload kit, and the scripts that render it (`docs/demo/source`).

## 2.0.0 — 2026-11-23
### Added
- **Copy** from the right-click menu (Chrome/Edge via an offscreen page; Firefox via the background clipboard). Email links are copy-only.
- **Profiles** (Work, Personal, or your own): create, rename, delete, switch from the popup or the menu.
- **Share card**: QR code (encoder bundled, no remote code) and downloadable vCard.
- **Backup and restore**: JSON export; import with preview, merge or replace; imported links are cleaned and validated.
- **Search** in the popup once a profile has more than 10 links.
- **Optional site icons** for Other links (Chrome/Edge, off by default).
- **Keyboard reordering** (↑/↓ on the drag handle), ↑/↓ buttons, screen-reader labels, high-contrast and forced-colours support.
- All text in `_locales/en/messages.json`, ready for translation.
- Separate Chrome and Firefox builds; automated unit, QR, simulated-Firefox and real-Chrome tests.

### Changed
- Menu items use permanent link IDs, so reordering or deleting elsewhere can never open or copy the wrong link.
- Shorter menu: links first; add/edit actions grouped under **+ Add / ✎ Edit**.
- Right-clicking a platform's non-profile page (e.g. GitHub Features) saves an Other link instead of a wrong profile.
- Storage falls back to this computer when the browser's sync quota is exceeded, and moves back when it fits.

### Fixed
- Email links no longer open a blank mailto tab.

### Upgrading
- 1.0 links are moved into the Work profile automatically on first run (same install).

## 1.0.0 — 2026-11-23
- First release: right-click open and add, toolbar manager with + / ✎ tiles, Other link, one link per platform.
