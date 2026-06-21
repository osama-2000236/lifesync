import { test as base, expect, type Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AppPage } from '../pages/AppPage';

type AppFixtures = {
  loginPage: LoginPage;
  appPage: AppPage;
  authenticatedPage: Page;
};

const credentials = () => {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD are required.');
  return { email, password };
};

export const test = base.extend<AppFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  appPage: async ({ page }, use) => {
    await use(new AppPage(page));
  },
  authenticatedPage: async ({ page }, use) => {
    const login = new LoginPage(page);
    const { email, password } = credentials();
    await login.goto();
    await login.login(email, password);
    await use(page);
  },
});

export { expect };
