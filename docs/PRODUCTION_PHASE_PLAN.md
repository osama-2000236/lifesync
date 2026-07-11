# LifeSync — Production Hardening Plan (Phased)

_Last fact-check: 2026-07-11_  
_Orchestrator completed P1–P8 in-repo. Full Jest: **749 passed, 2 skipped**._

---

## Status

| Phase | Title | Status |
|-------|--------|--------|
| **P1** | Durable ephemeral state (OTP + clarifications + interviews) | ✅ done |
| **P2** | Secrets, seed, demo-mode production locks | ✅ done |
| **P3** | Shared Redis rate-limit store | ✅ done |
| **P4** | Production env preflight + deploy smoke | ✅ done |
| **P5** | Observability (health, structured error logs) | ✅ done |
| **P6** | Auth/email production path audit | ✅ done |
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
