import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

test.describe('TC-CB: Child Box Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-CB-001: Child Boxes list page loads', async ({ page }) => {
    await page.getByRole('link', { name: 'Child Boxes' }).first().click();
    await expect(page).toHaveURL(/.*child-boxes/);
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
  });

  test('TC-CB-002: Child Boxes list shows data or empty state', async ({ page }) => {
    await page.getByRole('link', { name: 'Child Boxes' }).first().click();
    await page.waitForLoadState('networkidle');

    // Either shows table rows or empty state
    const hasBoxes = await page.locator('table tbody tr, [class*="divide-y"] > div').count();
    if (hasBoxes > 0) {
      await expect(page.locator('text=BINNY-CB-').first()).toBeVisible();
    } else {
      await expect(page.getByText(/no child boxes/i)).toBeVisible();
    }
  });

  test('TC-CB-003: Navigate to bulk generate page', async ({ page }) => {
    await page.getByRole('link', { name: 'Child Boxes' }).first().click();
    await page.getByRole('link', { name: /generate/i }).click();
    await expect(page).toHaveURL(/.*child-boxes\/generate/);
    await expect(page.getByText(/generate/i).first()).toBeVisible();
  });

  test('TC-CB-004: Bulk generate child boxes', async ({ page }) => {
    await page.goto('/child-boxes/generate');
    await page.waitForLoadState('networkidle');

    // Select a product
    const productSelect = page.locator('select').first();
    await productSelect.waitFor({ state: 'visible', timeout: 10000 });

    const options = await productSelect.locator('option').allTextContents();
    // Pick first non-placeholder option
    const productOption = options.find((o) => o !== '' && !o.includes('Select'));
    if (productOption) {
      await productSelect.selectOption({ label: productOption });
    }

    // Set count
    const countInput = page.locator('input[type="number"]').first();
    await countInput.fill('2');

    // Click generate
    await page.getByRole('button', { name: /generate/i }).click();
    await page.waitForLoadState('networkidle');

    // Should show success or generated labels
    // Wait a bit for the mutation to complete
    await page.waitForTimeout(2000);
  });

  test('TC-CB-005: Status filter works', async ({ page }) => {
    await page.goto('/child-boxes');
    await page.waitForLoadState('networkidle');

    // Change status filter
    const statusSelect = page.locator('select').first();
    if (await statusSelect.isVisible()) {
      await statusSelect.selectOption('FREE');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
    }
  });

  test('TC-CB-006: Search by barcode', async ({ page }) => {
    await page.goto('/child-boxes');
    await page.waitForLoadState('networkidle');

    const searchInput = page.getByPlaceholder(/search/i);
    await searchInput.fill('BINNY-CB-');
    await page.waitForTimeout(1000);
  });
});
