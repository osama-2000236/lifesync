# LifeSync — Deep Bug-Hunt & Test Prompt (execution-ordered)

You are auditing the `lifesync/` full-stack app for bugs, security holes, and bad code. **Ground every finding in the actual code** — open the file, read the function, trace callers. No speculation: if you claim a bug, cite `file:line` and the exact code path that triggers it. For each section: (1) audit and list defects with evidence, (2) write a **failing test that reproduces each real bug**, (3) fix the root cause, (4) confirm the same test now passes and add regression tests for edge cases. Work the sections **in the order below** — earlier sections are dependencies of later ones.

Stack (facts): Node/Express + Sequelize (mysql2/sqlite3) backend, React/Vite client, Python BERT services. Backend tests **Jest + Supertest**; client **Vitest + Testing Library**; e2e **Playwright**. Do not weaken a test to make it pass. Do not fix a symptom in a caller when the root cause is in a shared function — grep all callers first.

Global rules before you start:
- Run `npm test` and `npm --prefix client test` first. Record baseline pass/fail. Any currently-failing or skipped test is finding #0.
- Check `.env` vs `.env.example` for secrets committed to the repo (`.env` is tracked here — flag any real keys).
- For every module, verify error paths, null/undefined inputs, empty arrays, and unauthorized access, not just the happy path.

---

## Phase 1 — Foundation: utils & config (no deps; test first)

**Files:** `server/utils/encryption.js`, `server/utils/tokenUtils.js`, `server/utils/responseHelper.js`, `server/utils/usernameUtils.js`, `server/config/database.js`, `server/config/firebase.js`, `client/src/config/runtime.js`, `client/src/config/runtimeConfig.js`, `client/src/config/models.js`.

Dig for:
- **`encryption.js`** (crypto-js): AES with a static IV or ECB mode? Key read from env and length-validated? Decrypt of tampered/legacy plaintext — throw+crash a request, or silently return garbage? Same key across environments? Test: round-trip, decrypt of non-encrypted legacy value, wrong key, empty/null input.
- **`tokenUtils.js`**: JWT sign/verify — algorithm pinned (`HS256`) or verify accepts `alg:none`? Expiry set? Secret defaulted to a hardcoded fallback when env missing? Test: expired token, tampered signature, missing `exp`, wrong-secret token.
- **`responseHelper.js`**: leaks stack traces / internal error messages to clients in production? Consistent shape?
- **`usernameUtils.js`**: collision handling, unicode/emoji, length limits, injection into DB. Extend `tests/usernameUtils.test.js`, don't trust it.
- **config**: DB config falls back to insecure defaults? Client runtime config exposes secrets to the bundle?

Existing tests to extend/verify: `tests/encryption.test.js`, `tests/usernameUtils.test.js`, `tests/runtimeConfig.test.js`.

## Phase 2 — Models & migrations (schema integrity)

**Files:** `server/models/*.js` (User, ChatLog, FinancialLog, HealthLog, Category, AISummary, LinkedDomain, SystemLog, UserGoal, UserMemory, index.js), `server/migrations/*`, `server/seeders/seed.js`.

Dig for:
- Associations in `models/index.js` — missing `onDelete`/`onUpdate` cascade → orphaned rows. Every `belongsTo`/`hasMany` has a matching FK in a migration?
- Field-level: money as FLOAT (precision bug) vs DECIMAL? Dates timezone-naive? Encrypted fields declared long enough?
- Migrations vs models drift: every model column exists in a migration? Run `npm run migrate` on fresh sqlite, diff against models. `20260410-002` and `20260620-003` apply cleanly and reverse (`migrate:undo`)?
- `seed.js`: idempotent? Re-seed duplicates rows or crashes on unique constraints?

Test: sqlite sync + each migration, assert schema; insert-then-cascade-delete a User, assert dependent rows removed.

## Phase 3 — AI services (core logic; heaviest)

**Files:** `server/services/ai/*` — `providerClient.js`, `bertNlpService.js`, `bertContextService.js`, `nlpService.js`, `conversationService.js`, `crossDomainInterviewService.js`, `memoryService.js`, `insightEngine.js`, `insightsService.js`, `insightLocalizer.js`, `insightTemplates.js`, `dashboardInsightsService.js`, `gamificationService.js`, `longHorizon.js`, `sameDayCoverage.js`, `modelRuntimeManager.js`, `sessionModelLock.js`.

Dig for:
- **`providerClient.js` + streaming**: HTTP calls — timeout set? Retry backoff or infinite retry? API keys logged? On non-200, typed error or leak raw provider body? SSE parsing — partial/broken chunk crashes parser? Cross-check `tests/parseMessageStream.test.js`, `tests/providerClientStream.test.js`. Test: mocked 429/500/timeout, malformed chunk, mid-stream disconnect.
- **`bertNlpService.js` / `modelRuntimeManager.js`**: load-failure handling, concurrent-request race on single model instance, fallback when ONNX/cloud unreachable. `sessionModelLock.js` — lock released on error (try/finally)? Deadlock? Test: concurrent calls, model-unavailable fallback.
- **`memoryService.js`**: unbounded per-user growth? User text injected into prompts (prompt-injection surface)? PII stored unencrypted?
- **`insightLocalizer.js` / Arabic**: RTL/Arabic handling, missing keys → renders key or crashes? Number/date format for `ar`. Verify Arabic TTS path (`response_format=wav`, no language field).
- **`sameDayCoverage.js`, `longHorizon.js`, `gamificationService.js`**: date-boundary math — off-by-one on rollover, timezone, streak reset, DST. Test: events at 23:59 / 00:01, across month boundary, empty history.

Existing tests to run and stress: `bertNlpService`, `bertContextService`, `conversationFallback`, `crossDomainInterviewService`, `memoryService`, `insightEngine`, `insightLocalizer`, `insightEval`, `longHorizon`, `sameDayCoverage`, `gamification`, `modelRuntimeManager`, `providerClient*`, `nlp`, `arabicNlp`, `detectLang`, `contextWindow`.

## Phase 4 — Middleware & security boundary

**Files:** `server/middleware/auth.js`, `roleCheck.js`, `rateLimiter.js`, `validate.js`, `errorHandler.js`, `server/services/otpService.js`, `server/services/googleAuthService.js`, `server/config/firebase.js`.

Dig for:
- **`auth.js`**: token from header AND cookie? Calls Phase-1 verify correctly? Fails open (proceeds when verify throws)? Attaches unvalidated `req.user`?
- **`roleCheck.js`**: admin gate checks a role field a user can set at registration? Privilege escalation.
- **`rateLimiter.js`**: keyed by IP behind proxy (X-Forwarded-For spoofable)? Applied to auth/OTP endpoints or only globally?
- **`otpService.js`**: OTP length/entropy, expiry, single-use replay, brute-force lockout, timing-safe compare. Demo-mode bypass provable-safe in prod (`tests/otpDemoMode.test.js`)?
- **`googleAuthService.js`**: Google ID token audience/issuer verified or just decoded? Origin check (`tests/qa/google-auth-origin.spec.ts`).
- **`validate.js`**: which routes lack validation? Mass-assignment (controller spreads `req.body` into `Model.create`?).

Test with Supertest: no token, expired token, wrong role, replayed OTP, spoofed forwarded IP, forged Google token.

## Phase 5 — Controllers & routes (integration)

**Files:** `server/controllers/*` (admin, assistant, auth, chat, finance, health), `server/routes/*` (admin, ai, assistant, auth, chat, external, finance, health, insights, voice), `server/app.js`.

Dig for:
- **IDOR / broken object-level auth** (highest value): every `GET/PUT/DELETE /:id` scoped by `req.user.id`, or can user A read user B's finance/health/chat logs? Check every controller method taking an id param.
- **SQL/ORM injection**: raw `sequelize.query` with interpolation? Order/filter params unvalidated into `where`?
- **finance/health controllers**: numeric validation, negative amounts, aggregation correctness, N+1 in list endpoints.
- **chat/voice/assistant**: stream cleanup on client disconnect, multer upload limits/type validation, unbounded body size.
- **admin**: every route behind `roleCheck`? Bulk ops bounded?
- **`app.js`**: helmet/cors — CORS `*` with credentials? Error handler registered last? Body size limits?

Test with Supertest full lifecycle: cross-user access, invalid payloads, oversized uploads, unauth hits on every route. Cross-check `authController`, `assistantController/Routes`, `chatResponse`, `chatStream`, `twoTrackChat`, `app.test.js`.

## Phase 6 — Client (React)

**Files:** `client/src/contexts/AuthContext.jsx`, `SettingsContext.jsx`, `client/src/hooks/useDictation.js`, `useVoice.js`, `useVoiceAssistant.js`, `client/src/components/**`, `client/src/i18n/*`.

Dig for:
- **`AuthContext`**: token in localStorage (XSS-exfiltratable)? Refresh/expiry handling? Race on initial load? Axios interceptor (`tests/authInterceptor.test.js`) retry-loops on 401?
- **hooks**: MediaRecorder/mic stream cleanup on unmount (leak / mic stays on)? Listeners removed? start/stop race (`useVoiceAssistant.mic.test.js`, `useDictation.test.js`).
- **components**: unkeyed lists, missing loading/error/empty states, `dangerouslySetInnerHTML` in `Markdown.jsx` (XSS — sanitized?), chart components with empty data → crash.
- **i18n**: Arabic RTL layout, missing keys, pluralization.

Test with Vitest: unmount cleanup, error/empty renders, Markdown XSS payload sanitization, interceptor 401 behavior.

## Phase 7 — Python model services

**Files:** `bert_cloud/server.py`, `model_runtime/server.py` / `pytorch_server.py`, `hf_space/app.py`.

Dig for: input length limits (OOM on huge text), tokenizer edge cases (empty/emoji/non-latin), concurrent request safety, unpinned/insecure model download source, exception → 500 with stack-trace leak, missing request timeout.

## Phase 8 — End-to-end & regression sweep

**Files:** `tests/e2e/mysql.e2e.test.js`, `tests/qa/*` (Playwright), `.github/workflows/ci.yml`, `docker-compose.yml`, `Dockerfile`.

Dig for: does CI run all suites or skip heavy ones? Are `test:eval:*` suites wired into CI? Docker healthchecks correct? After all fixes, run the full matrix (`npm test`, client `test`, `test:qa:api`, `test:e2e:mysql`) and confirm green with no `--forceExit` masking hung handles.

---

**Final deliverable:** ranked findings list (severity × confidence, each with `file:line` + reproducing test name), the fix diffs, and a test report showing each bug red-before / green-after.
