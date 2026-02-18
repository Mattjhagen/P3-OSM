# Admin Waitlist Sync + Manual Invite

This document describes the secured waitlist admin flow used by **Admin Dashboard > Waitlist Queue**.

## 1) Source Of Truth

- Table: `public.waitlist` (Supabase)
- Queue order: `created_at ASC` (oldest first)
- Status model: `PENDING -> INVITED -> ONBOARDED`
- Summary RPC: `waitlist_count()` returns `{ total, pending, invited, onboarded }`

## 2) Architecture

- Browser calls Netlify function proxy:
  - `/.netlify/functions/admin_waitlist_proxy`
- Proxy verifies Supabase access token and email allowlist.
- Proxy injects internal bearer and forwards to Render:
  - `/api/admin/waitlist*`
- Render enforces internal bearer and employee role checks.

This keeps `ADMIN_INTERNAL_BEARER` server-side only.

## 3) Waitlist Admin Endpoints (Render)

- `GET /api/admin/waitlist`
  - Query: `page`, `pageSize`
  - Returns paged waitlist rows
- `POST /api/admin/waitlist/sync`
  - Body: `{ adminName }` (`adminEmail` is injected by proxy)
  - Returns queue counts
  - Status is read-only in sync
- `POST /api/admin/waitlist/invite`
  - Body: `{ adminName, waitlistId }`
  - Invites one pending row
- `POST /api/admin/waitlist/invite-next`
  - Body: `{ adminName, batchSize }`
  - Invites next N pending rows
- `POST /api/admin/waitlist/manual-invite`
  - Body: `{ adminName, email, name? }`
  - Create-or-reuse waitlist row by email, send invite, then set `INVITED` when send succeeds

## 4) Netlify Proxy Contract

Proxy URL format:

- `/.netlify/functions/admin_waitlist_proxy?path=/api/admin/waitlist&page=1&pageSize=500`

Rules:

1. `path` must start with `/api/admin/waitlist`
2. Allowed methods: `GET`, `POST`
3. JSON content type required for `POST` only
4. Validate Supabase token with:
   - `GET ${SUPABASE_URL}/auth/v1/user`
   - Headers:
     - `Authorization: Bearer <client_access_token>`
     - `apikey: <SUPABASE_ANON_KEY>`
     - `Accept: application/json`
5. Require authenticated email in `ADMIN_ALLOWED_EMAILS`
6. Forward query params as-is except `path`; proxy sets `adminEmail` from authenticated email
7. Proxy never forwards client `Authorization`
8. Proxy always forwards to Render with:
   - `Authorization: Bearer <ADMIN_INTERNAL_BEARER>`
9. Proxy must passthrough Render status + body verbatim (including 4xx/5xx)

## 5) Required Environment Variables

### Render

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_INTERNAL_BEARER` (required in production for `/api/admin/waitlist*`)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `SMTP_FROM_NAME` (optional)
- `SMTP_SECURE` (optional override; default still adapts by port)

### Netlify

- `RENDER_API_BASE` (example: `https://p3-lending-protocol.onrender.com`)
- `ADMIN_INTERNAL_BEARER` (same value as Render)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ADMIN_ALLOWED_EMAILS` (comma-separated)

## 6) Manual Invite Behavior

- Email lookup uses case-insensitive matching.
- If duplicates exist, oldest row is used and server logs a warning.
- Status rules:
  - `PENDING`: send email, then set `INVITED`
  - `INVITED`: re-send allowed, keep status `INVITED`
  - `ONBOARDED`: reject with `409`
- SMTP failures return `503`; status is not mutated.
- Invite URL format:
  - `${frontendUrl}/?waitlist_invite=<id>&email=<encoded_email>&ref=<encoded_referral_code_optional>`

## 7) Smoke Test Checklist

1. Open Admin Dashboard > Waitlist Queue.
2. Confirm queue rows load.
3. Click **Sync Waitlist** and verify totals refresh.
4. Click **Invite Next N** and verify rows move from `PENDING` to `INVITED`.
5. Use **Manual Invite** with a new email.
6. Confirm API returns success and row appears as `INVITED`.
7. Verify invite email is received.
8. Trigger a known failure case (onboarded user) and verify HTTP `409` is surfaced.
9. Trigger SMTP failure (test env) and verify HTTP `503` is surfaced.

## 8) Optional DB Hardening

Apply migration:

- `supabase/migrations/20260218190000_waitlist_email_lower_unique.sql`

It performs a preflight duplicate check and creates a case-insensitive unique index on `lower(btrim(email))` when safe.
