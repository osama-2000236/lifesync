import { expect, type Locator, type Page } from '@playwright/test';

export class AppPage {
  readonly page: Page;
  readonly nav: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nav = page.getByRole('navigation');
  }

  async goTo(
    label: 'Dashboard' | 'Chat' | 'Voice' | 'Health' | 'Finance' | 'Integrations' | 'Connect & export',
  ): Promise<void> {
    await this.nav.getByRole('link', { name: label, exact: true }).click();
  }

  async expectDashboard(): Promise<void> {
    // Live copy (i18n): "Here's how health and money look together."
    await expect(this.page.getByText(/health and money/i).first()).toBeVisible();
    await expect(this.page.getByText(/Steps \(7 days\)|7-Day Steps/i)).toBeVisible();
    await expect(this.page.getByText(/Avg\.?\s*sleep/i)).toBeVisible();
  }

  async logout(): Promise<void> {
    // Sidebar uses accessible name "Sign out" (title may vary).
    await this.page.getByRole('button', { name: /sign out/i }).click();
    await expect(this.page).toHaveURL(/\/login$/);
  }
}
