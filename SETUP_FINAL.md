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
DB_PASS=your_mysql_password

# ─── Security (change in production) ───
JWT_SECRET=your_jwt_secret_minimum_32_characters_long
JWT_REFRESH_SECRET=your_refresh_secret_minimum_32_chars
ENCRYPTION_KEY=your_encryption_key_exactly_32ch!

# ─── Optional (for full NLP features) ───
OPENAI_API_KEY=sk-...

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

### Step 5: Start the Frontend

```bash
# In a second terminal
cd client
npm run dev
# Output: VITE v6.x ready in XXXms
#   ➜ Local: http://localhost:5173/
```

### Step 6: Verify Everything Works

```bash
# Health check (should return JSON)
curl http://localhost:5000/api/health

# Open browser
open http://localhost:5173
```

---

## Running the Test Suite (97 Tests)

```bash
# From project root
npm test

# Expected output:
# PASS tests/nlp.test.js          (39 tests)
# PASS tests/otp.test.js          (16 tests)
# PASS tests/encryption.test.js   (17 tests)
# PASS tests/insightEngine.test.js (22 tests)
# PASS tests/app.test.js          (3 tests)
#
# Test Suites: 5 passed, 5 total
# Tests:       97 passed, 97 total

# Verbose mode (see each test name):
npm test -- --verbose

# Single suite:
npx jest tests/insightEngine.test.js --verbose
```

**Note:** Tests run without MySQL or OpenAI — they test pure logic (entity validation, Pearson correlation, encryption, OTP generation) using mocked data.

---

## Verifying the Production Build

```bash
cd client
npm run build

# Expected output:
# dist/assets/index-*.js        ~294 KB  (core bundle)
# dist/assets/DashboardPage-*.js ~205 KB  (lazy chunk)
# dist/assets/ChatPage-*.js      ~263 KB  (lazy chunk)
# dist/assets/AdminPage-*.js     ~8 KB    (lazy chunk)
# ✓ built in ~10s
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
| `OPENAI_API_KEY not set` | NLP chat will return fallback responses. Set key for full functionality. |
| `SMTP errors on registration` | OTP emails won't send. Use test mode or set SMTP credentials. |
| Port 5000 in use | Change `PORT` in `.env` |
| Port 5173 in use | Vite auto-picks next port (5174, etc.) |

---

*LifeSync — COMP4200 Graduation Project · Birzeit University*
