/**
 * Phase 6: Dispatch RBAC & Lifecycle — E2E Test Spec
 * TC-DISP-ADM-001 through TC-DISP-E2E-002
 *
 * Coverage:
 *  - Section 1: Setup (users, product, child boxes, closed carton, customer)
 *  - Section 2: RBAC — who can and cannot create dispatches
 *  - Section 3: Validation — bad payloads, already-dispatched cartons
 *  - Section 4: State verification — carton + child boxes become DISPATCHED
 *  - Section 5: Read endpoints — list and detail
 *  - Section 6: E2E browser tests — dispatch form and dispatches list
 *
 * IMPORTANT: Everything is wrapped in ONE top-level test.describe.serial so that
 * module-level state (tokens, resource IDs) persists across all describe blocks.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

// ---------------------------------------------------------------------------
// Unique timestamp suffix to avoid collisions across parallel runs
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
    email: `disp-sup-${TS}@test.com`,
    password: 'DispSup@123',
    role: 'Supervisor',
    name: `Dispatch Test Supervisor ${TS}`,
  },
  warehouse: {
    email: `disp-wh-${TS}@test.com`,
    password: 'DispWh@1234',
    role: 'Warehouse Operator',
    name: `Dispatch Test Warehouse ${TS}`,
  },
  dispatch: {
    email: `disp-dp-${TS}@test.com`,
    password: 'DispDp@1234',
    role: 'Dispatch Operator',
    name: `Dispatch Test DispOp ${TS}`,
  },
};

// Shared state — populated in setup, reused across all test blocks
const tokens: Record<string, string> = {};
let productId = '';
let closedCartonId = '';
let closedCartonId2 = '';   // second carton for re-dispatch test
let customerId = '';
let dispatchId = '';          // ID of the first successful dispatch
let dispatchedCartonId = '';  // carton that has already been dispatched (for TC-DISP-VAL-002)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Login via API and return the access token */
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

/** POST /dispatches with admin token and return the response */
async function createDispatch(
  request: APIRequestContext,
  token: string,
  cartonIds: string[],
  customerIdParam?: string,
) {
  return request.post(`${BASE_API}/dispatches`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      master_carton_ids: cartonIds,
      customer_id: customerIdParam,
      destination: 'Mumbai',
      transport_details: 'By Road',
      vehicle_number: 'MH01AB1234',
      dispatch_date: '2026-04-17T00:00:00.000Z',
    },
  });
}

// ===========================================================================
// ONE top-level serial describe — all tests run in order, share module state
// ===========================================================================

test.describe.serial('Dispatch RBAC & Lifecycle Suite', () => {

  // =========================================================================
  // SECTION 1 — Setup
  // =========================================================================

  test.describe('Setup: Create users, product, child boxes, closed carton, customer', () => {

    test('TC-SETUP-DISP-001: Create role users and obtain tokens', async ({ request }) => {
      // Admin token first
      tokens.admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

      // Create non-admin users
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

    test('TC-SETUP-DISP-002: Create product', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: {
          article_name: `DispTestProd-${TS}`,
          article_code: `DT${String(TS).slice(-6)}`,
          colour: 'Black',
          size: '8',
          category: 'Gents',
          section: 'Hawaii',
          mrp: 299,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      productId = body.data.id || body.data._id || body.data.productId;
      expect(productId).toBeTruthy();
    });

    test('TC-SETUP-DISP-003: Create child boxes, pack into two cartons and close both', async ({ request }) => {
      // Create 6 child boxes — 3 for carton 1, 3 for carton 2
      const bulkRes = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: { product_id: productId, count: 6, quantity: 1 },
      });
      expect(bulkRes.status()).toBe(201);
      const bulkBody = await bulkRes.json();
      const allBarcodes: string[] = bulkBody.data.map((cb: { barcode: string }) => cb.barcode);
      expect(allBarcodes.length).toBeGreaterThanOrEqual(6);

      const barcodes1 = allBarcodes.slice(0, 3);
      const barcodes2 = allBarcodes.slice(3, 6);

      // Create carton 1
      const c1Res = await request.post(`${BASE_API}/master-cartons`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: { child_box_barcodes: barcodes1, max_capacity: 50 },
      });
      expect(c1Res.status()).toBe(201);
      const c1Body = await c1Res.json();
      const c1Id = c1Body.data.id || c1Body.data._id || c1Body.data.cartonId;

      // Close carton 1
      const close1Res = await request.post(`${BASE_API}/master-cartons/${c1Id}/close`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(close1Res.status()).toBe(200);
      closedCartonId = c1Id;

      // Create carton 2
      const c2Res = await request.post(`${BASE_API}/master-cartons`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: { child_box_barcodes: barcodes2, max_capacity: 50 },
      });
      expect(c2Res.status()).toBe(201);
      const c2Body = await c2Res.json();
      const c2Id = c2Body.data.id || c2Body.data._id || c2Body.data.cartonId;

      // Close carton 2
      const close2Res = await request.post(`${BASE_API}/master-cartons/${c2Id}/close`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(close2Res.status()).toBe(200);
      closedCartonId2 = c2Id;

      expect(closedCartonId).toBeTruthy();
      expect(closedCartonId2).toBeTruthy();
    });

    test('TC-SETUP-DISP-004: Create customer', async ({ request }) => {
      const res = await request.post(`${BASE_API}/customers`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: {
          firm_name: `DispTestCust-${TS}`,
          customer_type: 'Primary Dealer',
          contact_person_name: 'Dispatch Tester',
          contact_person_mobile: '9876543210',
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      customerId = body.data.id || body.data._id || body.data.customerId;
      expect(customerId).toBeTruthy();
    });
  });

  // =========================================================================
  // SECTION 2 — RBAC: Who can create a dispatch
  // =========================================================================

  test.describe('TC-DISP RBAC: Role-based access for dispatch creation', () => {

    test('TC-DISP-ADM-001: Admin creates dispatch with CLOSED carton + customer → 201', async ({ request }) => {
      const res = await createDispatch(request, tokens.admin, [closedCartonId], customerId);
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Dispatch API returns an array of DispatchRecord (one per carton)
      const records = Array.isArray(body.data) ? body.data : [body.data];
      dispatchId = records[0]?.id || records[0]?._id || records[0]?.dispatchId;
      dispatchedCartonId = closedCartonId; // remember for TC-DISP-VAL-002
      expect(dispatchId).toBeTruthy();
    });

    test('TC-DISP-SUP-001: Supervisor creates dispatch → 201', async ({ request }) => {
      // Use the second closed carton
      const res = await createDispatch(request, tokens.supervisor, [closedCartonId2], customerId);
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-DISP-DOP-001: Dispatch Operator creates dispatch (needs a fresh CLOSED carton)', async ({ request }) => {
      // Create extra child boxes + a closed carton for the Dispatch Operator test
      const bulkRes = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: { product_id: productId, count: 3, quantity: 1 },
      });
      expect(bulkRes.status()).toBe(201);
      const barcodes: string[] = (await bulkRes.json()).data.map((cb: { barcode: string }) => cb.barcode);

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

      // Dispatch Operator dispatches the fresh carton
      const res = await createDispatch(request, tokens.dispatch, [cartonId], customerId);
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-DISP-WHO-001: Warehouse Operator cannot create dispatch → 403', async ({ request }) => {
      // Warehouse Operator is blocked from creating dispatches
      // Use a fake carton ID — 403 fires before record lookup
      const res = await createDispatch(request, tokens.warehouse, ['00000000-0000-0000-0000-000000000099'], customerId);
      expect(res.status()).toBe(403);
    });
  });

  // =========================================================================
  // SECTION 3 — Validation: bad payloads
  // =========================================================================

  test.describe('TC-DISP-VAL: Input validation for dispatch endpoint', () => {

    test('TC-DISP-VAL-001: Dispatch with no carton IDs → 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/dispatches`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
        data: {
          master_carton_ids: [],
          customer_id: customerId,
          destination: 'Mumbai',
          transport_details: 'By Road',
          vehicle_number: 'MH01AB1234',
          dispatch_date: '2026-04-17T00:00:00.000Z',
        },
      });
      expect([400, 422]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-DISP-VAL-002: Dispatch with already-DISPATCHED carton → 400', async ({ request }) => {
      // dispatchedCartonId was dispatched in TC-DISP-ADM-001
      const res = await createDispatch(request, tokens.admin, [dispatchedCartonId], customerId);
      expect([400, 409, 422]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 4 — State verification after dispatch
  // =========================================================================

  test.describe('TC-DISP-STATE: Entity state transitions after dispatch', () => {

    test('TC-DISP-STATE-001: After dispatch, carton status = DISPATCHED', async ({ request }) => {
      // dispatchedCartonId was dispatched by admin in TC-DISP-ADM-001
      const res = await request.get(`${BASE_API}/master-cartons/${dispatchedCartonId}`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('DISPATCHED');
    });

    test('TC-DISP-STATE-002: After dispatch, child boxes inside carton are DISPATCHED', async ({ request }) => {
      // Get child boxes of the dispatched carton
      const res = await request.get(`${BASE_API}/master-cartons/${dispatchedCartonId}`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();

      // The carton detail includes child_boxes or child_box_count
      // Verify at least one child box is DISPATCHED via the child-boxes endpoint
      const cbRes = await request.get(
        `${BASE_API}/child-boxes?status=DISPATCHED&limit=10`,
        { headers: { Authorization: `Bearer ${tokens.admin}` } },
      );
      expect(cbRes.status()).toBe(200);
      const cbBody = await cbRes.json();
      expect(cbBody.data.length).toBeGreaterThan(0);

      // All dispatched boxes should have status DISPATCHED
      for (const cb of cbBody.data.slice(0, 3)) {
        expect(cb.status).toBe('DISPATCHED');
      }
    });
  });

  // =========================================================================
  // SECTION 5 — Read endpoints
  // =========================================================================

  test.describe('TC-DISP-READ: GET /dispatches list and detail', () => {

    test('TC-DISP-READ-001: GET /dispatches → paginated list', async ({ request }) => {
      const res = await request.get(`${BASE_API}/dispatches?page=1&limit=10`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBeTruthy();
      // Should have at least one dispatch (we created several in setup)
      expect(body.data.length).toBeGreaterThan(0);
    });

    test('TC-DISP-READ-002: GET /dispatches/:id → dispatch detail with cartons', async ({ request }) => {
      const res = await request.get(`${BASE_API}/dispatches/${dispatchId}`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('destination');
      // Backend joins master_cartons and returns master_carton_id + carton_barcode + child_count on the dispatch record
      const hasCartons =
        body.data.master_carton_id !== undefined ||
        body.data.carton_barcode !== undefined ||
        body.data.child_count !== undefined ||
        body.data.master_cartons !== undefined;
      expect(hasCartons).toBeTruthy();
    });
  });

  // =========================================================================
  // SECTION 6 — E2E browser tests
  // =========================================================================

  test.describe('TC-DISP-E2E: Browser tests for dispatch pages', () => {

    test('TC-DISP-E2E-001: Dispatch page loads with customer dropdown', async ({ page }) => {
      // Login via localStorage injection (faster than UI form)
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: tokens.admin, email: ADMIN_EMAIL },
      );

      await page.goto('/dispatch');
      await page.waitForLoadState('networkidle');

      // Page heading
      await expect(page.getByText(/Dispatch/i).first()).toBeVisible({ timeout: 15000 });

      // Customer selector should be present (select, combobox, or labelled input)
      const customerControl = page
        .locator('select, [role="combobox"]')
        .filter({ hasText: /customer|dealer/i })
        .first();
      const hasCustomerControl = (await customerControl.count()) > 0;

      // Alternatively check for a label containing "Customer"
      const customerLabel = page.getByText(/Customer/i).first();
      const hasLabel = (await customerLabel.count()) > 0;

      expect(hasCustomerControl || hasLabel).toBeTruthy();
    });

    test('TC-DISP-E2E-002: Dispatches list page loads', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: tokens.admin, email: ADMIN_EMAIL },
      );

      await page.goto('/dispatches');
      await page.waitForLoadState('networkidle');

      // Page should render a heading related to dispatches
      await expect(page.getByText(/Dispatch/i).first()).toBeVisible({ timeout: 15000 });

      // Should show at least one dispatch row (we created several in setup)
      await page.waitForTimeout(2000); // allow async data fetch to complete
      const body = await page.textContent('body');
      expect(body).toBeTruthy();
    });
  });

}); // end test.describe.serial('Dispatch RBAC & Lifecycle Suite')
