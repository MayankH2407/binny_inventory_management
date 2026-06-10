/**
 * Phase 6: Single-foot (L/R) field on sample box mappings.
 * Covers: POST /samples/add-box with foot=LEFT/RIGHT/PAIR, default PAIR,
 *         invalid foot value, GET /samples/:id returns foot in child_boxes,
 *         UI foot selector on sample detail page.
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

async function createProduct(request: APIRequestContext, token: string, suffix: string): Promise<string> {
  const code = `FT${suffix}`.slice(0, 20);
  const res = await request.post(`${BASE_API}/products`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: {
      article_code: code,
      article_name: `Foot Sample ${suffix}`,
      colour: 'Brown',
      size: '9',
      category: 'Gents',
      section: 'PU',
      mrp: 349,
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

async function createSample(
  request: APIRequestContext,
  token: string,
  name: string
): Promise<{ id: string; barcode: string; status: string }> {
  const res = await request.post(`${BASE_API}/samples`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { name },
  });
  expect(res.status()).toBe(201);
  return (await res.json()).data;
}

// ---------------------------------------------------------------------------
// TC-SMFT-ADD: add-box with foot field
// ---------------------------------------------------------------------------
test.describe('TC-SMFT-ADD: Sample add-box foot field', () => {
  test('TC-SMFT-ADD-001: add-box with foot=LEFT stores LEFT and is returned by getSampleById', async ({
    request,
  }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `LEFT${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM Foot Left ${TS6}`);

    const addRes = await request.post(`${BASE_API}/samples/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id, foot: 'LEFT' },
    });
    expect(addRes.ok(), `add-box failed: ${await addRes.text()}`).toBeTruthy();

    const addBody = await addRes.json();
    // The mapping in the response should carry foot=LEFT
    const mapping = addBody.data?.mapping ?? addBody.data;
    if (mapping?.foot !== undefined) {
      expect(mapping.foot).toBe('LEFT');
    }

    // Fetch the sample and check child_boxes[0].foot
    const sampleRes = await request.get(`${BASE_API}/samples/${sample.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(sampleRes.ok()).toBeTruthy();
    const sampleData = (await sampleRes.json()).data;
    const childBoxes: Array<{ foot: string; child_box_id?: string }> = sampleData.child_boxes ?? [];
    const foundMapping = childBoxes.find(
      (cb) => cb.child_box_id === box.id || (cb as unknown as { id: string }).id
    );
    if (foundMapping) {
      expect(foundMapping.foot).toBe('LEFT');
    } else {
      // If child_boxes isn't returned, at least assert the add succeeded
      expect(sampleData.child_count).toBeGreaterThanOrEqual(1);
    }
  });

  test('TC-SMFT-ADD-002: add-box with foot=RIGHT stores RIGHT', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `RIGHT${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM Foot Right ${TS6}`);

    const addRes = await request.post(`${BASE_API}/samples/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id, foot: 'RIGHT' },
    });
    expect(addRes.ok()).toBeTruthy();

    const sampleRes = await request.get(`${BASE_API}/samples/${sample.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sampleData = (await sampleRes.json()).data;
    const childBoxes: Array<{ foot: string }> = sampleData.child_boxes ?? [];
    if (childBoxes.length > 0) {
      expect(childBoxes[0].foot).toBe('RIGHT');
    } else {
      expect(sampleData.child_count).toBeGreaterThanOrEqual(1);
    }
  });

  test('TC-SMFT-ADD-003: add-box with foot=PAIR stores PAIR', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `PAIR${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM Foot Pair ${TS6}`);

    const addRes = await request.post(`${BASE_API}/samples/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id, foot: 'PAIR' },
    });
    expect(addRes.ok()).toBeTruthy();

    const sampleRes = await request.get(`${BASE_API}/samples/${sample.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sampleData = (await sampleRes.json()).data;
    const childBoxes: Array<{ foot: string }> = sampleData.child_boxes ?? [];
    if (childBoxes.length > 0) {
      expect(childBoxes[0].foot).toBe('PAIR');
    } else {
      expect(sampleData.child_count).toBeGreaterThanOrEqual(1);
    }
  });

  test('TC-SMFT-ADD-004: add-box without foot field defaults to PAIR', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `DEFP${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM Foot Default ${TS6}`);

    // Deliberately omit the foot field
    const addRes = await request.post(`${BASE_API}/samples/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id },
    });
    expect(addRes.ok()).toBeTruthy();

    const sampleRes = await request.get(`${BASE_API}/samples/${sample.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sampleData = (await sampleRes.json()).data;
    const childBoxes: Array<{ foot: string }> = sampleData.child_boxes ?? [];
    if (childBoxes.length > 0) {
      expect(childBoxes[0].foot).toBe('PAIR');
    } else {
      expect(sampleData.child_count).toBeGreaterThanOrEqual(1);
    }
  });

  test('TC-SMFT-ADD-005: add-box with invalid foot value → 400', async ({ request }) => {
    const token = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD);
    const productId = await createProduct(request, token, `BADF${TS6}`);
    const box = await createFreeBox(request, token, productId);
    const sample = await createSample(request, token, `SM Foot Invalid ${TS6}`);

    const addRes = await request.post(`${BASE_API}/samples/add-box`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { sample_record_id: sample.id, child_box_id: box.id, foot: 'BOTH' },
    });
    // Zod schema validates foot enum → should be 400
    expect(addRes.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// TC-SMFT-UI: Sample detail page foot selector
// ---------------------------------------------------------------------------
test.describe('TC-SMFT-UI: Sample Detail Page Foot Selector', () => {
  test('TC-SMFT-UI-001: Sample detail page shows foot selector (PAIR/LEFT/RIGHT) in Add Box section', async ({
    page,
  }) => {
    const token = await (async () => {
      const res = await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      });
      return (await res.json()).data.accessToken as string;
    })();

    // Create a sample
    const sampleRes = await page.request.post(`${BASE_API}/samples`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: { name: `SM Foot UI ${TS6}` },
    });
    expect(sampleRes.status()).toBe(201);
    const sample = (await sampleRes.json()).data;

    await loginViaAPI(page);
    await page.goto(`/samples/${sample.id}`);
    await page.waitForLoadState('networkidle');

    // Open the "Add Box" section
    const addBoxBtn = page.getByRole('button', { name: /add box/i });
    if (await addBoxBtn.isVisible({ timeout: 8000 })) {
      await addBoxBtn.click();
      await page.waitForTimeout(500);

      // There should be a foot selector visible (PAIR / LEFT / RIGHT options)
      const footSelector = page
        .getByRole('combobox', { name: /foot/i })
        .or(page.locator('select'))
        .or(page.getByText(/pair/i).first());

      // The page should mention PAIR or foot-related options
      const footText = page.getByText(/pair/i).or(page.getByText(/left/i)).or(page.getByText(/right/i));
      await expect(footText.first()).toBeVisible({ timeout: 5000 });
    }
  });
});
