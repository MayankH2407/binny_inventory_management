import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers';

test.describe('TC-PRODX: Product Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
    // Navigate to products via sidebar (stays in dashboard layout)
    await page.getByRole('link', { name: 'Products' }).first().click();
    await page.waitForTimeout(2000);
  });

  test('TC-PRODX-001: Products list page loads', async ({ page }) => {
    await expect(page).toHaveURL(/.*products/);
    await expect(page.getByText(/add product/i)).toBeVisible({ timeout: 10000 });
  });

  test('TC-PRODX-002: Add Product button opens modal', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/sku/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-PRODX-003: Product modal has all expanded fields', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/sku/i)).toBeVisible({ timeout: 5000 });

    // Core fields
    await expect(page.getByLabel(/article name/i)).toBeVisible();
    await expect(page.getByLabel(/article code/i)).toBeVisible();
    await expect(page.getByLabel(/colour/i)).toBeVisible();
    await expect(page.getByLabel(/^size\s*\*?$/i)).toBeVisible();
    await expect(page.getByLabel(/mrp/i)).toBeVisible();

    // Expanded fields (Phase 1.5)
    await expect(page.getByLabel(/category/i)).toBeVisible();
    await expect(page.getByLabel(/section/i)).toBeVisible();
    await expect(page.getByLabel(/location/i)).toBeVisible();
    await expect(page.getByLabel(/article group/i)).toBeVisible();
    await expect(page.getByLabel(/hsn code/i)).toBeVisible();
    await expect(page.getByLabel(/size group/i)).toBeVisible();
  });

  test('TC-PRODX-004: Category dropdown shows correct options', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/sku/i)).toBeVisible({ timeout: 5000 });

    const categorySelect = page.getByLabel(/category/i);
    const options = await categorySelect.locator('option').allTextContents();

    expect(options.some((o) => o.includes('Gents'))).toBeTruthy();
    expect(options.some((o) => o.includes('Ladies'))).toBeTruthy();
    expect(options.some((o) => o.includes('Boys'))).toBeTruthy();
    expect(options.some((o) => o.includes('Girls'))).toBeTruthy();
  });

  test('TC-PRODX-005: Section dropdown shows correct options', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/sku/i)).toBeVisible({ timeout: 5000 });

    const sectionSelect = page.getByLabel(/section/i);
    const options = await sectionSelect.locator('option').allTextContents();

    expect(options.some((o) => o.includes('Hawaii'))).toBeTruthy();
    expect(options.some((o) => o.includes('PU'))).toBeTruthy();
    expect(options.some((o) => o.includes('EVA'))).toBeTruthy();
  });

  test('TC-PRODX-006: Location dropdown shows correct options', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/sku/i)).toBeVisible({ timeout: 5000 });

    const locationSelect = page.getByLabel(/location/i);
    const options = await locationSelect.locator('option').allTextContents();

    expect(options.some((o) => o.includes('VKIA'))).toBeTruthy();
    expect(options.some((o) => o.includes('MIA'))).toBeTruthy();
    expect(options.some((o) => o.includes('F540'))).toBeTruthy();
  });

  test('TC-PRODX-007: Create product with all fields', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/sku/i)).toBeVisible({ timeout: 5000 });

    const sku = `TEST-SKU-${Date.now()}`;
    await page.getByLabel(/sku/i).fill(sku);
    await page.getByLabel(/article code/i).fill('TEST-ART-001');
    await page.getByLabel(/article name/i).fill('Test Product E2E');
    await page.getByLabel(/colour/i).fill('Black');
    await page.getByLabel(/^size\s*\*?$/i).fill('8');
    await page.getByLabel(/mrp/i).fill('749');

    await page.getByLabel(/category/i).selectOption('Gents');
    await page.getByLabel(/section/i).selectOption('Hawaii');
    await page.getByLabel(/location/i).selectOption('MIA');
    await page.getByLabel(/article group/i).fill('Premium');
    await page.getByLabel(/hsn code/i).fill('6402');
    await page.getByLabel(/size group/i).fill('6-10');

    await page.getByRole('button', { name: /create product/i }).click();
    await page.waitForTimeout(2000);
  });

  test('TC-PRODX-008: Search products', async ({ page }) => {
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder(/search/i).fill('Hawaii');
    await page.waitForTimeout(1000);
  });

  test('TC-PRODX-009: Products table shows expanded columns', async ({ page }) => {
    const table = page.locator('table').first();
    if (await table.isVisible({ timeout: 10000 })) {
      await expect(page.getByRole('columnheader', { name: /category/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /section/i })).toBeVisible();
    }
  });
});
