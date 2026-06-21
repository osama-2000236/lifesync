# LifeSync

LifeSync is a private, user-aware assistant that connects health, finance, goals, and conversation. It remembers authenticated LifeSync history, answers questions from that history, logs structured entries, and can run with a local model or a cloud provider.

## One-shot setup (recommended)

This path works on Windows, macOS, and Linux and does not require Node.js, Python, MySQL, or an API key on the host.

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

The chat header contains a **Model pulse** menu. It shows:

- ready, starting, limited, or offline state
- active provider and model
- full conversation versus classifier-only capability
- local/cloud execution and privacy behavior
- CPU threads, memory, and recommended local model size

Choose **Start best model** to inspect the current machine and activate the best available configured runtime. LifeSync prefers a ready conversational provider, can wake Ollama or LM Studio, and falls back to the bundled BERT classifier when no text-generating model is available. BERT is deliberately labeled **Limited** because it can classify and extract data but cannot generate rich conversation.

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

### Bundled BERT classifier

BERT is useful for deterministic intent routing and offline extraction, but it is not a conversational LLM:

```env
CHAT_AI_PROVIDER=bert_local
BERT_RUNTIME_BASE_URL=http://127.0.0.1:1235
BERT_RUNTIME_PROVIDER=auto
```

Install and start it:

```bash
python -m venv model_runtime/.venv
# Windows: model_runtime\.venv\Scripts\python -m pip install -r model_runtime\requirements.txt
# macOS/Linux: model_runtime/.venv/bin/python -m pip install -r model_runtime/requirements.txt
npm run model:serve:gpu
```

If DirectML is unavailable, run `npm run model:serve:cpu`. The Model pulse button can also start an already-prepared bundled runtime.

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
- Firebase credentials only if real-time Firebase chat sync is desired
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
   └─ MySQL persistence + optional Firebase sync
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

Open the menu and choose **Start best model**. For Docker, inspect `docker compose logs -f ollama server`. For native Ollama, verify `ollama serve` and `OLLAMA_API_BASE_URL`.

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
