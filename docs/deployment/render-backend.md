# Render Backend Deployment

Backend (Express API) for `api.p3lending.space` deploys from the `server/` subdirectory.

## 1. GitHub connection

If the build fails with:

```
fatal: could not read Username for 'https://github.com': terminal prompts disabled
Unable to clone https://github.com/Mattjhagen/P3-Lending-Protocol
```

**Fix:** Render cannot access the repo.

1. **Dashboard** → your Web Service → **Settings** → **Build & Deploy**
2. Under **Repository**, click **Disconnect** then **Connect** to re-authorize GitHub
3. Ensure the GitHub account has access to `Mattjhagen/P3-Lending-Protocol`
4. If the repo is **private**, Render must be connected via GitHub OAuth with repo access

## 2. Root directory

The backend uses `server/` as its root. In Render:

- **Settings** → **Build & Deploy** → **Root Directory**: `server`

Or use the `render.yaml` blueprint (rootDir is set there).

## 3. Build & start commands

- **Build:** `npm install --include=dev && npm run build`
- **Start:** `npm start`

These run from `server/` when Root Directory is set.

## 4. Environment variables

Set in Render Dashboard → **Environment**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `API_KEY_PEPPER` (required for Developer API)
- `STRIPE_SECRET_KEY` (if using Stripe)
- `STRIPE_WEBHOOK_SECRET` (for webhooks)
- Any other vars from `server/.env.example`

## 5. Custom domain

**Settings** → **Custom Domains** → add `api.p3lending.space`, then add the CNAME in Cloudflare.
