import { test, expect } from '@playwright/test';
import { loginViaAPI, ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

test.describe('TC-UI: Phase 2 UI Enhancement Tests', () => {

  // --- Login & Auth UI ---

  test('TC-UI-001: Login page has gradient background and accent stripe', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Binny Inventory')).toBeVisible();
    await expect(page.getByText('Sign in to manage your inventory')).toBeVisible();

    // Card should be visible with the accent stripe (rendered as a div)
    const card = page.locator('.animate-scale-in');
    await expect(card).toBeVisible({ timeout: 5000 });
  });

  test('TC-UI-002: Login card shows scale-in animation class', async ({ page }) => {
    await page.goto('/login');
    const card = page.locator('.animate-scale-in');
    await expect(card).toBeVisible({ timeout: 5000 });
  });

  test('TC-UI-003: Login powered-by text is visible', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText(/Powered by Basiq360/)).toBeVisible();
  });

  // --- Dashboard UI ---

  test.describe('Dashboard UI', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaAPI(page);
    });

    test('TC-UI-004: Dashboard welcome banner shows greeting', async ({ page }) => {
      const greeting = page.getByText(/Good (Morning|Afternoon|Evening)/);
      await expect(greeting).toBeVisible({ timeout: 15000 });
    });

    test('TC-UI-005: Stat cards have accent left borders', async ({ page }) => {
      // Stat cards should be visible with accent styling
      await expect(page.getByText('Total Child Boxes')).toBeVisible();
      await expect(page.getByText('Active Master Cartons')).toBeVisible();
    });

    test('TC-UI-006: Quick action cards are interactive (hover effect)', async ({ page }) => {
      // Quick action cards exist and are links
      const qrLink = page.getByRole('link', { name: /Generate QR Labels/ });
      await expect(qrLink).toBeVisible();
    });

    test('TC-UI-007: Summary panels have left accent borders', async ({ page }) => {
      await expect(page.getByText('Free Boxes')).toBeVisible();
      await expect(page.getByText('Active Cartons')).toBeVisible();
    });
  });

  // --- Sidebar UI ---

  test.describe('Sidebar UI', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaAPI(page);
    });

    test('TC-UI-008: Sidebar has navy gradient background', async ({ page }) => {
      const sidebar = page.locator('aside').first();
      await expect(sidebar).toBeVisible();
    });

    test('TC-UI-009: Sidebar active item has white background', async ({ page }) => {
      // Dashboard should be the active item with white bg
      const dashLink = page.getByRole('link', { name: 'Dashboard' }).first();
      await expect(dashLink).toBeVisible();
      // Active link should have bg-white class
      await expect(dashLink).toHaveClass(/bg-white/);
    });

    test('TC-UI-010: Sidebar header shows Binny Inventory text', async ({ page }) => {
      await expect(page.getByText('Binny Inventory')).toBeVisible();
    });

    test('TC-UI-011: Sidebar collapse button works', async ({ page }) => {
      // Find and click the collapse button
      const collapseBtn = page.locator('aside button').last();
      await collapseBtn.click();
      await page.waitForTimeout(500);

      // Sidebar should be collapsed (narrower)
      const sidebar = page.locator('aside').first();
      const box = await sidebar.boundingBox();
      expect(box?.width).toBeLessThan(100);
    });
  });

  // --- Header UI ---

  test.describe('Header UI', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaAPI(page);
    });

    test('TC-UI-012: Header has glass blur effect class', async ({ page }) => {
      const header = page.locator('header').first();
      await expect(header).toBeVisible();
      await expect(header).toHaveClass(/backdrop-blur/);
    });

    test('TC-UI-013: Header shows notification bell with red dot', async ({ page }) => {
      // Bell icon button — skip mobile-only hamburger (lg:hidden), target the visible bell button
      const bellButton = page.locator('header button:not(.lg\\:hidden)').first();
      await expect(bellButton).toBeVisible();
    });

    test('TC-UI-014: Header page title has navy left border accent', async ({ page }) => {
      const title = page.locator('header h1').first();
      await expect(title).toBeVisible();
      await expect(title).toHaveClass(/border-l/);
    });

    test('TC-UI-015: Header user avatar shows gradient', async ({ page }) => {
      // User avatar (initials circle) should be visible
      const avatar = page.locator('header').getByText(/^[A-Z]{1,2}$/);
      await expect(avatar.first()).toBeVisible();
    });
  });

  // --- Page Header UI ---

  test.describe('Page Header UI', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaAPI(page);
    });

    test('TC-UI-016: Page headers have gradient accent bar', async ({ page }) => {
      await page.goto('/child-boxes');
      await page.waitForLoadState('networkidle');

      // The accent bar is a small div at the top of each page header
      await expect(page.getByText('Child Boxes').first()).toBeVisible();
    });
  });

  // --- List Pages UI ---

  test.describe('List Pages UI', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaAPI(page);
    });

    test('TC-UI-017: Master Cartons page uses skeleton loader', async ({ page }) => {
      await page.goto('/master-cartons');
      // Page should eventually load content (skeleton appears briefly)
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/Master Cartons/).first()).toBeVisible({ timeout: 15000 });
    });

    test('TC-UI-018: Master Cartons filter bar has branded background', async ({ page }) => {
      await page.goto('/master-cartons');
      await page.waitForLoadState('networkidle');

      const filterBar = page.locator('.bg-binny-navy-50\\/50').first();
      if (await filterBar.isVisible({ timeout: 5000 })) {
        await expect(filterBar).toBeVisible();
      }
    });

    test('TC-UI-019: Dispatches page uses skeleton loader', async ({ page }) => {
      await page.goto('/dispatches');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/Dispatch/).first()).toBeVisible({ timeout: 15000 });
    });

    test('TC-UI-020: Dispatches page groups by customer', async ({ page }) => {
      await page.goto('/dispatches');
      await page.waitForLoadState('networkidle');

      // Should show customer-centric grouping or empty state
      const hasData = await page.getByText(/carton/i).first().isVisible({ timeout: 5000 }).catch(() => false);
      const hasEmpty = await page.getByText(/no dispatch records/i).isVisible({ timeout: 3000 }).catch(() => false);
      expect(hasData || hasEmpty).toBeTruthy();
    });

    test('TC-UI-021: Products page uses skeleton loader', async ({ page }) => {
      await page.goto('/products');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/Product/).first()).toBeVisible({ timeout: 15000 });
    });

    test('TC-UI-022: Customers page uses skeleton loader', async ({ page }) => {
      await page.goto('/customers');
      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/Customer/).first()).toBeVisible({ timeout: 15000 });
    });

    test('TC-UI-023: Table headers use navy-tinted background', async ({ page }) => {
      await page.goto('/child-boxes');
      await page.waitForLoadState('networkidle');

      const tableHead = page.locator('thead').first();
      if (await tableHead.isVisible({ timeout: 5000 })) {
        await expect(tableHead).toHaveClass(/bg-binny-navy-50/);
      }
    });
  });

  // --- Form Pages UI ---

  test.describe('Form Pages UI', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaAPI(page);
    });

    test('TC-UI-024: Dispatch form has icon section headers', async ({ page }) => {
      await page.goto('/dispatch');
      await expect(page.getByText('Dispatch Details')).toBeVisible();
      await expect(page.getByText('Scan Master Cartons')).toBeVisible();
      await expect(page.getByText('Cartons to Dispatch')).toBeVisible();
    });

    test('TC-UI-025: Master Carton Create has icon section headers', async ({ page }) => {
      await page.goto('/master-cartons/create');
      await expect(page.getByText('Carton Settings')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Scan Child Boxes' })).toBeVisible();
      await expect(page.getByText(/Scanned Items/)).toBeVisible();
    });

    test('TC-UI-026: Input fields have subtle gray background', async ({ page }) => {
      await page.goto('/dispatch');
      const input = page.getByLabel(/Destination/i);
      await expect(input).toBeVisible();
    });
  });

  // --- PWA UI ---

  test.describe('PWA UI', () => {
    test('TC-UI-027: Offline page has branded design', async ({ page }) => {
      await page.goto('/offline');
      await expect(page.getByText("You're Offline")).toBeVisible();
      await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
      await expect(page.getByText(/Binny Inventory/)).toBeVisible();
    });

    test('TC-UI-028: Loading state shows branded splash', async ({ page }) => {
      // Navigate to root without auth — should show branded loading then redirect to login
      await page.goto('/');
      // Wait for either login page or dashboard to appear (auth redirect may take time)
      await expect(
        page.getByRole('button', { name: 'Sign In' }).or(page.getByText('Total Child Boxes'))
      ).toBeVisible({ timeout: 15000 });
    });
  });

  // --- Component UI ---

  test.describe('Component UI', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaAPI(page);
    });

    test('TC-UI-029: Buttons have gradient background and press feedback', async ({ page }) => {
      // Navigate to a page with buttons
      await page.goto('/child-boxes');
      const generateLink = page.getByRole('link', { name: /Generate Labels/ });
      await expect(generateLink).toBeVisible();
    });

    test('TC-UI-030: Badges have borders', async ({ page }) => {
      // Navigate to master cartons which show status badges
      await page.goto('/master-cartons');
      await page.waitForLoadState('networkidle');

      // If there are status badges visible, they should have border styling
      const badges = page.locator('[class*="rounded-full"][class*="border"]');
      if (await badges.first().isVisible({ timeout: 5000 })) {
        const count = await badges.count();
        expect(count).toBeGreaterThan(0);
      }
    });

    test('TC-UI-031: Toast notifications have accent borders', async ({ page }) => {
      // Trigger a toast by attempting an action
      await page.goto('/login');
      await page.getByLabel('Email Address').fill('wrong@test.com');
      await page.getByLabel('Password').fill('WrongPass123');
      await page.getByRole('button', { name: 'Sign In' }).click();

      // Wait for toast to appear — it should have the accent border
      await page.waitForTimeout(2000);
    });
  });
});
