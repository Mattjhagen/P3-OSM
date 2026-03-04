# P3 Lending Protocol — CLAUDE.md

## Multi-Role Assistant

System role config: `config/roles/system.md`

**Available roles:** Secretary · Marketing · Code Auditor
**Activate with:** `ROLE: <name>`
**Add new roles:** Edit `config/roles/system.md` following the existing pattern.

---

## Project Overview

Peer-to-peer lending marketplace with AI reputation scoring, blockchain escrow, and KYC/compliance. Version 2.4.0.

- **Clearnet:** https://p3lending.space
- **Tor:** http://lwsieqoy6x2tv3mrqlfu6pkjqtyirn2j4oq3hz6y4yy7iz7v4ctqu6qd.onion
- **API:** https://api.p3lending.space

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript 5.2, Vite 5 |
| Styling | Tailwind CSS 3 |
| Backend | Express.js, Node 20, TypeScript |
| Database | Supabase (PostgreSQL + Auth + RLS + Realtime) |
| Blockchain | Ethers.js 6, Hardhat, Solidity 0.8.24, OpenZeppelin |
| Payments | Stripe (Payments, Identity, Payouts) |
| AI | Google GenAI (Gemini) — reputation scoring |
| Web3 Auth | SIWE (Sign-In with Ethereum), Coinbase Wallet SDK, WalletConnect |
| Testing | Vitest (unit), Playwright (E2E), Hardhat (contracts) |
| Deployment | Netlify (frontend + functions), Render (backend) |

---

## Directory Structure

```
P3-Lending-Protocol/
├── App.tsx / index.tsx         # Frontend entry & main router
├── components/                 # 70+ React components
├── services/                   # 30+ frontend service modules
├── hooks/                      # Custom React hooks
├── types.ts                    # Shared TypeScript interfaces
├── supabaseClient.ts           # Supabase client init
├── config.ts                   # WalletConnect/Infura config
├── server/                     # Express backend
│   └── src/
│       ├── index.ts            # Express app entry
│       ├── config/config.ts    # Centralized backend config
│       ├── controllers/        # 14 request handler files
│       ├── routes/             # 15 route definition files
│       ├── services/           # 22+ backend service files
│       ├── modules/reputation/ # Reputation scoring engine
│       └── middleware/         # Error handling, rate limiting
├── contracts/                  # Solidity smart contracts
│   └── contracts/
│       ├── P3LoanEscrow.sol
│       └── ReputationAnchorRegistry.sol
├── supabase/                   # Migrations, seed, RLS tests
├── netlify/functions/          # Serverless functions (webhooks, push, Slack)
├── apps/                       # blog, consumer-learn, developer-docs
├── tests/                      # e2e/ and unit/
├── scripts/                    # dev-up.sh, auth-smoke.sh, etc.
├── infra/                      # KYC/OpenKYC integration
└── docs/                       # Architecture, schema, specs
```

---

## Commands

### Frontend
```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build
npm run test         # Vitest
npm run e2e          # Playwright E2E
npm run lint         # TypeScript typecheck
npm run ci           # Full CI sequence
```

### Backend
```bash
cd server
npm run dev          # ts-node-dev (hot reload, port 5001)
npm run build        # Compile TypeScript
npm run test         # Vitest (unit + integration)
```

### Justfile (full stack)
```bash
just bootstrap       # Install all deps (frontend, server, contracts)
just dev             # Start full local stack
just test            # All tests
just ci              # Full CI
just supabase-reset  # Reset local DB
just supabase-test   # Run RLS policy tests
```

### Smart Contracts
```bash
npm --prefix contracts compile
npm --prefix contracts test
```

---

## Key Files

| File | Role |
|---|---|
| `App.tsx` | Main router, all pages and modals (~74k) |
| `types.ts` | Central type definitions (`UserProfile`, `LoanRequest`, `LoanOffer`, etc.) |
| `services/geminiService.ts` | Google GenAI — reputation scoring & compliance analysis |
| `services/persistence.ts` | Data persistence (localStorage + Supabase sync) |
| `services/paymentService.ts` | Stripe payment operations |
| `services/walletService.ts` | Blockchain utilities |
| `server/src/modules/reputation/` | Reputation scoring engine |
| `server/src/services/complianceService.ts` | AML/KYC compliance rules |
| `supabase/migrations/` | Database schema version history |
| `netlify/functions/` | Serverless: webhooks, push notifications, Slack |

---

## Architecture

```
Browser (React PWA)
    │
    ├── Netlify (frontend + serverless functions)
    │       └── Webhooks, Slack, Push Notifications
    │
    ├── Render API (Express, port 5001)
    │       └── Supabase (PostgreSQL + Auth + RLS + Realtime)
    │
    ├── Stripe (Payments, KYC Identity)
    │
    └── Ethereum (P3LoanEscrow, ReputationAnchorRegistry)
```

**Auth flow:** Supabase Auth (Magic Links, Google/Apple OAuth) as primary; Netlify Identity as legacy/invite fallback; SIWE for wallet-based auth.

**Reputation scoring:** Backend module aggregates repayment history, trust events, badges, mentorships → Gemini AI generates reasoning → score anchored on-chain optionally.

**Backend pattern:** Controller → Service → Supabase (no ORM).

**Frontend pattern:** Component → Hook → Service.

---

## Environment Variables

### Frontend (`.env`)
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_STRIPE_PUBLISHABLE_KEY
VITE_API_BASE_URL          # Backend URL (default: http://localhost:5001)
VITE_GEMINI_API_KEY
VITE_WALLETCONNECT_PROJECT_ID
VITE_INFURA_API_KEY
VITE_BETA_FEATURE_FLAGS    # JSON feature flags
```

### Backend (`server/.env`)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SMTP_HOST / SMTP_USER / SMTP_PASS
PLAID_CLIENT_ID / PLAID_SECRET
ETHEREUM_RPC_URL
GEMINI_API_KEY
```

---

## External Services

| Service | Usage |
|---|---|
| Supabase | Database, Auth, Realtime, RLS |
| Stripe | Payments, Identity KYC, Payouts |
| Google GenAI (Gemini) | Reputation scoring, compliance analysis |
| Plaid | Bank account linking, ACH |
| CoinGecko | Crypto market data |
| Bitstamp | Real-time trading (optional) |
| Slack | Admin notifications, slash commands |
| Nodemailer/SMTP | Transactional email |
| Infura | Ethereum RPC |

---

## Deployment

| Service | Host | Config |
|---|---|---|
| Frontend | Netlify | `netlify.toml` |
| Backend API | Render | `render.yaml` |
| Database | Supabase | `supabase/config.toml` |
| Docker | Any | `Dockerfile` |
| Cloud Run | GCP | `deploy_p3_api_cloudrun.sh` |

---

## Smart Contracts

- **P3LoanEscrow.sol** — Loan escrow and repayment logic
- **ReputationAnchorRegistry.sol** — On-chain reputation snapshot storage
- Compiler: Solidity 0.8.24, optimizer 200 runs
- Dev network: Anvil (Foundry) or Hardhat local node

---

## Testing

| Type | Framework | Location |
|---|---|---|
| Unit | Vitest | `tests/unit/`, `server/tests/unit/` |
| Integration | Vitest + Supertest | `server/tests/integration/` |
| E2E | Playwright | `tests/e2e/` |
| Contracts | Hardhat + Chai | `contracts/test/` |
| DB/RLS | Supabase SQL | `supabase/tests/rls.sql` |

CI sequence: lint → server build → frontend tests → backend tests → contract tests → E2E.

---

## Notable Patterns

- **Duplicate files** (`App 2.tsx`, `types 2.ts`, etc.) — these are stale copies; canonical versions have no number suffix
- **Feature flags** via `FeatureFlagService` and `VITE_BETA_FEATURE_FLAGS` env var
- **Security:** Supabase RLS, rate limiting, CORS, CSRF via SecurityService, Stripe webhook signature verification
- **PWA:** Service worker at `service-worker.js`, Tor mirror supported
- **No Redux/Zustand** — state managed via React hooks + Supabase Realtime
- **Node version:** `.nvmrc` pins 18.x (frontend), Render uses Node 20 (backend)
