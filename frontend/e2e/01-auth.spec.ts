import { test, expect } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_PASSWORD } from './helpers';

test.describe('TC-AUTH: Authentication & Authorization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('Binny Inventory')).toBeVisible();
  });

  test('TC-AUTH-001: Login with valid Admin credentials', async ({ page }) => {
    await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Dashboard redirect: /dashboard → / (route group)
    // First login can be slow — wait for dashboard data to load
    await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 30000 });
  });

  test('TC-AUTH-003: Login with invalid email', async ({ page }) => {
    await page.getByLabel('Email Address').fill('nonexistent@test.com');
    await page.getByLabel('Password').fill('SomePassword123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should show error toast - stay on login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('TC-AUTH-004: Login with wrong password', async ({ page }) => {
    await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill('WrongPassword');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Should stay on login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('TC-AUTH-007: Empty form validation', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('TC-AUTH-008: Invalid email format validation', async ({ page }) => {
    // Disable HTML5 form validation so our custom JS validation runs
    await page.locator('form').evaluate((form) => form.setAttribute('novalidate', ''));

    await page.getByLabel('Email Address').fill('not-an-email');
    await page.getByLabel('Password').fill('SomePassword123');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Please enter a valid email')).toBeVisible();
  });

  test('TC-AUTH-009: Short password validation', async ({ page }) => {
    await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
    await page.getByLabel('Password').fill('12345');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByText('Password must be at least 6 characters')).toBeVisible();
  });

  test('TC-AUTH-010: Password visibility toggle', async ({ page }) => {
    const passwordInput = page.getByLabel('Password');
    await passwordInput.fill('TestPassword');

    // Default: password is hidden
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click eye icon to show
    await page.locator('button[tabindex="-1"]').click();
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide
    await page.locator('button[tabindex="-1"]').click();
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('TC-AUTH-011: Unauthenticated redirect to login', async ({ page }) => {
    // Navigate to login first so we can clear localStorage
    await page.goto('/login');
    await page.evaluate(() => {
      localStorage.removeItem('binny_token');
      localStorage.removeItem('binny_user');
    });

    // Try to access a protected page
    await page.goto('/');
    // Should redirect to login
    await page.waitForURL('**/login', { timeout: 10000 });
  });
});
