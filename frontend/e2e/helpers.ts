import { Page, APIRequestContext, expect } from '@playwright/test';

export const ADMIN_EMAIL = 'admin@binny.com';
export const ADMIN_PASSWORD = 'Admin@123';
export const BASE_API = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3001/api/v1';
/** Alias for BASE_API — used by tests that import { API_BASE_URL } */
export const API_BASE_URL = BASE_API;

// Cache login credentials across tests to avoid rate limiting
let cachedToken: string | null = null;
let cachedUser: object | null = null;
let tokenTimestamp: number = 0;
const TOKEN_MAX_AGE_MS = 10 * 60 * 1000; // Refresh token after 10 minutes

async function fetchLoginCredentials(requestContext: Page | APIRequestContext): Promise<{ token: string; user: object }> {
  const now = Date.now();
  if (cachedToken && cachedUser && (now - tokenTimestamp) < TOKEN_MAX_AGE_MS) {
    return { token: cachedToken, user: cachedUser };
  }

  // Accept either a Page (use page.request) or a bare APIRequestContext
  const ctx: APIRequestContext = 'request' in requestContext
    ? (requestContext as Page).request
    : (requestContext as APIRequestContext);

  const response = await ctx.post(`${BASE_API}/auth/login`, {
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });

  if (!response.ok()) {
    throw new Error(`Login API failed: ${response.status()} ${await response.text()}`);
  }

  const body = await response.json();
  cachedToken = body.data.accessToken;
  cachedUser = body.data.user;
  tokenTimestamp = Date.now();
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
  await expect(page.getByText('Total Child Boxes')).toBeVisible({ timeout: 15000 });
}

/**
 * Get auth token for direct API calls.
 * Accepts either a Page or a bare APIRequestContext (the `request` fixture).
 */
export async function getAuthToken(pageOrRequest: Page | APIRequestContext): Promise<string> {
  const { token } = await fetchLoginCredentials(pageOrRequest);
  return token;
}

/**
 * Navigate to a page via sidebar link
 */
export async function navigateTo(page: Page, label: string) {
  await page.getByRole('link', { name: label }).first().click();
  await page.waitForLoadState('networkidle');
}
