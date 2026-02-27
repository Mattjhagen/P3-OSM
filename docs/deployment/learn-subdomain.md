# learn.p3lending.space — Consumer Learning Center (Netlify + Cloudflare)

This document describes how to deploy the **P3 Consumer Learning Center** as its own Netlify Site and map it to the `learn.p3lending.space` subdomain behind Cloudflare DNS.

---

## 1. Netlify site configuration

Create a **separate Netlify Site** that points at this repo and uses the `apps/consumer-learn` subfolder.

In the Netlify UI for the **learn** site:

- **Base directory:** `apps/consumer-learn`
- **Package directory:** `apps/consumer-learn`
- **Build command:** `echo "static"`
- **Publish directory:** `public`
- **Functions directory:** _(leave blank)_

Then, ensure the repo-local Netlify config matches (already committed):

```toml
# apps/consumer-learn/netlify.toml
[build]
  base = "."
  publish = "public"
  command = "echo \"static\""
```

This prevents the root `netlify.toml` (which builds the main SPA to `dist/`) from overriding the learn site.

### 1.1. No SPA rewrites

The learn site is **purely static**. There MUST NOT be any SPA rewrites that turn every path into `index.html`, or crawlers will see HTML instead of real `sitemap.xml` / `robots.txt`.

Confirm:

- There is **no** `_redirects` file in `apps/consumer-learn/public/`.
- `apps/consumer-learn/netlify.toml` does **not** define any `[[redirects]]` that rewrite `/*` to `/index.html`.

---

## 2. Public files and SEO

The learning center is served from `apps/consumer-learn/public/`.

Key files:

- `index.html`
- `getting-started/index.html`
- `borrowers/index.html`
- `lenders/index.html`
- `reputation-score/index.html`
- `safety/index.html`
- `privacy/index.html`
- `faq/index.html`
- `glossary/index.html`
- `robots.txt`
- `sitemap.xml`

`robots.txt` (already committed):

```text
User-agent: *
Allow: /
Sitemap: https://learn.p3lending.space/sitemap.xml
```

`sitemap.xml` (already committed) includes at least:

- `https://learn.p3lending.space/`
- `https://learn.p3lending.space/getting-started/`
- `https://learn.p3lending.space/borrowers/`
- `https://learn.p3lending.space/lenders/`
- `https://learn.p3lending.space/reputation-score/`
- `https://learn.p3lending.space/safety/`
- `https://learn.p3lending.space/privacy/`
- `https://learn.p3lending.space/faq/`
- `https://learn.p3lending.space/glossary/`

---

## 3. Netlify headers (security + caching)

`apps/consumer-learn/public/_headers`:

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

These headers are applied by Netlify at the edge and keep the site fast and secure while allowing HTML to be revalidated and static assets to be cached aggressively.

---

## 4. Custom domain (Netlify)

In the **learn** Netlify Site:

1. Go to **Site configuration → Domain management**.
2. Click **Add custom domain**.
3. Enter `learn.p3lending.space`.
4. Netlify will show a verification/target hostname like `p3-learn-site.netlify.app`.

You will use that value in Cloudflare as a CNAME.

---

## 5. Cloudflare DNS (DNS only)

In the Cloudflare zone for `p3lending.space`:

Create a CNAME record:

```text
Type:   CNAME
Name:   learn
Target: <learn-site>.netlify.app
Proxy:  DNS only (or proxied, either is acceptable)
TTL:    Auto
```

Replace `<learn-site>.netlify.app` with the exact value shown in Netlify.

Once DNS propagates, Netlify will automatically issue TLS for `https://learn.p3lending.space`.

---

## 6. Deploy and verify

In Netlify for the learn site:

1. Go to **Deploys**.
2. Click **Trigger deploy → Clear cache and deploy site**.

After the deploy succeeds and DNS has propagated, verify from a terminal:

```bash
curl -I https://learn.p3lending.space/robots.txt
curl -I https://learn.p3lending.space/sitemap.xml
curl -I https://learn.p3lending.space/
curl -I https://learn.p3lending.space/faq/
```

You should see `200` responses and appropriate `Content-Type` (`text/plain` for robots, `application/xml` for sitemap, `text/html` for pages).

---

## 7. Important warning

Do **NOT** add SPA-style rewrites such as:

```text
/*  /index.html  200
```

to the learn site. Doing so will cause `sitemap.xml`, `robots.txt`, and all deep links to be rewritten to `index.html`, which breaks SEO and crawler access. The main portal SPA can keep its own rewrites in the root `netlify.toml`; the learn site must remain purely static.

