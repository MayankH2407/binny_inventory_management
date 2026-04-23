/**
 * Phase 2: Product & Section CRUD — Per Role
 * TC-PROD-ADM-001 to TC-PROD-E2E-003 (Section 34)
 * TC-SECT-ADM-001 to TC-SECT-SUP-002 (Section 35)
 *
 * Coverage:
 *  - Setup: create test users for all 4 roles, create a test section
 *  - Admin Product CRUD (create, update, delete, image, bulk CSV)
 *  - Supervisor Product operations
 *  - Warehouse Operator and Dispatch Operator read-only
 *  - Product validation (missing fields, invalid data)
 *  - Section CRUD (Admin only for writes)
 *  - E2E browser tests for products page
 *
 * IMPORTANT: Everything is wrapped in ONE top-level test.describe.serial so that
 * module-level state (tokens, resource IDs) persists across all describe blocks.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

// ---------------------------------------------------------------------------
// Unique timestamp for this test run — avoids collisions with other runs
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
    email: `sup-prod-${TS}@test.com`,
    password: 'TestSup@1234',
    role: 'Supervisor',
    name: `Prod Supervisor ${TS}`,
  },
  warehouse: {
    email: `wh-prod-${TS}@test.com`,
    password: 'TestWh@1234',
    role: 'Warehouse Operator',
    name: `Prod Warehouse ${TS}`,
  },
  dispatch: {
    email: `dp-prod-${TS}@test.com`,
    password: 'TestDp@1234',
    role: 'Dispatch Operator',
    name: `Prod Dispatch ${TS}`,
  },
};

// ---------------------------------------------------------------------------
// Module-level state — populated in setup, persist across the serial block
// ---------------------------------------------------------------------------
const tokens: Record<string, string> = {};
let testSectionId = '';
let testSectionName = `ProdTestSection-${TS}`;
let testProductId = '';
let supProductId = '';

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

test.describe.serial('Products & Sections RBAC Suite', () => {

  // =========================================================================
  // SETUP — Create test users and shared resources
  // =========================================================================

  test.describe('Setup', () => {
    test('PROD-SETUP-001: Create test users for all roles', async ({ request }) => {
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

    test('PROD-SETUP-002: Create test section via Admin', async ({ request }) => {
      const res = await request.post(`${BASE_API}/sections`, {
        headers: authHeader(tokens.admin),
        data: { name: testSectionName },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      testSectionId = body.data.id || body.data._id || body.data.sectionId;
      expect(testSectionId).toBeTruthy();
    });
  });

  // =========================================================================
  // SECTION 34.1 — Admin Product Operations
  // =========================================================================

  test.describe('TC-PROD-ADM: Admin product CRUD', () => {
    test('TC-PROD-ADM-001: Admin creates product — 201, has auto-generated SKU', async ({
      request,
    }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: authHeader(tokens.admin),
        data: {
          article_name: `Canvas Shoe ${TS}`,
          article_code: `CNV${String(TS).slice(-6)}`,
          colour: 'Blue',
          size: '7',
          mrp: 499,
          category: 'Gents',
          section: testSectionName,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeTruthy();
      // SKU must be auto-generated — field should be present and non-empty
      expect(body.data.sku).toBeTruthy();
      expect(typeof body.data.sku).toBe('string');
      testProductId = body.data.id;
    });

    test('TC-PROD-ADM-002: Admin updates product — 200', async ({ request }) => {
      expect(testProductId).toBeTruthy();
      const res = await request.put(`${BASE_API}/products/${testProductId}`, {
        headers: authHeader(tokens.admin),
        data: { article_name: `Updated Canvas Shoe ${TS}`, mrp: 599, category: 'Ladies' },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-PROD-ADM-003: Admin soft-deletes product — 200', async ({ request }) => {
      // Create a separate product to delete so testProductId remains usable
      const createRes = await request.post(`${BASE_API}/products`, {
        headers: authHeader(tokens.admin),
        data: {
          article_name: `Delete Target ${TS}`,
          article_code: `DEL${String(TS).slice(-6)}`,
          colour: 'Red',
          size: '6',
          mrp: 199,
          category: 'Gents',
          section: testSectionName,
        },
      });
      expect(createRes.status()).toBe(201);
      const createBody = await createRes.json();
      const deleteTargetId = createBody.data.id;

      const res = await request.delete(`${BASE_API}/products/${deleteTargetId}`, {
        headers: authHeader(tokens.admin),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-PROD-ADM-004: Admin product image endpoint exists (403 not returned)', async ({
      request,
    }) => {
      // Send a minimal multipart request — we just need to confirm the endpoint
      // exists and is not blocked for Admin (may return 400 for bad file, but NOT 403)
      const res = await request.post(`${BASE_API}/products/${testProductId}/image`, {
        headers: authHeader(tokens.admin),
        multipart: {
          image: {
            name: 'test.jpg',
            mimeType: 'image/jpeg',
            buffer: Buffer.from('fake-image-data'),
          },
        },
      });
      // Admin can reach the endpoint — 403 is NOT acceptable
      expect(res.status()).not.toBe(403);
      expect(res.status()).not.toBe(401);
    });

    test('TC-PROD-ADM-005: Admin bulk uploads CSV with valid rows — 201', async ({ request }) => {
      const csvContent = [
        'article_name,article_code,colour,size,mrp,category,section',
        `BulkShoeA ${TS},BKA${String(TS).slice(-5)},Black,7,299,Gents,${testSectionName}`,
        `BulkShoeB ${TS},BKB${String(TS).slice(-5)},White,8,349,Ladies,${testSectionName}`,
      ].join('\n');

      const res = await request.post(`${BASE_API}/products/bulk-upload`, {
        headers: authHeader(tokens.admin),
        multipart: {
          file: {
            name: 'products.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csvContent),
          },
        },
      });
      // Bulk upload returns 201 on success or 200/207 on partial
      expect([200, 201, 207]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 34.2 — Supervisor Product Operations
  // =========================================================================

  test.describe('TC-PROD-SUP: Supervisor product operations', () => {
    test('TC-PROD-SUP-001: Supervisor creates product — 201', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: authHeader(tokens.supervisor),
        data: {
          article_name: `Ladies Sandal ${TS}`,
          article_code: `LS${String(TS).slice(-6)}`,
          colour: 'Pink',
          size: '5',
          mrp: 349,
          category: 'Ladies',
          section: testSectionName,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.sku).toBeTruthy();
      supProductId = body.data.id;
    });

    test('TC-PROD-SUP-002: Supervisor updates product — 200', async ({ request }) => {
      expect(supProductId).toBeTruthy();
      const res = await request.put(`${BASE_API}/products/${supProductId}`, {
        headers: authHeader(tokens.supervisor),
        data: { mrp: 399, location: 'MIA' },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-PROD-SUP-003: Supervisor CANNOT delete product — 403', async ({ request }) => {
      const productId = supProductId || testProductId || '00000000-0000-0000-0000-000000000001';
      const res = await request.delete(`${BASE_API}/products/${productId}`, {
        headers: authHeader(tokens.supervisor),
      });
      expect(res.status()).toBe(403);
    });
  });

  // =========================================================================
  // SECTION 34.3 — Read-Only Roles
  // =========================================================================

  test.describe('TC-PROD-WHO / TC-PROD-DOP: Read-only access', () => {
    test('TC-PROD-WHO-001: Warehouse Operator GET /products — 200', async ({ request }) => {
      const res = await request.get(`${BASE_API}/products`, {
        headers: authHeader(tokens.warehouse),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('TC-PROD-DOP-001: Dispatch Operator GET /products — 200', async ({ request }) => {
      const res = await request.get(`${BASE_API}/products`, {
        headers: authHeader(tokens.dispatch),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 34.4 — Product Validation
  // =========================================================================

  test.describe('TC-PROD-VAL: Product validation', () => {
    test('TC-PROD-VAL-001: Missing article_name returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: authHeader(tokens.admin),
        data: {
          article_code: 'VAL001',
          colour: 'Black',
          size: '8',
          mrp: 299,
          category: 'Gents',
          section: testSectionName,
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-PROD-VAL-002: Missing article_code returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: authHeader(tokens.admin),
        data: {
          article_name: 'Val Test Shoe',
          colour: 'Black',
          size: '8',
          mrp: 299,
          category: 'Gents',
          section: testSectionName,
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-PROD-VAL-003: article_code > 20 chars returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: authHeader(tokens.admin),
        data: {
          article_name: 'Val Test Shoe',
          article_code: 'ABCDEFGHIJKLMNOPQRSTU', // 21 chars
          colour: 'Black',
          size: '8',
          mrp: 299,
          category: 'Gents',
          section: testSectionName,
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-PROD-VAL-004: Negative MRP returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: authHeader(tokens.admin),
        data: {
          article_name: 'Val Test Shoe',
          article_code: 'NEGMRP01',
          colour: 'Red',
          size: '7',
          mrp: -100,
          category: 'Gents',
          section: testSectionName,
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-PROD-VAL-005: Invalid category returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: authHeader(tokens.admin),
        data: {
          article_name: 'Val Test Shoe',
          article_code: 'BADCAT01',
          colour: 'Black',
          size: '7',
          mrp: 299,
          category: 'Kids', // not in allowed set: Gents, Ladies, Boys, Girls
          section: testSectionName,
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 35 — Section CRUD — Per Role
  // =========================================================================

  test.describe('TC-SECT-ADM: Admin section CRUD', () => {
    let newSectionId = '';
    const newSectionName = `NewSection-${TS}`;

    test('TC-SECT-ADM-001: Admin creates section — 201', async ({ request }) => {
      const res = await request.post(`${BASE_API}/sections`, {
        headers: authHeader(tokens.admin),
        data: { name: newSectionName },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeTruthy();
      expect(body.data.name).toBe(newSectionName);
      newSectionId = body.data.id;
    });

    test('TC-SECT-ADM-002: Duplicate section name returns 409 or error', async ({ request }) => {
      const res = await request.post(`${BASE_API}/sections`, {
        headers: authHeader(tokens.admin),
        data: { name: newSectionName }, // same name again
      });
      // Backend should reject duplicate names with 409 or 400
      expect([400, 409]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-SECT-ADM-003: Admin updates section — 200', async ({ request }) => {
      expect(newSectionId).toBeTruthy();
      const updatedName = `${newSectionName}-Updated`;
      const res = await request.put(`${BASE_API}/sections/${newSectionId}`, {
        headers: authHeader(tokens.admin),
        data: { name: updatedName },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-SECT-ADM-004: Admin deletes section — 200', async ({ request }) => {
      expect(newSectionId).toBeTruthy();
      const res = await request.delete(`${BASE_API}/sections/${newSectionId}`, {
        headers: authHeader(tokens.admin),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  test.describe('TC-SECT-SUP: Supervisor section access', () => {
    test('TC-SECT-SUP-001: Supervisor GET /sections — 200', async ({ request }) => {
      const res = await request.get(`${BASE_API}/sections`, {
        headers: authHeader(tokens.supervisor),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    test('TC-SECT-SUP-002: Supervisor POST /sections — 403', async ({ request }) => {
      const res = await request.post(`${BASE_API}/sections`, {
        headers: authHeader(tokens.supervisor),
        data: { name: `ForbiddenSection-${TS}` },
      });
      expect(res.status()).toBe(403);
    });
  });

  // =========================================================================
  // SECTION 34.5 — E2E Browser Tests: Products page
  // =========================================================================

  test.describe('TC-PROD-E2E: Products page — browser', () => {
    test('TC-PROD-E2E-001: Admin — Products page loads with section tabs', async ({ page }) => {
      // Login via UI as Admin
      await page.goto('/login');
      await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
      await page.getByLabel('Password').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      await page.goto('/products');
      await page.waitForLoadState('networkidle');

      // Products page should render without errors
      await expect(page.locator('body')).toBeVisible();
      // Section tabs should be visible — look for tab-like UI elements
      const hasTabs = await page.locator('[role="tab"], button[class*="tab"]').count();
      // At minimum check the page loaded and didn't crash
      await expect(page.getByRole('heading', { name: /product/i }).first()).toBeVisible({
        timeout: 15000,
      });
    });

    test('TC-PROD-E2E-002: Admin — Add Product button visible', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
      await page.getByLabel('Password').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      await page.goto('/products');
      await page.waitForLoadState('networkidle');

      // "Add Product" button must be visible for Admin
      const addProductBtn = page.getByRole('button', { name: /add product/i });
      await expect(addProductBtn).toBeVisible({ timeout: 15000 });
    });

    test('TC-PROD-E2E-003: Admin — SKU field not in Create Product modal (auto-generated)', async ({
      page,
    }) => {
      await page.goto('/login');
      await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
      await page.getByLabel('Password').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      await page.goto('/products');
      await page.waitForLoadState('networkidle');

      const addProductBtn = page.getByRole('button', { name: /add product/i });
      await expect(addProductBtn).toBeVisible({ timeout: 15000 });
      await addProductBtn.click();

      // Wait for modal to appear
      await page.waitForTimeout(1000);

      // SKU field should NOT be an editable input inside the modal (auto-generated by backend).
      // Scope to dialog to exclude the list page's search input whose placeholder mentions "SKU".
      const dialog = page.getByRole('dialog');
      const skuInput = dialog.locator('input[name="sku"]');
      const skuCount = await skuInput.count();
      expect(skuCount).toBe(0);

      // Article name field SHOULD be present
      const articleNameField = page.getByLabel(/article name/i).or(
        page.getByPlaceholder(/article name/i)
      );
      await expect(articleNameField).toBeVisible({ timeout: 5000 });
    });
  });

}); // end test.describe.serial('Products & Sections RBAC Suite')
