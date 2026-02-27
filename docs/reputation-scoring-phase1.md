# Reputation Scoring Phase 1

Phase 1 introduces deterministic scoring with explainability and persisted snapshots while keeping existing Developer API endpoints backward compatible.

## Output fields

`GET /api/v1/reputation/score` and related endpoints keep:

- `score`
- `band`
- `reasons`

And now also return:

- `trust_score` (0-1000)
- `risk_score` (0-1000, higher is riskier)
- `capacity_score` (0-1000)
- `reputation_score` (0-1000)
- `top_reasons_positive[]`
- `top_reasons_negative[]`
- `missing_data[]`
- `caps_applied[]`
- `computed_at`

## Composite formula

```
reputation_score = 0.40 * trust_score
                 + 0.35 * capacity_score
                 + 0.25 * (1000 - risk_score)
```

Bands:

- A: 850+
- B: 700-849
- C: 550-699
- D: 400-549
- E: <400

## Guardrail caps

- `NO_HISTORY_CAP_650` when `repayment_count_total < 3`
- `RECENT_DEFAULT_CAP_450` when `default_in_last_90d = true`
- `NO_KYC_CAP_700` when `kyc_level = 0`
- `NEW_ACCOUNT_CAP_600` when `account_age_days < 7`

The final score applies the most restrictive cap among those that match.

## Snapshot behavior

- Scores are persisted in `public.rep_score_snapshots`.
- API reads latest snapshot when it is fresh (<15 minutes).
- Otherwise API recomputes and writes a new snapshot.
- History endpoint reads `rep_score_snapshots` with optional `from` / `to`.

