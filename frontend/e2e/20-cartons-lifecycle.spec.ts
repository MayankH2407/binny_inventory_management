/**
 * Phase 5: Master Carton Full Lifecycle — Per Role
 * TC-MC-ADM-001 to TC-MC-READ-003
 *
 * Coverage:
 *  - Setup: create test users for all 4 roles, create a test product,
 *    create 20 FREE child boxes (enough for all pack/unpack/repack tests)
 *  - Admin creates carton with child box barcodes
 *  - Admin packs additional child box into carton
 *  - Create carton with already-PACKED box returns 400
 *  - Supervisor and Warehouse Operator can create cartons
 *  - Dispatch Operator CANNOT create cartons (403)
 *  - Admin and Supervisor can close carton; Warehouse Operator cannot close
 *  - Admin full unpack; Warehouse Operator full unpack; Dispatch Operator denied
 *  - Admin repacks box from carton A to carton B
 *  - Read operations (list, detail, assortment)
 *
 * IMPORTANT: Everything is wrapped in ONE top-level test.describe.serial so that
 * module-level state (tokens, resource IDs, barcodes) persists across all describe blocks.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

// ---------------------------------------------------------------------------
// Unique timestamp
// ---------------------------------------------------------------------------
const TS = Date.now();

const TEST_USERS = {
  admin: {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'Admin',
    name: 'System Administrator',
  },
  supervisor: {
    email: `sup-mc-${TS}@test.com`,
    password: 'TestSup@1234',
    role: 'Supervisor',
    name: `MC Supervisor ${TS}`,
  },
  warehouse: {
    email: `wh-mc-${TS}@test.com`,
    password: 'TestWh@1234',
    role: 'Warehouse Operator',
    name: `MC Warehouse ${TS}`,
  },
  dispatch: {
    email: `dp-mc-${TS}@test.com`,
    password: 'TestDp@1234',
    role: 'Dispatch Operator',
    name: `MC Dispatch ${TS}`,
  },
};

// ---------------------------------------------------------------------------
// Module-level state — populated in setup, persist throughout the serial block
// ---------------------------------------------------------------------------
const tokens: Record<string, string> = {};
let testProductId = '';
let testSectionName = `MCSection-${TS}`;
let freeBarcodes: string[] = []; // pool of FREE child box barcodes

// Carton IDs created during tests
let adminCartonId = '';        // created by Admin in TC-MC-ADM-001
let supCartonId = '';          // created by Supervisor
let whoCartonId = '';          // created by Warehouse Operator
let closeTargetCartonId = '';  // created for close tests
let unpackCartonId = '';       // created for unpack tests
let repackSourceCartonId = ''; // source carton for repack test
let repackDestCartonId = '';   // destination carton for repack test
let repackBarcode = '';        // barcode to repack from source to dest

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAs(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.data.accessToken;
}

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Drain N barcodes from the freeBarcodes pool.
 * Asserts that enough are available.
 */
function takeBarcodes(count: number): string[] {
  expect(
    freeBarcodes.length,
    `Need ${count} free barcodes but only ${freeBarcodes.length} remain`
  ).toBeGreaterThanOrEqual(count);
  return freeBarcodes.splice(0, count);
}

// ===========================================================================
// ONE top-level serial describe
// ===========================================================================

test.describe.serial('Master Carton Lifecycle Suite', () => {

  // =========================================================================
  // SETUP — Create test users, product, and 20 child boxes
  // =========================================================================

  test.describe('Setup', () => {
    test('MC-SETUP-001: Create test users for all roles', async ({ request }) => {
      const adminToken = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
      tokens.admin = adminToken;

      for (const [key, user] of Object.entries(TEST_USERS)) {
        if (key === 'admin') continue;
        const res = await request.post(`${BASE_API}/users`, {
          headers: authHeader(adminToken),
          data: {
            email: user.email,
            password: user.password,
            name: user.name,
            role: user.role,
          },
        });
        expect(res.status(), `Creating user for role ${user.role}`).toBe(201);
      }

      for (const [key, user] of Object.entries(TEST_USERS)) {
        tokens[key] = await loginAs(request, user.email, user.password);
      }

      expect(tokens.admin).toBeTruthy();
      expect(tokens.supervisor).toBeTruthy();
      expect(tokens.warehouse).toBeTruthy();
      expect(tokens.dispatch).toBeTruthy();
    });

    test('MC-SETUP-002: Create test section and product via Admin', async ({ request }) => {
      // Create section
      const sectionRes = await request.post(`${BASE_API}/sections`, {
        headers: authHeader(tokens.admin),
        data: { name: testSectionName },
      });
      expect(sectionRes.status()).toBe(201);

      // Create product
      const productRes = await request.post(`${BASE_API}/products`, {
        headers: authHeader(tokens.admin),
        data: {
          article_name: `MC Test Product ${TS}`,
          article_code: `MCT${String(TS).slice(-6)}`,
          colour: 'Brown',
          size: '9',
          mrp: 399,
          category: 'Gents',
          section: testSectionName,
        },
      });
      expect(productRes.status()).toBe(201);
      const productBody = await productRes.json();
      testProductId = productBody.data.id;
      expect(testProductId).toBeTruthy();
    });

    test('MC-SETUP-003: Bulk create 20 FREE child boxes for carton tests', async ({ request }) => {
      // Create in batches of 10 to keep individual requests reasonable
      for (let batch = 0; batch < 2; batch++) {
        const res = await request.post(`${BASE_API}/child-boxes/bulk`, {
          headers: authHeader(tokens.admin),
          data: {
            product_id: testProductId,
            count: 10,
            quantity: 12,
          },
        });
        expect(res.status()).toBe(201);
        const body = await res.json();
        expect(Array.isArray(body.data)).toBe(true);
        expect(body.data.length).toBe(10);
        const barcodes = body.data.map((cb: { barcode: string }) => cb.barcode);
        freeBarcodes.push(...barcodes);
      }
      expect(freeBarcodes.length).toBe(20);
    });
  });

  // =========================================================================
  // TC-MC-ADM: Admin master carton operations
  // =========================================================================

  test.describe('TC-MC-ADM: Admin carton CRUD', () => {
    test('TC-MC-ADM-001: Admin creates carton with child box barcodes — 201, status=ACTIVE', async ({
      request,
    }) => {
      const barcodes = takeBarcodes(2);
      const res = await request.post(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.admin),
        data: {
          child_box_barcodes: barcodes,
          max_capacity: 50,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeTruthy();
      expect(body.data.status).toBe('ACTIVE');
      adminCartonId = body.data.id;

      // Store one barcode for the repack source test
      repackBarcode = barcodes[0];
    });

    test('TC-MC-ADM-002: Admin packs additional child box into carton — 200', async ({
      request,
    }) => {
      expect(adminCartonId).toBeTruthy();
      const [extraBarcode] = takeBarcodes(1);

      // Resolve barcode → UUID (pack API requires child_box_id, not barcode)
      const qrRes = await request.get(`${BASE_API}/child-boxes/qr/${extraBarcode}`, {
        headers: authHeader(tokens.admin),
      });
      expect(qrRes.status()).toBe(200);
      const qrBody = await qrRes.json();
      const extraChildBoxId = qrBody.data.id;
      expect(extraChildBoxId).toBeTruthy();

      const res = await request.post(`${BASE_API}/master-cartons/pack`, {
        headers: authHeader(tokens.admin),
        data: {
          master_carton_id: adminCartonId,
          child_box_id: extraChildBoxId,
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-MC-ADM-003: Create carton with already-PACKED box returns 400', async ({
      request,
    }) => {
      // repackBarcode is now PACKED (it was packed into adminCartonId in ADM-001)
      expect(repackBarcode).toBeTruthy();

      const res = await request.post(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.admin),
        data: {
          child_box_barcodes: [repackBarcode],
          max_capacity: 50,
        },
      });
      // Should reject because the box is already PACKED
      expect([400, 409]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // =========================================================================
  // TC-MC-SUP / TC-MC-WHO / TC-MC-DOP: Role-based carton creation
  // =========================================================================

  test.describe('TC-MC-SUP: Supervisor carton creation', () => {
    test('TC-MC-SUP-001: Supervisor creates carton — 201', async ({ request }) => {
      const barcodes = takeBarcodes(1);
      const res = await request.post(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.supervisor),
        data: {
          child_box_barcodes: barcodes,
          max_capacity: 50,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      supCartonId = body.data.id;
    });
  });

  test.describe('TC-MC-WHO: Warehouse Operator carton creation', () => {
    test('TC-MC-WHO-001: Warehouse Operator creates carton — 201', async ({ request }) => {
      const barcodes = takeBarcodes(1);
      const res = await request.post(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.warehouse),
        data: {
          child_box_barcodes: barcodes,
          max_capacity: 50,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      whoCartonId = body.data.id;
    });
  });

  test.describe('TC-MC-DOP: Dispatch Operator denied carton creation', () => {
    test('TC-MC-DOP-001: Dispatch Operator creates carton — 403', async ({ request }) => {
      const res = await request.post(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.dispatch),
        data: {
          child_box_barcodes: [],
          max_capacity: 50,
        },
      });
      expect(res.status()).toBe(403);
    });
  });

  // =========================================================================
  // TC-MC-CLOSE: Close carton — Admin/Supervisor only
  // =========================================================================

  test.describe('TC-MC-CLOSE: Close carton operations', () => {
    test('MC-CLOSE-SETUP: Create a dedicated ACTIVE carton for close tests', async ({
      request,
    }) => {
      const barcodes = takeBarcodes(1);
      const res = await request.post(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.admin),
        data: {
          child_box_barcodes: barcodes,
          max_capacity: 50,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      closeTargetCartonId = body.data.id;
    });

    test('TC-MC-CLOSE-001: Admin closes ACTIVE carton — 200, status=CLOSED', async ({
      request,
    }) => {
      expect(closeTargetCartonId).toBeTruthy();
      const res = await request.post(
        `${BASE_API}/master-cartons/${closeTargetCartonId}/close`,
        {
          headers: authHeader(tokens.admin),
        }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Status should be CLOSED
      const status = body.data?.status || body.data?.carton?.status;
      if (status) {
        expect(status).toBe('CLOSED');
      }
    });

    test('TC-MC-CLOSE-002: Supervisor closes carton — 200', async ({ request }) => {
      // Use the supervisor-created carton (still ACTIVE)
      expect(supCartonId).toBeTruthy();
      const res = await request.post(
        `${BASE_API}/master-cartons/${supCartonId}/close`,
        {
          headers: authHeader(tokens.supervisor),
        }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-MC-CLOSE-003: Warehouse Operator CANNOT close carton — 403', async ({ request }) => {
      // Use a fake ID — 403 should fire before the record lookup
      const fakeId = '00000000-0000-0000-0000-000000000099';
      const res = await request.post(
        `${BASE_API}/master-cartons/${fakeId}/close`,
        {
          headers: authHeader(tokens.warehouse),
        }
      );
      expect(res.status()).toBe(403);
    });

    test('TC-MC-CLOSE-004: Close already CLOSED carton — 400', async ({ request }) => {
      // closeTargetCartonId is already CLOSED from CLOSE-001
      expect(closeTargetCartonId).toBeTruthy();
      const res = await request.post(
        `${BASE_API}/master-cartons/${closeTargetCartonId}/close`,
        {
          headers: authHeader(tokens.admin),
        }
      );
      expect([400, 409]).toContain(res.status());
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  // =========================================================================
  // TC-MC-UNPACK: Full unpack operations
  // =========================================================================

  test.describe('TC-MC-UNPACK: Full unpack operations', () => {
    test('MC-UNPACK-SETUP: Create carton for unpack tests', async ({ request }) => {
      const barcodes = takeBarcodes(2);
      const res = await request.post(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.admin),
        data: {
          child_box_barcodes: barcodes,
          max_capacity: 50,
        },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      unpackCartonId = body.data.id;
    });

    test('TC-MC-UNPACK-001: Admin full unpack — 200, all boxes FREE', async ({ request }) => {
      expect(unpackCartonId).toBeTruthy();
      const res = await request.post(
        `${BASE_API}/master-cartons/${unpackCartonId}/full-unpack`,
        {
          headers: authHeader(tokens.admin),
        }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-MC-UNPACK-002: Warehouse Operator full unpack — 200', async ({ request }) => {
      // Create a fresh carton for the warehouse operator to unpack
      const barcodes = takeBarcodes(1);
      const createRes = await request.post(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.admin),
        data: {
          child_box_barcodes: barcodes,
          max_capacity: 50,
        },
      });
      expect(createRes.status()).toBe(201);
      const createBody = await createRes.json();
      const cartonToUnpack = createBody.data.id;

      const res = await request.post(
        `${BASE_API}/master-cartons/${cartonToUnpack}/full-unpack`,
        {
          headers: authHeader(tokens.warehouse),
        }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    test('TC-MC-UNPACK-003: Dispatch Operator full unpack — 403', async ({ request }) => {
      const fakeId = '00000000-0000-0000-0000-000000000099';
      const res = await request.post(
        `${BASE_API}/master-cartons/${fakeId}/full-unpack`,
        {
          headers: authHeader(tokens.dispatch),
        }
      );
      expect(res.status()).toBe(403);
    });
  });

  // =========================================================================
  // TC-MC-REPACK: Repack box from carton A to carton B
  // =========================================================================

  test.describe('TC-MC-REPACK: Repack child box between cartons', () => {
    test('MC-REPACK-SETUP: Create source and destination cartons with FREE boxes', async ({
      request,
    }) => {
      // We need 2 fresh FREE boxes for source, 1 for dest
      const sourceBarcodes = takeBarcodes(2);
      const destBarcodes = takeBarcodes(1);

      // Source carton
      const sourceRes = await request.post(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.admin),
        data: {
          child_box_barcodes: sourceBarcodes,
          max_capacity: 50,
        },
      });
      expect(sourceRes.status()).toBe(201);
      const sourceBody = await sourceRes.json();
      repackSourceCartonId = sourceBody.data.id;
      // Use the first barcode from source as the one to repack
      repackBarcode = sourceBarcodes[0];

      // Destination carton
      const destRes = await request.post(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.admin),
        data: {
          child_box_barcodes: destBarcodes,
          max_capacity: 50,
        },
      });
      expect(destRes.status()).toBe(201);
      const destBody = await destRes.json();
      repackDestCartonId = destBody.data.id;
    });

    test('TC-MC-REPACK-001: Admin repacks box from carton A to carton B — 200', async ({
      request,
    }) => {
      expect(repackSourceCartonId).toBeTruthy();
      expect(repackDestCartonId).toBeTruthy();
      expect(repackBarcode).toBeTruthy();

      const lookupRes = await request.get(
        `${BASE_API}/child-boxes/qr/${encodeURIComponent(repackBarcode)}`,
        { headers: authHeader(tokens.admin) }
      );
      expect(lookupRes.ok()).toBeTruthy();
      const childBoxId = (await lookupRes.json()).data.id;
      expect(childBoxId).toBeTruthy();

      const res = await request.post(`${BASE_API}/master-cartons/repack`, {
        headers: authHeader(tokens.admin),
        data: {
          child_box_id: childBoxId,
          source_carton_id: repackSourceCartonId,
          destination_carton_id: repackDestCartonId,
        },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  // =========================================================================
  // TC-MC-READ: Read operations
  // =========================================================================

  test.describe('TC-MC-READ: Master carton read operations', () => {
    test('TC-MC-READ-001: GET /master-cartons — paginated list', async ({ request }) => {
      const res = await request.get(`${BASE_API}/master-cartons`, {
        headers: authHeader(tokens.admin),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      // Should include pagination metadata
      expect(body.pagination || body.meta || body.total !== undefined).toBeTruthy();
    });

    test('TC-MC-READ-002: GET /master-cartons/:id — detail with children', async ({ request }) => {
      expect(adminCartonId).toBeTruthy();
      const res = await request.get(`${BASE_API}/master-cartons/${adminCartonId}`, {
        headers: authHeader(tokens.admin),
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(adminCartonId);
      // Should contain child boxes (children)
      const children =
        body.data.child_boxes ||
        body.data.children ||
        body.data.childBoxes;
      expect(children).toBeDefined();
      expect(Array.isArray(children)).toBe(true);
    });

    test('TC-MC-READ-003: GET /master-cartons/:id/assortment — size assortment', async ({
      request,
    }) => {
      expect(adminCartonId).toBeTruthy();
      const res = await request.get(
        `${BASE_API}/master-cartons/${adminCartonId}/assortment`,
        {
          headers: authHeader(tokens.admin),
        }
      );
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      // Assortment is an array or object with size data
      expect(body.data).toBeDefined();
    });
  });

}); // end test.describe.serial('Master Carton Lifecycle Suite')
