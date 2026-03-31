# LifeSync

LifeSync is a full-stack health and finance tracking app with:

- Express + Sequelize + MySQL backend
- React + Vite frontend
- DeepSeek-powered NLP chat for logging entries
- Optional Firebase sync for chat history
- OTP-based registration flow via email
- Public landing, privacy, and terms pages for Google-ready deployment

## Verified Status

Verified on 2026-03-30 in this workspace:

- `client` builds successfully with `npm run build`
- the built frontend serves correctly and opens at `/login`
- backend tests pass when the minimum required environment variables are provided
- the backend server does not start in this machine as-is because MySQL is not installed here
- Docker is not installed on this machine, so Docker Compose could not be validated end-to-end

## What I Ran

Backend:

```powershell
cd .\lifesync
npm install
$env:NODE_ENV='test'
$env:JWT_SECRET='test_jwt_secret_for_ci_pipeline_32ch'
$env:JWT_REFRESH_SECRET='test_refresh_secret_for_ci_pipe'
$env:ENCRYPTION_KEY='test_encryption_key_for_ci_32ch!'
$env:AI_PROVIDER='deepseek'
$env:DEEPSEEK_API_KEY='ds-test'
npm test -- --forceExit --detectOpenHandles
```

Frontend:

```powershell
cd .\lifesync\client
npm install
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

## Requirements

To run the full app locally you need:

- Node.js 20+ and npm
- MySQL 8+
- an `.env` file for the backend
- an `.env` file for the frontend
- a valid DeepSeek API key for real NLP chat behavior
- a real SMTP provider for production OTP emails
- Firebase credentials if you want real-time chat sync

For production, you should also add:

- managed MySQL
- managed Redis
- HTTPS and a real domain
- monitoring, error tracking, backups, and secret management

## Local Setup

### 1. Backend

```powershell
cd .\lifesync
Copy-Item .env.example .env
```

Edit `.env` and set at least:

```env
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=lifesync_db
DB_USER=root
DB_PASSWORD=your_mysql_password
JWT_SECRET=replace_with_a_real_32_plus_char_secret
JWT_REFRESH_SECRET=replace_with_a_second_real_secret
ENCRYPTION_KEY=replace_with_a_real_32_plus_char_key
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=ds-...
DEEPSEEK_MODEL=deepseek-chat
CORS_ORIGIN=http://localhost:5173
APP_URL=http://localhost:5000
```

Create the database, then run:

```powershell
npm install
npm run migrate
npm run seed
npm run dev
```

Backend health check:

```text
http://localhost:5000/api/health
```

### 2. Frontend

```powershell
cd .\lifesync\client
Copy-Item .env.example .env
npm install
npm run dev
```

Default frontend URL:

```text
http://localhost:5173
```

For production builds:

```powershell
npm run build
```

## Environment Notes

- `DEEPSEEK_API_KEY` is required for live chat parsing and model-backed summaries when `AI_PROVIDER=deepseek`.
- If you keep `OPENAI_API_KEY`, the backend can still use OpenAI as a temporary fallback until you finish the migration.
- Firebase is optional. If it is not configured, Firebase-backed chat sync is skipped.
- SMTP is optional in development. In production, use a real provider.
- For Gmail SMTP, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, and set `SMTP_FROM_EMAIL` to the same Gmail address as `SMTP_USER`.
- The backend code expects `DB_PASSWORD`, not `DB_PASS`.

## Current Deployment Gaps

This project is close to a strong student/demo app, but it is not yet production-ready. These are the main missing pieces.

### Blocking issues to fix in code/config

1. Docker Compose uses the wrong database password variable for the backend.
   The app reads `DB_PASSWORD`, but `docker-compose.yml` sets `DB_PASS`.

2. Custom rate limiters trigger IPv6 validation warnings from `express-rate-limit`.
   This should be fixed before production so rate limiting is correct and clean.

3. OTP state is stored in memory.
   Restarting the server or scaling to multiple instances will break registration flows.

4. Chat clarification state is stored in memory.
   Restarting the server or scaling horizontally will lose active clarification sessions.

5. The encryption helper currently uses `JWT_SECRET` instead of `ENCRYPTION_KEY`.
   That couples two unrelated secrets and makes key rotation harder.

6. The seed script creates a default admin with a known password.
   That is acceptable for local development only and must be removed or overridden for real deployment.

7. Google Fit still requires production OAuth configuration on the Google Cloud side.
   The app needs a real callback URL, consent screen URLs, and approved origins before that integration is launch-ready.

### Missing production infrastructure

1. Managed MySQL with backups and restore strategy
2. Managed Redis for OTP and clarification/session state
3. Real SMTP provider for OTP delivery
4. Secret management for API keys and JWT secrets
5. HTTPS, DNS, and environment-specific CORS settings
6. Centralized logs, uptime monitoring, and error tracking

### Missing launch readiness items

1. Google Cloud consent-screen setup using the live homepage, privacy, and terms URLs
2. Production incident logging and alerting
3. Load testing and basic security review

## Recommended Production Architecture

- Frontend: static host or Nginx container
- Backend: Node.js service host
- Database: managed MySQL
- Cache/session store: managed Redis
- Email: managed SMTP provider
- Optional realtime layer: Firebase

## Cloudflare Frontend Deploy

If you deploy the frontend to Cloudflare, do not publish the raw `client/index.html` source file. It references `/src/main.jsx` and will render a blank page on a static host.

Use:

- production deploy command: `npm run deploy`
- preview deploy command: `npm run preview`
- static asset directory from `wrangler.jsonc`: `./client/dist`

This repo now includes `wrangler.jsonc` with SPA fallback enabled for Cloudflare Workers static assets.

The `deploy` and `preview` scripts build the frontend before calling Wrangler, so Cloudflare does not need a separate build step.
Those scripts also install the frontend dependencies inside `client/` before running Vite, because Workers Builds only installs the root package by default.

## Important Files

- `server/app.js`
- `server/config/database.js`
- `server/middleware/rateLimiter.js`
- `server/services/otpService.js`
- `server/services/ai/nlpService.js`
- `server/services/ai/providerClient.js`
- `server/utils/encryption.js`
- `server/seeders/seed.js`
- `client/src/App.jsx`
- `client/src/pages/LandingPage.jsx`
- `client/src/pages/PrivacyPolicyPage.jsx`
- `client/src/pages/TermsPage.jsx`
- `client/src/services/api.js`
- `client/nginx.conf`
- `docker-compose.yml`

## Summary

What works today:

- frontend build
- frontend preview
- backend tests with env variables
- app structure is complete enough for a real product foundation

What is still missing before real deployment:

- database and runtime infrastructure
- Redis-backed ephemeral state
- Docker/config fixes
- production secrets and email setup
- security and operations hardening
- legal and recovery flows
