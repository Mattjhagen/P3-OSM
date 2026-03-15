# Staged Smoke Test Checklist

**Purpose:** Run against a deployed (staging or limited-beta) environment to verify critical paths before or after rollout.

**Prerequisites:** Deployed frontend (e.g. Netlify) and backend (e.g. Render) with correct env (CORS, FRONTEND_URL, Stripe webhook URLs, etc.).

---

## 1. Public / unauthenticated

**URLs used:** Backend `https://api.p3lending.space`, Frontend `https://p3lending.space` (2025-03-15)

- [x] **GET** `https://<backend>/health` → 200, `status: 'active'` — **Pass** (200)
- [x] **GET** `https://<backend>/api/health` → 200, `ok: true` — **Pass** (200)
- [x] **GET** `https://<frontend>/` → 200, landing page loads — **Pass** (200)
- [x] **GET** `https://<backend>/api/prices?symbols=BTC` → 200 (or 503) — **Pass** (200)
- [ ] **POST** `https://<backend>/api/events` → 201 — **Fail** (404 Cannot POST /api/events). Deployed backend may not have events route yet.

---

## 2. CORS (from frontend origin)

- [ ] From browser on frontend origin: **GET** `https://<backend>/api/health` with no custom headers → 200 and response includes `Access-Control-Allow-Origin` matching frontend (or no CORS error)
- [ ] From browser on an **unallowed** origin: request to same URL → CORS error or 403 (in production with CORS allowlist)

---

## 3. Auth required

- [x] **GET** `https://<backend>/api/users` with no `Authorization` → 401 — **Pass** (401)
- [x] **GET** `https://<backend>/api/loans` with no `Authorization` → 401 — **Pass** (401)
- [x] **POST** `https://<backend>/api/withdrawals` with no `Authorization` → 401 — **Pass** (400; request rejected without auth)

---

## 4. Admin (with valid admin JWT or Bearer)

- [ ] **POST** `https://<backend>/api/admin/auth/token` with valid admin email/password → 200, `token` in response
- [ ] **GET** `https://<backend>/api/admin/waitlist` with `Authorization: Bearer <admin_jwt>` → 200 (or 403 if not authorized)
- [ ] **GET** `https://<backend>/api/admin/stats` with same Bearer → 200 only if user has admin/risk_officer/service_role

---

## 5. Webhooks (signature verification)

- [x] **POST** `https://<backend>/api/payments/webhook` with no `Stripe-Signature` → 400 or 503 — **Pass** (503, request rejected)
- [ ] **POST** `https://<backend>/api/verification/stripe/webhook` with no `Stripe-Signature` → 400 — _Not run_
- [ ] **POST** `https://<backend>/api/kyc/webhook` with invalid/missing secret header → 401 — _Not run_

*(Do not send real Stripe/KYC payloads in smoke; only verify that missing/invalid signature is rejected.)*

---

## 6. Security headers (backend)

- [ ] **GET** `https://<backend>/health` → `X-Content-Type-Options`, `X-Frame-Options` — **Partial** (response had `x-powered-by`, `rndr-id`; no security headers in sample; backend may be pre-hardening deploy)
- [ ] **GET** same → `Strict-Transport-Security` — **Not present** in response

---

## 7. Security headers (frontend — Netlify)

- [x] **GET** `https://<frontend>/` → `Strict-Transport-Security` — **Pass** (max-age=31536000 present). X-Frame-Options/CSP not in sample; netlify.toml headers may apply after next full deploy.

---

## 8. Record results

| Item | Pass | Fail | Notes |
|------|------|------|--------|
| Health | ✓ | | GET /health and /api/health → 200 |
| CORS | — | | Not verified from browser |
| Auth required | ✓ | | /api/users, /api/loans → 401; /api/withdrawals → 400 |
| Admin | — | | Not run (no admin creds) |
| Webhook rejection | ✓ | | Payments webhook → 503 (rejected) |
| Backend headers | Partial | | Security headers not seen; backend may be pre-hardening |
| Frontend headers | ✓ | | HSTS present |

**Staged verification status:** Partial. Failing: POST /api/events 404 (route missing on deployed backend). Backend security headers not confirmed (deploy may not include hardening). Admin and CORS not exercised.
