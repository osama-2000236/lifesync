# Live E2E full use-case coverage + regression

_Date: 2026-07-11 · policy: **all UC-01…16** · **no admin UI journey** · **no mic/STT**_

| Target | URL | Live commit |
|--------|-----|-------------|
| API | `https://lifesync-production-fdf9.up.railway.app` | `d65ca8f` (suite run) |
| FE | `https://lifesync.1202883.workers.dev` | Workers SPA |
| BERT | `https://bert-production-a417.up.railway.app` | ready |

## Commands (mandatory regression)

```bash
# 1) Unit/integration — nothing broken
npm run test:regression:unit
# 815+ tests expected green (2 skipped)

# 2) Live UC-01…16 matrix (requires QA_E2E_TOKEN)
export QA_E2E_TOKEN=…   # Railway
export BE_URL=https://lifesync-production-fdf9.up.railway.app
export FE_URL=https://lifesync.1202883.workers.dev
npm run test:regression:uc

# 3) Live browser shells (no mic, no admin UI)
export QA_BASE_URL=$FE_URL QA_API_URL=$BE_URL
npm run test:regression:ui
```

## Results (this session)

| Gate | Result |
|------|--------|
| Jest unit regression (`DB_DIALECT=sqlite`) | **815 pass / 2 skip / 0 fail** |
| Live UC matrix (`qa_live_use_cases.mjs`) | **PASS 103 / FAIL 0 · 16/16 UC green** |
| Playwright UI live | **13/13 PASS** |
| UC evidence matrix unit | **19/19 PASS** |

### Live UC matrix (each UC ≥1 PASS, 0 FAIL)

| UC | Focus | Live checks |
|----|--------|-------------|
| UC-01 | Register contract | invalid OTP email, send-otp no 500, complete without OTP rejected |
| UC-02 | Session | me, wrong password, refresh rotation |
| UC-03 | Logout contract | forged/empty bearer 401 |
| UC-04 | Manual health | create/get/list/summary + invalid type |
| UC-05 | Manual finance | create/get/list/summary + amount 0 |
| UC-06 | Health chat | intent+entity + **stream** (text only) |
| UC-07 | Finance chat | log_finance |
| UC-08 | Cross-domain | both flag |
| UC-09 | Clarification | no silent write |
| UC-10 | Dashboard insights | GET insights + gamification + models |
| UC-11 | Generate insights | generate + history |
| UC-12 | Edit/delete | **PUT** health/finance + DELETE + 404 |
| UC-13 | Weekly PDF | generate, list, get, **%PDF**, foreign 404 |
| UC-14 | Notifications | list, mark one, mark all, opt-in/**opt-out** |
| UC-15 | External Fit | status/setup, connect fail-closed, sync/disconnect safe |
| UC-16 | Admin **API only** | dashboard/users/logs/status all **403** for non-admin; no token 401 |

## Explicitly out of scope (by request)

- Full **admin UI** operator journeys (API least-privilege only)
- Browser **mic / STT** (voice page shell only; `/api/voice/config` capabilities)

## Fixes this session (harness)

1. Expanded live UC suite with edit, notification mark/opt-out, Fit sync/disconnect, stream chat, UC matrix gate
2. UC evidence regression test `tests/uc_matrix_regression.test.js`
3. Playwright: no admin UI / no mic; fixed session collision on public shells
4. `npm run test:regression*` scripts
