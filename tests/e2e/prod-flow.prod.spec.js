// tests/e2e/prod-flow.prod.spec.js
// Live prod E2E: CF frontend (lifesync.1202883.workers.dev) -> Railway backend.
// Auth: dedicated QA user (qa-e2e@lifesync.app), NOT the admin account, so runs
// don't pollute real data. afterAll purges this user's logs via the DB proxy when
// E2E_DB_* are provided (skipped silently otherwise, e.g. in CI without proxy access).
const { test, expect } = require('@playwright/test');
const path = require('path');

const SHOT = path.join(__dirname, 'screenshots', 'prod');
const EMAIL = process.env.E2E_EMAIL || 'qa-e2e@lifesync.app';
const PASS = process.env.E2E_PASSWORD || 'QaE2e@123456';

// Teardown: delete the QA user's health/financial/chat logs created by this run.
test.afterAll(async () => {
  const { E2E_DB_HOST, E2E_DB_PORT, E2E_DB_USER, E2E_DB_PASSWORD, E2E_DB_NAME } = process.env;
  if (!E2E_DB_HOST || !E2E_DB_PASSWORD) {
    console.log('[teardown] E2E_DB_* not set — skipping prod-data cleanup.');
    return;
  }
  let mysql;
  try {
    mysql = require('mysql2/promise');
  } catch {
    console.log('[teardown] mysql2 unavailable — skipping cleanup.');
    return;
  }
  const c = await mysql.createConnection({
    host: E2E_DB_HOST,
    port: Number(E2E_DB_PORT || 3306),
    user: E2E_DB_USER || 'root',
    password: E2E_DB_PASSWORD,
    database: E2E_DB_NAME || 'railway',
  });
  try {
    const [u] = await c.execute('SELECT id FROM users WHERE email=?', [EMAIL]);
    if (u.length) {
      const uid = u[0].id;
      for (const tbl of ['health_logs', 'financial_logs', 'chat_logs']) {
        const [r] = await c.execute(`DELETE FROM ${tbl} WHERE user_id=?`, [uid]);
        console.log(`[teardown] ${tbl}: deleted ${r.affectedRows} rows for QA user ${uid}`);
      }
    }
  } finally {
    await c.end();
  }
});

test.describe('LifeSync PROD full flow', () => {
  test('login -> chat log health+finance -> verify dashboard+finance', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASS);
    await page.click('button[type="submit"]');
    // New users redirect to /onboarding (gated by localStorage `onboarding_done_<id>`,
    // not a DB field; admins are exempt). The user id isn't stored in localStorage —
    // only the JWT is — so decode the accessToken to get it, then mark onboarding done
    // so the QA run lands on the app instead of the wizard.
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 30000 });
    await page.waitForFunction(() => !!localStorage.getItem('accessToken'), { timeout: 15000 });
    await page.evaluate(() => {
      const t = localStorage.getItem('accessToken');
      try {
        const claims = JSON.parse(atob(t.split('.')[1]));
        const id = claims.id ?? claims.sub ?? claims.userId;
        if (id != null) localStorage.setItem(`onboarding_done_${id}`, '1');
      } catch { /* leave as-is; redirect assertion will surface the problem */ }
    });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30000 });
    await page.screenshot({ path: path.join(SHOT, '01-dashboard.png'), fullPage: true });

    // 2. Chat
    await page.goto('/chat');
    await expect(page).toHaveURL(/\/chat/);
    const ta = page.locator('textarea');
    await expect(ta).toBeVisible({ timeout: 15000 });

    // 3. Log health (steps)
    await ta.fill('I walked 8000 steps today');
    await page.keyboard.press('Enter');
    await expect(page.locator('.chat-bubble-assistant').last())
      .toContainText(/8[,.]?000|steps/i, { timeout: 60000 });
    await page.screenshot({ path: path.join(SHOT, '02-health-logged.png'), fullPage: true });

    // 4. Log finance (expense)
    await ta.fill('Spent $15 on a burger');
    await page.keyboard.press('Enter');
    await expect(page.locator('.chat-bubble-assistant').last())
      .toContainText(/15|burger|expense/i, { timeout: 60000 });
    await page.screenshot({ path: path.join(SHOT, '03-finance-logged.png'), fullPage: true });

    // 5. Dashboard reflects steps.
    // Dashboard shows "7-Day Steps" = toLocaleString() of a 7-day TOTAL (aggregates
    // every steps log in the window), so it is NOT the literal "8,000" once more than
    // one log exists. Assert structurally: the steps stat card rendered a real number
    // (not the empty "—" placeholder), proving the chat-logged steps reached the dashboard.
    await page.goto('/dashboard');
    const stepsCard = page.locator('div', { hasText: /7-Day Steps/i }).last();
    await expect(stepsCard).toBeVisible({ timeout: 20000 });
    await expect(stepsCard).toContainText(/\d[\d,]*/, { timeout: 20000 });
    await expect(stepsCard).not.toContainText('—');
    await page.screenshot({ path: path.join(SHOT, '04-dashboard-steps.png'), fullPage: true });

    // 6. Finance page reflects expense.
    // Note: financial_logs.description is encrypted at rest, so "burger" only appears
    // after client-side decrypt; assert the amount (15) renders, which is non-encrypted.
    await page.goto('/finance');
    await expect(page.locator('body')).toContainText(/15/, { timeout: 20000 });
    await page.screenshot({ path: path.join(SHOT, '05-finance-verified.png'), fullPage: true });

    // 7. Health page reflects the chat-logged steps.
    // Verifies the full chat -> structured-store -> Health-view pipeline (not just the
    // dashboard aggregate). The steps entry renders a "Steps" card; the empty state
    // ("No health logs yet") must NOT appear since we just logged one this run.
    await page.goto('/health');
    await expect(page.getByRole('heading', { name: /Health Logs/i })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body')).not.toContainText('No health logs yet', { timeout: 20000 });
    await expect(page.locator('body')).toContainText(/Steps/i, { timeout: 20000 });
    await page.screenshot({ path: path.join(SHOT, '06-health-verified.png'), fullPage: true });

    // 8. Profile page loads with the correct identity (read-only — no edits/deletes,
    // so the QA user is never mutated). Verifies the authenticated /profile route
    // renders and getProfile() returned this account's email.
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: /Account Settings/i })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('body')).toContainText(EMAIL, { timeout: 20000 });
    await expect(page.getByRole('heading', { name: /Profile Information/i })).toBeVisible({ timeout: 20000 });
    await page.screenshot({ path: path.join(SHOT, '07-profile-verified.png'), fullPage: true });
  });
});
