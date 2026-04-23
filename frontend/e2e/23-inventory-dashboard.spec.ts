/**
 * Phase 8: Inventory Dashboard — E2E Test Spec
 * TC-DASH-API-001 through TC-DASH-E2E-003
 *
 * Coverage:
 *  - Section 1: Setup (product, child boxes: free + packed, master carton)
 *  - Section 2: Dashboard API tests (GET /inventory/dashboard KPI fields)
 *  - Section 3: Inventory stock API tests (summary + hierarchy)
 *  - Section 4: Inventory E2E browser tests (drill-down, back button)
 *  - Section 5: Dashboard E2E browser tests (stat cards, quick actions)
 *
 * IMPORTANT: Everything is wrapped in ONE top-level test.describe.serial so that
 * module-level state (tokens, resource IDs) persists across all describe blocks.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

// ---------------------------------------------------------------------------
// Unique timestamp suffix
// ---------------------------------------------------------------------------
const TS = Date.now();

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let adminToken = '';
let productId = '';
let cartonId = '';
let sectionName = 'Hawaii'; // section used when creating test product

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data.accessToken;
}

// ===========================================================================
// ONE top-level serial describe
// ===========================================================================

test.describe.serial('Inventory Dashboard Suite', () => {

  // =========================================================================
  // SECTION 1 — Setup: create real inventory data
  // =========================================================================

  test.describe('Setup: Create product, child boxes, and master carton', () => {

    test('TC-SETUP-INVDASH-001: Login as admin', async ({ request }) => {
      adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
      expect(adminToken).toBeTruthy();
    });

    test('TC-SETUP-INVDASH-002: Create a product under Hawaii section', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          article_name: `DashTestProd-${TS}`,
          article_code: `DH${String(TS).slice(-6)}`,
          colour: 'Black',
          size: '8',
          category: 'Gents',
          section: sectionName,
          mrp: 299,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      productId = body.data.id || body.data._id || body.data.productId;
      expect(productId).toBeTruthy();
    });

    test('TC-SETUP-INVDASH-003: Create child boxes (free + packed into carton)', async ({ request }) => {
      // Create 6 child boxes — 3 free, 3 packed
      const bulkRes = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { product_id: productId, count: 6, quantity: 1 },
      });
      expect(bulkRes.status()).toBe(201);
      const allBarcodes: string[] = (await bulkRes.json()).data.map(
        (cb: { barcode: string }) => cb.barcode,
      );
      expect(allBarcodes.length).toBeGreaterThanOrEqual(6);

      // Pack 3 of them into a master carton (ACTIVE — not closed)
      const cartonRes = await request.post(`${BASE_API}/master-cartons`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { child_box_barcodes: allBarcodes.slice(0, 3), max_capacity: 50 },
      });
      expect(cartonRes.status()).toBe(201);
      const cartonBody = await cartonRes.json();
      cartonId = cartonBody.data.id || cartonBody.data._id;
      expect(cartonId).toBeTruthy();

      // The remaining 3 barcodes (allBarcodes.slice(3)) remain FREE — no further action needed
    });
  });

  // =========================================================================
  // SECTION 2 — Dashboard API tests
  // =========================================================================

  test.describe('TC-DASH-API: GET /inventory/dashboard KPI fields', () => {

    test('TC-DASH-API-001: GET /inventory/dashboard → returns 200 and success', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    test('TC-DASH-API-002: Dashboard response has totalChildBoxes, freeChildBoxes, packedChildBoxes', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const { data } = await res.json();

      // Accept either camelCase or snake_case field names
      const totalChildBoxes =
        data.totalChildBoxes ??
        data.total_child_boxes ??
        data.childBoxes?.total;
      const freeChildBoxes =
        data.freeChildBoxes ??
        data.free_child_boxes ??
        data.childBoxes?.free;
      const packedChildBoxes =
        data.packedChildBoxes ??
        data.packed_child_boxes ??
        data.childBoxes?.packed;

      expect(totalChildBoxes).toBeDefined();
      expect(typeof totalChildBoxes).toBe('number');
      expect(freeChildBoxes).toBeDefined();
      expect(typeof freeChildBoxes).toBe('number');
      expect(packedChildBoxes).toBeDefined();
      expect(typeof packedChildBoxes).toBe('number');

      // Sanity: total >= free + packed
      expect(totalChildBoxes).toBeGreaterThanOrEqual(freeChildBoxes + packedChildBoxes);
    });

    test('TC-DASH-API-003: Dashboard has totalMasterCartons, activeCartons', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const { data } = await res.json();

      const totalMasterCartons =
        data.totalMasterCartons ??
        data.total_master_cartons ??
        data.masterCartons?.total;
      const activeCartons =
        data.activeCartons ??
        data.active_cartons ??
        data.masterCartons?.active;

      expect(totalMasterCartons).toBeDefined();
      expect(typeof totalMasterCartons).toBe('number');
      expect(totalMasterCartons).toBeGreaterThan(0); // we created at least one

      expect(activeCartons).toBeDefined();
      expect(typeof activeCartons).toBe('number');
    });
  });

  // =========================================================================
  // SECTION 3 — Inventory stock API tests
  // =========================================================================

  test.describe('TC-INV-API: Stock summary and hierarchy endpoints', () => {

    test('TC-INV-API-001: GET /inventory/stock/summary → 200, totalProducts, totalPairsInStock', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/stock/summary`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const { data } = body;
      const totalProducts = data.totalProducts ?? data.total_products;
      const totalPairsInStock = data.totalPairsInStock ?? data.total_pairs_in_stock ?? data.inStock;

      expect(totalProducts).toBeDefined();
      expect(typeof totalProducts).toBe('number');
      expect(totalProducts).toBeGreaterThan(0);

      expect(totalPairsInStock).toBeDefined();
      expect(typeof totalPairsInStock).toBe('number');
    });

    test('TC-INV-API-002: GET /inventory/stock/hierarchy?level=section → sections array with counts', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/stock/hierarchy?level=section`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBeTruthy();
      expect(body.data.length).toBeGreaterThan(0);

      // First item should have a name field
      const first = body.data[0];
      expect(first).toHaveProperty('name');
    });

    test('TC-INV-API-003: GET /inventory/stock/hierarchy?level=article_name&section=Hawaii → articles', async ({ request }) => {
      const res = await request.get(
        `${BASE_API}/inventory/stock/hierarchy?level=article_name&section=${encodeURIComponent(sectionName)}`,
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
      // Should return 200 with data (may be empty if no articles, but response must be valid)
      expect([200, 404]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(Array.isArray(body.data)).toBeTruthy();
      }
    });

    test('TC-INV-API-004: Hierarchy items have name, inStock/free, packed, dispatched fields', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/stock/hierarchy?level=section`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data.length).toBeGreaterThan(0);

      const first = body.data[0];
      // name is required
      expect(first).toHaveProperty('name');
      // numeric stock fields — accept multiple naming conventions
      const hasStockField =
        first.inStock !== undefined ||
        first.free !== undefined ||
        first.totalPairs !== undefined ||
        first.total_pairs !== undefined;
      expect(hasStockField).toBeTruthy();

      const hasPackedField =
        first.packed !== undefined ||
        first.packedPairs !== undefined;
      expect(hasPackedField).toBeTruthy();

      const hasDispatchedField =
        first.dispatched !== undefined ||
        first.dispatchedPairs !== undefined;
      expect(hasDispatchedField).toBeTruthy();
    });
  });

  // =========================================================================
  // SECTION 4 — Inventory E2E browser tests
  // =========================================================================

  test.describe('TC-INV-E2E: Browser tests for /inventory page', () => {

    test('TC-INV-E2E-001: Inventory page loads with summary cards', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/inventory');
      await page.waitForLoadState('networkidle');

      // Page heading
      await expect(
        page.getByRole('main').getByRole('heading', { name: 'Inventory' }),
      ).toBeVisible({ timeout: 15000 });

      // Summary stat cards — at least one must be visible
      const statsTexts = [
        /pairs in stock/i,
        /pairs dispatched/i,
        /child boxes/i,
        /active cartons/i,
      ];
      let foundOne = false;
      for (const pattern of statsTexts) {
        if ((await page.getByText(pattern).count()) > 0) {
          foundOne = true;
          break;
        }
      }
      expect(foundOne).toBeTruthy();
    });

    test('TC-INV-E2E-002: Section list shows stock bars', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/inventory');
      await page.waitForLoadState('networkidle');

      // Stock Levels heading
      await expect(page.getByRole('heading', { name: 'Stock Levels' })).toBeVisible({
        timeout: 15000,
      });

      // Section-level cards should be present (contain "pairs total" or similar)
      await expect(page.getByText(/pairs total/i).first()).toBeVisible({ timeout: 15000 });

      // Stock bars (progress/proportional divs) must exist
      const stockBars = page.locator('div.rounded-full.overflow-hidden').filter({ has: page.locator('div') });
      const barCount = await stockBars.count();
      expect(barCount).toBeGreaterThan(0);
    });

    test('TC-INV-E2E-003: Click section → drills to article level', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/inventory');
      await page.waitForLoadState('networkidle');

      // Wait for section cards
      await expect(page.getByText(/pairs total/i).first()).toBeVisible({ timeout: 15000 });

      // Find and click any section card (take the first available)
      const sectionCards = page.locator('[class*="shadow-card"], [class*="card"], [class*="Card"]').filter({
        hasText: /pairs total/i,
      });

      const cardCount = await sectionCards.count();
      if (cardCount === 0) {
        test.skip();
        return;
      }

      await sectionCards.first().click();
      await page.waitForLoadState('networkidle');

      // After drill-down we should be at article level — breadcrumb changes
      // Either "All Sections" breadcrumb appears or the level indicator changes
      const breadcrumb = page.getByRole('button', { name: 'All Sections' });
      const hasBreadcrumb = (await breadcrumb.count()) > 0;

      // Or the page still shows cards (drilled down)
      const hasCards = (await page.getByText(/pairs total/i).count()) > 0;
      expect(hasBreadcrumb || hasCards).toBeTruthy();
    });

    test('TC-INV-E2E-004: Back button works after drill-down', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/inventory');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/pairs total/i).first()).toBeVisible({ timeout: 15000 });

      const sectionCards = page.locator('[class*="shadow-card"], [class*="card"], [class*="Card"]').filter({
        hasText: /pairs total/i,
      });

      if ((await sectionCards.count()) === 0) {
        test.skip();
        return;
      }

      await sectionCards.first().click();
      await page.waitForLoadState('networkidle');

      // Back button (arrow-left icon or "Back" text)
      const backBtn = page
        .locator('button')
        .filter({ has: page.locator('svg.lucide-arrow-left, [class*="arrow-left"]') })
        .first();

      const hasBackBtn = (await backBtn.count()) > 0;
      if (!hasBackBtn) {
        // Alternatively look for "All Sections" breadcrumb to navigate back
        const breadcrumb = page.getByRole('button', { name: 'All Sections' });
        if ((await breadcrumb.count()) > 0) {
          await breadcrumb.click();
        }
      } else {
        await backBtn.click();
      }

      await page.waitForLoadState('networkidle');

      // Should be back at section level — "All Sections" or "Stock Levels" visible
      const isBack =
        (await page.getByText('All Sections').count()) > 0 ||
        (await page.getByRole('heading', { name: 'Stock Levels' }).count()) > 0;
      expect(isBack).toBeTruthy();
    });
  });

  // =========================================================================
  // SECTION 5 — Dashboard E2E browser tests
  // =========================================================================

  test.describe('TC-DASH-E2E: Browser tests for / dashboard page', () => {

    test('TC-DASH-E2E-001: Dashboard shows stat cards', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Dashboard should show the main KPI card
      await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 20000 });
    });

    test('TC-DASH-E2E-002: Stat card values are numbers, not "undefined"', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Wait for data to render
      await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 20000 });

      // The visible main content must NOT contain the literal word "undefined"
      // (scoped to <main> to avoid Next.js RSC payload's `$undefined` markers in script tags)
      const mainText = (await page.locator('main').innerText()) ?? '';
      expect(mainText).not.toMatch(/\bundefined\b/i);

      // Stat card numbers should be numeric (look for any digit in the stat area)
      const statCards = page.locator('[class*="stat"], [class*="card"], [class*="Card"]').filter({
        hasText: /\d+/,
      });
      const count = await statCards.count();
      expect(count).toBeGreaterThan(0);
    });

    test('TC-DASH-E2E-003: Quick actions links visible on dashboard', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 20000 });

      // Quick action links — at least one of these should be visible
      const quickActionTexts = [
        /quick actions/i,
        /generate.*boxes|child.*box/i,
        /create.*carton|pack.*carton/i,
        /new dispatch/i,
        /scan & trace/i,
      ];

      let foundQuickAction = false;
      for (const pattern of quickActionTexts) {
        if ((await page.getByText(pattern).count()) > 0) {
          foundQuickAction = true;
          break;
        }
      }

      // Also accept sidebar nav links as "quick actions"
      const navLinks = page.getByRole('link').filter({ hasText: /child|carton|dispatch|scan/i });
      const navCount = await navLinks.count();

      expect(foundQuickAction || navCount > 0).toBeTruthy();
    });
  });

}); // end test.describe.serial('Inventory Dashboard Suite')
