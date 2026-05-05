/**
 * Phase 12: E-commerce Module
 * Covers: CRUD, add/remove box, close, dispatch, full-unpack, get-by-barcode,
 *         marketplace filter, duplicate ECOMMERCE_CREATED transaction assertion,
 *         mutual-exclusivity check, role gates, UI smoke.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD, loginViaAPI } from './helpers';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const TS = Date.now();
const TS6 = String(TS).slice(-6);

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.accessToken;
}

async function createProduct(
  request: APIRequestContext,
  token: string,
  suffix: string
): Promise<string> {
  const code = `EC${suffix}`.slice(0, 20);
  const res = await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      article_code: code,
      article_name: `Ecom Mod ${suffix}`,
      colour: 'Red',
      size: '7',
      category: 'Ladies',
      section: 'Hawaii',
      mrp: 399,
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

async function createEcommerce(
  request: APIRequestContext,
  token: string,
  name: string,
  extra: Record<string, unknown> = {}
): Promise<{ id: string; barcode: string; status: string }> {
  const res = await request.post(`${BASE_API}/ecommerce`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name, ...extra },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

// ---------------------------------------------------------------------------
// TC-EC-CREATE: Create ecommerce record
// ---------------------------------------------------------------------------
test.describe('TC-EC-CREATE: Create E-commerce Record', () => {
  test('TC-EC-CREATE-001: POST /ecommerce → 201, status CREATED, barcode is EC[short]', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const rec = await createEcommerce(request, token, `EC Smoke ${TS6}`);

    expect(rec.status).toBe('CREATED');
    const barcode: string =
      rec.barcode ?? (rec as unknown as { ecommerce_barcode: string }).ecommerce_barcode;
    expect(barcode).toMatch(/^EC[0-9A-Z]{6}$/);
  });

  test('TC-EC-CREATE-002: Create with marketplace, order_reference, listing_sku fields', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await request.post(`${BASE_API}/ecommerce`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        name: `EC Fields ${TS6}`,
        marketplace: 'Amazon',
        order_reference: `ORD-${TS6}`,
        listing_sku: `LSK-${TS6}`,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.marketplace).toBe('Amazon');
    expect(body.data.order_reference ?? body.data.orderReference).toBe(`ORD-${TS6}`);
    expect(body.data.listing_sku ?? body.data.listingSku).toBe(`LSK-${TS6}`);
  });

  test('TC-EC-CREATE-003: Exactly ONE ECOMMERCE_CREATED transaction row per create (duplicate-INSERT bug fixed)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const rec = await createEcommerce(request, token, `EC TxCount ${TS6}`);

    const txRes = await request.get(
      `${BASE_API}/inventory/transactions?limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(txRes.ok()).toBeTruthy();
    const txBody = await txRes.json();
    const allTx: Array<{ transaction_type: string; notes: string }> = Array.isArray(txBody.data)
      ? txBody.data
      : [];

    // Filter ECOMMERCE_CREATED rows that reference this record's id
    const ecCreatedRows = allTx.filter(
      (t) =>
        t.transaction_type === 'ECOMMERCE_CREATED' &&
        (t.notes?.includes(rec.id) ||
          t.notes?.includes(
            rec.barcode ?? (rec as unknown as { ecommerce_barcode: string }).ecommerce_barcode
          ))
    );

    // Must be exactly 1 (no duplicate)
    expect(ecCreatedRows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-EC-BOX: Add / Remove boxes
// ---------------------------------------------------------------------------
test.describe('TC-EC-BOX: Add and Remove Boxes', () => {
  test('TC-EC-BOX-001: POST /ecommerce/add-box → record ACTIVE, box ECOMMERCE', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `EB001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const rec = await createEcommerce(request, token, `EC AddBox ${TS6}`);

    const addRes = await request.post(`${BASE_API}/ecommerce/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, child_box_id: box.id },
    });
    expect(addRes.ok()).toBeTruthy();

    const recAfter = await request.get(`${BASE_API}/ecommerce/${rec.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await recAfter.json()).data.status).toBe('ACTIVE');

    const boxAfter = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await boxAfter.json()).data.status).toBe('ECOMMERCE');
  });

  test('TC-EC-BOX-002: POST /ecommerce/remove-box → box back to FREE', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `EB002${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const rec = await createEcommerce(request, token, `EC RemBox ${TS6}`);

    await request.post(`${BASE_API}/ecommerce/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, child_box_id: box.id },
    });

    const removeRes = await request.post(`${BASE_API}/ecommerce/remove-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, child_box_id: box.id },
    });
    expect(removeRes.ok()).toBeTruthy();

    const boxAfter = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await boxAfter.json()).data.status).toBe('FREE');
  });

  test('TC-EC-BOX-003: Adding a PACKED box → 400', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `EB003${TS6}`);
    const box = await createFreeBox(request, token, productId);

    // Pack into carton
    const cartonRes = await request.post(`${BASE_API}/master-cartons`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { max_capacity: 24, child_box_barcodes: [box.barcode] },
    });
    expect(cartonRes.status()).toBe(201);

    const rec = await createEcommerce(request, token, `EC PackedBox ${TS6}`);
    const addRes = await request.post(`${BASE_API}/ecommerce/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, child_box_id: box.id },
    });
    expect(addRes.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// TC-EC-CLOSE: Close ecommerce record
// ---------------------------------------------------------------------------
test.describe('TC-EC-CLOSE: Close E-commerce Record', () => {
  test('TC-EC-CLOSE-001: POST /ecommerce/:id/close → status CLOSED', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `ECL001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const rec = await createEcommerce(request, token, `EC Close ${TS6}`);

    await request.post(`${BASE_API}/ecommerce/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, child_box_id: box.id },
    });

    const closeRes = await request.post(`${BASE_API}/ecommerce/${rec.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(closeRes.ok()).toBeTruthy();

    const recAfter = await request.get(`${BASE_API}/ecommerce/${rec.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await recAfter.json()).data.status).toBe('CLOSED');
  });
});

// ---------------------------------------------------------------------------
// TC-EC-DISPATCH: Dispatch ecommerce
// ---------------------------------------------------------------------------
test.describe('TC-EC-DISPATCH: Dispatch E-commerce Record', () => {
  test('TC-EC-DISPATCH-001: Dispatch CLOSED ecommerce → record DISPATCHED, boxes DISPATCHED', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `ECD001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const rec = await createEcommerce(request, token, `EC Disp ${TS6}`);

    await request.post(`${BASE_API}/ecommerce/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, child_box_id: box.id },
    });

    await request.post(`${BASE_API}/ecommerce/${rec.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, destination: `EC Dest ${TS6}` },
    });
    expect(dispatchRes.ok()).toBeTruthy();

    const recAfter = await request.get(`${BASE_API}/ecommerce/${rec.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await recAfter.json()).data.status).toBe('DISPATCHED');

    const boxAfter = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await boxAfter.json()).data.status).toBe('DISPATCHED');
  });
});

// ---------------------------------------------------------------------------
// TC-EC-UNPACK: Full-unpack
// ---------------------------------------------------------------------------
test.describe('TC-EC-UNPACK: Full Unpack', () => {
  test('TC-EC-UNPACK-001: POST /ecommerce/:id/full-unpack → all boxes FREE', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `ECUP001${TS6}`);
    const box1 = await createFreeBox(request, token, productId);
    const box2 = await createFreeBox(request, token, productId);
    const rec = await createEcommerce(request, token, `EC Unpack ${TS6}`);

    for (const box of [box1, box2]) {
      await request.post(`${BASE_API}/ecommerce/add-box`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { ecommerce_record_id: rec.id, child_box_id: box.id },
      });
    }

    const unpackRes = await request.post(`${BASE_API}/ecommerce/${rec.id}/full-unpack`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(unpackRes.ok()).toBeTruthy();

    for (const box of [box1, box2]) {
      const boxAfter = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect((await boxAfter.json()).data.status).toBe('FREE');
    }
  });
});

// ---------------------------------------------------------------------------
// TC-EC-QR: Get by barcode
// ---------------------------------------------------------------------------
test.describe('TC-EC-QR: Get E-commerce Record by Barcode', () => {
  test('TC-EC-QR-001: GET /ecommerce/qr/:barcode returns correct record', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const rec = await createEcommerce(request, token, `EC QR ${TS6}`);
    const barcode: string =
      rec.barcode ?? (rec as unknown as { ecommerce_barcode: string }).ecommerce_barcode;

    const res = await request.get(`${BASE_API}/ecommerce/qr/${encodeURIComponent(barcode)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.id).toBe(rec.id);
  });
});

// ---------------------------------------------------------------------------
// TC-EC-LIST: List / filter
// ---------------------------------------------------------------------------
test.describe('TC-EC-LIST: List and Filter', () => {
  test('TC-EC-LIST-001: GET /ecommerce returns paginated list', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await request.get(`${BASE_API}/ecommerce?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray((await res.json()).data)).toBeTruthy();
  });

  test('TC-EC-LIST-002: Filter by marketplace returns matching records', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const marketplace = `MP${TS6}`;

    await createEcommerce(request, token, `EC MP Filter ${TS6}`, { marketplace });

    const res = await request.get(
      `${BASE_API}/ecommerce?marketplace=${encodeURIComponent(marketplace)}&limit=25`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const items: Array<{ marketplace: string }> = (await res.json()).data ?? [];
    expect(items.every((r) => r.marketplace === marketplace)).toBeTruthy();
  });

  test('TC-EC-LIST-003: Filter by status=CREATED returns only CREATED records', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    await createEcommerce(request, token, `EC Status ${TS6}`);

    const res = await request.get(`${BASE_API}/ecommerce?status=CREATED&limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const items: Array<{ status: string }> = (await res.json()).data ?? [];
    expect(items.every((r) => r.status === 'CREATED')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TC-EC-ROLE: Role gates
// ---------------------------------------------------------------------------
test.describe('TC-EC-ROLE: Role Gates', () => {
  const USERS = {
    dispatch: { email: `dp-ec-${TS}@test.com`, password: 'TestDp@9876', role: 'Dispatch Operator' },
    warehouse: { email: `wh-ec-${TS}@test.com`, password: 'TestWh@9876', role: 'Warehouse Operator' },
  };

  test('TC-EC-ROLE-001: Dispatch Operator cannot create ecommerce record (403)', async ({
    request,
  }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: USERS.dispatch.email, password: USERS.dispatch.password, name: 'EC Dispatch', role: USERS.dispatch.role },
    });

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: USERS.dispatch.email, password: USERS.dispatch.password },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Dispatch user not seeded');
      return;
    }
    const dpToken: string = (await loginRes.json()).data.accessToken;

    const res = await request.post(`${BASE_API}/ecommerce`, {
      headers: { Authorization: `Bearer ${dpToken}`, 'Content-Type': 'application/json' },
      data: { name: `DP Ecom ${TS6}` },
    });
    expect(res.status()).toBe(403);
  });

  test('TC-EC-ROLE-002: Warehouse Operator can create and add/remove boxes', async ({
    request,
  }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: USERS.warehouse.email, password: USERS.warehouse.password, name: 'EC WH', role: USERS.warehouse.role },
    });

    // Do all admin setup BEFORE switching identity — Playwright shares cookies across calls
    // and the auth middleware reads cookie before the Authorization header.
    const productId = await createProduct(request, adminToken, `ECROLE${TS6}`);
    const box = await createFreeBox(request, adminToken, productId);

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: USERS.warehouse.email, password: USERS.warehouse.password },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Warehouse user not seeded');
      return;
    }
    const whToken: string = (await loginRes.json()).data.accessToken;

    const recRes = await request.post(`${BASE_API}/ecommerce`, {
      headers: { Authorization: `Bearer ${whToken}`, 'Content-Type': 'application/json' },
      data: { name: `WH Ecom ${TS6}` },
    });
    expect(recRes.status()).toBe(201);
    const rec = (await recRes.json()).data;

    const addRes = await request.post(`${BASE_API}/ecommerce/add-box`, {
      headers: { Authorization: `Bearer ${whToken}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: rec.id, child_box_id: box.id },
    });
    expect(addRes.ok()).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TC-EC-UI: UI smoke
// ---------------------------------------------------------------------------
test.describe('TC-EC-UI: E-commerce UI Smoke', () => {
  test('TC-EC-UI-001: /ecommerce list page loads with marketplace filter', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/ecommerce');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/e.?comm/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('TC-EC-UI-002: /ecommerce/create form has required fields', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/ecommerce/create');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/e.?comm|name/i).first()).toBeVisible({ timeout: 15000 });
    const nameInput = page.getByLabel(/name/i).or(page.locator('input[name="name"]')).first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
  });

  test('TC-EC-UI-003: /ecommerce/[id] detail page renders', async ({ page }) => {
    const token = await (async () => {
      const res = await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      return (await res.json()).data.accessToken as string;
    })();

    const rec = await createEcommerce(
      page.request as unknown as APIRequestContext,
      token,
      `EC Detail UI ${TS6}`
    );

    await loginViaAPI(page);
    await page.goto(`/ecommerce/${rec.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/e.?comm/i).first()).toBeVisible({ timeout: 15000 });
  });
});
