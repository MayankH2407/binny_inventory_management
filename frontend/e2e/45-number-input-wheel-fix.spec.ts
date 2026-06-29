/**
 * TC-WHEEL: Number input onWheel blur fix
 *
 * Verifies that scrolling the mouse wheel over a focused number input does NOT
 * silently mutate the typed value (regression guard for the onWheel blur fix in
 * frontend/src/components/ui/Input.tsx).
 */

import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD, BASE_API } from './helpers';

test.describe('TC-WHEEL: Number input wheel-scroll fix', () => {
  test('TC-WHEEL-001: wheel on focused MRP number input does not change value', async ({ page }) => {
    // Login via API and set localStorage directly — avoids waiting for dashboard stats
    const response = await page.request.post(`${BASE_API}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const token: string = body.data.accessToken;
    const user: object = body.data.user;

    await page.addInitScript(
      ({ token, user }: { token: string; user: object }) => {
        localStorage.setItem('binny_token', token);
        localStorage.setItem('binny_user', JSON.stringify(user));
      },
      { token, user }
    );

    // Go directly to products page — no need to wait for dashboard stats
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // Open the Add Product modal
    await page.getByRole('button', { name: /add product/i }).click();

    // Wait for the MRP field (type="number") to appear
    const mrpInput = page.getByLabel(/mrp/i);
    await expect(mrpInput).toBeVisible({ timeout: 8000 });

    // Type a value into the MRP field
    await mrpInput.fill('200');
    await expect(mrpInput).toHaveValue('200');

    // Focus the MRP input so it is the active element
    await mrpInput.focus();

    // Dispatch a wheel event (deltaY: 100 = scroll down) on the focused input.
    // Without the fix this would decrement the value; with the fix the input
    // blurs immediately and the value stays at 200.
    await mrpInput.dispatchEvent('wheel', { deltaY: 100, bubbles: true });

    // Value must still be 200 — wheel must not have mutated it.
    await expect(mrpInput).toHaveValue('200');
  });
});
