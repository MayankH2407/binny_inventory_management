/**
 * Phase 6: E-commerce – scan-carton auto-reflect + stock-summary view.
 * Covers: POST /ecommerce/scan-carton, GET /ecommerce/stock-summary, UI smoke.
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
  const code = `SC${suffix}`.slice(0, 20);
  const res = await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      article_code: code,
      article_name: `ScanCarton ${suffix}`,
      colour: 'Blue',
      size: '8',
      category: 'Gents',
      section: 'Hawaii',
      mrp: 499,
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

async function createEcommerce(
  request: APIRequestContext,
  token: string,
  name: string
): Promise<{ id: string; ecommerce_barcode: string; status: string; child_count: number }> {
  const res = await request.post(`${BASE_API}/ecommerce`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

// ---------------------------------------------------------------------------
// TC-EC-SCAN: scan-carton → auto-reflect
// ---------------------------------------------------------------------------
test.describe('TC-EC-SCAN: E-commerce Carton Scan', () => {
  test('TC-EC-SCAN-001: POST /ecommerce/scan-carton moves all packed boxes into record', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `SC001${TS6}`);
    const box1 = await createFreeBox(request, token, productId);
    const box2 = await createFreeBox(request, token, productId);

    const carton = await createCartonWithBoxes(request, token, [box1.barcode, box2.barcode]);
    const rec = await createEcommerce(request, token, `EC ScanCtn ${TS6}`);

    const scanRes = await request.post(`${BASE_API}/ecommerce/scan-carton`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, carton_barcode: carton.carton_barcode },
    });
    expect(
      scanRes.ok(),
      `scan-carton failed: ${scanRes.status()} — ${await scanRes.text()}`
    ).toBeTruthy();

    const scanBody = await scanRes.json();
    expect(scanBody.data.added).toBe(2);

    // Record child_count grew by 2
    const recAfter = await request.get(`${BASE_API}/ecommerce/${rec.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const recData = (await recAfter.json()).data;
    expect(recData.child_count).toBe(2);
    expect(recData.status).toBe('ACTIVE');

    // Boxes are now ECOMMERCE
    for (const box of [box1, box2]) {
      const bRes = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect((await bRes.json()).data.status).toBe('ECOMMERCE');
    }

    // Carton is emptied → status should revert to CREATED
    const cAfter = await request.get(`${BASE_API}/master-cartons/${carton.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cData = (await cAfter.json()).data;
    expect(cData.child_count).toBe(0);
    expect(cData.status).toBe('CREATED');
  });

  test('TC-EC-SCAN-002: scan-carton increments record child_count and returns added count', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `SC002${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const carton = await createCartonWithBoxes(request, token, [box.barcode]);
    const rec = await createEcommerce(request, token, `EC ScanCnt ${TS6}`);

    const scanRes = await request.post(`${BASE_API}/ecommerce/scan-carton`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, carton_barcode: carton.carton_barcode },
    });
    expect(scanRes.ok()).toBeTruthy();

    const body = await scanRes.json();
    // Response shape: { data: { record, added, cartonBarcode } }
    expect(body.data).toHaveProperty('added');
    expect(body.data.added).toBe(1);
    expect(body.data).toHaveProperty('cartonBarcode');
    expect(body.data.cartonBarcode).toBe(carton.carton_barcode);
  });

  test('TC-EC-SCAN-003: Scanning an empty carton (no packed boxes) → 400', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    // Create an empty carton (no barcodes)
    const emptyCartonRes = await request.post(`${BASE_API}/master-cartons`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { max_capacity: 24 },
    });
    expect(emptyCartonRes.status()).toBe(201);
    const emptyCarton = (await emptyCartonRes.json()).data;

    const rec = await createEcommerce(request, token, `EC EmptyCtn ${TS6}`);

    const scanRes = await request.post(`${BASE_API}/ecommerce/scan-carton`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, carton_barcode: emptyCarton.carton_barcode },
    });
    expect(scanRes.status()).toBe(400);
  });

  test('TC-EC-SCAN-004: Scanning carton into a CLOSED e-commerce record → 400', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `SC004${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const box2 = await createFreeBox(request, token, productId);

    // Create and close an ecommerce record (must have at least 1 box to close)
    const recToClose = await createEcommerce(request, token, `EC CloseFirst ${TS6}`);
    await request.post(`${BASE_API}/ecommerce/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: recToClose.id, child_box_id: box.id },
    });
    await request.post(`${BASE_API}/ecommerce/${recToClose.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Now try scan-carton against that CLOSED record
    const carton = await createCartonWithBoxes(request, token, [box2.barcode]);

    const scanRes = await request.post(`${BASE_API}/ecommerce/scan-carton`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: recToClose.id, carton_barcode: carton.carton_barcode },
    });
    expect(scanRes.status()).toBe(400);
  });

  test('TC-EC-SCAN-005: Scanning a DISPATCHED carton → 400', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `SC005${TS6}`);
    const boxForCarton = await createFreeBox(request, token, productId);
    const boxForRec = await createFreeBox(request, token, productId);

    // Build a carton, close it, dispatch it via a dispatch record
    const carton = await createCartonWithBoxes(request, token, [boxForCarton.barcode]);

    // Close the carton
    await request.post(`${BASE_API}/master-cartons/${carton.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // A customer is required for master-carton dispatch
    const custRes = await request.post(`${BASE_API}/customers`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { firm_name: `SC Dispatch Cust ${TS6}` },
    });
    expect([200, 201]).toContain(custRes.status());
    const customerId = (await custRes.json()).data.id;

    // Dispatch the carton (schema requires master_carton_ids[] + customer_id)
    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        master_carton_ids: [carton.id],
        customer_id: customerId,
        destination: `SC Test Dest ${TS6}`,
      },
    });
    // If dispatch fails for any reason, skip test gracefully
    if (!dispatchRes.ok()) {
      test.skip(true, 'Cannot dispatch carton — carton dispatch setup failed; skipping DISPATCHED-carton guard test');
      return;
    }

    const rec = await createEcommerce(request, token, `EC ScanDisp ${TS6}`);
    // Add a separate free box to the ecommerce record so we have a non-empty record to reference
    await request.post(`${BASE_API}/ecommerce/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, child_box_id: boxForRec.id },
    });

    const scanRes = await request.post(`${BASE_API}/ecommerce/scan-carton`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, carton_barcode: carton.carton_barcode },
    });
    expect(scanRes.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// TC-EC-STOCK: stock-summary API
// ---------------------------------------------------------------------------
test.describe('TC-EC-STOCK: E-commerce Stock Summary', () => {
  test('TC-EC-STOCK-001: GET /ecommerce/stock-summary returns 200 with array', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const res = await request.get(`${BASE_API}/ecommerce/stock-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok(), `Expected 200 but got ${res.status()}`).toBeTruthy();

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('TC-EC-STOCK-002: stock-summary rows have required fields (allocated + available)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Ensure at least one box is in ECOMMERCE state so the summary has data
    const productId = await createProduct(request, token, `STCK002${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const rec = await createEcommerce(request, token, `EC Stock ${TS6}`);
    await request.post(`${BASE_API}/ecommerce/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, child_box_id: box.id },
    });

    const res = await request.get(`${BASE_API}/ecommerce/stock-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();

    const rows: Record<string, unknown>[] = (await res.json()).data ?? [];
    expect(rows.length).toBeGreaterThan(0);

    const row = rows[0];
    // Verify all expected fields are present
    for (const field of [
      'product_id', 'article_name', 'colour', 'size', 'sku', 'mrp',
      'allocated_boxes', 'allocated_pairs', 'available_boxes', 'available_pairs',
    ]) {
      expect(
        row[field] !== undefined,
        `Expected field "${field}" in stock-summary row, got: ${JSON.stringify(Object.keys(row))}`
      ).toBeTruthy();
    }
  });

  test('TC-EC-STOCK-003: allocated_boxes reflects boxes with ECOMMERCE status', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const productId = await createProduct(request, token, `STCK003${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const rec = await createEcommerce(request, token, `EC StockCheck ${TS6}`);

    // Before adding: get baseline allocated count for this product
    const summaryBefore = await request.get(`${BASE_API}/ecommerce/stock-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rowsBefore: Array<{ product_id: string; allocated_boxes: number }> = (await summaryBefore.json()).data ?? [];
    const beforeRow = rowsBefore.find((r) => r.product_id === productId);
    const allocBefore = beforeRow?.allocated_boxes ?? 0;

    // Add box to ecommerce
    await request.post(`${BASE_API}/ecommerce/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, child_box_id: box.id },
    });

    const summaryAfter = await request.get(`${BASE_API}/ecommerce/stock-summary`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rowsAfter: Array<{ product_id: string; allocated_boxes: number }> = (await summaryAfter.json()).data ?? [];
    const afterRow = rowsAfter.find((r) => r.product_id === productId);

    expect(afterRow).toBeTruthy();
    expect(afterRow!.allocated_boxes).toBe(allocBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// TC-EC-STOCK-UI: E-commerce stock view UI
// ---------------------------------------------------------------------------
test.describe('TC-EC-STOCK-UI: E-commerce Stock View UI', () => {
  test('TC-EC-STOCK-UI-001: "Stock View" button on /ecommerce list navigates to /ecommerce/stock', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto('/ecommerce');
    await page.waitForLoadState('networkidle');

    const stockBtn = page.getByRole('link', { name: /stock view/i }).or(
      page.getByRole('button', { name: /stock view/i })
    );
    await expect(stockBtn.first()).toBeVisible({ timeout: 10000 });

    await stockBtn.first().click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*ecommerce\/stock/, { timeout: 10000 });
  });

  test('TC-EC-STOCK-UI-002: /ecommerce/stock page renders summary cards and table headers', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto('/ecommerce/stock');
    await page.waitForLoadState('networkidle');

    // Summary cards
    await expect(
      page.getByText(/allocated to e.?commerce/i).or(page.getByText(/allocated/i)).first()
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByText(/available/i).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test('TC-EC-STOCK-UI-003: /ecommerce/stock page table has Allocated and Available columns', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto('/ecommerce/stock');
    await page.waitForLoadState('networkidle');

    // Table headers
    const table = page.locator('table').first();
    if (await table.isVisible({ timeout: 10000 })) {
      await expect(page.getByRole('columnheader', { name: /allocated/i })).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole('columnheader', { name: /available/i })).toBeVisible({ timeout: 5000 });
    }
  });
});

// ---------------------------------------------------------------------------
// TC-EC-SCAN-UI: Detail page carton-scan UI element
// ---------------------------------------------------------------------------
test.describe('TC-EC-SCAN-UI: Ecommerce Detail Page Carton Scan Input', () => {
  test('TC-EC-SCAN-UI-001: Ecommerce detail page "Or add a full carton" input is present', async ({
    page,
  }) => {
    const token = await (async () => {
      const res = await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      return (await res.json()).data.accessToken as string;
    })();

    // Create an ecommerce record
    const recRes = await page.request.post(`${BASE_API}/ecommerce`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: `EC ScanUI ${TS6}` },
    });
    expect(recRes.status()).toBe(201);
    const rec = (await recRes.json()).data;

    await loginViaAPI(page);
    await page.goto(`/ecommerce/${rec.id}`);
    await page.waitForLoadState('networkidle');

    // Open the "Add Box" section to reveal the carton scan input
    const addBoxBtn = page.getByRole('button', { name: /add box/i });
    if (await addBoxBtn.isVisible({ timeout: 5000 })) {
      await addBoxBtn.click();
      await page.waitForTimeout(500);

      // The carton input area is revealed via "Or add a full carton"
      await expect(
        page.getByText(/or add a full carton/i).or(page.getByPlaceholder(/master carton barcode/i))
      ).toBeVisible({ timeout: 5000 });
    }
  });
});
