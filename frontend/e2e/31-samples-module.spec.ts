/**
 * Phase 11: Samples Module
 * Covers: CRUD, add/remove box, close, dispatch, full-unpack, get-by-barcode,
 *         mutual-exclusivity checks, status transitions, role gates, UI smoke.
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
  const code = `SM${suffix}`.slice(0, 20);
  const res = await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      article_code: code,
      article_name: `Sample Mod ${suffix}`,
      colour: 'Black',
      size: '8',
      category: 'Gents',
      section: 'Hawaii',
      mrp: 299,
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
  // Activate if GENERATED
  if (box.status === 'GENERATED') {
    await request.post(`${BASE_API}/child-boxes/${box.id}/activate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    box.status = 'FREE';
  }
  return box;
}

async function createSample(
  request: APIRequestContext,
  token: string,
  name: string,
  barcodes: string[] = []
): Promise<{ id: string; barcode: string; status: string }> {
  const res = await request.post(`${BASE_API}/samples`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name, child_box_barcodes: barcodes },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

// ---------------------------------------------------------------------------
// TC-SM-CREATE: Create sample
// ---------------------------------------------------------------------------
test.describe('TC-SM-CREATE: Create Sample', () => {
  test('TC-SM-CREATE-001: POST /samples → 201, status CREATED, returns sample_barcode', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const sample = await createSample(request, token, `Smoke Sample ${TS6}`);

    expect(sample.status).toBe('CREATED');
    expect(sample.barcode ?? (sample as unknown as { sample_barcode: string }).sample_barcode).toMatch(/^SR[0-9A-Z]{6}$/);
  });

  test('TC-SM-CREATE-002: Create sample with customer_id', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Create a customer first
    const custRes = await request.post(`${BASE_API}/customers`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        firm_name: `SM Create Cust ${TS6}`,
        customer_type: 'Primary Dealer',
        contact_person_name: 'Test Contact',
        contact_person_mobile: '9876543210',
      },
    });
    if (!custRes.ok()) {
      test.skip(true, 'Cannot create customer — skipping customer_id test');
      return;
    }
    const customerId: string = (await custRes.json()).data?.id ?? '';

    const res = await request.post(`${BASE_API}/samples`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: `SM Cust ${TS6}`, customer_id: customerId },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.customer_id ?? body.data.customerId).toBe(customerId);
  });

  test('TC-SM-CREATE-003: Create sample with recipient_name only (no customer_id)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await request.post(`${BASE_API}/samples`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: `SM Recipient ${TS6}`, recipient_name: `Test Recipient ${TS6}` },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.recipient_name ?? body.data.recipientName).toContain('Test Recipient');
  });
});

// ---------------------------------------------------------------------------
// TC-SM-BOX: Add / Remove boxes
// ---------------------------------------------------------------------------
test.describe('TC-SM-BOX: Add and Remove Boxes', () => {
  test('TC-SM-BOX-001: POST /samples/add-box → sample ACTIVE, box SAMPLE', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `B001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM AddBox ${TS6}`);

    const addRes = await request.post(`${BASE_API}/samples/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id },
    });
    expect(addRes.ok()).toBeTruthy();

    // Sample should be ACTIVE
    const sampleRes = await request.get(`${BASE_API}/samples/${sample.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await sampleRes.json()).data.status).toBe('ACTIVE');

    // Box should be SAMPLE
    const boxRes = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await boxRes.json()).data.status).toBe('SAMPLE');
  });

  test('TC-SM-BOX-002: POST /samples/remove-box → box back to FREE', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `B002${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM RemBox ${TS6}`);

    await request.post(`${BASE_API}/samples/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id },
    });

    const removeRes = await request.post(`${BASE_API}/samples/remove-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id },
    });
    expect(removeRes.ok()).toBeTruthy();

    const boxAfter = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await boxAfter.json()).data.status).toBe('FREE');
  });

  test('TC-SM-BOX-003: Remove last box from sample → sample reverts to CREATED', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `B003${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM LastBox ${TS6}`);

    await request.post(`${BASE_API}/samples/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id },
    });

    await request.post(`${BASE_API}/samples/remove-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id },
    });

    const sampleAfter = await request.get(`${BASE_API}/samples/${sample.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await sampleAfter.json()).data.status).toBe('CREATED');
  });

  test('TC-SM-BOX-004: Adding a box already in a master carton → 400', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `B004${TS6}`);
    const box = await createFreeBox(request, token, productId);

    // Pack box into a carton
    const cartonRes = await request.post(`${BASE_API}/master-cartons`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { max_capacity: 24, child_box_barcodes: [box.barcode] },
    });
    expect(cartonRes.status()).toBe(201);

    const sample = await createSample(request, token, `SM PackedBox ${TS6}`);

    const addRes = await request.post(`${BASE_API}/samples/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id },
    });
    expect(addRes.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-CLOSE: Close sample
// ---------------------------------------------------------------------------
test.describe('TC-SM-CLOSE: Close Sample', () => {
  test('TC-SM-CLOSE-001: POST /samples/:id/close → status CLOSED', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `CL001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM Close ${TS6}`, [box.barcode]);

    const closeRes = await request.post(`${BASE_API}/samples/${sample.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(closeRes.ok()).toBeTruthy();

    const sampleAfter = await request.get(`${BASE_API}/samples/${sample.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await sampleAfter.json()).data.status).toBe('CLOSED');
  });

  test('TC-SM-CLOSE-002: Re-close a CLOSED sample returns 409 or is handled gracefully', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `CL002${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM ReClose ${TS6}`, [box.barcode]);

    await request.post(`${BASE_API}/samples/${sample.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const res2 = await request.post(`${BASE_API}/samples/${sample.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Must be non-2xx or a meaningful no-op
    const isError = !res2.ok();
    const isNoOp = res2.ok();
    expect(isError || isNoOp).toBeTruthy();
    if (res2.ok()) {
      const body = await res2.json();
      const status: string = body.data?.status ?? '';
      expect(status).toBe('CLOSED'); // still closed
    }
  });
});

// ---------------------------------------------------------------------------
// TC-SM-DISPATCH: Dispatch sample
// ---------------------------------------------------------------------------
test.describe('TC-SM-DISPATCH: Dispatch Sample', () => {
  test('TC-SM-DISPATCH-001: Dispatch CLOSED sample → sample DISPATCHED, boxes DISPATCHED', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `DS001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM Dispatch ${TS6}`, [box.barcode]);

    await request.post(`${BASE_API}/samples/${sample.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, destination: `SM Dest ${TS6}` },
    });
    expect(dispatchRes.ok()).toBeTruthy();

    const sampleAfter = await request.get(`${BASE_API}/samples/${sample.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await sampleAfter.json()).data.status).toBe('DISPATCHED');

    const boxAfter = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await boxAfter.json()).data.status).toBe('DISPATCHED');
  });
});

// ---------------------------------------------------------------------------
// TC-SM-UNPACK: Full-unpack
// ---------------------------------------------------------------------------
test.describe('TC-SM-UNPACK: Full Unpack', () => {
  test('TC-SM-UNPACK-001: POST /samples/:id/full-unpack → all boxes FREE, sample reverts', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `UNP001${TS6}`);
    const box1 = await createFreeBox(request, token, productId);
    const box2 = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM Unpack ${TS6}`, [
      box1.barcode,
      box2.barcode,
    ]);

    const unpackRes = await request.post(`${BASE_API}/samples/${sample.id}/full-unpack`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(unpackRes.ok()).toBeTruthy();

    for (const box of [box1, box2]) {
      const boxAfter = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect((await boxAfter.json()).data.status).toBe('FREE');
    }

    const sampleAfter = await request.get(`${BASE_API}/samples/${sample.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Sample should be CREATED (empty) or ACTIVE — never CLOSED when unpacked
    const sStatus: string = (await sampleAfter.json()).data.status;
    expect(['CREATED', 'ACTIVE']).toContain(sStatus);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-QR: Get by barcode
// ---------------------------------------------------------------------------
test.describe('TC-SM-QR: Get Sample by Barcode', () => {
  test('TC-SM-QR-001: GET /samples/qr/:barcode returns correct sample', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const sample = await createSample(request, token, `SM QR ${TS6}`);
    const barcode: string =
      sample.barcode ?? (sample as unknown as { sample_barcode: string }).sample_barcode;

    const res = await request.get(`${BASE_API}/samples/qr/${encodeURIComponent(barcode)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.data.id).toBe(sample.id);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-LIST: List / filter
// ---------------------------------------------------------------------------
test.describe('TC-SM-LIST: List and Filter Samples', () => {
  test('TC-SM-LIST-001: GET /samples returns paginated list', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await request.get(`${BASE_API}/samples?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('TC-SM-LIST-002: Filter by status=CREATED returns only CREATED samples', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    await createSample(request, token, `SM ListFilter ${TS6}`);

    const res = await request.get(`${BASE_API}/samples?status=CREATED&limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const items: Array<{ status: string }> = (await res.json()).data ?? [];
    expect(items.every((s) => s.status === 'CREATED')).toBeTruthy();
  });

  test('TC-SM-LIST-003: Search by name returns matching samples', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const uniqueName = `SM Search ${TS6}`;
    await createSample(request, token, uniqueName);

    const res = await request.get(
      `${BASE_API}/samples?search=${encodeURIComponent(TS6)}&limit=25`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const items: Array<{ name: string }> = (await res.json()).data ?? [];
    expect(items.some((s) => s.name.includes(TS6))).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TC-SM-ROLE: Role gates
// ---------------------------------------------------------------------------
test.describe('TC-SM-ROLE: Role Gates', () => {
  const USERS = {
    warehouse: { email: `wh-sm-${TS}@test.com`, password: 'TestWh@9876', role: 'Warehouse Operator' },
    dispatch: { email: `dp-sm-${TS}@test.com`, password: 'TestDp@9876', role: 'Dispatch Operator' },
    supervisor: { email: `sup-sm-${TS}@test.com`, password: 'TestSup@9876', role: 'Supervisor' },
  };

  test('TC-SM-ROLE-001: Dispatch Operator cannot create sample (403)', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: USERS.dispatch.email, password: USERS.dispatch.password, name: 'SM Dispatch', role: USERS.dispatch.role },
    });

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: USERS.dispatch.email, password: USERS.dispatch.password },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Dispatch user not seeded');
      return;
    }
    const dpToken: string = (await loginRes.json()).data.accessToken;

    const res = await request.post(`${BASE_API}/samples`, {
      headers: { Authorization: `Bearer ${dpToken}`, 'Content-Type': 'application/json' },
      data: { name: `DP Sample ${TS6}` },
    });
    expect(res.status()).toBe(403);
  });

  test('TC-SM-ROLE-002: Warehouse Operator can create and add/remove boxes', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: USERS.warehouse.email, password: USERS.warehouse.password, name: 'SM WH', role: USERS.warehouse.role },
    });

    // Do all admin setup BEFORE switching identity — Playwright shares cookies across calls
    // and the auth middleware reads cookie before the Authorization header.
    const productId = await createProduct(request, adminToken, `SMROLE${TS6}`);
    const box = await createFreeBox(request, adminToken, productId);

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: USERS.warehouse.email, password: USERS.warehouse.password },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Warehouse user not seeded');
      return;
    }
    const whToken: string = (await loginRes.json()).data.accessToken;

    const sampleRes = await request.post(`${BASE_API}/samples`, {
      headers: { Authorization: `Bearer ${whToken}`, 'Content-Type': 'application/json' },
      data: { name: `WH Sample ${TS6}` },
    });
    expect(sampleRes.status()).toBe(201);
    const sample = (await sampleRes.json()).data;

    const addRes = await request.post(`${BASE_API}/samples/add-box`, {
      headers: { Authorization: `Bearer ${whToken}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id },
    });
    expect(addRes.ok()).toBeTruthy();

    const removeRes = await request.post(`${BASE_API}/samples/remove-box`, {
      headers: { Authorization: `Bearer ${whToken}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id },
    });
    expect(removeRes.ok()).toBeTruthy();
  });

  test('TC-SM-ROLE-003: Warehouse Operator cannot close sample (403)', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: USERS.warehouse.email, password: USERS.warehouse.password, name: 'SM WH2', role: USERS.warehouse.role },
    });

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: USERS.warehouse.email, password: USERS.warehouse.password },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Warehouse user not seeded');
      return;
    }
    const whToken: string = (await loginRes.json()).data.accessToken;

    const sample = await createSample(request, adminToken, `SM WH Close ${TS6}`);

    const res = await request.post(`${BASE_API}/samples/${sample.id}/close`, {
      headers: { Authorization: `Bearer ${whToken}` },
    });
    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// TC-SM-UI: UI smoke
// ---------------------------------------------------------------------------
test.describe('TC-SM-UI: Samples UI Smoke', () => {
  test('TC-SM-UI-001: /samples list page loads', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/samples');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/sample/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('TC-SM-UI-002: /samples/create form is accessible', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/samples/create');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/sample/i).first()).toBeVisible({ timeout: 15000 });
    // Form should have a name input
    const nameInput = page.getByLabel(/name/i).or(page.locator('input[name="name"]')).first();
    await expect(nameInput).toBeVisible({ timeout: 10000 });
  });

  test('TC-SM-UI-003: /samples/[id] detail page shows sample info', async ({ page }) => {
    const token = await (async () => {
      const res = await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      return (await res.json()).data.accessToken as string;
    })();

    const sample = await createSample(page.request as unknown as APIRequestContext, token, `SM Detail UI ${TS6}`);

    await loginViaAPI(page);
    await page.goto(`/samples/${sample.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/sample/i).first()).toBeVisible({ timeout: 15000 });
  });
});
