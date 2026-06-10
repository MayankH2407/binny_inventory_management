/**
 * Integration tests for GET /api/v1/inventory/breakdown
 *
 * NOTE: This project currently has no Jest/Supertest installed.
 * To run these tests, add to backend/package.json devDependencies:
 *   "jest": "^29", "ts-jest": "^29", "@types/jest": "^29",
 *   "supertest": "^6", "@types/supertest": "^6"
 * and configure jest with ts-jest.
 *
 * These tests spin up the Express app in-process with a real DB connection.
 * Ensure DATABASE_URL points at a test database before running.
 */

import request from 'supertest';
import app from '../../src/app';
import { query } from '../../src/config/database';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

// ─── Auth token helper ────────────────────────────────────────────────────────

function makeToken(userId: string = uuidv4(), roleId: string = 'ADMIN'): string {
  return jwt.sign({ userId, email: 'test@test.com', roleId }, env.JWT_SECRET, { expiresIn: '1h' });
}

// ─── Seed / teardown ──────────────────────────────────────────────────────────

const TEST_PREFIX = 'ITST_BREAKDOWN_';

async function seedProduct(overrides: Record<string, unknown> = {}): Promise<string> {
  const id = uuidv4();
  await query(
    `INSERT INTO products
       (id, sku, article_name, article_code, colour, size, mrp, is_active,
        section, category, article_group, size_from, size_to)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      `${TEST_PREFIX}SKU-${id.slice(0, 8)}`,
      overrides.article_name ?? 'Test Article',
      overrides.article_code ?? 'TA01',
      overrides.colour ?? 'BLACK',
      overrides.size ?? '8',
      overrides.mrp ?? 199.00,
      true,
      overrides.section ?? 'PU',
      overrides.category ?? 'Gents',
      overrides.article_group ?? 'City',
      overrides.size_from ?? '6',
      overrides.size_to ?? '10',
    ]
  );
  return id;
}

async function cleanup(): Promise<void> {
  await query(
    `DELETE FROM carton_child_mapping
     WHERE child_box_id IN (SELECT id FROM child_boxes WHERE barcode LIKE $1)`,
    [`${TEST_PREFIX}%`]
  );
  await query(`DELETE FROM child_boxes WHERE barcode LIKE $1`, [`${TEST_PREFIX}%`]);
  await query(`DELETE FROM master_cartons WHERE carton_barcode LIKE $1`, [`${TEST_PREFIX}%`]);
  await query(`DELETE FROM products WHERE sku LIKE $1`, [`${TEST_PREFIX}%`]);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/inventory/breakdown', () => {
  afterEach(cleanup);

  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/breakdown?level=section')
      .expect(401);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when level=colour without required path fields', async () => {
    const token = makeToken();
    const res = await request(app)
      .get('/api/v1/inventory/breakdown?level=colour&path[section]=PU')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(res.body.success).toBe(false);
    // Should mention missing path fields
    expect(JSON.stringify(res.body)).toMatch(/path/i);
  });

  it('returns 400 when level param is invalid', async () => {
    const token = makeToken();
    await request(app)
      .get('/api/v1/inventory/breakdown?level=invalid_level')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('happy path: level=section returns items array', async () => {
    await seedProduct({ section: 'PU' });
    const token = makeToken();
    const res = await request(app)
      .get('/api/v1/inventory/breakdown?level=section')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
    // At least one item, each has the required shape
    const puItem = res.body.data.items.find((i: { value: string }) => i.value === 'PU');
    expect(puItem).toBeDefined();
    expect(puItem).toMatchObject({
      value:                 expect.any(String),
      pieces:                expect.any(Number),
      child_box_count:       expect.any(Number),
      master_carton_count:   expect.any(Number),
      loose_child_box_count: expect.any(Number),
    });
  });

  it('leaf path returns both master_cartons and loose_stock', async () => {
    const p1 = await seedProduct({
      section: 'PU', category: 'Gents', article_group: 'City',
      article_name: 'Test Article', colour: 'BLACK', size_from: '6', size_to: '10',
    });

    // Create a master carton with one packed child box
    const mcId = uuidv4();
    await query(
      `INSERT INTO master_cartons (id, carton_barcode, status, child_count, max_capacity)
       VALUES ($1, $2, 'ACTIVE', 1, 50)`,
      [mcId, `${TEST_PREFIX}MC-${mcId.slice(0, 8)}`.toUpperCase()]
    );
    const cbId = uuidv4();
    await query(
      `INSERT INTO child_boxes (id, barcode, product_id, status, quantity)
       VALUES ($1, $2, $3, 'PACKED', 6)`,
      [cbId, `${TEST_PREFIX}CB-${cbId.slice(0, 8)}`.toUpperCase(), p1]
    );
    await query(
      `INSERT INTO carton_child_mapping (master_carton_id, child_box_id) VALUES ($1, $2)`,
      [mcId, cbId]
    );

    // Create a loose FREE child box
    const cbLooseId = uuidv4();
    await query(
      `INSERT INTO child_boxes (id, barcode, product_id, status, quantity)
       VALUES ($1, $2, $3, 'FREE', 3)`,
      [cbLooseId, `${TEST_PREFIX}CB-${cbLooseId.slice(0, 8)}`.toUpperCase(), p1]
    );

    const token = makeToken();
    const res = await request(app)
      .get('/api/v1/inventory/breakdown?level=leaf&path[section]=PU&path[category]=Gents&path[group]=City&path[article]=Test Article&path[colour]=BLACK&path[size_group]=6-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('master_cartons');
    expect(res.body.data).toHaveProperty('loose_stock');
    expect(Array.isArray(res.body.data.master_cartons)).toBe(true);
    expect(Array.isArray(res.body.data.loose_stock)).toBe(true);
    expect(res.body.data.master_cartons.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.loose_stock.length).toBeGreaterThanOrEqual(1);
  });
});
