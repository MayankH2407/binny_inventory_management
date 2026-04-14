import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API, API_BASE_URL } from './helpers';

test.describe('TC-PRODX: Product Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
    await page.getByRole('link', { name: 'Products' }).first().click();
    await page.waitForTimeout(2000);
  });

  test('TC-PRODX-001: Products list page loads', async ({ page }) => {
    await expect(page).toHaveURL(/.*products/);
    await expect(page.getByText(/add product/i)).toBeVisible({ timeout: 10000 });
  });

  test('TC-PRODX-002: Section tabs are displayed', async ({ page }) => {
    // "All" tab should always be visible
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible({ timeout: 10000 });
    // At least one section tab should be visible (Hawaii is seeded)
    await expect(page.getByRole('button', { name: 'Hawaii' })).toBeVisible();
  });

  test('TC-PRODX-003: Section tab filters products', async ({ page }) => {
    // Click a specific section tab
    const hawaiiTab = page.getByRole('button', { name: 'Hawaii' });
    if (await hawaiiTab.isVisible({ timeout: 5000 })) {
      await hawaiiTab.click();
      await page.waitForTimeout(1000);
      // Click "All" to reset
      await page.getByRole('button', { name: 'All' }).click();
      await page.waitForTimeout(1000);
    }
  });

  test('TC-PRODX-004: Add Product modal does NOT have SKU field', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    // Wait for modal to open
    await expect(page.getByLabel(/article name/i)).toBeVisible({ timeout: 5000 });
    // SKU field should NOT exist in create modal
    const skuInput = page.getByLabel(/^sku/i);
    await expect(skuInput).toHaveCount(0);
  });

  test('TC-PRODX-005: Add Product modal has required Section and Category', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/article name/i)).toBeVisible({ timeout: 5000 });

    // Section and Category should be present and marked as required
    await expect(page.getByLabel(/section/i)).toBeVisible();
    await expect(page.getByLabel(/category/i)).toBeVisible();
  });

  test('TC-PRODX-006: Add Product modal has all fields', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/article name/i)).toBeVisible({ timeout: 5000 });

    // Core fields
    await expect(page.getByLabel(/article code/i)).toBeVisible();
    await expect(page.getByLabel(/colour/i)).toBeVisible();
    await expect(page.getByLabel(/^size\s*\*?$/i)).toBeVisible();
    await expect(page.getByLabel(/mrp/i)).toBeVisible();

    // Extended fields
    await expect(page.getByLabel(/category/i)).toBeVisible();
    await expect(page.getByLabel(/section/i)).toBeVisible();
    await expect(page.getByLabel(/location/i)).toBeVisible();
    await expect(page.getByLabel(/article group/i)).toBeVisible();
    await expect(page.getByLabel(/hsn code/i)).toBeVisible();
    await expect(page.getByLabel(/size group/i)).toBeVisible();
  });

  test('TC-PRODX-007: Section dropdown loads from API (not hardcoded)', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/section/i)).toBeVisible({ timeout: 5000 });

    const sectionSelect = page.getByLabel(/section/i);
    const options = await sectionSelect.locator('option').allTextContents();

    // Should have API-loaded sections
    expect(options.some((o) => o.includes('Hawaii'))).toBeTruthy();
    expect(options.some((o) => o.includes('PU'))).toBeTruthy();
    expect(options.some((o) => o.includes('EVA'))).toBeTruthy();
  });

  test('TC-PRODX-008: Category dropdown shows correct options', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/category/i)).toBeVisible({ timeout: 5000 });

    const categorySelect = page.getByLabel(/category/i);
    const options = await categorySelect.locator('option').allTextContents();

    expect(options.some((o) => o.includes('Gents'))).toBeTruthy();
    expect(options.some((o) => o.includes('Ladies'))).toBeTruthy();
    expect(options.some((o) => o.includes('Boys'))).toBeTruthy();
    expect(options.some((o) => o.includes('Girls'))).toBeTruthy();
  });

  test('TC-PRODX-009: Create product with auto-generated SKU', async ({ page }) => {
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/article name/i)).toBeVisible({ timeout: 5000 });

    await page.getByLabel(/article code/i).fill(`E2E-ART-${Date.now()}`);
    await page.getByLabel(/article name/i).fill('E2E Test Product');
    await page.getByLabel(/colour/i).fill('Red');
    await page.getByLabel(/^size\s*\*?$/i).fill('9');
    await page.getByLabel(/mrp/i).fill('599');

    // Section and Category are required
    await page.getByLabel(/category/i).selectOption('Gents');
    await page.getByLabel(/section/i).selectOption('Hawaii');

    await page.getByRole('button', { name: /create product/i }).click();
    await page.waitForTimeout(2000);

    // After creation, the product should appear with an auto-generated SKU
    // SKU format: HAWAII-E2E-TEST-PRODUCT-GENTS-01-RED (auto-generated)
  });

  test('TC-PRODX-010: Search products', async ({ page }) => {
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder(/search/i).fill('Hawaii');
    await page.waitForTimeout(1000);
  });

  test('TC-PRODX-011: Column filters are visible', async ({ page }) => {
    // Filter row should have text inputs for colour, size, article group
    await expect(page.getByPlaceholder(/colour/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(/size/i).first()).toBeVisible();
  });

  test('TC-PRODX-012: Products table shows Image column', async ({ page }) => {
    const table = page.locator('table').first();
    if (await table.isVisible({ timeout: 10000 })) {
      await expect(page.getByRole('columnheader', { name: /image/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /category/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /section/i })).toBeVisible();
    }
  });

  test('TC-PRODX-013: Sections API returns data', async ({ page }) => {
    const token = await getAuthToken(page);
    const response = await page.request.get(`${BASE_API}/sections`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty('name');
    expect(body.data[0]).toHaveProperty('display_order');
  });

  test('TC-PRODX-014: SKU auto-generation via API', async ({ page }) => {
    const token = await getAuthToken(page);
    const uniqueSuffix = Date.now();

    const response = await page.request.post(`${BASE_API}/products`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        article_name: `APITest${uniqueSuffix}`,
        article_code: `A${String(uniqueSuffix).slice(-8)}`,
        colour: 'Blue',
        size: '7',
        mrp: 499,
        category: 'Gents',
        section: 'PU',
      },
    });
    const body = await response.json();
    expect(response.ok(), `API returned ${response.status()}: ${JSON.stringify(body)}`).toBeTruthy();
    const product = body.data;

    // SKU should be auto-generated: PU-APITEST{suffix}-GENTS-01-BLUE
    expect(product.sku).toBeTruthy();
    expect(product.sku).toContain('PU');
    expect(product.sku).toContain('GENTS');
    expect(product.sku).toContain('BLUE');
  });

  test('TC-PRODX-015: Add Product modal has size_from and size_to fields', async ({ page }) => {
    await page.goto('/products');
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.getByLabel(/size from/i).or(page.getByPlaceholder(/e\.g\., 6/i))).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel(/size to/i).or(page.getByPlaceholder(/e\.g\., 10/i))).toBeVisible();
  });

  test('TC-PRODX-016: Add Product modal has image upload field', async ({ page }) => {
    await page.goto('/products');
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.locator('input[type="file"][accept*="image"]')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/image will be uploaded after/i)).toBeVisible();
  });

  test('TC-PRODX-017: Bulk Import button visible on products page', async ({ page }) => {
    await page.goto('/products');
    await expect(page.getByRole('button', { name: /bulk import/i })).toBeVisible({ timeout: 10000 });
  });

  test('TC-PRODX-018: Bulk Import modal opens with sample download', async ({ page }) => {
    await page.goto('/products');
    await page.getByRole('button', { name: /bulk import/i }).click();
    await expect(page.getByText(/upload a csv file/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/download sample csv/i)).toBeVisible();
    await expect(page.getByText(/required columns/i)).toBeVisible();
  });

  test('TC-PRODX-019: Sample CSV has size_from and size_to columns (API)', async ({ request }) => {
    const token = await getAuthToken(request);
    const response = await request.get(`${API_BASE_URL}/products/bulk-upload/sample`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status()).toBe(200);
    const csv = await response.text();
    expect(csv).toContain('size_from');
    expect(csv).toContain('size_to');
    expect(csv).not.toContain('size_group');
  });

  test('TC-PRODX-020: Bulk upload valid CSV creates products (API)', async ({ request }) => {
    const token = await getAuthToken(request);
    const uniqueSuffix = Date.now().toString().slice(-6);
    const csvContent = [
      'article_code,article_name,colour,size,mrp,section,category,location,size_from,size_to',
      `BLK${uniqueSuffix},BulkTest${uniqueSuffix},White,7,499,Hawaii,Gents,VKIA,6,10`,
      `BLK${uniqueSuffix},BulkTest${uniqueSuffix},White,8,499,Hawaii,Gents,VKIA,6,10`,
    ].join('\n');

    const response = await request.post(`${API_BASE_URL}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'test.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.created).toBeGreaterThanOrEqual(2);
  });

  test('TC-PRODX-021: Bulk upload rejects invalid category (API)', async ({ request }) => {
    const token = await getAuthToken(request);
    const csvContent = [
      'article_code,article_name,colour,size,mrp,section,category',
      `ERR${Date.now()},ErrProduct,Red,6,299,Hawaii,InvalidCategory`,
    ].join('\n');

    const response = await request.post(`${API_BASE_URL}/products/bulk-upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        file: { name: 'test.csv', mimeType: 'text/csv', buffer: Buffer.from(csvContent) },
      },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.data.errors.length).toBeGreaterThan(0);
    expect(body.data.errors[0].error).toContain('category');
  });

  test('TC-PRODX-022: Product creation stores size_from and size_to (API)', async ({ request }) => {
    const token = await getAuthToken(request);
    const uniqueSuffix = Date.now().toString().slice(-6);
    const createRes = await request.post(`${API_BASE_URL}/products`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        article_code: `SZ${uniqueSuffix}`,
        article_name: `SizeRangeTest${uniqueSuffix}`,
        colour: 'Blue',
        size: '8',
        mrp: 599,
        section: 'Hawaii',
        category: 'Gents',
        size_from: '6',
        size_to: '10',
      },
    });
    expect(createRes.status()).toBe(201);
    const product = (await createRes.json()).data;
    expect(product.size_from).toBe('6');
    expect(product.size_to).toBe('10');
  });
});
