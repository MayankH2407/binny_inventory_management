/**
 * Phase 10: "Close Carton" provision added to the Repack box-scan phase (2026-06-20).
 *
 * Before this, packing a carton in /unpack-repack (Repack tab) could print the
 * label but the user had to leave to the Master Cartons module to close/seal it.
 * A "Close Carton" button now lives in the Repack box-scan summary bar. It reuses
 * the existing POST /master-cartons/:id/close endpoint (cartons:close permission).
 *
 * Covers:
 *   TC-CLOSE-API-001 — close a carton that holds boxes → status CLOSED, closed_at set
 *   TC-CLOSE-API-002 — close an EMPTY carton → rejected (400, "empty")
 *   TC-CLOSE-API-003 — close an ALREADY-CLOSED carton → rejected (400, "already closed")
 *   TC-CLOSE-UI-001  — Repack box-scan: "Close Carton" visible but DISABLED before any box packed
 *   TC-CLOSE-UI-002  — Repack box-scan: pack a box → Close enabled → confirm modal → carton CLOSED + flow resets
 *
 * Permission: admin has cartons:close + packing:pack + packing:unpack.
 */

import { test, expect, APIRequestContext } from '@playwright/test';
import { BASE_API, ADMIN_EMAIL, ADMIN_PASSWORD, loginViaAPI } from './helpers';

const TS6 = String(Date.now()).slice(-6);

// ---------------------------------------------------------------------------
// helpers (mirror 42-carton-repack.spec.ts)
// ---------------------------------------------------------------------------
async function loginAs(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${BASE_API}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data.accessToken;
}

async function createProduct(request: APIRequestContext, token: string, suffix: string): Promise<string> {
  const code = `CLS${suffix}`.slice(0, 20);
  const res = await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      article_code: code,
      article_name: `Close ${suffix}`,
      colour: 'Blue',
      size: '8',
      category: 'Gents',
      section: 'Hawaii',
      mrp: 299,
    },
  });
  if ([200, 201].includes(res.status())) return (await res.json()).data?.id ?? '';
  const listRes = await request.get(`${BASE_API}/products?search=${code}&limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok()) return '';
  const rows: Array<{ id: string; article_code: string }> = (await listRes.json()).data ?? [];
  return rows.find((p) => p.article_code === code)?.id ?? '';
}

async function createFreeBox(
  request: APIRequestContext,
  token: string,
  productId: string
): Promise<{ id: string; barcode: string; status: string }> {
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
    box.status = 'FREE';
  }
  return box;
}

async function createCartonWithBoxes(
  request: APIRequestContext,
  token: string,
  barcodes: string[]
): Promise<{ id: string; carton_barcode: string }> {
  const res = await request.post(`${BASE_API}/master-cartons`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { max_capacity: 24, child_box_barcodes: barcodes },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

async function createEmptyCarton(
  request: APIRequestContext,
  token: string
): Promise<{ id: string; carton_barcode: string }> {
  const res = await request.post(`${BASE_API}/master-cartons`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { max_capacity: 24 },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

async function getCarton(request: APIRequestContext, token: string, id: string): Promise<{ status: string; child_count: number; closed_at: string | null }> {
  const res = await request.get(`${BASE_API}/master-cartons/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data;
}

// ---------------------------------------------------------------------------
// TC-CLOSE-API: close endpoint behaviour (the foundation the UI button calls)
// ---------------------------------------------------------------------------
test.describe('TC-CLOSE-API: close master carton endpoint', () => {
  test('TC-CLOSE-API-001: closing a carton with boxes sets status=CLOSED and closed_at', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `A1${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const carton = await createCartonWithBoxes(request, token, [box.barcode]);

    const res = await request.post(`${BASE_API}/master-cartons/${carton.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok(), `close failed: ${res.status()} — ${await res.text()}`).toBeTruthy();

    const after = await getCarton(request, token, carton.id);
    expect(after.status, 'carton should be CLOSED after close').toBe('CLOSED');
    expect(after.closed_at, 'closed_at should be stamped').not.toBeNull();
  });

  test('TC-CLOSE-API-002: closing an EMPTY carton is rejected', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const carton = await createEmptyCarton(request, token);

    const res = await request.post(`${BASE_API}/master-cartons/${carton.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok(), 'closing an empty carton must not succeed').toBeFalsy();
    expect(res.status()).toBe(400);
    expect((await res.text()).toLowerCase()).toContain('empty');
  });

  test('TC-CLOSE-API-003: closing an ALREADY-CLOSED carton is rejected', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `A3${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const carton = await createCartonWithBoxes(request, token, [box.barcode]);

    const first = await request.post(`${BASE_API}/master-cartons/${carton.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(first.ok()).toBeTruthy();

    const second = await request.post(`${BASE_API}/master-cartons/${carton.id}/close`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(second.ok(), 'second close must not succeed').toBeFalsy();
    expect(second.status()).toBe(400);
    expect((await second.text()).toLowerCase()).toContain('already');
  });
});

// ---------------------------------------------------------------------------
// TC-CLOSE-UI: Close Carton button in the Repack box-scan phase
// ---------------------------------------------------------------------------
test.describe('TC-CLOSE-UI: Close Carton in Repack', () => {
  // The Next.js dev server lazily compiles /unpack-repack on first hit (~17s),
  // which can exceed the default 30s budget for whichever UI test runs first.
  // Give these UI tests headroom; on a built (prod) frontend there is no compile lag.
  test.describe.configure({ timeout: 60000 });

  test('TC-CLOSE-UI-001: Close Carton button is visible but disabled before any box is packed', async ({ page, request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const carton = await createEmptyCarton(request, token);

    await loginViaAPI(page);
    await page.goto('/unpack-repack');
    await page.waitForLoadState('networkidle');

    // Switch to Repack tab and scan the EMPTY carton → goes straight to box-scan phase
    await page.getByRole('main').getByRole('button', { name: /^repack/i }).click();
    const scanInput = page.getByPlaceholder('Scan or enter carton barcode...');
    await expect(scanInput).toBeVisible({ timeout: 10000 });
    await scanInput.fill(carton.carton_barcode);
    await scanInput.press('Enter');

    // Box-scan phase: the box scanner appears
    await expect(page.getByPlaceholder('Scan or enter child box barcode...')).toBeVisible({ timeout: 10000 });

    // Close Carton button present (admin has cartons:close) but disabled with 0 packed
    const closeBtn = page.getByRole('button', { name: /close carton/i });
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await expect(closeBtn).toBeDisabled();
  });

  test('TC-CLOSE-UI-002: pack a box, then Close Carton → confirm modal → carton CLOSED and flow resets', async ({ page, request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `U2${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const carton = await createEmptyCarton(request, token);

    await loginViaAPI(page);
    await page.goto('/unpack-repack');
    await page.waitForLoadState('networkidle');

    await page.getByRole('main').getByRole('button', { name: /^repack/i }).click();
    const cartonInput = page.getByPlaceholder('Scan or enter carton barcode...');
    await expect(cartonInput).toBeVisible({ timeout: 10000 });
    await cartonInput.fill(carton.carton_barcode);
    await cartonInput.press('Enter');

    // Pack the FREE box
    const boxInput = page.getByPlaceholder('Scan or enter child box barcode...');
    await expect(boxInput).toBeVisible({ timeout: 10000 });
    await boxInput.fill(box.barcode);
    await boxInput.press('Enter');

    // Close Carton becomes enabled once the pack completes
    const closeBtn = page.getByRole('button', { name: /close carton/i });
    await expect(closeBtn).toBeEnabled({ timeout: 10000 });
    await closeBtn.click();

    // Confirm modal
    const dialog = page.getByRole('dialog').filter({ hasText: /close carton/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText(/1 box/i)).toBeVisible({ timeout: 5000 });
    await dialog.getByRole('button', { name: /yes, close carton/i }).click();

    // Flow resets to the carton-scan phase (heading reappears)
    await expect(
      page.getByRole('heading', { name: /scan master carton barcode/i })
    ).toBeVisible({ timeout: 10000 });

    // Carton is CLOSED in the backend
    const after = await getCarton(request, token, carton.id);
    expect(after.status, 'carton should be CLOSED after confirming in Repack').toBe('CLOSED');
    expect(after.child_count, 'closed carton should retain its 1 packed box').toBe(1);
  });
});
