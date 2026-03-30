# LifeSync — Final Assembly Map
## Complete System Architecture · 78 Files · 10,008 Lines · 97 Tests

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DOCKER COMPOSE                              │
│  ┌──────────┐    ┌──────────────────────┐    ┌──────────────────┐  │
│  │  MySQL 8  │◄──│  Node.js API (5000)   │◄──│ React/Nginx (80) │  │
│  │  3306     │   │  Express + Sequelize   │   │ Vite + Tailwind  │  │
│  └──────────┘   └──────────────────────┘   └──────────────────┘  │
│       ▲               ▲        ▲                    ▲              │
│       │               │        │                    │              │
│   Migrations     Firebase    OpenAI           Google Fonts         │
│   Seeders        Firestore   GPT-4            CDN Assets          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete File Tree (78 files)

```
lifesync/
├── .env.example                          # Environment template
├── .github/workflows/ci.yml             # GitHub Actions CI pipeline
├── Dockerfile                            # Backend production image
├── docker-compose.yml                    # Full stack orchestration
├── jest.config.js                        # Test configuration
├── package.json                          # Backend dependencies
├── README_USER.md                        # User manual
├── README_ADMIN.md                       # Admin manual
│
├── server/                               # ═══ BACKEND (37 files) ═══
│   ├── app.js                            # Express entry point (136 lines)
│   ├── config/
│   │   ├── database.js                   # Sequelize MySQL connection
│   │   ├── firebase.js                   # Firebase Admin SDK init
│   │   └── sequelize-cli.js              # CLI config for migrations
│   ├── controllers/
│   │   ├── authController.js             # Login/register/OTP/refresh (324 lines)
│   │   ├── chatController.js             # NLP message processing (426 lines)
│   │   ├── healthController.js           # CRUD health logs (279 lines)
│   │   ├── financeController.js          # CRUD finance logs (280 lines)
│   │   └── adminController.js            # Admin dashboard data (195 lines)
│   ├── middleware/
│   │   ├── auth.js                       # JWT verification
│   │   ├── errorHandler.js               # Global error handler
│   │   ├── rateLimiter.js                # 5-tier rate limits (115 lines)
│   │   ├── roleCheck.js                  # Admin role guard
│   │   └── validate.js                   # Request validation
│   ├── migrations/
│   │   └── 20250208-001-initial-schema.js # Full DB schema (567 lines)
│   ├── models/
│   │   ├── index.js                      # Model registry + associations
│   │   ├── User.js                       # Users table
│   │   ├── HealthLog.js                  # Health entries
│   │   ├── FinancialLog.js               # Finance entries
│   │   ├── ChatLog.js                    # Chat messages
│   │   ├── Category.js                   # Spending categories
│   │   ├── AISummary.js                  # Persisted insight snapshots
│   │   ├── LinkedDomain.js               # Cross-domain links
│   │   ├── UserGoal.js                   # User-set goals
│   │   └── SystemLog.js                  # Audit/error logs
│   ├── routes/
│   │   ├── authRoutes.js                 # /api/auth/*
│   │   ├── chatRoutes.js                 # /api/chat/*
│   │   ├── healthRoutes.js               # /api/health-logs/*
│   │   ├── financeRoutes.js              # /api/finance/*
│   │   ├── adminRoutes.js                # /api/admin/*
│   │   ├── insightsRoutes.js             # /api/insights/*
│   │   └── externalRoutes.js             # /api/external/*
│   ├── services/
│   │   ├── ai/
│   │   │   ├── insightEngine.js          # ★ AI INSIGHT ENGINE (666 lines)
│   │   │   ├── insightsService.js        # Persistence layer (116 lines)
│   │   │   └── nlpService.js             # OpenAI NLP + clarification (389 lines)
│   │   ├── external/
│   │   │   ├── healthAdapter.js          # Abstract adapter interface (52 lines)
│   │   │   ├── googleFitAdapter.js       # Google Fit OAuth2 + API (263 lines)
│   │   │   └── appleHealthAdapter.js     # Apple HealthKit bridge (107 lines)
│   │   └── otpService.js                 # OTP generation/verification (277 lines)
│   ├── seeders/
│   │   └── seed.js                       # Demo data seeder
│   └── utils/
│       ├── encryption.js                 # AES-256-CBC field encryption
│       ├── responseHelper.js             # Standardized JSON responses
│       └── tokenUtils.js                 # JWT sign/verify/refresh
│
├── client/                               # ═══ FRONTEND (21 files) ═══
│   ├── .env.example                      # Frontend env template
│   ├── Dockerfile                        # Multi-stage Nginx build
│   ├── nginx.conf                        # Nginx + reverse proxy + security
│   ├── package.json                      # Frontend dependencies
│   ├── vite.config.js                    # Vite + Tailwind v4 + proxy
│   └── src/
│       ├── main.jsx                      # React entry point
│       ├── App.jsx                       # Router + lazy loading + guards
│       ├── contexts/
│       │   └── AuthContext.jsx            # JWT session management
│       ├── services/
│       │   ├── api.js                    # Axios + interceptors + 5 API modules
│       │   └── firebase.js               # Real-time Firestore subscription
│       ├── styles/
│       │   └── globals.css               # Design system tokens + animations
│       ├── pages/
│       │   ├── LoginPage.jsx             # Split-screen login (141 lines)
│       │   ├── RegisterPage.jsx          # 3-step OTP registration (225 lines)
│       │   ├── DashboardPage.jsx         # ★ Unified dashboard (183 lines)
│       │   ├── ChatPage.jsx              # Conversational UI (376 lines)
│       │   ├── HealthPage.jsx            # Health log CRUD (143 lines)
│       │   ├── FinancePage.jsx           # Finance log CRUD (135 lines)
│       │   └── AdminPage.jsx             # Admin monitoring portal (208 lines)
│       └── components/
│           ├── layout/
│           │   └── AppLayout.jsx          # Sidebar + mobile nav (127 lines)
│           ├── ui/
│           │   └── Skeleton.jsx           # Loading skeletons
│           └── dashboard/
│               ├── HealthCorrelationChart.jsx  # Steps + Sleep trends (132 lines)
│               ├── SpendingChart.jsx            # Doughnut + Bar (167 lines)
│               ├── MoodActivityChart.jsx        # Scatter plot (127 lines)
│               └── InsightCards.jsx             # ★ AI insight display (124 lines)
│
└── tests/                                # ═══ TEST SUITE (5 files, 97 tests) ═══
    ├── app.test.js                       # Server bootstrap (3 tests)
    ├── nlp.test.js                       # NLP parsing + entities (39 tests)
    ├── otp.test.js                       # OTP flow (16 tests)
    ├── encryption.test.js                # AES encryption (17 tests)
    └── insightEngine.test.js             # AI pattern detectors (22 tests)
```

---

## 3. ★ Critical Data Pipeline: AI Insight Engine → Dashboard

This is the most important cross-cutting flow in the system. It spans 8 files across backend and frontend.

```
 ┌─────────────────────── BACKEND ───────────────────────────┐

 MySQL Tables                 Insight Engine                  API Layer
 ┌───────────┐               ┌───────────────────────┐       ┌───────────────────┐
 │HealthLog  │──┐            │ insightEngine.js      │       │ insightsRoutes.js │
 │           │  │            │ (666 lines)           │       │                   │
 │ - steps   │  │            │                       │       │ GET /api/insights │
 │ - sleep   │  ├─gatherWeek │ ┌─────────────────┐  │       │   → runInsightEng │
 │ - mood    │  │   Data()   │ │ 4 DETECTORS:    │  │       │                   │
 │ - water   │  │            │ │                 │  │──────►│ POST /api/insights│
 │ - exercise│  │            │ │ 1. Sleep↔Spend  │  │       │   /generate       │
 │ - heart   │  │            │ │ 2. Mood↔Nutri   │  │       │   → persist to    │
 │ - nutri   │  │            │ │ 3. SmartBudget  │  │       │     AISummary     │
 └───────────┘  │            │ │ 4. Activity↔Mood│  │       │                   │
                │            │ └─────────────────┘  │       │ GET /api/insights │
 ┌───────────┐  │            │                       │       │   /history        │
 │FinancialLog──┘            │ + pearsonCorrelation  │       │   → stored past   │
 │           │               │ + calculateHealthScore│       │     insights      │
 │ - income  │               │ + calculateFinScore   │       └───────────────────┘
 │ - expense │               │ + trend()             │
 │ - category│               └───────────────────────┘
 └───────────┘                        │
                                      │ Returns JSON:
                                      ▼
                              {
                                summary: "...",
                                patterns: [...],
                                recommendations: [...],
                                health_score: 72,
                                financial_health_score: 65,
                                mood_trend: "improving",
                                spending_trend: "stable",
                                cross_domain_insights: "...",
                                budget_summary: { income, expenses, savings_rate, ... }
                              }

 └───────────────────── BACKEND ─────────────────────────────┘

                              │
                    HTTP (Axios + JWT)
                              │
                              ▼

 ┌─────────────────────── FRONTEND ──────────────────────────┐

  api.js                     DashboardPage.jsx          InsightCards.jsx
  ┌──────────────┐           ┌─────────────────┐        ┌──────────────────┐
  │ insightsAPI  │           │ useEffect:      │        │ Props:           │
  │ .getCurrent()│──────────►│ insightsAPI     │───────►│  insights={...}  │
  │              │           │ .getCurrent()   │        │                  │
  │ Axios GET    │           │                 │        │ Renders:         │
  │ /api/insights│           │ Sets state:     │        │ • Health Score   │
  │ + JWT header │           │  insights={...} │        │ • Finance Score  │
  └──────────────┘           │                 │        │ • Mood trend ↗↘  │
                             │ Also fetches:   │        │ • Spend trend    │
                             │ • healthAPI     │        │ • Patterns list  │
                             │ • financeAPI    │        │ • Recommendations│
                             │ (for charts)    │        │ • Cross-domain   │
                             └─────────────────┘        │   narrative      │
                                    │                   └──────────────────┘
                                    │
                         ┌──────────┼──────────────┐
                         ▼          ▼              ▼
                  HealthCorr   SpendingChart  MoodActivity
                  Chart.jsx    .jsx           Chart.jsx
                  (Chart.js    (Doughnut+     (Scatter
                   dual-axis)   Bar toggle)    plot)

 └───────────────────── FRONTEND ────────────────────────────┘
```

### File-by-File Trace:

| Step | File | Action |
|------|------|--------|
| 1 | `client/src/pages/DashboardPage.jsx:33` | Calls `insightsAPI.getCurrent()` |
| 2 | `client/src/services/api.js:99` | Sends `GET /api/insights` with JWT |
| 3 | `server/middleware/rateLimiter.js:67` | Applies `insightLimiter` (5/15min) |
| 4 | `server/middleware/auth.js` | Validates JWT, extracts `req.user.id` |
| 5 | `server/routes/insightsRoutes.js:17` | Calls `runInsightEngine(userId)` |
| 6 | `server/services/ai/insightEngine.js:84` | `gatherWeekData()` → queries MySQL |
| 7 | `server/models/HealthLog.js` | Sequelize parameterized query (no SQL injection) |
| 8 | `server/models/FinancialLog.js` | Joins Category for expense names |
| 9 | `server/services/ai/insightEngine.js:169` | Detector 1: `detectSleepSpendingCorrelation()` |
| 10 | `server/services/ai/insightEngine.js:234` | Detector 2: `detectMoodNutritionImpact()` |
| 11 | `server/services/ai/insightEngine.js:300` | Detector 3: `detectBudgetPatterns()` |
| 12 | `server/services/ai/insightEngine.js:387` | Detector 4: `detectActivityMoodLink()` |
| 13 | `server/services/ai/insightEngine.js:436` | `calculateHealthScore()` + `calculateFinancialScore()` |
| 14 | `server/services/ai/insightEngine.js:510` | Assembles full insight JSON |
| 15 | `server/utils/responseHelper.js` | Wraps in `{ success: true, data: { insights } }` |
| 16 | `client/src/pages/DashboardPage.jsx:40` | `setInsights(response.data.data.insights)` |
| 17 | `client/src/components/dashboard/InsightCards.jsx` | Renders scores, trends, recommendations |

---

## 4. Authentication & Security Flow

```
                    ┌─── Registration (3-Step OTP) ───┐
                    │                                   │
RegisterPage.jsx    │  Step 1: Email                    │  authController.js
  (225 lines)       │    POST /api/auth/register/       │    (324 lines)
                    │         send-otp                  │
                    │    → otpService.generate()        │  otpService.js
                    │    → sends 6-digit email          │    (277 lines)
                    │                                   │
                    │  Step 2: Verify OTP               │
                    │    POST /api/auth/register/       │
                    │         verify-otp                │
                    │    → otpService.verify()          │
                    │                                   │
                    │  Step 3: Complete                  │
                    │    POST /api/auth/register/       │
                    │         complete                  │
                    │    → bcrypt hash password         │
                    │    → User.create()                │
                    │    → JWT pair issued              │
                    └───────────────────────────────────┘

                    ┌─── Login + Session ───┐
                    │                        │
LoginPage.jsx       │  POST /api/auth/login  │  tokenUtils.js
  (141 lines)       │    → bcrypt.compare    │    JWT sign/verify
                    │    → accessToken (15m) │
AuthContext.jsx     │    → refreshToken (7d) │  middleware/auth.js
  (JWT mgmt)        │                        │    JWT verification
                    │  Auto-refresh:         │
api.js              │    401 → POST /refresh │  rateLimiter.js
  (interceptors)    │    → new token pair    │    authLimiter: 10/15min
                    │    → retry request     │    otpLimiter: 3/5min
                    └────────────────────────┘
```

### Security Layers:

| Layer | File | Protection |
|-------|------|------------|
| Transport | `nginx.conf` | Security headers (X-Frame, CSP, HSTS-ready) |
| Rate Limiting | `rateLimiter.js` | 5 tiers: auth(10/15m), OTP(3/5m), chat(30/5m), insight(5/15m), general(100/15m) |
| CORS | `app.js:34` | Configurable origin whitelist, credentials mode |
| Authentication | `middleware/auth.js` | JWT verification on all protected routes |
| Authorization | `middleware/roleCheck.js` | Admin-only route guard |
| SQL Injection | `models/*.js` | Sequelize parameterized queries (never raw SQL) |
| Encryption at Rest | `utils/encryption.js` | AES-256-CBC for sensitive fields |
| Password | `authController.js` | bcrypt with salt rounds |
| Input Validation | `middleware/validate.js` | Request body sanitization |

---

## 5. Conversational Chat Pipeline

```
ChatPage.jsx (376 lines)
  │
  │ POST /api/chat/message
  │ { message: "I spent $15 on lunch", sessionId: "uuid" }
  │
  ├──► chatLimiter (30/5min) ──► auth.js (JWT) ──►
  │
  ▼
chatController.js (426 lines)
  │
  ├── 1. Save user message → ChatLog (MySQL)
  ├── 2. Sync to Firebase Firestore (real-time)
  ├── 3. Call nlpService.processMessage()
  │      │
  │      ▼
  │   nlpService.js (389 lines)
  │      ├── OpenAI GPT-4 API call
  │      ├── Entity extraction + validation
  │      ├── Clarification detection
  │      └── Response normalization
  │
  ├── 4. If needs_clarification:
  │      Return { clarification_question, clarification_options }
  │      → ChatPage renders ClarificationButtons
  │      → User taps button → sends follow-up message
  │
  ├── 5. If entities extracted:
  │      ├── Health entities → HealthLog.create() (encrypted fields)
  │      ├── Finance entities → FinancialLog.create()
  │      └── Cross-domain → LinkedDomain.create()
  │
  ├── 6. Save assistant response → ChatLog + Firebase
  └── 7. Return { response, entities_logged, needs_clarification }
          │
          ▼
      ChatPage.jsx renders:
        ├── Assistant bubble (white, left-aligned)
        ├── Entity badges (❤️ health, 💰 finance, 🔗 linked)
        └── Typing indicator animation
```

---

## 6. External Health Platform Integration

```
                 ┌────── Adapter Pattern ──────┐
                 │                              │
                 │   healthAdapter.js (abstract) │
                 │     getAuthorizationUrl()     │
                 │     handleCallback()          │
                 │     fetchData()               │
                 │     mapToHealthLog()           │
                 │     refreshToken()             │
                 │     disconnect()               │
                 │              ▲                 │
                 │     ┌───────┴────────┐        │
                 │     │                │        │
                 │  GoogleFit       AppleHealth  │
                 │  Adapter         Adapter      │
                 │  (263 lines)     (107 lines)  │
                 │                               │
                 │  OAuth2 flow     Native SDK   │
                 │  REST API        POST bridge  │
                 └───────────────────────────────┘
                           │
                  externalRoutes.js (184 lines)
                    GET  /connect/:platform   → OAuth URL
                    GET  /callback/:platform  → Token exchange
                    POST /sync/:platform      → Fetch + map + insert
                    POST /disconnect/:platform → Revoke
                    GET  /status              → Connection status
                           │
                           ▼
                    HealthLog.findOrCreate()
                    (dedup by user + type + date + source)
```

---

## 7. Database Schema (9 Models)

```
┌──────────┐     ┌───────────┐     ┌───────────────┐
│  User     │────►│ HealthLog │     │ FinancialLog  │
│           │────►│           │     │               │
│ id        │    │ user_id   │     │ user_id       │
│ username  │    │ type      │     │ type (in/exp) │
│ email     │    │ value     │     │ amount        │
│ password  │    │ value_text│     │ category_id───┼──► Category
│ role      │    │ duration  │     │ description   │     │ id
│ is_active │    │ notes     │     │ logged_at     │     │ name
│ refresh_tk│    │ source    │     │ source        │     │ domain
└──────────┘    │ confidence│     └───────────────┘     │ icon
     │           │ logged_at │                           └──────────┘
     │           └───────────┘
     │                ▲                    ┌──────────────┐
     │                │                    │ LinkedDomain  │
     │                └────────────────────│ health_log_id │
     │                                     │ financial_id  │
     │           ┌───────────┐             │ link_type     │
     ├──────────►│ ChatLog   │             └──────────────┘
     │           │ session_id│
     │           │ role      │        ┌──────────────┐
     │           │ content   │        │  AISummary   │
     │           │ intent    │        │  user_id     │
     │           └───────────┘        │  type        │
     │                                │  summary     │
     ├───────────────────────────────►│  patterns    │
     │                                │  recommends  │
     │           ┌───────────┐        │  metrics     │
     ├──────────►│ UserGoal  │        └──────────────┘
     │           │ domain    │
     │           │ target    │        ┌──────────────┐
     │           │ progress  │        │  SystemLog   │
     │           └───────────┘        │  level       │
     └───────────────────────────────►│  action      │
                                      │  details     │
                                      └──────────────┘
```

---

## 8. Route Map — All API Endpoints

| Method | Endpoint | Rate Limit | Auth | Handler |
|--------|----------|-----------|------|---------|
| `POST` | `/api/auth/register/send-otp` | auth+otp | No | `authController.sendOtp` |
| `POST` | `/api/auth/register/verify-otp` | auth | No | `authController.verifyOtp` |
| `POST` | `/api/auth/register/complete` | auth | No | `authController.completeRegistration` |
| `POST` | `/api/auth/login` | auth (10/15m) | No | `authController.login` |
| `POST` | `/api/auth/refresh` | auth | No | `authController.refresh` |
| `POST` | `/api/chat/message` | chat (30/5m) | JWT | `chatController.sendMessage` |
| `GET` | `/api/chat/sessions` | general | JWT | `chatController.getSessions` |
| `GET` | `/api/chat/sessions/:id` | general | JWT | `chatController.getSession` |
| `GET` | `/api/health-logs` | general | JWT | `healthController.getLogs` |
| `POST` | `/api/health-logs` | general | JWT | `healthController.createLog` |
| `GET` | `/api/health-logs/summary` | general | JWT | `healthController.getWeeklySummary` |
| `DELETE` | `/api/health-logs/:id` | general | JWT | `healthController.deleteLog` |
| `GET` | `/api/finance` | general | JWT | `financeController.getLogs` |
| `POST` | `/api/finance` | general | JWT | `financeController.createLog` |
| `GET` | `/api/finance/summary` | general | JWT | `financeController.getWeeklySummary` |
| `DELETE` | `/api/finance/:id` | general | JWT | `financeController.deleteLog` |
| `GET` | `/api/insights` | insight (5/15m) | JWT | `insightEngine.runInsightEngine` |
| `GET` | `/api/insights/history` | insight | JWT | `insightsService.getLatestInsights` |
| `POST` | `/api/insights/generate` | insight | JWT | `insightEngine.generateAndPersist` |
| `PUT` | `/api/insights/:id/read` | general | JWT | `insightsService.markAsRead` |
| `GET` | `/api/external/connect/:platform` | general | JWT | Adapter OAuth URL |
| `GET` | `/api/external/callback/:platform` | general | No | OAuth token exchange |
| `POST` | `/api/external/sync/:platform` | general | JWT | Fetch + map + insert |
| `POST` | `/api/external/disconnect/:platform` | general | JWT | Revoke access |
| `GET` | `/api/external/status` | general | JWT | Connection status |
| `GET` | `/api/admin/stats` | general | Admin | System statistics |
| `GET` | `/api/admin/users` | general | Admin | User management |
| `PATCH` | `/api/admin/users/:id/toggle` | general | Admin | Toggle active |
| `GET` | `/api/admin/logs` | general | Admin | System logs |
| `GET` | `/api/health` | — | No | Health check (uptime) |

---

## 9. Frontend Route + Code Splitting Map

```
BrowserRouter
  ├── PublicRoute (redirect to /dashboard if authed)
  │   ├── /login        → LoginPage         [eagerly loaded]
  │   └── /register     → RegisterPage      [eagerly loaded]
  │
  └── ProtectedRoute (redirect to /login if not authed)
      │   Wraps: AppLayout (sidebar + Outlet)
      │
      ├── /dashboard  → React.lazy(DashboardPage)  [205 KB chunk]
      │                  ├── HealthCorrelationChart
      │                  ├── SpendingChart
      │                  ├── MoodActivityChart
      │                  └── InsightCards ←──── /api/insights
      │
      ├── /chat       → React.lazy(ChatPage)       [263 KB chunk]
      │                  ├── Chat bubbles
      │                  ├── ClarificationButtons
      │                  ├── EntityBadges
      │                  ├── TypingIndicator
      │                  └── Firebase real-time sync
      │
      ├── /health     → React.lazy(HealthPage)      [5.5 KB chunk]
      ├── /finance    → React.lazy(FinancePage)      [4.4 KB chunk]
      │
      └── AdminRoute (redirect if not admin role)
          └── /admin  → React.lazy(AdminPage)       [8.3 KB chunk]

Initial bundle: 294 KB (index.js) + 41 KB (CSS) = 335 KB
Total with all lazy chunks: 335 + 205 + 263 + 5.5 + 4.4 + 8.3 = ~821 KB
```

---

## 10. Deployment Architecture

### Docker Compose Services:

```
┌─────────────────────────────────────────────────────┐
│  docker-compose.yml                                  │
│                                                      │
│  ┌────────────────┐   ┌───────────────────────────┐ │
│  │     client     │   │         server            │ │
│  │  Nginx :80     │──►│   Node.js Express :5000   │ │
│  │                │   │                           │ │
│  │  /api/* proxy  │   │  ┌─────────────────────┐  │ │
│  │  to server:5000│   │  │ Sequelize ORM       │  │ │
│  │                │   │  └─────────┬───────────┘  │ │
│  │  SPA fallback  │   │            │              │ │
│  │  /index.html   │   │            ▼              │ │
│  └────────────────┘   │  ┌─────────────────────┐  │ │
│                       │  │     db (MySQL 8)     │  │ │
│                       │  │     :3306            │  │ │
│                       │  │  Volume: mysql_data  │  │ │
│                       │  └─────────────────────┘  │ │
│                       └───────────────────────────┘ │
│                                                      │
│  Network: lifesync-net (bridge)                      │
└─────────────────────────────────────────────────────┘
```

### CI/CD Pipeline:

```
Push to main/develop  ──►  GitHub Actions
                             │
                ┌────────────┼────────────┐
                ▼            ▼            ▼
          test-backend  build-frontend  docker-build
          (Node 18+20)  (Node 20)       (main only)
          97 Jest tests  Vite build      Backend image
                         Verify dist/    Frontend image
```

---

## 11. Requirement Coverage Matrix

| Req ID | Requirement | Implementation | Files |
|--------|------------|----------------|-------|
| UR5 | Conversational Interface | NLP chat with clarification buttons | ChatPage, chatController, nlpService |
| UR7 | Unified Dashboard | 4 chart types + stat cards + insights | DashboardPage, 4 chart components |
| UR11 | Visual Analytics | Chart.js multi-axis, doughnut, scatter | HealthCorrelation, Spending, MoodActivity |
| UR12 | AI Decision Support | 4-detector insight engine with Pearson correlation | insightEngine.js (666 lines) |
| UR14 | Admin Portal | User management, system logs, NLP metrics | AdminPage, adminController |
| UR15 | External Integration | Adapter pattern: Google Fit OAuth2 + Apple HealthKit | healthAdapter, googleFitAdapter, appleHealthAdapter |
| UR17 | Performance | Code splitting (294KB initial), rate limiting, CORS | App.jsx lazy(), rateLimiter.js, app.js |
| SR1.2 | Two-Step Registration | 3-step OTP with email verification | RegisterPage, authController, otpService |
| SR2 | Field Encryption | AES-256-CBC for sensitive data | encryption.js |
| SR3 | Role-Based Access | JWT + admin role guard | auth.js, roleCheck.js, AdminRoute |

---

## 12. Quick Start Commands

```bash
# ─── Development ───
cd lifesync
npm install              # Backend deps
cd client && npm install # Frontend deps

# Start backend (needs MySQL on localhost:3306)
cp .env.example .env     # Edit DB credentials
npm run dev              # nodemon → localhost:5000

# Start frontend
cd client
npm run dev              # Vite → localhost:5173 (proxies /api → :5000)

# ─── Tests ───
npm test                 # 97 tests, 5 suites

# ─── Docker (Production) ───
docker-compose up -d     # MySQL + Node + Nginx
# Open http://localhost

# ─── Build Only ───
cd client && npm run build  # → dist/ (294KB initial + lazy chunks)
```

---

*Generated: February 2026 · LifeSync v2.0 · Birzeit University*
*Total: 78 files · 10,008 lines · 97 tests · 5 Docker services*
