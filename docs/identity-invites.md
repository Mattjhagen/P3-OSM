# Netlify Identity Invite Debugging & Setup

This runbook covers the `Invite users` flow in Netlify Identity for `https://p3lending.space`.

## 1. Current Findings (Checked on February 18, 2026)

From live Netlify API inspection:

1. Identity service is enabled for site `p3-lending-protocol`.
2. Identity health endpoint is up:
   - `GET https://p3lending.space/.netlify/identity/health` returns `200`.
3. Identity config currently reports:
   - `config.site_url = https://precious-bonbon-9c0ca3.netlify.app`
   - `config.smtp.host = smtp.protonmail.ch`
   - `config.smtp.port = 587`
   - `config.disable_signup = true` (invite-only mode)

## 2. Most Likely 500 Causes for "Invite users"

| Cause | Why it can produce 500 | What to check |
|---|---|---|
| SMTP auth/relay failure | Invite flow sends email immediately; provider/auth failures surface as server errors | Identity -> Emails provider credentials and provider logs |
| Site URL mismatch | Invite links may be generated for the wrong base URL | Identity config `site_url` should match production URL |
| Template problems | Missing/broken invite template can break render/send | Template path exists and includes token placeholders |

In this repo, a concrete template issue was fixed: Identity templates were configured to `/email_*.html`, but those files were not guaranteed in the publish output. The fix ships these files from `public/` so they are present in `dist/` on deploy.

## 3. Required Netlify Identity Configuration

1. Netlify UI -> `Site settings` -> `Identity` -> `Enable Identity` must be on.
2. `Registration preferences`:
   - `Invite only` for closed beta, or
   - `Open` for self-signup.
3. Identity Email provider must be valid and reachable from Netlify cloud.
4. Identity `Site URL` should be your production URL (`https://p3lending.space`), and test/deploy-preview URLs must be listed in allowed redirects if used.
5. Invite template should be non-empty and include a token placeholder in the URL.

## 4. Proton Note (Important)

1. If you use Proton Bridge with `localhost` / `127.0.0.1`, Netlify cannot reach it (cloud service cannot connect to your local machine).
2. If using Proton SMTP endpoints (for example `smtp.protonmail.ch`), verify you are using a valid SMTP credential/token accepted by Proton for third-party SMTP submission.
3. For lowest-friction testing, use a cloud SMTP provider that is known to work from hosted services (Postmark, Mailgun, SES, SendGrid when available).

## 5. Repo-Level Notes

1. The SPA fallback in `netlify.toml` is present and valid.
2. Netlify reserves `/.netlify/*` paths. Do not add redirect rules that target or rewrite `/.netlify/*`.
3. Identity email templates are now shipped from `public/` and deployed at:
   - `/email_invitation.html`
   - `/email_confirmation.html`
   - `/email_recovery.html`
   - `/email_change.html`

## 6. Smoke Test

Use the script:

```bash
bash /Users/matt/Desktop/P3-Lending-Protocol2-main/scripts/identity-invite-smoke.sh
```

The script checks:

1. `/.netlify/identity/health` response.
2. Identity service instance status and key config fields.
3. Invite template path availability from the live site.
4. Recent Netlify account audit events mentioning identity/invite actions.

## 7. Manual Invite Verification Checklist

1. In Netlify UI -> Identity -> Invite users, send invite to a fresh test email.
2. Confirm:
   - no dashboard 500 error,
   - invite appears in Identity users list,
   - email provider logs show accepted send.
3. If it still fails:
   - inspect SMTP provider auth/relay logs first,
   - verify Identity `site_url`,
   - rerun the smoke script and fix all warnings.

## 8. Env/Secret Requirements (Do Not Commit Secrets)

Identity SMTP credentials are configured in Netlify UI (not in this repo).

For this repo's Netlify function `netlify/functions/identity-signup.js`, these env vars are required in Netlify:

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY` (preferred)
3. `SUPABASE_ANON_KEY` (fallback only)

These function env vars do not control Identity invite email transport; they only affect waitlist sync on signup hooks.
