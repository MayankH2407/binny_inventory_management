/**
 * Phase 6: Master-carton pack-by-barcode — idempotent re-scan + conflict guard.
 * Covers: POST /master-cartons/pack-by-barcode (fresh pack), alreadyPacked:true on re-scan,
 *         conflict error when box is packed in a different carton.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD, loginViaAPI, getAuthToken } from './helpers';

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
  const code = `PBB${suffix}`.slice(0, 20);
  const res = await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      article_code: code,
      article_name: `PackByBarcode ${suffix}`,
      colour: 'Red',
      size: '9',
      category: 'Gents',
      section: 'Hawaii',
      mrp: 449,
    },
  });
  if ([200, 201].includes(res.status())) return (await res.json()).data?.id ?? '';
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
// TC-PBB: pack-by-barcode
// ---------------------------------------------------------------------------
test.describe('TC-PBB: Master Carton pack-by-barcode', () => {
  test('TC-PBB-001: Fresh scan packs the box into the carton (alreadyPacked:false)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const carton = await createEmptyCarton(request, token);

    const packRes = await request.post(`${BASE_API}/master-cartons/pack-by-barcode`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { barcode: box.barcode, master_carton_id: carton.id },
    });
    expect(
      packRes.ok(),
      `pack-by-barcode failed: ${packRes.status()} — ${await packRes.text()}`
    ).toBeTruthy();

    const body = await packRes.json();
    expect(body.data).toHaveProperty('alreadyPacked');
    expect(body.data.alreadyPacked).toBe(false);
    expect(body.data).toHaveProperty('childBoxBarcode');
    expect(body.data.childBoxBarcode).toBe(box.barcode.toUpperCase());

    // Box should now be PACKED
    const boxAfter = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await boxAfter.json()).data.status).toBe('PACKED');

    // Carton child_count should be 1
    const cartonAfter = await request.get(`${BASE_API}/master-cartons/${carton.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await cartonAfter.json()).data.child_count).toBe(1);
  });

  test('TC-PBB-002: Re-scanning the SAME box into the SAME carton returns alreadyPacked:true (idempotent)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `002${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const carton = await createEmptyCarton(request, token);

    // First scan
    const first = await request.post(`${BASE_API}/master-cartons/pack-by-barcode`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { barcode: box.barcode, master_carton_id: carton.id },
    });
    expect(first.ok()).toBeTruthy();

    // Second scan (re-scan same box, same carton)
    const second = await request.post(`${BASE_API}/master-cartons/pack-by-barcode`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { barcode: box.barcode, master_carton_id: carton.id },
    });
    expect(
      second.ok(),
      `Re-scan should succeed (200), got ${second.status()} — ${await second.text()}`
    ).toBeTruthy();

    const body = await second.json();
    expect(body.data.alreadyPacked).toBe(true);

    // carton child_count must still be 1 (no double-count)
    const cartonAfter = await request.get(`${BASE_API}/master-cartons/${carton.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await cartonAfter.json()).data.child_count).toBe(1);
  });

  test('TC-PBB-003: Scanning a box already packed in a DIFFERENT carton → 400 conflict', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `003${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const carton1 = await createEmptyCarton(request, token);
    const carton2 = await createEmptyCarton(request, token);

    // Pack into carton1
    await request.post(`${BASE_API}/master-cartons/pack-by-barcode`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { barcode: box.barcode, master_carton_id: carton1.id },
    });

    // Try to pack into carton2 (conflict)
    const conflictRes = await request.post(`${BASE_API}/master-cartons/pack-by-barcode`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { barcode: box.barcode, master_carton_id: carton2.id },
    });
    expect(conflictRes.status()).toBe(400);

    const body = await conflictRes.json();
    const msg: string = body.message ?? body.error ?? '';
    expect(
      msg.toLowerCase().includes('another carton') || msg.toLowerCase().includes('already packed'),
      `Expected conflict message, got: ${msg}`
    ).toBeTruthy();
  });

  test('TC-PBB-004: Scanning a non-existent barcode → 404', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const carton = await createEmptyCarton(request, token);

    const res = await request.post(`${BASE_API}/master-cartons/pack-by-barcode`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { barcode: 'NOTEXIST99999', master_carton_id: carton.id },
    });
    expect(res.status()).toBe(404);
  });

  test('TC-PBB-005: Response includes childBoxBarcode (uppercased) on successful pack', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `005${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const carton = await createEmptyCarton(request, token);

    const packRes = await request.post(`${BASE_API}/master-cartons/pack-by-barcode`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { barcode: box.barcode.toLowerCase(), master_carton_id: carton.id },
    });
    expect(packRes.ok()).toBeTruthy();

    const body = await packRes.json();
    // barcode input is lowercased; service normalises to upper
    expect(body.data.childBoxBarcode).toBe(box.barcode.toUpperCase());
  });
});

// ---------------------------------------------------------------------------
// TC-PBB-UI: UI smoke - carton create page barcode input still works
// ---------------------------------------------------------------------------
test.describe('TC-PBB-UI: Master Carton create page barcode input', () => {
  test('TC-PBB-UI-001: Create master carton page has a manual barcode entry input', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto('/master-cartons/create');
    await page.waitForLoadState('networkidle');

    // The page should have a barcode input (used for pack-by-barcode)
    const barcodeInput = page.getByPlaceholder(/barcode/i).first();
    await expect(barcodeInput).toBeVisible({ timeout: 10000 });
  });
});
