# P3 Lending Protocol - AI Coding Agent Guide

## Architecture Overview

**P3 Lending** is a peer-to-peer lending marketplace with AI-powered reputation scoring and blockchain integration. It's a **monorepo** with three major parts:

- **Frontend** (root): React 18 + Vite + TypeScript + Tailwind
- **Backend** (`/server`): Express.js + Supabase + Node.js 20+
- **Smart Contracts** (`/contracts`): Hardhat + Ethers.js v6

**Key design principle**: Service layer abstraction via `/client-services` (frontend APIs) and `/services` (backend logic) isolates business logic from UI/routing.

## Essential Workflows

Use the **Justfile** (not raw npm scripts) for consistent development:

```bash
just bootstrap        # Install all dependencies (frontend/backend/contracts)
just dev             # Start full stack: frontend (port 5173) + backend + Supabase
just test            # Run all tests: Vitest (frontend/backend) + Hardhat (contracts)
just e2e             # Playwright tests against preview build (port 4173)
just ci              # Full CI sequence (lint, build, test)
```

**Environment setup**: Create `.env` at root with:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (frontend)
- `VITE_API_KEY` (Gemini API for AI features)
- Backend env (in `/server/.env`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_KEY`

## Authentication Flow (Critical)

**Primary**: Supabase Auth (PKCE flow, persistent sessions)
- **Fallback**: Netlify Identity Widget
- **Routes**: `/auth/invite` (onboarding), `/auth/callback` (post-auth)
- **Supports**: Magic Link, Google OAuth, Apple OAuth

See `supabaseClient.ts` and `docs/auth.md` for config. Auth flows are explicitly tested in `scripts/auth-smoke.sh`.

## Data & Types

All domain models in `types.ts`:
- `UserProfile`: borrower/lender with KYC tier, reputation score
- `LoanRequest` / `LoanOffer`: core marketplace entities
- `KYCTier` (0-3) / `KYCStatus`: compliance ladder
- `LoanStatus`: PENDING → MATCHED → ESCROW_LOCKED → ACTIVE → REPAID

## Service Layer Patterns

### Client-Side Services (`/client-services`)

Each service handles a specific domain:

- **`geminiService.ts`**: AI reputation analysis, risk scoring, compliance checks (OFAC/PEP screening via Gemini 2.0)
- **`contractService.ts`**: Ethers.js integration—funds loans via smart contract escrow
- **`walletService.ts`**: Web3 wallet integration (MetaMask, Coinbase Wallet)
- **`supabaseClient.ts`**: Auth + database queries (PKCE flow)
- **`security.ts`**: Input validation, rate limiting
- **`persistence.ts`**: LocalStorage abstraction for session state

**Pattern**: Import from `client-services/`, not direct from dependencies. Services export pure functions or singleton objects.

### Backend Services (`/services`)

Node.js equivalents in `/server/src/services`:
- Auth, email, payment (Stripe), admin operations
- Uses Supabase SDK with `SUPABASE_SERVICE_ROLE_KEY` for admin access

## Component Structure

`/components` follows feature-driven organization:

- **`LandingPage.tsx`**: Unauthenticated entry point
- **`Marketplace.tsx`**: Loan listings + matching
- **`LenderDashboard.tsx`** / **`ProfileSettings.tsx`**: Role-specific dashboards
- **`KYCVerificationModal.tsx`**: Compliance verification loop
- **`AdminDashboard.tsx`**: Admin-only interface (guarded in `App.tsx`)

**Pattern**: Components use hooks from `/hooks` and services from `/client-services`. State lifted to `App.tsx` for major flows (auth, profiles, loans).

## Web3 & Smart Contracts

Smart contract interactions flow through `contractService.ts`:

```typescript
// Ethers.js v6 pattern for browser wallet interaction
const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
await signer.sendTransaction(txData); // Triggers wallet popup
```

**Key variables**:
- `__P3_PROTOCOL_ADDRESS__` (injected by Vite): escrow contract address
- `__GEMINI_KEY__` (injected reversed by Vite): API key obfuscation

Contract tests in `/contracts/test` via Hardhat. Test network: Anvil/Hardhat local node.

## KYC & Compliance

AI-powered 4-tier system in `KYCVerificationModal.tsx`:

1. **Tier 0** (Unverified): Limited access
2. **Tier 1** (Basic): Public records eIDV + document upload
3. **Tier 2** (Verified): Enhanced KYC
4. **Tier 3** (Enhanced): Full compliance

`geminiService.ts` calls Gemini to simulate OFAC/PEP screening. In production, integrate real providers (e.g., Socure, Jumio).

## Testing Strategy

- **Unit tests**: Vitest in `tests/unit/` (test env: Node)
- **E2E tests**: Playwright in `tests/e2e/` (spins up preview build at port 4173)
- **DB tests**: SQL RLS policies in `supabase/tests/rls.sql` (run via `just supabase-test`)
- **Contract tests**: Hardhat in `/contracts/test`

**Run tests**:
```bash
npm run test              # Unit tests only
npm run test:watch       # Watch mode (fastest iteration)
npm run e2e              # Full E2E suite
npm run e2e-ui           # Debug E2E with UI
```

## Build & Deployment

- **Frontend**: `npm run build` → Vite output to `dist/`
- **Preview**: `npm run preview` (test build locally before deploy)
- **Backend**: `npm --prefix server build` → `dist/` via tsc
- **Production**: Netlify (frontend) + backend server deployment separate

**CI flow**: See Justfile `ci` target—mirrors: lint → build → test → e2e.

## Key File Locations

| Path | Purpose |
|------|---------|
| `App.tsx` | Main router & top-level state |
| `types.ts` | Shared domain models |
| `supabaseClient.ts` | Supabase config + auth setup |
| `client-services/` | Frontend API abstraction layer |
| `/services` (root) | Utilities (not services; see `client-services/` for main ones) |
| `components/` | React components by feature |
| `vite.config.ts` | Build config (Vite + env variable injection) |
| `/server/src` | Backend Express app & services |
| `/contracts` | Hardhat project + ABI artifacts |

## Conventions & Patterns

1. **Env variables**: Frontend uses `VITE_*` prefix (injected at build time). Backend uses plain names from `process.env`.
2. **Async operations**: Wrap in try-catch; log errors via `console.error` or `pino` logger (backend).
3. **Component state**: Use React hooks; lift shared state to App or context if used across multiple views.
4. **Service functions**: Pure or singleton—avoid classes unless complex state required.
5. **TypeScript**: Strict mode enabled; always type function parameters + return types.
6. **Git**: No duplicated files (e.g., `Component 2.tsx`). Clean up before PR.
