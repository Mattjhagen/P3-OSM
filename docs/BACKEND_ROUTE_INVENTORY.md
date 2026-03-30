# Backend Route Inventory

**Generated:** 2025-03-15  
**Scope:** Express backend (server/src). Mount base: /api unless noted.

Legend: **Auth** = requireAuth (Bearer) or API key; **Role** = requireRoles or requireScopes; **Ownership** = controller enforces self or privileged for resource; **Validation** = server-side schema/input validation; **Rate** = rate limiter applied.

| Method | Path | Auth required | Role restriction | Ownership check | Request validation | Rate limit |
|--------|------|---------------|------------------|-----------------|--------------------|------------|
| GET | /health | No | — | — | — | — |
| GET | /api/health | No | — | — | — | — |
| GET | /docs/openapi.json | No | — | — | — | — |
| POST | /api/payments/webhook | No (Stripe signature) | — | — | — | — |
| POST | /api/verification/stripe/webhook | No (Stripe signature) | — | — | — | — |
| GET | /api/prices | No | — | — | Yes (query) | publicApiLimiter |
| GET | /api/users/ | Yes | — | Self (current user) | — | — |
| GET | /api/users/:id | Yes | — | Self or admin/risk_officer/service_role | — | — |
| GET | /api/users/:user_id/trust | Yes | — | Self or privileged | — | — |
| PATCH | /api/users/:id | Yes | — | Self or privileged | Yes (wallet_address) | — |
| GET | /api/loans | Yes | — | Via listLoansForUser(userId) | — | — |
| POST | /api/loans/request | Yes | — | Borrower = auth userId | Yes (amount_usd, interest_rate, etc.) | — |
| POST | /api/loans/repay | Yes | — | Borrower or lender only (service) | Yes (loan_id, amount, tx_hash) | — |
| POST | /api/verification/hash | No | — | — | Yes (snapshot_hash) | 60/15m |
| POST | /api/verification/kyc | Yes | — | — | Yes (body) | — |
| GET | /api/verification/status/:userId | Yes | — | Self or privileged | — | — |
| POST | /api/verification/attestation | Yes | — | Self or privileged (user_id) | Yes | — |
| POST | /api/verification/stripe/session | No | — | Optional auth; self check if auth | Yes | 30/15m |
| GET | /api/verification/stripe/session/:sessionId | No | — | Controller: self or privileged | — | sensitiveApiLimiter |
| GET | /api/verification/stripe/sessions | No | — | Controller: self or privileged | — | sensitiveApiLimiter |
| POST | /api/admin/auth/token | No | — | — | Yes (email, password) | 30/1m |
| GET | /api/admin/waitlist | No | Bearer/internal in service | — | — | 120/15m |
| GET | /api/admin/telemetry/events | No | Bearer/internal | — | — | 120/15m |
| GET | /api/admin/telemetry/features | No | Bearer/internal | — | — | 120/15m |
| POST | /api/admin/waitlist/sync | No | Bearer/internal | — | — | 30/15m |
| POST | /api/admin/waitlist/invite | No | Bearer/internal | — | Yes (waitlistId) | 30/15m |
| POST | /api/admin/waitlist/manual-invite | No | Bearer/internal | — | Yes | 30/15m |
| POST | /api/admin/waitlist/invite-next | No | Bearer/internal | — | Yes | 20/15m |
| GET | /api/admin/stats | Yes | admin, risk_officer, service_role | — | — | — |
| POST | /api/admin/override | Yes | admin, risk_officer, service_role | — | Yes | — |
| GET | /api/admin/audit | Yes | admin, risk_officer, service_role | — | Yes (query) | — |
| POST | /api/payments/deposit/create | Yes | — | userId = auth | Yes (amount) | publicApiLimiter |
| POST | /api/payments/create-checkout-session | Yes | — | userId = auth | Yes (amount) | publicApiLimiter |
| POST | /api/payments/donations/create-checkout-session | No | — | — | Yes | publicApiLimiter |
| GET | /api/payments/services/catalog | No | — | — | — | publicApiLimiter |
| POST | /api/payments/services/tax-quote | No | — | — | Yes | publicApiLimiter |
| POST | /api/payments/services/create-checkout-session | Yes | — | userId = auth | Yes | publicApiLimiter |
| POST | /api/waitlist/sync-netlify | Yes | — | — | — | 10/15m |
| POST | /api/waitlist/invite | No | Bearer/internal in service | — | — | 20/15m |
| POST | /api/waitlist/invite-batch | No | Bearer/internal | — | — | 5/15m |
| GET | /api/trading/prices | No | — | — | Yes (query) | publicApiLimiter |
| POST | /api/trading/orders/preview | Yes | — | userId = auth | Yes (symbol, amounts) | sensitiveApiLimiter |
| POST | /api/trading/orders/execute | Yes | — | userId = auth | Yes (symbol, amounts) | 30/15m |
| POST | /api/withdrawals | Yes | — | userId = auth | Yes (method, amountUsd, destination) | 20/15m |
| POST | /api/idswyft/initialize | Yes | — | userId = auth | Yes | 30/15m |
| POST | /api/idswyft/upload/front | Yes | — | userId = auth | Yes (file) | 20/15m |
| POST | /api/idswyft/upload/back | Yes | — | userId = auth | Yes (file) | 20/15m |
| POST | /api/idswyft/live-capture | Yes | — | userId = auth | Yes (file) | 20/15m |
| GET | /api/idswyft/status/:sessionId | Yes | — | userId = auth | — | 60/15m |
| POST | /api/kyc/start | No | — | — | — | 30/15m |
| GET | /api/kyc/status/:sessionId | No | — | — | — | 30/15m |
| POST | /api/kyc/webhook | No (webhook secret) | — | — | — | — |
| POST | /api/notifications/admin | Yes | — | — | Yes (category, subject, message) | 30/15m |
| GET | /api/compliance/features/status | Yes | — | Self or privileged (userId) | — | sensitiveApiLimiter |
| POST | /api/compliance/features/apply | Yes | — | Self or privileged (userId) | Yes (body) | 40/15m |
| GET | /api/compliance/disclosures | Yes | — | Self or privileged | — | sensitiveApiLimiter |
| GET | /api/compliance/disclosures/:id/download | Yes | — | Self or privileged | — | sensitiveApiLimiter |
| GET | /api/compliance/statements | Yes | — | Self or privileged | — | sensitiveApiLimiter |
| GET | /api/compliance/statements/:id/download | Yes | — | Self or privileged | — | sensitiveApiLimiter |
| POST | /api/compliance/statements/run/monthly | Yes | admin, service_role | — | — | 5/60m |
| POST | /api/compliance/statements/run/yearly | Yes | admin, service_role | — | — | 5/60m |
| GET | /api/v1/reputation/score | API key | score:read | — | Yes (user_id) | developerRateLimiter |
| GET | /api/v1/reputation/score/by-wallet | API key | score:read | — | Yes (address) | developerRateLimiter |
| POST | /api/v1/reputation/score/batch | API key | score:read | — | Yes | developerRateLimiter |
| GET | /api/v1/reputation/score/history | API key | score:history | — | Yes | developerRateLimiter |
| GET | /api/developer/keys | Yes | — | Org membership | — | — |
| POST | /api/developer/keys | Yes | — | Org membership | Yes (name, etc.) | 20/15m |
| DELETE | /api/developer/keys/:id | Yes | — | Org ownership of key | — | — |
| GET | /api/developer/plan | Yes | — | — | — | — |
| GET | /api/developer/usage | Yes | — | — | — | — |
| GET | /api/developer/audit | Yes | — | — | — | — |
| POST | /api/risk/analyze | No | — | — | — | sensitiveApiLimiter |
| POST | /api/events | No | — | — | Yes (event_name, anonymous_id, session_id, properties) | 300/60m |

---

## Write endpoints — validation and auth summary

| Endpoint | Auth enforced | Validation |
|----------|----------------|------------|
| POST /api/loans/request | Yes (borrowerId = auth) | amount_usd, interest_rate, lender_id, due_date |
| POST /api/loans/repay | Yes (userId = auth) | loan_id UUID, amount > 0, tx_hash |
| POST /api/verification/kyc | Yes | requested_tier, provider, raw_response |
| POST /api/verification/attestation | Yes + self/privileged | user_id, snapshot_hash, note |
| POST /api/admin/auth/token | N/A (login) | email, password |
| POST /api/admin/waitlist/invite | Bearer/internal | waitlistId |
| POST /api/admin/override | Yes + roles | body (risk_tier, etc.) |
| POST /api/payments/deposit/create | Yes (auth only) | amount |
| POST /api/payments/services/create-checkout-session | Yes (auth only) | serviceType, amountUsd |
| POST /api/waitlist/sync-netlify | Yes | — |
| POST /api/trading/orders/preview | Yes + ownership | symbol, amountUsd/amountFiat |
| POST /api/trading/orders/execute | Yes + ownership | symbol, amountUsd/amountFiat, etc. |
| POST /api/withdrawals | Yes + ownership | method, amountUsd, destination |
| POST /api/idswyft/* | Yes + ownership | userId, documents, etc. |
| POST /api/notifications/admin | Yes | category, subject, message |
| POST /api/compliance/features/apply | Yes + self/privileged | userId, feature, accepted, etc. |
| POST /api/compliance/statements/run/* | Yes + admin/service_role | — |
| POST /api/developer/keys | Yes | name, env, scopes |
| POST /api/risk/analyze | No | Body passed to service (rate-limited) |
| POST /api/events | No | event_name, anonymous_id, session_id, properties stripped |

All write endpoints that operate on a user resource enforce authenticated identity and (where applicable) ownership or privileged role.
