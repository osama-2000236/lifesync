# LifeSync

LifeSync is a private, user-aware assistant that connects health, finance, goals, and conversation. It remembers authenticated LifeSync history, answers questions from that history, logs structured entries, and can run with a local model or a cloud provider.

## One-shot setup (recommended)

This path works on Windows, macOS, and Linux and does not require Node.js, Python, MySQL, or an API key on the host. For teammate onboarding and native local setup, see [TEAM_LOCAL_SETUP.md](./TEAM_LOCAL_SETUP.md).

### Requirements

- [Git](https://git-scm.com/downloads)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) with at least 6 GB RAM available

### Run

```bash
git clone <your-repository-url> lifesync
cd lifesync
docker compose up --build
```

Open [http://localhost](http://localhost). The first start can take several minutes because Docker downloads MySQL and the local `gemma3:1b` model. Later starts reuse both.

That single command starts:

- the React web app at `http://localhost`
- the Express API at `http://localhost:5001`
- MySQL with persistent storage
- Ollama with automatic GPU detection and CPU fallback
- the local conversational model, downloaded once

Stop with `Ctrl+C`. Remove containers with `docker compose down`. Keep the database/model volumes unless you intentionally want to erase local data; `docker compose down -v` deletes them.

### First login

Create an account in the UI. In local development, the registration response provides an Ethereal preview link; the API container also logs the OTP when email delivery falls back to the console:

```bash
docker compose logs -f server
```

For a quick local admin login, the development seed creates `admin@lifesync.app` / `Admin@123456`. Change or remove that account before sharing a deployed instance.

## The assistant model

The chat header contains a **Model pulse** menu — a model picker, like the model menu in editors such as Claude Code. It shows:

- ready, starting, limited, or offline state
- active model, provider, and expected reply time (ETA)
- full conversation versus classifier-only capability
- local/cloud execution and privacy behavior
- CPU threads, memory, and recommended local model size

### Choosing a model (no automatic fallback)

The menu lists every model you can run:

| Model | Kind | Default | Notes |
|-------|------|---------|-------|
| **LifeSync BERT (local)** | Intent classifier | ✅ | On-device, fully offline, fastest. Routes intents + extracts entries; does not generate prose. Labeled **Limited** for that reason. |
| **Gemma 3 (local)** | Generative | — | Local conversation via your runtime (Ollama by default). |
| **Gemma 4 (local)** | Generative | — | Newest Gemma; set `GEMMA4_MODEL` to the tag you pulled. |

The **default is local BERT**. Pick a model to activate exactly that one. There is **no silent fallback**: if the model you pick cannot start (runtime not installed, model not pulled, GPU/driver issue), the menu shows the precise error and you stay on your current model — you are never quietly switched to something else. Each model reports its expected reply time so you know how long a turn should take (BERT replies in well under a second; local Gemma takes seconds depending on GPU/CPU).

Gemma versions map to a local generative runtime via `GEMMA_LOCAL_RUNTIME` (`ollama` default, or `lmstudio`) and the model tags `GEMMA3_MODEL` / `GEMMA4_MODEL`.

### What “user-aware” means

For every authenticated chat turn, LifeSync builds a bounded background from:

- profile name and membership context
- active health and finance goals
- recent messages in the current conversation
- 30-day health averages and recent entries
- 30-day income, spending, and recent transactions by currency

The model is instructed to treat that background as private reference data, never as instructions. It must not invent missing facts, expose raw context, diagnose medical conditions, or promise financial outcomes.

## Choose a different model provider

Copy the environment template before a native run or when overriding Docker defaults:

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

Provider values are feature-scoped:

```env
CHAT_AI_PROVIDER=ollama
INSIGHTS_AI_PROVIDER=ollama
AI_PROVIDER=ollama
```

Supported providers are `ollama`, `lmstudio`, `gemini`, `groq`, `huggingface`, `custom_hf`, and `bert_local`.

### Ollama (local, recommended)

Docker configures this automatically. For a native run:

```env
CHAT_AI_PROVIDER=ollama
OLLAMA_MODEL=gemma3:1b
OLLAMA_API_BASE_URL=http://127.0.0.1:11434/v1/chat/completions
```

Install Ollama, then run `ollama serve`. The Model pulse start button downloads and warms the configured model when needed. Ollama chooses supported NVIDIA, AMD, or Apple acceleration and otherwise uses CPU.

Suggested model sizes:

- 8 GB RAM: `gemma3:1b`
- 12–16 GB RAM: a 3B–4B instruct model
- 24+ GB RAM: a 7B–9B instruct model

### LM Studio (local)

Install a GGUF instruct model in LM Studio and enable its local server:

```env
CHAT_AI_PROVIDER=lmstudio
LM_STUDIO_API_BASE_URL=http://127.0.0.1:1234/v1
LM_STUDIO_MODEL=the-exact-loaded-model-id
LM_STUDIO_API_KEY=lm-studio
```

If the `lms` CLI is installed, Model pulse can start the server and load the configured model.

### Gemini

```env
CHAT_AI_PROVIDER=gemini
INSIGHTS_AI_PROVIDER=gemini
GEMINI_API_KEY=your_key
GEMINI_MODEL=gemini-2.5-flash
```

### Groq

```env
CHAT_AI_PROVIDER=groq
GROQ_API_KEY=your_key
GROQ_MODEL=llama-3.1-8b-instant
```

### LifeSync BERT classifier (default model — set up on a fresh device)

BERT is the default. It does deterministic intent routing and offline extraction; it is not a conversational LLM. Set up on a new machine:

```env
CHAT_AI_PROVIDER=bert_local
INSIGHTS_AI_PROVIDER=bert_local
AI_PROVIDER=bert_local
BERT_RUNTIME_BASE_URL=http://127.0.0.1:1235
BERT_MODEL_NAME=bert_best_model_10pct
```

**1. Get the model weights.** The fine-tuned weights (`bert_best_model_10pct/`, ~440 MB) are **not** in Git. On a fresh device, place the model folder at the project root (ask a teammate for the archive, or copy it from another machine), then export the GPU graph:

```bash
python -m venv model_runtime/.venv
# Windows: model_runtime\.venv\Scripts\python -m pip install -r model_runtime\requirements.txt
# macOS/Linux: model_runtime/.venv/bin/python -m pip install -r model_runtime/requirements.txt
npm run model:export            # produces model_runtime/artifacts/bert_intent_directml.onnx
```

**2. Serve it (GPU if available, else CPU).**

```bash
npm run model:serve:gpu         # ONNX Runtime DirectML / CUDA — auto-detects GPU
# or, if no usable GPU / DirectML:
npm run model:serve:cpu         # PyTorch CPU fallback
```

The Model pulse menu can also start an already-prepared runtime for you. If the ONNX graph is missing, the runtime falls back to the PyTorch CPU server automatically at startup (this is a runtime detail, not a model switch).

## Native developer setup

Use this when you do not want Docker.

### Requirements

- Node.js 20+
- MySQL 8+
- npm
- one model provider from the section above

### Backend

```bash
npm ci
cp .env.example .env
npm run migrate
npm run seed
npm run hf:install
npm run hf:dev
```

In another terminal:

```powershell
npm run dev
```

Create the database named by `DB_NAME` first and set `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD` in `.env`.

### Frontend

In another terminal:

```bash
cd client
npm ci
cp .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). For a local backend, `client/.env` should contain:

```env
VITE_API_URL=http://localhost:5000/api
```

## Configuration checklist

Before any shared or production deployment, replace these values in `.env`:

```env
JWT_SECRET=a_random_secret_at_least_32_characters
JWT_REFRESH_SECRET=a_different_random_secret
ENCRYPTION_KEY=a_random_encryption_key_at_least_32_characters
DB_PASSWORD=a_strong_database_password
CORS_ORIGIN=https://your-frontend.example
APP_URL=https://your-api.example
```

Also configure:

- real SMTP credentials for OTP delivery
- Google OAuth client IDs only if Google login is desired
- managed MySQL backups and secret management for production

Never commit `.env`, API keys, database exports, or local model virtual environments.

## Useful commands

```bash
npm test                 # backend unit/integration tests
npm --prefix client run lint
npm --prefix client run build
npm run test:qa:e2e      # Playwright suite
npm run test:model:eval  # local model evaluation
docker compose logs -f server ollama
```

Health and model endpoints:

- `GET /api/health`
- `GET /api/ai/status` (authenticated)
- `POST /api/ai/start` with `{ "provider": "auto" }` (authenticated)

## Architecture

```text
React chat
   │  authenticated SSE + model controls
   ▼
Express API
   ├─ bounded user context (profile, goals, chat, health, finance)
   ├─ conversational provider (Ollama / LM Studio / cloud)
   ├─ safe structured extraction and validation
   └─ MySQL persistence
```

Important files:

- `server/services/ai/nlpService.js` — assistant behavior and structured contract
- `server/services/ai/bertContextService.js` — bounded user background
- `server/services/ai/modelRuntimeManager.js` — status, hardware detection, and activation
- `server/services/ai/providerClient.js` — provider adapters
- `server/controllers/chatController.js` — SSE chat and persistence
- `client/src/pages/ChatPage.jsx` — conversation and Model pulse UI
- `.env.example` — provider/configuration template
- `docker-compose.yml` — one-shot local stack

## Troubleshooting

**Model pulse says AI offline**

Open the Model pulse menu and pick a model (start with **LifeSync BERT** — it has no external dependency). If a model fails to start, the menu shows the exact error; act on it rather than expecting an automatic switch. For Docker, inspect `docker compose logs -f ollama server`. For native Ollama, verify `ollama serve` and `OLLAMA_API_BASE_URL`.

**The model is “Limited”**

The active provider is `bert_local`. It can route and extract entries but cannot generate broad conversation. Start Ollama/LM Studio or configure a cloud provider.

**Port already in use**

Stop the other service or change the left side of the relevant `ports` entry in `docker-compose.yml` (`80`, `5001`, `3306`, or `11434`).

**Reset local Docker data**

```bash
docker compose down -v
docker compose up --build
```

This permanently deletes the local LifeSync database and downloaded model volume.

## Environment Notes

- `GEMINI_API_KEY` is required for live chat parsing and model-backed summaries when `AI_PROVIDER=gemini`.
- `CUSTOM_HF_ENDPOINT` can point to the bundled local Gradio service at `http://127.0.0.1:7860`.
- The bundled `hf_space` service now targets `google/gemma-4-E2B-it` through Transformers.
- On CPU-only machines, the service defaults to the official TorchAO int4 CPU quantization path to reduce memory pressure.
- SMTP is optional in development. In production, use a real provider.
- For Gmail SMTP, set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, and set `SMTP_FROM_EMAIL` to the same Gmail address as `SMTP_USER`.
- The backend code expects `DB_PASSWORD`, not `DB_PASS`.

## Current Deployment Gaps

This project is close to a strong student/demo app, but it is not yet production-ready. These are the main missing pieces.

### Blocking issues to fix in code/config

1. ~~Custom rate limiters / IPv6 / per-process counters.~~ **Fixed** —
   `ipKeyGenerator` for IPv6-safe keys; when `REDIS_URL` is set, each limiter
   uses a dedicated `RedisRateLimitStore` so hit counters are shared across
   instances. Without Redis, in-process MemoryStore remains (local/dev).

2. ~~OTP / clarification / interview / OAuth state in memory.~~ **Fixed** —
   all go through `server/services/ephemeralStore.js` (Redis when configured,
   memory otherwise). OTP writes fail closed if Redis is configured but down.

3. ~~Encryption / seed / demo OTP.~~ **Fixed for production** — dedicated
   `ENCRYPTION_KEY`, seed refuses known default admin password, `OTP_DEMO_MODE`
   blocked at boot, production boot guard in `server/config/productionEnv.js`.

4. Google Fit still needs **operator** OAuth setup on Google Cloud (callback URL,
   consent screen, approved origins). Code-side token store + state nonces are
   durable; the Cloud Console work is environment-specific.

### Code-side production tooling

| Command | Purpose |
|---------|---------|
| `npm run preflight:production` | Backend secrets + mail provider checks (no server boot) |
| `npm run preflight:release-env` | Frontend Vite / Google client ID checks |
| `npm run smoke:api -- https://host` | Live `/api/health` (+ AI health warn) |
| `npm run smoke:workers` | Live frontend route smoke |

`/api/health` reports `redis.configured` / `redis.ok` / `ephemeral_store` mode
(no secrets). Errors log as structured JSON lines (status, path, code).

### Still operator / infra (not pure code)

1. Managed MySQL with backups and restore strategy  
2. Managed Redis in the host env (`REDIS_URL`)  
3. Real email provider keys on the host  
4. Secret management for API keys and JWT secrets  
5. HTTPS, DNS, and environment-specific CORS  
6. Centralized log aggregation / uptime product (app emits structured logs)  
7. Load testing and periodic security review

## Recommended Production Architecture

- Frontend: static host or Nginx container
- Backend: Node.js service host
- Database: managed MySQL
- Cache/session store: managed Redis
- Email: managed SMTP provider

## Cloudflare Frontend Deploy

If you deploy the frontend to Cloudflare, do not publish the raw `client/index.html` source file. It references `/src/main.jsx` and will render a blank page on a static host.

Use:

- production deploy command: `npm run deploy`
- preview deploy command: `npm run preview`
- static asset directory from `wrangler.jsonc`: `./client/dist`

This repo now includes `wrangler.jsonc` with SPA fallback enabled for Cloudflare Workers static assets.

The `deploy` and `preview` scripts build the frontend before calling Wrangler, so Cloudflare does not need a separate build step.
Those scripts also install the frontend dependencies inside `client/` before running Vite, because Workers Builds only installs the root package by default.
Both scripts now run a strict release preflight that validates:
- `VITE_API_URL=https://lifesync-production-fdf9.up.railway.app/api`
- `VITE_GOOGLE_CLIENT_ID=190237143688-0ddtrdq3die8hnce0aqbti3jgc2eam4g.apps.googleusercontent.com` (must match the Cloudflare project env var of the same name)
- if `GOOGLE_AUTH_CLIENT_IDS` is provided, it must include that same Google client ID

Additional release checks:
- `npm run probe:external` checks Railway `/api/health` and HF Space `/gradio_api/info` + `/infer` round-trip
- `npm run smoke:workers` checks live frontend routes `/login`, `/dashboard`, `/chat`, `/health`, `/finance` and reports the production asset hash

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
