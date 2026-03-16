import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

test.describe('TC-MC: Master Carton Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-MC-001: Master Cartons list page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Master Cartons' }).first().click();
    await expect(page).toHaveURL(/.*master-cartons/);
    await expect(page.getByPlaceholder(/search.*barcode/i)).toBeVisible();
  });

  test('TC-MC-002: Create carton page loads', async ({ page }) => {
    await page.goto('/master-cartons/create');
    await expect(page.getByRole('heading', { name: 'Create Master Carton' })).toBeVisible();
    await expect(page.getByText('Max Capacity')).toBeVisible();
    await expect(page.getByText(/Scanned Items/)).toBeVisible();
  });

  test('TC-MC-003: Create carton page has manual barcode entry', async ({ page }) => {
    await page.goto('/master-cartons/create');

    // Should have a barcode input for manual entry
    const manualInput = page.getByPlaceholder(/barcode/i).first();
    await expect(manualInput).toBeVisible();
  });

  test('TC-MC-004: Master carton list shows status filter', async ({ page }) => {
    await page.goto('/master-cartons');
    await page.waitForLoadState('networkidle');

    const statusSelect = page.locator('select').first();
    await expect(statusSelect).toBeVisible();

    // Should have status options
    const options = await statusSelect.locator('option').allTextContents();
    expect(options).toContain('All Statuses');
    expect(options).toContain('Active');
    expect(options).toContain('Closed');
  });

  test('TC-MC-005: Master carton detail page loads', async ({ page }) => {
    // First create a carton via API to ensure we have data
    const token = await getAuthToken(page);

    // Get a free child box
    const cbResponse = await page.request.get(`${BASE_API}/child-boxes?status=FREE&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cbBody = await cbResponse.json();

    if (cbBody.data && cbBody.data.length > 0) {
      const barcode = cbBody.data[0].barcode;

      // Create carton with the child box
      const createResponse = await page.request.post(`${BASE_API}/master-cartons`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { max_capacity: 24, child_box_barcodes: [barcode] },
      });
      const createBody = await createResponse.json();
      const cartonId = createBody.data.id;

      // Navigate to detail page
      await page.goto(`/master-cartons/${cartonId}`);
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('BINNY-MC-').first()).toBeVisible();
      await expect(page.getByText(/Child Boxes/).first()).toBeVisible();

      // Clean up: full unpack
      await page.request.post(`${BASE_API}/master-cartons/${cartonId}/full-unpack`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  test('TC-MC-006: Master carton detail shows assortment', async ({ page }) => {
    const token = await getAuthToken(page);

    // Get free boxes
    const cbResponse = await page.request.get(`${BASE_API}/child-boxes?status=FREE&limit=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cbBody = await cbResponse.json();

    if (cbBody.data && cbBody.data.length >= 1) {
      const barcodes = cbBody.data.map((cb: { barcode: string }) => cb.barcode);

      const createResponse = await page.request.post(`${BASE_API}/master-cartons`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { max_capacity: 24, child_box_barcodes: barcodes },
      });
      const createBody = await createResponse.json();
      const cartonId = createBody.data.id;

      await page.goto(`/master-cartons/${cartonId}`);
      await page.waitForLoadState('networkidle');

      // Should show assortment section
      await expect(page.getByText(/Assortment/i).first()).toBeVisible({ timeout: 10000 });

      // Clean up
      await page.request.post(`${BASE_API}/master-cartons/${cartonId}/full-unpack`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
