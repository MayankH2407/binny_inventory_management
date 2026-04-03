import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers';

test.describe('TC-CUST: Customer Master', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
    // Navigate to customers via sidebar (stays in dashboard layout)
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

  test('TC-CUST-003: Create customer with required fields', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    const firmName = `Test Firm ${Date.now()}`;
    await page.getByLabel(/firm name/i).fill(firmName);
    await page.getByLabel(/^address$/i).fill('Test Address 123');
    await page.getByLabel(/delivery location/i).fill('Test Location');

    await page.getByRole('button', { name: /create customer/i }).click();
    await page.waitForTimeout(2000);
  });

  test('TC-CUST-004: GSTIN validation rejects invalid format', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    await page.getByLabel(/firm name/i).fill('GSTIN Test Firm');
    await page.getByLabel(/gstin/i).fill('ABC123');
    await page.getByRole('button', { name: /create customer/i }).click();

    await expect(page.getByText(/invalid gstin/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-CUST-005: Mobile number validation rejects short numbers', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    await page.getByLabel(/firm name/i).fill('Mobile Test Firm');
    await page.getByLabel(/mobile/i).fill('12345');
    await page.getByRole('button', { name: /create customer/i }).click();

    await expect(page.getByText(/invalid mobile|must be.*digit|mobile.*invalid/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-CUST-008: Search customers by firm name', async ({ page }) => {
    await expect(page.getByPlaceholder(/search/i)).toBeVisible({ timeout: 10000 });
    await page.getByPlaceholder(/search/i).fill('Test');
    await page.waitForTimeout(1000);
  });

  test('TC-CUST-009: Customer modal has all expected fields', async ({ page }) => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await expect(page.getByLabel(/firm name/i)).toBeVisible({ timeout: 5000 });

    await expect(page.getByLabel(/^address$/i)).toBeVisible();
    await expect(page.getByLabel(/delivery location/i)).toBeVisible();
    await expect(page.getByLabel(/gstin/i)).toBeVisible();
    await expect(page.getByLabel(/private marka/i)).toBeVisible();
    await expect(page.getByLabel(/gr/i)).toBeVisible();
    await expect(page.getByLabel(/contact person name/i)).toBeVisible();
    await expect(page.getByLabel(/mobile/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();
  });
});
