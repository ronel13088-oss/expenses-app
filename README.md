# ניתוח הוצאות – PWA אישית (שלב 1)
Static PWA, Hebrew RTL, everything runs in the browser; data in IndexedDB on the device only. No network calls at runtime (SheetJS + Heebo vendored, CSP `default-src 'self'`).

- Run locally: `python3 -m http.server 8080` → http://localhost:8080
- Tests: `node --test tests/` (synthetic fixtures only)
- Real-data guard: `node scripts/check-no-real-data.mjs` (also runs as pre-commit via `git config core.hooksPath .githooks`)
- Deploy: GitHub Pages from `main` root (all paths relative).

Layout: `index.html, styles.css, manifest.webmanifest, sw.js`, `js/core.js` (parsing, dedupe, categorization, analysis – pure), `js/importers.js` (pluggable importer registry – stage 2 bank import plugs here), `js/db.js` (IndexedDB), `js/backup.js` (AES-GCM + PBKDF2), `js/app.js` (UI), `vendor/` SheetJS (from cdn.sheetjs.com, version in vendor/VERSION), `fonts/` Heebo (OFL), `icons/`.
Never put real bank/card files in this directory.
