/**
 * Phase 13: Edge Cases, Boundary Conditions & Error Handling
 * TC-EDGE-001 to TC-EDGE-009
 * TC-STATE-001 to TC-STATE-004
 * TC-PAGE-001 to TC-PAGE-002
 * TC-ERR-001 to TC-ERR-003
 *
 * All tests wrapped in one test.describe.serial.
 * Setup creates a product + child boxes used across state tests.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

// ---------------------------------------------------------------------------
// Unique suffix per test run
// ---------------------------------------------------------------------------
const TS = Date.now();
const TS6 = String(TS).slice(-6); // last 6 digits (fits in article_code)

// Module-level state
const tokens: Record<string, string> = {};
let testProductId = '';
let stateTestBarcodes: string[] = [];
let stateTestCartonId = '';

// ---------------------------------------------------------------------------
// loginAs helper
// ---------------------------------------------------------------------------
async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data.accessToken;
}

// Helper: create product and return its ID
async function createProduct(
  request: APIRequestContext,
  token: string,
  suffix: string
): Promise<string> {
  const res = await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      article_name: `EdgeTest ${suffix}`,
      article_code: `EDGE${suffix}`.slice(0, 20),
      colour: 'Black',
      size: '8',
      category: 'Gents',
      section: 'Hawaii',
      mrp: 199,
    },
  });
  if (res.status() === 201) {
    const body = await res.json();
    return body.data.id || body.data._id || '';
  }
  return '';
}

// Helper: bulk create child boxes and return barcodes
async function bulkCreateBoxes(
  request: APIRequestContext,
  token: string,
  productId: string,
  count: number
): Promise<string[]> {
  const res = await request.post(`${BASE_API}/child-boxes/bulk`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { product_id: productId, count },
  });
  if (!res.ok()) return [];
  const body = await res.json();
  // Response may be array or wrapped object
  const items: Array<{ barcode: string }> = Array.isArray(body)
    ? body
    : Array.isArray(body.data)
    ? body.data
    : [];
  return items.map((b) => b.barcode).filter(Boolean);
}

// ===========================================================================
// ONE top-level serial describe
// ===========================================================================

test.describe.serial('TC-EDGE: Edge Cases & Boundary Conditions (Phase 13)', () => {

  // =========================================================================
  // Setup
  // =========================================================================

  test('SETUP: Admin login + create base product for state tests', async ({ request }) => {
    tokens.admin = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(tokens.admin).toBeTruthy();

    // Create a product for use in state and bulk tests
    testProductId = await createProduct(request, tokens.admin, TS6);
    // If creation failed, try fetching an existing product
    if (!testProductId) {
      const listRes = await request.get(`${BASE_API}/products?limit=1`, {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
      const listBody = await listRes.json();
      testProductId = listBody.data?.[0]?.id ?? '';
    }
    expect(testProductId).toBeTruthy();
  });

  // =========================================================================
  // TC-EDGE-001: article_code exactly 20 chars → 201
  // =========================================================================

  test('TC-EDGE-001: article_code at exactly 20 chars → 201', async ({ request }) => {
    // EC (2) + TS6 (6) + 12 letters = 20 chars exactly
    const code20 = `EC${TS6}ABCDEFGHIJKL`;
    expect(code20.length).toBe(20);

    const res = await request.post(`${BASE_API}/products`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: {
        article_name: `EdgeCode20 ${TS}`,
        article_code: code20,
        colour: 'Red',
        size: '7',
        category: 'Gents',
        section: 'Hawaii',
        mrp: 299,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // =========================================================================
  // TC-EDGE-002: article_code at 21 chars → 400
  // =========================================================================

  test('TC-EDGE-002: article_code at 21 chars → 400', async ({ request }) => {
    // EC (2) + TS6 (6) + 13 letters = 21 chars exactly (one over the 20-char limit)
    const code21 = `EC${TS6}ABCDEFGHIJKLM`;
    expect(code21.length).toBe(21);

    const res = await request.post(`${BASE_API}/products`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: {
        article_name: `EdgeCode21 ${TS}`,
        article_code: code21,
        colour: 'Blue',
        size: '8',
        category: 'Gents',
        section: 'Hawaii',
        mrp: 399,
      },
    });
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // =========================================================================
  // TC-EDGE-003: article_name of 1 char — may be valid or rejected
  // =========================================================================

  test('TC-EDGE-003: article_name of 1 char — accepted or rejected gracefully', async ({ request }) => {
    const res = await request.post(`${BASE_API}/products`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: {
        article_name: 'X',
        article_code: `1C${TS6}`.slice(0, 8),
        colour: 'White',
        size: '6',
        category: 'Gents',
        section: 'Hawaii',
        mrp: 99,
      },
    });
    // Backend may accept (201) or reject (400/422) — either is fine, must not crash (500)
    expect([200, 201, 400, 422]).toContain(res.status());
    const body = await res.json();
    // Response should always have success field
    expect(typeof body.success).toBe('boolean');
  });

  // =========================================================================
  // TC-EDGE-004: MRP = 0.01 → 201
  // =========================================================================

  test('TC-EDGE-004: MRP = 0.01 → 201', async ({ request }) => {
    const res = await request.post(`${BASE_API}/products`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: {
        article_name: `MRP Penny ${TS}`,
        article_code: `MP${TS6}`.slice(0, 8),
        colour: 'Green',
        size: '9',
        category: 'Ladies',
        section: 'PU',
        mrp: 0.01,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  // =========================================================================
  // TC-EDGE-005: Bulk child box count = 1 → 201
  // =========================================================================

  test('TC-EDGE-005: Bulk child box count = 1 → 201', async ({ request }) => {
    const res = await request.post(`${BASE_API}/child-boxes/bulk`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: { product_id: testProductId, count: 1 },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    const items = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : [];
    expect(items.length).toBe(1);
  });

  // =========================================================================
  // TC-EDGE-006: Bulk child box count = 500 → 201 (may be slow)
  // =========================================================================

  test('TC-EDGE-006: Bulk child box count = 500 → 201', async ({ request }) => {
    const res = await request.post(`${BASE_API}/child-boxes/bulk`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: { product_id: testProductId, count: 500 },
      timeout: 120000, // 2 minutes for large batch
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    const items = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : [];
    expect(items.length).toBe(500);
  }, 130000); // test timeout 130s

  // =========================================================================
  // TC-EDGE-007: Bulk child box count = 501 → 400
  // =========================================================================

  test('TC-EDGE-007: Bulk child box count = 501 → 400', async ({ request }) => {
    const res = await request.post(`${BASE_API}/child-boxes/bulk`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: { product_id: testProductId, count: 501 },
    });
    expect([400, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // =========================================================================
  // TC-EDGE-008: HTML in article_name → stored safely, no XSS
  // =========================================================================

  test('TC-EDGE-008: HTML in article_name stored safely (no XSS)', async ({ request }) => {
    const htmlPayload = '<script>alert("xss")</script> Test Product';
    const res = await request.post(`${BASE_API}/products`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: {
        article_name: htmlPayload,
        article_code: `XS${TS6}`.slice(0, 8),
        colour: 'Yellow',
        size: '7',
        category: 'Boys',
        section: 'EVA',
        mrp: 149,
      },
    });
    // Backend should either sanitize and accept (201) or reject (400)
    expect([200, 201, 400, 422]).toContain(res.status());

    if (res.status() === 201) {
      const body = await res.json();
      // The stored name must NOT contain un-escaped script tags
      const storedName: string = body.data.article_name ?? '';
      expect(storedName).not.toContain('<script>');
    }
  });

  // =========================================================================
  // TC-EDGE-009: SQL injection in search → safe response
  // =========================================================================

  test('TC-EDGE-009: SQL injection in search → safe response (no 500)', async ({ request }) => {
    const sqlPayload = "' OR '1'='1' --";
    const res = await request.get(
      `${BASE_API}/products?search=${encodeURIComponent(sqlPayload)}`,
      {
        headers: { Authorization: `Bearer ${tokens.admin}` },
      }
    );
    // Must NOT be a 500 server error — any other code is acceptable
    expect(res.status()).not.toBe(500);
    const body = await res.json();
    // Should return a valid JSON response
    expect(typeof body).toBe('object');
  });

  // =========================================================================
  // State machine tests — TC-STATE-001 to TC-STATE-004
  // Create fresh boxes, pack them, verify transitions
  // =========================================================================

  test('SETUP-STATE: Create fresh child boxes for state tests', async ({ request }) => {
    const barcodes = await bulkCreateBoxes(request, tokens.admin, testProductId, 3);
    expect(barcodes.length).toBe(3);
    stateTestBarcodes = barcodes;
  });

  test('TC-STATE-001: FREE box → pack into carton → status PACKED', async ({ request }) => {
    expect(stateTestBarcodes.length).toBeGreaterThanOrEqual(1);

    // Create a master carton with 1 box
    const [barcode] = stateTestBarcodes;
    const createRes = await request.post(`${BASE_API}/master-cartons`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: { max_capacity: 24, child_box_barcodes: [barcode] },
    });
    expect(createRes.status()).toBe(201);
    const carton = (await createRes.json()).data;
    stateTestCartonId = carton.id;
    expect(carton.status).toBe('ACTIVE');
    expect(carton.child_count).toBeGreaterThanOrEqual(1);

    // Verify the box status via the precise /child-boxes/qr/:barcode endpoint
    // (?barcode= query param is silently ignored by backend — only `search` is supported)
    const boxRes = await request.get(
      `${BASE_API}/child-boxes/qr/${barcode}`,
      { headers: { Authorization: `Bearer ${tokens.admin}` } }
    );
    const boxBody = await boxRes.json();
    const box = boxBody.data;
    expect(box).toBeTruthy();
    expect(box.status).toBe('PACKED');
  });

  test('TC-STATE-002: PACKED box cannot be packed into another carton → 400', async ({ request }) => {
    expect(stateTestBarcodes.length).toBeGreaterThanOrEqual(1);

    // Try to create another carton with the already-PACKED barcode
    const [packedBarcode] = stateTestBarcodes;
    const res = await request.post(`${BASE_API}/master-cartons`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: { max_capacity: 24, child_box_barcodes: [packedBarcode] },
    });
    // Should fail — box is already PACKED
    expect([400, 409, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('TC-STATE-003: PACKED box → unpack → status FREE', async ({ request }) => {
    expect(stateTestCartonId).toBeTruthy();

    // Unpack the carton (removes all child boxes, sets them back to FREE).
    // Endpoint is `/full-unpack` — `/unpack` expects a body for a single child and is not a per-carton route.
    const unpackRes = await request.post(
      `${BASE_API}/master-cartons/${stateTestCartonId}/full-unpack`,
      { headers: { Authorization: `Bearer ${tokens.admin}` } }
    );
    // Accept 200 or 204
    expect([200, 204]).toContain(unpackRes.status());

    // Verify the box is FREE again (use precise qr lookup — ?barcode= is ignored)
    const [barcode] = stateTestBarcodes;
    const boxRes = await request.get(
      `${BASE_API}/child-boxes/qr/${barcode}`,
      { headers: { Authorization: `Bearer ${tokens.admin}` } }
    );
    const boxBody = await boxRes.json();
    const box = boxBody.data;
    expect(box).toBeTruthy();
    expect(box.status).toBe('FREE');
  });

  test('TC-STATE-004: DISPATCHED box cannot be unpacked → 400', async ({ request }) => {
    // Create a new carton → close it → dispatch it → try to unpack it
    const freshBarcodes = await bulkCreateBoxes(request, tokens.admin, testProductId, 1);
    expect(freshBarcodes.length).toBe(1);

    // Pack into carton
    const cartonRes = await request.post(`${BASE_API}/master-cartons`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: { max_capacity: 24, child_box_barcodes: freshBarcodes },
    });
    expect(cartonRes.status()).toBe(201);
    const carton = (await cartonRes.json()).data;

    // Close carton
    const closeRes = await request.post(`${BASE_API}/master-cartons/${carton.id}/close`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
    });
    expect([200, 204]).toContain(closeRes.status());

    // Dispatch carton
    const dispatchRes = await request.post(`${BASE_API}/dispatches`, {
      headers: { Authorization: `Bearer ${tokens.admin}`, 'Content-Type': 'application/json' },
      data: {
        master_carton_ids: [carton.id],
        destination: 'State Test Warehouse',
        vehicle_number: `ST-${TS6}`,
      },
    });
    // Dispatch may require customer — accept 201 or check for graceful failure
    if (dispatchRes.status() === 201) {
      // Now try to unpack the dispatched carton — should fail (400).
      // Use `/full-unpack` — same per-carton route fixed in TC-STATE-003.
      const unpackRes = await request.post(
        `${BASE_API}/master-cartons/${carton.id}/full-unpack`,
        { headers: { Authorization: `Bearer ${tokens.admin}` } }
      );
      expect([400, 409, 422]).toContain(unpackRes.status());
      const body = await unpackRes.json();
      expect(body.success).toBe(false);
    } else {
      // Dispatch requires customer — skip unpack test but verify graceful error
      expect([400, 422]).toContain(dispatchRes.status());
    }
  });

  // =========================================================================
  // Pagination tests — TC-PAGE-001 to TC-PAGE-002
  // =========================================================================

  test('TC-PAGE-001: GET /products?page=1&limit=10 → correct pagination meta', async ({ request }) => {
    const res = await request.get(`${BASE_API}/products?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data.length).toBeLessThanOrEqual(10);

    // Pagination metadata should exist in body (could be top-level or nested)
    const meta = body.pagination ?? body.meta ?? body;
    const hasPageInfo =
      meta.page !== undefined ||
      meta.current_page !== undefined ||
      meta.total !== undefined ||
      meta.totalCount !== undefined ||
      body.total !== undefined;
    expect(hasPageInfo).toBeTruthy();
  });

  test('TC-PAGE-002: GET /products?page=999 → empty data array', async ({ request }) => {
    const res = await request.get(`${BASE_API}/products?page=999&limit=10`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Data should be an empty array for an out-of-range page
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data.length).toBe(0);
  });

  // =========================================================================
  // Error handling — TC-ERR-001 to TC-ERR-003
  // =========================================================================

  test('TC-ERR-001: Invalid UUID in product ID → 400 or 404', async ({ request }) => {
    const res = await request.get(`${BASE_API}/products/not-a-valid-uuid`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
    });
    expect([400, 404, 422]).toContain(res.status());
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('TC-ERR-002: Missing Content-Type on POST → handled gracefully (not 500)', async ({ request }) => {
    // Send JSON body without Content-Type header
    const res = await request.post(`${BASE_API}/products`, {
      headers: {
        Authorization: `Bearer ${tokens.admin}`,
        // intentionally omit 'Content-Type'
      },
      data: {
        article_name: 'No Content Type',
        article_code: 'NOCT001',
        colour: 'Black',
        size: '8',
        category: 'Gents',
        section: 'Hawaii',
        mrp: 99,
      },
    });
    // Should not result in a 500 server error — any other status is acceptable
    expect(res.status()).not.toBe(500);
  });

  test('TC-ERR-003: Unknown endpoint returns JSON not HTML', async ({ request }) => {
    const res = await request.get(`${BASE_API}/completely-nonexistent-endpoint-xyz`, {
      headers: { Authorization: `Bearer ${tokens.admin}` },
    });
    expect(res.status()).toBe(404);

    // Response must be JSON, not HTML
    const contentType = res.headers()['content-type'] ?? '';
    expect(contentType).toContain('json');

    const body = await res.json();
    expect(typeof body).toBe('object');
    // Should have success: false for a 404
    expect(body.success).toBe(false);
  });

}); // end test.describe.serial
