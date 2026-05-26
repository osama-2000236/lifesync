# LifeSync Team Local Setup

This guide is for teammates who want to run LifeSync on their own machines for development, demos, or grading.

PowerShell examples are used below. On macOS or Linux, the commands are the same except `Copy-Item` becomes `cp`.

## Recommended Path

For most teammates, use the hosted Hugging Face endpoint for chat parsing and keep Gemini enabled for insights.

That gives you:

- local backend
- local frontend
- local MySQL/MariaDB
- no local AI model download

Use the optional local Gemma section only if you specifically want the chat model running on your own device.

## Prerequisites

Install these first:

- Node.js 20+
- npm 10+
- MySQL 8+ or MariaDB 10.11+
- Git

Optional, only if you want local Gemma:

- Python 3.11+
- a Hugging Face token with access to the Gemma model

## 1. Clone The Repo

```powershell
git clone https://github.com/osama-2000236/lifesync.git
cd .\lifesync
```

## 2. Install Dependencies

```powershell
npm install
npm run install:client
```

If `npm run install:client` fails in your environment, run:

```powershell
npm --prefix client install
```

## 3. Create The Local Database

Open MySQL or MariaDB and create a database:

```sql
CREATE DATABASE lifesync_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 4. Create Environment Files

### Backend `.env`

Create the file:

```powershell
Copy-Item .env.example .env
```

Use this as the minimum working backend config:

```env
NODE_ENV=development
PORT=5000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=lifesync_db
DB_USER=root
DB_PASSWORD=your_mysql_password

JWT_SECRET=replace_with_a_real_32_plus_char_secret
JWT_REFRESH_SECRET=replace_with_a_second_real_secret
ENCRYPTION_KEY=replace_with_a_real_32_plus_char_key

AI_PROVIDER=custom_hf
CHAT_AI_PROVIDER=custom_hf
INSIGHTS_AI_PROVIDER=gemini

CUSTOM_HF_ENDPOINT=https://os-1202883-lifesync-api.hf.space
CUSTOM_HF_MODEL=google/gemma-4-E2B-it

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash

GOOGLE_AUTH_CLIENT_IDS=your_google_web_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your_google_web_client_id.apps.googleusercontent.com

APP_URL=http://localhost:5000
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

Important notes:

- `CUSTOM_HF_ENDPOINT` above uses the hosted Space, which is the easiest setup for teammates.
- `GOOGLE_AUTH_CLIENT_IDS` must include the same web client ID used by the frontend.
- Firebase credentials are optional for local development.
- SMTP credentials are optional in development.

### Frontend `client/.env`

Create the file:

```powershell
Copy-Item .\client\.env.example .\client\.env
```

Set:

```env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_CLIENT_ID=your_google_web_client_id.apps.googleusercontent.com
```

## 5. Start The Backend

From the repo root:

```powershell
npm run dev
```

What to expect:

- the backend will connect to MySQL
- Sequelize will auto-sync the tables in development
- Firebase may print a warning if it is not configured

Health check:

```text
http://localhost:5000/api/health
```

Expected result: JSON with `"success": true`

## 6. Start The Frontend

In a second terminal:

```powershell
cd .\client
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

Important:

- open `http://localhost:5173/login` for the login page
- do not open `http://localhost:5000/login`
- port `5000` is the API server, not the React app

## 7. Optional Demo Data

If you want sample categories and a local admin user:

```powershell
cd .\
npm run seed
```

Local-only seeded admin account:

- email: `admin@lifesync.app`
- password: `Admin@123456`

## 8. Optional Local Gemma Setup

Only use this if you want the chat model running on your own machine.

### Extra backend `.env` values

Change these values in `.env`:

```env
CUSTOM_HF_ENDPOINT=http://127.0.0.1:7860
HF_TOKEN=your_hugging_face_token
HF_HUB_DISABLE_XET=1
HF_SPACE_QUANTIZATION=none
```

Why `HF_SPACE_QUANTIZATION=none`:

- this is the most reliable option we verified on Windows CPU-only machines
- if TorchAO int4 works on another machine, teammates can try `HF_SPACE_QUANTIZATION=int4_cpu`
- if they see `mslk` or TorchAO conversion errors, switch back to `none`

### Install and run the local model service

From the repo root:

```powershell
npm run hf:install
npm run hf:dev
```

Local Gemma endpoint:

```text
http://127.0.0.1:7860/gradio_api/info
```

Notes:

- the first startup can take a while because the model downloads
- the model used by this repo is `google/gemma-4-E2B-it`
- if local Gemma is not running, chat can still work through the hosted HF endpoint if you switch `CUSTOM_HF_ENDPOINT` back

## 9. Development Behavior To Expect

### OTP / email

In development:

- if SMTP is configured, OTP emails are sent normally
- if SMTP is not configured, the app falls back to an Ethereal test account when possible
- if Ethereal cannot be created, the OTP is logged to the backend console

So teammates can still test registration and password reset locally without production mail infrastructure.

### Firebase

Firebase is optional locally.

If it is not configured, the backend will start and print a warning. Firebase-backed features will be skipped.

### Google sign-in

Google sign-in needs both:

- backend `GOOGLE_AUTH_CLIENT_IDS`
- frontend `VITE_GOOGLE_CLIENT_ID`

Those should point to the same Google web client ID.

## 10. Common Issues

### MySQL connection refused

Symptoms:

- backend exits during startup
- error mentions `3306`, `ECONNREFUSED`, or authentication

Fixes:

- make sure MySQL or MariaDB is running
- verify `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD`
- confirm the `lifesync_db` database exists

### Frontend loads, but API calls fail

Check:

- backend is running on `http://localhost:5000`
- `client/.env` contains `VITE_API_URL=http://localhost:5000/api`
- CORS includes `http://localhost:5173`

### Google login fails

Check:

- `VITE_GOOGLE_CLIENT_ID` is set
- `GOOGLE_AUTH_CLIENT_IDS` includes the same client ID

### Local Gemma does not start

Recommended fallback:

- switch `CUSTOM_HF_ENDPOINT` back to `https://os-1202883-lifesync-api.hf.space`
- keep Gemini enabled for insights

If teammates still want local Gemma:

- confirm `HF_TOKEN` is valid
- confirm they accepted the model license on Hugging Face
- use `HF_SPACE_QUANTIZATION=none` on Windows if int4 fails

## Quick Start Summary

If someone just needs the app running fast:

1. Install Node, npm, and MySQL/MariaDB.
2. Clone the repo.
3. Run `npm install` and `npm run install:client`.
4. Create `lifesync_db`.
5. Fill in `.env` and `client/.env`.
6. Run `npm run dev`.
7. Run `npm --prefix client run dev`.
8. Open `http://localhost:5173/login`.
