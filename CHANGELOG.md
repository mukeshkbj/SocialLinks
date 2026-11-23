# Changelog

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
