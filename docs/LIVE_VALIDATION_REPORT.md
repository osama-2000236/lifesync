# Live validation report — 2026-07-11

## Environment
- API: https://lifesync-production-fdf9.up.railway.app (commit af12c27, redis mode)
- FE: https://lifesync.1202883.workers.dev
- BERT: https://bert-production-a417.up.railway.app

## A — Redis
- Service `redis` (redis:7-alpine) on Railway project supportive-simplicity
- REDIS_URL=redis://redis.railway.internal:6379 on lifesync
- Health: redis.configured=true, redis.ok=true, ephemeral_store=redis

## B — Live QA
- npm run qa:live — infra/security/BERT/frontend
- npm run qa:live:use-cases — UC-01..UC-16 with QA_E2E_TOKEN

## D — Product fix found in QA
- Insight history was rate-limited with generate (429 after generate)
- Fixed: insightLimiter only on POST /api/insights/generate

## Use-case matrix (final run)
| UC | Result |
|----|--------|
| 01 Register contract | PASS |
| 02 Auth/session | PASS |
| 03 Logout contract | PASS |
| 04 Manual health | PASS |
| 05 Manual finance | PASS |
| 06 Health chat | PASS |
| 07 Finance chat | PASS |
| 08 Cross-domain | PASS |
| 09 Clarification | PASS |
| 10 Dashboard insights | PASS |
| 11 Generate insights | PASS |
| 12 Edit/delete | PASS |
| 13 Report download | GAP (documented) |
| 14 Notifications | GAP (documented) |
| 15 External surface | PASS |
| 16 Admin privilege | PASS |

Final use-case suite: PASS=70 FAIL=0 GAP=2 WARN=0
