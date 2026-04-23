/**
 * Phase 4: Child Box Operations — Per Role
 * TC-CB-ADM-001 to TC-CB-E2E-002
 *
 * Coverage:
 *  - Setup: create test users for all 4 roles, create a test product
 *  - Admin, Supervisor, Warehouse Operator can create child boxes
 *  - Dispatch Operator CANNOT create child boxes (403)
 *  - Read operations (list, filter by status, QR lookup)
 *  - Validation (non-existent product_id, count > 500, missing product_id)
 *  - E2E browser tests for child boxes page
 *
 * IMPORTANT: Everything is wrapped in ONE top-level test.describe.serial so that
 * module-level state (tokens, resource IDs, barcodes) persists across all describe blocks.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

// ---------------------------------------------------------------------------
// Unique timestamp
// ---------------------------------------------------------------------------
const TS = Date.now();

const TEST_USERS = {
  admin: {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'Admin',
    name: 'System Administrator',
  },
  supervisor: {
    email: `sup-cb-${TS}@test.com`,
    password: 'TestSup@1234',
    role: 'Supervisor',
    name: `CB Supervisor ${TS}`,
  },
  warehouse: {
    email: `wh-cb-${TS}@test.com`,
    password: 'TestWh@1234',
    role: 'Warehouse Operator',
    name: `CB Warehouse ${TS}`,
  },
  dispatch: {
    email: `dp-cb-${TS}@test.com`,
    password: 'TestDp@1234',
    role: 'Dispatch Operator',
    name: `CB Dispatch ${TS}`,
  },
};

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
const tokens: Record<string, string> = {};
let testProductId = '';
let testSectionName = `CBSection-${TS}`;
let createdBarcode = '';   // barcode from admin-created child box
let bulkBarcodes: string[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data.accessToken;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ===========================================================================
// ONE top-level serial describe
// ===========================================================================

test.describe.serial('Child Box RBAC Suite', () => {

  // =========================================================================
  // SETUP — Create test users and a test product to generate child boxes against
  // =========================================================================

  test.describe('Setup', () => {
    test('CB-SETUP-001: Create test users for all roles', async ({ request }) => {
      const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
      tokens.admin = adminToken;

      for (const [key, user] of Object.entries(TEST_USERS)) {
        if (key === 'admin') continue;
        const res = await request.post(`${BASE_API}/users`, {
          headers: authHeader(adminToken),
          data: {
            email: user.email,
            password: user.password,
            name: user.name,
            role: user.role,
          },
        });
        expect(res.status(), `Creating user for role ${user.role}`).toBe(201);
      }

      for (const [key, user] of Object.entries(TEST_USERS)) {
        tokens[key] = await loginAs(request, user.email, user.password);
      }

      expect(tokens.admin).toBeTruthy();
      expect(tokens.supervisor).toBeTruthy();
      expect(tokens.warehouse).toBeTruthy();
      expect(tokens.dispatch).toBeTruthy();
    });

    test('CB-SETUP-002: Create test section and product via Admin', async ({ request }) => {
      // Create section
      const sectionRes = await request.post(`${BASE_API}/sections`, {
        headers: authHeader(tokens.admin),
        data: { name: testSectionName },
      });
      expect(sectionRes.status()).toBe(201);

      // Create product
      const productRes = await request.post(`${BASE_API}/products`, {
        headers: authHeader(tokens.admin),
        data: {
          article_name: `CB Test Product ${TS}`,
          article_code: `CBT${String(TS).slice(-6)}`,
          colour: 'Black',
          size: '8',
          mrp: 299,
          category: 'Gents',
          section: testSectionName,
        },
      });
      expect(productRes.status()).toBe(201);
      const productBody = await productRes.json();
      testProductId = productBody.data.id;
      expect(testProductId).toBeTruthy();
    });
  });

  // =========================================================================
  // TC-CB-ADM: Admin child box creation
  // =========================================================================

  test.describe('TC-CB-ADM: Admin child box operations', () => {
    test('TC-CB-ADM-001: Admin creates single child box — 201, barcode starts with BINNY-CB-', async ({
      request,
    }) => {
      const res = await request.post(`${BASE_API}/child-boxes`, {
        headers: authHeader(tokens.admin),
        data: {
          product_id: testProductId,
          quantity: 12,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.barcode).toBeTruthy();
      expect(body.data.barcode).toMatch(/^BINNY-CB-/);
      createdBarcode = body.data.barcode;
    });

    test('TC-CB-ADM-002: Admin bulk create (count=3) — 201, returns 3 boxes', async ({
      request,
    }) => {
      const res = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: authHeader(tokens.admin),
        data: {
          product_id: testProductId,
          count: 3,
          quantity: 12,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBe(3);
      // Store barcodes for later tests
      bulkBarcodes = body.data.map((cb: { barcode: string }) => cb.barcode);
      for (const bc of bulkBarcodes) {
        expect(bc).toMatch(/^BINNY-CB-/);
      }
    });
  });

  // =========================================================================
  // TC-CB-SUP / TC-CB-WHO / TC-CB-DOP: Role-based create access
  // =========================================================================

  test.describe('TC-CB-SUP: Supervisor child box creation', () => {
    test('TC-CB-SUP-001: Supervisor creates child box — 201', async ({ request }) => {
      const res = await request.post(`${BASE_API}/child-boxes`, {
        headers: authHeader(tokens.supervisor),
        data: {
          product_id: testProductId,
          quantity: 12,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.barcode).toMatch(/^BINNY-CB-/);
    });
  });

  test.describe('TC-CB-WHO: Warehouse Operator child box creation', () => {
    test('TC-CB-WHO-001: Warehouse Operator creates child box — 201', async ({ request }) => {
      const res = await request.post(`${BASE_API}/child-boxes`, {
        headers: authHeader(tokens.warehouse),
        data: {
          product_id: testProductId,
          quantity: 12,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.barcode).toMatch(/^BINNY-CB-/);
    });
  });

  test.describe('TC-CB-DOP: Dispatch Operator denied child box creation', () => {
    test('TC-CB-DOP-001: Dispatch Operator creates child box — 403', async ({ request }) => {
      const res = await request.post(`${BASE_API}/child-boxes`, {
        headers: authHeader(tokens.dispatch),
        data: {
          product_id: testProductId,
          quantity: 12,
        },
      });
      expect(res.status()).toBe(403);
    });
  });

  // =========================================================================
  // TC-CB-READ: Read operations
  // =========================================================================

  test.describe('TC-CB-READ: Child box read operations', () => {
    test('TC-CB-READ-001: GET /child-boxes — paginated list returned', async ({ request }) => {
      const res = await request.get(`${BASE_API}/child-boxes`, {
        headers: authHeader(tokens.admin),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // Should have pagination metadata
      expect(body.pagination || body.meta || body.total !== undefined).toBeTruthy();
    });

    test('TC-CB-READ-002: GET /child-boxes?status=FREE — filtered results', async ({ request }) => {
      const res = await request.get(`${BASE_API}/child-boxes?status=FREE`, {
        headers: authHeader(tokens.admin),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // All returned boxes should have FREE status
      for (const cb of body.data) {
        expect(cb.status).toBe('FREE');
      }
    });

    test('TC-CB-READ-003: GET /child-boxes/qr/:barcode — 200', async ({ request }) => {
      expect(createdBarcode).toBeTruthy();
      const res = await request.get(
        `${BASE_API}/child-boxes/qr/${encodeURIComponent(createdBarcode)}`,
        {
          headers: authHeader(tokens.admin),
        }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.barcode).toBe(createdBarcode);
    });

    test('TC-CB-READ-004: GET /child-boxes/qr/NONEXISTENT — 404', async ({ request }) => {
      const res = await request.get(`${BASE_API}/child-boxes/qr/NONEXISTENT-BARCODE-XYZ`, {
        headers: authHeader(tokens.admin),
      });
      expect(res.status()).toBe(404);
    });
  });

  // =========================================================================
  // TC-CB-VAL: Validation
  // =========================================================================

  test.describe('TC-CB-VAL: Child box validation', () => {
    test('TC-CB-VAL-001: Non-existent product_id returns 404', async ({ request }) => {
      const res = await request.post(`${BASE_API}/child-boxes`, {
        headers: authHeader(tokens.admin),
        data: {
          product_id: '00000000-0000-0000-0000-000000000000',
          quantity: 12,
        },
      });
      expect([400, 404]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-CB-VAL-002: Count > 500 in bulk create returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: authHeader(tokens.admin),
        data: {
          product_id: testProductId,
          count: 501,
          quantity: 12,
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-CB-VAL-003: Missing product_id returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/child-boxes`, {
        headers: authHeader(tokens.admin),
        data: {
          quantity: 12,
          // product_id intentionally omitted
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // =========================================================================
  // TC-CB-E2E: Browser tests
  // =========================================================================

  test.describe('TC-CB-E2E: Child Boxes page — browser', () => {
    test('TC-CB-E2E-001: Child Boxes list page loads', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
      await page.getByLabel('Password').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      await page.goto('/child-boxes');
      await page.waitForLoadState('networkidle');

      // Page should render successfully
      await expect(page.locator('body')).toBeVisible();
      await expect(page).toHaveURL(/.*child-boxes/);

      // Should have a search input
      const searchInput = page.getByPlaceholder(/search/i);
      await expect(searchInput).toBeVisible({ timeout: 15000 });
    });

    test('TC-CB-E2E-002: Generate page loads with article dropdown', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
      await page.getByLabel('Password').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      // Wait until redirected away from /login (dashboard loaded)
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      await page.goto('/child-boxes/generate');
      await page.waitForLoadState('networkidle');

      // Generate page should show the "Generate Labels" heading
      await expect(page.getByRole('heading', { name: /generate labels/i })).toBeVisible({ timeout: 15000 });

      // Product (Article) searchable input with known placeholder text
      await expect(
        page.getByPlaceholder('Search and select a product...')
      ).toBeVisible({ timeout: 10000 });
    });
  });

}); // end test.describe.serial('Child Box RBAC Suite')
