# Production Readiness Audit — Launch Readiness Report

**Date:** 2025-03-15  
**Scope:** P3 Lending Protocol (repo); production readiness per plan `production_readiness_audit_f5e55dac.plan.md`.  
**Assumptions:** No access to live production secrets or DB; E2E/verification where possible via code path review and CI.

---

## 1. Platform map

- **Frontend:** Single React SPA (Vite), pathname-based routing. Serves landing, client dashboard (borrow/lend/trade/mentorship/profile), auth flows, terms/privacy/risk/marketplace/beta/investors, KYC demo. Deploys to Netlify (`dist`).
- **Backend:** Express on Node 20, Render. Supabase (PostgreSQL + Auth + RLS) as primary store. In-process statement scheduler (ComplianceService).
- **Admin:** Same SPA; gated by `adminUser`. Login via AdminLoginModal (password → admin JWT or Supabase). Data via Netlify proxy → backend (waitlist, telemetry).
- **Developer portal:** `apps/developer-docs`; Supabase Auth; backend `/api/developer/*` uses Bearer (requireAuth). Reputation API uses API key (apiKeyAuth + requireScopes).
- **Landing/public:** Waitlist via Supabase RPC `create_waitlist_signup`; getWaitlistCount.

**Trust boundaries:** Public (landing, waitlist) → Client (SPA + Supabase Auth + backend API) → Backend (Express + Supabase service_role) → Admin (proxy + admin JWT).

---

## 2. Functional audit results

| Surface        | Verified (code path / CI) | Notes |
|----------------|---------------------------|--------|
| Landing        | Routes, waitlist RPC, CTA | E2E in CI; addToWaitlist → RPC confirmed in code. |
| Client         | Auth, profile, loans, verification | requireAuth on /api/users, /api/loans; PersistenceService + backend. |
| Admin          | Token, waitlist, telemetry, roles | Auth enforced in WaitlistAdminService.assertAuthorizedAdmin; requireRoles after requireAuth for stats/override/audit. |
| Developer      | Keys, plan, usage, audit  | requireAuth on all developer routes; reputation uses apiKeyAuth. |
| Backend        | Health, validation, CORS, rate limits | /health, /api/health; controller validation; CORS allowlist in prod; rate limiters on key routes. |

**Not verified live:** Stripe/Idswyft flows (no test mode run in this audit); KYC webhook with real provider.

---

## 3. Security audit results

| # | Severity  | Finding | Location | Status |
|---|-----------|--------|----------|--------|
| 1 | High      | Open redirect via `next` query param | AuthCallbackPage.tsx | **Fixed** — same-origin path only (isSafeRedirectPath). |
| 2 | Medium    | CORS allowed any origin | server/src/index.ts | **Fixed** — production allowlist (FRONTEND_URL + CORS_ALLOWED_ORIGINS). |
| 3 | Low       | POST /api/risk/analyze unauthenticated, abuse/cost | riskRoutes.ts | **Mitigated** — rate-limited (sensitiveApiLimiter), documented. |
| 4 | —         | Admin routes: auth before requireAuth | adminRoutes.ts | **Verified** — waitlist/telemetry/token use Bearer or internal auth in service. |
| 5 | —         | requireAuth test bypass (x-test-user-id) | auth.ts | **Accepted** — NODE_ENV=test only; CI/prod not test. |
| 6 | —         | Stripe webhooks | paymentController, verificationController | **Verified** — raw body + constructEvent; STRIPE_WEBHOOK_SECRET. |
| 7 | —         | IDOR / ownership | userController, loanService | **Verified** — isSelfOrPrivileged for user; loan repay restricted to borrower/lender. |
| 8 | —         | RLS / frontend writes | AuthCallbackPage, AuthInvitePage | **Verified** — RLS allows only auth.uid() or service_role. |
| 9 | —         | Developer API keys | apiKeyAuth | **Verified** — timing-safe compare, hashed storage, pepper. |

---

## 4. Fixes implemented

| File(s) | Change |
|---------|--------|
| `components/AuthCallbackPage.tsx` | Added `isSafeRedirectPath(next)`; resolveAuthDestination uses only same-origin paths (start with `/`, no `//` or `:`). |
| `tests/unit/authCallbackRouting.spec.ts` | Tests for unsafe `next` (https://evil.com, //evil.com, /path//double, javascript:) → fallback; safe paths → redirect. |
| `server/src/config/env.ts` | Added `CORS_ALLOWED_ORIGINS` (optional comma-separated). |
| `server/src/config/config.ts` | Added `corsAllowedOrigins` (production: FRONTEND_URL + CORS_ALLOWED_ORIGINS). |
| `server/src/index.ts` | CORS middleware uses allowlist in production when `config.corsAllowedOrigins` is set. |
| `server/src/routes/riskRoutes.ts` | POST /analyze gated with sensitiveApiLimiter; JSDoc updated (rate limit, response codes). |
| `server/src/services/loanService.ts` | Comment documenting ownership rule for repay (borrower or lender only). |
| `.github/workflows/ci.yml` | Added "Audit dependencies" (npm audit --audit-level=high for root, server, contracts); "Secret scan" (gitleaks-action, continue-on-error). |

---

## 5. Tests and scans run

- **Lint/typecheck:** `npm run lint` (frontend).
- **Unit tests:** Frontend Vitest; server Vitest (unit + integration).
- **Contract tests:** `npm --prefix contracts test`.
- **E2E:** Playwright (npm run e2e) in CI.
- **npm audit:** Added to CI; fails on high/critical for root, server, contracts.
- **Secret scan:** Gitleaks action added (optional, continue-on-error).
- **Security-related unit:** authCallbackRouting.spec.ts for redirect validation.

---

## 6. Route and middleware audit table

Prefix | Method | Path / pattern | Auth | Rate limit | Audience
|------|--------|----------------|------|------------|----------|
| — | GET | /health, /api/health | — | — | Public |
| — | GET | /docs/openapi.json | — | — | Public |
| /api/users | (all) | * | requireAuth | — | User |
| /api/loans | (all) | * | requireAuth | — | User |
| /api/verification | POST | /hash | — | — | Public |
| /api/verification | POST | /kyc, /attestation, GET /status/:userId | requireAuth | — | User |
| /api/verification | POST | /stripe/session | — | 30/15m | Public (then session) |
| /api/verification | GET | /stripe/session/:id, /stripe/sessions | — | sensitiveApiLimiter | User/session |
| /api/admin | POST | /auth/token | Bearer/internal in service | 30/1m | Admin |
| /api/admin | GET | /waitlist, /telemetry/* | Bearer/internal | 120/15m | Admin |
| /api/admin | POST | /waitlist/sync, /invite, manual-invite, invite-next | Bearer/internal | 30 or 20/15m | Admin |
| /api/admin | GET | /stats, /audit; POST /override | requireAuth + requireRoles(admin, risk_officer, service_role) | — | Admin |
| /api/payments | POST | /webhook | Stripe signature | — | Stripe |
| /api/payments | POST | /deposit/create, /create-checkout-session, donations, services/* | — | publicApiLimiter | Public/User |
| /api/waitlist | POST | /sync-netlify | requireAuth | 10/15m | User |
| /api/waitlist | POST | /invite, /invite-batch | — | 20 or 5/15m | Internal/Admin |
| /api/trading | GET | /prices | — | publicApiLimiter (also at app level for /api/prices) | Public |
| /api/trading | POST | /orders/preview, /orders/execute | — | sensitiveApiLimiter, 30/15m | User (controller may check auth) |
| /api/withdrawals | POST | / | — | 20/15m | User (controller auth) |
| /api/idswyft | POST | /initialize, /upload-*, /live-capture, GET /status/:sessionId | — | limiter | User (controller auth) |
| /api/kyc | POST | /start, /webhook; GET /status/:sessionId | — | limiter 30/15m, webhook none | Public / webhook |
| /api/notifications | POST | /admin | requireAuth | 30/15m | User |
| /api/compliance | GET/POST | /features/*, /disclosures/*, /statements/* | — | sensitiveApiLimiter or createRateLimiter | User (controller auth) |
| /api/v1/reputation | GET/POST | /score, /score/by-wallet, /score/batch, /score/history | apiKeyAuth + requireScopes | developerRateLimiter + quota | Developer (API key) |
| /api/developer | (all) | * | requireAuth | — | User |
| /api/risk | POST | /analyze | — | sensitiveApiLimiter | Public (rate-limited) |
| /api/events | POST | / | — | 300/60m | Public |

*Note:* Some routes enforce auth or authorization inside the controller (e.g. trading, withdrawals, compliance). Webhooks (Stripe, verification Stripe, KYC) use signature or secret validation.

---

## 7. Environment checklist

**Backend (Render)** — Required: `NODE_ENV`, `PORT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FRONTEND_URL` (production). Optional but recommended for production: `CORS_ALLOWED_ORIGINS` (comma-separated). Payments/KYC: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; Stripe Identity: `STRIPE_IDENTITY_*`. Admin: `ADMIN_JWT_SECRET`, `ADMIN_INTERNAL_BEARER`. Developer API: `API_KEY_PEPPER`. Optional: `RATE_LIMIT_REDIS_URL`, `ANTHROPIC_API_KEY`, `IDSWYFT_*`, `SMTP_*`, `NETLIFY_*`, `OPENKYC_*`, `BTC_*`, etc. (see `server/src/config/env.ts`).

**Frontend (Netlify)** — Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`. Optional: `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_GEMINI_API_KEY`, `VITE_WALLETCONNECT_PROJECT_ID`, `VITE_INFURA_API_KEY`, `VITE_BETA_FEATURE_FLAGS`. Only safe-to-expose keys must be `VITE_*`.

**Netlify functions (proxy, webhooks)** — `BACKEND_URL`, `ADMIN_INTERNAL_BEARER`, `ADMIN_JWT_SECRET`, Supabase keys as needed; webhook secrets where applicable.

---

## 8. Launch blockers

- **None** from this audit. Open redirect and CORS are fixed; risk route is rate-limited; loan repay and user updates have ownership checks; npm audit and optional secret scan are in CI.

---

## 9. Rollout readiness assessment

**Verdict: Ready for limited beta**, with production deployment gated on:

- Running migrations in order on production DB.
- Setting production env (see §7), including `FRONTEND_URL` and optional `CORS_ALLOWED_ORIGINS` for production CORS.
- Confirming Stripe/webhook secrets and KYC webhook secret for production.
- Addressing any high/critical npm audit findings that appear in CI (or accepting risk and relaxing audit step if necessary).

**Ready for production** after staged rollout (e.g. beta group first), monitoring, and confirmation that no critical issues remain.

---

## 10. Next deployment steps

1. **Migrations:** Run `supabase/migrations` in order against production; ensure no dev-only seed is required for prod.
2. **Env:** Apply backend and frontend env checklists (§7); ensure no test/localhost URLs in production.
3. **Order of operations:** Deploy backend (Render) with new CORS and env; deploy frontend (Netlify); verify health and CORS from frontend origin.
4. **Staged rollout:** Enable for beta users first; monitor errors and rate limits; then broaden access.
5. **Ongoing:** Fix or accept high/critical audit findings; run secret scan regularly; keep launch blockers list updated.

---

## 11. Pre-rollout deliverables (final pass)

| Document | Description |
|----------|-------------|
| [TEST_RESULTS.md](TEST_RESULTS.md) | How to run the full test suite; record pass/fail after running `npm run ci` or `just test` + `just e2e`. |
| [BACKEND_ROUTE_INVENTORY.md](BACKEND_ROUTE_INVENTORY.md) | Complete backend route table: method, path, auth, role, ownership, validation, rate limit. |
| [STAGED_SMOKE_CHECKLIST.md](STAGED_SMOKE_CHECKLIST.md) | Checklist to run against deployed (staging/beta) frontend and backend. |
| [FINAL_READINESS_REPORT.md](FINAL_READINESS_REPORT.md) | Final pre-rollout report: test results reference, staged verification, CSP/HSTS, webhook/cookie review, residual risks, verdict (limited beta / production). |
| [HARDENING_DELTA_REPORT.md](HARDENING_DELTA_REPORT.md) | Authorization, validation, rate limits, and security header changes from the hardening pass. |
