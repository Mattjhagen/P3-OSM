# Developer API plans & quotas

This repo supports **two tiers** for the P3 Developer API:

- **Sandbox (Free)** — default for all orgs; test keys only.
- **Paid (Production)** — required for live keys.

The API host is `https://api.p3lending.space` (Render).

## Key environments

- **Sandbox keys**: `p3_test_...`
- **Production keys**: `p3_live_...`

## Default limits

Limits are stored per key (`rpm_limit`, `rpd_limit`) and enforced on requests. Monthly quota is enforced per key using the org plan default, unless overridden.

| Plan | Default rpm | Default rpd | Default monthly_limit |
|------|-------------|-------------|------------------------|
| sandbox | 10 | 500 | 5,000 |
| paid | 120 | 50,000 | 1,000,000 |

## Enforcement rules

- **Live keys require paid**: if a request uses a `p3_live_...` key and the org is not on `paid`, the API returns **402** with `code=paid_required`.
- **Monthly quota**: if the key exceeds its monthly limit, the API returns **429** with `code=monthly_quota_exceeded`.

Quota headers:

- `X-MonthlyQuota-Limit`
- `X-MonthlyQuota-Remaining`
- `X-MonthlyQuota-Reset`

## Upgrade (phase 1)

Billing is stubbed initially. Upgrade CTA links to email:

- `mailto:founders@p3lending.space?subject=Upgrade%20P3%20Developer%20API%20Plan`

## Smoke tests

### OpenAPI

```bash
curl -sI https://api.p3lending.space/docs/openapi.json | egrep -i "HTTP/|content-type"
```

### Sandbox key works (within quota)

```bash
export P3_TEST_KEY="p3_test_...your_key..."
curl -s -H "Authorization: Bearer ${P3_TEST_KEY}" \
  "https://api.p3lending.space/api/v1/reputation/score?user_id=00000000-0000-0000-0000-000000000000"
```

### Live key blocked for sandbox org

```bash
export P3_LIVE_KEY="p3_live_...your_key..."
curl -s -i -H "Authorization: Bearer ${P3_LIVE_KEY}" \
  "https://api.p3lending.space/api/v1/reputation/score?user_id=00000000-0000-0000-0000-000000000000" | head -n 25
```

Expected: `HTTP/2 402` and JSON with `code: "paid_required"`.

### Monthly quota exceeded

To force this quickly, set a small `monthly_limit_override` on a test key in the DB (or create a dedicated sandbox key with a small override), then run:

```bash
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer ${P3_TEST_KEY}" \
    "https://api.p3lending.space/api/v1/reputation/score?user_id=00000000-0000-0000-0000-000000000000"
done
```

Expected: after the limit is exceeded, responses become `429` with `code: "monthly_quota_exceeded"`.

