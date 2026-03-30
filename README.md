# LifeSync — Smart Life Management System

**AI-powered health and finance tracking via natural language.**
Graduation Project — Birzeit University

---

## Quick Start

### Backend
```bash
cd lifesync
npm install
cp .env.example .env          # Edit with MySQL, JWT, OpenAI keys
mysql -u root -p -e "CREATE DATABASE lifesync_db;"
npm run seed                  # Seeds categories + admin
npm run dev                   # http://localhost:5000
npm test                      # 75 tests
```

### Frontend
```bash
cd lifesync/client
npm install
cp .env.example .env
npm run dev                   # http://localhost:5173
npm run build                 # Production build → dist/
```

Default admin: **admin@lifesync.app** / **Admin@123456**

---

## Architecture

```
lifesync/
├── server/                          # Express.js Backend
│   ├── config/                      # DB, Firebase, Sequelize CLI
│   ├── controllers/                 # Auth (OTP), Chat (NLP), Health, Finance, Admin
│   ├── middleware/                   # JWT auth, role check, validation, error handler
│   ├── migrations/                  # Full schema with 9 tables
│   ├── models/                      # User, HealthLog, FinancialLog, Category, etc.
│   ├── routes/                      # RESTful API routes
│   ├── seeders/                     # 18 default categories + admin user
│   ├── services/
│   │   ├── ai/nlpService.js         # OpenAI NLP with clarification logic
│   │   ├── ai/insightsService.js    # Weekly AI insight generation
│   │   └── otpService.js            # Two-step email OTP
│   └── utils/                       # Tokens, encryption, response helpers
├── client/                          # React.js Frontend (Vite)
│   └── src/
│       ├── components/
│       │   ├── dashboard/           # HealthCorrelationChart, SpendingChart,
│       │   │                        # MoodActivityChart, InsightCards
│       │   ├── layout/AppLayout.jsx # Sidebar navigation
│       │   └── ui/Skeleton.jsx      # Loading skeletons
│       ├── contexts/AuthContext.jsx  # JWT session management
│       ├── pages/
│       │   ├── LoginPage.jsx        # Login form
│       │   ├── RegisterPage.jsx     # 3-step OTP registration
│       │   ├── DashboardPage.jsx    # Unified health + finance dashboard
│       │   ├── ChatPage.jsx         # Conversational AI assistant
│       │   ├── HealthPage.jsx       # Health log CRUD list
│       │   ├── FinancePage.jsx      # Finance log CRUD list
│       │   └── AdminPage.jsx        # Admin monitoring portal
│       ├── services/
│       │   ├── api.js               # Axios with JWT interceptor
│       │   └── firebase.js          # Real-time chat subscription
│       └── styles/globals.css       # Tailwind + design tokens
└── tests/                           # Jest test suites (75 tests)
```

---

## API Endpoints

### Registration (Two-Step OTP — SR1.2)
| Step | Endpoint | Body |
|------|----------|------|
| 1 | `POST /api/auth/register/send-otp` | `{ email }` |
| 1.5 | `POST /api/auth/register/verify-otp` | `{ email, code }` |
| 2 | `POST /api/auth/register/complete` | `{ email, username, password }` |

### NLP Chat (with clarification flow)
| Endpoint | Description |
|----------|-------------|
| `POST /api/chat` | Send message → NLP → entities or clarification |
| `GET /api/chat/history` | Chat history with pagination |
| `GET /api/chat/sessions` | List all sessions |

### Health & Finance CRUD
`/api/health-logs` and `/api/finance` — standard CRUD + weekly summaries

### Admin
`/api/admin/dashboard` · `/api/admin/users` · `/api/admin/logs`

---

## Key Features

### NLP Clarification Flow
```
User: "I spent 10"
Bot:  "What was the $10 for?"
      [Food] [Transport] [Shopping] [Other]     ← Quick-action buttons
User: clicks [Food]
Bot:  "Logged $10 expense for Food & Dining! 🍽️"
```

### Cross-Domain Linking
```
User: "Spent $50 on a healthy dinner"
→ FinancialLog: $50 expense (Food & Dining)
→ HealthLog: nutrition (healthy dinner)
→ LinkedDomain: bridge record with 0.85 confidence
```

### Dashboard Visualizations
- **Health Trends**: Multi-line Chart.js (Steps + Sleep correlation)
- **Spending**: Doughnut/Bar chart by expense category
- **Mood vs. Activity**: Scatter plot with color-coded mood levels
- **AI Insight Cards**: Cross-domain pattern detection with scores

### Security
- Bcrypt password hashing (12 salt rounds)
- JWT access/refresh token pair
- AES-256 field encryption for sensitive text data
- Helmet security headers + CORS + rate limiting
- Protected routes with JWT middleware
- Admin role-based access control

---

## Tech Stack
**Backend**: Express.js · Sequelize (MySQL) · Firebase Admin · OpenAI API · JWT · Bcrypt
**Frontend**: React 19 · Vite · Tailwind CSS v4 · Chart.js · D3.js · React Router · Axios · Firebase Client
**Testing**: Jest (75 tests across 4 suites)

---

## Test Coverage
```
4 suites, 75 tests:
├── nlp.test.js        → 39 tests (entity validation, normalization, classification)
├── otp.test.js        → 16 tests (OTP lifecycle)
├── encryption.test.js → 17 tests (AES encrypt/decrypt)
└── app.test.js        →  3 tests (Express configuration)
```
