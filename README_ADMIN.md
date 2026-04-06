# LifeSync — Admin Manual

This guide covers the Admin Portal, system monitoring, user management, and deployment operations.

---

## 1. Accessing the Admin Portal

- Navigate to `/admin` (only visible to accounts with `role: admin`)
- Default admin credentials: **admin@lifesync.app** / **Admin@123456**
- Change this password immediately in production

---

## 2. System Overview Dashboard

The Admin Portal displays six real-time metrics:

| Metric | Description | Healthy Range |
|---|---|---|
| **Total Users** | All registered accounts | Growing |
| **Active (24h)** | Users who made API calls in the last 24 hours | > 30% of total |
| **New (7 days)** | Accounts created in the past week | Steady growth |
| **Errors (24h)** | System errors logged in 24 hours | < 5 |
| **NLP Avg Response** | Mean chat provider processing time | < 2000ms |
| **NLP Max Response** | Worst-case NLP latency | < 5000ms |

### Health + Finance Logs (24h)
Shows the combined count of health and finance entries created. A drop may indicate NLP issues or user engagement problems.

---

## 3. User Management

The users table shows all registered accounts with:
- Username, email, role (user/admin)
- Active/inactive status toggle

### Actions:
- **Search**: Filter users by username or email
- **Toggle Status**: Click the toggle icon to activate/deactivate a user
  - Deactivated users cannot log in or make API calls
  - Their data is preserved (not deleted)

### Creating Admin Accounts
Currently done via the database seed or direct SQL:
```sql
UPDATE users SET role = 'admin' WHERE email = 'new.admin@example.com';
```

---

## 4. System Logs

The logs panel shows entries from the `system_logs` table:

### Log Types:
| Type | What it tracks |
|---|---|
| **error** | Application errors, stack traces |
| **security** | Failed login attempts, rate limit hits |
| **performance** | Slow queries, high-latency NLP calls |
| **audit** | Admin actions (user status changes, config updates) |

### Severity Levels:
- **Info** (blue): Normal operations
- **Warning** (yellow): Potential issues requiring monitoring
- **Error** (red): Application errors needing attention
- **Critical** (dark red): System failures requiring immediate action

### Filtering:
Use the filter buttons to isolate specific log types. Check **error** and **critical** daily.

---

## 5. Rate Limiting Configuration

The system enforces these rate limits:

| Endpoint | Limit | Window |
|---|---|---|
| `/api/auth/*` | 10 requests | 15 minutes per IP+email |
| `/api/auth/register/send-otp` | 3 requests | 5 minutes per email |
| `/api/chat` | 30 messages | 5 minutes per user |
| `/api/insights` | 5 requests | 15 minutes per user |
| General `/api/*` | 100 requests | 15 minutes per IP |

Rate limits are disabled during test runs (`NODE_ENV=test`).

---

## 6. Deployment

### Docker (Recommended)

```bash
# Start entire stack
docker-compose up -d

# View logs
docker-compose logs -f server

# Rebuild after code changes
docker-compose up -d --build

# Stop
docker-compose down
```

Services:
- **db**: MySQL 8.0 on port 3306
- **server**: Node.js API on port 5000
- **client**: React/Nginx on port 80

### Environment Variables

All secrets are configured via `.env` or `docker-compose.yml` environment:

| Variable | Required | Description |
|---|---|---|
| `DB_HOST` | Yes | MySQL host |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Database user |
| `DB_PASSWORD` | Yes | Database password |
| `JWT_SECRET` | Yes | JWT signing key (32+ chars) |
| `JWT_REFRESH_SECRET` | Yes | Refresh token key (32+ chars) |
| `ENCRYPTION_KEY` | Yes | AES-256 key for field encryption |
| `AI_PROVIDER` | Yes | Global AI fallback provider |
| `CHAT_AI_PROVIDER` | Yes | Chat parser provider (recommended: `custom_hf`) |
| `INSIGHTS_AI_PROVIDER` | Yes | Weekly insights provider (recommended: `gemini`) |
| `GEMINI_API_KEY` | Cond. | Required when Gemini is selected |
| `CUSTOM_HF_ENDPOINT` | Cond. | Required when `CHAT_AI_PROVIDER=custom_hf` |
| `HF_API_KEY` | No | Optional token for private/public HF Space auth |
| `CORS_ORIGIN` | Yes | Frontend URL(s), comma-separated |
| `SMTP_HOST` | No | Email server for OTP |
| `SMTP_USER` | No | Email account |
| `SMTP_PASS` | No | Email password |
| `GOOGLE_CLIENT_ID` | No | Google Fit OAuth |
| `GOOGLE_CLIENT_SECRET` | No | Google Fit OAuth |

### CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs automatically on:
- Push to `main` or `develop`
- Pull requests to `main`

Pipeline stages:
1. **Backend Tests**: Jest suite on Node 18 + 20
2. **MySQL E2E**: real DB auth + health + finance flows against MySQL service container
3. **Frontend Lint + Build**: ESLint 9 flat-config gate plus production Vite build
4. **Docker Build**: image build verification (main branch only)

Release smoke workflow (`.github/workflows/release-smoke.yml`) runs:
- external dependency probes (Railway `/api/health`, HF `/gradio_api/info` + `/infer`)
- production frontend route smoke for `/login`, `/dashboard`, `/chat`, `/health`, `/finance`

---

## 7. Database Operations

### Migrations
```bash
npm run migrate          # Run pending migrations
npm run migrate:undo     # Rollback last migration
```

### Seed Data
```bash
npm run seed             # Creates 18 categories + admin user
```

### Backup
```bash
mysqldump -u root -p lifesync_db > backup_$(date +%Y%m%d).sql
```

---

## 8. Monitoring Checklist

### Daily
- [ ] Check Admin Portal for error count (should be < 5)
- [ ] Review NLP response times (avg < 2s)
- [ ] Verify active user count is within expected range

### Weekly
- [ ] Review system logs for recurring errors
- [ ] Check rate limit hits (security logs) for potential abuse
- [ ] Verify database size growth is reasonable
- [ ] Review AI Insight Engine output for quality

### Monthly
- [ ] Rotate JWT secrets
- [ ] Update dependencies (`npm audit fix`)
- [ ] Review and archive old system logs
- [ ] Check AI provider usage and billing (Gemini/HF as configured)

---

## 9. Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| "Too many requests" errors | Rate limit hit | Wait 15 min, or adjust limits in `rateLimiter.js` |
| NLP returning empty responses | AI provider endpoint/key misconfigured | Validate `CHAT_AI_PROVIDER`, `CUSTOM_HF_ENDPOINT`, and provider keys in `.env` |
| Database connection failed | MySQL not running | `docker-compose restart db` |
| "CORS error" in browser | Frontend URL not in `CORS_ORIGIN` | Update `.env` with correct origin |
| OTP email not received | SMTP not configured | Set SMTP vars or use Ethereal for dev |
| Encryption errors | Key mismatch | Ensure `ENCRYPTION_KEY` matches the one used during data creation |
