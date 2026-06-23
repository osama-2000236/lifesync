# LifeSync — How to Run the Project on a Fresh Device (Partner Guide)

**For:** Abdallah Aabed & Adam Weheidi
**From:** Osama
**Project:** LifeSync — Smart Life Management System (COMP4200, Birzeit University)

This guide gets the whole project running on a brand-new computer **from zero**, step by step.
You do not need to understand the code — just follow each step in order. Copy/paste the commands.

## ⭐ Easiest way (one command)

After the prerequisites (step 1) and a **one-time setup**, you start the whole project — database, AI model,
backend, and website — with a single command, and it opens in your browser automatically.

```bash
npm run setup     # ONE time only — installs everything + creates the database
npm start         # every time — starts MySQL + BERT + backend + frontend, opens the browser
```

**Windows users:** you can just **double-click**:
- `setup.bat`  → one time
- `start.bat`  → every time

Press **Ctrl+C** in the window to stop everything. To use **Gemma / Custom** models, also open **LM Studio**
and load a model — the launcher tells you if it's detected.

> Prefer to understand each piece, or the one-command way fails? Use the manual steps below.

---

There are also two manual ways to run it:

- **Option A — Local (full manual control).** Install/run each part yourself. ~20 min.
- **Option B — Docker (one command).** Needs Docker Desktop. Easiest if you just want it running.

---

## 0) What the app is (30-second mental model)

LifeSync has **4 parts** that run at the same time:

| Part | What it is | Port |
|------|-----------|------|
| **MySQL** | the database | 3306 |
| **Backend** | Node.js API (Express) | 5000 |
| **BERT runtime** | local AI model (Python) that reads your messages | 1235 |
| **Frontend** | the website you click on (React) | 5173 |

The default AI is **LifeSync BERT**, which runs **on your own machine** (no internet/API key needed).
You chat in plain English ("I walked 8000 steps", "spent $15 on lunch") and it logs your health & money and updates the dashboard.

---

## 1) Install the prerequisites (do this once)

Install these programs. On Windows, the easiest way is the official installers; on Mac use Homebrew.

1. **Git** — https://git-scm.com/downloads
2. **Node.js 20 LTS (or newer)** — https://nodejs.org → check with:
   ```bash
   node -v      # should print v20.x or higher
   npm -v
   ```
3. **Python 3.10+** — https://www.python.org/downloads (on Windows, tick **"Add Python to PATH"**)
   ```bash
   python --version   # 3.10 – 3.13
   ```
4. **MySQL 8** — https://dev.mysql.com/downloads/installer/
   - Remember the **root password** you set during install — you need it later.
   - Make sure the MySQL service is **running** (Windows: Services → MySQL → Start).

> **Tip (Windows):** you can install everything quickly with [Scoop](https://scoop.sh):
> `scoop install nodejs python mysql git`

---

## 2) Get the code

```bash
git clone <YOUR_REPO_URL> lifesync
cd lifesync
```

If Osama gave you a ZIP instead, unzip it and `cd` into the `lifesync` folder.

---

## 3) Create the database

Open a terminal and log in to MySQL (it will ask for the root password from step 1):

```bash
mysql -u root -p
```

Then inside the `mysql>` prompt, run:

```sql
CREATE DATABASE lifesync_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

---

## 4) Configure environment variables

The backend reads settings from a file called **`.env`** in the project root.

```bash
# from the lifesync folder
cp .env.example .env        # Windows PowerShell: copy .env.example .env
```

Open `.env` in any text editor and set **at least** these values:

```env
NODE_ENV=development
PORT=5000

# --- Database (match what you created in step 3) ---
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=lifesync_db
DB_USER=root
DB_PASSWORD=YOUR_MYSQL_ROOT_PASSWORD

# --- Security (any long random strings are fine for local) ---
JWT_SECRET=change-me-to-a-long-random-string
JWT_REFRESH_SECRET=change-me-to-another-long-random-string
ENCRYPTION_KEY=32charactersexactly_changeme1234

# --- AI: use the local BERT model by default ---
AI_PROVIDER=bert_local
CHAT_AI_PROVIDER=bert_local
INSIGHTS_AI_PROVIDER=bert_local
BERT_RUNTIME_BASE_URL=http://127.0.0.1:1235
BERT_MODEL_NAME=bert_best_model_10pct
```

> You can leave the Firebase, Google, and SMTP values as the placeholders — the app runs fine without them
> (Firebase real-time sync and email OTP are simply disabled locally).

The frontend has its own env file. It already points at the backend, but if it's missing:

```bash
# from the lifesync folder
copy client\.env.example client\.env     # macOS/Linux: cp client/.env.example client/.env
```
Make sure `client/.env` contains:
```env
VITE_API_URL=http://localhost:5000/api
```

---

## 5) Install the project dependencies

```bash
# from the lifesync folder
npm install            # backend dependencies
npm --prefix client install   # frontend dependencies
```

This downloads everything the backend and the website need. It can take a few minutes the first time.

---

## 6) Set up the local AI (BERT) — Python side

The AI model lives in `model_runtime/`. Create a Python virtual environment and install its packages:

```bash
cd model_runtime
python -m venv .venv

# activate it:
#   Windows (PowerShell):
.venv\Scripts\Activate.ps1
#   macOS / Linux:
source .venv/bin/activate

pip install -r requirements.txt
cd ..
```

> The model files are already in the repo (`bert_best_model_10pct/` and `model_runtime/artifacts/`),
> so you do **not** need to download or train anything. The runtime automatically uses your **GPU** if
> available (DirectML on Windows) and falls back to **CPU** otherwise.

---

## 7) Start everything (4 terminals)

Open **four** terminal windows in the `lifesync` folder and run one command in each.

**Terminal 1 — make sure MySQL is running** (installed as a service in step 1, usually already up).

**Terminal 2 — the local AI (BERT) runtime:**
```bash
npm run model:serve:gpu
# (CPU-only machine? use:  npm run model:serve:cpu )
```
Wait until it prints that it is ready, then leave it running.

**Terminal 3 — the backend API:**
```bash
npm run dev
```
You should see: `🚀 LifeSync server running on port 5000`.
The first start automatically creates all the database tables.

**Terminal 4 — the frontend website:**
```bash
npm --prefix client run dev
```
You should see a local URL like `http://localhost:5173`.

---

## 8) Open the app & create your account

1. Open **http://localhost:5173** in your browser.
2. Click **Create one** / **Register**.
3. Because email sending is off locally, the simplest way to get an account for testing is to ask Osama
   for the demo credentials, or create one with the QA helper:
   ```bash
   # from the lifesync folder, in a spare terminal
   #   set a test email + password, then run the helper
   #   Windows PowerShell:
   $env:TEST_USER_EMAIL="you@test.local"; $env:TEST_USER_PASSWORD="Passw0rd1"; node scripts/provision-qa-user.js
   #   macOS/Linux:
   TEST_USER_EMAIL=you@test.local TEST_USER_PASSWORD=Passw0rd1 node scripts/provision-qa-user.js
   ```
   Then log in with that email/password.
4. On first login you'll go through a short **onboarding**: pick your **AI model** (keep **LifeSync BERT**),
   choose health & finance goals, then land on the **Dashboard**.

---

## 9) Try it (this is the fun part)

Go to **Assistant** (the chat) and type things like:

- `I walked 8000 steps today`
- `Slept 7 hours last night`
- `Spent $15 on lunch`
- `Feeling great, mood 8/10`
- `My name is Osama and I have a car`   ← the assistant **remembers** this
- `I'm going to town`   ← it asks **"by car, by bus, or walking?"** and connects it to your money & health

Watch the **Dashboard** update automatically after you log something.

**Switch models / upload your own:** open the **model menu** (top-right of the chat). You can pick
**BERT (default), Gemma 4, Gemma 3,** or **Custom model** (upload a local model file or paste an
OpenAI-compatible endpoint). Your memory and history carry over when you switch.

**Change your default model later:** Settings (your name, bottom-left) → **Assistant Model**.

---

## Option B — Run with Docker (one command)

If you have **Docker Desktop** installed, you can skip most of the steps above:

```bash
cd lifesync
cp .env.example .env     # edit DB_PASSWORD etc. as in step 4
docker-compose up -d
```

This starts MySQL + backend + frontend together. Open the URL shown (usually **http://localhost** or `:8080`).
*(Note: the local BERT Python runtime is run separately as in step 7, Terminal 2.)*

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| `Unable to connect to mysql` | MySQL service isn't running, or `DB_PASSWORD` in `.env` is wrong. Start MySQL and double-check the password. |
| Backend exits immediately | Usually the database — see the line above. Also confirm `lifesync_db` exists (step 3). |
| Chat says "AI offline / Limited" | The BERT runtime (Terminal 2) isn't running. Start `npm run model:serve:gpu`. The app still works in a reduced rule-based mode if it can't start. |
| `npm run model:serve:gpu` fails | Your machine has no supported GPU. Use `npm run model:serve:cpu` instead. |
| Website loads but every action fails / logs you out | The frontend can't reach the backend. Confirm the backend is on port 5000 and `client/.env` has `VITE_API_URL=http://localhost:5000/api`. |
| Port already in use | Something else uses 5000/5173/3306. Close it, or change the port in `.env` / the dev command. |
| Can't register (no email) | Email/OTP is disabled locally. Use the `provision-qa-user.js` helper in step 8. |

---

## Quick command cheat-sheet

```bash
# one-time setup
npm install
npm --prefix client install
cd model_runtime && python -m venv .venv && .venv\Scripts\Activate.ps1 && pip install -r requirements.txt && cd ..

# every time you run the project (4 terminals)
npm run model:serve:gpu        # Terminal 2 — local AI
npm run dev                    # Terminal 3 — backend  (http://localhost:5000)
npm --prefix client run dev    # Terminal 4 — frontend (http://localhost:5173)

# run the automated tests (optional, proves everything works)
npm test                       # 227 backend tests
```

That's it. If anything is stuck, send Osama the **exact** error text from the terminal.
