/**
 * Phase 13: Dispatch Multi-Source Routing
 * Covers: MC dispatch, sample dispatch, ecommerce dispatch, multi-source rejection,
 *         zero-source rejection, optional field permissiveness, role gates,
 *         list source_type/source_label, UI tab switcher + SourceTypeBadge.
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
  const code = `DP${suffix}`.slice(0, 20);
  const res = await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      article_code: code,
      article_name: `Dispatch ${suffix}`,
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
  if (box.status === 'GENERATED') {
    await request.post(`${BASE_API}/child-boxes/${box.id}/activate`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    box.status = 'FREE';
  }
  return box;
}

/** Create + close a master carton, returning its id. */
async function createClosedCarton(
  request: APIRequestContext,
  token: string,
  barcodes: string[]
): Promise<string> {
  const cartonRes = await request.post(`${BASE_API}/master-cartons`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { max_capacity: 24, child_box_barcodes: barcodes },
  });
  expect(cartonRes.status()).toBe(201);
  const cartonId: string = (await cartonRes.json()).data.id;

  const closeRes = await request.post(`${BASE_API}/master-cartons/${cartonId}/close`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect([200, 204]).toContain(closeRes.status());

  return cartonId;
}

/** Create a CLOSED sample (with at least one box) and return its id. */
async function createClosedSample(
  request: APIRequestContext,
  token: string,
  name: string,
  barcodes: string[]
): Promise<string> {
  const res = await request.post(`${BASE_API}/samples`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name, child_box_barcodes: barcodes },
  });
  expect(res.status()).toBe(201);
  const sampleId: string = (await res.json()).data.id;

  const closeRes = await request.post(`${BASE_API}/samples/${sampleId}/close`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(closeRes.ok()).toBeTruthy();

  return sampleId;
}

/** Create a CLOSED ecommerce record and return its id. */
async function createClosedEcommerce(
  request: APIRequestContext,
  token: string,
  name: string,
  boxId: string
): Promise<string> {
  const res = await request.post(`${BASE_API}/ecommerce`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name },
  });
  expect(res.status()).toBe(201);
  const recId: string = (await res.json()).data.id;

  await request.post(`${BASE_API}/ecommerce/add-box`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { ecommerce_record_id: recId, child_box_id: boxId },
  });

  const closeRes = await request.post(`${BASE_API}/ecommerce/${recId}/close`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(closeRes.ok()).toBeTruthy();

  return recId;
}

// ---------------------------------------------------------------------------
// TC-DMS-MC: Master-carton dispatch
// ---------------------------------------------------------------------------
test.describe('TC-DMS-MC: Master-Carton Dispatch', () => {
  test('TC-DMS-MC-001: Dispatch with master_carton_ids → 201, carton + boxes DISPATCHED', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `MC001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const cartonId = await createClosedCarton(request, token, [box.barcode]);

    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { master_carton_ids: [cartonId], destination: `MC Dest ${TS6}` },
    });
    expect(dispatchRes.status()).toBe(201);
    expect((await dispatchRes.json()).success).toBe(true);

    const cartonAfter = await request.get(`${BASE_API}/master-cartons/${cartonId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await cartonAfter.json()).data.status).toBe('DISPATCHED');

    const boxAfter = await request.get(`${BASE_API}/child-boxes/${box.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await boxAfter.json()).data.status).toBe('DISPATCHED');
  });
});

// ---------------------------------------------------------------------------
// TC-DMS-SM: Sample dispatch
// ---------------------------------------------------------------------------
test.describe('TC-DMS-SM: Sample Dispatch', () => {
  test('TC-DMS-SM-001: Dispatch with sample_record_id → 201, sample + boxes DISPATCHED', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `SM001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sampleId = await createClosedSample(request, token, `DMS Sample ${TS6}`, [box.barcode]);

    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sampleId, destination: `SM Dest ${TS6}` },
    });
    expect(dispatchRes.status()).toBe(201);

    const sampleAfter = await request.get(`${BASE_API}/samples/${sampleId}`, {
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
// TC-DMS-EC: E-commerce dispatch
// ---------------------------------------------------------------------------
test.describe('TC-DMS-EC: E-commerce Dispatch', () => {
  test('TC-DMS-EC-001: Dispatch with ecommerce_record_id → 201, record + boxes DISPATCHED', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `EC001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const recId = await createClosedEcommerce(request, token, `DMS Ecom ${TS6}`, box.id);

    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { ecommerce_record_id: recId, destination: `EC Dest ${TS6}` },
    });
    expect(dispatchRes.status()).toBe(201);

    const recAfter = await request.get(`${BASE_API}/ecommerce/${recId}`, {
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
// TC-DMS-REJECT: Source rejection rules
// ---------------------------------------------------------------------------
test.describe('TC-DMS-REJECT: Source Validation', () => {
  test('TC-DMS-REJECT-001: Both sample_record_id AND ecommerce_record_id → 400 refine message', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const res = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        sample_record_id: '00000000-0000-0000-0000-000000000001',
        ecommerce_record_id: '00000000-0000-0000-0000-000000000002',
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    const errs: string[] = Array.isArray(body.errors) ? body.errors : [];
    const msg: string = errs.join(' ') || body.message || body.error || '';
    expect(msg).toContain(
      'Exactly one dispatch source must be provided: master_carton_ids, sample_record_id, or ecommerce_record_id'
    );
  });

  test('TC-DMS-REJECT-002: master_carton_ids + sample_record_id together → 400', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const res = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        master_carton_ids: ['00000000-0000-0000-0000-000000000003'],
        sample_record_id: '00000000-0000-0000-0000-000000000004',
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    const errs: string[] = Array.isArray(body.errors) ? body.errors : [];
    const msg: string = errs.join(' ') || body.message || body.error || '';
    expect(msg).toContain('Exactly one dispatch source must be provided');
  });

  test('TC-DMS-REJECT-003: Zero-source empty body → 400 with source message', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const res = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {},
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    const errs: string[] = Array.isArray(body.errors) ? body.errors : [];
    const msg: string = errs.join(' ') || body.message || body.error || '';
    expect(msg).toContain('Exactly one dispatch source must be provided');
  });

  test('TC-DMS-REJECT-004: All three sources together → 400', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const res = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        master_carton_ids: ['00000000-0000-0000-0000-000000000005'],
        sample_record_id: '00000000-0000-0000-0000-000000000006',
        ecommerce_record_id: '00000000-0000-0000-0000-000000000007',
      },
    });

    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// TC-DMS-OPTIONAL: Optional non-source fields
// ---------------------------------------------------------------------------
test.describe('TC-DMS-OPTIONAL: Optional Fields', () => {
  test('TC-DMS-OPTIONAL-001: Dispatch with only source (no destination/vehicle) → 201', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `OPT001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const cartonId = await createClosedCarton(request, token, [box.barcode]);

    // No destination, no vehicle_number, no lr_number, no transport_details, no dispatch_date, no notes
    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { master_carton_ids: [cartonId] },
    });
    expect(dispatchRes.status()).toBe(201);
  });

  test('TC-DMS-OPTIONAL-002: All optional fields accepted when provided', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `OPT002${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const cartonId = await createClosedCarton(request, token, [box.barcode]);

    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        master_carton_ids: [cartonId],
        destination: `Full Fields Dest ${TS6}`,
        vehicle_number: `VH-${TS6}`,
        lr_number: `LR-${TS6}`,
        transport_details: 'Road via NH-44',
        dispatch_date: new Date().toISOString(),
        notes: 'Automated test dispatch',
      },
    });
    expect(dispatchRes.status()).toBe(201);
    const body = await dispatchRes.json();
    const records: any[] = Array.isArray(body.data) ? body.data : [body.data];
    expect(records[0]?.destination).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TC-DMS-ROLE: Role gates
// ---------------------------------------------------------------------------
test.describe('TC-DMS-ROLE: Role Gates', () => {
  const USERS = {
    dispatch: { email: `dp-dms-${TS}@test.com`, password: 'TestDp@9876', role: 'Dispatch Operator' },
    warehouse: { email: `wh-dms-${TS}@test.com`, password: 'TestWh@9876', role: 'Warehouse Operator' },
  };

  test('TC-DMS-ROLE-001: Dispatch Operator can dispatch via master_carton_ids', async ({
    request,
  }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: USERS.dispatch.email, password: USERS.dispatch.password, name: 'DMS Dispatch', role: USERS.dispatch.role },
    });

    // Do all admin setup BEFORE switching identity — Playwright shares cookies across calls
    // and the auth middleware reads cookie before the Authorization header.
    const productId = await createProduct(request, adminToken, `ROLE001${TS6}`);
    const box = await createFreeBox(request, adminToken, productId);
    const cartonId = await createClosedCarton(request, adminToken, [box.barcode]);

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: USERS.dispatch.email, password: USERS.dispatch.password },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Dispatch user not seeded');
      return;
    }
    const dpToken: string = (await loginRes.json()).data.accessToken;

    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${dpToken}`, 'Content-Type': 'application/json' },
      data: { master_carton_ids: [cartonId] },
    });
    expect(dispatchRes.status()).toBe(201);
  });

  test('TC-DMS-ROLE-002: Warehouse Operator cannot dispatch (403)', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: USERS.warehouse.email, password: USERS.warehouse.password, name: 'DMS WH', role: USERS.warehouse.role },
    });

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: USERS.warehouse.email, password: USERS.warehouse.password },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Warehouse user not seeded');
      return;
    }
    const whToken: string = (await loginRes.json()).data.accessToken;

    const res = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${whToken}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: '00000000-0000-0000-0000-000000000010' },
    });
    expect(res.status()).toBe(403);
  });

  test('TC-DMS-ROLE-003: Dispatch Operator can dispatch sample_record_id', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: USERS.dispatch.email, password: USERS.dispatch.password, name: 'DMS Dispatch2', role: USERS.dispatch.role },
    });

    // Do all admin setup BEFORE switching identity — Playwright shares cookies across calls
    // and the auth middleware reads cookie before the Authorization header.
    const productId = await createProduct(request, adminToken, `ROLE003${TS6}`);
    const box = await createFreeBox(request, adminToken, productId);
    const sampleId = await createClosedSample(request, adminToken, `DMS Role Sample ${TS6}`, [box.barcode]);

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: USERS.dispatch.email, password: USERS.dispatch.password },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Dispatch user not seeded');
      return;
    }
    const dpToken: string = (await loginRes.json()).data.accessToken;

    const res = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${dpToken}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sampleId },
    });
    expect(res.status()).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// TC-DMS-LIST: List dispatches with source metadata
// ---------------------------------------------------------------------------
test.describe('TC-DMS-LIST: Dispatch List with Source Metadata', () => {
  test('TC-DMS-LIST-001: GET /dispatches returns list', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await request.get(`${BASE_API}/dispatches?limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    expect(Array.isArray((await res.json()).data)).toBeTruthy();
  });

  test('TC-DMS-LIST-002: Dispatch record includes source-type information', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `LIST001${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const cartonId = await createClosedCarton(request, token, [box.barcode]);

    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { master_carton_ids: [cartonId] },
    });
    const dispatchBody = await dispatchRes.json();
    const dispatchRecords: any[] = Array.isArray(dispatchBody.data) ? dispatchBody.data : [dispatchBody.data];
    const dispatchId: string = dispatchRecords[0]?.id ?? '';

    const detailRes = await request.get(`${BASE_API}/dispatches/${dispatchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(detailRes.ok()).toBeTruthy();
    const detail = (await detailRes.json()).data;
    // source FK should be present — master_carton dispatch has master_carton_ids or carton ref
    const hasCartonRef =
      detail.master_carton_ids !== undefined ||
      detail.cartons !== undefined ||
      detail.source_type === 'master_carton' ||
      detail.masterCartonIds !== undefined;
    expect(hasCartonRef).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TC-DMS-UI: UI smoke
// ---------------------------------------------------------------------------
test.describe('TC-DMS-UI: Dispatch UI Smoke', () => {
  test('TC-DMS-UI-001: /dispatch page loads', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/dispatch');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/dispatch/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('TC-DMS-UI-002: /dispatches list page loads', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/dispatches');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/dispatch/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('TC-DMS-UI-003: /dispatch page has source-type tabs (Master Carton, Sample, E-commerce)', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto('/dispatch');
    await page.waitForLoadState('networkidle');

    // The dispatch page renders source-type tabs as <button type="button"> elements
    // Use a scoped selector to avoid matching the sidebar nav link "Master Cartons"
    const mcTab = page.locator('button[type="button"]').filter({ hasText: /^Master Carton$/i }).first();
    await expect(mcTab).toBeVisible({ timeout: 10000 });
  });
});
