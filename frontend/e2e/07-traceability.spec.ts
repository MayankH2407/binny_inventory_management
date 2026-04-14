import { test, expect } from '@playwright/test';
import { getAuthToken, API_BASE_URL } from './helpers';

test.describe('Traceability (Legacy Page)', () => {
  test('TC-TRACE-LEGACY-001: /traceability page still loads (backward compat)', async ({ page }) => {
    await page.goto('/traceability');
    await expect(page.getByText(/traceability/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByPlaceholder(/enter barcode/i)).toBeVisible();
  });

  test('TC-TRACE-LEGACY-002: Trace API returns valid structure for child box', async ({ request }) => {
    const token = await getAuthToken(request);
    // Get a child box barcode
    const cbRes = await request.get(`${API_BASE_URL}/child-boxes?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cbData = await cbRes.json();
    if (!cbData.data || cbData.data.length === 0) {
      test.skip();
      return;
    }
    const barcode = cbData.data[0].barcode;

    const traceRes = await request.get(`${API_BASE_URL}/inventory/trace/${barcode}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(traceRes.status()).toBe(200);
    const result = (await traceRes.json()).data;
    expect(result.childBox).toBeDefined();
    expect(result.childBox.barcode).toBe(barcode);
    expect(result.timeline).toBeDefined();
    expect(Array.isArray(result.timeline)).toBe(true);
  });

  test('TC-TRACE-LEGACY-003: Trace API for master carton returns no childBox (regression)', async ({ request }) => {
    const token = await getAuthToken(request);
    // Get a master carton barcode
    const mcRes = await request.get(`${API_BASE_URL}/master-cartons?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mcData = await mcRes.json();
    if (!mcData.data || mcData.data.length === 0) {
      test.skip();
      return;
    }
    const barcode = mcData.data[0].carton_barcode;

    const traceRes = await request.get(`${API_BASE_URL}/inventory/trace/${barcode}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(traceRes.status()).toBe(200);
    const result = (await traceRes.json()).data;
    expect(result.childBox).toBeUndefined();
    expect(result.masterCarton).toBeDefined();
    expect(result.timeline).toBeDefined();
  });
});
