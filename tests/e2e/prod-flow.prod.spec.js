// tests/e2e/prod-flow.prod.spec.js
// Live prod E2E: CF frontend (lifesync.1202883.workers.dev) -> Railway backend.
// Auth: seeded admin@lifesync.app / Admin@123456 (verified, bypasses OTP).
const { test, expect } = require('@playwright/test');
const path = require('path');

const SHOT = path.join(__dirname, 'screenshots', 'prod');
const EMAIL = process.env.E2E_EMAIL || 'admin@lifesync.app';
const PASS = process.env.E2E_PASSWORD || 'Admin@123456';

test.describe('LifeSync PROD full flow', () => {
  test('login -> chat log health+finance -> verify dashboard+finance', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASS);
    await page.click('button[type="submit"]');
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

    // 5. Dashboard reflects steps
    await page.goto('/dashboard');
    await expect(page.locator('body')).toContainText(/8[,.]?000/, { timeout: 20000 });

    // 6. Finance page reflects expense
    await page.goto('/finance');
    await expect(page.locator('body')).toContainText(/burger|15/i, { timeout: 20000 });
    await page.screenshot({ path: path.join(SHOT, '04-finance-verified.png'), fullPage: true });
  });
});
