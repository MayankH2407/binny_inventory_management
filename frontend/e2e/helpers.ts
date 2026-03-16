import { Page, expect } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@binny.com';
export const ADMIN_PASSWORD = 'Admin@123';
export const BASE_API = 'http://localhost:3001/api/v1';

// Cache login credentials across tests to avoid rate limiting
let cachedToken: string | null = null;
let cachedUser: object | null = null;

async function fetchLoginCredentials(page: Page): Promise<{ token: string; user: object }> {
  if (cachedToken && cachedUser) {
    return { token: cachedToken, user: cachedUser };
  }

  const response = await page.request.post(`${BASE_API}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  if (!response.ok()) {
    throw new Error(`Login API failed: ${response.status()} ${await response.text()}`);
  }

  const body = await response.json();
  cachedToken = body.data.accessToken;
  cachedUser = body.data.user;
  return { token: cachedToken!, user: cachedUser! };
}

/**
 * Login via UI and wait for dashboard to load
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 15000 });
}

/**
 * Login via API and set localStorage tokens (faster for non-auth tests).
 * Uses addInitScript to set tokens before page JS runs.
 */
export async function loginViaAPI(page: Page) {
  const { token, user } = await fetchLoginCredentials(page);

  // Set localStorage via init script so it's available before any page JS executes
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('binny_token', token);
      localStorage.setItem('binny_user', JSON.stringify(user));
    },
    { token, user }
  );

  // Navigate to root (dashboard)
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 15000 });
}

/**
 * Get auth token for direct API calls
 */
export async function getAuthToken(page: Page): Promise<string> {
  const { token } = await fetchLoginCredentials(page);
  return token;
}

/**
 * Navigate to a page via sidebar link
 */
export async function navigateTo(page: Page, label: string) {
  await page.getByRole('link', { name: label }).first().click();
  await page.waitForLoadState('networkidle');
}
