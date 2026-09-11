/**
 * Unit tests for getInventoryBreakdown — inventory.service.ts
 *
 * NOTE: This project currently has no Jest dependency installed.
 * To run these tests, add the following to backend/package.json devDependencies:
 *   "jest": "^29", "ts-jest": "^29", "@types/jest": "^29",
 *   "supertest": "^6", "@types/supertest": "^6"
 * and add a jest.config.ts pointing at ts-jest.
 *
 * Test harness pattern:
 *   - Connect directly to the test DB (DATABASE_URL from env)
 *   - Each describe block seeds minimal data, asserts, then cleans up
 *   - Uses the same `query` helper the service uses
 */

import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../../src/config/database';
import { getInventoryBreakdown, type BreakdownItem } from '../../src/services/inventory.service';

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const TEST_PREFIX = 'TEST_BREAKDOWN_';

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
      overrides.article_name ?? 'City Chappal',
      overrides.article_code ?? 'CITY01',
      overrides.colour ?? 'RED',
      overrides.size ?? '8',
      overrides.mrp ?? 299.00,
      overrides.is_active ?? true,
      overrides.section ?? 'TEST_SECTION_PU',
      overrides.category ?? 'Gents',
      overrides.article_group ?? 'City',
      overrides.size_from ?? '6',
      overrides.size_to ?? '10',
    ]
  );
  return id;
}

async function seedChildBox(productId: string, status: string, quantity: number): Promise<string> {
  const id = uuidv4();
  await query(
    `INSERT INTO child_boxes (id, barcode, product_id, status, quantity)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, `${TEST_PREFIX}CB-${id.slice(0, 8)}`.toUpperCase(), productId, status, quantity]
  );
  return id;
}

async function seedMasterCarton(status: string): Promise<string> {
  const id = uuidv4();
  await query(
    `INSERT INTO master_cartons (id, carton_barcode, status, child_count, max_capacity)
     VALUES ($1, $2, $3, 0, 50)`,
    [id, `${TEST_PREFIX}MC-${id.slice(0, 8)}`.toUpperCase(), status]
  );
  return id;
}

async function packChildBox(childBoxId: string, cartonId: string): Promise<void> {
  await query(
    `INSERT INTO carton_child_mapping (master_carton_id, child_box_id)
     VALUES ($1, $2)`,
    [cartonId, childBoxId]
  );
}

async function cleanup(): Promise<void> {
  // Delete test data in FK-safe order
  await query(
    `DELETE FROM carton_child_mapping
     WHERE child_box_id IN (
       SELECT id FROM child_boxes WHERE barcode LIKE $1
     )`,
    [`${TEST_PREFIX}%`]
  );
  await query(`DELETE FROM child_boxes WHERE barcode LIKE $1`, [`${TEST_PREFIX}%`]);
  await query(`DELETE FROM master_cartons WHERE carton_barcode LIKE $1`, [`${TEST_PREFIX}%`]);
  await query(`DELETE FROM products WHERE sku LIKE $1`, [`${TEST_PREFIX}%`]);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('getInventoryBreakdown', () => {
  afterEach(cleanup);

  describe('level=section', () => {
    it('returns section buckets with correct piece counts', async () => {
      // PU section: 2 products, 3 child boxes packed in active carton
      const p1 = await seedProduct({ section: 'TEST_SECTION_PU', category: 'Gents', article_group: 'City', article_name: 'City 01', colour: 'RED', size_from: '6', size_to: '10' });
      const p2 = await seedProduct({ section: 'TEST_SECTION_PU', category: 'Gents', article_group: 'City', article_name: 'City 02', colour: 'BLUE', size_from: '6', size_to: '10' });
      // Hawaii section: 1 free loose box
      const p3 = await seedProduct({ section: 'TEST_SECTION_HAWAII', category: 'Ladies', article_group: 'Beach', article_name: 'Beach 01', colour: 'GREEN', size_from: '4', size_to: '8' });

      const mc = await seedMasterCarton('ACTIVE');
      const mcDispatched = await seedMasterCarton('DISPATCHED');

      const cb1 = await seedChildBox(p1, 'PACKED', 10);
      const cb2 = await seedChildBox(p2, 'PACKED', 12);
      const cb3 = await seedChildBox(p1, 'FREE', 8);   // loose
      const cb4 = await seedChildBox(p1, 'PACKED', 6); // in DISPATCHED carton → excluded
      const cb5 = await seedChildBox(p3, 'FREE', 5);   // Hawaii loose

      await packChildBox(cb1, mc);
      await packChildBox(cb2, mc);
      await packChildBox(cb4, mcDispatched);

      // GENERATED should be excluded
      const cbGen = await seedChildBox(p1, 'GENERATED', 20);
      void cbGen; // just to satisfy no-unused

      const result = await getInventoryBreakdown({ level: 'section', path: {} });
      expect('items' in result).toBe(true);
      const items = (result as { items: BreakdownItem[] }).items;

      const puRow = items.find(i => i.value === 'TEST_SECTION_PU');
      expect(puRow).toBeDefined();
      // packed: cb1(10) + cb2(12) = 22  +  loose cb3(8) = 30 pieces
      expect(puRow!.pieces).toBe(30);
      expect(puRow!.loose_child_box_count).toBe(1);
      expect(puRow!.master_carton_count).toBe(1); // only the ACTIVE carton

      const hawaiiRow = items.find(i => i.value === 'TEST_SECTION_HAWAII');
      expect(hawaiiRow).toBeDefined();
      expect(hawaiiRow!.pieces).toBe(5);
      expect(hawaiiRow!.loose_child_box_count).toBe(1);
      expect(hawaiiRow!.master_carton_count).toBe(0);
    });
  });

  describe('level=colour (drilled into PU/Gents/City/City 01)', () => {
    it('returns colour buckets filtered by path', async () => {
      const pRed  = await seedProduct({ section: 'TEST_SECTION_PU', category: 'Gents', article_group: 'City', article_name: 'City 01', colour: 'RED',  size_from: '6', size_to: '10' });
      const pBlue = await seedProduct({ section: 'TEST_SECTION_PU', category: 'Gents', article_group: 'City', article_name: 'City 01', colour: 'BLUE', size_from: '6', size_to: '10' });

      const mc = await seedMasterCarton('ACTIVE');
      const cbRed1  = await seedChildBox(pRed,  'PACKED', 10);
      const cbRed2  = await seedChildBox(pRed,  'FREE',   4);  // loose
      const cbBlue1 = await seedChildBox(pBlue, 'PACKED', 8);
      await packChildBox(cbRed1, mc);
      await packChildBox(cbBlue1, mc);

      const result = await getInventoryBreakdown({
        level: 'colour',
        path:  { section: 'TEST_SECTION_PU', category: 'Gents', group: 'City', article: 'City 01' },
      });

      expect('items' in result).toBe(true);
      const items = (result as { items: { value: string; pieces: number; loose_child_box_count: number }[] }).items;
      const red = items.find(i => i.value === 'RED');
      expect(red).toBeDefined();
      expect(red!.pieces).toBe(14); // 10 packed + 4 loose
      expect(red!.loose_child_box_count).toBe(1);

      const blue = items.find(i => i.value === 'BLUE');
      expect(blue).toBeDefined();
      expect(blue!.pieces).toBe(8);
    });
  });

  describe('level=leaf', () => {
    it('returns master_cartons and loose_stock arrays', async () => {
      // size_group is now the carton's ACTUAL packed range, not the product's
      // declared size_from/size_to — this product's only packed box is size
      // '8' (the seedProduct default), so the real assortment is just "8".
      const p1 = await seedProduct({ section: 'TEST_SECTION_PU', category: 'Gents', article_group: 'City', article_name: 'City 01', colour: 'RED', size_from: '6', size_to: '10' });

      const mc = await seedMasterCarton('ACTIVE');
      const cbPacked = await seedChildBox(p1, 'PACKED', 10);
      const cbLoose  = await seedChildBox(p1, 'FREE',   4);
      await packChildBox(cbPacked, mc);

      const result = await getInventoryBreakdown({
        level: 'leaf',
        path:  { section: 'TEST_SECTION_PU', category: 'Gents', group: 'City', article: 'City 01', colour: 'RED', size_group: '8' },
      });

      expect('master_cartons' in result).toBe(true);
      const r = result as { master_cartons: { master_carton_id: string; pieces: number }[]; loose_stock: { child_box_id: string; pieces: number }[] };
      expect(r.master_cartons).toHaveLength(1);
      expect(r.master_cartons[0].pieces).toBe(10);
      // A real assortment card's leaf never includes loose stock (that's the
      // separate "Loose" card's job) — only the Loose sentinel leaf does.
      expect(r.loose_stock).toHaveLength(0);
    });

    it('excludes child boxes in DISPATCHED cartons from master_cartons', async () => {
      const p1 = await seedProduct({ section: 'TEST_SECTION_PU', category: 'Gents', article_group: 'City', article_name: 'City 01', colour: 'RED', size_from: '6', size_to: '10' });

      const mcDispatched = await seedMasterCarton('DISPATCHED');
      const cbPacked = await seedChildBox(p1, 'PACKED', 10);
      await packChildBox(cbPacked, mcDispatched);

      const result = await getInventoryBreakdown({
        level: 'leaf',
        path:  { section: 'TEST_SECTION_PU', category: 'Gents', group: 'City', article: 'City 01', colour: 'RED', size_group: '8' },
      });

      const r = result as { master_cartons: unknown[]; loose_stock: unknown[] };
      expect(r.master_cartons).toHaveLength(0);
      expect(r.loose_stock).toHaveLength(0);
    });
  });

  describe('level=size_group — carton assortments (warehouse channel)', () => {
    // Client ask: show how many cartons hold EXACTLY a given real packed size
    // range (e.g. 6-7 vs 6-8 vs 6-10 vs 7-9, counted separately), derived from
    // what's actually packed together — NOT the product's declared
    // size_from/size_to. A range nothing is actually packed as (e.g. "6-9")
    // must never appear as a card.
    async function seedAssortmentScenario() {
      const base = { section: 'TEST_SECTION_PU', category: 'Gents', article_group: 'City', article_name: 'City 01', colour: 'RED', size_from: '6', size_to: '10' };
      const p6  = await seedProduct({ ...base, size: '6' });
      const p7  = await seedProduct({ ...base, size: '7' });
      const p8  = await seedProduct({ ...base, size: '8' });
      const p9  = await seedProduct({ ...base, size: '9' });
      const p10 = await seedProduct({ ...base, size: '10' });

      // Carton A: sizes 6,7 -> assortment "6-7"
      const mcA = await seedMasterCarton('ACTIVE');
      await packChildBox(await seedChildBox(p6, 'PACKED', 1), mcA);
      await packChildBox(await seedChildBox(p7, 'PACKED', 1), mcA);

      // Carton B: sizes 6,7,8 -> assortment "6-8"
      const mcB = await seedMasterCarton('ACTIVE');
      await packChildBox(await seedChildBox(p6, 'PACKED', 1), mcB);
      await packChildBox(await seedChildBox(p7, 'PACKED', 1), mcB);
      await packChildBox(await seedChildBox(p8, 'PACKED', 1), mcB);

      // Carton C: sizes 6,7,8,9,10 -> assortment "6-10"
      const mcC = await seedMasterCarton('ACTIVE');
      await packChildBox(await seedChildBox(p6, 'PACKED', 1), mcC);
      await packChildBox(await seedChildBox(p7, 'PACKED', 1), mcC);
      await packChildBox(await seedChildBox(p8, 'PACKED', 1), mcC);
      await packChildBox(await seedChildBox(p9, 'PACKED', 1), mcC);
      await packChildBox(await seedChildBox(p10, 'PACKED', 1), mcC);

      // Carton D: sizes 7,8,9 -> assortment "7-9"
      const mcD = await seedMasterCarton('ACTIVE');
      await packChildBox(await seedChildBox(p7, 'PACKED', 1), mcD);
      await packChildBox(await seedChildBox(p8, 'PACKED', 1), mcD);
      await packChildBox(await seedChildBox(p9, 'PACKED', 1), mcD);

      // One loose box, for the separate "Loose" card.
      await seedChildBox(p8, 'FREE', 4);

      return { mcA, mcB, mcC, mcD };
    }

    it('shows each real assortment as its own card, counted separately; a range nothing is packed as never appears', async () => {
      await seedAssortmentScenario();

      const result = await getInventoryBreakdown({
        level: 'size_group',
        path:  { section: 'TEST_SECTION_PU', category: 'Gents', group: 'City', article: 'City 01', colour: 'RED' },
      });
      const items = (result as { items: BreakdownItem[] }).items;

      const byValue = Object.fromEntries(items.map(i => [i.value, i]));
      expect(byValue['6-7']).toMatchObject({ master_carton_count: 1, child_box_count: 2, pieces: 2 });
      expect(byValue['6-8']).toMatchObject({ master_carton_count: 1, child_box_count: 3, pieces: 3 });
      expect(byValue['6-10']).toMatchObject({ master_carton_count: 1, child_box_count: 5, pieces: 5 });
      expect(byValue['7-9']).toMatchObject({ master_carton_count: 1, child_box_count: 3, pieces: 3 });
      // No carton is packed 6-9 — must not appear as a card at all.
      expect(byValue['6-9']).toBeUndefined();

      const loose = byValue['Loose'];
      expect(loose).toBeDefined();
      expect(loose.pieces).toBe(4);
      expect(loose.master_carton_count).toBe(0);
    });

    it('drilling into a real assortment card at leaf shows only its exact-match cartons', async () => {
      const { mcB } = await seedAssortmentScenario();

      const result = await getInventoryBreakdown({
        level: 'leaf',
        path:  { section: 'TEST_SECTION_PU', category: 'Gents', group: 'City', article: 'City 01', colour: 'RED', size_group: '6-8' },
      });
      const r = result as { master_cartons: { master_carton_id: string; pieces: number; size_breakdown: { size: string }[] }[]; loose_stock: unknown[] };
      expect(r.master_cartons).toHaveLength(1);
      expect(r.master_cartons[0].master_carton_id).toBe(mcB);
      expect(r.master_cartons[0].pieces).toBe(3);
      expect(r.master_cartons[0].size_breakdown.map(sb => sb.size).sort()).toEqual(['6', '7', '8']);
      expect(r.loose_stock).toHaveLength(0);
    });

    it('drilling into the "Loose" card at leaf shows only loose boxes, no cartons', async () => {
      await seedAssortmentScenario();

      const result = await getInventoryBreakdown({
        level: 'leaf',
        path:  { section: 'TEST_SECTION_PU', category: 'Gents', group: 'City', article: 'City 01', colour: 'RED', size_group: 'Loose' },
      });
      const r = result as { master_cartons: unknown[]; loose_stock: { pieces: number }[] };
      expect(r.master_cartons).toHaveLength(0);
      expect(r.loose_stock).toHaveLength(1);
      expect(r.loose_stock[0].pieces).toBe(4);
    });
  });

  describe('level=size_group — ecommerce channel groups by individual size', () => {
    it('groups by p.size, not a size-group range', async () => {
      const p1 = await seedProduct({ section: 'TEST_SECTION_PU', category: 'Gents', article_group: 'City', article_name: 'City 01', colour: 'RED', size: '8', size_from: '6', size_to: '10' });
      await seedChildBox(p1, 'ECOMMERCE', 3);

      const result = await getInventoryBreakdown({
        level: 'size_group',
        channel: 'ecommerce',
        path:  { section: 'TEST_SECTION_PU', category: 'Gents', group: 'City', article: 'City 01', colour: 'RED' },
      });
      const items = (result as { items: BreakdownItem[] }).items;
      expect(items).toHaveLength(1);
      expect(items[0].value).toBe('8'); // p.size, not the reconstructed '6-10' range
      expect(items[0].pieces).toBe(3);
    });
  });
});
