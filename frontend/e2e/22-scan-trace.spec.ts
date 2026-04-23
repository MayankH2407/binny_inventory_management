/**
 * Phase 7: Scan & Trace — E2E Test Spec
 * TC-TRACE-CB-001 through TC-SCAN-E2E-005
 *
 * Coverage:
 *  - Section 1: Setup (product, child boxes in all three states: FREE, PACKED, DISPATCHED)
 *  - Section 2: API trace — child box barcodes in each state
 *  - Section 3: API trace — master carton barcodes
 *  - Section 4: E2E browser tests on /scan page
 *
 * IMPORTANT: Everything is wrapped in ONE top-level test.describe.serial so that
 * module-level state (tokens, resource IDs, barcodes) persists across all describe blocks.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

// ---------------------------------------------------------------------------
// Unique timestamp suffix
// ---------------------------------------------------------------------------
const TS = Date.now();

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------
let adminToken = '';
let freeBarcode = '';          // child box that was never packed
let packedBarcode = '';        // child box packed into an ACTIVE carton
let dispatchedBarcode = '';    // child box packed into a DISPATCHED carton
let activeCartonBarcode = '';  // carton that is ACTIVE (not yet closed)
let closedCartonBarcode = '';  // carton that is CLOSED but not dispatched
let dispatchedCartonBarcode = ''; // carton that has been DISPATCHED

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data.accessToken;
}

// ===========================================================================
// ONE top-level serial describe
// ===========================================================================

test.describe.serial('Scan & Trace Suite', () => {

  // =========================================================================
  // SECTION 1 — Setup: create items in all states
  // =========================================================================

  test.describe('Setup: Create product, child boxes, cartons in all states', () => {

    test('TC-SETUP-TRACE-001: Login as admin', async ({ request }) => {
      adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
      expect(adminToken).toBeTruthy();
    });

    test('TC-SETUP-TRACE-002: Create product', async ({ request }) => {
      const res = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          article_name: `TraceTestProd-${TS}`,
          article_code: `TR${String(TS).slice(-6)}`,
          colour: 'Blue',
          size: '9',
          category: 'Gents',
          section: 'Hawaii',
          mrp: 349,
        },
      });
      expect(res.status()).toBe(201);
    });

    test('TC-SETUP-TRACE-003: Create FREE child box (not packed)', async ({ request }) => {
      // Create a product to bind boxes to
      const prodRes = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          article_name: `TraceFree-${TS}`,
          article_code: `TF${String(TS).slice(-6)}`,
          colour: 'Red',
          size: '7',
          category: 'Ladies',
          section: 'PU',
          mrp: 199,
        },
      });
      const prodBody = await prodRes.json();
      const prodId = prodBody.data.id || prodBody.data._id || prodBody.data.productId;

      // Create 1 free child box
      const res = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { product_id: prodId, count: 1, quantity: 1 },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      freeBarcode = body.data[0].barcode;
      expect(freeBarcode).toBeTruthy();
    });

    test('TC-SETUP-TRACE-004: Create PACKED child box (in ACTIVE carton)', async ({ request }) => {
      // Product for packed boxes
      const prodRes = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          article_name: `TracePacked-${TS}`,
          article_code: `TP${String(TS).slice(-6)}`,
          colour: 'Green',
          size: '8',
          category: 'Gents',
          section: 'Hawaii',
          mrp: 249,
        },
      });
      const prodBody = await prodRes.json();
      const prodId = prodBody.data.id || prodBody.data._id || prodBody.data.productId;

      // Create 2 child boxes — pack them into an ACTIVE carton (do NOT close)
      const bulkRes = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { product_id: prodId, count: 2, quantity: 1 },
      });
      expect(bulkRes.status()).toBe(201);
      const barcodes: string[] = (await bulkRes.json()).data.map((cb: { barcode: string }) => cb.barcode);
      packedBarcode = barcodes[0];

      // Create carton with these boxes (stays ACTIVE — not closed)
      const cartonRes = await request.post(`${BASE_API}/master-cartons`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { child_box_barcodes: barcodes, max_capacity: 50 },
      });
      expect(cartonRes.status()).toBe(201);
      const cartonBody = await cartonRes.json();
      activeCartonBarcode = cartonBody.data.carton_barcode || cartonBody.data.barcode;
      expect(activeCartonBarcode).toBeTruthy();
      expect(packedBarcode).toBeTruthy();
    });

    test('TC-SETUP-TRACE-005: Create DISPATCHED child box + closed and dispatched cartons', async ({ request }) => {
      // Product for dispatched boxes
      const prodRes = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          article_name: `TraceDisp-${TS}`,
          article_code: `TD${String(TS).slice(-6)}`,
          colour: 'White',
          size: '10',
          category: 'Gents',
          section: 'PU',
          mrp: 399,
        },
      });
      const prodBody = await prodRes.json();
      const prodId = prodBody.data.id || prodBody.data._id || prodBody.data.productId;

      // Create 3 child boxes — pack into carton, close it, dispatch it
      const bulkRes = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { product_id: prodId, count: 3, quantity: 1 },
      });
      expect(bulkRes.status()).toBe(201);
      const barcodes: string[] = (await bulkRes.json()).data.map((cb: { barcode: string }) => cb.barcode);
      dispatchedBarcode = barcodes[0];

      // Create + close carton (closed state)
      const cartonRes = await request.post(`${BASE_API}/master-cartons`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { child_box_barcodes: barcodes, max_capacity: 50 },
      });
      expect(cartonRes.status()).toBe(201);
      const cartonData = (await cartonRes.json()).data;
      const cartonId = cartonData.id || cartonData._id;
      closedCartonBarcode = cartonData.carton_barcode || cartonData.barcode;

      const closeRes = await request.post(`${BASE_API}/master-cartons/${cartonId}/close`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(closeRes.status()).toBe(200);

      // Create a customer for dispatch. Use Primary Dealer (Sub Dealer requires primary_dealer_id).
      const custRes = await request.post(`${BASE_API}/customers`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          firm_name: `TraceTestCust-${TS}`,
          customer_type: 'Primary Dealer',
          contact_person_name: 'Trace Tester',
          contact_person_mobile: '9000000001',
        },
      });
      expect(custRes.ok()).toBeTruthy();
      const custBody = await custRes.json();
      const custId = custBody.data.id || custBody.data._id || custBody.data.customerId;

      // Dispatch the closed carton
      const dispRes = await request.post(`${BASE_API}/dispatches`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          master_carton_ids: [cartonId],
          customer_id: custId,
          destination: 'Delhi',
          transport_details: 'By Train',
          vehicle_number: 'DL01AB5678',
          dispatch_date: '2026-04-17T00:00:00.000Z',
        },
      });
      expect(dispRes.status()).toBe(201);

      // Now fetch the carton to get the barcode of the dispatched carton
      const fetchRes = await request.get(`${BASE_API}/master-cartons/${cartonId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const fetchBody = await fetchRes.json();
      dispatchedCartonBarcode = fetchBody.data.carton_barcode || fetchBody.data.barcode || closedCartonBarcode;

      expect(dispatchedBarcode).toBeTruthy();
      expect(closedCartonBarcode).toBeTruthy();
    });
  });

  // =========================================================================
  // SECTION 2 — API trace: child box barcodes
  // =========================================================================

  test.describe('TC-TRACE-CB: Tracing child box barcodes via API', () => {

    test('TC-TRACE-CB-001: Trace FREE child box → childBox data, no masterCarton, timeline has CHILD_CREATED', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/trace/${freeBarcode}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Child box should be present
      expect(body.data.childBox).toBeDefined();
      expect(body.data.childBox.barcode).toBe(freeBarcode);
      // Master carton should be absent (not packed)
      const hasMasterCarton =
        body.data.masterCarton !== undefined && body.data.masterCarton !== null;
      expect(hasMasterCarton).toBeFalsy();
      // Timeline should contain CHILD_CREATED event
      expect(Array.isArray(body.data.timeline)).toBeTruthy();
      const events: string[] = body.data.timeline.map(
        (e: { event?: string; type?: string; action?: string }) =>
          e.event || e.type || e.action || '',
      );
      expect(events.some((e) => /CHILD_CREATED|CREATED/i.test(e))).toBeTruthy();
    });

    test('TC-TRACE-CB-002: Trace PACKED child box → childBox + masterCarton, timeline has CHILD_PACKED', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/trace/${packedBarcode}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Child box present
      expect(body.data.childBox).toBeDefined();
      expect(body.data.childBox.barcode).toBe(packedBarcode);
      // Master carton present (box is packed)
      expect(body.data.masterCarton).toBeDefined();
      expect(body.data.masterCarton).not.toBeNull();
      // Timeline should contain packed event
      const events: string[] = body.data.timeline.map(
        (e: { event?: string; type?: string; action?: string }) =>
          e.event || e.type || e.action || '',
      );
      expect(events.some((e) => /CHILD_PACKED|PACKED/i.test(e))).toBeTruthy();
    });

    test('TC-TRACE-CB-003: Trace DISPATCHED child box → childBox + masterCarton + dispatch, full timeline', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/trace/${dispatchedBarcode}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.childBox).toBeDefined();
      expect(body.data.masterCarton).toBeDefined();
      // Dispatch info must be present
      expect(body.data.dispatch).toBeDefined();
      expect(body.data.dispatch).not.toBeNull();
      // Timeline should have multiple events
      expect(body.data.timeline.length).toBeGreaterThanOrEqual(2);
    });

    test('TC-TRACE-CB-004: Trace returns article_name, colour, size, mrp on childBox', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/trace/${freeBarcode}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      const cb = body.data.childBox;

      // Product fields should be embedded or accessible
      const hasProductFields =
        cb.article_name !== undefined ||
        cb.product !== undefined ||
        (cb.product_id !== undefined && cb.mrp !== undefined);
      expect(hasProductFields).toBeTruthy();
    });

    test('TC-TRACE-CB-005: Trace non-existent barcode → 404', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/trace/NONEXISTENT-BARCODE-XYZ-${TS}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 3 — API trace: master carton barcodes
  // =========================================================================

  test.describe('TC-TRACE-MC: Tracing master carton barcodes via API', () => {

    test('TC-TRACE-MC-001: Trace ACTIVE master carton → masterCarton data', async ({ request }) => {
      const res = await request.get(`${BASE_API}/inventory/trace/${activeCartonBarcode}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.masterCarton).toBeDefined();
      expect(body.data.masterCarton.status).toBe('ACTIVE');
      // No childBox field for a carton trace
      expect(body.data.childBox).toBeUndefined();
    });

    test('TC-TRACE-MC-002: Trace CLOSED carton → status CLOSED', async ({ request }) => {
      // The closed carton was subsequently dispatched; use dispatchedCartonBarcode which was closed then dispatched.
      // For a purely CLOSED carton, we re-use closedCartonBarcode which was the barcode before dispatch.
      // After dispatch, the carton status changes to DISPATCHED so we test dispatchedCartonBarcode for status instead.
      // Create a new closed-but-not-dispatched carton specifically for this test:
      const prodRes = await request.post(`${BASE_API}/products`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: {
          article_name: `TraceClosed-${TS}`,
          article_code: `TC${String(TS).slice(-6)}`,
          colour: 'Yellow',
          size: '6',
          category: 'Ladies',
          section: 'Hawaii',
          mrp: 149,
        },
      });
      const prodId = (await prodRes.json()).data.id;

      const bulkRes = await request.post(`${BASE_API}/child-boxes/bulk`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { product_id: prodId, count: 2, quantity: 1 },
      });
      const barcodes: string[] = (await bulkRes.json()).data.map((cb: { barcode: string }) => cb.barcode);

      const cartonRes = await request.post(`${BASE_API}/master-cartons`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { child_box_barcodes: barcodes, max_capacity: 50 },
      });
      const cartonData = (await cartonRes.json()).data;
      const cartonId = cartonData.id || cartonData._id;
      const newClosedBarcode = cartonData.carton_barcode || cartonData.barcode;

      await request.post(`${BASE_API}/master-cartons/${cartonId}/close`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      const res = await request.get(`${BASE_API}/inventory/trace/${newClosedBarcode}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.data.masterCarton.status).toBe('CLOSED');
    });

    test('TC-TRACE-MC-003: Trace DISPATCHED carton → includes dispatch info', async ({ request }) => {
      const barcode = dispatchedCartonBarcode || closedCartonBarcode;
      const res = await request.get(`${BASE_API}/inventory/trace/${barcode}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.masterCarton).toBeDefined();
      // Dispatch info should be present
      expect(body.data.dispatch).toBeDefined();
      expect(body.data.dispatch).not.toBeNull();
    });
  });

  // =========================================================================
  // SECTION 4 — E2E browser tests on /scan page
  // =========================================================================

  test.describe('TC-SCAN-E2E: Browser tests for Scan & Trace page', () => {

    test('TC-SCAN-E2E-001: Scan page loads with "Scan & Trace" heading', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/scan');
      await page.waitForLoadState('networkidle');

      await expect(page.getByText('Scan & Trace').first()).toBeVisible({ timeout: 15000 });
    });

    test('TC-SCAN-E2E-002: Manual entry input and Trace/Look Up button visible', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/scan');
      await page.waitForLoadState('networkidle');

      // Manual entry input
      const input = page.getByPlaceholder(/enter barcode|barcode/i).first();
      await expect(input).toBeVisible({ timeout: 10000 });

      // Trace/Look Up button
      const traceBtn = page.getByRole('button', { name: /trace|look up/i }).first();
      await expect(traceBtn).toBeVisible({ timeout: 10000 });
    });

    test('TC-SCAN-E2E-003: Enter barcode → child box card shows with key fields', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/scan');
      await page.waitForLoadState('networkidle');

      const input = page.getByPlaceholder(/enter barcode|barcode/i).first();
      await input.fill(freeBarcode);

      const traceBtn = page.getByRole('button', { name: /trace|look up/i }).first();
      await traceBtn.click();

      // Child Box card should appear
      await expect(page.getByText('Child Box').first()).toBeVisible({ timeout: 15000 });

      // Barcode should be shown in results (multiple occurrences possible — header + timeline)
      await expect(page.getByText(freeBarcode).first()).toBeVisible({ timeout: 10000 });
    });

    test('TC-SCAN-E2E-004: Non-existent barcode → error message shown', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/scan');
      await page.waitForLoadState('networkidle');

      const input = page.getByPlaceholder(/enter barcode|barcode/i).first();
      await input.fill(`NO-SUCH-BARCODE-${TS}`);

      const traceBtn = page.getByRole('button', { name: /trace|look up/i }).first();
      await traceBtn.click();

      // Error toast or message should appear
      await expect(
        page.getByText(/not found|error|no item|could not/i).first(),
      ).toBeVisible({ timeout: 15000 });
    });

    test('TC-SCAN-E2E-005: Clear button resets results', async ({ page }) => {
      await page.addInitScript(
        ({ token, email }) => {
          localStorage.setItem('binny_token', token);
          localStorage.setItem('binny_user', JSON.stringify({ email, role: 'Admin' }));
        },
        { token: adminToken, email: ADMIN_EMAIL },
      );

      await page.goto('/scan');
      await page.waitForLoadState('networkidle');

      // Perform a successful lookup first
      const input = page.getByPlaceholder(/enter barcode|barcode/i).first();
      await input.fill(freeBarcode);
      await page.getByRole('button', { name: /trace|look up/i }).first().click();

      // Wait for results
      await expect(page.getByText('Child Box').first()).toBeVisible({ timeout: 15000 });

      // Click clear/reset button
      const clearBtn = page.getByRole('button', { name: /clear|reset|scan another/i }).first();
      await expect(clearBtn).toBeVisible({ timeout: 10000 });
      await clearBtn.click();

      // Empty state should reappear
      await expect(
        page.getByText(/scan or enter a barcode|scan a barcode|enter a barcode/i).first(),
      ).toBeVisible({ timeout: 10000 });
    });
  });

}); // end test.describe.serial('Scan & Trace Suite')
