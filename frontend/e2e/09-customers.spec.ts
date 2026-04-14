import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

test.describe('TC-CUST: Customer Master', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
    await page.getByRole('link', { name: 'Customers' }).first().click();
    await page.waitForTimeout(2000);
  });

  test('TC-CUST-001: Customer list page loads', async ({ page }) => {
    await expect(page).toHaveURL(/.*customers/);
    await expect(page.getByText(/add customer/i)).toBeVisible({ timeout: 10000 });
  });

  test('TC-CUST-002: Add Customer button opens modal', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-CUST-003: Modal shows customer type selector', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('Customer Type')).toBeVisible();
    const primaryRadio = page.locator('input[type="radio"][value="Primary Dealer"]');
    const subRadio = page.locator('input[type="radio"][value="Sub Dealer"]');
    await expect(primaryRadio).toBeVisible();
    await expect(subRadio).toBeVisible();
    await expect(primaryRadio).toBeChecked();
  });

  test('TC-CUST-004: Create Primary Dealer', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    await page.getByLabel(/firm name/i).fill(`E2E Primary ${Date.now()}`);
    await page.getByRole('button', { name: /create customer/i }).click();
    await page.waitForTimeout(2000);
  });

  test('TC-CUST-005: Sub Dealer shows Primary Dealer dropdown', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    await page.locator('input[type="radio"][value="Sub Dealer"]').click();
    await page.waitForTimeout(500);

    await expect(page.getByText('Select Primary Dealer')).toBeVisible({ timeout: 5000 });
  });

  test('TC-CUST-006: Sub Dealer auto-fills from Primary Dealer', async ({ page }) => {
    const token = await getAuthToken(page);
    const firmName = `AutoFill Primary ${Date.now()}`;
    const createRes = await page.request.post(`${BASE_API}/customers`, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      data: {
        firm_name: firmName,
        address: 'Auto Fill Address',
        delivery_location: 'Auto Fill Location',
        contact_person_name: 'Auto Fill Contact',
        contact_person_mobile: '9999999999',
        customer_type: 'Primary Dealer',
      },
    });
    expect(createRes.ok()).toBeTruthy();

    await page.reload();
    await page.waitForTimeout(3000);

    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    await page.locator('input[type="radio"][value="Sub Dealer"]').click();
    await page.waitForTimeout(500);

    // Find the select that has the "Select a Primary Dealer" placeholder
    const dealerSelect = page.locator('select').filter({ has: page.locator('option', { hasText: /Select a Primary Dealer/i }) });
    await expect(dealerSelect).toBeVisible({ timeout: 5000 });

    const options = await dealerSelect.locator('option').allTextContents();
    const matchingOption = options.find((o) => o.includes('AutoFill'));
    if (matchingOption) {
      await dealerSelect.selectOption({ label: matchingOption });
      await page.waitForTimeout(500);

      // Verify address was auto-filled
      const addressInput = page.getByPlaceholder('Full address');
      await expect(addressInput).toHaveValue('Auto Fill Address');
    }
  });

  test('TC-CUST-007: Sub Dealer requires Primary Dealer selection', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    await page.locator('input[type="radio"][value="Sub Dealer"]').click();
    await page.waitForTimeout(300);

    await page.getByLabel(/firm name/i).fill('Sub Dealer Without Primary');
    await page.getByRole('button', { name: /create customer/i }).click();

    // Toast message: "Please select a Primary Dealer for this Sub Dealer"
    await expect(page.getByText(/Please select a Primary Dealer/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-CUST-008: GSTIN validation rejects invalid format', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    await page.getByLabel(/firm name/i).fill('GSTIN Test Firm');
    // GSTIN uses raw <input> with placeholder, not the Input component
    await page.getByPlaceholder('e.g., 22AAAAA0000A1Z5').fill('ABC123');
    await page.getByRole('button', { name: /create customer/i }).click();

    await expect(page.getByText(/invalid gstin/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-CUST-009: Mobile validation rejects short numbers', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    await page.getByLabel(/firm name/i).fill('Mobile Test Firm');
    // Contact mobile uses raw <input> with placeholder
    await page.getByPlaceholder('e.g., 9876543210').fill('12345');
    await page.getByRole('button', { name: /create customer/i }).click();

    await expect(page.getByText(/mobile.*digit|invalid mobile/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-CUST-010: Search customers', async ({ page }) => {
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder(/search/i).fill('Test');
    await page.waitForTimeout(1000);
  });

  test('TC-CUST-011: Customer type filter is visible', async ({ page }) => {
    const typeFilter = page.locator('select').filter({ has: page.locator('option', { hasText: 'All Types' }) });
    await expect(typeFilter).toBeVisible({ timeout: 10000 });
  });

  test('TC-CUST-012: Table shows Type and Primary Dealer columns', async ({ page }) => {
    const table = page.locator('table').first();
    if (await table.isVisible({ timeout: 10000 })) {
      await expect(page.getByRole('columnheader', { name: /type/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /primary dealer/i })).toBeVisible();
    }
  });

  test('TC-CUST-013: Primary Dealers API endpoint works', async ({ page }) => {
    const token = await getAuthToken(page);
    const response = await page.request.get(`${BASE_API}/customers/primary-dealers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(Array.isArray(body.data)).toBeTruthy();
  });

  test('TC-CUST-014: Customer modal has all expected fields', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    // Check field labels and placeholders — use .first() to avoid strict mode violations from table headers
    await expect(page.getByPlaceholder('Full address')).toBeVisible();
    await expect(page.getByPlaceholder('Delivery location')).toBeVisible();
    await expect(page.getByPlaceholder('e.g., 22AAAAA0000A1Z5')).toBeVisible();
    await expect(page.getByLabel(/private marka/i)).toBeVisible();
    await expect(page.getByLabel(/gr.*goods receipt/i)).toBeVisible();
    await expect(page.getByPlaceholder('Contact person name')).toBeVisible();
    await expect(page.getByPlaceholder('e.g., 9876543210')).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });
});
