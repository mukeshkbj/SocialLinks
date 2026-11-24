# Store release kit — Social Links 2.1.0

Everything needed to submit to the Chrome Web Store, Microsoft Edge Add-ons and Firefox Add-ons (AMO). Nothing here has been submitted; the steps marked **(you)** need the developer's own accounts.

Store requirements below were checked on 24 Nov 2026 against the sources listed at the end. Store dashboards change; if a field name differs, match it by meaning.

## Files in this folder

| File | Size | Use |
|---|---|---|
| `screenshot-1-paste.png` | 1280×800 | Screenshot 1 — "Your links, one right-click away" |
| `screenshot-2-add-from-link.png` | 1280×800 | Screenshot 2 — "Save any profile by right-clicking it" |
| `screenshot-3-add-edit-tiles.png` | 1280×800 | Screenshot 3 — "+ to add, ✎ to edit" |
| `screenshot-4-profiles.png` | 1280×800 | Screenshot 4 — "Work and Personal profiles" |
| `screenshot-5-share-card.png` | 1280×800 | Screenshot 5 — "Share as a QR code or vCard" |
| `promo-small-440x280.png` | 440×280 | Chrome small promo tile; Edge small promotional tile |
| `edge-logo-300x300.png` | 300×300, transparent corners | Edge "Extension logo" |
| `amo-icon-128x128.png` | 128×128 | Store icon (same as `src/icons/icon128.png`) |
| `menu-titles.txt` | — | The real right-click menu titles the screenshots use |
| `make-assets.cjs` | — | Regenerates all of the above |

**How the images were made.** `make-assets.cjs` builds nothing itself; run `node build.mjs` first. It loads `dist/chromium` in Chrome with Playwright, seeds fictional demo data ("Alex Morgan", `alex-morgan-dev`, `example.com` addresses) through `SL.store.save` in the service worker, and screenshots the real popup at 2× pixel density. Screenshots 3, 4 and 5 show those real popup captures. The right-click menus in screenshots 1, 2 and 4, and the web pages behind them, are **HTML drawings** that use the extension's real menu titles read from `globalThis.__sl.menu()`. They are not captures of the browser's native menu (automation can't open native menus). Don't describe them as native screenshots anywhere.

Regenerate after UI or wording changes:
```
node build.mjs && NODE_PATH=$(npm root -g) node store/release/make-assets.cjs [path/to/chrome]
```

## 0. Before any store (you)

1. **Fix the manifest description length (blocker).** `extDescription` in `src/_locales/en/messages.json` is 142 characters. Chrome allows at most 132 characters for the manifest `description`. Edge also shows this field as the listing's short description. A suggestion that fits (115 characters), taken from `LISTING.md`: *"Paste your LinkedIn, GitHub and other profile links into any form with one right-click. No access to your browsing."*
2. Merge to `main` so the privacy policy is reachable at a stable URL. Then use one of these as the **privacy policy URL**:
   - `https://github.com/mukeshkbj/SocialLinks/blob/main/store/PRIVACY.md` (rendered, easiest), or
   - `https://raw.githubusercontent.com/mukeshkbj/SocialLinks/main/store/PRIVACY.md` (plain text), or
   - GitHub Pages: Settings → Pages → deploy from `main`. Pages then shows the site URL; the policy is under `store/PRIVACY` on it.

   Open the URL in a private window to check it loads without signing in.
3. Run `npm test`, `npm run test:e2e` and `npm run release` (build + `web-ext lint`). If you change the version, bump it in `manifests/chromium.json`, `manifests/firefox.json` and `package.json`, add a CHANGELOG entry, and rebuild.
4. You'll upload these packages:
   - Chrome and Edge: `dist/social-links-chromium-2.1.0.zip`
   - Firefox: `dist/social-links-firefox-2.1.0.zip`

## 1. Chrome Web Store

**Account (you):** a Google account with **2-Step Verification turned on**. Chrome requires it before you can publish or update an item. Register at the Chrome Web Store Developer Dashboard (https://chrome.google.com/webstore/devconsole), accept the developer agreement, and pay the **one-off US$5 registration fee**. Set a publisher name and verify the contact email (the store sends a link). New publishers get 2 extension slots by default.

1. Open the Developer Dashboard → **Add new item** → choose `dist/social-links-chromium-2.1.0.zip` → **Upload**.
2. **Package** tab: read-only; check the version says 2.1.0.
3. **Store listing** tab:
   1. **Description:** paste *Full description* from `LISTING.md`. Paste it as plain text: the store doesn't render Markdown, so remove the `**` markers.
   2. **Category:** Productivity.
   3. **Language:** English.
   4. **Store icon:** `amo-icon-128x128.png` (128×128).
   5. **Screenshots:** upload `screenshot-1-paste.png` … `screenshot-5-share-card.png` in order (1280×800; Chrome allows up to 5).
   6. **Small promo tile:** `promo-small-440x280.png`. Marquee (1400×560) isn't needed.
   7. **YouTube video (optional):** the demo video from `docs/demo/`, if you upload it to YouTube.
   8. **Homepage URL:** `https://github.com/mukeshkbj/SocialLinks`. **Support URL:** `https://github.com/mukeshkbj/SocialLinks/issues`. Leave **Official URL** empty unless you've verified a site in Search Console. **Mature content:** off.
   9. The listing's name and summary come from the manifest (`extName`, `extDescription`). See step 0.1.
4. **Privacy** tab:
   1. **Single purpose description:** paste *Single purpose* from `LISTING.md`.
   2. **Permission justification**, one field per permission:
      - `contextMenus`: "Shows the Social links right-click menu, from which the user pastes, opens, copies and adds their saved links."
      - `storage`: "Saves the user's links and profiles in browser storage (synced through the user's own browser account when sync is on)."
      - `offscreen`: "A hidden extension page performs the 'Copy' menu action, because service workers cannot use the clipboard."
      - `clipboardWrite`: "Writes the chosen link to the clipboard when the user picks Copy. The clipboard is never read."
      - `activeTab`: "When the user picks 'Paste here' in the right-click menu, grants temporary access to that one tab so the link can be typed into the box they right-clicked."
      - `scripting`: "Inserts the chosen link into the text box the user right-clicked, only after they pick 'Paste here'. The injected function reads nothing from the page."
      - `favicon` (optional permission; a field appears only if the dashboard lists it): "Shows website icons for the user's saved links from the browser's own icon cache, only after the user turns on 'Show site icons'. Nothing is sent anywhere."
      - Omnibox keyword (if it ships): `omnibox` is a manifest key, not a permission, so it usually needs no justification field. If the dashboard asks anyway: "Lets the user type the keyword in the address bar to search and open their own saved links."
   3. **Remote code:** "No, I am not using remote code." (All code, including the QR encoder, is bundled.)
   4. **Data usage:** tick **none** of the data-type boxes (the extension collects nothing). Then tick all three certifications: not sold or transferred to third parties; not used or transferred for purposes unrelated to the single purpose; not used or transferred to determine creditworthiness or for lending.
   5. **Privacy policy URL:** from step 0.2.
5. **Distribution** tab: **Public** (or **Unlisted** to share by link only). Regions: all. Free.
6. **Test instructions** tab: "No sign-in needed. Right-click any page → Social links. To try Paste: right-click in any text box → Social links → a link → Paste here."
7. **Submit for review** → confirm. Leave "publish automatically after review" ticked, or untick it to defer (you then have 30 days to publish).
8. Review time: Google says most reviews finish within a few days but can take up to a few weeks. Contact developer support if it's pending more than three weeks. Turn on email notifications on the Account page.

## 2. Microsoft Edge Add-ons

**Account (you):** free. Sign in to Partner Center (https://partner.microsoft.com/dashboard/microsoftedge) with a personal Microsoft account (Outlook/Hotmail/Live, or sign in with GitHub). Work or school accounts aren't supported for registration. Go to **Account settings → Programs → Microsoft Edge → Get started**. Choose country/region and account type **Individual** (neither can be changed later), set a publisher display name (≤50 characters) and contact details, then accept the agreement.

1. **Overview → Create new extension**.
2. **Upload package (.zip file):** drop `dist/social-links-chromium-2.1.0.zip` → fix any validation errors → **Continue**.
3. **Availability:** Visibility **Public** (or **Hidden** for link-only). Markets: all. **Save & Continue**.
4. **Properties:** Category **Productivity**. Website `https://github.com/mukeshkbj/SocialLinks`. Support contact `https://github.com/mukeshkbj/SocialLinks/issues` (or a support email). Mature content: off. **Save & Continue**.
5. **Privacy:**
   1. **Single Purpose:** same text as Chrome (`LISTING.md` → *Single purpose*).
   2. **Permission justification:** same texts as Chrome step 4.2.
   3. **Are you using remote code?** **No, I am not using remote code.**
   4. **Data usage:** select no data types; tick the certification boxes.
   5. **Privacy Policy URL:** from step 0.2. Edge only requires it if you collect data, but add it anyway.
   6. **Save & Continue**.
6. **Store listings → English → Edit details:**
   1. **Description:** the *Full description* from `LISTING.md` as plain text (Edge needs 250–10,000 characters; it's about 1,700).
   2. **Extension logo:** `edge-logo-300x300.png`.
   3. **Small promotional tile:** `promo-small-440x280.png`. Large promotional tile (1400×560): skip.
   4. **Screenshots:** the five `screenshot-*.png` files (Edge allows up to 6, at 640×480 or 1280×800).
   5. **YouTube video URL:** optional; turn off ads on the video.
   6. **Search terms** (optional; max 7 terms, 21 words in total, 30 characters each): `social links`, `linkedin`, `github`, `profile links`, `paste link`, `right click`, `job application`.
   7. **Extension name** and **Short description** come from the manifest (see step 0.1).
   8. **Save draft**.
7. Check every language shows **Status: Complete** → **Publish**.
8. **Notes for certification:** "No sign-in needed. Right-click any page → Social links. To test Paste: right-click in a text box → Social links → a link → Paste here. The extension makes no network requests." → **Publish**.
9. Review: up to seven business days. The status then changes to **In the Store**.

## 3. Firefox Add-ons (AMO)

**Account (you):** free. Sign in at https://addons.mozilla.org/developers/ with a Mozilla account and accept the Developer Agreement. For command-line signing, create API credentials at https://addons.mozilla.org/developers/addon/api/key/ (a JWT issuer and a JWT secret). Keep them secret and never commit them.

The Firefox manifest already declares `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]`. AMO requires this for new extensions submitted since 3 Nov 2025. The gecko ID `social-links@mukeshkbj` must never change.

**Listed on AMO (public):**
1. `npm run release` (build + `web-ext lint`). Fix any errors; the AMO validator won't let you continue with errors. Fix security and privacy warnings too.
2. Developer Hub → **Submit a New Add-on** → **On this site** → **Continue**.
3. **Upload Version:** **Select a file** → `dist/social-links-firefox-2.1.0.zip`. Wait for the validator.
4. Compatible platforms: **Firefox** (desktop). Leave Android unticked; Android hasn't been tested. → **Continue**.
5. "Do you need to submit source code?" → **No**. The code isn't minified, bundled or obfuscated. → **Continue**.
6. **Describe Add-on:**
   - **Name:** `Social Links – right-click open, copy & add`.
   - **Add-on URL:** `social-links` (or the closest available).
   - **Summary** (≤250 characters): the *Short description* from `LISTING.md`.
   - **Description:** the *Full description* from `LISTING.md` (AMO supports limited formatting; plain text is safe).
   - **Experimental:** no. **Requires payment:** no.
   - **Firefox categories** (up to 2): **Social & Communication** and/or **Other**. AMO's categories differ from Chrome's, so pick the closest the form offers.
   - **Support email / Support website:** `https://github.com/mukeshkbj/SocialLinks/issues`.
   - **License:** **MIT** (matches `LICENSE`).
   - **Privacy policy:** optional on AMO, because no data leaves the device. You can still tick it and paste the text of `store/PRIVACY.md`.
   - **Notes for Reviewers:** "No sign-in needed. Right-click any page → Social links. Paste here uses activeTab + scripting to type the chosen link into the focused field; nothing is read from the page. No network requests."
7. **Submit Version**. You'll get a confirmation email. Automated validation runs at upload. Human review may follow, and AMO's docs don't give a time for it.
8. After it's listed: **Edit Product Page → Images**: upload the five `screenshot-*.png` (1280×800 is AMO's maximum display size; ratio 1.6:1). The icon comes from the manifest. AMO's own icon upload takes 32×32 or 64×64 (resize `amo-icon-128x128.png` if you want to set it there).

**Unlisted / self-distributed (signed .xpi for your own use):**
```
WEB_EXT_API_KEY=<JWT issuer> WEB_EXT_API_SECRET=<JWT secret> npm run firefox:sign
```
This runs `web-ext sign --channel unlisted`. web-ext 8 requires `--channel`. The signed `.xpi` is written to `web-ext-artifacts/`. For automatic updates of a self-hosted build you'd also need an `update_url` in the manifest.

## 4. What only the developer can do

- Create and secure the accounts: a Google account with 2-Step Verification plus the US$5 Chrome fee; a personal Microsoft account for Partner Center; a Mozilla account for AMO.
- Verify the contact emails each store sends.
- Fix `extDescription` (≤132 characters) in `src/`, then rebuild the zips.
- Publish `store/PRIVACY.md` at a public URL (merge to `main`).
- Upload the zips and images, paste the texts, tick the declarations, and press Submit/Publish in each dashboard.
- Create AMO API keys (only for `web-ext sign`) and keep them out of git.
- Answer reviewer questions and watch the store inboxes.

## Sources (checked 24 Nov 2026)

- Chrome — images (icon, 1280×800 screenshots up to 5, 440×280 small promo tile): https://developer.chrome.com/docs/webstore/images
- Chrome — store listing fields: https://developer.chrome.com/docs/webstore/cws-dashboard-listing
- Chrome — privacy fields (single purpose, permission justification, remote code, data usage, privacy policy): https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- Chrome — publishing steps, deferred publishing: https://developer.chrome.com/docs/webstore/publish
- Chrome — registration: https://developer.chrome.com/docs/webstore/register and account setup: https://developer.chrome.com/docs/webstore/set-up-account
- Chrome — US$5 registration fee: https://9to5google.com/2020/03/12/chrome-web-store-fee/
- Chrome — 2-Step Verification required to publish: https://developer.chrome.com/docs/webstore/program-policies/two-step-verification
- Chrome — review times: https://developer.chrome.com/docs/webstore/review-process
- Chrome — publication limits (2 slots by default), Aug 2026: https://developer.chrome.com/blog/cws-review-updates-2026
- Chrome — manifest `description` max 132 characters: https://developer.chrome.com/docs/extensions/mv3/manifest/description
- Edge — publish steps, fields, image sizes, review up to 7 business days: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension
- Edge — developer registration (free, personal Microsoft account): https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account
- AMO — submitting an add-on: https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- AMO — listing images and summary limit: https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/
- AMO — data collection consent for new extensions: https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/
- web-ext — `sign` / `lint` options, API keys: https://extensionworkshop.com/documentation/develop/web-ext-command-reference/
