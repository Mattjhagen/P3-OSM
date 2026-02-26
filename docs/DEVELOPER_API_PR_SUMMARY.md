# Developer API + Developer Console — PR Summary

## PR Summary

This PR adds a B2B Developer API and Developer Console for the P3 Lending Protocol:

- **API key auth:** Keys are stored as prefix + SHA-256 hash (with pepper); raw key is shown only once at creation. Scopes and per-key rate limits (RPM/RPD) are enforced.
- **Reputation API:** Public B2B endpoints under `/api/v1/reputation` for score (by `user_id`, by `address`, batch, history), protected by API key and scope `score:read` / `score:history`.
- **Request logging:** Every Developer API request is logged to `api_key_usage`; security events (key created/revoked, auth failure, rate-limited) to `api_audit_logs`.
- **Portal:** Developer section at `/developers` with Keys (create/revoke), Usage, Audit logs, and a link to the docs site. All behind Supabase auth and org roles (only owner/admin manage keys and see audit).
- **Docs site:** Standalone static site in `apps/developer-docs` for `developers.p3lending.space` (Quickstart, Auth, Endpoints, Errors, Rate limits; optional link to OpenAPI JSON).
- **Deployment docs:** Netlify + Cloudflare DNS for `developers.p3lending.space` and for `api.p3lending.space` (Cloud Run or Render).

**Stack:** Netlify (portal + docs), Cloudflare (DNS), Supabase (DB/auth), API on Google Cloud Run and/or Render.

---

## File Tree of Changes

```
supabase/migrations/
  20260225000100_developer_api_orgs_keys.sql    # orgs, org_members, api_keys, api_key_usage, api_audit_logs + RLS

server/src/
  config/env.ts                                 # API_KEY_PEPPER, RATE_LIMIT_REDIS_URL, REPUTATION_ENRICHMENT_ENABLED
  config/config.ts                             # developerApi config
  types/express.d.ts                            # req.apiKey
  middleware/
    apiKeyAuth.ts                              # Bearer key auth, requireScopes()
    developerRateLimiter.ts                    # per-key RPM/RPD (in-memory)
  modules/reputation/
    types.ts
    fetchScoreInput.ts
    computeScore.ts
    index.ts
  routes/
    reputationRoutes.ts                        # GET/POST reputation under /api/v1/reputation
    developerRoutes.ts                         # GET/POST/DELETE /api/developer/keys, usage, audit
  controllers/developerController.ts           # getOrCreateOrg, getKeys, createKey, revokeKey, getUsage, getAudit
  services/developerApiLog.ts                  # logUsage, logAudit
  openapiSpec.ts                               # OpenAPI object
  index.ts                                     # mount reputation + developer routes, GET /docs/openapi.json

server/
  openapi.yaml                                 # OpenAPI YAML
  tests/unit/apiKeyAuth.spec.ts                # apiKeyAuth + requireScopes unit tests

components/DeveloperSettings.tsx              # Portal: Keys, Usage, Audit, Docs link
services/developerApiService.ts               # Portal API client for keys/usage/audit

apps/developer-docs/
  public/index.html                            # Static docs (Quickstart, Auth, Endpoints, Errors, Rate limits)
  netlify.toml                                 # publish = "public", redirects
  package.json

docs/
  deployment/developers-subdomain.md           # Netlify + Cloudflare for developers.p3lending.space
  deployment/api-domain.md                     # api.p3lending.space, CORS, env vars
  DEVELOPER_API_PR_SUMMARY.md                  # This file
```

(App integration: `App.tsx` — Developers nav item, view `developers`, `<DeveloperSettings />`.)

---

## Migration SQL

Migration file: **`supabase/migrations/20260225000100_developer_api_orgs_keys.sql`**

It creates:

- **orgs** — id, name, owner_user_id, created_at, updated_at
- **org_members** — org_id, user_id, role (owner | admin | developer | viewer)
- **api_keys** — org_id, name, key_prefix, key_hash, scopes[], status (active | revoked), rpm_limit, rpd_limit, created_at, revoked_at
- **api_key_usage** — api_key_id, path, status_code, latency_ms, created_at
- **api_audit_logs** — org_id, api_key_id, event_type, ip, user_agent, meta (jsonb), created_at

RLS:

- **orgs / org_members:** Members can read; only owner/admin can update org or manage members.
- **api_keys:** Members can read; only owner/admin can insert/update/delete (create/revoke keys).
- **api_key_usage:** Members can read (for their org’s keys); service role used for inserts from API.
- **api_audit_logs:** Only owner/admin can read; service role for inserts.

Apply with: `supabase db push` or run the migration file in the Supabase SQL editor.

---

## cURL Examples

Base URLs (replace with your deployed hosts):

- **Portal API (create/list keys):** `https://p3lending.space` or your app URL — use **Supabase JWT** as Bearer.
- **Developer API (reputation):** `https://api.p3lending.space` — use **API key** as Bearer.

### 1. Create an API key (Portal API)

Use the Supabase session access token (from the portal after login, or from Supabase Auth).

```bash
# Replace SUPABASE_ACCESS_TOKEN with the JWT from supabase.auth.getSession()
curl -s -X POST "https://p3lending.space/api/developer/keys" \
  -H "Authorization: Bearer SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Key","env":"live","scopes":["score:read","score:history"],"rpm_limit":60,"rpd_limit":10000}'
```

Response includes **`raw_key`** once — store it securely; it is not returned again.

```json
{"success":true,"data":{"id":"...","name":"My Key","key_prefix":"p3_live_abcd1234...","raw_key":"p3_live_abcdef1234567890...","scopes":["score:read","score:history"],"rpm_limit":60,"rpd_limit":10000,"created_at":"..."}}
```

### 2. Call Developer API with the API key

Use the **raw key** from step 1 as Bearer token for `/api/v1/*`.

**Health (no auth):**

```bash
curl -s "https://api.p3lending.space/health"
curl -s "https://api.p3lending.space/docs/openapi.json"
```

**Reputation by user_id:**

```bash
curl -s -H "Authorization: Bearer p3_live_YOUR_FULL_KEY" \
  "https://api.p3lending.space/api/v1/reputation/score?user_id=USER_UUID"
```

**Reputation by wallet address:**

```bash
curl -s -H "Authorization: Bearer p3_live_YOUR_FULL_KEY" \
  "https://api.p3lending.space/api/v1/reputation/score/by-wallet?address=0x..."
```

**Batch scores:**

```bash
curl -s -X POST "https://api.p3lending.space/api/v1/reputation/score/batch" \
  -H "Authorization: Bearer p3_live_YOUR_FULL_KEY" \
  -H "Content-Type: application/json" \
  -d '{"user_ids":["uuid1","uuid2"]}'
```

**Score history (requires scope score:history):**

```bash
curl -s -H "Authorization: Bearer p3_live_YOUR_FULL_KEY" \
  "https://api.p3lending.space/api/v1/reputation/score/history?user_id=USER_UUID&from=2025-01-01&to=2025-12-31"
```

---

## Netlify + Cloudflare DNS Instructions

### developers.p3lending.space (docs site)

- **Netlify:** New site from this repo; **Base directory** = `apps/developer-docs`, **Publish directory** = `public`. Add custom domain **developers.p3lending.space**. Note the Netlify subdomain (e.g. `something.netlify.app`).
- **Cloudflare (p3lending.space):**

| Type  | Name        | Content                    | Proxy   | TTL  |
|-------|-------------|----------------------------|---------|------|
| CNAME | developers  | \<your-site\>.netlify.app | DNS only or Proxied | Auto |

- **TLS:** Netlify issues cert for the custom domain; if Cloudflare proxy is On, use SSL/TLS **Full** or **Full (strict)**.

Full steps: **`docs/deployment/developers-subdomain.md`**.

### api.p3lending.space (API)

- **Backend:** Deploy the API to **Cloud Run** or **Render** and add custom domain **api.p3lending.space** in the provider’s dashboard. Note the CNAME target they give.
- **Cloudflare (p3lending.space):**

| Type  | Name | Content                         | Proxy   | TTL  |
|-------|------|---------------------------------|---------|------|
| CNAME | api  | \<cloud-run-or-render-target\> | Off or Proxied | Auto |

- **CORS:** Allow `Authorization`, `Content-Type`; origins in production should be restricted to your domains (e.g. `https://p3lending.space`, `https://developers.p3lending.space`).
- **Env on API host:** `API_KEY_PEPPER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; optional: `RATE_LIMIT_REDIS_URL`, `REPUTATION_ENRICHMENT_ENABLED`, `GEMINI_API_KEY`.

Full steps: **`docs/deployment/api-domain.md`**.

---

## Env vars (reference)

| Variable                     | Required | Description |
|-----------------------------|----------|-------------|
| API_KEY_PEPPER              | Yes      | Server-side pepper for hashing API keys. |
| RATE_LIMIT_REDIS_URL        | No       | Redis URL for distributed rate limiting (optional; in-memory used if unset). |
| REPUTATION_ENRICHMENT_ENABLED | No     | Default false. Enable Gemini enrichment if set. |
| GEMINI_API_KEY              | No       | Only if REPUTATION_ENRICHMENT_ENABLED is true. |
