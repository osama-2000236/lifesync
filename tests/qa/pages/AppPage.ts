import { expect, type Locator, type Page } from '@playwright/test';

export class AppPage {
  readonly page: Page;
  readonly nav: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nav = page.getByRole('navigation');
  }

  async goTo(label: 'Dashboard' | 'Assistant' | 'Health' | 'Finance' | 'Integrations'): Promise<void> {
    await this.nav.getByRole('link', { name: label, exact: true }).click();
  }

  async expectDashboard(): Promise<void> {
    await expect(this.page.getByText('unified lifestyle overview')).toBeVisible();
    await expect(this.page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  }

  async logout(): Promise<void> {
    await this.page.getByTitle('Sign out').click();
    await expect(this.page).toHaveURL(/\/login$/);
  }
}
