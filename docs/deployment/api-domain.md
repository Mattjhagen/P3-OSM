# api.p3lending.space — API base URL and DNS

Recommended base URL for the B2B Developer API: **https://api.p3lending.space**

## 1. Backend hosting (Cloud Run or Render)

The P3 backend (Express) can run on:

- **Google Cloud Run** — containerized; use a service URL or custom domain.
- **Render** — Web Service; use the default `*.onrender.com` URL or attach a custom domain.

## 2. DNS (Cloudflare)

In the Cloudflare dashboard for **p3lending.space**:

### If using Cloud Run (custom domain)

1. In **Cloud Run** → your service → **Manage custom domains** → add `api.p3lending.space`. Google will show the target (e.g. `ghs.googlehosted.com` or a CNAME target).
2. In **Cloudflare**:

| Type  | Name | Content                         | Proxy | TTL  |
|-------|------|---------------------------------|-------|------|
| CNAME | api  | \<cloud-run-domain-target\>    | Off or Proxied | Auto |

Use the exact target Cloud Run provides (e.g. `xxxx.run.app` or the custom domain verification target).

### If using Render

1. In **Render** → your Web Service → **Settings** → **Custom Domain** → add `api.p3lending.space`. Render will show the target (e.g. `api.p3lending.space` with a CNAME to a Render host).
2. In **Cloudflare**:

| Type  | Name | Content                    | Proxy | TTL  |
|-------|------|----------------------------|-------|------|
| CNAME | api  | \<render-assigned-target\> | Off or Proxied | Auto |

Render’s dashboard shows the exact CNAME target (e.g. `your-svc.onrender.com`).

## 3. TLS

- **Cloud Run / Render:** Both provide TLS on their default hostnames. For a custom domain they typically require you to add a CNAME (and sometimes a TXT for verification).
- **Cloudflare:** If proxy is **On**, set **SSL/TLS** to **Full** or **Full (strict)** so traffic to the origin is HTTPS.

## 4. CORS and headers

The API must allow:

- **Origin:** Your frontend (e.g. `https://p3lending.space`, `https://developers.p3lending.space`) or `*` for public docs.
- **Headers:** `Authorization`, `Content-Type`.
- **Methods:** `GET`, `POST`, `OPTIONS`.

The existing backend uses `cors()`. For production, restrict `origin` to your known domains. The Developer API expects:

- **Authorization:** `Bearer <api_key>` (required for `/api/v1/*`).

No other special headers are required for key auth.

## 5. Verify

```bash
# Health (no auth)
curl -s https://api.p3lending.space/health
# or
curl -s https://api.p3lending.space/api/health

# OpenAPI spec (no auth)
curl -s https://api.p3lending.space/docs/openapi.json

# Reputation (requires valid API key)
curl -s -H "Authorization: Bearer p3_live_..." \
  "https://api.p3lending.space/api/v1/reputation/score?user_id=UUID"
```

## 6. Env on API host

Ensure the API server has:

- `API_KEY_PEPPER` — required for API key verification.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — for DB and key lookup.
- Optional: `RATE_LIMIT_REDIS_URL`, `REPUTATION_ENRICHMENT_ENABLED`, `GEMINI_API_KEY`.
