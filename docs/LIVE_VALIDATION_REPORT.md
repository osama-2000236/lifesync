# Live validation report — 2026-07-11 (updated)

## Environment
- API: https://lifesync-production-fdf9.up.railway.app (commit `663343d+`, redis mode)
- FE: https://lifesync.1202883.workers.dev
- BERT: https://bert-production-a417.up.railway.app

## A — Redis
- Service `redis` (redis:7-alpine) on Railway project supportive-simplicity
- REDIS_URL=redis://redis.railway.internal:6379 on lifesync
- Health: redis.configured=true, redis.ok=true, ephemeral_store=redis

## B — Live QA
- `npm run qa:live` — infra/security/BERT/frontend
- `npm run qa:live:use-cases` — UC-01..UC-16 with `QA_E2E_TOKEN`

## D — Product fixes found in QA
- Insight history was rate-limited with generate (429 after generate) → rate limit only on POST generate
- Boot migrations re-ran 001 on existing DB → baseline empty SequelizeMeta + mark applied on duplicate
- Google Fit reported configured with **placeholder** secrets → reject template `your_*` credentials

## Use-case matrix (current)

| UC | Result | Notes |
|----|--------|-------|
| 01 Register contract | PASS | |
| 02 Auth/session | PASS | |
| 03 Logout contract | PASS | |
| 04 Manual health | PASS | |
| 05 Manual finance | PASS | |
| 06 Health chat | PASS | |
| 07 Finance chat | PASS | |
| 08 Cross-domain | PASS | |
| 09 Clarification | PASS | |
| 10 Dashboard insights | PASS | |
| 11 Generate insights | PASS | |
| 12 Edit/delete | PASS | |
| 13 Report download | **PASS** | PDF generate/list/download live |
| 14 Notifications | **PASS** | In-app + optional email; scheduler |
| 15 External sync | **HARDENED** | OAuth/sync/status + setup diagnostics; **needs real GOOGLE_CLIENT_SECRET + Console redirect** for full user E2E |
| 16 Administration | **PASS** | Dashboard metrics (users/product/runtime/AI/Fit), user search, activate/deactivate, last-admin guard, EN/AR UI |

## Operator still must provide (not inventable in code)
1. Real Google OAuth **client secret** (`GOCSPX-…`) on Railway — local/prod placeholders are rejected
2. Google Cloud Console redirect URI:  
   `https://lifesync-production-fdf9.up.railway.app/api/external/callback/google_fit`
3. Rotate any tokens that appeared in chat/logs historically
4. Optional: FCM/Firebase for mobile push (in-app notifications already ship)

## Verify commands

```bash
npm test
npm run qa:live
npm run qa:live:use-cases   # needs QA_E2E_TOKEN
```
