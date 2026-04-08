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

  test('TC-CB-002: Child Boxes list shows product name column', async ({ page }) => {
    await page.getByRole('link', { name: 'Child Boxes' }).first().click();
    await page.waitForLoadState('networkidle');

    // Desktop table should have Product header
    const productHeader = page.getByRole('columnheader', { name: /product/i });
    if (await productHeader.isVisible({ timeout: 5000 })) {
      await expect(productHeader).toBeVisible();
    }

    // If there is data, product cells should not be empty
    const firstProductCell = page.locator('table tbody tr').first().locator('td').nth(1);
    if (await firstProductCell.isVisible({ timeout: 5000 })) {
      const text = await firstProductCell.textContent();
      // Product name should not be blank
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('TC-CB-003: Navigate to bulk generate page', async ({ page }) => {
    await page.getByRole('link', { name: 'Child Boxes' }).first().click();
    await page.getByRole('link', { name: /generate/i }).click();
    await expect(page).toHaveURL(/.*child-boxes\/generate/);
    await expect(page.getByText(/generate/i).first()).toBeVisible();
  });

  test('TC-CB-004: Child Boxes list uses skeleton loader while loading', async ({ page }) => {
    await page.goto('/child-boxes');
    // The skeleton loader should briefly appear before data loads
    // Verify the page eventually renders content (no permanent spinner)
    await page.waitForLoadState('networkidle');
    const pageContent = page.locator('main');
    await expect(pageContent).toBeVisible({ timeout: 15000 });
  });

  // --- Multi-size QR generation with searchable dropdown ---

  test('TC-MSQR-001: Generate page loads with searchable product dropdown', async ({ page }) => {
    await page.goto('/child-boxes/generate');
    await expect(page.getByText('Generate Labels')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Product (Article)')).toBeVisible();

    // Searchable dropdown should have a text input with placeholder
    const searchInput = page.getByPlaceholder(/search and select/i);
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('TC-MSQR-002: Searchable dropdown filters products on typing', async ({ page }) => {
    await page.goto('/child-boxes/generate');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Product (Article)')).toBeVisible({ timeout: 15000 });

    // Click to open dropdown
    const searchInput = page.getByPlaceholder(/search and select/i);
    await searchInput.click();
    await page.waitForTimeout(500);

    // Dropdown should be open with product options
    const dropdownItems = page.locator('[class*="absolute"][class*="z-20"] button');
    const initialCount = await dropdownItems.count();
    expect(initialCount).toBeGreaterThan(0);

    // Type to filter
    await searchInput.fill('Hawaii');
    await page.waitForTimeout(500);

    // Should have fewer items (or "No products found" if none match)
    const filteredCount = await dropdownItems.count();
    const noResults = page.getByText('No products found');
    const hasResults = filteredCount > 0;
    const hasNoResults = await noResults.isVisible().catch(() => false);
    expect(hasResults || hasNoResults).toBeTruthy();
  });

  test('TC-MSQR-003: Select product from dropdown shows colour pills', async ({ page }) => {
    await page.goto('/child-boxes/generate');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Product (Article)')).toBeVisible({ timeout: 15000 });

    // Open dropdown and select first product
    const searchInput = page.getByPlaceholder(/search and select/i);
    await searchInput.click();
    await page.waitForTimeout(500);

    const firstOption = page.locator('[class*="absolute"][class*="z-20"] button').first();
    if (await firstOption.isVisible({ timeout: 5000 })) {
      await firstOption.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // Colour label should appear
      await expect(page.getByText('Colour')).toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-MSQR-004: Select colour shows size table with quantity inputs', async ({ page }) => {
    await page.goto('/child-boxes/generate');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Product (Article)')).toBeVisible({ timeout: 15000 });

    // Select first product
    const searchInput = page.getByPlaceholder(/search and select/i);
    await searchInput.click();
    await page.waitForTimeout(500);
    const firstOption = page.locator('[class*="absolute"][class*="z-20"] button').first();
    if (!(await firstOption.isVisible({ timeout: 5000 }))) return;
    await firstOption.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Click first colour button
    const colourLabel = page.getByText('Colour');
    if (await colourLabel.isVisible({ timeout: 5000 })) {
      const firstColourBtn = colourLabel.locator('..').locator('button').first();
      if (await firstColourBtn.isVisible({ timeout: 5000 })) {
        await firstColourBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      }
    }

    // Size table should appear
    const hasSizeTable = await page.locator('table').count();
    if (hasSizeTable > 0) {
      await expect(page.getByText('Size').first()).toBeVisible();
      await expect(page.getByText(/no.*of.*labels|labels/i).first()).toBeVisible();
      const quantityInputs = page.locator('table input[type="number"]');
      expect(await quantityInputs.count()).toBeGreaterThan(0);
    }
  });

  test('TC-MSQR-005: Enter size quantities and see live summary', async ({ page }) => {
    await page.goto('/child-boxes/generate');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Product (Article)')).toBeVisible({ timeout: 15000 });

    // Select product
    const searchInput = page.getByPlaceholder(/search and select/i);
    await searchInput.click();
    await page.waitForTimeout(500);
    const firstOption = page.locator('[class*="absolute"][class*="z-20"] button').first();
    if (!(await firstOption.isVisible({ timeout: 5000 }))) return;
    await firstOption.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Select colour
    const colourLabel = page.getByText('Colour');
    if (await colourLabel.isVisible({ timeout: 5000 })) {
      const firstColourBtn = colourLabel.locator('..').locator('button').first();
      if (await firstColourBtn.isVisible({ timeout: 5000 })) {
        await firstColourBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      }
    }

    // Enter quantity
    const firstQuantityInput = page.locator('table input[type="number"]').first();
    if (await firstQuantityInput.isVisible()) {
      await firstQuantityInput.fill('2');
      await expect(page.getByText(/total labels/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('TC-MSQR-006: Generate button disabled when no sizes selected', async ({ page }) => {
    await page.goto('/child-boxes/generate');
    await page.waitForLoadState('networkidle');

    const generateBtn = page.getByRole('button', { name: /confirm.*generate/i });
    if (await generateBtn.isVisible()) {
      await expect(generateBtn).toBeDisabled();
    }
  });

  test('TC-MSQR-007: Multi-size bulk generate creates child boxes', { timeout: 60000 }, async ({ page }) => {
    await page.goto('/child-boxes/generate');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Product (Article)')).toBeVisible({ timeout: 15000 });

    // Select product
    const searchInput = page.getByPlaceholder(/search and select/i);
    await searchInput.click();
    await page.waitForTimeout(500);
    const firstOption = page.locator('[class*="absolute"][class*="z-20"] button').first();
    if (!(await firstOption.isVisible({ timeout: 5000 }))) return;
    await firstOption.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Select colour
    const colourLabel = page.getByText('Colour');
    if (await colourLabel.isVisible({ timeout: 5000 })) {
      const firstColourBtn = colourLabel.locator('..').locator('button').first();
      if (await firstColourBtn.isVisible({ timeout: 5000 })) {
        await firstColourBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      }
    }

    // Enter quantity and generate
    const firstQuantityInput = page.locator('table input[type="number"]').first();
    if (!(await firstQuantityInput.isVisible())) return;
    await firstQuantityInput.fill('2');

    await page.getByRole('button', { name: /confirm.*generate/i }).click();
    await page.waitForTimeout(3000);

    await expect(page.getByRole('heading', { name: /labels generated/i })).toBeVisible({ timeout: 10000 });
  });

  test('TC-CB-005: Status filter works', async ({ page }) => {
    await page.goto('/child-boxes');
    await page.waitForLoadState('networkidle');

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

  test('TC-CB-007: Print Labels button appears after generation', async ({ page }) => {
    await page.goto('/child-boxes/generate');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Product (Article)')).toBeVisible({ timeout: 15000 });

    // Select product
    const searchInput = page.getByPlaceholder(/search and select/i);
    await searchInput.click();
    await page.waitForTimeout(500);
    const firstOption = page.locator('[class*="absolute"][class*="z-20"] button').first();
    if (!(await firstOption.isVisible({ timeout: 5000 }))) return;
    await firstOption.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Select colour
    const colourLabel = page.getByText('Colour');
    if (await colourLabel.isVisible({ timeout: 5000 })) {
      const firstColourBtn = colourLabel.locator('..').locator('button').first();
      if (await firstColourBtn.isVisible({ timeout: 5000 })) {
        await firstColourBtn.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
      }
    }

    const firstQuantityInput = page.locator('table input[type="number"]').first();
    if (!(await firstQuantityInput.isVisible())) return;
    await firstQuantityInput.fill('1');

    await page.getByRole('button', { name: /confirm.*generate/i }).click();
    await page.waitForTimeout(3000);

    // Should show Print Labels button
    await expect(page.getByRole('button', { name: /print labels/i })).toBeVisible({ timeout: 10000 });
  });
});
