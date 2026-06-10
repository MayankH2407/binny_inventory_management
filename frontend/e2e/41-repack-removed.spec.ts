/**
 * Phase 6: Repack feature removed — negative tests.
 * POST /master-cartons/repack should 404 (route not registered).
 * Sidebar must NOT contain a "Repack" link.
 *
 * Note: POST /master-cartons/repack/free-both is also removed as of the
 * 2-tab redesign (2026-06-10). That assertion lives in spec 42 (TC-RPK-FB-404)
 * to keep the two specs distinct.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD, loginViaAPI } from './helpers';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function loginAs(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.accessToken;
}

// ---------------------------------------------------------------------------
// TC-RPRM-API: Route removed
// ---------------------------------------------------------------------------
test.describe('TC-RPRM-API: Repack route removed', () => {
  test('TC-RPRM-API-001: POST /master-cartons/repack → 404 (route not found)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const res = await request.post(`${BASE_API}/master-cartons/repack`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { carton_id: '00000000-0000-0000-0000-000000000000' },
    });

    // Route should not exist → 404.
    // Some frameworks return 404 for unregistered POST; others 405 if the path
    // matches but the method doesn't. We accept either as "not found".
    expect(
      [404, 405].includes(res.status()),
      `Expected 404 or 405 for removed repack route, got ${res.status()}`
    ).toBeTruthy();
  });

  test('TC-RPRM-API-002: GET /master-cartons/repack → 404 (route not found)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const res = await request.get(`${BASE_API}/master-cartons/repack`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Not found or UUID param mismatch → anything except 2xx
    expect(res.ok()).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// TC-RPRM-UI: Sidebar navigation
// ---------------------------------------------------------------------------
test.describe('TC-RPRM-UI: Repack link absent from sidebar', () => {
  test('TC-RPRM-UI-001: Dashboard sidebar does NOT contain a "Repack" link', async ({ page }) => {
    await loginViaAPI(page);
    // Stay on the dashboard — sidebar is visible
    await page.waitForLoadState('networkidle');

    // There must be no link labelled exactly "Repack" anywhere in the sidebar/nav.
    // "Unpack & Repack" IS present; bare "Repack" is NOT.
    const repackLink = page.getByRole('link', { name: /^repack$/i });
    await expect(repackLink).toHaveCount(0);
  });

  test('TC-RPRM-UI-002: Navigating to /master-cartons/repack returns 404 or redirects', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto('/master-cartons/repack');
    await page.waitForLoadState('networkidle');

    // The page should either show a Next.js 404, an error boundary, or redirect away.
    // It must NOT render a working repack form.
    const pageContent = await page.content();
    const hasRepackForm =
      pageContent.toLowerCase().includes('repack') &&
      pageContent.toLowerCase().includes('<form');

    // A 404 page or redirect is acceptable; a full repack form is not.
    expect(hasRepackForm).toBeFalsy();
  });
});
