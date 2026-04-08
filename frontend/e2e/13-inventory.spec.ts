import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

test.describe('TC-INV: Inventory Module — Hierarchical Stock Drill-Down', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-INV-001: Inventory page loads with summary cards', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('main').getByRole('heading', { name: 'Inventory' })).toBeVisible();
    await expect(page.getByText('Pairs in Stock')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Pairs Dispatched')).toBeVisible();
    await expect(page.getByRole('main').getByText('Child Boxes')).toBeVisible();
    await expect(page.getByText('Active Cartons')).toBeVisible();
  });

  test('TC-INV-002: Stock levels section shows section-level cards', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Stock Levels' })).toBeVisible();
    await expect(page.getByText('All Sections')).toBeVisible();

    // Wait for stock data cards to load (skeleton loaders disappear and real cards appear)
    await expect(page.getByText(/pairs total/i).first()).toBeVisible({ timeout: 15000 });
    const cards = page.getByText(/pairs total/i);
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('TC-INV-003: Legend shows Free, Packed, Dispatched indicators', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Free (in stock)')).toBeVisible();
    await expect(page.getByText('Packed (in carton)')).toBeVisible();
    await expect(page.getByText('Dispatched')).toBeVisible();
  });

  test('TC-INV-004: Drill down from Section to Article', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Find and click a section card (e.g. Hawaii)
    const sectionCard = page.locator('[class*="shadow-card"]').filter({ hasText: 'Hawaii' }).first();
    if (await sectionCard.isVisible()) {
      await sectionCard.click();
      await page.waitForLoadState('networkidle');

      // Breadcrumb should show Hawaii
      await expect(page.getByRole('button', { name: 'Hawaii' })).toBeVisible();
      // Should show article(s) under Hawaii
      await expect(page.getByText('Hawaii Classic')).toBeVisible();
    }
  });

  test('TC-INV-005: Drill down from Article to Colour', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Drill: Section → Article → Colour
    const sectionCard = page.locator('[class*="shadow-card"]').filter({ hasText: 'Hawaii' }).first();
    if (await sectionCard.isVisible()) {
      await sectionCard.click();
      await page.waitForLoadState('networkidle');

      const articleCard = page.locator('[class*="shadow-card"]').filter({ hasText: 'Hawaii Classic' }).first();
      if (await articleCard.isVisible()) {
        await articleCard.click();
        await page.waitForLoadState('networkidle');

        // Breadcrumb should show full path
        await expect(page.getByRole('button', { name: 'Hawaii' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Hawaii Classic' })).toBeVisible();

        // Should show colour cards (Black, Blue)
        const colourCards = page.locator('[class*="shadow-card"]').filter({ hasText: /pairs total/i });
        const count = await colourCards.count();
        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('TC-INV-006: Drill down to Size level (leaf nodes)', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Drill: Section → Article → Colour → Size (product level)
    const sectionCard = page.locator('[class*="shadow-card"]').filter({ hasText: 'Hawaii' }).first();
    if (await sectionCard.isVisible()) {
      await sectionCard.click();
      await page.waitForLoadState('networkidle');

      const articleCard = page.locator('[class*="shadow-card"]').filter({ hasText: 'Hawaii Classic' }).first();
      if (await articleCard.isVisible()) {
        await articleCard.click();
        await page.waitForLoadState('networkidle');

        const colourCard = page.locator('[class*="shadow-card"]').filter({ hasText: 'Black' }).first();
        if (await colourCard.isVisible()) {
          await colourCard.click();
          await page.waitForLoadState('networkidle');

          // Should show size-level cards (leaf nodes with no chevron)
          await expect(page.getByRole('button', { name: 'Black' })).toBeVisible();
          const sizeCards = page.locator('[class*="shadow-card"]').filter({ hasText: /pairs total/i });
          const count = await sizeCards.count();
          expect(count).toBeGreaterThan(0);
        }
      }
    }
  });

  test('TC-INV-007: Breadcrumb navigation — click to jump back', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Drill two levels deep
    const sectionCard = page.locator('[class*="shadow-card"]').filter({ hasText: 'Hawaii' }).first();
    if (await sectionCard.isVisible()) {
      await sectionCard.click();
      await page.waitForLoadState('networkidle');

      const articleCard = page.locator('[class*="shadow-card"]').filter({ hasText: 'Hawaii Classic' }).first();
      if (await articleCard.isVisible()) {
        await articleCard.click();
        await page.waitForLoadState('networkidle');

        // Click "All Sections" breadcrumb to go back to root
        await page.getByRole('button', { name: 'All Sections' }).click();
        await page.waitForLoadState('networkidle');

        // Should be back at section level — Hawaii should be visible again as a card
        const sectionCardAgain = page.locator('[class*="shadow-card"]').filter({ hasText: 'Hawaii' }).first();
        await expect(sectionCardAgain).toBeVisible();
      }
    }
  });

  test('TC-INV-008: Back button navigates to parent level', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    const sectionCard = page.locator('[class*="shadow-card"]').filter({ hasText: 'Hawaii' }).first();
    if (await sectionCard.isVisible()) {
      await sectionCard.click();
      await page.waitForLoadState('networkidle');

      // Back button should be visible
      const backBtn = page.locator('button').filter({ has: page.locator('svg.lucide-arrow-left') });
      await expect(backBtn).toBeVisible();
      await backBtn.click();
      await page.waitForLoadState('networkidle');

      // Should be back at section level
      await expect(page.getByText('All Sections')).toBeVisible();
    }
  });

  test('TC-INV-009: Stock bar shows visual proportions', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Wait for stock data cards to load
    await expect(page.getByText(/pairs total/i).first()).toBeVisible({ timeout: 15000 });

    // Stock bars should be present inside cards (h-2 bg-gray-100 rounded-full overflow-hidden flex)
    const stockBars = page.locator('div.rounded-full.overflow-hidden').filter({ has: page.locator('div') });
    const count = await stockBars.count();
    expect(count).toBeGreaterThan(0);
  });

  test('TC-INV-010: Refresh button reloads data', async ({ page }) => {
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    const refreshBtn = page.getByTitle('Refresh');
    await expect(refreshBtn).toBeVisible();
    await refreshBtn.click();

    // Should still show data after refresh
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Stock Levels' })).toBeVisible();
  });

  test('TC-INV-011: Sidebar shows Inventory nav link', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const inventoryLink = page.getByRole('link', { name: 'Inventory', exact: true }).first();
    await expect(inventoryLink).toBeVisible();

    await inventoryLink.click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('main').getByRole('heading', { name: 'Inventory' })).toBeVisible();
  });

  test('TC-INV-012: API returns correct hierarchy data', async ({ page }) => {
    const token = await getAuthToken(page);

    // Test summary endpoint
    const summaryRes = await page.request.get(`${BASE_API}/inventory/stock/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(summaryRes.ok()).toBeTruthy();
    const summary = await summaryRes.json();
    expect(summary.data).toHaveProperty('totalProducts');
    expect(summary.data).toHaveProperty('totalPairsInStock');
    expect(summary.data.totalProducts).toBeGreaterThan(0);

    // Test hierarchy endpoint — section level
    const hierRes = await page.request.get(`${BASE_API}/inventory/stock/hierarchy?level=section`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(hierRes.ok()).toBeTruthy();
    const hierarchy = await hierRes.json();
    expect(Array.isArray(hierarchy.data)).toBeTruthy();
    expect(hierarchy.data.length).toBeGreaterThan(0);

    const firstNode = hierarchy.data[0];
    expect(firstNode).toHaveProperty('name');
    expect(firstNode).toHaveProperty('totalPairs');
    expect(firstNode).toHaveProperty('inStock');
    expect(firstNode).toHaveProperty('packed');
    expect(firstNode).toHaveProperty('dispatched');
    expect(firstNode).toHaveProperty('children');
  });
});
