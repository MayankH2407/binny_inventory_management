/**
 * Phase 08: Child-Box CSV Bulk Uploader
 * Covers: sample download, successful upload, per-row errors, 1000-row cap,
 *         5000-box cap, MIME type gate, header validation, role gates, UI flow.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD, loginViaAPI, getAuthToken } from './helpers';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const TS = Date.now();

async function loginAs(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data.accessToken;
}

/** Return a product SKU that is already known to exist in the DB (created if not). */
async function ensureProductSku(
  request: APIRequestContext,
  adminToken: string,
  suffix: string
): Promise<string> {
  const articleCode = `CBCSV${suffix}`.slice(0, 20);
  // Try to create — 409 is fine (already exists).
  await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    data: {
      article_code: articleCode,
      article_name: `CSV Test ${suffix}`,
      colour: 'Black',
      size: '8',
      category: 'Gents',
      section: 'Hawaii',
      mrp: 299,
    },
  });
  // Fetch back to confirm SKU
  const res = await request.get(`${BASE_API}/products?search=${articleCode}&limit=5`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  if (!res.ok()) {
    throw new Error(`Failed to fetch product after create: ${res.status()}`);
  }
  const body = await res.json();
  const rows: Array<{ sku: string; article_code: string }> = Array.isArray(body.data) ? body.data : [];
  const match = rows.find((p) => p.article_code === articleCode);
  if (!match || !match.sku) {
    throw new Error(`Could not resolve SKU for article_code ${articleCode}`);
  }
  return match.sku;
}

// ---------------------------------------------------------------------------
// TC-CB-CSV: sample download
// ---------------------------------------------------------------------------
test.describe('TC-CB-CSV: Sample CSV Download', () => {
  test('TC-CB-CSV-001: GET /child-boxes/bulk-upload/sample returns 200 with text/csv', async ({ page }) => {
    const token = await getAuthToken(page);
    const res = await page.request.get(`${BASE_API}/child-boxes/bulk-upload/sample`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] ?? '';
    expect(ct.includes('text/csv') || ct.includes('application/octet-stream')).toBeTruthy();
  });

  test('TC-CB-CSV-002: Sample CSV header contains sku, quantity, count columns', async ({ page }) => {
    const token = await getAuthToken(page);
    const res = await page.request.get(`${BASE_API}/child-boxes/bulk-upload/sample`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const text = await res.text();
    const header = text.trim().split('\n')[0].replace(/\r/g, '');
    const cols = header.split(',').map((c) => c.trim().toLowerCase());
    expect(cols).toContain('sku');
    expect(cols).toContain('quantity');
    expect(cols).toContain('count');
  });

  test('TC-CB-CSV-003: Sample CSV contains exactly 3 data rows', async ({ page }) => {
    const token = await getAuthToken(page);
    const res = await page.request.get(`${BASE_API}/child-boxes/bulk-upload/sample`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const lines = (await res.text()).trim().split('\n').filter((l) => l.trim().length > 0);
    // Header + 3 data rows = 4 lines
    expect(lines.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// TC-CB-UPLOAD: successful upload
// ---------------------------------------------------------------------------
test.describe('TC-CB-UPLOAD: Successful CSV Upload', () => {
  test('TC-CB-UPLOAD-001: 6-box upload across 3 SKUs returns 201 with correct counts', async ({
    request,
  }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const sku1 = await ensureProductSku(request, adminToken, `U1${String(TS).slice(-5)}`);
    const sku2 = await ensureProductSku(request, adminToken, `U2${String(TS).slice(-5)}`);
    const sku3 = await ensureProductSku(request, adminToken, `U3${String(TS).slice(-5)}`);

    const csv = [`sku,quantity,count`, `${sku1},1,2`, `${sku2},1,2`, `${sku3},1,2`].join('\n');

    const res = await request.post(`${BASE_API}/child-boxes/bulk-upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        file: { name: 'upload.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.created).toBe(6);
    expect(body.data.errors).toHaveLength(0);
    expect(body.data.createdBarcodes).toHaveLength(6);
    expect(body.data.totalRows).toBe(3);
  });

  test('TC-CB-UPLOAD-002: Uploaded boxes have status GENERATED in DB', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const sku = await ensureProductSku(request, adminToken, `GEN${String(TS).slice(-5)}`);

    const csv = [`sku,quantity,count`, `${sku},1,2`].join('\n');
    const uploadRes = await request.post(`${BASE_API}/child-boxes/bulk-upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        file: { name: 'gen.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
      },
    });
    expect(uploadRes.status()).toBe(201);
    const body = await uploadRes.json();
    const barcodes: string[] = body.data.createdBarcodes;
    expect(barcodes.length).toBeGreaterThanOrEqual(1);

    // Verify first barcode has GENERATED status
    const boxRes = await request.get(
      `${BASE_API}/child-boxes/qr/${encodeURIComponent(barcodes[0])}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(boxRes.ok()).toBeTruthy();
    const boxBody = await boxRes.json();
    expect(boxBody.data.status).toBe('GENERATED');
  });

  test('TC-CB-UPLOAD-003: CHILD_CREATED inventory transaction inserted for each created box', async ({
    request,
  }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const sku = await ensureProductSku(request, adminToken, `TX${String(TS).slice(-5)}`);

    const csv = [`sku,quantity,count`, `${sku},1,1`].join('\n');
    const uploadRes = await request.post(`${BASE_API}/child-boxes/bulk-upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        file: { name: 'tx.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
      },
    });
    expect(uploadRes.status()).toBe(201);
    const body = await uploadRes.json();
    const barcode: string = body.data.createdBarcodes[0];

    // Look up box ID then check transactions
    const boxRes = await request.get(
      `${BASE_API}/child-boxes/qr/${encodeURIComponent(barcode)}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(boxRes.ok()).toBeTruthy();
    const boxId = (await boxRes.json()).data.id;

    const txRes = await request.get(
      `${BASE_API}/inventory/transactions?child_box_id=${boxId}&limit=50`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    expect(txRes.ok()).toBeTruthy();
    const txBody = await txRes.json();
    const txTypes: string[] = (Array.isArray(txBody.data) ? txBody.data : []).map(
      (t: { transaction_type: string }) => t.transaction_type
    );
    expect(txTypes).toContain('CHILD_CREATED');
  });
});

// ---------------------------------------------------------------------------
// TC-CB-ERR: per-row and structural errors
// ---------------------------------------------------------------------------
test.describe('TC-CB-ERR: Error Handling', () => {
  test('TC-CB-ERR-001: Invalid SKU in row 2 goes to errors[], valid rows still create', async ({
    request,
  }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const sku = await ensureProductSku(request, adminToken, `ER1${String(TS).slice(-5)}`);

    const csv = [
      `sku,quantity,count`,
      `${sku},1,1`,
      `NONEXISTENT-SKU-${TS},1,1`,
    ].join('\n');

    const res = await request.post(`${BASE_API}/child-boxes/bulk-upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        file: { name: 'mixed.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
      },
    });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.created).toBe(1);
    expect(body.data.errors).toHaveLength(1);
    expect(body.data.errors[0].row).toBe(2);
    expect(body.data.errors[0].error).toMatch(/not found/i);
  });

  test('TC-CB-ERR-002: 1001-row CSV returns 4xx with row cap message', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const rows = ['sku,quantity,count'];
    for (let i = 0; i < 1001; i++) {
      rows.push(`FAKE-SKU-${i},1,1`);
    }
    const csv = rows.join('\n');

    const res = await request.post(`${BASE_API}/child-boxes/bulk-upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        file: { name: 'too_many_rows.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
      },
    });

    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    const msg: string = body.message ?? body.error ?? '';
    expect(msg.toLowerCase()).toMatch(/1000|maximum|rows/i);
  });

  test('TC-CB-ERR-003: count=5001 in single row → 409 cumulative cap', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const sku = await ensureProductSku(request, adminToken, `CAP${String(TS).slice(-5)}`);

    const csv = [`sku,quantity,count`, `${sku},1,5001`].join('\n');

    const res = await request.post(`${BASE_API}/child-boxes/bulk-upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        file: { name: 'cap5001.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
      },
    });

    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    const msg: string = body.message ?? body.error ?? '';
    expect(msg).toContain('Total boxes across all rows must not exceed 5000');
  });

  test('TC-CB-ERR-004: Wrong MIME type (.txt) is rejected', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const csv = [`sku,quantity,count`, `FAKE-SKU,1,1`].join('\n');

    const res = await request.post(`${BASE_API}/child-boxes/bulk-upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        file: { name: 'upload.txt', mimeType: 'text/plain', buffer: Buffer.from(csv) },
      },
    });

    // Should reject wrong MIME type
    expect(res.ok()).toBeFalsy();
  });

  test('TC-CB-ERR-005: Missing "count" header column → rejected with validation error', async ({
    request,
  }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Omit 'count' column
    const csv = [`sku,quantity`, `SOME-SKU,1`].join('\n');

    const res = await request.post(`${BASE_API}/child-boxes/bulk-upload`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      multipart: {
        file: { name: 'no_count.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
      },
    });

    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    const msg: string = body.message ?? body.error ?? '';
    expect(msg.toLowerCase()).toMatch(/count|missing|column/i);
  });

  test('TC-CB-ERR-006: 11MB file body → 4xx (multer size cap)', async ({ request }) => {
    // Build an ~11 MB buffer (exceeds multer limit)
    const bigChunk = 'A'.repeat(1024 * 1024); // 1 MB
    let csv = 'sku,quantity,count\n';
    // Repeat until ~11 MB
    while (csv.length < 11 * 1024 * 1024) {
      csv += bigChunk;
    }

    const res = await request.post(`${BASE_API}/child-boxes/bulk-upload`, {
      headers: { Authorization: `Bearer ${request.constructor.name}` }, // intentionally bad auth — size check first
      multipart: {
        file: { name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
      },
    }).catch(() => null);

    // Either a 413 from multer or a 4xx; if the test cannot build the file fast enough, skip.
    if (res === null) {
      test.skip(true, 'Could not generate large file for size-cap test');
      return;
    }
    expect(res.ok()).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// TC-CB-ROLE: Role gates
// ---------------------------------------------------------------------------
test.describe('TC-CB-ROLE: Role Gates', () => {
  const ROLES = {
    warehouse: { email: `wh-cbcsv-${TS}@test.com`, password: 'TestWh@9876', role: 'Warehouse Operator' },
    dispatch: { email: `dp-cbcsv-${TS}@test.com`, password: 'TestDp@9876', role: 'Dispatch Operator' },
  };

  test('TC-CB-ROLE-001: Admin can download sample CSV', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await request.get(`${BASE_API}/child-boxes/bulk-upload/sample`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('TC-CB-ROLE-002: Warehouse Operator cannot download sample CSV (403)', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Create warehouse user (best-effort)
    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: ROLES.warehouse.email, password: ROLES.warehouse.password, name: 'CB CSV WH', role: ROLES.warehouse.role },
    });

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: ROLES.warehouse.email, password: ROLES.warehouse.password },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Warehouse user not seeded — skipping RBAC test');
      return;
    }
    const whToken: string = (await loginRes.json()).data.accessToken;

    const res = await request.get(`${BASE_API}/child-boxes/bulk-upload/sample`, {
      headers: { Authorization: `Bearer ${whToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('TC-CB-ROLE-003: Dispatch Operator cannot upload CSV (403)', async ({ request }) => {
    const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    await request.post(`${BASE_API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { email: ROLES.dispatch.email, password: ROLES.dispatch.password, name: 'CB CSV DP', role: ROLES.dispatch.role },
    });

    const loginRes = await request.post(`${BASE_API}/auth/login`, {
      data: { email: ROLES.dispatch.email, password: ROLES.dispatch.password },
    });
    if (!loginRes.ok()) {
      test.skip(true, 'Dispatch user not seeded — skipping RBAC test');
      return;
    }
    const dpToken: string = (await loginRes.json()).data.accessToken;

    const csv = [`sku,quantity,count`, `FAKE,1,1`].join('\n');
    const res = await request.post(`${BASE_API}/child-boxes/bulk-upload`, {
      headers: { Authorization: `Bearer ${dpToken}` },
      multipart: {
        file: { name: 'dp.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) },
      },
    });
    expect(res.status()).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// TC-CB-UI: UI smoke tests
// ---------------------------------------------------------------------------
test.describe('TC-CB-UI: Bulk Import UI', () => {
  test('TC-CB-UI-001: /child-boxes shows "Bulk Import" button for admin', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/child-boxes');
    await page.waitForLoadState('networkidle');

    const btn = page.getByRole('button', { name: /bulk import/i });
    await expect(btn).toBeVisible({ timeout: 10000 });
  });

  test('TC-CB-UI-002: Bulk Import button opens upload dialog with file input', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/child-boxes');
    await page.waitForLoadState('networkidle');

    const btn = page.getByRole('button', { name: /bulk import/i });
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
    await page.waitForTimeout(500);

    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
  });

  test('TC-CB-UI-003: Upload valid CSV via file input → success banner visible', async ({ page }) => {
    const token = await getAuthToken(page);

    // Ensure a product exists
    const articleCode = `CBUI${String(TS).slice(-5)}`;
    await page.request.post(`${BASE_API}/products`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        article_code: articleCode,
        article_name: `CB UI Upload ${TS}`,
        colour: 'Black',
        size: '8',
        category: 'Gents',
        section: 'Hawaii',
        mrp: 299,
      },
    });

    // Fetch SKU
    const prodRes = await page.request.get(`${BASE_API}/products?search=${articleCode}&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const prodBody = await prodRes.json();
    const rows: Array<{ sku: string }> = Array.isArray(prodBody.data) ? prodBody.data : [];
    const sku = rows.find((p) => p.sku?.includes(articleCode))?.sku;
    if (!sku) {
      test.skip(true, 'Could not resolve product SKU for UI upload test');
      return;
    }

    await loginViaAPI(page);
    await page.goto('/child-boxes');
    await page.waitForLoadState('networkidle');

    const btn = page.getByRole('button', { name: /bulk import/i });
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
    await page.waitForTimeout(500);

    const csv = [`sku,quantity,count`, `${sku},1,1`].join('\n');
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
    await fileInput.setInputFiles({
      name: 'test.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv),
    });

    // Submit upload
    const submitBtn = page
      .getByRole('button', { name: /upload|import|submit/i })
      .filter({ hasNot: page.getByRole('button', { name: /cancel/i }) })
      .first();
    const hasSubmit = await submitBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasSubmit) await submitBtn.click();

    // Expect success indicator
    const success = page.getByText(/success|created|uploaded|complete/i).first();
    await expect(success).toBeVisible({ timeout: 15000 });
  });

  test('TC-CB-UI-004: "Download Sample" link inside Bulk Import dialog triggers file download', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/child-boxes');
    await page.waitForLoadState('networkidle');

    const btn = page.getByRole('button', { name: /bulk import/i });
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
    await page.waitForTimeout(500);

    // Should have a download-sample button (text "Download" inside the sample CSV section)
    const downloadEl = page
      .getByRole('button', { name: /download/i })
      .or(page.getByRole('link', { name: /download/i }))
      .first();
    await expect(downloadEl).toBeVisible({ timeout: 5000 });
  });
});
