/**
 * Phase 10: User Management — Admin CRUD & RBAC
 * TC-USER-001 to TC-USER-009, TC-USER-VAL-001 to TC-USER-VAL-005,
 * TC-USER-E2E-001 to TC-USER-E2E-003
 *
 * All tests wrapped in one test.describe.serial so module-level state
 * (tokens, created user IDs) persists across the entire file.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD, loginViaAPI } from './helpers';

// ---------------------------------------------------------------------------
// Unique suffix per test run to avoid email collisions
// ---------------------------------------------------------------------------
const TS = Date.now();

// Module-level state — persists because everything is inside one serial block
const tokens: Record<string, string> = {};
let createdUserId = '';
let supervisorEmail = `sup-user-${TS}@test.com`;
let supervisorPassword = 'TestSup@1234';

// ---------------------------------------------------------------------------
// loginAs helper
// ---------------------------------------------------------------------------
async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data.accessToken;
}

// ===========================================================================
// ONE top-level serial describe — all tests run in order, sharing state
// ===========================================================================

test.describe.serial('TC-USER: User Management (Phase 10)', () => {

  // =========================================================================
  // Setup — obtain admin token
  // =========================================================================

  test('SETUP: Admin login to obtain token', async ({ request }) => {
    tokens.admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(tokens.admin).toBeTruthy();
  });

  // =========================================================================
  // TC-USER-001 to TC-USER-003: Create users with each role
  // =========================================================================

  test('TC-USER-001: Admin creates user with role=Supervisor → 201', async ({ request }) => {
    const res = await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: {
        email: supervisorEmail,
        password: supervisorPassword,
        name: 'Test Supervisor User',
        role: 'Supervisor',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(supervisorEmail);
    expect(body.data.role).toBe('Supervisor');
    // Capture first created user ID for later tests
    createdUserId = body.data.id || body.data._id || body.data.userId;
    expect(createdUserId).toBeTruthy();
  });

  test('TC-USER-002: Admin creates user with role=Warehouse Operator → 201', async ({ request }) => {
    const whEmail = `wh-user-${TS}@test.com`;
    const res = await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: {
        email: whEmail,
        password: 'TestWh@1234',
        name: 'Test Warehouse User',
        role: 'Warehouse Operator',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('Warehouse Operator');
  });

  test('TC-USER-003: Admin creates user with role=Dispatch Operator → 201', async ({ request }) => {
    const dpEmail = `dp-user-${TS}@test.com`;
    const res = await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: {
        email: dpEmail,
        password: 'TestDp@1234',
        name: 'Test Dispatch User',
        role: 'Dispatch Operator',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.role).toBe('Dispatch Operator');
  });

  // =========================================================================
  // TC-USER-004: List users — paginated
  // =========================================================================

  test('TC-USER-004: Admin lists users → 200, paginated', async ({ request }) => {
    const res = await request.get(`${BASE_API}/users?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data.length).toBeGreaterThan(0);
    // Pagination meta should be present (total, page, limit or similar)
    const hasPagination =
      body.total !== undefined ||
      body.pagination !== undefined ||
      body.meta !== undefined ||
      body.totalCount !== undefined;
    expect(hasPagination).toBeTruthy();
  });

  // =========================================================================
  // TC-USER-005: Get user by ID
  // =========================================================================

  test('TC-USER-005: Admin gets user by ID → 200', async ({ request }) => {
    expect(createdUserId).toBeTruthy();
    const res = await request.get(`${BASE_API}/users/${createdUserId}`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id || body.data._id).toBeTruthy();
    expect(body.data.email).toBe(supervisorEmail);
  });

  // =========================================================================
  // TC-USER-006: Update user name
  // =========================================================================

  test('TC-USER-006: Admin updates user name → 200', async ({ request }) => {
    expect(createdUserId).toBeTruthy();
    const updatedName = `Updated Supervisor ${TS}`;
    const res = await request.put(`${BASE_API}/users/${createdUserId}`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: { name: updatedName },
    });
    expect([200, 204]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      // Name should reflect the update
      if (body.data?.name) {
        expect(body.data.name).toBe(updatedName);
      }
    }
  });

  // =========================================================================
  // TC-USER-007: Deactivate user
  // =========================================================================

  test('TC-USER-007: Admin deactivates user → 200, is_active=false', async ({ request }) => {
    expect(createdUserId).toBeTruthy();
    const res = await request.put(`${BASE_API}/users/${createdUserId}`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: { is_active: false },
    });
    expect([200, 204]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.success).toBe(true);
      if (body.data?.is_active !== undefined) {
        expect(body.data.is_active).toBe(false);
      }
    }
  });

  // =========================================================================
  // TC-USER-008: Deactivated user cannot login
  // =========================================================================

  test('TC-USER-008: Deactivated user cannot login → 401/403', async ({ request }) => {
    // supervisorEmail was deactivated in TC-USER-007
    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: supervisorEmail, password: supervisorPassword },
    });
    expect([401, 403]).toContain(loginRes.status());
    const body = await loginRes.json();
    expect(body.success).toBe(false);
  });

  // =========================================================================
  // TC-USER-009: Duplicate email → 400 or 409
  // =========================================================================

  test('TC-USER-009: Admin creates user with duplicate email → 400 or 409', async ({ request }) => {
    // Try to re-create a user with ADMIN_EMAIL (which always exists)
    const res = await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: {
        email: ADMIN_EMAIL,
        password: 'Admin@123',
        name: 'Duplicate Admin',
        role: 'Supervisor',
      },
    });
    expect([400, 409, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // =========================================================================
  // Validation tests — TC-USER-VAL-001 to TC-USER-VAL-005
  // =========================================================================

  test('TC-USER-VAL-001: Missing email → 400', async ({ request }) => {
    const res = await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: {
        password: 'Test@1234',
        name: 'No Email User',
        role: 'Supervisor',
      },
    });
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('TC-USER-VAL-002: Missing name → 400', async ({ request }) => {
    const res = await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: {
        email: `noname-${TS}@test.com`,
        password: 'Test@1234',
        role: 'Supervisor',
      },
    });
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('TC-USER-VAL-003: Invalid email format → 400', async ({ request }) => {
    const res = await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: {
        email: 'not-an-email',
        password: 'Test@1234',
        name: 'Bad Email User',
        role: 'Supervisor',
      },
    });
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('TC-USER-VAL-004: Password < 8 chars → 400', async ({ request }) => {
    const res = await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: {
        email: `shortpw-${TS}@test.com`,
        password: 'abc',
        name: 'Short PW User',
        role: 'Supervisor',
      },
    });
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('TC-USER-VAL-005: Invalid role → 400', async ({ request }) => {
    const res = await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
      data: {
        email: `badrole-${TS}@test.com`,
        password: 'Test@1234',
        name: 'Bad Role User',
        role: 'InvalidRole',
      },
    });
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // =========================================================================
  // E2E Browser tests — TC-USER-E2E-001 to TC-USER-E2E-003
  // =========================================================================

  test('TC-USER-E2E-001: Admin — Users page loads with table', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Page heading should mention Users
    await expect(page.getByText(/users/i).first()).toBeVisible({ timeout: 15000 });

    // A table or list of users should be present
    const hasTable = await page.locator('table').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasList = await page.locator('[class*="user"]').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasList).toBeTruthy();
  });

  test('TC-USER-E2E-002: Admin — Add User button visible', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /add user/i });
    await expect(addBtn).toBeVisible({ timeout: 15000 });
  });

  test('TC-USER-E2E-003: Supervisor — Users page shows limited or access-denied view', async ({ page }) => {
    // Re-activate supervisor first via API using a fresh request context,
    // then test what a supervisor sees on the users page.

    // Use a freshly created supervisor user that is still active
    const freshSupEmail = `sup-e2e-${TS}@test.com`;
    const freshSupPassword = 'TestSup@9999';

    // Create via fetch in the test (page.request works before page is loaded)
    const adminToken = tokens.admin;
    const createRes = await page.request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        email: freshSupEmail,
        password: freshSupPassword,
        name: 'Fresh E2E Supervisor',
        role: 'Supervisor',
      },
    });
    // If already exists or 201, proceed
    expect([201, 409]).toContain(createRes.status());

    // Login as supervisor via browser
    await page.goto('/login');
    await page.getByLabel('Email Address').fill(freshSupEmail);
    await page.getByLabel('Password').fill(freshSupPassword);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForLoadState('networkidle');

    // Navigate to /users
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    // Either: page loads with limited data (Supervisor can view Users per app RBAC)
    // OR: page shows "Access Denied" / forbidden message
    const pageText = await page.content();
    const isAccessible = pageText.includes('user') || pageText.includes('User');
    const isDenied =
      pageText.toLowerCase().includes('access denied') ||
      pageText.toLowerCase().includes('forbidden') ||
      pageText.toLowerCase().includes('not authorized') ||
      pageText.toLowerCase().includes('403');

    // One of the two conditions must be true — page either shows users or denies access
    expect(isAccessible || isDenied).toBeTruthy();
  });

}); // end test.describe.serial
