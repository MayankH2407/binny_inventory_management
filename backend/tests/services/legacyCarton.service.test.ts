/**
 * Service-level tests for the legacy "Existing Stock" carton upload —
 * legacyCarton.service.ts (the NEW 7-column format shipped June 2026).
 *
 * Harness mirrors inventory.service.test.ts: connect to the dev/test DB via the
 * same `query` helper, seed/assert/cleanup by a unique marker. Legacy cartons
 * get auto-generated MC barcodes, so cleanup keys off the test article_group.
 */
import { query } from '../../src/config/database';
import { bulkCreateLegacyCartons } from '../../src/services/legacyCarton.service';

const ART_ALIA = 'ZJEST_LEGACY ALIA';
const ART_BUSKER = 'ZJEST_LEGACY BUSKER';

let userId: string;

async function cleanup(): Promise<void> {
  await query(
    `DELETE FROM master_cartons WHERE is_legacy = true AND article_group LIKE 'ZJEST_LEGACY%'`
  );
}

beforeAll(async () => {
  const u = await query('SELECT id FROM users ORDER BY created_at LIMIT 1');
  if (u.rows.length === 0) throw new Error('No users in DB to attribute legacy cartons to');
  userId = u.rows[0].id as string;
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe('legacyCarton.service — new 9-column format', () => {
  it('creates cartons and stores article/colour/mrp/size-range/pairs (multi-values normalized); skips qty 0', async () => {
    const csv = [
      'SECTION,CATEGORY,ARTICLE NAME,COLOUR,MRP,SIZE FROM,SIZE TO,MASTER CARTON QUANTITY,PAIRS PER CARTON',
      `Hawaii,Ladies,${ART_ALIA},"black,red","100,150",6,10,2,48`,
      `Hawaii,Gents,${ART_BUSKER},brown,349,6,10,0,48`,
    ].join('\n');

    const result = await bulkCreateLegacyCartons(Buffer.from(csv, 'utf8'), userId);

    expect(result.cartons_created).toBe(2);
    expect(result.rows_skipped_zero).toBe(1);
    expect(result.errors).toHaveLength(0);

    const rows = (await query(
      `SELECT category, article_group, size_group, legacy_colour, legacy_mrp, legacy_pairs, status, is_legacy, child_count
       FROM master_cartons WHERE is_legacy = true AND article_group = $1`,
      [ART_ALIA]
    )).rows;

    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.is_legacy).toBe(true);
      expect(r.status).toBe('CLOSED');
      expect(r.child_count).toBe(0);
      expect(r.category).toBe('Ladies');
      expect(r.size_group).toBe('6-10');
      // comma-separated multi-values normalized to ", " spacing
      expect(r.legacy_colour).toBe('black, red');
      expect(r.legacy_mrp).toBe('100, 150');
      expect(r.legacy_pairs).toBe(48);
    }
  });

  it('rejects the OLD 4-column format with a clear "missing columns" error', async () => {
    const oldCsv = [
      'SECTION,CATEGORY,ARTICLE GROUP (SIZE GROUP),MASTER CARTON QUANTITY',
      'Hawaii,Ladies,ALIA PLUS (4-8),5',
    ].join('\n');

    await expect(bulkCreateLegacyCartons(Buffer.from(oldCsv, 'utf8'), userId)).rejects.toThrow(
      /Missing required columns/i
    );
  });

  it('rejects an empty file', async () => {
    const headerOnly = 'SECTION,CATEGORY,ARTICLE NAME,COLOUR,MRP,SIZE FROM,SIZE TO,MASTER CARTON QUANTITY,PAIRS PER CARTON';
    await expect(bulkCreateLegacyCartons(Buffer.from(headerOnly, 'utf8'), userId)).rejects.toThrow(
      /empty/i
    );
  });
});
