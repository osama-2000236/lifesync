# QA loop ledger (scheduled campaign)

_Campaign job: `019f529f2555` · every 30m · stop only when all sections green at leading-org bar_

## Loop 1 — 2026-07-11 — **Auth & session security**

### Section
Auth/JWT/rate-limit/optionalAuth (security boundary)

### Tests run
```
npx jest tests/tokenUtils.test.js tests/securityBoundary.test.js tests/routeAuthSurface.test.js
npx jest --forceExit --runInBand   # full unit regression
```

### Findings (fixed)
| Severity | Issue | Fix |
|----------|--------|-----|
| **High** | `POST /api/auth/refresh` had **no rate limiter** — unlimited auth surface | `authLimiter` on refresh |
| **Medium** | Access JWT default **1d** (docs claimed 15m) — long stolen-token window | default `15m` + `.env.example` |
| **Low** | `optionalAuth` delegated to `authenticate` → **401** on bad token (breaks optional semantics) | verify soft-fail → anonymous |

### Regression added
- `tokenUtils`: default TTL ≤ 16 minutes when `JWT_EXPIRES_IN` unset
- `securityBoundary`: optionalAuth anonymous/valid paths
- `routeAuthSurface`: refresh 400 without body; stack has limiter+handler

### Remaining risk (auth section)
- Refresh tokens not rotated/revoked server-side (stateless JWT) — accepted until refresh store exists
- Production host must set `JWT_EXPIRES_IN=15m` if already set to `1d` on Railway (code default only applies when unset)

### Section status
**Green with residual accepted debt** (stateless refresh). Next loop should deepen another section.

### Next loop candidate
**Database migrations / seed idempotency** or **Google Fit OAuth state / encryption path** (high risk, less black-box covered).

---

## Loop 2 — 2026-07-11 — **DB migrations / seed baseline**

### Section
Boot-time `runMigrations` baseline heuristics + schema integrity migration list

### Tests run
```
npx jest tests/runMigrations.test.js tests/schemaIntegrity.test.js
npx jest --forceExit --runInBand
```

### Findings (fixed)
| Severity | Issue | Fix |
|----------|--------|-----|
| **High** | `isMigrationAlreadyInSchema` for 004/007/008 returned **unawaited Promises** (always truthy) → empty SequelizeMeta baselined migrations as applied **without columns** | `await hasColumn(...)` |
| **Medium** | `schemaIntegrity` openMigratedDb list **omitted migration 008** (avatar TEXT) | include `20260711-008-avatar-url-text.js` |

### Regression added
- Baseline false when `token_expires_at` / avatar columns missing
- Baseline true only after `token_expires_at` present
- Schema suite runs full migration stack incl. 008

### Remaining risk (DB section)
- Seed still uses `sequelize.sync()` (not migration runner) — possible drift if models ahead of migrations; ops should prefer migrate-on-boot
- Type-change baselining (004/008) only checks column *existence*, not MySQL type (accepted; alter is idempotent-ish)

### Section status
**GREEN** (baseline await bug fixed + tests).

### Next loop candidate
**Google Fit OAuth state / token encryption** or **health/finance IDOR + encryption at rest**.

---

## Section scoreboard (campaign)

| Section | Status | Notes |
|---------|--------|--------|
| Auth & session security | **GREEN** (loop 1) | 3 fixes |
| DB/migrations/seed | **GREEN** (loop 2) | await baseline bug |
| Health CRUD | pending deep | Live UC-04 passed historically |
| Finance CRUD | pending deep | Live UC-05 |
| Chat/NLP | pending deep | Live UC-06..09 |
| Insights | pending deep | |
| Reports UC-13 | pending deep | unit suite exists |
| Notifications UC-14 | pending deep | |
| Google Fit UC-15 | pending deep | secret ops gap |
| Admin API UC-16 | pending deep | least-privilege live |
| Memory | pending deep | |
| FE SPA shells | pending deep | Playwright shells green |
| Perf hotspots | pending deep | conversation O(n²) marked ponytail |
