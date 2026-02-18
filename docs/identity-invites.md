# Netlify Identity Invite Debugging & Setup

This runbook covers the `Invite users` flow in Netlify Identity for `https://p3lending.space`.

## 0. Production Verification Record (February 18, 2026)

The template fix is deployed and verified in production.

### Verified in production

1. Template endpoints are served from PROD and include `{{ .Token }}`:
   - `https://p3lending.space/email_invitation.html`
   - `https://p3lending.space/email_confirmation.html`
   - `https://p3lending.space/email_recovery.html`
   - `https://p3lending.space/email_change.html`
2. Identity health is live and healthy:
   - `GET https://p3lending.space/.netlify/identity/health` -> `HTTP/2 200`
3. Smoke script against PROD passed with warnings:
   - `site_url` currently `https://precious-bonbon-9c0ca3.netlify.app` (mismatch)
   - `smtp.host` currently `smtp.protonmail.ch`

No auth-provider code changes were made in this step. Remaining blockers are Netlify UI configuration and/or SMTP relay behavior.

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

## 3.1 Netlify UI: Fix Identity site_url + template paths

Use this exact click path in Netlify:

1. Open project dashboard:
   - `https://app.netlify.com/projects/p3-lending-protocol`
2. Go to:
   - `Project configuration` -> `Identity` -> `Emails`
3. In `Outgoing email address` section:
   - Select `Configure`
   - Find field labeled `Site URL`
   - Set to exactly: `https://p3lending.space`
   - Save
4. In `Templates` section on the same `Identity > Emails` page, configure each template path:
   - `Invitation template` -> `/email_invitation.html`
   - `Confirmation template` -> `/email_confirmation.html`
   - `Recovery template` -> `/email_recovery.html`
   - `Email change template` -> `/email_change.html`
   - Save each template configuration
5. Optional sanity check from UI:
   - `Project configuration` -> `Identity` -> `Users` -> `Invite users` should still be available.

Field labels and path naming above follow Netlify docs references:
- `Project configuration > Identity > Emails > Outgoing email address`
- `Project configuration > Identity > Emails`

## 4. Proton Note (Important)

1. If you use Proton Bridge with `localhost` / `127.0.0.1`, Netlify cannot reach it (cloud service cannot connect to your local machine).
2. If using Proton SMTP endpoints (for example `smtp.protonmail.ch`), verify you are using a valid SMTP credential/token accepted by Proton for third-party SMTP submission.
3. For lowest-friction testing, use a cloud SMTP provider that is known to work from hosted services (Postmark, Mailgun, SES, SendGrid when available).

## 4.1 Re-test Invites (2-minute checklist after UI update)

After updating `site_url` and template paths in Netlify UI:

1. Open:
   - `Project configuration` -> `Identity` -> `Users`
2. Select:
   - `Invite users`
3. Invite a fresh test email address (not previously invited).
4. Confirm all three:
   - No `500` error in the Netlify UI
   - Invite email is received
   - Email link opens your app on `https://p3lending.space` with token fragment (for example `#invite_token=...`)
5. If any error occurs, capture and store:
   - `error_id` shown in Netlify UI
   - timestamp (with timezone)
   - matching row in `Project configuration` -> `Identity` -> `Identity audit log`

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

## 7.1 SMTP fallback plan (documentation only; no code changes)

If invites still return `500` after `site_url` and template paths are correct, treat SMTP as the primary suspect.

Recommended temporary providers for beta invite mail:

1. Postmark
2. Mailgun
3. AWS SES

Netlify Identity SMTP fields you need from provider docs:

1. `SMTP host`
2. `SMTP port` (`587` for STARTTLS, `465` for implicit TLS)
3. `SMTP username`
4. `SMTP password` or API token
5. `From` address (verified sender/domain)
6. TLS mode (`secure` true/false depending on port)

Expected outcome after SMTP is valid:
- `Invite users` succeeds without `500`
- invite email is delivered
- `Identity audit log` shows invite action without downstream delivery failures

## 8. Env/Secret Requirements (Do Not Commit Secrets)

Identity SMTP credentials are configured in Netlify UI (not in this repo).

For this repo's Netlify function `netlify/functions/identity-signup.js`, these env vars are required in Netlify:

1. `SUPABASE_URL`
2. `SUPABASE_SERVICE_ROLE_KEY` (preferred)
3. `SUPABASE_ANON_KEY` (fallback only)

These function env vars do not control Identity invite email transport; they only affect waitlist sync on signup hooks.
