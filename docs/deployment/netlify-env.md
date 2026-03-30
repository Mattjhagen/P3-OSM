# Netlify environment variables (p3lending.space)

The main SPA is built with Vite and deployed to Netlify. These variables are **build-time**: they are inlined into the client bundle when Netlify runs `npm run build`. Set them in the Netlify UI so production builds include the correct values.

## Where to set them

1. **Netlify** → your site (e.g. **p3-lending-protocol**) → **Site configuration** → **Environment variables**.
2. Add each variable for **Build** (or “All” if you also use them in Netlify functions).
3. For **Production** (and optionally **Branch deploys** / **Deploy Previews**), add the same keys with the right values.
4. **Trigger a new deploy** after saving (Build & deploy → **Trigger deploy** → **Deploy site**). Existing deploy artifacts do not pick up new env vars.

## Variables that clear “Operational Alerts”

| Variable | Purpose | Alert if missing |
|----------|---------|-------------------|
| `VITE_API_KEY` | Gemini API key (AI risk analysis, chat). Also accepts `API_KEY` or `GEMINI_API_KEY` in vite.config. | “Gemini API Key is missing” |
| `VITE_IDSWYFT_API_KEY` | Idswyft API key for identity verification. | “Idswyft API Key is missing” |

- `VITE_IDSWYFT_SANDBOX` – Set to `true` for sandbox mode.
- `VITE_COINGECKO_API_KEY` – CoinGecko for market data (optional).
- `VITE_OPENAI_API_KEY` – OpenAI for ops/Codex (optional).

## Security notes

- **Do not commit** real keys to the repo. Use Netlify’s **Environment variables** (or **Sensitive variable** / **Secret** where available).
- `VITE_*` values are embedded in the client bundle and are visible to anyone who inspects the built JS. Use them only for keys that are safe to expose (e.g. Idswyft API key, publishable keys). Keep server-only secrets (e.g. Stripe secret, API key pepper) on the backend and out of Netlify frontend env.

## After configuring

Redeploy the site. The Platform Overview “Operational Alerts” should no longer show “Gemini API Key is missing” or “Idswyft API Key is missing” once the new build is live.
