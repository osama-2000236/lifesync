# LifeSync — Production Hardening Plan (Phased)

_Last fact-check: 2026-07-17_  
_Orchestrator completed P1–P8 in-repo; P5+P6 deepened 2026-07-17. Full Jest: **911 passed, 2 skipped**; client Vitest: **317 passed**._

---

## Status

| Phase | Title | Status |
|-------|--------|--------|
| **P1** | Durable ephemeral state (OTP + clarifications + interviews) | ✅ done |
| **P2** | Secrets, seed, demo-mode production locks | ✅ done |
| **P3** | Shared Redis rate-limit store | ✅ done |
| **P4** | Production env preflight + deploy smoke | ✅ done |
| **P5** | Observability (health, structured error logs) | ✅ done + deepened |
| **P6** | Auth/email production path audit | ✅ done + deepened |
| **P7** | OAuth pending-state durability | ✅ done |
| **P8** | Final gate: regression + docs truth-up | ✅ done |

## PRODUCTION HARDENING COMPLETE (code)

Code-side production hardening for multi-instance + fail-closed secrets is **done**.

### What operators must still configure (not code)

1. Managed MySQL + backups  
2. `REDIS_URL` on the host (recommended for multi-instance)  
3. Real OTP email provider keys (Brevo / SendGrid / Resend / SMTP)  
4. Strong secrets: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` (≥32, distinct)  
5. HTTPS / DNS / `CORS_ORIGIN`  
6. Google Cloud OAuth console for Google Fit (if using wearables)  
7. Log aggregation / uptime product (app emits structured JSON errors)

### Verify before deploy

```bash
npm test                          # 749+ server tests
npm run preflight:production      # secrets + mail (from .env or host env)
npm run preflight:release-env     # frontend Vite vars
npm run smoke:api -- https://YOUR_API_HOST
```

### P5 deepening (2026-07-17)

- `/api/health` now also reports `db.ok` (cached 10 s, 1.5 s-bounded MySQL ping,
  never throws) and `uptime_s` (resets between polls ⇒ crash loop). HTTP stays
  200 = liveness; readiness is in the body.
- `smoke:api` fails a deploy when `db.ok === false` or Redis is configured but
  not answering PING (absent fields tolerated for older builds).
- Process-fatal events (`unhandledRejection` / `uncaughtException`) now emit one
  structured `level:fatal` JSON line with a compressed stack, then exit(1) —
  crash semantics preserved, cause greppable in Railway logs.
- Parallel-test flake fixed at the root: per-Jest-worker SQLite file in
  `server/config/database.js` (5 suites were dropping each other's tables via a
  shared file). `npm test` is now green in parallel, not just `--runInBand`.
- Tests: `tests/observability.test.js` (8) — health honesty, probe cache +
  timeout, structured 5xx line, prod message sanitization, fatal logger.

### P6 deepening (2026-07-17)

- **Token revocation on password change** — stateless JWTs used to outlive a
  password reset: a stolen 30-day refresh token kept working after the victim
  changed their password. New `users.password_changed_at` (migration 009);
  `issuedBeforePasswordChange()` in `tokenUtils` rejects older-iat tokens at
  the refresh endpoint AND per-request in the auth middleware (2 s slack for
  same-second replacement tokens). `changePassword` returns a fresh pair; the
  Profile page adopts it so the active session survives.
- **Login timing oracle closed** — unknown email now burns the same cost-12
  bcrypt compare as a wrong password (`DUMMY_BCRYPT_HASH`), so response time
  no longer reveals account existence.
- **HTTP mail-provider timeouts** — Brevo/SendGrid/Resend fetches route
  through one `mailApiPost` helper with `AbortSignal.timeout` (SMTP path
  already had timeouts; the HTTP path had none and could stall registration).
- Tests: `tests/passwordRevocation.test.js` (9) + otp timeout/failure tests;
  `schemaIntegrity` migration list now derived from the directory so new
  migrations can never dodge the parity guard.
- Deliberately unchanged: registration duplicate-email 409 (UX-required;
  existence enumeration bounded by `otpLimiter`), forgot-password
  `GOOGLE_ACCOUNT` hint (Google users would otherwise wait for a code that
  never comes), OTP attempt-counter read-modify-write race (bounded by
  `otpLimiter` 3/5 min; atomic INCR needs Lua — revisit only if limits loosen).

### Key modules

| Module | Role |
|--------|------|
| `server/services/ephemeralStore.js` | Redis/memory TTL store (OTP, clarif, interview, oauth_state) |
| `server/middleware/redisRateLimitStore.js` | Shared rate-limit counters when Redis set |
| `server/config/productionEnv.js` | Boot fail-closed for production secrets |
| `scripts/validate-production-env.mjs` | Offline production preflight |
| `scripts/smoke-api.mjs` | Live `/api/health` smoke |

### Product follow-ups (status as of 2026-07-11)

| Item | Status |
|------|--------|
| Weekly PDF report download (UC-13) | ✅ shipped |
| In-app (+ email) report notifications (UC-14) | ✅ shipped |
| Admin ops dashboard (UC-16) | ✅ shipped (metrics + user mgmt) |
| Google Fit OAuth/sync harden (UC-15) | ✅ code path; needs real Console secret for user E2E |
| Mobile push (FCM) | ❌ not configured (no Firebase prod creds) |
| New AI models | out of scope |

---

## History (phase prompts used earlier)

Phase 1–2 were implemented by Fable 5; phases 3–8 by orchestrator after verification. Working tree may still be uncommitted — commit when ready.
