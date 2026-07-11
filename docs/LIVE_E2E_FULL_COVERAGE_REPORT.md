# Live E2E full coverage report

_Date: 2026-07-11 · targets: production BE + CF Workers FE + BERT_

| Target | URL | Commit / note |
|--------|-----|----------------|
| API | `https://lifesync-production-fdf9.up.railway.app` | `3ac61649c7b4` |
| FE | `https://lifesync.1202883.workers.dev` | asset `index-AbHU-bux.js` |
| BERT | `https://bert-production-a417.up.railway.app` | ready |

## Suites (first clean pass — green)

| Suite | Command | Result |
|-------|---------|--------|
| Infra / security / BERT / FE smoke | `npm run qa:live` | **PASS 60 / FAIL 0** |
| UC-01 … UC-16 + product surfaces | `npm run qa:live:use-cases` | **PASS 82 / FAIL 0 / GAP 0** |
| Playwright browser (live FE) | `QA_BASE_URL=… QA_E2E_TOKEN=… npx playwright test tests/qa/ui.spec.ts` | **11 / 11 PASS** (after harness fixes) |
| Workers smoke | `node scripts/smoke-workers.mjs` | **OK** |
| Google origin wiring | `tests/qa/google-auth-origin.spec.ts` | **PASS** |

### UC matrix (live API)

| UC | Result | Notes |
|----|--------|-------|
| 01 Register contract | PASS | send-otp 503 without 500 acceptable |
| 02 Auth/session | PASS | QA bot + refresh |
| 03 Logout contract | PASS | JWT client clear |
| 04 Manual health | PASS | CRUD create/list/summary |
| 05 Manual finance | PASS | + reject amount 0 |
| 06 Health chat | PASS | log_health + entity |
| 07 Finance chat | PASS | log_finance |
| 08 Cross-domain | PASS | both |
| 09 Clarification | PASS | no silent write |
| 10 Dashboard insights | PASS | |
| 11 Generate insights | PASS | |
| 12 Edit/delete | PASS | |
| 13 Weekly PDF | PASS | application/pdf body |
| 14 Notifications | PASS | |
| 15 Google Fit | PASS (fail-closed) | `configured=false`, missing `client_secret` |
| 16 Admin LP | PASS | non-admin 403 |

### Playwright UI (live)

TC-UI-001…011: landing, auth redirects, dashboard, health/finance, chat send, mobile nav, logout, profile/integrations, weekly report card, voice shell.

## Fixes applied this session (test harness — product already live)

1. **Stale UI selectors** vs i18n (`Chat` not `Assistant`, dashboard copy, placeholders).
2. **Live auth**: `QA_E2E_TOKEN` → `qa-login` + localStorage (QA bot has random password).
3. **Session cache + 429 backoff** so serial UI tests don’t trip `authLimiter`.
4. Live scripts treat auth **429 as warn/backoff**, not false product failure.

## Not true 100% (honest gaps)

| Gap | Why |
|-----|-----|
| Google Fit happy-path OAuth | Needs operator `GOOGLE_CLIENT_SECRET` + Console redirect |
| Real OTP email delivery E2E | Avoid spam; contract-only |
| Playwright `api.spec.ts` password login | Needs `TEST_USER_*`; covered by `qa:live:use-cases` instead |
| Admin UI as admin | QA bot is non-admin (403 proven) |
| Jest line coverage | Unit suite separate; not live E2E |
| Mic/STT browser permissions | Cannot auto-grant OS mic in CI headless fully |

## Re-run after auth cooldown (~15 min if 429)

```bash
export QA_E2E_TOKEN=…   # from Railway
export BE_URL=https://lifesync-production-fdf9.up.railway.app
export FE_URL=https://lifesync.1202883.workers.dev
export QA_BASE_URL=$FE_URL
export QA_API_URL=$BE_URL
export EXPECT_COMMIT=3ac6164

npm run qa:live
npm run qa:live:use-cases
npx playwright test tests/qa/ui.spec.ts
```
