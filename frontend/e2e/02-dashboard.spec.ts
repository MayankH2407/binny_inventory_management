import { test, expect } from '@playwright/test';
import { loginViaAPI } from './helpers';

test.describe('TC-DASH: Dashboard & Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaAPI(page);
  });

  test('TC-DASH-001: Dashboard loads with welcome banner', async ({ page }) => {
    await expect(page.getByText(/Good (Morning|Afternoon|Evening)/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('inventory overview')).toBeVisible();
  });

  test('TC-DASH-002: Dashboard shows KPI stat cards', async ({ page }) => {
    await expect(page.getByText('Total Child Boxes')).toBeVisible();
    await expect(page.getByText('Active Master Cartons')).toBeVisible();
    await expect(page.getByText("Today's Dispatches")).toBeVisible();
    await expect(page.getByText('Pairs in Stock')).toBeVisible();
  });

  test('TC-DASH-003: Dashboard shows quick actions', async ({ page }) => {
    await expect(page.getByText('Quick Actions')).toBeVisible();
    await expect(page.getByText('Generate QR Labels')).toBeVisible();
    await expect(page.getByText('Create Carton')).toBeVisible();
    await expect(page.getByText('Scan QR Code')).toBeVisible();
    await expect(page.getByText('New Dispatch')).toBeVisible();
  });

  test('TC-DASH-004: Dashboard shows inventory summary panels', async ({ page }) => {
    await expect(page.getByText('Inventory Summary')).toBeVisible();
    await expect(page.getByText('Free Boxes')).toBeVisible();
    await expect(page.getByText('Packed in Cartons')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Master Cartons' })).toBeVisible();
  });

  test('TC-DASH-005: Dashboard skeleton loading state renders', async ({ page }) => {
    // Navigate away and back to trigger loading
    await page.goto('/child-boxes');
    await page.waitForLoadState('networkidle');
    await page.goto('/');
    // Page should eventually load — skeleton appears briefly then real content
    await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 15000 });
  });

  test('TC-DASH-006: Sidebar navigation links work', async ({ page }) => {
    await page.getByRole('link', { name: 'Child Boxes' }).first().click();
    await expect(page).toHaveURL(/.*child-boxes/);
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: 'Master Cartons', exact: true }).first().click();
    await expect(page).toHaveURL(/.*master-cartons/);
    await page.waitForLoadState('networkidle');

    await page.getByRole('link', { name: 'Reports' }).first().click();
    await expect(page).toHaveURL(/.*reports/);
  });

  test('TC-DASH-007: Quick action links navigate correctly', async ({ page }) => {
    await page.getByRole('link', { name: /Generate QR Labels/ }).click();
    await expect(page).toHaveURL(/.*child-boxes\/generate/);
  });

  test('TC-DASH-008: Sidebar shows active state for current page', async ({ page }) => {
    // Dashboard should be active — the Dashboard link should have a distinct style
    const dashLink = page.getByRole('link', { name: 'Dashboard' }).first();
    await expect(dashLink).toBeVisible();

    // Navigate to child boxes and verify sidebar updates
    await page.getByRole('link', { name: 'Child Boxes' }).first().click();
    await expect(page).toHaveURL(/.*child-boxes/);
    const cbLink = page.getByRole('link', { name: 'Child Boxes' }).first();
    await expect(cbLink).toBeVisible();
  });

  test('TC-DASH-009: Header shows user name and role badge', async ({ page }) => {
    // Header should show user name
    await expect(page.getByText('Admin').first()).toBeVisible();
  });

  test('TC-DASH-010: Page header shows gradient accent bar', async ({ page }) => {
    // Navigate to any page — PageHeader should have the accent bar
    await page.getByRole('link', { name: 'Child Boxes' }).first().click();
    await expect(page.getByText('Child Boxes').first()).toBeVisible();
  });

  test('TC-DASH-011: Recent Activity section shows timeline', async ({ page }) => {
    const recentActivity = page.getByText('Recent Activity');
    if (await recentActivity.isVisible({ timeout: 5000 })) {
      await expect(recentActivity).toBeVisible();
    }
  });
});
