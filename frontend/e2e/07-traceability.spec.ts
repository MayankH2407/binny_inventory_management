import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

test.describe('TC-TRACE: Traceability Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-TRACE-001: Traceability page loads with updated description', async ({ page }) => {
    await page.goto('/traceability');
    await expect(page.getByText(/Traceability/i).first()).toBeVisible();
    await expect(page.getByText(/complete lifecycle/i)).toBeVisible();
  });

  test('TC-TRACE-002: Has search input and scan button', async ({ page }) => {
    await page.goto('/traceability');
    const searchInput = page.getByPlaceholder(/barcode|trace/i).first();
    await expect(searchInput).toBeVisible();
    await expect(page.getByRole('button', { name: /trace/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /scan qr/i })).toBeVisible();
  });

  test('TC-TRACE-003: Empty state shows descriptive message', async ({ page }) => {
    await page.goto('/traceability');
    await expect(page.getByText(/full journey/i)).toBeVisible();
  });

  test('TC-TRACE-004: Trace a child box shows all sections', async ({ page }) => {
    const token = await getAuthToken(page);

    // Get an existing child box
    const cbResponse = await page.request.get(`${BASE_API}/child-boxes?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cbBody = await cbResponse.json();

    if (cbBody.data && cbBody.data.length > 0) {
      const barcode = cbBody.data[0].barcode;

      // Navigate to traceability page first (loginViaAPI already set auth)
      await page.goto('/traceability');
      await page.waitForLoadState('networkidle');

      // Enter barcode and trace
      const searchInput = page.getByPlaceholder(/barcode|trace/i).first();
      await searchInput.fill(barcode);
      await page.getByRole('button', { name: /trace/i }).click();
      await page.waitForLoadState('networkidle');

      // Child Box card should be visible with correct data
      await expect(page.getByText('Child Box').first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(/Barcode/i).first()).toBeVisible();
      await expect(page.getByText(/Product/i).first()).toBeVisible();
      await expect(page.getByText(/Status/i).first()).toBeVisible();
    }
  });

  test('TC-TRACE-005: Traceability API returns correct structure (bug fix verification)', async ({ page }) => {
    const token = await getAuthToken(page);

    // Get a child box
    const cbResponse = await page.request.get(`${BASE_API}/child-boxes?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cbBody = await cbResponse.json();

    if (cbBody.data && cbBody.data.length > 0) {
      const barcode = cbBody.data[0].barcode;

      const traceResponse = await page.request.get(`${BASE_API}/inventory/trace/${barcode}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(traceResponse.ok()).toBeTruthy();

      const traceBody = await traceResponse.json();
      const data = traceBody.data;

      // Verify childBox has correct ID (not product ID — the bug fix)
      expect(data.childBox).toBeTruthy();
      expect(data.childBox.id).toBeTruthy();
      expect(data.childBox.barcode).toBe(barcode);
      expect(data.childBox.status).toBeTruthy();

      // Verify product fields are present
      expect(data.childBox.article_name).toBeTruthy();
      expect(data.childBox.sku).toBeTruthy();

      // Timeline should exist
      expect(Array.isArray(data.timeline)).toBeTruthy();
    }
  });
});
