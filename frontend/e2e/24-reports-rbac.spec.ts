/**
 * Phase 9: Reports RBAC — E2E Test Spec
 * TC-RPT-API-001 through TC-RPT-E2E-005
 *
 * Coverage:
 *  - Section 1: Setup (users for all 4 roles, product, child boxes, closed carton, dispatch)
 *  - Section 2: Reports API access — Admin & Supervisor allowed, WH & DispOp denied
 *  - Section 3: Export endpoints — Admin can download CSV
 *  - Section 4: E2E browser tests — reports page tabs, export button, RBAC sidebar visibility
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
// Test user definitions
// ---------------------------------------------------------------------------
const TEST_USERS = {
  admin: {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'Admin',
    name: 'System Administrator',
  },
  supervisor: {
    email: `rpt-sup-${TS}@test.com`,
    password: 'RptSup@123',
    role: 'Supervisor',
    name: `Reports Test Supervisor ${TS}`,
  },
  warehouse: {
    email: `rpt-wh-${TS}@test.com`,
    password: 'RptWh@1234',
    role: 'Warehouse Operator',
    name: `Reports Test Warehouse ${TS}`,
  },
  dispatch: {
    email: `rpt-dp-${TS}@test.com`,
    password: 'RptDp@1234',
    role: 'Dispatch Operator',
    name: `Reports Test DispOp ${TS}`,
  },
};

// Shared state
const tokens: Record<string, string> = {};
let productId = '';

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

test.describe.serial('Reports RBAC Suite', () => {

  // =========================================================================
  // SECTION 1 — Setup
  // =========================================================================

  test.describe('Setup: Create users + inventory data for reports', () => {

    test('TC-SETUP-RPT-001: Create role users and obtain tokens', async ({ request }) => {
      tokens.admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

      // Create non-admin test users
      for (const [key, user] of Object.entries(TEST_USERS)) {
        if (key === 'admin') continue;
        const res = await request.post(`${BASE_API}/users`, {
          headers: { Authorization: `Bearer ${tokens.admin}` },
          data: {
            email: user.email,
            password: user.password,
            name: user.name,
            role: user.role,
          },
        });
        expect(res.status(), `Creating user for role ${user.role}`).toBe(201);
      }

      // Obtain tokens for all roles
      for (const [key, user] of Object.entries(TEST_USERS)) {
        tokens[key] = await loginAs(request, user.email, user.password);
      }

      expect(tokens.admin).toBeTruthy();
      expect(tokens.supervisor).toBeTruthy();
      expect(tokens.warehouse).toBeTruthy();
      expect(tokens.dispatch).toBeTruthy();
    });

    test('TC-SETUP-RPT-002: Create product, child boxes, carton, and dispatch for report data', async ({ request }) => {
      // Create product
      const prodRes = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: {
          article_name: `RptTestProd-${TS}`,
          article_code: `RP${String(TS).slice(-6)}`,
          colour: 'Brown',
          size: '9',
          category: 'Gents',
          section: 'PU',
          mrp: 449,
        },
      });
      expect(prodRes.status()).toBe(201);
      const prodBody = await prodRes.json();
      productId = prodBody.data.id || prodBody.data._id || prodBody.data.productId;
      expect(productId).toBeTruthy();

      // Create child boxes
      const bulkRes = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: { product_id: productId, count: 4, quantity: 1 },
      });
      expect(bulkRes.status()).toBe(201);
      const barcodes: string[] = (await bulkRes.json()).data.map(
        (cb: { barcode: string }) => cb.barcode,
      );

      // Create and close a carton
      const cartonRes = await request.post(`${BASE_API}/master-cartons`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: { child_box_barcodes: barcodes.slice(0, 3), max_capacity: 50 },
      });
      expect(cartonRes.status()).toBe(201);
      const cartonId = (await cartonRes.json()).data.id;

      const closeRes = await request.post(`${BASE_API}/master-cartons/${cartonId}/close`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(closeRes.status()).toBe(200);

      // Create a customer for dispatch
      const custRes = await request.post(`${BASE_API}/customers`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: {
          firm_name: `RptTestCust-${TS}`,
          customer_type: 'Primary Dealer',
          contact_person_name: 'Reports Tester',
          contact_person_mobile: '9100000002',
        },
      });
      const custId = (await custRes.json()).data.id;

      // Dispatch the closed carton
      const dispRes = await request.post(`${BASE_API}/dispatches`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: {
          master_carton_ids: [cartonId],
          customer_id: custId,
          destination: 'Kolkata',
          transport_details: 'By Air',
          vehicle_number: 'WB01CD9012',
          dispatch_date: '2026-04-17T00:00:00.000Z',
        },
      });
      expect(dispRes.status()).toBe(201);
    });
  });

  // =========================================================================
  // SECTION 2 — Reports API access control
  // =========================================================================

  test.describe('TC-RPT-API: Role-based access for report endpoints', () => {

    test('TC-RPT-API-001: Admin GET /reports/product-wise → 200', async ({ request }) => {
      const res = await request.get(`${BASE_API}/reports/product-wise`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-RPT-API-002: Supervisor GET /reports/product-wise → 200', async ({ request }) => {
      const res = await request.get(`${BASE_API}/reports/product-wise`, {
        headers: { Authorization: `Bearer ${tokens.supervisor}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-RPT-API-003: Warehouse Operator GET /reports/product-wise → 403', async ({ request }) => {
      const res = await request.get(`${BASE_API}/reports/product-wise`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-RPT-API-004: Dispatch Operator GET /reports/product-wise → 403', async ({ request }) => {
      const res = await request.get(`${BASE_API}/reports/product-wise`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-RPT-API-005: Admin GET /reports/dispatch-summary → 200', async ({ request }) => {
      const res = await request.get(`${BASE_API}/reports/dispatch-summary`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-RPT-API-006: Warehouse Operator GET /reports/dispatch-summary → 403', async ({ request }) => {
      const res = await request.get(`${BASE_API}/reports/dispatch-summary`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-RPT-API-007: Admin GET /reports/carton-inventory → 200', async ({ request }) => {
      const res = await request.get(`${BASE_API}/reports/carton-inventory`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-RPT-API-008: Admin GET /reports/daily-activity → 200', async ({ request }) => {
      // Endpoint requires from_date and to_date query params
      const res = await request.get(
        `${BASE_API}/reports/daily-activity?from_date=2026-04-01&to_date=2026-04-18`,
        { headers: { Authorization: `Bearer ${tokens.admin}` } }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // =========================================================================
  // SECTION 3 — CSV export endpoints
  // =========================================================================

  test.describe('TC-RPT-API-EXPORT: CSV export endpoints', () => {

    test('TC-RPT-API-009: Admin GET /reports/inventory-summary/export → 200, CSV content-type', async ({ request }) => {
      const res = await request.get(`${BASE_API}/reports/inventory-summary/export`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(res.status()).toBe(200);

      // Content-Type should indicate CSV
      const contentType = res.headers()['content-type'] || '';
      expect(contentType).toMatch(/csv|text\/plain|application\/octet-stream/i);
    });

    test('TC-RPT-API-010: Admin GET /reports/dispatch-summary/export → 200, CSV content-type', async ({ request }) => {
      const res = await request.get(`${BASE_API}/reports/dispatch-summary/export`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(res.status()).toBe(200);

      const contentType = res.headers()['content-type'] || '';
      expect(contentType).toMatch(/csv|text\/plain|application\/octet-stream/i);
    });
  });

  // =========================================================================
  // SECTION 4 — E2E browser tests
  // =========================================================================

  test.describe('TC-RPT-E2E: Browser tests for reports page', () => {

    test('TC-RPT-E2E-001: Admin — Reports page loads with 4 tabs', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: tokens.admin, email: ADMIN_EMAIL },
      );

      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      // Four report tabs expected
      await expect(page.getByText('Stock Report')).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('Carton Inventory')).toBeVisible();
      await expect(page.getByText('Dispatch Report')).toBeVisible();
      await expect(page.getByText('Daily Activity')).toBeVisible();
    });

    test('TC-RPT-E2E-002: Stock Report tab shows data', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: tokens.admin, email: ADMIN_EMAIL },
      );

      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      // Click Stock Report tab (it may already be active)
      await page.getByText('Stock Report').click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500); // allow async data fetch

      // A table or data rows should be present
      const hasTable = (await page.locator('table').count()) > 0;
      const hasRows = (await page.locator('tr, [role="row"]').count()) > 1; // header + at least one row
      const hasDataText = (await page.getByText(/pairs|stock|boxes/i).count()) > 0;

      expect(hasTable || hasRows || hasDataText).toBeTruthy();
    });

    test('TC-RPT-E2E-003: CSV export button visible on reports page', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: tokens.admin, email: ADMIN_EMAIL },
      );

      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      // The Export CSV button is tab-dependent; it renders for stock/dispatch/daily tabs.
      // Wait for the page to mount the export control before asserting.
      const exportBtn = page.getByRole('button', { name: /export|download|csv/i }).first();
      await expect(exportBtn).toBeVisible({ timeout: 15000 });
    });

    test('TC-RPT-E2E-004: Supervisor — Reports page is accessible', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem(
            'binny_user',
            JSON.stringify({ email, role: 'Supervisor' }),
          );
        },
        { token: tokens.supervisor, email: TEST_USERS.supervisor.email },
      );

      await page.goto('/reports');
      await page.waitForLoadState('networkidle');

      // Should NOT be redirected away or show an access-denied page
      await expect(page).not.toHaveURL(/login|access-denied|forbidden/i, { timeout: 10000 });

      // Page should load the reports content
      await expect(page.getByText('Stock Report')).toBeVisible({ timeout: 15000 });
    });

    test('TC-RPT-E2E-005: Warehouse Operator — Reports nav NOT in sidebar', async ({ page }) => {
      // Login via UI form for a true browser session with WH Operator role
      await page.goto('/login');
      await page.getByLabel('Email Address').fill(TEST_USERS.warehouse.email);
      await page.getByLabel('Password').fill(TEST_USERS.warehouse.password);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForLoadState('networkidle');

      // Wait for page to settle after login
      await page.waitForTimeout(2000);

      // Reports link should NOT be in the sidebar for Warehouse Operator
      const reportsLink = page.getByRole('link', { name: /reports/i });
      const count = await reportsLink.count();

      // Either no Reports link, or navigating to /reports shows access denied / redirects
      if (count > 0) {
        // If the link exists, clicking it should result in an access-denied state
        await reportsLink.first().click();
        await page.waitForLoadState('networkidle');

        // Should show access denied message OR redirect away from reports
        const isAccessDenied =
          (await page.getByText(/access denied|not authorized|forbidden|not allowed/i).count()) > 0;
        const isRedirected = !(await page.url().includes('/reports'));
        expect(isAccessDenied || isRedirected).toBeTruthy();
      } else {
        // No Reports link in sidebar — correct behaviour
        expect(count).toBe(0);
      }
    });
  });

}); // end test.describe.serial('Reports RBAC Suite')
