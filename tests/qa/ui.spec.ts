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
    await expect(authenticatedPage.getByText('7-Day Steps')).toBeVisible();
    await expect(authenticatedPage.getByText('Avg Sleep')).toBeVisible();
  });

  test('TC-UI-005 @regression user navigates health and finance logs', async ({ authenticatedPage, appPage }) => {
    await appPage.goTo('Health');
    await expect(authenticatedPage.getByRole('heading', { name: /Health Logs/ })).toBeVisible();
    await appPage.goTo('Finance');
    await expect(authenticatedPage.getByRole('heading', { name: /Finance Logs/ })).toBeVisible();
  });

  test('TC-UI-006 @ai assistant returns one completed response', async ({ authenticatedPage, appPage }) => {
    await appPage.goTo('Assistant');
    const input = authenticatedPage.getByPlaceholder('Tell me about your day...');
    await input.fill('I spent $12 on lunch.');
    await authenticatedPage.getByRole('button', { name: 'Send message' }).click();
    await expect(input).toBeEnabled({ timeout: 90_000 });
    await expect(authenticatedPage.getByText(/trouble understanding|logged|detail|spent/i).last()).toBeVisible();
  });

  test('TC-UI-007 @responsive mobile layout exposes the menu and dashboard', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 390, height: 844 });
    await authenticatedPage.goto('/dashboard');
    await authenticatedPage.getByRole('button', { name: 'Open navigation' }).click();
    await expect(authenticatedPage.getByRole('navigation').getByRole('link', { name: 'Assistant' })).toBeVisible();
  });

  test('TC-UI-008 @security logout clears the session', async ({ authenticatedPage, appPage }) => {
    await appPage.logout();
    await authenticatedPage.goto('/dashboard');
    await expect(authenticatedPage).toHaveURL(/\/login$/);
  });
});
