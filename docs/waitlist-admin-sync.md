# Admin Waitlist Sync + Batch Onboarding

This document describes the server-side admin waitlist flow used by the **Admin Dashboard > Waitlist Queue**.

## 1) Source of truth

- Table: `waitlist` (Supabase)
- Queue order: `created_at ASC` (oldest first)
- Admin UI now reads queue via backend endpoint, not direct browser-table reads.

## 2) Server endpoints

- `GET /api/admin/waitlist`
  - Query: `adminEmail`, optional `page`, `pageSize`
  - Returns paged rows from `waitlist`
- `POST /api/admin/waitlist/sync`
  - Body: `{ adminEmail, adminName }`
  - Reconciles current queue counts and returns summary
- `POST /api/admin/waitlist/invite`
  - Body: `{ adminEmail, adminName, waitlistId }`
  - Marks one pending row as invited
- `POST /api/admin/waitlist/invite-next`
  - Body: `{ adminEmail, adminName, batchSize }`
  - Marks next N pending rows as invited

## 3) Required environment variables

Backend:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY` (optional; used for token validation client)

Optional hardening:

- `ADMIN_INTERNAL_BEARER`
  - If set, all `/api/admin/waitlist*` endpoints require:
    - `Authorization: Bearer <ADMIN_INTERNAL_BEARER>`
  - Do **not** expose this token in browser JavaScript.
  - If enabled, call these routes from a trusted server-side layer (for example a Netlify Function) that injects the token.

## 4) Admin authorization behavior

Server validation checks:

1. `adminEmail` must be present.
2. If `ADMIN_INTERNAL_BEARER` is configured, request must include matching bearer token.
3. If a bearer token is present without internal bearer mode, backend validates token with Supabase `auth.getUser`.
4. `employees` table must contain active row for `adminEmail` with role in:
   - `ADMIN`
   - `RISK_OFFICER`
   - `SUPPORT`

## 5) Invite behavior with email disabled

Batch invite is DB-first and does not block on SendGrid/SMTP:

- sets `status='INVITED'`

This keeps onboarding flow unblocked while outbound email provider is unavailable.

## 6) Smoke test checklist

1. Ensure at least 2 pending rows exist in `waitlist`.
2. Open Admin Dashboard > Waitlist Queue.
3. Confirm rows are visible and oldest records appear first.
4. Click **Sync Waitlist**.
5. Confirm success summary appears with total/pending/invited counts.
6. Click **Invite Next 10** (or lower batch).
7. Confirm result alert shows updated/skipped counts.
8. Refresh queue and confirm invited rows now have `INVITED` status.
9. (Optional DB check) verify invited rows now have `status='INVITED'`.
