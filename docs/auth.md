# Supabase Auth Setup (Magic Link + Google + Apple)

This app uses Supabase Auth as the source of truth for login and session state.

## Required Supabase URL Configuration

Supabase Dashboard -> Authentication -> URL Configuration:

- Site URL: `https://p3lending.space`
- Allowed Redirect URLs:
  - `https://p3lending.space/auth/callback`
  - `https://p3lending.space/auth/invite`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/invite`

These redirects must match the `redirectTo`/`emailRedirectTo` values sent by the app.

## Frontend Auth Flows

- Magic link:
  - `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: <origin>/auth/callback } })`
- Google OAuth:
  - `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/auth/callback } })`
- Apple OAuth:
  - `supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: <origin>/auth/callback } })`

Post-auth callback route:

- `/auth/callback` verifies session, upserts user profile metadata, then routes:
  - first-time: `/onboarding`
  - returning: `/dashboard`

## Google Provider Setup

Supabase Dashboard -> Authentication -> Providers -> Google:

1. Copy the callback URL shown by Supabase.
2. In Google Cloud Console OAuth client, add that callback URL as an Authorized redirect URI.
3. Copy Google Client ID and Client Secret into Supabase Google provider settings.

## Apple Provider Setup (Web)

1. In Apple Developer, enable Sign in with Apple.
2. Create a Services ID for web sign-in.
3. Configure domain/return URL using the callback URL shown in Supabase Apple provider settings.
4. Create a Sign in with Apple private key (`.p8`).
5. Enter Client ID (Services ID), Team ID, Key ID, and private key in Supabase Apple provider settings.

## Identity Linking Behavior

Supabase links identities for the same user email by default when allowed by provider and project auth settings. This enables one account to sign in via passwordless email, Google, or Apple.

## Deliverability Notes

For magic-link and invite email reliability:

- Use a transactional mail provider.
- Configure SPF, DKIM, and DMARC for `p3lending.space`.
- Keep templates simple and include text content.

