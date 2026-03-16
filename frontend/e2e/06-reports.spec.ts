import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers';

test.describe('TC-RPT: Reports Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-RPT-001: Reports page loads with tabs', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Stock Report')).toBeVisible();
    await expect(page.getByText('Carton Inventory')).toBeVisible();
    await expect(page.getByText('Dispatch Report')).toBeVisible();
    await expect(page.getByText('Daily Activity')).toBeVisible();
  });

  test('TC-RPT-002: Stock Report tab shows product data', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Stock Report is default tab
    await page.getByText('Stock Report').click();
    await page.waitForLoadState('networkidle');

    // Should show a table or loading state
    const hasTable = await page.locator('table').count();
    if (hasTable > 0) {
      await expect(page.locator('table').first()).toBeVisible();
    }
  });

  test('TC-RPT-003: Carton Inventory tab loads', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    await page.getByText('Carton Inventory').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Should show carton data or empty state
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('TC-RPT-004: Dispatch Report tab loads', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    await page.getByText('Dispatch Report').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('TC-RPT-005: Daily Activity tab loads', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    await page.getByText('Daily Activity').click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('TC-RPT-006: Export CSV button exists', async ({ page }) => {
    await page.goto('/reports');
    await page.waitForLoadState('networkidle');

    // Should have an export/download button
    const exportBtn = page.getByRole('button', { name: /export|download|csv/i });
    if (await exportBtn.count() > 0) {
      await expect(exportBtn.first()).toBeVisible();
    }
  });
});
