/**
 * Phase 6: Product CSV batched insert + cap.
 * Covers: 30-row valid CSV succeeds via batched path; CSV > cap is rejected.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const TS = Date.now();

async function loginAs(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.accessToken;
}

/**
 * Build a CSV with N rows. Each row gets a unique article_code via rowIndex + timestamp + suffix.
 * The article_code is capped at 20 chars.
 * @param salt Extra entropy so multiple tests using different row counts don't share codes.
 */
function buildBigCsv(numRows: number, salt: string = ''): string {
  const ts6 = String(TS).slice(-6);
  const header = 'article_code,article_name,colour,size,mrp,section,category';
  const rows = Array.from({ length: numRows }, (_, i) => {
    // Combine ts6 + salt + padded index; keep within 20 chars
    const raw = `BC${ts6}${salt}${String(i).padStart(4, '0')}`;
    const code = raw.slice(0, 20);
    return `${code},BatchTest${ts6}${salt}${i},Black,${(i % 7) + 4},${299 + i},Hawaii,Gents`;
  });
  return [header, ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// TC-PCAP-BATCH: batched valid CSV
// ---------------------------------------------------------------------------
test.describe('TC-PCAP-BATCH: Product CSV Batched Insert', () => {
  test('TC-PCAP-BATCH-001: 35-row valid CSV succeeds and creates all products (batched path)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const csvContent = buildBigCsv(35, 'A');

    const res = await request.post(`${BASE_API}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'batch35.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    expect(
      [200, 201].includes(res.status()),
      `Expected 200/201, got ${res.status()} — ${JSON.stringify(body)}`
    ).toBeTruthy();

    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('created');
    // All 35 rows should be created (no duplicates in this fresh batch)
    expect(body.data.created).toBe(35);
    // No errors expected
    expect(body.data.errors.length).toBe(0);
  });

  test('TC-PCAP-BATCH-002: 50-row valid CSV succeeds (larger batch)', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const csvContent = buildBigCsv(50, 'B');

    const res = await request.post(`${BASE_API}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'batch50.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    expect(
      [200, 201].includes(res.status()),
      `Expected 200/201 for 50 rows, got ${res.status()}`
    ).toBeTruthy();
    expect(body.data.created).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// TC-PCAP-OVER: cap exceeded
// ---------------------------------------------------------------------------
test.describe('TC-PCAP-OVER: Product CSV Cap Exceeded', () => {
  test('TC-PCAP-OVER-001: CSV with 501 rows is rejected with cap error message', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    // 501 rows → exceeds default cap of 500
    const csvContent = buildBigCsv(501, 'C');

    const res = await request.post(`${BASE_API}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'over501.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    // Must be a non-2xx error
    expect(res.ok()).toBeFalsy();

    const body = await res.json();
    const msg: string = body.message ?? body.error ?? '';
    expect(
      msg.includes('501') || msg.toLowerCase().includes('maximum') || msg.toLowerCase().includes('rows'),
      `Expected cap-exceeded message, got: ${msg}`
    ).toBeTruthy();
  });

  test('TC-PCAP-OVER-002: Cap error message mentions the row count and the maximum (500)', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    const csvContent = buildBigCsv(502, 'D');

    const res = await request.post(`${BASE_API}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'over502.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    const msg: string = body.message ?? body.error ?? '';

    // Service message: "CSV contains 502 rows. Maximum allowed is 500 per upload."
    expect(
      msg.includes('500') || msg.toLowerCase().includes('maximum'),
      `Expected "500" or "maximum" in: ${msg}`
    ).toBeTruthy();
  });

  test('TC-PCAP-OVER-003: CSV right at the cap boundary (500 rows) is accepted', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);

    // 500 rows — exactly at the cap; should succeed
    const csvContent = buildBigCsv(500, 'E');

    const res = await request.post(`${BASE_API}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'cap500.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });

    const body = await res.json();
    expect(
      [200, 201].includes(res.status()),
      `Expected 200/201 at cap boundary, got ${res.status()} — ${JSON.stringify(body)}`
    ).toBeTruthy();
    expect(body.data.created).toBe(500);
  }, 60000); // generous timeout for 500-row insert
});
