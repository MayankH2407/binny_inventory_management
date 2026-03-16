import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

test.describe('TC-TRACE: Traceability Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-TRACE-001: Traceability page loads', async ({ page }) => {
    await page.goto('/traceability');
    await expect(page.getByText(/Traceability/i).first()).toBeVisible();
  });

  test('TC-TRACE-002: Has search input', async ({ page }) => {
    await page.goto('/traceability');
    const searchInput = page.getByPlaceholder(/barcode|qr|search|scan/i).first();
    await expect(searchInput).toBeVisible();
  });

  test('TC-TRACE-003: Trace a child box via URL param', async ({ page }) => {
    const token = await getAuthToken(page);

    // Get an existing child box
    const cbResponse = await page.request.get(`${BASE_API}/child-boxes?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cbBody = await cbResponse.json();

    if (cbBody.data && cbBody.data.length > 0) {
      const barcode = cbBody.data[0].barcode;
      await page.goto(`/traceability?qr=${barcode}`);
      await page.waitForLoadState('networkidle');

      // Should show some result - child box info or timeline
      await expect(page.getByText(/Child Box|Timeline|Status/i).first()).toBeVisible({
        timeout: 10000,
      });
    }
  });
});
