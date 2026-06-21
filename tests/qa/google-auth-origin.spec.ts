import { expect, test } from '@playwright/test';

const EXPECTED_CLIENT_ID = process.env.GOOGLE_TEST_CLIENT_ID
  || '190237143688-0ddtrdq3die8hnce0aqbti3jgc2eam4g.apps.googleusercontent.com';

test.describe('Google Sign-In runtime configuration', () => {
  test('TC-AUTH-GOOGLE-001 @external wires the authorized local client', async ({ page }) => {
    await page.goto('/login');
    const googleFrame = page.locator('iframe[src*="accounts.google.com/gsi/button"]');
    await expect(googleFrame).toBeAttached({ timeout: 15_000 });
    await expect(googleFrame).toHaveAttribute(
      'src',
      new RegExp(`client_id=${EXPECTED_CLIENT_ID.replaceAll('.', '\\.')}`)
    );

    await expect(googleFrame).toHaveCount(1);
  });
});
