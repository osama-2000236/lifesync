# LifeSync — Complete Setup Guide

> For graders, reviewers, and developers starting from a fresh terminal.
> Estimated setup time: 10 minutes (no Docker) or 3 minutes (Docker).

---

## Option A: Docker (Recommended — Zero Configuration)

### Prerequisites
- Docker Engine 20+ and Docker Compose v2

### Steps

```bash
# 1. Clone the repository
git clone <repository-url> lifesync && cd lifesync

# 2. Create environment file
cp .env.example .env

# 3. Start everything (MySQL + Backend + Frontend)
docker-compose up -d

# 4. Wait for MySQL to initialize (~20 seconds)
docker-compose logs -f db | head -50
# Look for: "ready for connections"

# 5. Open the application
# → http://localhost (Nginx frontend, proxies API)
# → http://localhost:5000/api/health (Backend health check)
```

### Running Tests Inside Docker

```bash
docker-compose exec server npm test -- --forceExit --detectOpenHandles
```

### Teardown

```bash
docker-compose down -v   # Removes containers + data volumes
```

---

## Option B: Local Development (Manual Setup)

### Prerequisites

| Tool | Version | Check Command |
|------|---------|---------------|
| Node.js | 18 or 20 | `node --version` |
| npm | 9+ | `npm --version` |
| MySQL | 8.0 | `mysql --version` |

### Step 1: Install Dependencies

```bash
# Clone and enter project
git clone <repository-url> lifesync && cd lifesync

# Backend dependencies
npm install

# Frontend dependencies
cd client && npm install && cd ..
```

### Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your local values:

```env
# ─── Required ───
NODE_ENV=development
PORT=5000

# ─── MySQL ───
DB_HOST=localhost
DB_PORT=3306
DB_NAME=lifesync_db
DB_USER=root
DB_PASSWORD=your_mysql_password

# ─── Security (change in production) ───
JWT_SECRET=your_jwt_secret_minimum_32_characters_long
JWT_REFRESH_SECRET=your_refresh_secret_minimum_32_chars
ENCRYPTION_KEY=your_encryption_key_exactly_32ch!

# ─── AI provider config ───
AI_PROVIDER=custom_hf
CHAT_AI_PROVIDER=custom_hf
INSIGHTS_AI_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key
CUSTOM_HF_ENDPOINT=http://127.0.0.1:7860
CUSTOM_HF_MODEL=google/gemma-4-E2B-it
# Optional when the HF model or Space requires auth:
# HF_TOKEN=your_hf_token
# HF_API_KEY=your_hf_token
HF_HUB_DISABLE_XET=1
HF_SPACE_QUANTIZATION=int4_cpu

# ─── Optional (for email OTP) ───
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# ─── CORS ───
CORS_ORIGIN=http://localhost:5173
```

### Step 3: Create the Database

```bash
# Log into MySQL
mysql -u root -p

# Inside MySQL shell:
CREATE DATABASE lifesync_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit;
```

### Step 4: Start the Backend

```bash
# From project root
npm run dev
# Output: 🚀 LifeSync server running on port 5000
#         ✅ Database tables synchronized.
```

The backend auto-creates all tables via Sequelize `sync({ alter: true })` in development mode. No manual migration commands needed.

### Step 5: Start the Local Gemma Service

```bash
# From project root
npm run hf:install
npm run hf:dev
# Output: Gradio app on http://127.0.0.1:7860
```

If the custom HF service is unavailable, the backend falls back to Gemini when `GEMINI_API_KEY` is configured.
For CPU-only local machines, the bundled service uses TorchAO int4 quantization by default.

### Step 6: Start the Frontend

```bash
# In a second terminal
cd client
npm run dev
# Output: VITE v6.x ready in XXXms
#   ➜ Local: http://localhost:5173/
```

### Step 7: Verify Everything Works

```bash
# Health check (should return JSON)
curl http://localhost:5000/api/health

# Probe backend + configured HF endpoint
npm run probe:external

# Open browser
open http://localhost:5173
```

---

## Running the Test Suite

```bash
# From project root
npm test

# Includes backend unit/integration suites.
# CI also runs a dedicated MySQL-backed E2E suite for:
# - auth login flow
# - health log create/list
# - finance log create/list

# Verbose mode (see each test name):
npm test -- --verbose

# Single suite:
npx jest tests/insightEngine.test.js --verbose
```

**Note:** Local unit tests run without MySQL; CI runs an additional MySQL service-container E2E gate.

---

## Verifying the Production Build

```bash
cd client
npm run build

# Expected output:
# Build requires:
# - VITE_API_URL
# - VITE_GOOGLE_CLIENT_ID
# The build preflight will fail if either is missing or misaligned with release baselines.
```

---

## Seed Demo Data (Optional)

```bash
# After backend is running:
node server/seeders/seed.js

# Creates demo user: admin@lifesync.com / Admin123!
# Plus sample health logs, finance entries, and categories
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED :3306` | MySQL not running. Start: `sudo systemctl start mysql` |
| `ER_NOT_SUPPORTED_AUTH_MODE` | Run in MySQL: `ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'password';` |
| Build fails preflight | Missing/invalid `VITE_API_URL` or `VITE_GOOGLE_CLIENT_ID` | Set both variables before `npm run build` |
| NLP/API probe fails | HF or Railway service issue | Run `npm run probe:external` and check endpoint health |
| `SMTP errors on registration` | OTP emails won't send. Use test mode or set SMTP credentials. |
| Port 5000 in use | Change `PORT` in `.env` |
| Port 5173 in use | Vite auto-picks next port (5174, etc.) |

---

*LifeSync — COMP4200 Graduation Project · Birzeit University*
