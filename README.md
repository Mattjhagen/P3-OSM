# P3 Lending Protocol

P3 Lending is a peer-to-peer lending marketplace that leverages AI for reputation scoring and risk analysis, allowing users to build credit through "social underwriting" rather than purely financial history.

## 🎨 Aesthetic & Design
The application features a high-contrast "Neon Green & Dark Zinc" aesthetic (inspired by Robinhood/Kalshi) designed for clarity and modern financial trust.

## 🚀 Quick Start

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Environment Setup**
    Create a `.env` file in the root directory (see `.env.example`):
    ```env
    API_KEY=your_google_genai_api_key_here
    GOOGLE_CLIENT_ID=your_google_cloud_client_id
    ```

3.  **Run Application**
    ```bash
    npm start
    ```

## 🧪 Standardized Local Workflow

The repository now includes a top-level `Justfile` to keep local and CI commands consistent.

1.  **Bootstrap everything**
    ```bash
    just bootstrap
    ```
2.  **Run full local stack**
    ```bash
    just dev
    ```
3.  **Run unit + integration suites**
    ```bash
    just test
    ```
4.  **Run Playwright smoke/e2e**
    ```bash
    just e2e
    ```
5.  **Run full CI sequence locally**
    ```bash
    just ci
    ```

Notes:
- `scripts/dev-up.sh` conditionally starts local Supabase/Anvil/Stripe listener only if those tools/configs are available.
- `just supabase-reset` will execute `supabase db reset` once a local Supabase project exists at `supabase/config.toml`.
- `just supabase-test` runs SQL RLS policy tests from `supabase/tests/rls.sql`.
- `supabase test db` will run SQL RLS tests from `supabase/tests/rls.sql` after local Supabase is running.
- Contract tests run from `contracts/` with `npm --prefix contracts test`.
- Frontend env validation now requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Backend env validation now requires `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

## Netlify Identity Invites

If Netlify Identity dashboard invites fail (for example generic 500 errors), use:

1. `docs/identity-invites.md`
2. `scripts/identity-invite-smoke.sh`

## Admin PWA Push Notifications

Admin push notifications are opt-in and device-specific.

- Android: supported in Chrome with standard web push.
- iOS: requires iOS 16.4+ and the app installed to Home Screen (standalone PWA mode).

Required environment variables:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` (example: `mailto:admin@p3lending.space`)
- `PUSH_NOTIFY_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

One-time VAPID key generation:

```bash
npx web-push generate-vapid-keys
```

Set keys in Netlify site environment. Do not expose `VAPID_PRIVATE_KEY` or `PUSH_NOTIFY_SECRET` to the client.

## Public Status Page

A public status view is available at `/status`.

- Data source: `/.netlify/functions/status_check`
- Poll interval: 20 seconds
- Includes service checks for:
  - Frontend (`FRONTEND_STATUS_URL`, defaults to `https://p3lending.space`)
  - Netlify Functions (`/.netlify/functions/ping`)
  - Supabase REST (`SUPABASE_URL` + `SUPABASE_ANON_KEY`, or `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`)
  - Optional backend (`BACKEND_URL` or `VITE_BACKEND_URL` or `RENDER_API_BASE`)

If Supabase env vars are missing, status returns a degraded `supabaseRest` entry with `error: "missing_env"` instead of failing the whole status payload.

## Customer Support Chat v1

Customer support chat now supports:

- FAQ/context answers about P3 (borrowing, investing, fees, waitlist, security)
- Safe account-change proposals with explicit user confirmation:
  - `display_name`
  - `phone`
  - notification preferences (`email_opt_in`, `sms_opt_in`)
- Automatic fallback ticket creation when AI is unavailable or handoff is required

Safety restrictions:

- Chat will not execute money movement, loan approvals, credit-limit changes, trust-score overrides, payout address changes, or KYC decisions.
- Account changes execute server-side only after explicit `Confirm`.
- Action proposals and execution results are audit logged in `support_actions`.

---

## 🔐 Google OAuth Setup (Required for Login)

To enable the "Sign in with Google" button, you must set up a project in Google Cloud:

1.  Go to [Google Cloud Console](https://console.cloud.google.com/).
2.  **Create a Project**.
3.  Go to **APIs & Services > OAuth consent screen**.
    *   Select **External**.
    *   Fill in App Name and Support Email.
    *   Save.
4.  Go to **Credentials > Create Credentials > OAuth client ID**.
    *   Type: **Web application**.
    *   **Authorized JavaScript origins**: `http://localhost:5173`
    *   **Authorized redirect URIs**: `http://localhost:5173`
5.  Copy the **Client ID** and paste it into your `.env` file as `GOOGLE_CLIENT_ID`.

---

## 💳 Stripe Integration Guide

To enable Fiat on-ramping or loan repayments via credit card/ACH, integrate Stripe.

**⚠️ Important:** Stripe integration requires a backend server to securely generate `client_secret` keys. Do not perform administrative Stripe operations purely on the client side.

### 1. Architecture Overview
1.  **Frontend**: User clicks "Repay".
2.  **Frontend**: Calls Backend `/api/create-payment-intent` with amount.
3.  **Backend**: Calls Stripe API to create intent, returns `client_secret`.
4.  **Frontend**: Uses `client_secret` to render `<PaymentElement />`.
5.  **Stripe**: Processes payment and sends Webhook to Backend.
6.  **Backend**: Webhook updates Loan Status to `REPAID` in database.

### 2. Frontend Setup

**Install Libraries:**
```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

**Initialize Stripe:**
```tsx
// services/stripeService.ts
import { loadStripe } from '@stripe/stripe-js';

export const stripePromise = loadStripe('pk_test_YOUR_PUBLISHABLE_KEY');
```

**Create Payment Modal Component:**
```tsx
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const CheckoutForm = ({ clientSecret }) => {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: "https://your-site.com/success" },
    });
    // Handle error or success
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button disabled={!stripe}>Submit Payment</button>
    </form>
  );
};
```

### 3. Webhook Handling (Backend)
Listen for `payment_intent.succeeded` events to trigger the `handleRepayLoan` logic server-side.

```python
# Example Python/FastAPI handler
@app.post("/webhook")
async def stripe_webhook(request: Request):
    event = construct_event(await request.body(), sig_header, endpoint_secret)
    if event['type'] == 'payment_intent.succeeded':
        loan_id = event['data']['object']['metadata']['loan_id']
        # Update database: Set loan status to REPAID
        # Update database: Increment reputation score
    return {"status": "success"}
```
