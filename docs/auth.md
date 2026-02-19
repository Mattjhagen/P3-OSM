# Supabase Auth Setup (Magic Link + Google + Apple)

This app uses Supabase Auth as the source of truth for login and session state.

## Required Supabase URL Configuration

Supabase Dashboard -> Authentication -> URL Configuration:

- Site URL: `https://p3lending.space`
- Allowed Redirect URLs:
  - `https://p3lending.space/auth/callback`
  - `https://p3lending.space/auth/invite` (if invite flow is enabled)
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/invite` (if invite flow is enabled)

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
4. Ensure Google provider is enabled in Supabase.

## Apple Provider Setup (Web)

Supabase Dashboard -> Authentication -> Providers -> Apple:

1. Enable Apple provider.
2. Client ID (Services ID): `com.p3lending.web`
3. Secret: Apple client-secret JWT (generated in Apple Developer).

Apple Developer checklist:

1. In Apple Developer, enable Sign in with Apple.
2. Create a Services ID for web sign-in.
3. Configure Services ID:
   - Domain: `p3lending.space`
   - Return URL: `https://mxwousrkbdttlgsfqjsk.supabase.co/auth/v1/callback`
4. Create a Sign in with Apple private key (`.p8`).
5. Enter Client ID (Services ID), Team ID, Key ID, and private key in Supabase Apple provider settings.

## Identity Linking Behavior

P3 supports Supabase **manual identity linking (beta)** for signed-in users:

- Go to `Profile Settings -> Sign-in Methods`.
- Use `Link Google` or `Link Apple`.
- The app redirects through `/auth/callback` and returns to `/dashboard?view=profile`.

KYC safety enforcement:

- Once an account is KYC verified, duplicate standalone accounts are blocked.
- Stripe verified identity fingerprints are de-duplicated server-side; conflicts are forced into manual review.
- Email-level DB guards also prevent new rows from being created when that email is already tied to a KYC-verified account.

## Deliverability Notes

For magic-link and invite email reliability:

- Use a transactional mail provider.
- Configure SPF, DKIM, and DMARC for `p3lending.space`.
- Keep templates simple and include text content.

