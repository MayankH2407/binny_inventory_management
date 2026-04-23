/**
 * Phase 3: Customer CRUD — Per Role
 * TC-CUST-ADM-001 to TC-CUST-E2E-003 (Section 36)
 *
 * Coverage:
 *  - Setup: create test users for all 4 roles
 *  - Admin Customer CRUD (create Primary Dealer, Sub Dealer, update, delete, filter)
 *  - Supervisor Customer operations
 *  - Warehouse Operator read-only
 *  - Customer validation (missing fields, invalid GSTIN)
 *  - E2E browser tests for customers page
 *
 * IMPORTANT: Everything is wrapped in ONE top-level test.describe.serial so that
 * module-level state (tokens, resource IDs) persists across all describe blocks.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

// ---------------------------------------------------------------------------
// Unique timestamp for this test run
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
    email: `sup-cust-${TS}@test.com`,
    password: 'TestSup@1234',
    role: 'Supervisor',
    name: `Cust Supervisor ${TS}`,
  },
  warehouse: {
    email: `wh-cust-${TS}@test.com`,
    password: 'TestWh@1234',
    role: 'Warehouse Operator',
    name: `Cust Warehouse ${TS}`,
  },
  dispatch: {
    email: `dp-cust-${TS}@test.com`,
    password: 'TestDp@1234',
    role: 'Dispatch Operator',
    name: `Cust Dispatch ${TS}`,
  },
};

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------
const tokens: Record<string, string> = {};
let primaryDealerId = '';
let primaryDealerId2 = '';
let customerId = '';        // a customer created by Admin for update/delete tests
let supCustomerId = '';     // a customer created by Supervisor

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

test.describe.serial('Customer RBAC Suite', () => {

  // =========================================================================
  // SETUP — Create test users
  // =========================================================================

  test.describe('Setup', () => {
    test('CUST-SETUP-001: Create test users for all roles', async ({ request }) => {
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
  });

  // =========================================================================
  // SECTION 36.1 — Admin Customer Operations
  // =========================================================================

  test.describe('TC-CUST-ADM: Admin customer CRUD', () => {
    test('TC-CUST-ADM-001: Admin creates Primary Dealer — 201', async ({ request }) => {
      const res = await request.post(`${BASE_API}/customers`, {
        headers: authHeader(tokens.admin),
        data: {
          firm_name: `ABC Traders ${TS}`,
          customer_type: 'Primary Dealer',
          contact_person_name: 'John Dealer',
          contact_person_mobile: '9876543210',
          address: 'Mumbai, MH',
          gstin: '27AAPFU0939F1ZV',
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeTruthy();
      expect(body.data.customer_type).toBe('Primary Dealer');
      primaryDealerId = body.data.id;
      customerId = body.data.id;
    });

    test('TC-CUST-ADM-002: Admin creates Sub Dealer with primary_dealer_id — 201, fields auto-filled', async ({
      request,
    }) => {
      expect(primaryDealerId).toBeTruthy();

      const res = await request.post(`${BASE_API}/customers`, {
        headers: authHeader(tokens.admin),
        data: {
          firm_name: `XYZ Sub Shop ${TS}`,
          customer_type: 'Sub Dealer',
          primary_dealer_id: primaryDealerId,
          contact_person_mobile: '9123456780',
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeTruthy();
      expect(body.data.customer_type).toBe('Sub Dealer');
      // primary_dealer_id should be stored
      expect(body.data.primary_dealer_id).toBe(primaryDealerId);
    });

    test('TC-CUST-ADM-003: Admin creates Sub Dealer WITHOUT primary_dealer_id — 400', async ({
      request,
    }) => {
      const res = await request.post(`${BASE_API}/customers`, {
        headers: authHeader(tokens.admin),
        data: {
          firm_name: `Orphan Sub ${TS}`,
          customer_type: 'Sub Dealer',
          contact_person_mobile: '9000000001',
          // primary_dealer_id intentionally omitted
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-CUST-ADM-004: Admin updates customer — 200', async ({ request }) => {
      expect(customerId).toBeTruthy();

      const res = await request.put(`${BASE_API}/customers/${customerId}`, {
        headers: authHeader(tokens.admin),
        data: { firm_name: `Updated Firm ${TS}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-CUST-ADM-005: Admin deletes customer — 200', async ({ request }) => {
      // Create a dedicated customer to delete
      const createRes = await request.post(`${BASE_API}/customers`, {
        headers: authHeader(tokens.admin),
        data: {
          firm_name: `Delete Target Cust ${TS}`,
          customer_type: 'Primary Dealer',
          contact_person_name: 'Delete Me',
          contact_person_mobile: '9111111111',
        },
      });
      expect(createRes.status()).toBe(201);
      const createBody = await createRes.json();
      const deleteTargetId = createBody.data.id;

      const res = await request.delete(`${BASE_API}/customers/${deleteTargetId}`, {
        headers: authHeader(tokens.admin),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-CUST-ADM-006: Admin GET /customers — 200 with customer_type column', async ({
      request,
    }) => {
      const res = await request.get(`${BASE_API}/customers`, {
        headers: authHeader(tokens.admin),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);

      // Each customer record should have customer_type field
      if (body.data.length > 0) {
        const firstCustomer = body.data[0];
        expect(firstCustomer.customer_type).toBeDefined();
        expect(['Primary Dealer', 'Sub Dealer']).toContain(firstCustomer.customer_type);
      }
    });

    test('TC-CUST-ADM-007: Admin filter by customer_type=Primary Dealer — only primaries returned', async ({
      request,
    }) => {
      const res = await request.get(
        `${BASE_API}/customers?customer_type=Primary Dealer`,
        {
          headers: authHeader(tokens.admin),
        }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // All returned records should be Primary Dealer
      if (Array.isArray(body.data) && body.data.length > 0) {
        for (const customer of body.data) {
          expect(customer.customer_type).toBe('Primary Dealer');
        }
      }
    });

    test('TC-CUST-ADM-008: Admin GET /customers/primary-dealers — only active primaries', async ({
      request,
    }) => {
      const res = await request.get(`${BASE_API}/customers/primary-dealers`, {
        headers: authHeader(tokens.admin),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // All entries should be Primary Dealers
      for (const c of body.data) {
        expect(c.customer_type).toBe('Primary Dealer');
      }
    });
  });

  // =========================================================================
  // SECTION 36.2 — Supervisor Customer Operations
  // =========================================================================

  test.describe('TC-CUST-SUP: Supervisor customer operations', () => {
    test('TC-CUST-SUP-001: Supervisor creates customer — 201', async ({ request }) => {
      const res = await request.post(`${BASE_API}/customers`, {
        headers: authHeader(tokens.supervisor),
        data: {
          firm_name: `Sup Primary ${TS}`,
          customer_type: 'Primary Dealer',
          contact_person_name: 'Sup Contact',
          contact_person_mobile: '9811112222',
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.customer_type).toBe('Primary Dealer');
      supCustomerId = body.data.id;
    });

    test('TC-CUST-SUP-002: Supervisor CANNOT delete customer — 403', async ({ request }) => {
      const targetId = supCustomerId || customerId || '00000000-0000-0000-0000-000000000001';
      const res = await request.delete(`${BASE_API}/customers/${targetId}`, {
        headers: authHeader(tokens.supervisor),
      });
      expect(res.status()).toBe(403);
    });
  });

  // =========================================================================
  // SECTION 36.3 — Read-Only / Denied Roles
  // =========================================================================

  test.describe('TC-CUST-WHO: Warehouse Operator customer access', () => {
    test('TC-CUST-WHO-001: Warehouse Operator GET /customers — 200', async ({ request }) => {
      const res = await request.get(`${BASE_API}/customers`, {
        headers: authHeader(tokens.warehouse),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-CUST-WHO-002: Warehouse Operator POST /customers — 403', async ({ request }) => {
      const res = await request.post(`${BASE_API}/customers`, {
        headers: authHeader(tokens.warehouse),
        data: {
          firm_name: `WH Attempt ${TS}`,
          customer_type: 'Primary Dealer',
          contact_person_name: 'Nobody',
          contact_person_mobile: '8888888888',
        },
      });
      expect(res.status()).toBe(403);
    });
  });

  // =========================================================================
  // SECTION 36.4 — Customer Validation
  // =========================================================================

  test.describe('TC-CUST-VAL: Customer validation', () => {
    test('TC-CUST-VAL-001: Missing firm_name returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/customers`, {
        headers: authHeader(tokens.admin),
        data: {
          customer_type: 'Primary Dealer',
          contact_person_mobile: '9876543210',
          // firm_name intentionally omitted
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-CUST-VAL-002: Invalid GSTIN format returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/customers`, {
        headers: authHeader(tokens.admin),
        data: {
          firm_name: `Bad GSTIN Co ${TS}`,
          customer_type: 'Primary Dealer',
          contact_person_mobile: '9876543210',
          gstin: 'INVALIDGSTIN', // not 15-char GST format
        },
      });
      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 36.5 — E2E Browser Tests: Customers page
  // =========================================================================

  test.describe('TC-CUST-E2E: Customers page — browser', () => {
    test('TC-CUST-E2E-001: Admin — Customers page loads', async ({ page }) => {
      // Login via UI
      await page.goto('/login');
      await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
      await page.getByLabel('Password').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      // Wait until redirected away from /login (dashboard loaded)
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      await page.goto('/customers');
      await page.waitForLoadState('networkidle');

      // Page should render without crashing
      await expect(page.locator('body')).toBeVisible();
      // Should show the Customers heading inside <main> (the layout Header also has an h1 with the page title)
      await expect(
        page.locator('main').getByRole('heading', { name: 'Customers' })
      ).toBeVisible({ timeout: 15000 });
    });

    test('TC-CUST-E2E-002: Admin — Add Customer button visible', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
      await page.getByLabel('Password').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      await page.goto('/customers');
      await page.waitForLoadState('networkidle');

      const addBtn = page.getByRole('button', { name: /add customer/i });
      await expect(addBtn).toBeVisible({ timeout: 15000 });
      await expect(addBtn).toBeEnabled();
    });

    test('TC-CUST-E2E-003: Admin — Type selector (Primary/Sub Dealer) in modal', async ({
      page,
    }) => {
      await page.goto('/login');
      await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
      await page.getByLabel('Password').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
      await page.waitForLoadState('networkidle');

      await page.goto('/customers');
      await page.waitForLoadState('networkidle');

      const addBtn = page.getByRole('button', { name: /add customer/i });
      await expect(addBtn).toBeVisible({ timeout: 15000 });
      await addBtn.click();

      // Wait for modal to open
      await page.waitForTimeout(1000);

      // Type selector — scoped to the dialog so we don't collide with list-page select options.
      // Modal renders radio inputs with name="customer_type".
      const dialog = page.getByRole('dialog');
      await expect(
        dialog.locator('input[type="radio"][name="customer_type"][value="Primary Dealer"]')
      ).toBeVisible({ timeout: 5000 });
      await expect(
        dialog.locator('input[type="radio"][name="customer_type"][value="Sub Dealer"]')
      ).toBeVisible({ timeout: 5000 });
    });
  });

}); // end test.describe.serial('Customer RBAC Suite')
