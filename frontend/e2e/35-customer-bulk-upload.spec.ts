/**
 * Phase 6: Customer CSV Bulk Upload
 * Covers: sample CSV download, valid upload, row-level validation errors,
 *         sub-dealer primary-dealer lookup, duplicate firm_name, UI modal smoke.
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

/** Build a minimal valid CSV with 1 Primary Dealer row */
function makeCustomerCsv(rows: string[][]): string {
  const header = 'firm_name,address,delivery_location,gstin,private_marka,gr,contact_person_name,contact_person_mobile,customer_type,primary_dealer_name';
  return [header, ...rows.map((r) => r.join(','))].join('\n');
}

const EXPECTED_HEADERS = [
  'firm_name', 'address', 'delivery_location', 'gstin', 'private_marka',
  'gr', 'contact_person_name', 'contact_person_mobile', 'customer_type', 'primary_dealer_name',
];

// ---------------------------------------------------------------------------
// TC-CBULK-SAMPLE: Sample CSV download
// ---------------------------------------------------------------------------
test.describe('TC-CBULK-SAMPLE: Customer Sample CSV', () => {
  test('TC-CBULK-SAMPLE-001: GET /customers/bulk-upload/sample returns 200 with CSV content-type', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const res = await request.get(`${BASE_API}/customers/bulk-upload/sample`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok(), `Expected 200 but got ${res.status()}`).toBeTruthy();

    const contentType = res.headers()['content-type'] ?? '';
    expect(
      contentType.includes('text/csv') || contentType.includes('application/octet-stream'),
      `Expected CSV content-type, got: ${contentType}`
    ).toBeTruthy();

    const body = await res.text();
    expect(body.trim().length).toBeGreaterThan(0);
  });

  test('TC-CBULK-SAMPLE-002: Sample CSV contains all 10 expected column headers', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const res = await request.get(`${BASE_API}/customers/bulk-upload/sample`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();

    const body = await res.text();
    const headerLine = body.trim().split('\n')[0];
    const columns = headerLine.split(',').map((c) => c.trim().replace(/\r/g, ''));

    for (const col of EXPECTED_HEADERS) {
      expect(
        columns.includes(col),
        `Expected column "${col}" in sample CSV. Found: ${columns.join(', ')}`
      ).toBeTruthy();
    }

    expect(columns.length).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// TC-CBULK-VALID: Valid CSV upload
// ---------------------------------------------------------------------------
test.describe('TC-CBULK-VALID: Valid Customer CSV Upload', () => {
  test('TC-CBULK-VALID-001: POST /customers/bulk-upload with valid CSV creates customers', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const csvContent = makeCustomerCsv([
      [`BulkFirm PD ${TS6}`, '12 MG Road', 'Jaipur', '22AAAAA0000A1Z5', 'BMARKA', 'GR001', 'Ramesh', '9876543210', 'Primary Dealer', ''],
      [`BulkFirm PD2 ${TS6}`, '22 Park St', 'Delhi', '', '', '', 'Suresh', '9876543211', 'Primary Dealer', ''],
    ]);

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'customers.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    expect(
      res.ok(),
      `Bulk upload failed: ${res.status()} — ${JSON.stringify(body)}`
    ).toBeTruthy();

    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('created');
    expect(body.data.created).toBeGreaterThanOrEqual(2);
  });

  test('TC-CBULK-VALID-002: Sub Dealer referencing an EXISTING Primary Dealer is created', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const pdName = `PDForSub ${TS6}`;

    // First create the primary dealer via API so it exists for the sub-dealer lookup
    await request.post(`${BASE_API}/customers`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { firm_name: pdName, customer_type: 'Primary Dealer' },
    });

    const csvContent = makeCustomerCsv([
      [`SubDealer ${TS6}`, '', '', '', '', '', '', '', 'Sub Dealer', pdName],
    ]);

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'sub.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    expect(res.ok()).toBeTruthy();
    expect(body.data.created).toBeGreaterThanOrEqual(1);
    expect(body.data.errors.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-CBULK-ERR: Row-level validation errors
// ---------------------------------------------------------------------------
test.describe('TC-CBULK-ERR: Customer CSV Row Validation Errors', () => {
  test('TC-CBULK-ERR-001: Empty CSV (headers only) → 409/400 error (no rows)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const csvContent = EXPECTED_HEADERS.join(',');

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    expect(
      body.success === false || body.error || body.message,
      `Expected error, got: ${JSON.stringify(body)}`
    ).toBeTruthy();
  });

  test('TC-CBULK-ERR-002: Missing firm_name column entirely → structural error', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const csvContent = ['address,customer_type', '12 MG Road,Primary Dealer'].join('\n');

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'no_firm_name.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    expect(
      (body.message || body.error || '').toLowerCase().includes('firm_name'),
      `Expected firm_name error, got: ${JSON.stringify(body)}`
    ).toBeTruthy();
  });

  test('TC-CBULK-ERR-003: Row with missing firm_name value → row error', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Two rows: first valid, second has empty firm_name
    const csvContent = makeCustomerCsv([
      [`ValidFirm ${TS6}A`, '', '', '', '', '', '', '', 'Primary Dealer', ''],
      ['', '', '', '', '', '', '', '', 'Primary Dealer', ''],
    ]);

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'empty_firm.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    // Service may return 201 with errors array or 4xx; either way the empty row should produce an error
    if (res.ok()) {
      expect(body.data.errors.length).toBeGreaterThan(0);
      const rowErr = body.data.errors.find(
        (e: { error: string }) => e.error.toLowerCase().includes('firm_name')
      );
      expect(rowErr).toBeTruthy();
    } else {
      expect(body.success === false || body.message).toBeTruthy();
    }
  });

  test('TC-CBULK-ERR-004: Invalid GSTIN format → row error', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const csvContent = makeCustomerCsv([
      [`BadGSTIN ${TS6}`, '', '', 'INVALID_GSTIN', '', '', '', '', 'Primary Dealer', ''],
    ]);

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'bad_gstin.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    if (res.ok()) {
      expect(body.data.errors.length).toBeGreaterThan(0);
      const errMsg = body.data.errors[0].error.toLowerCase();
      expect(errMsg.includes('gstin') || errMsg.includes('invalid')).toBeTruthy();
    } else {
      expect(body.success === false || body.message).toBeTruthy();
    }
  });

  test('TC-CBULK-ERR-005: Invalid mobile number (less than 10 digits) → row error', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const csvContent = makeCustomerCsv([
      [`BadMobile ${TS6}`, '', '', '', '', '', 'Alice', '12345', 'Primary Dealer', ''],
    ]);

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'bad_mobile.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    if (res.ok()) {
      expect(body.data.errors.length).toBeGreaterThan(0);
      const errMsg = body.data.errors[0].error.toLowerCase();
      expect(errMsg.includes('mobile') || errMsg.includes('digit')).toBeTruthy();
    } else {
      expect(body.success === false || body.message).toBeTruthy();
    }
  });

  test('TC-CBULK-ERR-006: Sub Dealer referencing a non-existent Primary Dealer → row error', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const nonExistentPD = `NoSuchDealer_${TS}`;
    const csvContent = makeCustomerCsv([
      [`SubNoParent ${TS6}`, '', '', '', '', '', '', '', 'Sub Dealer', nonExistentPD],
    ]);

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'no_parent.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    // Should come back 201 with errors (row-level), or 4xx
    if (res.ok()) {
      expect(body.data.errors.length).toBeGreaterThan(0);
      const errMsg = body.data.errors[0].error.toLowerCase();
      expect(
        errMsg.includes('primary dealer') || errMsg.includes('not found'),
        `Expected primary dealer error, got: ${errMsg}`
      ).toBeTruthy();
    } else {
      expect(body.success === false || body.message).toBeTruthy();
    }
  });

  test('TC-CBULK-ERR-007: Duplicate firm_name in same CSV batch → second row errors', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const dupName = `DupFirmBatch ${TS6}`;

    const csvContent = makeCustomerCsv([
      [dupName, '', '', '', '', '', '', '', 'Primary Dealer', ''],
      [dupName, '', '', '', '', '', '', '', 'Primary Dealer', ''],
    ]);

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'dup_batch.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    // The first row succeeds (or is created), second row must error with duplicate/already exists
    if (res.ok()) {
      expect(body.data.errors.length).toBeGreaterThan(0);
      const errMsg = body.data.errors[0].error.toLowerCase();
      expect(
        errMsg.includes('already exists') || errMsg.includes('duplicate'),
        `Expected duplicate error, got: ${errMsg}`
      ).toBeTruthy();
    } else {
      // Some implementations reject the whole batch on first duplicate
      expect(body.success === false || body.message).toBeTruthy();
    }
  });

  test('TC-CBULK-ERR-008: firm_name that already exists in DB → row error', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const existingName = `ExistingFirm ${TS6}`;

    // Create the firm first
    await request.post(`${BASE_API}/customers`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { firm_name: existingName, customer_type: 'Primary Dealer' },
    });

    const csvContent = makeCustomerCsv([
      [existingName, '', '', '', '', '', '', '', 'Primary Dealer', ''],
    ]);

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'existing.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    if (res.ok()) {
      expect(body.data.errors.length).toBeGreaterThan(0);
      const errMsg = body.data.errors[0].error.toLowerCase();
      expect(
        errMsg.includes('already exists') || errMsg.includes('duplicate'),
        `Expected already-exists error, got: ${errMsg}`
      ).toBeTruthy();
    } else {
      expect(body.success === false || body.message).toBeTruthy();
    }
  });

  test('TC-CBULK-ERR-009: CSV > 500 rows → rejected with cap message', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    // Build 501 rows — guaranteed to exceed cap
    const rows = Array.from({ length: 501 }, (_, i) => [
      `CapTestFirm_${i}_${TS}`, '', '', '', '', '', '', '', 'Primary Dealer', '',
    ]);
    const csvContent = makeCustomerCsv(rows);

    const res = await request.post(`${BASE_API}/customers/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'too_many.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    const msg = (body.message || body.error || '').toLowerCase();
    expect(
      msg.includes('500') || msg.includes('maximum') || msg.includes('rows'),
      `Expected cap message, got: ${msg}`
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TC-CBULK-UI: UI smoke
// ---------------------------------------------------------------------------
test.describe('TC-CBULK-UI: Customer Bulk Import UI', () => {
  test('TC-CBULK-UI-001: "Bulk Import" button is visible on Customers page', async ({ page }) => {
    await loginViaAPI(page);
    await page.goto('/customers');
    await page.waitForLoadState('networkidle');

    const bulkBtn = page.getByRole('button', { name: /bulk import/i });
    await expect(bulkBtn).toBeVisible({ timeout: 10000 });
  });

  test('TC-CBULK-UI-002: Bulk Import modal opens with file input and sample download', async ({
    page,
  }) => {
    await loginViaAPI(page);
    await page.goto('/customers');
    await page.waitForLoadState('networkidle');

    const bulkBtn = page.getByRole('button', { name: /bulk import/i });
    await bulkBtn.click();
    await page.waitForTimeout(500);

    // Modal should contain a file input
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });

    // Should have a download / sample link or button
    const downloadEl = page
      .getByRole('button', { name: /download/i })
      .or(page.getByRole('link', { name: /download/i }))
      .or(page.getByText(/download sample/i));
    await expect(downloadEl.first()).toBeVisible({ timeout: 5000 });
  });
});
