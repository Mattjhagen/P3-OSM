# developers.p3lending.space — Netlify + Cloudflare DNS

Deploy the developer docs site to Netlify and point the subdomain via Cloudflare.

## 1. Netlify

### Option A: Deploy from this repo (subfolder)

1. In Netlify: **Add new site** → **Import an existing project** (this repo).
2. **Build settings:**
   - **Base directory:** `apps/developer-docs`
   - **Publish directory:** `public` (or leave default; ensure `netlify.toml` in that folder sets `publish = "public"`).
   - **Build command:** leave empty or `echo 'static'`.
3. **Domain:** Add custom domain `developers.p3lending.space` in **Domain settings** → **Add custom domain**.

### Option B: Separate Netlify site from `apps/developer-docs`

1. Create a new Netlify site; connect the same repo.
2. Set **Base directory** to `apps/developer-docs`.
3. Set **Publish directory** to `public`.
4. Add domain `developers.p3lending.space`.

Netlify will show a default subdomain (e.g. `random-name-123.netlify.app`) and optionally assign an SSL certificate for the custom domain.

## 2. Cloudflare DNS (DNS only)

In the Cloudflare dashboard for **p3lending.space**:

| Type  | Name        | Content                    | Proxy | TTL  |
|-------|-------------|----------------------------|-------|------|
| CNAME | developers  | \<your-site\>.netlify.app | Off (DNS only) or Proxied | Auto |

- **Content:** Use the Netlify-assigned hostname (e.g. `p3-developer-docs.netlify.app`). Find it in Netlify → **Domain management** → **Netlify subdomain**.
- **Proxy:** DNS only (grey cloud) is fine; if you proxy (orange), use **SSL/TLS** → **Full** or **Full (strict)** and ensure Netlify’s certificate is valid.

## 3. TLS

- **Netlify:** Issues and renews TLS for the custom domain once DNS is pointing to Netlify.
- **Cloudflare:** If proxy is enabled, set **SSL/TLS** to **Full** or **Full (strict)** so Cloudflare ↔ Netlify is HTTPS.

## 4. Redirect (optional)

To serve docs at the root of the subdomain:

- In `apps/developer-docs`, the single `public/index.html` is the docs page; no extra redirect needed.
- If you add more pages later, use Netlify `_redirects` or `netlify.toml` to map `/` to `/index.html` (already in the provided `netlify.toml`).

## 5. Verify

- Open `https://developers.p3lending.space` and confirm the docs load.
- Confirm links to `https://api.p3lending.space/docs/openapi.json` work from the docs site.
