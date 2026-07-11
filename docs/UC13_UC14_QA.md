# UC-13 / UC-14 QA evidence

## User requirements

| ID | Requirement | Evidence |
|----|-------------|----------|
| UC-13 | Download weekly health/finance report as PDF | `POST /api/reports/generate`, `GET /api/reports/:id/download` |
| UC-13 | Authorize ownership | IDOR tests in `reportService.test.js`, `reportRoutes.test.js` |
| UC-13 | Deterministic metrics + summary | Frozen `metrics_snapshot` on `weekly_reports` |
| UC-13 | No corrupt artifact on failure | PDF built after persist; download 404 if missing |
| UC-14 | Notify when report ready | `notifyWeeklyReportReady` after persist only |
| UC-14 | Opt-in / opt-out | `users.report_notify_enabled` |
| UC-14 | No announce without persist | Throws without `report.id` |
| UC-14 | Dedupe | One notification per `report_id` |
| UC-14 | Scheduler | `reportScheduler.runWeeklyReportJob` + `POST /api/reports/cron/weekly` |

## System requirements

| ID | Requirement | Evidence |
|----|-------------|----------|
| SR-auth | All report/notify APIs require JWT | `routeAuthSurface.test.js` |
| SR-cron | Cron dormant without secret | `reportRoutes.test.js` |
| SR-pdf | Artifact is valid PDF | `pdfReportBuilder.test.js` |
| SR-idempotent | One report per user/week | unique `(user_id, week_key)` |

## Test map

| Layer | Files | Count (approx) |
|-------|-------|----------------|
| Unit | `pdfReportBuilder.test.js`, week helpers | 4 |
| Service | `reportService.test.js`, `notificationService.test.js` | 9 |
| Integration | `reportRoutes.test.js` | 6 |
| Requirements | `uc13_uc14_requirements.test.js` | 5 |
| Component | `WeeklyReportCard.test.jsx`, `NotificationsSection.test.jsx` | 4 |
| Auth surface | `routeAuthSurface.test.js` (+3 paths) | 3 |
| Schema | `schemaIntegrity.test.js` (migrations 005–006) | suite |

## Manual / live QA

```bash
# With QA_E2E_TOKEN from Railway:
npm run qa:live:use-cases
```

Covers generate, list, PDF download, notifications, preferences.
