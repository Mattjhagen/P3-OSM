# Automated Test Suite — Results

**Date:** 2025-03-15  
**Branch / candidate:** Limited-beta candidate (current repo state).

---

## How to run the full suite

From repo root:

```bash
# Install dependencies (required once)
npm install
npm --prefix server install
npm --prefix contracts install
npx playwright install chromium

# Full CI sequence (lint, frontend tests, server tests, contracts, E2E)
npm run ci

# Or via Just
just test          # frontend + server + contract tests
just e2e           # Playwright E2E
just ci            # lint + build + tests + e2e
```

| Phase | Command | Scope |
|-------|---------|--------|
| Lint/typecheck | `npm run lint` | Frontend TypeScript |
| Frontend unit | `npm run test` | Vitest (tests/unit, components) |
| Backend unit/integration | `npm --prefix server run test` | Vitest (server/tests) |
| Contract tests | `npm --prefix contracts test` | Hardhat |
| E2E | `npm run e2e` | Playwright (chromium) |

---

## Recorded results (this run)

**Run date:** 2025-03-15. Commands executed from repo root after `npm install`, `npm --prefix server install`, `npm --prefix contracts install`, `npx playwright install chromium`.

| Suite | Pass | Fail | Skip | Notes |
|-------|------|------|------|--------|
| Frontend lint | 0 | 1 | 0 | `npm run lint` fails: TS errors (ImportMeta.env, AuthCallbackPage isManualLinkFlow/linkedProvider, backendService fetchWithBase, chatCrypto BufferSource, @testing-library/react). Pre-existing. |
| Frontend unit | 91 | 0 | 0 | 25 test files. Vitest run; typecheck not enforced by test runner. |
| Backend unit/integration | 74 | 0 | 0 | 23 test files. Two tests fixed: payment-routes (add x-test-user-id for auth-required route), derivedFeaturesService (chain mock return values in beforeEach). |
| Contract tests | 10 | 0 | 0 | Hardhat; 10 passing. |
| E2E | 1 | 1 | 0 | smoke.spec: "landing page renders core beta messaging" passed; "first-time users see the pitch deck with investor actions" failed — getByRole('link', { name: 'Book Calendly Call' }) not found (timeout). Link exists in PitchDeck.tsx; may be visibility/timing. |

**CI:** `npm run ci` would fail at lint (typecheck). Frontend tests, server tests, contract tests, and one E2E test pass.

---

## Known test dependencies

- **Backend:** `NODE_ENV=test` is set in server/tests/setup.ts; some integration tests use `x-test-user-id` header for auth bypass in test only.
- **E2E:** Requires build and optional env (e.g. `VITE_SUPABASE_URL`, `VITE_BACKEND_URL`) for non-mocked runs; see playwright.config.ts.
- **Contracts:** Hardhat; may require local node or network config.

---

## Status

- **Pre-rollout:** Run the full suite before tagging limited-beta and record results in the table above.
- **CI:** GitHub Actions runs lint, frontend tests, server tests, contract tests, and E2E on push/PR (see .github/workflows/ci.yml).
