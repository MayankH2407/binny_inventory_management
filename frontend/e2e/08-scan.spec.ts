import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

test.describe('TC-SCANTRACE: Scan & Trace Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  // ──────────────────────────────────────────────
  // Layout / Static content tests
  // ──────────────────────────────────────────────

  test('TC-SCANTRACE-001: Page loads with HID barcode scanner input and camera toggle', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // HID-first UI: a barcode input (primary) + a "Use Camera Instead" fallback toggle
    await expect(page.getByPlaceholder(/scan barcode to trace/i).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /use camera instead/i })).toBeVisible({ timeout: 10000 });
  });

  test('TC-SCANTRACE-002: Page title is "Scan & Trace"', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Scan & Trace').first()).toBeVisible({ timeout: 10000 });
  });

  test('TC-SCANTRACE-003: Barcode input and Add button visible', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Input placeholder (HIDScannerInput)
    const input = page.getByPlaceholder(/scan barcode to trace/i).first();
    await expect(input).toBeVisible({ timeout: 10000 });

    // Add button (submits the typed/scanned barcode)
    const addBtn = page.getByRole('button', { name: /add/i });
    await expect(addBtn.first()).toBeVisible({ timeout: 10000 });
  });

  test('TC-SCANTRACE-004: Enter key triggers lookup (keyboard event)', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    const input = page.getByPlaceholder(/scan barcode to trace/i).first();
    await input.fill('NONEXISTENT-BARCODE-12345');

    // Press Enter — triggers a trace lookup. A nonexistent barcode surfaces an
    // "item not found" error toast (the empty-state panel stays for a failed lookup).
    await input.press('Enter');

    await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 15000 });
  });

  test('TC-SCANTRACE-005: Empty state shows placeholder text before any scan', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Placeholder heading
    await expect(page.getByText('Scan or Enter a Barcode')).toBeVisible({ timeout: 10000 });

    // Descriptive sub-text
    await expect(
      page.getByText(/view current status.*lifecycle timeline.*take actions/i)
    ).toBeVisible({ timeout: 10000 });
  });

  // ──────────────────────────────────────────────
  // Child box lookup
  // ──────────────────────────────────────────────

  test('TC-SCANTRACE-006: Lookup child box barcode via API shows child box details card', async ({ page }) => {
    const token = await getAuthToken(page);

    // Fetch a real child box barcode from the API
    const cbResponse = await page.request.get(`${BASE_API}/child-boxes?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cbBody = await cbResponse.json();

    if (!cbBody.data || cbBody.data.length === 0) {
      test.skip();
      return;
    }

    const barcode = cbBody.data[0].barcode;

    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    const input = page.getByPlaceholder(/scan barcode to trace/i).first();
    await input.fill(barcode);
    await page.getByRole("button", { name: /add/i }).click();

    // Child Box card should appear
    await expect(page.getByText('Child Box').first()).toBeVisible({ timeout: 15000 });

    // The scanned barcode should appear in the card
    await expect(page.getByText(barcode)).toBeVisible({ timeout: 10000 });
  });

  test('TC-SCANTRACE-007: Child Box card shows barcode, product, SKU, status fields', async ({ page }) => {
    const token = await getAuthToken(page);

    const cbResponse = await page.request.get(`${BASE_API}/child-boxes?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cbBody = await cbResponse.json();

    if (!cbBody.data || cbBody.data.length === 0) {
      test.skip();
      return;
    }

    const cb = cbBody.data[0];

    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    const input = page.getByPlaceholder(/scan barcode to trace/i).first();
    await input.fill(cb.barcode);
    await page.getByRole("button", { name: /add/i }).click();

    // Wait for results
    await expect(page.getByText('Child Box').first()).toBeVisible({ timeout: 15000 });

    // Verify all key field labels are shown in the card
    await expect(page.getByText('Barcode').first()).toBeVisible();
    await expect(page.getByText('Product').first()).toBeVisible();
    await expect(page.getByText('SKU').first()).toBeVisible();
    await expect(page.getByText('Status').first()).toBeVisible();
  });

  // ──────────────────────────────────────────────
  // Master carton lookup
  // ──────────────────────────────────────────────

  test('TC-SCANTRACE-008: Lookup master carton barcode via API shows Master Carton card', async ({ page }) => {
    const token = await getAuthToken(page);

    const mcResponse = await page.request.get(`${BASE_API}/master-cartons?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mcBody = await mcResponse.json();

    if (!mcBody.data || mcBody.data.length === 0) {
      test.skip();
      return;
    }

    const carton = mcBody.data[0];
    const barcode = carton.carton_barcode;

    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    const input = page.getByPlaceholder(/scan barcode to trace/i).first();
    await input.fill(barcode);
    await page.getByRole("button", { name: /add/i }).click();

    // Master Carton card should appear
    await expect(page.getByText('Master Carton').first()).toBeVisible({ timeout: 15000 });
  });

  test('TC-SCANTRACE-009: ACTIVE master carton shows "Seal for Storage" button', async ({ page }) => {
    const token = await getAuthToken(page);

    // Look for an ACTIVE master carton
    const mcResponse = await page.request.get(`${BASE_API}/master-cartons?status=ACTIVE&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const mcBody = await mcResponse.json();

    if (!mcBody.data || mcBody.data.length === 0) {
      test.skip();
      return;
    }

    const carton = mcBody.data[0];

    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    const input = page.getByPlaceholder(/scan barcode to trace/i).first();
    await input.fill(carton.carton_barcode);
    await page.getByRole("button", { name: /add/i }).click();

    // Wait for the Master Carton card to load
    await expect(page.getByText('Master Carton').first()).toBeVisible({ timeout: 15000 });

    // Seal for Storage button should be visible for ACTIVE cartons
    await expect(page.getByRole('button', { name: /seal for storage/i })).toBeVisible({ timeout: 10000 });
  });

  // ──────────────────────────────────────────────
  // Timeline
  // ──────────────────────────────────────────────

  test('TC-SCANTRACE-010: Timeline section displays after lookup', async ({ page }) => {
    const token = await getAuthToken(page);

    const cbResponse = await page.request.get(`${BASE_API}/child-boxes?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cbBody = await cbResponse.json();

    if (!cbBody.data || cbBody.data.length === 0) {
      test.skip();
      return;
    }

    const barcode = cbBody.data[0].barcode;

    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    const input = page.getByPlaceholder(/scan barcode to trace/i).first();
    await input.fill(barcode);
    await page.getByRole("button", { name: /add/i }).click();

    // Timeline heading should appear after results load
    await expect(page.getByText('Timeline').first()).toBeVisible({ timeout: 15000 });
  });

  // ──────────────────────────────────────────────
  // Actions
  // ──────────────────────────────────────────────

  test('TC-SCANTRACE-011: "Clear & Scan Another" button resets results', async ({ page }) => {
    const token = await getAuthToken(page);

    const cbResponse = await page.request.get(`${BASE_API}/child-boxes?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const cbBody = await cbResponse.json();

    if (!cbBody.data || cbBody.data.length === 0) {
      test.skip();
      return;
    }

    const barcode = cbBody.data[0].barcode;

    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // Perform a lookup to produce results
    const input = page.getByPlaceholder(/scan barcode to trace/i).first();
    await input.fill(barcode);
    await page.getByRole("button", { name: /add/i }).click();

    // Wait for results to appear
    await expect(page.getByText('Child Box').first()).toBeVisible({ timeout: 15000 });

    // Click the clear button
    await page.getByRole('button', { name: /clear & scan another/i }).click();

    // Empty state should be visible again
    await expect(page.getByText('Scan or Enter a Barcode')).toBeVisible({ timeout: 10000 });
  });

  test('TC-SCANTRACE-012: Full-screen scan button is present', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // The QRScanner component renders a full-screen toggle button
    // It may render as a button with an aria-label or title related to "full" / "expand" / "screen"
    const fullScreenBtn = page.locator('button[aria-label*="full" i], button[title*="full" i], button[aria-label*="expand" i], button[title*="expand" i]').first();
    await expect(fullScreenBtn).toBeVisible({ timeout: 10000 });
  });

  // ──────────────────────────────────────────────
  // Navigation
  // ──────────────────────────────────────────────

  test('TC-SCANTRACE-013: Sidebar shows "Scan & Trace" nav item', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    // The sidebar nav link for this module should read "Scan & Trace"
    await expect(page.getByRole('link', { name: /scan & trace/i }).first()).toBeVisible({ timeout: 10000 });
  });

  // ──────────────────────────────────────────────
  // Error handling
  // ──────────────────────────────────────────────

  test('TC-SCANTRACE-014: Non-existent barcode shows error toast', async ({ page }) => {
    await page.goto('/scan');
    await page.waitForLoadState('networkidle');

    const input = page.getByPlaceholder(/scan barcode to trace/i).first();
    await input.fill('DOES-NOT-EXIST-XYZ-99999');
    await page.getByRole("button", { name: /add/i }).click();

    // An error toast should appear
    await expect(page.getByText(/item not found/i)).toBeVisible({ timeout: 15000 });
  });
});
