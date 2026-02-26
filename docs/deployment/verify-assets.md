# Verify static assets after Netlify deploy

After deploying the SPA to Netlify, confirm that `/assets/*` (JS, CSS, source maps) are served as real files and not rewritten to `index.html`. If they return `Content-Type: text/html`, the app will hang on "INITIALIZING PROTOCOL…".

## Quick check

```bash
# Replace INDEX_HASH with the actual hashed filename from your build (e.g. index-a1b2c3d4.js)
curl -sI "https://p3lending.space/assets/index-INDEX_HASH.js"
```

**Expected:** `Content-Type: application/javascript` (or at least not `text/html`).

**Broken:** `Content-Type: text/html` → redirect/rewrite is catching assets; fix redirect order in `netlify.toml`.

## Using the script (discovers asset name from build)

From repo root after a build:

```bash
./scripts/verify-assets.sh
```

Or against production (no local build):

```bash
./scripts/verify-assets.sh https://p3lending.space
```

The script will report whether the main JS asset returns JavaScript or HTML.

## Manual curl commands (post-deploy)

1. Open the live site and inspect the document in DevTools → Network; find the main script URL (e.g. `https://p3lending.space/assets/index-abc123.js`).

2. Run:

   ```bash
   curl -I "https://p3lending.space/assets/index-abc123.js"
   ```

3. Check the response:
   - `Content-Type: application/javascript` → OK.
   - `Content-Type: text/html` → fix Netlify redirects (ensure `/assets/*` passthrough comes before `/*` → `/index.html`).

Optional checks for other static types:

```bash
# CSS (replace with real filename from Network tab)
curl -I "https://p3lending.space/assets/index-xyz.css"

# Source map
curl -I "https://p3lending.space/assets/index-abc123.js.map"
```

All should return the appropriate `Content-Type` (e.g. `text/css`, `application/json` or similar for `.map`), not `text/html`.
