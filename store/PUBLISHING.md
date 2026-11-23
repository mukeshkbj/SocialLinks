# Publishing checklist

Before any store: `npm test`, `npm run test:e2e`, then bump `version` in both files in `manifests/` and in `package.json`, add a CHANGELOG entry, and run `npm run build`.

## Chrome Web Store
- [ ] Register at the Chrome Web Store Developer Dashboard (one-off US$5 fee, Google account with 2-step verification).
- [ ] **New item** → upload `dist/social-links-chromium-<version>.zip`.
- [ ] Store listing: name, short and full description, category Productivity, language English (from `LISTING.md`).
- [ ] Graphics: 128×128 icon, 1–5 screenshots at 1280×800 (`SCREENSHOTS.md`), optional 440×280 promo tile.
- [ ] Privacy tab: single purpose, a justification for each permission, "no remote code", data usage all unticked, certify the disclosures; privacy policy URL (host `PRIVACY.md`, e.g. on GitHub Pages).
- [ ] Distribution: Public, or Unlisted to share by link only.
- [ ] Submit for review (usually a few days; extensions with few permissions tend to go faster).

## Microsoft Edge Add-ons
- [ ] Register at Partner Center → Microsoft Edge program (free).
- [ ] Upload the same chromium zip.
- [ ] Availability (public/hidden, markets), properties (category, privacy policy URL), listing (description, 300×300 logo, screenshots).
- [ ] Testing notes: "No sign-in needed. Right-click any page → Social links."
- [ ] Submit (review is usually up to 7 business days).

## Firefox Add-ons (AMO)
- [ ] Create an account at addons.mozilla.org (free); generate API keys for `web-ext`.
- [ ] `npm run firefox:lint` — fix anything it reports.
- [ ] Public listing: Developer Hub → Submit a New Add-on → upload `dist/social-links-firefox-<version>.zip`. Source-code upload isn't needed (the code is not minified or bundled).
- [ ] Or private: `npm run firefox:sign` (unlisted channel) gives a signed .xpi to install yourself.
- [ ] Listing: summary, description, category, privacy policy, screenshots.
- [ ] The gecko ID `social-links@mukeshkbj` must stay the same forever; updates rely on it.

## Safari (Mac App Store)
- [ ] Apple Developer Program membership (US$99/year).
- [ ] `xcrun safari-web-extension-converter dist/chromium --app-name "Social Links" --bundle-identifier com.yourname.sociallinks`.
- [ ] In Xcode: set your team, check the right-click menu and Copy work in Safari (not tested yet), and test on macOS; iOS needs separate checks.
- [ ] App Store Connect: create the app, privacy "Data Not Collected", screenshots, then archive and upload from Xcode.
- [ ] Submit for App Review.

## After release
- [ ] Tag the release in git; attach both zips.
- [ ] Watch store reviews and the support email.
- [ ] Set a reminder to re-test on new Chrome and Firefox major versions.
