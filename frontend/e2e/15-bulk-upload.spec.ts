import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

const EXPECTED_COLUMNS = [
  'article_code',
  'article_name',
  'colour',
  'size',
  'mrp',
  'section',
  'category',
  'location',
  'description',
  'article_group',
  'hsn_code',
  'size_from',
  'size_to',
];

test.describe('TC-BULK: CSV Bulk Product Upload', () => {
  test('TC-BULK-001: GET /products/bulk-upload/sample returns valid CSV with correct Content-Type header', async ({
    page,
  }) => {
    const token = await getAuthToken(page);
    const response = await page.request.get(`${BASE_API}/products/bulk-upload/sample`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.ok(), `Expected 200 but got ${response.status()}`).toBeTruthy();

    const contentType = response.headers()['content-type'] ?? '';
    expect(
      contentType.includes('text/csv') || contentType.includes('application/octet-stream'),
      `Expected CSV content-type but got: ${contentType}`
    ).toBeTruthy();

    const body = await response.text();
    expect(body.trim().length).toBeGreaterThan(0);
  });

  test('TC-BULK-002: Sample CSV contains all 13 expected columns including size_from, size_to', async ({
    page,
  }) => {
    const token = await getAuthToken(page);
    const response = await page.request.get(`${BASE_API}/products/bulk-upload/sample`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.ok()).toBeTruthy();

    const body = await response.text();
    // First line of the CSV is the header row
    const headerLine = body.trim().split('\n')[0];
    const columns = headerLine.split(',').map((c) => c.trim().replace(/\r/g, ''));

    for (const col of EXPECTED_COLUMNS) {
      expect(
        columns.includes(col),
        `Expected column "${col}" in sample CSV header. Found: ${columns.join(', ')}`
      ).toBeTruthy();
    }

    expect(columns.length).toBe(13);
  });

  test('TC-BULK-003: POST /products/bulk-upload with valid CSV creates products', async ({
    page,
  }) => {
    const token = await getAuthToken(page);
    const ts = Date.now();

    const csvContent = [
      'article_code,article_name,colour,size,mrp,section,category,location,description,article_group,hsn_code,size_from,size_to',
      `BULK-${ts}-A,BulkTest Product A,Black,8,499,Hawaii,Gents,VKIA,Test desc A,GroupA,6403,6,10`,
      `BULK-${ts}-B,BulkTest Product B,White,6,399,PU,Ladies,MIA,Test desc B,GroupB,6403,4,8`,
    ].join('\n');

    const response = await page.request.post(`${BASE_API}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'test.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent),
        },
      },
    });

    const body = await response.json();
    expect(
      response.ok(),
      `Bulk upload failed: ${response.status()} — ${JSON.stringify(body)}`
    ).toBeTruthy();

    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('created');
    expect(body.data.created).toBeGreaterThanOrEqual(2);
  });

  test('TC-BULK-004: Bulk upload rejects CSV missing required columns', async ({ page }) => {
    const token = await getAuthToken(page);

    // Only article_code and colour — missing article_name, size, mrp, section, category
    const csvContent = ['article_code,colour', 'BULK-MISSING-001,Red'].join('\n');

    const response = await page.request.post(`${BASE_API}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'missing_cols.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent),
        },
      },
    });

    // Should be a 400-level error (missing required columns is a structural error)
    expect(response.ok()).toBeFalsy();
    const body = await response.json();
    // The response should indicate an error about missing/required columns
    expect(
      body.success === false || body.error || body.message,
      `Expected an error response, got: ${JSON.stringify(body)}`
    ).toBeTruthy();
  });

  test('TC-BULK-005: Bulk upload rejects empty CSV (headers only, no data rows)', async ({
    page,
  }) => {
    const token = await getAuthToken(page);

    // Valid headers but zero data rows
    const csvContent =
      'article_code,article_name,colour,size,mrp,section,category,location,description,article_group,hsn_code,size_from,size_to';

    const response = await page.request.post(`${BASE_API}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'empty.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent),
        },
      },
    });

    // Server should reject a file with no data rows
    expect(response.ok()).toBeFalsy();
    const body = await response.json();
    expect(
      body.success === false || body.error || body.message,
      `Expected an error response for empty CSV, got: ${JSON.stringify(body)}`
    ).toBeTruthy();
  });

  test('TC-BULK-006: Bulk upload reports invalid category as row error', async ({ page }) => {
    const token = await getAuthToken(page);
    const ts = Date.now();

    // category "Invalid" is not one of: Gents, Ladies, Boys, Girls
    const csvContent = [
      'article_code,article_name,colour,size,mrp,section,category,location,description,article_group,hsn_code,size_from,size_to',
      `BULK-BADCAT-${ts},Bad Category Product,Blue,9,299,Hawaii,Invalid,VKIA,,,6403,,`,
    ].join('\n');

    const response = await page.request.post(`${BASE_API}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'bad_category.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent),
        },
      },
    });

    const body = await response.json();

    // The API may return 200 with row-level errors OR a 4xx
    if (response.ok()) {
      // Row-level error reporting: errors array should contain an entry for row 2
      expect(body.data).toHaveProperty('errors');
      expect(Array.isArray(body.data.errors)).toBeTruthy();
      expect(body.data.errors.length).toBeGreaterThan(0);
      const rowError = body.data.errors[0];
      expect(rowError.status).toBe('error');
    } else {
      // Or the whole request is rejected
      expect(
        body.success === false || body.error || body.message,
        `Expected error response, got: ${JSON.stringify(body)}`
      ).toBeTruthy();
    }
  });

  test('TC-BULK-007: Bulk upload reports negative MRP as row error', async ({ page }) => {
    const token = await getAuthToken(page);
    const ts = Date.now();

    // mrp of -100 is invalid (must be positive)
    const csvContent = [
      'article_code,article_name,colour,size,mrp,section,category,location,description,article_group,hsn_code,size_from,size_to',
      `BULK-BADMRP-${ts},Negative MRP Product,Green,7,-100,PU,Boys,VKIA,,,6403,,`,
    ].join('\n');

    const response = await page.request.post(`${BASE_API}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: {
          name: 'bad_mrp.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(csvContent),
        },
      },
    });

    const body = await response.json();

    // The API may return 200 with row-level errors OR a 4xx
    if (response.ok()) {
      expect(body.data).toHaveProperty('errors');
      expect(Array.isArray(body.data.errors)).toBeTruthy();
      expect(body.data.errors.length).toBeGreaterThan(0);
      const rowError = body.data.errors[0];
      expect(rowError.status).toBe('error');
    } else {
      expect(
        body.success === false || body.error || body.message,
        `Expected error response for negative MRP, got: ${JSON.stringify(body)}`
      ).toBeTruthy();
    }
  });

  test('TC-BULK-008: Bulk Import modal opens on Products page', async ({ page }) => {
    await loginViaAPI(page);

    // Navigate to Products page via sidebar
    await page.getByRole('link', { name: 'Products' }).first().click();
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/.*products/, { timeout: 10000 });

    // The "Bulk Import" button should be visible on the Products page
    const bulkImportButton = page.getByRole('button', { name: /bulk import/i });
    await expect(bulkImportButton).toBeVisible({ timeout: 10000 });

    // Click to open the modal
    await bulkImportButton.click();
    await page.waitForTimeout(500);

    // Modal should appear with a "Download" (sample CSV) link/button
    const downloadElement = page.getByRole('button', { name: /download/i }).or(
      page.getByRole('link', { name: /download/i })
    );
    await expect(downloadElement.first()).toBeVisible({ timeout: 5000 });

    // Modal should contain a file input for CSV upload
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached({ timeout: 5000 });
  });
});
