import { test, expect } from './fixtures/app.fixture';

test.describe('LifeSync UI journeys', () => {
  test('TC-UI-001 @smoke public landing page renders primary navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/health|life/i);
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('TC-UI-002 @security unauthenticated dashboard access redirects to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  });

  test('TC-UI-003 @negative invalid credentials show a safe error', async ({ loginPage }) => {
    await loginPage.goto();
    await loginPage.attempt('nobody@example.test', 'WrongPassword1');
    await expect(loginPage.alert).toContainText('Invalid email or password');
  });

  test('TC-UI-004 @smoke valid user reaches dashboard', async ({ authenticatedPage, appPage }) => {
    await appPage.expectDashboard();
  });

  test('TC-UI-005 @regression user navigates health and finance logs', async ({ authenticatedPage, appPage }) => {
    await appPage.goTo('Health');
    await expect(authenticatedPage.getByRole('heading', { name: /Health/i })).toBeVisible();
    await appPage.goTo('Finance');
    await expect(authenticatedPage.getByRole('heading', { name: /Finance/i })).toBeVisible();
  });

  test('TC-UI-006 @ai chat returns one completed response', async ({ authenticatedPage, appPage }) => {
    await appPage.goTo('Chat');
    await expect(authenticatedPage).toHaveURL(/\/chat/);
    const input = authenticatedPage.getByPlaceholder(/how was your day|tell me about your day/i);
    await input.fill('I spent $12 on lunch.');
    await authenticatedPage.getByRole('button', { name: /^Send$/i }).click();
    await expect(input).toBeEnabled({ timeout: 90_000 });
    await expect(
      authenticatedPage.getByText(/trouble understanding|logged|detail|spent|lunch|expense|\$12/i).last(),
    ).toBeVisible({ timeout: 90_000 });
  });

  test('TC-UI-007 @responsive mobile layout exposes the menu and dashboard', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 390, height: 844 });
    await authenticatedPage.goto('/dashboard');
    await authenticatedPage.getByRole('button', { name: 'Open navigation' }).click();
    await expect(authenticatedPage.getByRole('navigation').getByRole('link', { name: 'Chat' })).toBeVisible();
    await expect(authenticatedPage.getByRole('navigation').getByRole('link', { name: 'Voice' })).toBeVisible();
  });

  test('TC-UI-008 @security logout clears the session', async ({ authenticatedPage, appPage }) => {
    await appPage.logout();
    await authenticatedPage.goto('/dashboard');
    await expect(authenticatedPage).toHaveURL(/\/login$/);
  });

  test('TC-UI-009 @smoke profile and integrations shells', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/profile');
    await expect(authenticatedPage).toHaveURL(/\/profile$/);
    await expect(authenticatedPage.getByText(/qa-e2e@lifesync\.test|QA E2E/i).first()).toBeVisible();
    await authenticatedPage.goto('/integrations');
    await expect(authenticatedPage).toHaveURL(/\/integrations$/);
    await expect(authenticatedPage.getByText(/Google Fit|Connect|export|integration/i).first()).toBeVisible();
  });

  test('TC-UI-010 @reports weekly report card is actionable', async ({ authenticatedPage, appPage }) => {
    await authenticatedPage.goto('/dashboard');
    await appPage.expectDashboard();
    await expect(authenticatedPage.getByRole('heading', { name: /Weekly report/i })).toBeVisible();
    await expect(authenticatedPage.getByRole('button', { name: /Generate|download|PDF/i })).toBeVisible();
  });

  test('TC-UI-011 @voice studio shell loads', async ({ authenticatedPage, appPage }) => {
    await appPage.goTo('Voice');
    await expect(authenticatedPage).toHaveURL(/\/assistant/);
    await expect(authenticatedPage.getByText(/Voice chat|Talk|Dictate|listening/i).first()).toBeVisible();
  });
});
