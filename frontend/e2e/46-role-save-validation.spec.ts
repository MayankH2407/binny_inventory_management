/**
 * TC-ROLESAVE: Role Manager save validation
 *
 * Regression guard for two scenarios after the packing:repack permission was
 * purged from the catalog (June 2026):
 *   (a) PATCH a role with a valid catalog permission → 200
 *   (b) PATCH a role with packing:repack (non-catalog) → 400 "Invalid permission(s)"
 *
 * Self-contained: resolves its own admin token and supervisor role ID so it
 * does not depend on the shared state in 31-role-manager.spec.ts.
 */

import { test, expect } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

test.describe('TC-ROLESAVE: Role Manager save with valid vs invalid permissions', () => {
  let adminToken = '';
  let supervisorRoleId = '';

  test.beforeAll(async ({ request }) => {
    // Obtain admin token
    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(loginRes.ok(), 'Admin login must succeed').toBeTruthy();
    const loginBody = await loginRes.json();
    adminToken = loginBody.data.accessToken;
    expect(adminToken).toBeTruthy();

    // Resolve Supervisor role ID
    const rolesRes = await request.get(`${BASE_API}/roles`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(rolesRes.ok()).toBeTruthy();
    const rolesBody = await rolesRes.json();
    const roles: Array<{ id: string; name: string }> = rolesBody.data?.roles ?? rolesBody.data ?? [];
    const supervisorRole = roles.find((r) => r.name === 'Supervisor');
    expect(supervisorRole, 'Supervisor role must exist').toBeTruthy();
    supervisorRoleId = supervisorRole!.id;
  });

  // =========================================================================
  // TC-ROLESAVE-001: PATCH with valid catalog permission → 200
  // Verifies that saving a role with a catalog-valid permission still works
  // after the packing:repack purge (regression: old code had packing:repack
  // in DB; saving any role might have re-validated against stale data).
  // =========================================================================

  test('TC-ROLESAVE-001: PATCH Supervisor role with valid catalog permission returns 200', async ({ request }) => {
    expect(supervisorRoleId, 'supervisorRoleId must be resolved in beforeAll').toBeTruthy();

    // products:read is in the catalog — safe to set on any default role
    const res = await request.patch(`${BASE_API}/roles/${supervisorRoleId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        permissions: [{ permission: 'products:read', max_stage: null }],
      },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // =========================================================================
  // TC-ROLESAVE-002: PATCH with non-catalog permission (packing:repack) → 400
  // packing:repack was removed from the permission catalog in June 2026 when
  // the repack module was removed. The backend must reject it with 400.
  // =========================================================================

  test('TC-ROLESAVE-002: PATCH role with non-catalog permission (packing:repack) returns 400', async ({ request }) => {
    expect(supervisorRoleId, 'supervisorRoleId must be resolved in beforeAll').toBeTruthy();

    const res = await request.patch(`${BASE_API}/roles/${supervisorRoleId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        permissions: [{ permission: 'packing:repack', max_stage: null }],
      },
    });
    expect(res.status()).toBe(400);

    const body = await res.json();
    const msg: string = body.message ?? body.error ?? '';
    // Error must reference the invalid permission and point to the catalog
    expect(msg.toLowerCase()).toMatch(/invalid permission|packing:repack|catalog/i);
  });
});
