import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers';

test.describe('TC-DASH: Dashboard & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-DASH-001: Dashboard loads with KPI stat cards', async ({ page }) => {
    await expect(page.getByText('Total Child Boxes')).toBeVisible();
    await expect(page.getByText('Active Master Cartons')).toBeVisible();
    await expect(page.getByText("Today's Dispatches")).toBeVisible();
    await expect(page.getByText('Pairs in Stock')).toBeVisible();
  });

  test('TC-DASH-002: Dashboard shows quick actions', async ({ page }) => {
    await expect(page.getByText('Quick Actions')).toBeVisible();
    await expect(page.getByText('Generate QR Labels')).toBeVisible();
    await expect(page.getByText('Create Carton')).toBeVisible();
    await expect(page.getByText('Scan QR Code')).toBeVisible();
    await expect(page.getByText('New Dispatch')).toBeVisible();
  });

  test('TC-DASH-003: Dashboard shows inventory summary panels', async ({ page }) => {
    await expect(page.getByText('Inventory Summary')).toBeVisible();
    await expect(page.getByText('Free Boxes')).toBeVisible();
    await expect(page.getByText('Packed in Cartons')).toBeVisible();
  });

  test('TC-DASH-004: Sidebar navigation links work', async ({ page }) => {
    // Navigate to Child Boxes
    await page.getByRole('link', { name: 'Child Boxes' }).first().click();
    await expect(page).toHaveURL(/.*child-boxes/);
    await expect(page.getByText('Child Boxes').first()).toBeVisible();

    // Navigate to Master Cartons
    await page.getByRole('link', { name: 'Master Cartons' }).first().click();
    await expect(page).toHaveURL(/.*master-cartons/);

    // Navigate to Reports
    await page.getByRole('link', { name: 'Reports' }).first().click();
    await expect(page).toHaveURL(/.*reports/);
  });

  test('TC-DASH-005: Quick action links navigate correctly', async ({ page }) => {
    await page.getByRole('link', { name: /Generate QR Labels/ }).click();
    await expect(page).toHaveURL(/.*child-boxes\/generate/);
  });
});
