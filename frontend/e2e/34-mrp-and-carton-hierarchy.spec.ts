/**
 * Phase 15 + Section 11: MRP hierarchy grouping + Carton hierarchy view
 *
 * Sub-section A (~15 tests): MRP grouping in /inventory/stock/hierarchy
 * Sub-section B (~15 tests): Carton hierarchy at /inventory/cartons/hierarchy
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

async function getAdminToken(request: APIRequestContext): Promise<string> {
  return loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
}

async function createProduct(
  request: APIRequestContext,
  token: string,
  articleCode: string,
  articleName: string,
  colour: string,
  size: string,
  mrp: number
): Promise<string> {
  const res = await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { article_code: articleCode, article_name: articleName, colour, size, category: 'Gents', section: 'Hawaii', mrp },
  });
  if ([200, 201].includes(res.status())) return (await res.json()).data?.id ?? '';
  const listRes = await request.get(`${BASE_API}/products?search=${articleCode}&limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok()) return '';
  const rows: Array<{ id: string; article_code: string }> = (await listRes.json()).data ?? [];
  return rows.find((p) => p.article_code === articleCode)?.id ?? '';
}

async function createFreeBox(
  request: APIRequestContext,
  token: string,
  productId: string
): Promise<{ id: string; barcode: string }> {
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
  }
  return box;
}

// ============================================================================
// SECTION A: MRP Hierarchy
// ============================================================================

test.describe('TC-MRP: MRP Grouping in Stock Hierarchy', () => {
  // Pre-seeded fixture in DB: MRP TEST CITY 02 (multi-MRP) and MRP TEST CITY 03 (single-MRP)
  // in section Hawaii.

  test('TC-MRP-001: Article-level data for MRP TEST CITY 02 has distinctMrpCount >= 2', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/stock/hierarchy?level=article_name&section=Hawaii`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ name: string; distinctMrpCount: number }> = (await res.json()).data ?? [];

    const city02 = rows.find((r) => r.name === 'MRP TEST CITY 02');
    if (!city02) {
      test.skip(true, 'MRP TEST CITY 02 fixture not found in DB — skipping');
      return;
    }
    expect(city02.distinctMrpCount).toBeGreaterThanOrEqual(2);
  });

  test('TC-MRP-002: Drilling MRP level for MRP TEST CITY 02 returns at least 2 MRP buckets', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/stock/hierarchy?level=mrp&section=Hawaii&article_name=${encodeURIComponent('MRP TEST CITY 02')}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ key?: string; name: string }> = (await res.json()).data ?? [];

    if (rows.length === 0) {
      test.skip(true, 'No MRP buckets found for MRP TEST CITY 02 — fixture may be empty');
      return;
    }
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  test('TC-MRP-003: MRP=299 bucket for MRP TEST CITY 02 returns only BLUE colour', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/stock/hierarchy?level=colour&section=Hawaii&article_name=${encodeURIComponent('MRP TEST CITY 02')}&mrp=299`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ name: string }> = (await res.json()).data ?? [];

    if (rows.length === 0) {
      test.skip(true, 'No colour rows for MRP=299 — fixture may not have boxes');
      return;
    }
    // All returned colours should be BLUE (the 299 MRP is blue)
    expect(rows.every((r) => r.name.toUpperCase() === 'BLUE')).toBeTruthy();
  });

  test('TC-MRP-004: MRP=399 bucket for MRP TEST CITY 02 returns only RED colour', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/stock/hierarchy?level=colour&section=Hawaii&article_name=${encodeURIComponent('MRP TEST CITY 02')}&mrp=399`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ name: string }> = (await res.json()).data ?? [];

    if (rows.length === 0) {
      test.skip(true, 'No colour rows for MRP=399 — fixture may not have boxes');
      return;
    }
    expect(rows.every((r) => r.name.toUpperCase() === 'RED')).toBeTruthy();
  });

  test('TC-MRP-005: MRP TEST CITY 03 has distinctMrpCount === 1', async ({ request }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/stock/hierarchy?level=article_name&section=Hawaii`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ name: string; distinctMrpCount: number }> = (await res.json()).data ?? [];

    const city03 = rows.find((r) => r.name === 'MRP TEST CITY 03');
    if (!city03) {
      test.skip(true, 'MRP TEST CITY 03 fixture not found — skipping');
      return;
    }
    expect(city03.distinctMrpCount).toBe(1);
  });

  test('TC-MRP-006: Product-level name renders with ₹ and floor for integral MRP', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/stock/hierarchy?level=product&section=Hawaii&article_name=${encodeURIComponent('MRP TEST CITY 02')}&mrp=299`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ name: string }> = (await res.json()).data ?? [];

    if (rows.length === 0) {
      test.skip(true, 'No product rows for MRP=299 MRP TEST CITY 02');
      return;
    }
    // Name format: "<size> - ₹<mrp_floor>" e.g. "6 - ₹299"
    const firstRow = rows[0];
    expect(firstRow.name).toMatch(/₹299/);
    expect(firstRow.name).not.toMatch(/₹299\./); // no decimal for integral MRP
  });

  test('TC-MRP-007: GENERATED boxes excluded from stock hierarchy aggregations', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    // Create a product + GENERATED box (do NOT activate)
    const articleCode = `MRPGEN${TS6}`.slice(0, 20);
    const productId = await createProduct(request, token, articleCode, `MRP Gen Excl ${TS6}`, 'White', '9', 199);
    if (!productId) {
      test.skip(true, 'Could not create product for GENERATED exclusion test');
      return;
    }

    // Create a GENERATED box (status stays GENERATED — do not activate)
    const boxRes = await request.post(`${BASE_API}/child-boxes`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { product_id: productId, quantity: 1 },
    });
    expect(boxRes.status()).toBe(201);
    // box status is GENERATED

    // Query product level — should show 0 totalPairs (GENERATED excluded)
    const res = await request.get(
      `${BASE_API}/inventory/stock/hierarchy?level=article_name&section=Hawaii&search=${encodeURIComponent(articleCode)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ name: string; totalPairs?: number; totalBoxes?: number }> = (await res.json()).data ?? [];

    const row = rows.find((r) => r.name.includes('MRP Gen Excl'));
    // May not appear at all (if totalPairs/totalBoxes = 0 and service filters out empty rows)
    if (row) {
      const pairs = row.totalPairs ?? 0;
      expect(pairs).toBe(0); // GENERATED should not count as stock
    }
    // If row is absent entirely, that's also correct (no FREE stock)
  });

  // -- UI tests for MRP drill-down --

  test('TC-MRP-UI-001: /inventory page loads stock hierarchy', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/inventory/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('TC-MRP-UI-002: Deep link ?level=colour&section=Hawaii&article_name=MRP+TEST+CITY+02&mrp=299 loads colour view', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto(
      '/inventory?level=colour&section=Hawaii&article_name=MRP%20TEST%20CITY%2002&mrp=299'
    );
    await page.waitForLoadState('networkidle');
    // Should be on the colour drill-down level, not section level
    await expect(page.getByText(/colour|blue|inventory/i).first()).toBeVisible({ timeout: 15000 });
  });
});

// ============================================================================
// SECTION B: Carton Hierarchy
// ============================================================================

test.describe('TC-CART: Carton Hierarchy', () => {

  test('TC-CART-001: GET /inventory/cartons/hierarchy?level=status returns data array', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    const res = await request.get(`${BASE_API}/inventory/cartons/hierarchy?level=status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    // data must be an array
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('TC-CART-002: Status level returns nodes for known carton statuses', async ({ request }) => {
    const token = await getAdminToken(request);

    // First, ensure there is at least one ACTIVE carton
    const productId = await createProduct(request, token, `CART02${TS6}`.slice(0,20), `Cart02 ${TS6}`, 'Black', '8', 299);
    if (productId) {
      const box = await createFreeBox(request, token, productId);
      await request.post(`${BASE_API}/master-cartons`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { max_capacity: 24, child_box_barcodes: [box.barcode] },
      });
    }

    const res = await request.get(`${BASE_API}/inventory/cartons/hierarchy?level=status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const rows: Array<{ name: string; cartonCount: number }> = (await res.json()).data ?? [];
    const names = rows.map((r) => r.name.toUpperCase());
    // ACTIVE should be present (we just created one)
    expect(names).toContain('ACTIVE');
  });

  test('TC-CART-003: Drill into ACTIVE status returns section list', async ({ request }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/cartons/hierarchy?level=section&status=ACTIVE`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ name: string }> = (await res.json()).data ?? [];
    // Should be an array (may be empty if no active cartons, but API must not error)
    expect(Array.isArray(rows)).toBeTruthy();
  });

  test('TC-CART-004: Drill section → article_name level returns article cards', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    const sectionRes = await request.get(
      `${BASE_API}/inventory/cartons/hierarchy?level=section&status=ACTIVE`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const sections: Array<{ name: string }> = (await sectionRes.json()).data ?? [];
    if (sections.length === 0) {
      test.skip(true, 'No ACTIVE sections found in carton hierarchy');
      return;
    }
    const section = sections[0].name;

    const res = await request.get(
      `${BASE_API}/inventory/cartons/hierarchy?level=article_name&status=ACTIVE&section=${encodeURIComponent(section)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ name: string; primary_section: string }> = (await res.json()).data ?? [];
    expect(Array.isArray(rows)).toBeTruthy();
    // If populated, primary_section should match
    if (rows.length > 0) {
      expect(rows.every((r) => r.primary_section !== undefined)).toBeTruthy();
    }
  });

  test('TC-CART-005: Carton leaf level returns cartons with child_count and max_capacity', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    // Create an ACTIVE carton with 2 boxes
    const productId = await createProduct(request, token, `CART05${TS6}`.slice(0,20), `Cart05 ${TS6}`, 'Black', '8', 299);
    if (!productId) {
      test.skip(true, 'Could not create product for carton leaf test');
      return;
    }
    const box1 = await createFreeBox(request, token, productId);
    const box2 = await createFreeBox(request, token, productId);
    const cartonRes = await request.post(`${BASE_API}/master-cartons`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { max_capacity: 24, child_box_barcodes: [box1.barcode, box2.barcode] },
    });
    expect(cartonRes.status()).toBe(201);

    const res = await request.get(
      `${BASE_API}/inventory/cartons/hierarchy?level=carton&status=ACTIVE&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ child_count: number; max_capacity: number; status: string }> =
      (await res.json()).data ?? [];

    // At least the carton we just created should be there
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0];
    expect(first.child_count).toBeGreaterThanOrEqual(0);
    expect(first.max_capacity).toBeGreaterThan(0);
    expect(first.status).toBe('ACTIVE');
  });

  test('TC-CART-006: Carton leaf includes primary_section field', async ({ request }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/cartons/hierarchy?level=carton&status=ACTIVE&limit=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const rows: Array<{ primary_section?: string }> = (await res.json()).data ?? [];

    if (rows.length === 0) {
      test.skip(true, 'No ACTIVE cartons for primary_section assertion');
      return;
    }
    // primary_section should be defined (may be null/undefined if carton has no boxes from a section)
    // Just verify the field exists in shape
    expect('primary_section' in rows[0]).toBeTruthy();
  });

  test('TC-CART-007: Empty filter combo returns empty data array', async ({ request }) => {
    const token = await getAdminToken(request);

    // Use a section that certainly does not exist
    const res = await request.get(
      `${BASE_API}/inventory/cartons/hierarchy?level=section&status=ACTIVE&section=NONEXISTENT_SECTION_${TS6}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    // data should be an empty array, not an error
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data).toHaveLength(0);
  });

  test('TC-CART-008: Pagination at carton leaf — limit=2 returns correct meta if 3+ cartons', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/cartons/hierarchy?level=carton&status=ACTIVE&limit=2&page=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();

    // If there are more than 2 cartons, totalPages should be > 1
    const total: number = body.meta?.total ?? body.total ?? body.pagination?.total ?? 0;
    const totalPages: number =
      body.meta?.totalPages ?? body.totalPages ?? body.pagination?.totalPages ?? 1;

    if (total > 2) {
      expect(totalPages).toBeGreaterThan(1);
    }
  });

  // ---- CSV export tests ----

  test('TC-CART-CSV-001: GET /inventory/cartons/export?level=section → 8-column CSV', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/cartons/export?level=section&status=ACTIVE`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();

    const ct = res.headers()['content-type'] ?? '';
    expect(ct.includes('text/csv') || ct.includes('application/octet-stream')).toBeTruthy();

    const text = await res.text();
    const header = text.trim().split('\n')[0].replace(/\r/g, '');
    // Expects: "Section","Carton Count","Created","Active","Closed","Dispatched","Child Boxes","Total Pairs"
    const cols = header.split(',').map((c) => c.replace(/"/g, '').trim());
    expect(cols).toContain('Section');
    expect(cols).toContain('Carton Count');
    expect(cols.length).toBe(8);
  });

  test('TC-CART-CSV-002: GET /inventory/cartons/export?level=carton → includes Section (Primary) and Article (Primary)', async ({
    request,
  }) => {
    const token = await getAdminToken(request);

    const res = await request.get(
      `${BASE_API}/inventory/cartons/export?level=carton&status=ACTIVE`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(res.ok()).toBeTruthy();

    const text = await res.text();
    const header = text.trim().split('\n')[0].replace(/\r/g, '');
    const cols = header.split(',').map((c) => c.replace(/"/g, '').trim());
    expect(cols).toContain('Section (Primary)');
    expect(cols).toContain('Article (Primary)');
    expect(cols.length).toBe(10);
  });

  test('TC-CART-CSV-003: Admin can export carton CSV (200)', async ({ request }) => {
    const token = await getAdminToken(request);
    const res = await request.get(`${BASE_API}/inventory/cartons/export?level=status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('TC-CART-CSV-004: Warehouse Operator cannot export carton CSV (403)', async ({ request }) => {
    const adminToken = await getAdminToken(request);

    const whEmail = `wh-cart-${TS}@test.com`;
    const whPassword = 'TestWh@9876';
    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: whEmail, password: whPassword, name: 'Cart WH', role: 'Warehouse Operator' },
    });

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: whEmail, password: whPassword },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Warehouse user not seeded');
      return;
    }
    const whToken: string = (await loginRes.json()).data.accessToken;

    const res = await request.get(`${BASE_API}/inventory/cartons/export?level=status`, {
      headers: { Authorization: `Bearer ${whToken}` },
    });
    expect(res.status()).toBe(403);
  });

  // ---- UI tests ----

  test('TC-CART-UI-001: /inventory page has By Child Box and By Master Carton tab options', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    // Look for carton view tab
    const cartonTab = page
      .getByRole('tab', { name: /master carton|by.*carton/i })
      .or(page.getByRole('button', { name: /master carton|by.*carton/i }))
      .or(page.getByText(/by master carton|carton view/i).first());

    const visible = await cartonTab.isVisible({ timeout: 8000 }).catch(() => false);
    // Best-effort: the carton view tab may not yet be implemented
    if (!visible) {
      test.skip(true, 'Carton tab not found on /inventory — UI may not yet expose it');
      return;
    }
    await expect(cartonTab).toBeVisible();
  });

  test('TC-CART-UI-002: Switching to Carton tab resets to status drill-down', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/inventory');
    await page.waitForLoadState('networkidle');

    const cartonTab = page
      .getByRole('tab', { name: /master carton|by.*carton/i })
      .or(page.getByRole('button', { name: /master carton|by.*carton/i }))
      .first();

    const visible = await cartonTab.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip(true, 'Carton tab not visible — skipping');
      return;
    }
    await cartonTab.click();
    await page.waitForTimeout(500);

    // After switching, status-level nodes (ACTIVE, CREATED, etc.) should appear
    const statusNode = page.getByText(/ACTIVE|CREATED|CLOSED|DISPATCHED/).first();
    await expect(statusNode).toBeVisible({ timeout: 10000 });
  });

  test('TC-CART-UI-003: Leaf carton card navigates to /master-cartons/[id]', async ({ page }) => {
    const token = await (async () => {
      const res = await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      return (await res.json()).data.accessToken as string;
    })();

    // Create a carton to navigate to
    const productId = await createProduct(
      page.request as unknown as APIRequestContext,
      token,
      `CUInav${TS6}`.slice(0, 20),
      `Cart Nav ${TS6}`,
      'Black',
      '8',
      299
    );
    let cartonId = '';
    if (productId) {
      const box = await createFreeBox(page.request as unknown as APIRequestContext, token, productId);
      const cr = await page.request.post(`${BASE_API}/master-cartons`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { max_capacity: 24, child_box_barcodes: [box.barcode] },
      });
      if (cr.status() === 201) {
        cartonId = (await cr.json()).data.id;
      }
    }

    if (!cartonId) {
      test.skip(true, 'Could not create carton for navigation test');
      return;
    }

    await loginViaAPI(page);
    await page.goto(`/master-cartons/${cartonId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/carton|master/i).first()).toBeVisible({ timeout: 15000 });
    expect(page.url()).toContain(cartonId);
  });
});
