import { expect, type Locator, type Page } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly alert: Locator;

  constructor(page: Page) {
    this.page = page;
    this.email = page.getByLabel('Email');
    this.password = page.getByRole('textbox', { name: 'Password', exact: true });
    this.submit = page.getByRole('button', { name: /sign in/i });
    this.alert = page.getByRole('alert');
  }

  async goto(): Promise<this> {
    await this.page.goto('/login');
    await expect(this.page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    return this;
  }

  async attempt(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }

  async login(email: string, password: string): Promise<void> {
    const responsePromise = this.page.waitForResponse(
      (response) => response.url().endsWith('/api/auth/login') && response.request().method() === 'POST'
    );
    await this.attempt(email, password);
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const payload = await response.json();
    const userId = payload.data.user.id;
    await this.page.waitForFunction(() => Boolean(localStorage.getItem('accessToken')));
    await this.page.evaluate((id) => localStorage.setItem(`onboarding_done_${id}`, 'true'), userId);
    await this.page.goto('/dashboard');
    await expect(this.page).toHaveURL(/\/dashboard$/);
  }
}
