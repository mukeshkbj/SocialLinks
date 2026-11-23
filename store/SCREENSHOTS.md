# Store screenshots (1280 × 800)

Stores need 1280×800 PNG or JPEG (Chrome: 1–5; Edge: up to 10; Firefox: any). Take each on a clean browser profile with believable sample links, popup open or menu showing, on a plain page background, then add a one-line caption band at the top.

| # | Caption | What to show |
|---|---|---|
| 1 | Your links, one right-click away | A job-application form; right-click in a text field; *Social links* menu expanded with 4–5 links and the **⧉ Copy** submenu visible |
| 2 | Save any profile by right-clicking it | A GitHub repo page; right-click on the owner link; **+ Add / ✎ Edit › + Add this link** highlighted; toolbar badge ✓ |
| 3 | + to add, ✎ to edit | Toolbar popup with the platform grid open: some tiles with ✎, the rest with + |
| 4 | Work and Personal profiles | Popup with the profile dropdown open, and the menu's *Profile ›* submenu |
| 5 | Share as a QR code or vCard | Popup share card with name and QR, a phone mock-up beside it showing the scanned contact |
| 6 | Back up and restore | Restore panel showing the preview and Merge / Replace |
| 7 | Private by design | Chrome's install dialog showing only "Modify data you copy and paste", with a short permissions list |

Reference renders from the automated test run are in `store/screenshots/`:
- `01-popup-links.png` — popup with links
- `03-share-card.png` — share card
- `04-restore-preview.png` — restore preview
- `05-popup-dark.png` — dark mode
- `02-right-click-menu.txt` — text of the built menu

They're popup-sized (420 px wide); compose them onto 1280×800 canvases for the stores.

Also needed:
- 128×128 store icon (`src/icons/icon128.png`)
- Chrome small promo tile, 440×280 (optional, recommended)
- Edge logo, 300×300
