import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

test.describe('TC-LIFE: Lifecycle Workflows (Storage, Unpack, Dispatch)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-STORE-001: Storage page loads', async ({ page }) => {
    await page.goto('/storage');
    await expect(page.getByText(/Storage|Close & Store/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/barcode/i).first()).toBeVisible();
  });

  test('TC-UNPACK-001: Unpack page loads', async ({ page }) => {
    await page.goto('/unpack');
    await expect(page.getByText(/Unpack/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/barcode/i).first()).toBeVisible();
  });

  test('TC-REPACK-001: Repack page loads', async ({ page }) => {
    await page.goto('/repack');
    await expect(page.getByText(/Repack/i).first()).toBeVisible();
    await expect(page.getByText(/Source/i).first()).toBeVisible();
  });

  test('TC-DISP-001: Dispatch page loads', async ({ page }) => {
    await page.goto('/dispatch');
    await expect(page.getByText(/Dispatch/i).first()).toBeVisible();
    await expect(page.getByText(/Dispatch Details/i)).toBeVisible();
  });

  test('TC-DISP-002: Dispatch page has required fields', async ({ page }) => {
    await page.goto('/dispatch');

    await expect(page.getByLabel(/Destination/i)).toBeVisible();
    await expect(page.getByLabel(/Vehicle Number/i)).toBeVisible();
    await expect(page.getByText(/Scan Master Cartons/i)).toBeVisible();
  });

  test('TC-DISP-003: Dispatches list page loads', async ({ page }) => {
    await page.goto('/dispatches');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Dispatch/i).first()).toBeVisible();
  });

  test('TC-LIFE-001: Full lifecycle via API + verify in UI', async ({ page }) => {
    const token = await getAuthToken(page);

    // Step 1: Ensure we have free boxes (create some)
    const productsResponse = await page.request.get(`${BASE_API}/products?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const products = await productsResponse.json();
    const productId = products.data[0].id;

    await page.request.post(`${BASE_API}/child-boxes/bulk`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { product_id: productId, count: 2 },
    });

    // Step 2: Get free boxes
    const freeResponse = await page.request.get(`${BASE_API}/child-boxes?status=FREE&limit=2`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const freeBoxes = await freeResponse.json();
    const barcodes = freeBoxes.data.slice(0, 2).map((cb: { barcode: string }) => cb.barcode);

    // Step 3: Create carton with boxes
    const createResponse = await page.request.post(`${BASE_API}/master-cartons`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { max_capacity: 24, child_box_barcodes: barcodes },
    });
    const carton = (await createResponse.json()).data;
    expect(carton.status).toBe('ACTIVE');
    expect(carton.child_count).toBe(barcodes.length);

    // Step 4: Close carton (storage)
    const closeResponse = await page.request.post(
      `${BASE_API}/master-cartons/${carton.id}/close`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const closedCarton = (await closeResponse.json()).data;
    expect(closedCarton.status).toBe('CLOSED');

    // Step 5: Dispatch
    const dispatchResponse = await page.request.post(`${BASE_API}/dispatches`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        master_carton_ids: [carton.id],
        destination: 'E2E Test Warehouse',
        vehicle_number: 'E2E-TEST-001',
      },
    });
    expect(dispatchResponse.ok()).toBeTruthy();

    // Step 6: Verify in UI - navigate to master cartons
    await page.goto(`/master-cartons/${carton.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Dispatched').first()).toBeVisible({ timeout: 10000 });

    // Step 7: Verify traceability
    await page.goto(`/traceability?qr=${barcodes[0]}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/Child Box|Timeline/i).first()).toBeVisible({ timeout: 10000 });
  });
});
