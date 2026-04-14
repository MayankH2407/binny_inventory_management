import { test, expect } from '@playwright/test';
import { loginViaAPI, getAuthToken, BASE_API } from './helpers';

test.describe.serial('Sections CRUD', () => {
  let token: string;
  let createdSectionId: number;
  const sectionName = `E2E-Section-${Date.now()}`;
  const updatedSectionName = `E2E-Section-Updated-${Date.now()}`;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await getAuthToken(page);
    await page.close();
  });

  // TC-SECT-001: GET /sections returns array with name and display_order fields
  test('TC-SECT-001: GET /sections returns array with name and display_order fields', async ({ page }) => {
    const response = await page.request.get(`${BASE_API}/sections`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(body.data.length).toBeGreaterThan(0);

    const section = body.data[0];
    expect(section).toHaveProperty('name');
    expect(section).toHaveProperty('display_order');
    expect(section).toHaveProperty('id');
    expect(section).toHaveProperty('is_active');
  });

  // TC-SECT-002: POST /sections creates a new section
  test('TC-SECT-002: POST /sections creates a new section', async ({ page }) => {
    const response = await page.request.post(`${BASE_API}/sections`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: sectionName,
        is_active: true,
        display_order: 999,
      },
    });

    const body = await response.json();
    expect(response.ok(), `API returned ${response.status()}: ${JSON.stringify(body)}`).toBeTruthy();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('id');
    expect(body.data.name).toBe(sectionName);
    expect(body.data.is_active).toBe(true);
    expect(body.data.display_order).toBe(999);

    createdSectionId = body.data.id;
  });

  // TC-SECT-003: POST /sections rejects duplicate section name
  test('TC-SECT-003: POST /sections rejects duplicate section name', async ({ page }) => {
    const response = await page.request.post(`${BASE_API}/sections`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: sectionName, // same name as TC-SECT-002
      },
    });

    // Should be a 4xx error (conflict / validation error)
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);

    const body = await response.json();
    expect(body.success).toBe(false);
  });

  // TC-SECT-004: GET /sections/:id returns the created section
  test('TC-SECT-004: GET /sections/:id returns the created section', async ({ page }) => {
    expect(createdSectionId).toBeDefined();

    const response = await page.request.get(`${BASE_API}/sections/${createdSectionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const body = await response.json();
    expect(response.ok(), `API returned ${response.status()}: ${JSON.stringify(body)}`).toBeTruthy();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(createdSectionId);
    expect(body.data.name).toBe(sectionName);
    expect(body.data).toHaveProperty('created_at');
    expect(body.data).toHaveProperty('updated_at');
  });

  // TC-SECT-005: PUT /sections/:id updates section name
  test('TC-SECT-005: PUT /sections/:id updates section name', async ({ page }) => {
    expect(createdSectionId).toBeDefined();

    const response = await page.request.put(`${BASE_API}/sections/${createdSectionId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: updatedSectionName,
      },
    });

    const body = await response.json();
    expect(response.ok(), `API returned ${response.status()}: ${JSON.stringify(body)}`).toBeTruthy();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(createdSectionId);
    expect(body.data.name).toBe(updatedSectionName);
  });

  // TC-SECT-006: PUT /sections/:id rejects duplicate name on rename
  test('TC-SECT-006: PUT /sections/:id rejects duplicate name on rename', async ({ page }) => {
    expect(createdSectionId).toBeDefined();

    // First get an existing section name to try to collide with
    const listResponse = await page.request.get(`${BASE_API}/sections`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = await listResponse.json();
    const existingSections = listBody.data as Array<{ id: number; name: string }>;

    // Find a section that is NOT the one we created
    const otherSection = existingSections.find((s) => s.id !== createdSectionId);

    if (!otherSection) {
      // Only one section exists — skip the collision check
      test.skip();
      return;
    }

    const response = await page.request.put(`${BASE_API}/sections/${createdSectionId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: otherSection.name, // attempt to rename to an already-existing name
      },
    });

    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBeGreaterThanOrEqual(400);
    expect(response.status()).toBeLessThan(500);

    const body = await response.json();
    expect(body.success).toBe(false);
  });

  // TC-SECT-007: DELETE /sections/:id deactivates section (soft delete)
  test('TC-SECT-007: DELETE /sections/:id deactivates section', async ({ page }) => {
    expect(createdSectionId).toBeDefined();

    const response = await page.request.delete(`${BASE_API}/sections/${createdSectionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const body = await response.json();
    expect(response.ok(), `API returned ${response.status()}: ${JSON.stringify(body)}`).toBeTruthy();
    expect(body.success).toBe(true);

    // Verify the section is no longer returned in the active list
    const listResponse = await page.request.get(`${BASE_API}/sections`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = await listResponse.json();
    const ids = (listBody.data as Array<{ id: number }>).map((s) => s.id);
    expect(ids).not.toContain(createdSectionId);
  });

  // TC-SECT-008: Section tabs on Products page reflect API data
  test('TC-SECT-008: Section tabs on Products page reflect API data', async ({ page }) => {
    await loginViaAPI(page);

    // Navigate to /products
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // "All" tab should always be present
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible({ timeout: 15000 });

    // Fetch the active sections from the API and verify at least one appears as a tab
    const apiResponse = await page.request.get(`${BASE_API}/sections`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(apiResponse.ok()).toBeTruthy();
    const apiBody = await apiResponse.json();
    const activeSections = apiBody.data as Array<{ name: string }>;
    expect(activeSections.length).toBeGreaterThan(0);

    // At least the first active section should have a corresponding tab on the page
    const firstSectionName = activeSections[0].name;
    await expect(
      page.getByRole('button', { name: firstSectionName }),
    ).toBeVisible({ timeout: 10000 });
  });
});
