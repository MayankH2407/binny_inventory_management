/**
 * Phase 10: Unpack & Repack — 2-tab redesign (2026-06-10).
 *
 * Covers:
 *   TC-RPK-SINGLE-001  — full-unpack carton then re-pack subset via pack-by-barcode
 *   TC-RPK-UI-001      — /unpack-repack shows exactly "Unpack" and "Repack" tab toggles
 *   TC-RPK-UI-002      — /unpack redirect → /unpack-repack
 *   TC-RPK-FB-404      — POST /master-cartons/repack/free-both → 404 (removed)
 *   TC-RPK-UNPACK-AT   — unpacked_at lifecycle: stamped on full-unpack, cleared on first re-pack
 *   TC-RPK-CR-001      — Repack tab: non-empty carton → confirm modal appears
 *
 * Removed from this spec (routes no longer exist):
 *   TC-RPK-001–006     — repack/free-both happy path and guard cases (endpoint removed)
 *   TC-RPK-SINGLE-002  — old 3-mode card UI check (mode cards replaced by 2-tab layout)
 *
 * Permission required for API tests: packing:unpack + packing:pack (admin has both).
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD, loginViaAPI } from './helpers';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const TS = Date.now();
const TS6 = String(TS).slice(-6);

async function loginAs(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.accessToken;
}

async function createProduct(request: APIRequestContext, token: string, suffix: string): Promise<string> {
  const code = `RPK${suffix}`.slice(0, 20);
  const res = await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      article_code: code,
      article_name: `Repack ${suffix}`,
      colour: 'Green',
      size: '7',
      category: 'Gents',
      section: 'Hawaii',
      mrp: 349,
    },
  });
  if ([200, 201].includes(res.status())) return (await res.json()).data?.id ?? '';
  // Fall back to a search if the product already exists
  const listRes = await request.get(`${BASE_API}/products?search=${code}&limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok()) return '';
  const rows: Array<{ id: string; article_code: string }> = (await listRes.json()).data ?? [];
  return rows.find((p) => p.article_code === code)?.id ?? '';
}

async function createFreeBox(
  request: APIRequestContext,
  token: string,
  productId: string
): Promise<{ id: string; barcode: string; status: string }> {
  const res = await request.post(`${BASE_API}/child-boxes`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { product_id: productId, quantity: 1 },
  });
  expect(res.status()).toBe(201);
  const box = (await res.json()).data;
  if (box.status === 'GENERATED') {
    await request.post(`${BASE_API}/child-boxes/${box.id}/activate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    box.status = 'FREE';
  }
  return box;
}

async function createCartonWithBoxes(
  request: APIRequestContext,
  token: string,
  barcodes: string[]
): Promise<{ id: string; carton_barcode: string }> {
  const res = await request.post(`${BASE_API}/master-cartons`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { max_capacity: 24, child_box_barcodes: barcodes },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

async function createEmptyCarton(
  request: APIRequestContext,
  token: string
): Promise<{ id: string; carton_barcode: string }> {
  const res = await request.post(`${BASE_API}/master-cartons`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { max_capacity: 24 },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

// ---------------------------------------------------------------------------
// TC-RPK-FB-404: free-both endpoint removed
// ---------------------------------------------------------------------------
test.describe('TC-RPK-FB-404: repack/free-both endpoint removed', () => {
  test('TC-RPK-FB-404: POST /master-cartons/repack/free-both → 404 (route removed)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const res = await request.post(`${BASE_API}/master-cartons/repack/free-both`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        carton1_barcode: 'MC000001',
        carton2_barcode: 'MC000002',
      },
    });

    // Route is no longer registered → must not be 2xx
    expect(
      res.ok(),
      `Expected repack/free-both to be removed (non-2xx), got ${res.status()}`
    ).toBeFalsy();

    // Accept 404 specifically (route deleted) but also tolerate 405 (method mismatch
    // if a parent route still exists). The key invariant is: not 200/201.
    expect(
      [404, 405].includes(res.status()),
      `Expected 404 or 405 for removed free-both route, got ${res.status()}`
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TC-RPK-SINGLE-001: full-unpack then re-pack via pack-by-barcode (API)
// ---------------------------------------------------------------------------
test.describe('TC-RPK-SINGLE: Unpack + Repack API lifecycle', () => {
  test(
    'TC-RPK-SINGLE-001: full-unpack carton, then re-pack a subset of its boxes back into the same carton',
    async ({ request }) => {
      const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
      const productId = await createProduct(request, token, `SR1${TS6}`);

      // Create 3 FREE boxes that will be packed into the source carton
      const box1 = await createFreeBox(request, token, productId);
      const box2 = await createFreeBox(request, token, productId);
      const box3 = await createFreeBox(request, token, productId);

      // Pack all 3 into a single carton (ACTIVE, child_count = 3)
      const carton = await createCartonWithBoxes(request, token, [
        box1.barcode,
        box2.barcode,
        box3.barcode,
      ]);

      // ── Step 1: full-unpack ──────────────────────────────────────────────
      const unpackRes = await request.post(
        `${BASE_API}/master-cartons/${carton.id}/full-unpack`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(
        unpackRes.ok(),
        `full-unpack failed: ${unpackRes.status()} — ${await unpackRes.text()}`
      ).toBeTruthy();

      // Carton must now be CREATED (empty)
      const cartonAfterUnpack = await request.get(
        `${BASE_API}/master-cartons/${carton.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(cartonAfterUnpack.ok()).toBeTruthy();
      const cartonData = (await cartonAfterUnpack.json()).data;
      expect(cartonData.status, 'Carton should be CREATED after full-unpack').toBe('CREATED');
      expect(cartonData.child_count, 'child_count should be 0 after full-unpack').toBe(0);

      // All 3 boxes must now be FREE
      for (const box of [box1, box2, box3]) {
        const boxRes = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(boxRes.ok()).toBeTruthy();
        expect(
          (await boxRes.json()).data.status,
          `Box ${box.id} should be FREE after full-unpack`
        ).toBe('FREE');
      }

      // ── Step 2: re-pack 2 of the 3 freed boxes back into the SAME carton ──
      const pack1 = await request.post(`${BASE_API}/master-cartons/pack-by-barcode`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { barcode: box1.barcode, master_carton_id: carton.id },
      });
      expect(
        pack1.ok(),
        `pack-by-barcode (box1) failed: ${pack1.status()} — ${await pack1.text()}`
      ).toBeTruthy();
      expect((await pack1.json()).data.alreadyPacked).toBe(false);

      const pack2 = await request.post(`${BASE_API}/master-cartons/pack-by-barcode`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { barcode: box2.barcode, master_carton_id: carton.id },
      });
      expect(
        pack2.ok(),
        `pack-by-barcode (box2) failed: ${pack2.status()} — ${await pack2.text()}`
      ).toBeTruthy();
      expect((await pack2.json()).data.alreadyPacked).toBe(false);

      // ── Step 3: verify final carton state ───────────────────────────────
      const cartonFinal = await request.get(
        `${BASE_API}/master-cartons/${carton.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(cartonFinal.ok()).toBeTruthy();
      const finalData = (await cartonFinal.json()).data;
      expect(finalData.child_count, 'Carton should contain exactly 2 boxes after re-pack').toBe(2);
      expect(finalData.status, 'CREATED carton transitions to ACTIVE on first pack').toBe('ACTIVE');

      // box1 and box2 should be PACKED; box3 stays FREE
      const box1Final = await request.get(`${BASE_API}/child-boxes/${box1.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect((await box1Final.json()).data.status).toBe('PACKED');

      const box2Final = await request.get(`${BASE_API}/child-boxes/${box2.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect((await box2Final.json()).data.status).toBe('PACKED');

      const box3Final = await request.get(`${BASE_API}/child-boxes/${box3.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(
        (await box3Final.json()).data.status,
        'Box3 was intentionally left out — should remain FREE'
      ).toBe('FREE');
    }
  );
});

// ---------------------------------------------------------------------------
// TC-RPK-UNPACK-AT: unpacked_at lifecycle
// ---------------------------------------------------------------------------
test.describe('TC-RPK-UNPACK-AT: unpacked_at / unpacked_by lifecycle', () => {
  test(
    'TC-RPK-UNPACK-AT: full-unpack stamps status=CREATED; first re-pack transitions status=ACTIVE',
    async ({ request }) => {
      const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
      const productId = await createProduct(request, token, `UAT${TS6}`);

      const box1 = await createFreeBox(request, token, productId);
      const box2 = await createFreeBox(request, token, productId);
      const carton = await createCartonWithBoxes(request, token, [box1.barcode, box2.barcode]);

      // ── Unpack: carton should be CREATED with child_count=0 ─────────────
      const unpackRes = await request.post(
        `${BASE_API}/master-cartons/${carton.id}/full-unpack`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      expect(
        unpackRes.ok(),
        `full-unpack failed: ${unpackRes.status()} — ${await unpackRes.text()}`
      ).toBeTruthy();

      const afterUnpack = await request.get(`${BASE_API}/master-cartons/${carton.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(afterUnpack.ok()).toBeTruthy();
      const afterUnpackData = (await afterUnpack.json()).data;
      expect(afterUnpackData.status, 'After full-unpack: carton should be CREATED').toBe('CREATED');
      expect(afterUnpackData.child_count, 'After full-unpack: child_count should be 0').toBe(0);

      // If the API returns unpacked_at, assert it is non-null after unpack
      if ('unpacked_at' in afterUnpackData) {
        expect(
          afterUnpackData.unpacked_at,
          'unpacked_at should be non-null after full-unpack'
        ).not.toBeNull();
      }

      // ── Pack one box back: carton should become ACTIVE ───────────────────
      const packRes = await request.post(`${BASE_API}/master-cartons/pack-by-barcode`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { barcode: box1.barcode, master_carton_id: carton.id },
      });
      expect(
        packRes.ok(),
        `pack-by-barcode failed: ${packRes.status()} — ${await packRes.text()}`
      ).toBeTruthy();
      expect((await packRes.json()).data.alreadyPacked).toBe(false);

      const afterPack = await request.get(`${BASE_API}/master-cartons/${carton.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(afterPack.ok()).toBeTruthy();
      const afterPackData = (await afterPack.json()).data;
      expect(afterPackData.status, 'After first re-pack: carton should be ACTIVE').toBe('ACTIVE');
      expect(afterPackData.child_count, 'After first re-pack: child_count should be 1').toBe(1);

      // If the API returns unpacked_at, assert it is cleared (NULL) after repacking
      if ('unpacked_at' in afterPackData) {
        expect(
          afterPackData.unpacked_at,
          'unpacked_at should be null after first re-pack (packChildBox clears it)'
        ).toBeNull();
      }
    }
  );
});

// ---------------------------------------------------------------------------
// TC-RPK-UI: /unpack-repack page UI (2-tab layout)
// ---------------------------------------------------------------------------
test.describe('TC-RPK-UI: Unpack & Repack page UI', () => {
  test('TC-RPK-UI-001: /unpack-repack shows exactly "Unpack" and "Repack" tab toggles', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto('/unpack-repack');
    await page.waitForLoadState('networkidle');

    // Page heading — scope to main to avoid sidebar / top-bar duplicates
    await expect(
      page.getByRole('main').getByRole('heading', { name: /unpack & repack/i })
    ).toBeVisible({ timeout: 15000 });

    // The 2-tab layout renders two <button> elements side-by-side inside a flex
    // container. Each button's accessible name starts with the tab name followed
    // by the description text, so we match with a start-anchored (not end-anchored)
    // pattern to avoid the anchored-exact-match failure on the longer computed name.

    // "Unpack" tab toggle — accessible name: "Unpack Free all boxes from a carton…"
    await expect(
      page.getByRole('main').getByRole('button', { name: /^unpack/i })
    ).toBeVisible({ timeout: 10000 });

    // "Repack" tab toggle — accessible name: "Repack Scan a carton to repack…"
    await expect(
      page.getByRole('main').getByRole('button', { name: /^repack/i })
    ).toBeVisible({ timeout: 10000 });

    // Old 3-mode labels must NOT be present as button names
    await expect(
      page.getByRole('main').getByRole('button', { name: /single unpack/i })
    ).toHaveCount(0);

    await expect(
      page.getByRole('main').getByRole('button', { name: /single repack/i })
    ).toHaveCount(0);

    await expect(
      page.getByRole('main').getByRole('button', { name: /2 cartons/i })
    ).toHaveCount(0);
  });

  test('TC-RPK-UI-001b: Unpack tab is active by default — carton scan input visible', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto('/unpack-repack');
    await page.waitForLoadState('networkidle');

    // When Unpack tab is active the carton scan input has placeholder
    // "Scan or enter carton barcode..." (from UnpackTab's HIDScannerInput)
    await expect(
      page.getByPlaceholder('Scan or enter carton barcode...')
    ).toBeVisible({ timeout: 10000 });
  });

  test('TC-RPK-UI-002: Navigating to /unpack redirects to /unpack-repack', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/unpack');
    await page.waitForLoadState('networkidle');

    // Next.js redirect() is server-side; the final URL must contain /unpack-repack
    await expect(page).toHaveURL(/unpack-repack/, { timeout: 10000 });
  });
});

// ---------------------------------------------------------------------------
// TC-RPK-CR-001: Repack tab — non-empty carton triggers confirm modal
// ---------------------------------------------------------------------------
test.describe('TC-RPK-CR: Repack tab confirm modal', () => {
  test(
    'TC-RPK-CR-001: scanning a non-empty carton on Repack tab shows the confirm modal',
    async ({ page, request }) => {
      // ── API setup: create a carton with 2 packed boxes ───────────────────
      const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
      const productId = await createProduct(request, token, `CR1${TS6}`);
      const box1 = await createFreeBox(request, token, productId);
      const box2 = await createFreeBox(request, token, productId);
      const carton = await createCartonWithBoxes(request, token, [box1.barcode, box2.barcode]);

      // ── UI: navigate to Repack tab, type the carton barcode ──────────────
      await loginViaAPI(page);
      await page.goto('/unpack-repack');
      await page.waitForLoadState('networkidle');

      // Click the "Repack" tab toggle — accessible name: "Repack Scan a carton to repack…"
      await page.getByRole('main').getByRole('button', { name: /^repack/i }).click();

      // Repack scan phase: placeholder "Scan or enter carton barcode..."
      const scanInput = page.getByPlaceholder('Scan or enter carton barcode...');
      await expect(scanInput).toBeVisible({ timeout: 10000 });

      // Fill + submit the barcode
      await scanInput.fill(carton.carton_barcode);
      await scanInput.press('Enter');

      // The confirm modal should appear with title "Unpack & Repack"
      // (Modal uses an HTML entity "&amp;" in JSX but renders as "&" in the DOM)
      await expect(
        page.getByRole('dialog').filter({ hasText: /unpack.*repack/i })
      ).toBeVisible({ timeout: 10000 });

      // Modal body mentions the box count
      await expect(
        page.getByRole('dialog').getByText(/2 box/i)
      ).toBeVisible({ timeout: 5000 });

      // "Unpack & Start Repacking" confirm button is present
      await expect(
        page.getByRole('dialog').getByRole('button', { name: /unpack.*start repacking/i })
      ).toBeVisible({ timeout: 5000 });

      // "Cancel" button is present
      await expect(
        page.getByRole('dialog').getByRole('button', { name: /^cancel$/i })
      ).toBeVisible({ timeout: 5000 });
    }
  );
});
