# blog.p3lending.space — Blog (Netlify + Cloudflare)

This document describes how to deploy the **P3 Blog** as its own Netlify Site and map it to the `blog.p3lending.space` subdomain behind Cloudflare DNS.

---

## 1. Netlify site configuration

Create a **separate Netlify Site** that points at this repo and uses the `apps/blog` subfolder.

In the Netlify UI for the **blog** site:

- **Base directory:** `apps/blog`
- **Package directory:** `apps/blog`
- **Build command:** `echo "static"`
- **Publish directory:** `public`
- **Functions directory:** _(leave blank)_

The repo-local Netlify config for this site is:

```toml
# apps/blog/netlify.toml
[build]
  base = "."
  publish = "public"
  command = "echo \"static\""
```

This prevents the root `netlify.toml` (which builds the main SPA to `dist/`) from affecting the blog site.

### 1.1. No SPA rewrites

The blog site is **purely static**. There MUST NOT be any SPA redirects that send all paths to `index.html`.

Confirm:

- There is **no** `_redirects` file in `apps/blog/public/`.
- `apps/blog/netlify.toml` has **no** `[[redirects]]` section that rewrites `/*` to `/index.html`.

This ensures `rss.xml`, `sitemap.xml`, and `robots.txt` are served as real files.

---

## 2. Public files and SEO

The blog is served from `apps/blog/public/`.

Key files:

- `index.html` — blog index, links to posts and RSS.
- `posts/developer-api-launch/index.html`
- `posts/reputation-phase1/index.html`
- `tags/index.html`
- `robots.txt`
- `sitemap.xml`
- `rss.xml`

`robots.txt`:

```text
User-agent: *
Allow: /
Sitemap: https://blog.p3lending.space/sitemap.xml
```

`sitemap.xml` includes at least:

- `https://blog.p3lending.space/`
- `https://blog.p3lending.space/tags/`
- `https://blog.p3lending.space/posts/developer-api-launch/`
- `https://blog.p3lending.space/posts/reputation-phase1/`

`rss.xml` is a valid RSS 2.0 feed with at least two `<item>` elements for the two posts.

---

## 3. Netlify headers (security + caching)

`apps/blog/public/_headers`:

```text
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/*.html
  Cache-Control: public, max-age=0, must-revalidate

/*.png
  Cache-Control: public, max-age=31536000, immutable
/*.jpg
  Cache-Control: public, max-age=31536000, immutable
/*.jpeg
  Cache-Control: public, max-age=31536000, immutable
/*.svg
  Cache-Control: public, max-age=31536000, immutable
/*.css
  Cache-Control: public, max-age=31536000, immutable
/*.js
  Cache-Control: public, max-age=31536000, immutable
```

These headers give strong security defaults and long-lived caching for static assets, while keeping HTML revalidated on each request.

---

## 4. Custom domain (Netlify)

In the **blog** Netlify Site:

1. Go to **Site configuration → Domain management**.
2. Click **Add custom domain**.
3. Enter `blog.p3lending.space`.
4. Netlify will show a target such as `<blog-site>.netlify.app`.

You will point a CNAME at that host from Cloudflare.

---

## 5. Cloudflare DNS (DNS only)

In the Cloudflare zone for `p3lending.space`:

Create a CNAME record:

```text
Type:   CNAME
Name:   blog
Target: <blog-site>.netlify.app
Proxy:  DNS only (or proxied, either is acceptable)
TTL:    Auto
```

Replace `<blog-site>.netlify.app` with the exact subdomain that Netlify shows.

After DNS propagates, Netlify will issue TLS for `https://blog.p3lending.space`.

---

## 6. Deploy and verify

In Netlify for the blog site:

1. Go to **Deploys**.
2. Click **Trigger deploy → Clear cache and deploy site**.

After the deploy succeeds and DNS is live, verify from a terminal:

```bash
curl -I https://blog.p3lending.space/robots.txt
curl -I https://blog.p3lending.space/sitemap.xml
curl -I https://blog.p3lending.space/rss.xml
curl -I https://blog.p3lending.space/
curl -I https://blog.p3lending.space/posts/developer-api-launch/
```

You should see `200` responses and appropriate `Content-Type` for each file.

---

## 7. Important warning

Do **NOT** add SPA-style rewrites such as:

```text
/*  /index.html  200
```

to the blog site. Those rewrites will cause `rss.xml`, `sitemap.xml`, and `robots.txt` to be served as the homepage HTML, which breaks feed readers, SEO, and any automated clients that expect real XML or plain text.

The main P3 portal can keep its own SPA config in the root `netlify.toml`; the blog site must remain a static, file-based site.

