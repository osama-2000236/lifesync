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
  if (!email || !password) return null;
  return { email, password };
};

const apiBaseUrl = () => {
  const raw = process.env.QA_API_URL
    || process.env.BE_URL
    || 'https://lifesync-production-fdf9.up.railway.app';
  return raw.replace(/\/api\/?$/, '').replace(/\/$/, '');
};

/** Cache one QA session for the worker — avoids auth rate-limit (429) mid-suite. */
let cachedQaSession: {
  accessToken: string;
  refreshToken: string;
  userId: number | string;
} | null = null;

/** Live prod: QA bot has a random password — mint session via x-qa-token. */
const loginViaQaToken = async (page: Page) => {
  const qaToken = process.env.QA_E2E_TOKEN;
  if (!qaToken) {
    throw new Error(
      'TEST_USER_EMAIL/TEST_USER_PASSWORD or QA_E2E_TOKEN required for authenticated UI tests.',
    );
  }

  if (!cachedQaSession) {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await page.request.post(`${apiBaseUrl()}/api/auth/qa-login`, {
        headers: { 'X-QA-Token': qaToken },
      });
      lastStatus = res.status();
      if (lastStatus === 200) {
        const payload = await res.json();
        const { accessToken, refreshToken, user } = payload.data;
        expect(accessToken).toBeTruthy();
        cachedQaSession = {
          accessToken,
          refreshToken,
          userId: user.id,
        };
        break;
      }
      // authLimiter: back off and retry (live suite hits this under serial workers)
      if (lastStatus === 429) {
        await page.waitForTimeout(1500 * (attempt + 1));
        continue;
      }
      break;
    }
    expect(lastStatus, `qa-login failed after retries`).toBe(200);
    expect(cachedQaSession).toBeTruthy();
  }

  const session = cachedQaSession!;
  // Seed storage before app boot so AuthProvider picks up the session.
  await page.goto('/login');
  await page.evaluate(
    ({ accessToken: at, refreshToken: rt, userId }) => {
      localStorage.setItem('accessToken', at);
      localStorage.setItem('refreshToken', rt);
      localStorage.setItem(`onboarding_done_${userId}`, 'true');
    },
    {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.userId,
    },
  );
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
};

export const test = base.extend<AppFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  appPage: async ({ page }, use) => {
    await use(new AppPage(page));
  },
  authenticatedPage: async ({ page }, use) => {
    const creds = credentials();
    if (creds) {
      const login = new LoginPage(page);
      await login.goto();
      await login.login(creds.email, creds.password);
    } else {
      await loginViaQaToken(page);
    }
    await use(page);
  },
});

export { expect };
