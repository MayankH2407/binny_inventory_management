/**
 * Phase 1: Authentication & RBAC — E2E Test Spec
 * TC-RBAC-001 to TC-RBAC-018, TC-RBAC-E2E-001 to 006, TC-DENY-001 to TC-DENY-039
 *
 * Coverage:
 *  - Section 1: Setup (create test users)
 *  - Section 2: Login per role (TC-RBAC-001–004)
 *  - Section 3: Login failures (TC-RBAC-005–010)
 *  - Section 4: Token & session (TC-RBAC-011–018)
 *  - Section 5: E2E login & navigation (TC-RBAC-E2E-001–006)
 *  - Section 6: RBAC denial — API tests (TC-DENY-001–039)
 *
 * IMPORTANT: Everything is wrapped in ONE top-level test.describe.serial so that
 * module-level state (tokens, resource IDs) persists across all describe blocks.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

// ---------------------------------------------------------------------------
// Test user definitions — unique emails per test run to avoid collisions
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
    email: `sup-${TS}@test.com`,
    password: 'TestSup@123',
    role: 'Supervisor',
    name: 'Test Supervisor',
  },
  warehouse: {
    email: `wh-${TS}@test.com`,
    password: 'TestWh@1234',
    role: 'Warehouse Operator',
    name: 'Test Warehouse Op',
  },
  dispatch: {
    email: `dp-${TS}@test.com`,
    password: 'TestDp@1234',
    role: 'Dispatch Operator',
    name: 'Test Dispatch Op',
  },
};

// Shared JWT tokens — populated in setup, persist because everything is in one serial block
const tokens: Record<string, string> = {};

// Shared test resource IDs created in beforeAll for denial tests
let testProductId = '';
let testCustomerId = '';
let testSectionId = '';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Login via API and return the access token */
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

/** Login via browser UI (fills the login form and clicks Sign In) */
async function loginViaUI(
  page: import('@playwright/test').Page,
  email: string,
  password: string
) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');
}

/** Set localStorage tokens and navigate to dashboard (fast, no form) */
async function setTokensAndNavigate(
  page: import('@playwright/test').Page,
  token: string,
  user: object
) {
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('binny_token', token);
      localStorage.setItem('binny_user', JSON.stringify(user));
    },
    { token, user }
  );
  await page.goto('/');
}

// ===========================================================================
// ONE top-level serial describe — guarantees all tests run in order and share
// module-level state (tokens, resource IDs).
// ===========================================================================

test.describe.serial('RBAC & Auth Suite', () => {

  // =========================================================================
  // SECTION 1 — Setup: Create test users & shared resources
  // =========================================================================

  test.describe('Setup: Create test users for all roles', () => {
    test('TC-SETUP-001: Create Supervisor, Warehouse Operator, Dispatch Operator users via Admin API', async ({
      request,
    }) => {
      // Obtain admin token
      const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
      tokens.admin = adminToken;

      // Create each non-admin test user
      for (const [key, user] of Object.entries(TEST_USERS)) {
        if (key === 'admin') continue;

        const res = await request.post(`${BASE_API}/users`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: {
            email: user.email,
            password: user.password,
            name: user.name,
            role: user.role,
          },
        });

        expect(res.status(), `Creating user for role ${user.role}`).toBe(201);
      }

      // Login as each role and store tokens for subsequent tests
      for (const [key, user] of Object.entries(TEST_USERS)) {
        tokens[key] = await loginAs(request, user.email, user.password);
      }

      // Verify all tokens were obtained
      expect(tokens.admin).toBeTruthy();
      expect(tokens.supervisor).toBeTruthy();
      expect(tokens.warehouse).toBeTruthy();
      expect(tokens.dispatch).toBeTruthy();
    });

    // Create shared resources that denial tests will reference
    test('TC-SETUP-002: Create shared test resources (product, customer, section) via Admin token', async ({
      request,
    }) => {
      const adminToken = tokens.admin;

      // Create a test section
      const sectionRes = await request.post(`${BASE_API}/sections`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { name: `RBACTestSection-${TS}` },
      });
      expect(sectionRes.status()).toBe(201);
      const sectionBody = await sectionRes.json();
      testSectionId = sectionBody.data.id || sectionBody.data._id || sectionBody.data.sectionId;

      // Create a test product (snake_case fields as expected by backend)
      // article_code max length is 20 chars — use last 6 digits of TS
      const productRes = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          article_name: `RBACTestProd-${TS}`,
          article_code: `RBAC${String(TS).slice(-6)}`,
          colour: 'Black',
          size: '8',
          category: 'Gents',
          section: 'Hawaii', // section name string, not section_id
          mrp: 199,
        },
      });
      if (productRes.status() === 201) {
        const productBody = await productRes.json();
        testProductId = productBody.data.id || productBody.data._id || productBody.data.productId;
      }

      // Create a test customer (snake_case fields as expected by backend)
      const customerRes = await request.post(`${BASE_API}/customers`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          firm_name: `RBACTestCust-${TS}`,
          customer_type: 'Primary Dealer',
          contact_person_name: 'RBAC Tester',
          contact_person_mobile: '9999999999',
        },
      });
      if (customerRes.status() === 201) {
        const customerBody = await customerRes.json();
        testCustomerId =
          customerBody.data.id || customerBody.data._id || customerBody.data.customerId;
      }
    });
  });

  // =========================================================================
  // SECTION 2 — Login per role (TC-RBAC-001 to TC-RBAC-004)
  // =========================================================================

  test.describe('TC-RBAC: Login per role — API', () => {
    test('TC-RBAC-001: Admin login returns token and correct role', async ({ request }) => {
      const res = await request.post(`${BASE_API}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBeTruthy();
      expect(body.data.user.role).toBe('Admin');
      expect(body.data.user.email).toBe(ADMIN_EMAIL);
    });

    test('TC-RBAC-002: Supervisor login returns token and correct role', async ({ request }) => {
      const res = await request.post(`${BASE_API}/auth/login`, {
        data: { email: TEST_USERS.supervisor.email, password: TEST_USERS.supervisor.password },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBeTruthy();
      expect(body.data.user.role).toBe('Supervisor');
    });

    test('TC-RBAC-003: Warehouse Operator login returns token and correct role', async ({
      request,
    }) => {
      const res = await request.post(`${BASE_API}/auth/login`, {
        data: { email: TEST_USERS.warehouse.email, password: TEST_USERS.warehouse.password },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBeTruthy();
      expect(body.data.user.role).toBe('Warehouse Operator');
    });

    test('TC-RBAC-004: Dispatch Operator login returns token and correct role', async ({
      request,
    }) => {
      const res = await request.post(`${BASE_API}/auth/login`, {
        data: { email: TEST_USERS.dispatch.email, password: TEST_USERS.dispatch.password },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.accessToken).toBeTruthy();
      expect(body.data.user.role).toBe('Dispatch Operator');
    });
  });

  // =========================================================================
  // SECTION 3 — Login failures (TC-RBAC-005 to TC-RBAC-010)
  // =========================================================================

  test.describe('TC-RBAC: Login failures — API', () => {
    test('TC-RBAC-005: Login with non-existent email returns 401', async ({ request }) => {
      const res = await request.post(`${BASE_API}/auth/login`, {
        data: { email: 'nobody@nonexistent.invalid', password: 'SomePass@123' },
      });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-RBAC-006: Login with wrong password returns 401', async ({ request }) => {
      const res = await request.post(`${BASE_API}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: 'WrongPassword@999' },
      });
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-RBAC-007: Login with empty email returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/auth/login`, {
        data: { email: '', password: ADMIN_PASSWORD },
      });
      expect([400, 401, 422]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-RBAC-008: Login with empty password returns 400', async ({ request }) => {
      const res = await request.post(`${BASE_API}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: '' },
      });
      expect([400, 401, 422]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-RBAC-009: Login with SQL injection payload in email returns 400/401', async ({
      request,
    }) => {
      const res = await request.post(`${BASE_API}/auth/login`, {
        data: { email: "admin'--@test.com", password: "' OR '1'='1" },
      });
      // Must not succeed — any non-200 code is acceptable
      expect(res.status()).not.toBe(200);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-RBAC-010: Deactivated/inactive user cannot log in', async ({ request }) => {
      // Create a temporary user, deactivate them via is_active boolean, then attempt login
      const adminToken = tokens.admin;

      const tempEmail = `inactive-${TS}@test.com`;
      const createRes = await request.post(`${BASE_API}/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          email: tempEmail,
          password: 'Inactive@123',
          name: 'Inactive User',
          role: 'Warehouse Operator',
        },
      });
      expect(createRes.status()).toBe(201);
      const createBody = await createRes.json();
      const userId = createBody.data.id || createBody.data._id || createBody.data.userId;

      // Deactivate the user via PUT using is_active boolean field
      const deactivateRes = await request.put(`${BASE_API}/users/${userId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { is_active: false },
      });
      expect([200, 204]).toContain(deactivateRes.status());

      // Attempt login — should be rejected
      const loginRes = await request.post(`${BASE_API}/auth/login`, {
        data: { email: tempEmail, password: 'Inactive@123' },
      });
      expect([401, 403]).toContain(loginRes.status());
      const loginBody = await loginRes.json();
      expect(loginBody.success).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 4 — Token & Session (TC-RBAC-011 to TC-RBAC-018)
  // =========================================================================

  test.describe('TC-RBAC: Token & Session — API', () => {
    test('TC-RBAC-011: Expired/invalid token string returns 401', async ({ request }) => {
      const fakeExpiredToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
        'eyJzdWIiOiIxMjM0NTY3ODkwIiwicm9sZSI6IkFkbWluIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjF9.' +
        'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const res = await request.get(`${BASE_API}/auth/profile`, {
        headers: { Authorization: `Bearer ${fakeExpiredToken}` },
      });
      expect(res.status()).toBe(401);
    });

    test('TC-RBAC-012: Malformed token (garbage string) returns 401', async ({ request }) => {
      const res = await request.get(`${BASE_API}/auth/profile`, {
        headers: { Authorization: 'Bearer notavalidtoken.abc.xyz' },
      });
      expect(res.status()).toBe(401);
    });

    test('TC-RBAC-013: Missing Authorization header returns 401', async ({ request }) => {
      const res = await request.get(`${BASE_API}/auth/profile`);
      expect(res.status()).toBe(401);
    });

    test('TC-RBAC-014: GET /auth/profile returns correct user data for Admin', async ({
      request,
    }) => {
      const adminToken = tokens.admin;
      const res = await request.get(`${BASE_API}/auth/profile`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Profile data is wrapped in body.data
      expect(body.data.email).toBe(ADMIN_EMAIL);
      expect(body.data.role).toBe('Admin');
      // Sensitive fields should NOT be returned
      expect(body.data.password).toBeUndefined();
      expect(body.data.passwordHash).toBeUndefined();
    });

    test('TC-RBAC-015: GET /auth/profile returns correct user data for Supervisor', async ({
      request,
    }) => {
      const supToken = tokens.supervisor;
      const res = await request.get(`${BASE_API}/auth/profile`, {
        headers: { Authorization: `Bearer ${supToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Profile data is wrapped in body.data; check id, name, email, role fields
      expect(body.data.role).toBe('Supervisor');
      expect(body.data.email).toBe(TEST_USERS.supervisor.email);
    });

    test('TC-RBAC-016: Change password — new password works for login', async ({ request }) => {
      // Create a dedicated user for this test
      const adminToken = tokens.admin;

      const cpEmail = `cp-test-${TS}@test.com`;
      const cpOldPw = 'OldPass@123';
      const cpNewPw = 'NewPass@456';

      const createRes = await request.post(`${BASE_API}/users`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { email: cpEmail, password: cpOldPw, name: 'CPTest User', role: 'Warehouse Operator' },
      });
      expect(createRes.status()).toBe(201);

      // Login to get token
      const userToken = await loginAs(request, cpEmail, cpOldPw);

      // Change password
      const changeRes = await request.put(`${BASE_API}/auth/change-password`, {
        headers: { Authorization: `Bearer ${userToken}` },
        data: { currentPassword: cpOldPw, newPassword: cpNewPw },
      });
      expect(changeRes.status()).toBe(200);

      // Verify new password works
      const newLoginRes = await request.post(`${BASE_API}/auth/login`, {
        data: { email: cpEmail, password: cpNewPw },
      });
      expect(newLoginRes.status()).toBe(200);
      const newLoginBody = await newLoginRes.json();
      expect(newLoginBody.data.accessToken).toBeTruthy();
    });

    test('TC-RBAC-017: Change password — wrong current password returns 400/401', async ({
      request,
    }) => {
      // Use any valid token; admin is available
      const adminToken = tokens.admin;

      const res = await request.put(`${BASE_API}/auth/change-password`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { currentPassword: 'TotallyWrong@000', newPassword: 'NewAdminPass@1' },
      });
      expect([400, 401, 403, 422]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    test('TC-RBAC-018: Logout endpoint invalidates session / returns 200', async ({ request }) => {
      // Login fresh to get a token we will then log out
      const loginRes = await request.post(`${BASE_API}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      const loginBody = await loginRes.json();
      const sessionToken = loginBody.data.accessToken;

      const logoutRes = await request.post(`${BASE_API}/auth/logout`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      expect([200, 204]).toContain(logoutRes.status());
    });
  });

  // =========================================================================
  // SECTION 5 — E2E Login & Navigation (TC-RBAC-E2E-001 to TC-RBAC-E2E-006)
  // =========================================================================

  test.describe('TC-RBAC-E2E: Login page & navigation — Browser', () => {
    test('TC-RBAC-E2E-001: Login page renders with expected elements', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByText('Binny Inventory')).toBeVisible({ timeout: 10000 });
      await expect(page.getByLabel('Email Address')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    });

    test('TC-RBAC-E2E-002: Admin UI login redirects to dashboard', async ({ page }) => {
      await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 20000 });
      await expect(page).toHaveURL(/\/(dashboard)?$/);
    });

    test('TC-RBAC-E2E-003: Admin sidebar shows all nav items including Users', async ({ page }) => {
      await loginViaUI(page, ADMIN_EMAIL, ADMIN_PASSWORD);
      await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 20000 });

      // Admin sees management-only items
      await expect(page.getByRole('link', { name: 'Products' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Customers' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Users' }).first()).toBeVisible();

      // Also shows core nav items
      await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Child Boxes' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Master Cartons' }).first()).toBeVisible();
    });

    test('TC-RBAC-E2E-004: Supervisor sidebar shows Products, Customers, and Users (management role)', async ({
      page,
    }) => {
      // Login as supervisor via UI to get a real session
      await loginViaUI(page, TEST_USERS.supervisor.email, TEST_USERS.supervisor.password);
      await page.waitForLoadState('networkidle');

      // Supervisor is "management" (isManagement = isAdmin || isSupervisor)
      // So adminOnly nav items ARE visible for Supervisor
      await expect(page.getByRole('link', { name: 'Products' }).first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByRole('link', { name: 'Customers' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Users' }).first()).toBeVisible();
    });

    test('TC-RBAC-E2E-005: Warehouse Operator sidebar does NOT show Products, Customers, or Users', async ({
      page,
    }) => {
      // Login as warehouse operator via UI to get a real session
      await loginViaUI(page, TEST_USERS.warehouse.email, TEST_USERS.warehouse.password);
      await page.waitForLoadState('networkidle');

      // Management-only links must be absent
      await expect(page.getByRole('link', { name: 'Products' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Customers' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);

      // Core links should still be visible
      await expect(page.getByRole('link', { name: 'Dashboard' }).first()).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByRole('link', { name: 'Child Boxes' }).first()).toBeVisible();
      await expect(page.getByRole('link', { name: 'Master Cartons' }).first()).toBeVisible();
    });

    test('TC-RBAC-E2E-006: Unauthenticated access to protected route redirects to /login', async ({
      page,
    }) => {
      // Navigate to login first to ensure page context, then clear storage
      await page.goto('/login');
      await page.evaluate(() => {
        localStorage.removeItem('binny_token');
        localStorage.removeItem('binny_user');
      });

      // Attempt to access protected dashboard
      await page.goto('/dashboard');
      await page.waitForURL('**/login', { timeout: 10000 });
      await expect(page).toHaveURL(/.*login/);
    });
  });

  // =========================================================================
  // SECTION 6 — RBAC Denial — API Tests (TC-DENY-001 to TC-DENY-039)
  //
  // Grouped by module. Each test asserts HTTP 403 for the denied role.
  // Tokens persist because this is inside the single serial describe.
  // =========================================================================

  test.describe('TC-DENY: User Management — Supervisor cannot manage users', () => {
    test('TC-DENY-001: Supervisor cannot POST /users (create user)', async ({ request }) => {
      const res = await request.post(`${BASE_API}/users`, {
        headers: { Authorization: `Bearer ${tokens.supervisor}` },
        data: {
          email: `denied-${TS}@test.com`,
          password: 'Denied@123',
          name: 'Denied User',
          role: 'Warehouse Operator',
        },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-002: Supervisor cannot PUT /users/:id (update user)', async ({ request }) => {
      // Use any user ID — 403 should fire before record lookup
      const fakeId = '00000000-0000-0000-0000-000000000001';
      const res = await request.put(`${BASE_API}/users/${fakeId}`, {
        headers: { Authorization: `Bearer ${tokens.supervisor}` },
        data: { is_active: false },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-003: Supervisor cannot DELETE /users/:id', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000001';
      const res = await request.delete(`${BASE_API}/users/${fakeId}`, {
        headers: { Authorization: `Bearer ${tokens.supervisor}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-004: Warehouse Operator cannot POST /users', async ({ request }) => {
      const res = await request.post(`${BASE_API}/users`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
        data: {
          email: `denied2-${TS}@test.com`,
          password: 'Denied@123',
          name: 'Denied User 2',
          role: 'Warehouse Operator',
        },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-005: Warehouse Operator cannot GET /users (list)', async ({ request }) => {
      const res = await request.get(`${BASE_API}/users`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-006: Dispatch Operator cannot POST /users', async ({ request }) => {
      const res = await request.post(`${BASE_API}/users`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
        data: {
          email: `denied3-${TS}@test.com`,
          password: 'Denied@123',
          name: 'Denied User 3',
          role: 'Dispatch Operator',
        },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-007: Dispatch Operator cannot GET /users (list)', async ({ request }) => {
      const res = await request.get(`${BASE_API}/users`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('TC-DENY: Product Management — restricted roles', () => {
    test('TC-DENY-008: Warehouse Operator cannot POST /products (create product)', async ({
      request,
    }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
        data: {
          article_name: 'Denied Product',
          article_code: 'DENIED-001',
          colour: 'Red',
          size: '7',
          category: 'Gents',
          section: 'Hawaii',
          mrp: 99,
        },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-009: Warehouse Operator cannot PUT /products/:id (update product)', async ({
      request,
    }) => {
      const productId = testProductId || '00000000-0000-0000-0000-000000000002';
      const res = await request.put(`${BASE_API}/products/${productId}`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
        data: { mrp: 299 },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-010: Warehouse Operator cannot DELETE /products/:id', async ({ request }) => {
      const productId = testProductId || '00000000-0000-0000-0000-000000000002';
      const res = await request.delete(`${BASE_API}/products/${productId}`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-011: Dispatch Operator cannot POST /products', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
        data: {
          article_name: 'Denied Product 2',
          article_code: 'DENIED-002',
          colour: 'Blue',
          size: '8',
          category: 'Ladies',
          section: 'PU',
          mrp: 149,
        },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-012: Dispatch Operator cannot PUT /products/:id', async ({ request }) => {
      const productId = testProductId || '00000000-0000-0000-0000-000000000002';
      const res = await request.put(`${BASE_API}/products/${productId}`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
        data: { mrp: 399 },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-013: Dispatch Operator cannot DELETE /products/:id', async ({ request }) => {
      const productId = testProductId || '00000000-0000-0000-0000-000000000002';
      const res = await request.delete(`${BASE_API}/products/${productId}`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-014: Warehouse Operator cannot DELETE /products/:id (Admin only endpoint)', async ({
      request,
    }) => {
      const productId = testProductId || '00000000-0000-0000-0000-000000000002';
      const res = await request.delete(`${BASE_API}/products/${productId}`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('TC-DENY: Customer Management — restricted roles', () => {
    test('TC-DENY-015: Warehouse Operator cannot POST /customers (create customer)', async ({
      request,
    }) => {
      const res = await request.post(`${BASE_API}/customers`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
        data: {
          firm_name: 'Denied Customer',
          customer_type: 'Primary Dealer',
          contact_person_name: 'Nobody',
          contact_person_mobile: '8888888888',
        },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-016: Warehouse Operator cannot PUT /customers/:id (update customer)', async ({
      request,
    }) => {
      const customerId = testCustomerId || '00000000-0000-0000-0000-000000000003';
      const res = await request.put(`${BASE_API}/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
        data: { contact_person_name: 'Updated Name' },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-017: Warehouse Operator cannot DELETE /customers/:id', async ({ request }) => {
      const customerId = testCustomerId || '00000000-0000-0000-0000-000000000003';
      const res = await request.delete(`${BASE_API}/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-018: Dispatch Operator cannot POST /customers', async ({ request }) => {
      const res = await request.post(`${BASE_API}/customers`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
        data: {
          firm_name: 'Denied Customer 2',
          customer_type: 'Sub Dealer',
          contact_person_name: 'Nobody2',
          contact_person_mobile: '7777777777',
        },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-019: Dispatch Operator cannot DELETE /customers/:id', async ({ request }) => {
      const customerId = testCustomerId || '00000000-0000-0000-0000-000000000003';
      const res = await request.delete(`${BASE_API}/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('TC-DENY: Section Management — only Admin can mutate', () => {
    test('TC-DENY-020: Supervisor cannot POST /sections (create section)', async ({ request }) => {
      const res = await request.post(`${BASE_API}/sections`, {
        headers: { Authorization: `Bearer ${tokens.supervisor}` },
        data: { name: `DeniedSection-${TS}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-021: Supervisor cannot PUT /sections/:id', async ({ request }) => {
      const sectionId = testSectionId || '00000000-0000-0000-0000-000000000004';
      const res = await request.put(`${BASE_API}/sections/${sectionId}`, {
        headers: { Authorization: `Bearer ${tokens.supervisor}` },
        data: { name: 'Denied Update' },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-022: Supervisor cannot DELETE /sections/:id', async ({ request }) => {
      const sectionId = testSectionId || '00000000-0000-0000-0000-000000000004';
      const res = await request.delete(`${BASE_API}/sections/${sectionId}`, {
        headers: { Authorization: `Bearer ${tokens.supervisor}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-023: Warehouse Operator cannot POST /sections', async ({ request }) => {
      const res = await request.post(`${BASE_API}/sections`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
        data: { name: `DeniedSection2-${TS}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-024: Dispatch Operator cannot POST /sections', async ({ request }) => {
      const res = await request.post(`${BASE_API}/sections`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
        data: { name: `DeniedSection3-${TS}` },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('TC-DENY: Reports — restricted to Admin and Supervisor only', () => {
    test('TC-DENY-025: Warehouse Operator cannot GET /reports/inventory-summary', async ({
      request,
    }) => {
      const res = await request.get(`${BASE_API}/reports/inventory-summary`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-026: Warehouse Operator cannot GET /reports/product-wise', async ({ request }) => {
      const res = await request.get(`${BASE_API}/reports/product-wise`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-027: Warehouse Operator cannot GET /reports/dispatch-summary', async ({
      request,
    }) => {
      const res = await request.get(`${BASE_API}/reports/dispatch-summary`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-028: Dispatch Operator cannot GET /reports/inventory-summary', async ({
      request,
    }) => {
      const res = await request.get(`${BASE_API}/reports/inventory-summary`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-029: Dispatch Operator cannot GET /reports/dispatch-summary', async ({
      request,
    }) => {
      const res = await request.get(`${BASE_API}/reports/dispatch-summary`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-030: Dispatch Operator cannot GET /reports/daily-activity', async ({
      request,
    }) => {
      const res = await request.get(`${BASE_API}/reports/daily-activity`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('TC-DENY: Master Carton — close requires Admin or Supervisor', () => {
    test('TC-DENY-031: Warehouse Operator cannot POST /master-cartons/:id/close', async ({
      request,
    }) => {
      // Use a non-existent ID — 403 must fire before 404 record lookup
      const fakeId = '00000000-0000-0000-0000-000000000005';
      const res = await request.post(`${BASE_API}/master-cartons/${fakeId}/close`, {
        headers: { Authorization: `Bearer ${tokens.warehouse}` },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-032: Dispatch Operator cannot POST /master-cartons/:id/close', async ({
      request,
    }) => {
      const fakeId = '00000000-0000-0000-0000-000000000005';
      const res = await request.post(`${BASE_API}/master-cartons/${fakeId}/close`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('TC-DENY: Child Box creation — Dispatch Operator is blocked', () => {
    test('TC-DENY-033: Dispatch Operator cannot POST /child-boxes', async ({ request }) => {
      const res = await request.post(`${BASE_API}/child-boxes`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
        data: {
          productId: '00000000-0000-0000-0000-000000000006',
          quantity: 1,
        },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-034: Dispatch Operator cannot POST /child-boxes/bulk', async ({ request }) => {
      const res = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
        data: {
          productId: '00000000-0000-0000-0000-000000000006',
          quantity: 5,
        },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('TC-DENY: Master Carton creation — Dispatch Operator is blocked', () => {
    test('TC-DENY-035: Dispatch Operator cannot POST /master-cartons', async ({ request }) => {
      const res = await request.post(`${BASE_API}/master-cartons`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
        data: { barcode: `DENIED-${TS}`, productId: '00000000-0000-0000-0000-000000000006' },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-036: Dispatch Operator cannot POST /master-cartons/pack', async ({ request }) => {
      const res = await request.post(`${BASE_API}/master-cartons/pack`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
        data: {
          masterCartonId: '00000000-0000-0000-0000-000000000005',
          childBoxId: '00000000-0000-0000-0000-000000000006',
        },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('TC-DENY: Product bulk upload — restricted to Admin & Supervisor', () => {
    test('TC-DENY-037: Warehouse Operator cannot POST /products/bulk-upload', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products/bulk-upload`, {
        headers: {
          Authorization: `Bearer ${tokens.warehouse}`,
          'Content-Type': 'multipart/form-data',
        },
        multipart: {
          file: {
            name: 'test.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('article_name,article_code\nTest,T001'),
          },
        },
      });
      expect(res.status()).toBe(403);
    });

    test('TC-DENY-038: Dispatch Operator cannot GET /products/bulk-upload/sample', async ({
      request,
    }) => {
      const res = await request.get(`${BASE_API}/products/bulk-upload/sample`, {
        headers: { Authorization: `Bearer ${tokens.dispatch}` },
      });
      expect(res.status()).toBe(403);
    });
  });

  test.describe('TC-DENY: No token — all protected endpoints reject unauthenticated calls', () => {
    test('TC-DENY-039: Unauthenticated request to /users returns 401', async ({ request }) => {
      const res = await request.get(`${BASE_API}/users`);
      expect(res.status()).toBe(401);
    });
  });

}); // end test.describe.serial('RBAC & Auth Suite')
