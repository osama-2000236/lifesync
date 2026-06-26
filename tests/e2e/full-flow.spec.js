// tests/e2e/full-flow.spec.js
const { test, expect } = require('@playwright/test');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

test.describe('LifeSync Full End-to-End Flow', () => {
  test('should login, log health/finance data via chat, and see them on dashboard', async ({ page }) => {
    // 1. Login
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@lifesync.app');
    await page.fill('input[name="password"]', 'Admin@123456');
    await page.click('button[type="submit"]');

    // Wait for dashboard to load
    await expect(page).toHaveURL('/dashboard');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-dashboard-initial.png') });

    // 2. Navigate to Chat
    await page.click('a[href="/chat"]');
    await expect(page).toHaveURL('/chat');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02-chat-initial.png') });

    // 3. Log Health Data (Steps)
    await page.fill('textarea', 'I walked 8000 steps today');
    await page.keyboard.press('Enter');

    // Wait for AI response (Gemma)
    // We look for a message containing "Logged" and "8,000 steps"
    await expect(page.locator('.chat-bubble-assistant').last()).toContainText(/Logged.*8,000 steps/i, { timeout: 45000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03-chat-health-logged.png') });

    // 4. Log Finance Data (Expense)
    await page.fill('textarea', 'Spent $15 on a burger');
    await page.keyboard.press('Enter');

    // Wait for AI response
    await expect(page.locator('.chat-bubble-assistant').last()).toContainText(/Logged.*\$15.*expense/i, { timeout: 45000 });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-chat-finance-logged.png') });

    // 5. Verify on Dashboard
    await page.click('a[href="/dashboard"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Check if the health data appears in the quick stats
    await expect(page.locator('body')).toContainText('8,000', { timeout: 15000 });
    
    // 6. Verify on Finance Page
    await page.click('a[href="/finance"]');
    await expect(page).toHaveURL('/finance');
    await expect(page.locator('body')).toContainText('burger', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('15', { timeout: 10000 });
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05-finance-verified.png'), fullPage: true });
  });
});
