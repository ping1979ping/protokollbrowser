---
name: deploy
description: Build and deploy the Protokoll-App to GitHub Pages
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
---

Build and deploy the Protokoll-App to GitHub Pages:

1. Change to app directory: `cd C:/daten/python/protokollbrowser/app`
2. Run `export PATH="/c/Program Files/nodejs:$PATH" && npm run build` — abort if build fails
3. Verify dist contains: `sw.js` (self-destructing), `sw2.js` (real SW), `version.txt` (build timestamp)
4. Change to repo root: `cd C:/daten/python/protokollbrowser`
5. Push to master: `git push origin master`
6. GitHub Actions workflow (`.github/workflows/deploy.yml`) builds from `app/dist` and deploys via `actions/deploy-pages`
7. Report deployment URL: https://ping1979ping.github.io/protokollbrowser/

**Do NOT use `npx gh-pages`** — it conflicts with the GitHub Actions deployment pipeline.

If $ARGUMENTS contains "skip-push", only build without pushing.

## PWA Cache-Busting Architecture

This project uses a multi-layer cache-busting system for reliable updates on iOS Safari:

### Problem
iOS Safari aggressively caches Service Workers. Old SWs serve old `index.html`, which registers old SWs — a chicken-and-egg problem.

### Solution: 3 Layers

1. **Self-destructing `sw.js`** (`app/public/sw.js`)
   - Static file in `public/`, copied 1:1 to `dist/`
   - When the old SW fetches updates, it gets this file → clears all caches → unregisters itself → reloads clients
   - This breaks the old SW loop

2. **`version.txt`** (generated at build time)
   - Build script appends `node -e "..."` to write `Date.now()` into `dist/version.txt`
   - Excluded from SW precache via `globIgnores: ['**/version.txt']` in vite.config.ts

3. **Inline version check in `index.html`**
   - Fetches `version.txt` with `cache: 'no-store'` (bypasses SW interception!)
   - Compares with `localStorage.app_v`
   - On mismatch: deletes all caches (except `map-tiles-*`), unregisters all SWs, reloads
   - Preserves map tile caches to avoid re-downloading offline maps

4. **Real SW uses different filename: `sw2.js`**
   - Configured via `filename: 'sw2.js'` in VitePWA config
   - Fresh URL that old SW cache never knew about
   - With `skipWaiting: true` and `clientsClaim: true`

### Build-Version auf Startseite
- `ImportScreen.tsx` zeigt Build-Timestamp aus `VITE_BUILD_TIME` env var und fetched `version.txt`
- Zur schnellen visuellen Kontrolle ob neuer Code geladen wurde

### Für neue Projekte übernehmen
1. `public/sw.js` — self-destructing SW (copy as-is)
2. `vite.config.ts` — `filename: 'sw2.js'`, `skipWaiting`, `clientsClaim`, `globIgnores: ['**/version.txt']`
3. `index.html` — inline version check script
4. `package.json` build script — append `&& node -e "..."` to write version.txt
5. Deploy via GitHub Actions (`actions/deploy-pages`), NOT `gh-pages` npm package
