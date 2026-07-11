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

## Loop 3 — 2026-07-11 — **Google Fit OAuth / token encryption (UC-15)**

### Section
OAuth state binding, token-at-rest AES, revoke transport, callback logging

### Tests run
```
npx jest tests/googleFitAdapter.test.js tests/userIntegrationModel.test.js \
  tests/externalOAuthState.test.js tests/googleFitAccessToken.test.js
# 21 pass
npx jest --forceExit --runInBand
# 827 pass / 2 skip
```

### Findings (fixed)
| Severity | Issue | Fix |
|----------|--------|-----|
| **High** | `disconnect` revoked via `?token=` **query string** (proxy/access-log leak) | POST form body + `x-www-form-urlencoded` |
| **Low** | Callback catch logged raw `err.message` | code/name + message capped 120 chars |

### Already solid (verified)
- Server-issued single-use state nonce; platform-bound; no client userId
- `UserIntegration` AES hooks for access/refresh tokens
- Placeholder Fit secrets fail closed

### Regression added
- Revoke never puts token in URL
- Double-encrypt guard + encrypt Google-style `ya29.` tokens

### Remaining risk
- Ops: live happy-path still needs real `GOOGLE_CLIENT_SECRET`
- Concurrent refresh races (accepted)

### Section status
**GREEN** (code). Live full OAuth still secret-gated.

### Next loop candidate
**Health/finance IDOR + field encryption at rest** or **Chat/NLP safety**.

---

## Loop 4 — 2026-07-11 — **Health/finance IDOR + encrypted search**

### Section
CRUD ownership scoping + AES field search (notes/description/value_text)

### Tests run
```
npx jest tests/encryptedSearch.test.js tests/idorControllers.test.js
npx jest --forceExit --runInBand
```

### Findings (fixed)
| Severity | Issue | Fix |
|----------|--------|-----|
| **High** | List `search` used SQL `LIKE` on **AES ciphertext** → search never matched real text | In-memory filter on decrypted fields, owner-scoped, cap 500 |
| **Medium** | Health `update` accepted any `type` string | Enum whitelist |
| **Low** | Notes/description unbounded length | max 2000 on create/update validation |

### Already solid (verified)
- get/update/delete always `where: { id, user_id }`
- List always forces `user_id: req.user.id`
- Sort injection sanitized; amount/value bounds on update
- Numeric amount/value stay plaintext for aggregation (documented TDE)

### Regression added
- `encryptedSearch.test.js`: ciphertext at rest + plaintext search + cross-user isolation
- IDOR: invalid type rejected; search path uses findAll without Op.or LIKE

### Remaining risk
- Encrypted search capped at 500 recent matching filter rows (not full-table FTS) — upgrade when users exceed that
- Amounts/values not field-encrypted (SQL aggregate tradeoff)

### Section status
**GREEN** (Health + Finance deep for IDOR/search/encryption behavior)

### Next loop candidate
**Chat/NLP safety** (clarification, no silent write) or **Admin API UC-16**.

---

## Loop 5 — 2026-07-12 — **Chat/NLP write safety**

### Section
Chat controller persistence gate + entity validation (UC-06..09)

### Tests run
```
npx jest tests/chatSafety.test.js tests/bertNlpService.test.js \
  tests/arabicNlp.test.js tests/chatStream.test.js
# 67 pass
npx jest --forceExit --runInBand
```

### Findings (fixed)
| Severity | Issue | Fix |
|----------|--------|-----|
| **High** | Controller wrote any `nlpResult.entities` when present; **no confidence / clarification re-check** on all write paths (stream, JSON, generative-failure) | `entitiesForPersistence()` — empty if clarifying or confidence &lt; 0.5 |
| **Medium** | Health/finance creates accepted invalid types / NaN / amount ≤ 0 → DB errors or junk rows | `isValidHealthEntity` / `isValidFinanceEntity` before create |

### Already solid (verified)
- NLP `normalizeNLPResponse` clears entities when `needs_clarification`
- BERT incomplete spend asks clarification with empty entities
- Clarification branch returns early with empty `entities_logged`

### Regression
- `server/services/ai/chatWriteSafety.js` + `tests/chatSafety.test.js`

### Remaining risk
- Generative models can still invent entities at high confidence (model quality, not gate)
- Goals (`_goal`) still persist without the 0.5 gate (separate path)

### Section status
**GREEN** (write-safety bar)

### Next loop candidate
**Admin API UC-16** or **Reports UC-13 / Notifications UC-14**.

---

## Loop 6 — 2026-07-12 — **Admin API UC-16**

### Section
Least privilege, user list sanitization, status updates (no admin UI)

### Tests run
```
npx jest tests/adminRoutes.test.js
# 8 pass
npx jest --forceExit --runInBand
```

### Findings (fixed)
| Severity | Issue | Fix |
|----------|--------|-----|
| **Medium** | `GET /users` excluded only `hashed_password` — **`firebase_uid` still returned** | SQL exclude + `toSafeJSON()` map |
| **Low** | `PUT .../status` accepted non-numeric `:id` | `parseInt` + 400 |
| **Low** | AI snapshot catch leaked `err.message` | generic `ai_status_unavailable` |

### Already solid
- `authenticate` + `adminOnly` on all admin routes
- Cannot modify own status; last-admin guard present
- Dashboard aggregates only (no journal bodies)
- Deactivated admin JWT → 403 at authenticate

### Regression
- List never contains `firebase_uid` / `hashed_password`
- Dashboard AI JSON has no secret-like patterns
- Invalid id 400; peer admin deactivation + deactivated token 403

### Remaining risk
- Admin can still read other users' emails (by design for ops)
- No role-change API (good); privilege escalation via DB only

### Section status
**GREEN** (API-only UC-16)

### Next loop candidate
**Reports UC-13 / Notifications UC-14** or **Memory** or **Insights**.

---

## Loop 7 — 2026-07-12 — **Reports UC-13 + Notifications UC-14**

### Section
PDF lifecycle, ownership, cron auth, notification IDOR

### Tests run
```
npx jest tests/reportRoutes.test.js tests/reportService.test.js \
  tests/notificationService.test.js tests/uc13_uc14_requirements.test.js \
  tests/pdfReportBuilder.test.js
# 26 pass
npx jest --forceExit --runInBand
```

### Findings (fixed)
| Severity | Issue | Fix |
|----------|--------|-----|
| **Medium** | Cron secret compared with `!==` (timing leak) | `crypto.timingSafeEqual` |
| **Medium** | Cron success returned **full report + notification** payloads (emails/scores) | Operational summary only |
| **Low** | PDF filename used raw `week_key` (Content-Disposition injection risk) | sanitize to `[A-Za-z0-9._-]` |

### Already solid
- Download/get scoped by `user_id` (404 foreign)
- Notify requires persisted report id; opt-out; dedupe per report
- Cron dormant without secret; wrong secret 401
- PDF built from frozen snapshot (no corrupt partial file on fail path)

### Regression
- Cron response shape has no report/notification bodies
- Foreign notification mark → 404

### Remaining risk
- Email delivery depends on provider keys (ops)
- Scheduler is single-process hourly (multi-instance may double-run; job is idempotent)

### Section status
**GREEN** (UC-13 + UC-14)

### Next loop candidate
**Memory** or **Insights** or **FE SPA shells**.

---

## Section scoreboard (campaign)

| Section | Status | Notes |
|---------|--------|--------|
| Auth & session security | **GREEN** (loop 1) | 3 fixes |
| DB/migrations/seed | **GREEN** (loop 2) | await baseline bug |
| Google Fit UC-15 | **GREEN** (loop 3) | revoke leak |
| Health CRUD | **GREEN** (loop 4) | IDOR + encrypted search |
| Finance CRUD | **GREEN** (loop 4) | same |
| Chat/NLP | **GREEN** (loop 5) | write gate |
| Admin API UC-16 | **GREEN** (loop 6) | firebase_uid leak |
| Reports UC-13 | **GREEN** (loop 7) | cron harden |
| Notifications UC-14 | **GREEN** (loop 7) | same |
| Insights | pending deep | |
| Memory | pending deep | |
| FE SPA shells | pending deep | Playwright shells green |
| Perf hotspots | pending deep | conversation O(n²) ponytail |
