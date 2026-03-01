# Netlify multi-site settings (monorepo)

This repo uses **separate Netlify Sites** for the main portal and for each subdomain:

- `p3lending.space` (main SPA, built from repo root with `dist/`)
- `learn.p3lending.space` (consumer learning center, static HTML)
- `blog.p3lending.space` (blog, static HTML)
- `developers.p3lending.space` (developer docs, static HTML)

The subdomain sites must point at their own subfolders so they publish from **`public/`** instead of the main portal `dist/`.

---

## Netlify UI settings (subdomain sites)

### LEARN — `learn.p3lending.space`

Netlify Site (for example `p3-learn`):

- **Base directory:** `apps/consumer-learn`
- **Package directory:** `apps/consumer-learn`
- **Build command:** `echo "static"`
- **Publish directory:** `public`
- **Functions directory:** _(leave blank)_
- Then: **Clear cache and deploy**

Repo config used by this site:

```toml
# apps/consumer-learn/netlify.toml
[build]
  publish = "public"
  command = "echo \"static\""
```

### BLOG — `blog.p3lending.space`

Netlify Site (for example `p3-blog`):

- **Base directory:** `apps/blog`
- **Package directory:** `apps/blog`
- **Build command:** `echo "static"`
- **Publish directory:** `public`
- **Functions directory:** _(leave blank)_
- Then: **Clear cache and deploy**

Repo config:

```toml
# apps/blog/netlify.toml
[build]
  publish = "public"
  command = "echo \"static\""
```

### DEVELOPERS — `developers.p3lending.space`

Netlify Site (for example `p3-developer-docs`):

- **Base directory:** `apps/developer-docs`
- **Package directory:** `apps/developer-docs`
- **Build command:** `npm run build`
- **Publish directory:** `dist`
- **Functions directory:** `netlify/functions` (or leave blank to use netlify.toml default)
- **Env:** Add in Site configuration → Environment variables:
  - `STRIPE_SECRET_KEY` (required for checkout)
  - `SUPABASE_URL` and `SUPABASE_ANON_KEY` (required for auth-gated checkout)
- Then: **Clear cache and deploy**

Repo config:

```toml
# apps/developer-docs/netlify.toml
[build]
  publish = "dist"
  command = "npm run build"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[[redirects]]
  from = "/api/create-checkout"
  to = "/.netlify/functions/create-checkout"
  status = 200
  force = true
```

> Important: Do **not** add SPA rewrites (`/* /index.html 200`) to these sub-sites. They must serve `sitemap.xml`, `robots.txt`, and `rss.xml` as real files, not as the SPA.

---

## Verifying Netlify is using the correct config

After triggering **Clear cache and deploy** for each subdomain site, check the deploy summary in Netlify:

- For **blog** deploys, the log should show:
  - `Config file: /opt/build/repo/apps/blog/netlify.toml`
  - `Publish directory: apps/blog/public`

- For **learn** deploys, the log should show:
  - `Config file: /opt/build/repo/apps/consumer-learn/netlify.toml`
  - `Publish directory: apps/consumer-learn/public`

If either site shows `Config file: /opt/build/repo/netlify.toml` or `Publish directory: dist`, the Base directory / Site settings are misconfigured and are using the main portal config instead of the app-specific config.

---

## Cloudflare DNS (summary)

For each subdomain, create **CNAME** records in the Cloudflare zone for `p3lending.space`:

- `learn` → `<p3-learn>.netlify.app` (DNS only)
- `blog`  → `<p3-blog>.netlify.app` (DNS only)
- `developers` → `<p3-developer-docs>.netlify.app` (DNS only)

Netlify will handle TLS for each custom domain once DNS is pointing at the correct `*.netlify.app` host.

