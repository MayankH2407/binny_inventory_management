import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers';

test.describe('TC-SCAN: Scan Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-SCAN-001: Scan page loads', async ({ page }) => {
    await page.goto('/scan');
    await expect(page.getByText(/Scan/i).first()).toBeVisible();
  });

  test('TC-SCAN-002: Has manual barcode input', async ({ page }) => {
    await page.goto('/scan');
    const input = page.getByPlaceholder(/barcode|qr|code/i).first();
    await expect(input).toBeVisible();
  });

  test('TC-SCAN-003: Has search/lookup button', async ({ page }) => {
    await page.goto('/scan');
    const btn = page.getByRole('button', { name: /search|lookup|scan|find/i }).first();
    await expect(btn).toBeVisible();
  });

  test('TC-SCAN-004: Scan page shows updated description', async ({ page }) => {
    await page.goto('/scan');
    await expect(page.getByText(/quick item lookup/i)).toBeVisible({ timeout: 10000 });
  });
});
