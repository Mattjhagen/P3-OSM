# KYC OpenKYC / IDKit (Local)

Local OpenKYC mock for the P3 Lending investor demo. When FaceOnLive OpenKYC official image is available, replace `mock-openkyc` with it in `docker-compose.yml`.

## Quick start

```bash
cd infra/kyc-openkyc
docker compose up -d
open http://localhost:8787/health
```

## API (mock)

- `POST /sessions` → `{ sessionId, url }` — create verification session
- `GET /sessions/:id` → `{ status, extractedFields }` — get status (auto-approves after 10s if pending)
- `POST /sessions/:id/complete` → `{ success }` — manually complete (for mock UI)

## Integration

1. Set `KYC_PROVIDER=openkyc` and `OPENKYC_BASE_URL=http://localhost:8787` in backend `.env`
2. Run backend and frontend
3. Start verification in the profile dashboard
