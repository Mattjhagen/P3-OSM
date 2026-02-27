# Netlify settings for learn.p3lending.space and blog.p3lending.space

This document captures the exact Netlify UI settings required for the **learn** and **blog** static sites in the monorepo. Each site is its own Netlify project and reads from its own subfolder.

---

## LEARN (p3-learn Netlify site)

Use these values in the Netlify UI for the site that will serve `https://learn.p3lending.space`:

- **Base directory:** `apps/consumer-learn`
- **Package directory:** `apps/consumer-learn`
- **Build command:** `echo "static"`
- **Publish directory:** `public`
- **Functions directory:** _(blank)_
- Then: **Clear cache and deploy**

The corresponding repo file is:

```toml
# apps/consumer-learn/netlify.toml
[build]
  publish = "public"
  command = "echo \"static\""
```

There are **no redirects** configured for this site, and there is **no** `_redirects` file. This is intentional so that:

- `sitemap.xml` is served as XML
- `robots.txt` is served as plain text

---

## BLOG (p3-blog Netlify site)

Use these values in the Netlify UI for the site that will serve `https://blog.p3lending.space`:

- **Base directory:** `apps/blog`
- **Package directory:** `apps/blog`
- **Build command:** `echo "static"`
- **Publish directory:** `public`
- **Functions directory:** _(blank)_
- Then: **Clear cache and deploy**

The corresponding repo file is:

```toml
# apps/blog/netlify.toml
[build]
  publish = "public"
  command = "echo \"static\""
```

As with the learn site, there are **no SPA rewrites** and no `_redirects` file, so:

- `sitemap.xml` and `rss.xml` are served as XML
- `robots.txt` is served as plain text

---

## Cloudflare DNS

In the Cloudflare zone for `p3lending.space`, create the following CNAME records (DNS only):

- `learn.p3lending.space` → **CNAME** `learn` → `<p3-learn>.netlify.app`
- `blog.p3lending.space` → **CNAME** `blog` → `<p3-blog>.netlify.app`

Where:

- `<p3-learn>.netlify.app` is the Netlify default subdomain for the learn site.
- `<p3-blog>.netlify.app` is the Netlify default subdomain for the blog site.

Set the records to **DNS only** (no special proxying required), and let Netlify manage TLS certificates for the custom domains.

