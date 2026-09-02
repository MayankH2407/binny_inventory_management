/**
 * Service-level tests for the Samples pool redesign (2026-09) — specifically
 * the foot-split / per-piece dispatch / strand-prevention chain, which is the
 * one genuinely new piece of behavior in this redesign (everything else
 * mirrors the already-shipped E-commerce pool pattern).
 *
 * Two describe blocks:
 *   - `assertFootAvailable` — pure function, no DB, exercises every guard.
 *   - `Sample foot-split dispatch (integration)` — the "decisive functional
 *     test" from the design doc: split a pair across two samples, ship one
 *     foot, confirm the OTHER foot returns to available stock as PARTIAL
 *     (not stranded, not silently laundered back to a full pair), confirm
 *     PARTIAL is rejected everywhere a pair-based flow reads it, then ship
 *     the second foot and confirm the box reads back a normal DISPATCHED
 *     pair with both timestamps set.
 *
 * Harness mirrors inventory.service.test.ts / legacyCarton.service.test.ts:
 * connect to the dev DB via the real `query` helper, seed by a unique
 * marker, clean up explicitly-tracked ids afterward (sample_records' barcode
 * is server-generated, so we track ids rather than pattern-matching them).
 */
import { v4 as uuidv4 } from 'uuid';
import { query } from '../../src/config/database';
import { assertFootAvailable } from '../../src/services/sample.service';
import * as sampleService from '../../src/services/sample.service';
import { createDispatch } from '../../src/services/dispatch.service';
import { packChildBox } from '../../src/services/masterCarton.service';
import { addToEcommercePool } from '../../src/services/ecommerce.service';
import { createReturn } from '../../src/services/return.service';
import { exportDispatchCSV } from '../../src/services/csvExport.service';
import { CHILD_BOX_STATUS } from '../../src/config/constants';

const TEST_PREFIX = 'ZJEST_SAMPLEFOOT_';

describe('assertFootAvailable (pure, no DB)', () => {
  const freshBox = { status: CHILD_BOX_STATUS.FREE, quantity: 1, left_dispatched_at: null, right_dispatched_at: null };

  it('allows a fresh FREE 1-pair box to be requested as LEFT, RIGHT, or PAIR', () => {
    expect(() => assertFootAvailable('CB1', freshBox, [], 'LEFT')).not.toThrow();
    expect(() => assertFootAvailable('CB1', freshBox, [], 'RIGHT')).not.toThrow();
    expect(() => assertFootAvailable('CB1', freshBox, [], 'PAIR')).not.toThrow();
  });

  it('rejects PACKED / ECOMMERCE / DISPATCHED boxes outright', () => {
    for (const status of [CHILD_BOX_STATUS.PACKED, CHILD_BOX_STATUS.ECOMMERCE, CHILD_BOX_STATUS.DISPATCHED]) {
      expect(() =>
        assertFootAvailable('CB1', { status, quantity: 1, left_dispatched_at: null, right_dispatched_at: null }, [], 'LEFT')
      ).toThrow(/cannot be added to a sample/);
    }
  });

  it('rejects single-foot allocation on a box holding more than 1 pair', () => {
    const multiPair = { status: CHILD_BOX_STATUS.FREE, quantity: 3, left_dispatched_at: null, right_dispatched_at: null };
    expect(() => assertFootAvailable('CB1', multiPair, [], 'LEFT')).toThrow(/single-foot allocation applies to 1-pair boxes only/);
    // PAIR is still fine on a multi-pair box.
    expect(() => assertFootAvailable('CB1', multiPair, [], 'PAIR')).not.toThrow();
  });

  it('once LEFT has shipped: rejects PAIR and repeat-LEFT, allows RIGHT', () => {
    const leftGone = { status: CHILD_BOX_STATUS.PARTIAL, quantity: 1, left_dispatched_at: new Date(), right_dispatched_at: null };
    expect(() => assertFootAvailable('CB1', leftGone, [], 'PAIR')).toThrow(/only the right shoe remains/);
    expect(() => assertFootAvailable('CB1', leftGone, [], 'LEFT')).toThrow(/left shoe of child box CB1 has already been dispatched/);
    expect(() => assertFootAvailable('CB1', leftGone, [], 'RIGHT')).not.toThrow();
  });

  it('rejects a foot already held by an active sample-mapping row', () => {
    expect(() => assertFootAvailable('CB1', freshBox, ['LEFT'], 'LEFT')).toThrow(/left foot of child box CB1 is already in a sample/);
    expect(() => assertFootAvailable('CB1', freshBox, ['LEFT'], 'PAIR')).toThrow(/already has its left foot in a sample/);
    expect(() => assertFootAvailable('CB1', freshBox, ['PAIR'], 'LEFT')).toThrow(/already fully in a sample/);
  });
});

describe('Sample foot-split dispatch (integration)', () => {
  let userId: string;
  let productId: string;
  let boxId: string;
  let boxBarcode: string;
  const sampleIds: string[] = [];
  const dispatchIds: string[] = [];

  beforeAll(async () => {
    const u = await query('SELECT id FROM users ORDER BY created_at LIMIT 1');
    if (u.rows.length === 0) throw new Error('No users in DB to attribute test actions to');
    userId = u.rows[0].id as string;

    productId = uuidv4();
    await query(
      `INSERT INTO products
         (id, sku, article_name, article_code, colour, size, mrp, is_active,
          section, category, article_group, size_from, size_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        productId, `${TEST_PREFIX}SKU`, 'Foot Split Test Article', 'FST01', 'BLACK', '8',
        500.0, true, `${TEST_PREFIX}SECTION`, 'Gents', 'FootSplit', '6', '10',
      ]
    );

    boxId = uuidv4();
    boxBarcode = `${TEST_PREFIX}CB`.toUpperCase();
    await query(
      `INSERT INTO child_boxes (id, barcode, product_id, status, quantity)
       VALUES ($1, $2, $3, $4, 1)`,
      [boxId, boxBarcode, productId, CHILD_BOX_STATUS.FREE]
    );
  });

  afterAll(async () => {
    await query('DELETE FROM inventory_transactions WHERE child_box_id = $1', [boxId]);
    if (dispatchIds.length > 0) {
      await query('DELETE FROM dispatch_records WHERE id = ANY($1::uuid[])', [dispatchIds]);
    }
    if (sampleIds.length > 0) {
      // Cascades to sample_box_mapping / sample_carton_mapping.
      await query('DELETE FROM sample_records WHERE id = ANY($1::uuid[])', [sampleIds]);
    }
    await query('DELETE FROM child_boxes WHERE id = $1', [boxId]);
    await query('DELETE FROM products WHERE id = $1', [productId]);
  });

  it('runs the full split → ship-one-foot → strand-prevention → ship-other-foot chain', async () => {
    // 1. Create sample A, scan the box in as LEFT only.
    const sampleA = await sampleService.createSampleRecord({}, userId);
    sampleIds.push(sampleA.id);
    const addA = await sampleService.addToSample({ sampleRecordId: sampleA.id, barcode: boxBarcode, foot: 'LEFT' }, userId);
    expect(addA.item_type).toBe('BOX');
    expect(addA.foot).toBe('LEFT');

    // 2. Confirm box is SAMPLE, neither foot shipped yet.
    let box = (await query('SELECT * FROM child_boxes WHERE id = $1', [boxId])).rows[0];
    expect(box.status).toBe(CHILD_BOX_STATUS.SAMPLE);
    expect(box.left_dispatched_at).toBeNull();
    expect(box.right_dispatched_at).toBeNull();

    // 3. Dispatch sample A, shipping the LEFT item.
    const dispatchA = await createDispatch(
      {
        sample_dispatch: { sample_record_id: sampleA.id, items: [{ item_type: 'BOX', mapping_id: addA.mapping_id }] },
      } as Parameters<typeof createDispatch>[0],
      userId
    );
    dispatchIds.push(dispatchA[0].id);

    // 4. Confirm: left shipped, right still open, box is PARTIAL (not DISPATCHED —
    //    this is the strand-prevention fix: the never-allocated right shoe must
    //    NOT be consumed along with the shipped left shoe).
    box = (await query('SELECT * FROM child_boxes WHERE id = $1', [boxId])).rows[0];
    expect(box.status).toBe(CHILD_BOX_STATUS.PARTIAL);
    expect(box.left_dispatched_at).not.toBeNull();
    expect(box.right_dispatched_at).toBeNull();

    // 5. While the box is genuinely PARTIAL (right foot still unallocated to
    //    anything), it must be rejected by packing into a carton...
    await expect(packChildBox(boxId, uuidv4(), userId)).rejects.toThrow(/cannot be packed/);
    // ...and by e-commerce pool scan-in, with a PARTIAL-specific message.
    await expect(addToEcommercePool(boxBarcode, userId)).rejects.toThrow(/partial pair/i);

    // 6. A PARTIAL box must not be counted as in-stock pairs for this product
    //    (FREE/PACKED sum for our test product should be 0 — the only box we
    //    seeded for it is now PARTIAL, which is deliberately excluded).
    const stockRow = (await query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS total FROM child_boxes
       WHERE product_id = $1 AND status IN ('FREE', 'PACKED')`,
      [productId]
    )).rows[0];
    expect(stockRow.total).toBe(0);

    // 7. A second sample can pick up the surviving RIGHT foot of the SAME
    //    barcode — this re-allocates the idle shoe, so the box correctly
    //    flips back to SAMPLE (it's no longer sitting unclaimed).
    const sampleB = await sampleService.createSampleRecord({}, userId);
    sampleIds.push(sampleB.id);
    const addB = await sampleService.addToSample({ sampleRecordId: sampleB.id, barcode: boxBarcode, foot: 'RIGHT' }, userId);
    expect(addB.foot).toBe('RIGHT');

    // ... but PAIR and repeat-LEFT must both be rejected for this same barcode now.
    await expect(
      sampleService.addToSample({ sampleRecordId: sampleB.id, barcode: boxBarcode, foot: 'PAIR' }, userId)
    ).rejects.toThrow(/only the right shoe remains|already in a sample/);
    await expect(
      sampleService.addToSample({ sampleRecordId: sampleB.id, barcode: boxBarcode, foot: 'LEFT' }, userId)
    ).rejects.toThrow(/left shoe of child box .* has already been dispatched/);

    // 8. Ship sample B's RIGHT item.
    const dispatchB = await createDispatch(
      {
        sample_dispatch: { sample_record_id: sampleB.id, items: [{ item_type: 'BOX', mapping_id: addB.mapping_id }] },
      } as Parameters<typeof createDispatch>[0],
      userId
    );
    dispatchIds.push(dispatchB[0].id);

    // 9. Confirm the box now reads a fully DISPATCHED pair, both timestamps set.
    box = (await query('SELECT * FROM child_boxes WHERE id = $1', [boxId])).rows[0];
    expect(box.status).toBe(CHILD_BOX_STATUS.DISPATCHED);
    expect(box.left_dispatched_at).not.toBeNull();
    expect(box.right_dispatched_at).not.toBeNull();

    // 10. The dispatch CSV must bill each half-pair shipment as 0.5 pairs, not
    //     a full pair at full MRP (the highest-consequence ripple: this is the
    //     customer-facing invoice document).
    const today = new Date().toISOString().slice(0, 10);
    const csv = await exportDispatchCSV(today, today);
    const csvLines = csv.split('\n').filter((l) => l.includes(sampleA.sample_barcode) || l.includes(sampleB.sample_barcode));
    expect(csvLines.length).toBeGreaterThanOrEqual(2);
    for (const line of csvLines) {
      // Column order: ...,Boxes,Pairs,MRP,Total Value,... — Pairs is 0.5 per shipment.
      expect(line).toMatch(/"1","0\.5","500\.00","250\.00"/);
    }

    // 11. Now that the box is fully DISPATCHED via samples, a return attempt
    //     must still be rejected — the "sample dispatches cannot be returned"
    //     guard has to keep matching a box that shipped via foot-split, not
    //     just a normal whole-pair sample shipment.
    await expect(
      createReturn({ items: [{ barcode: boxBarcode, item_type: 'BOX' }] }, userId)
    ).rejects.toThrow(/Sample box returns are not supported/);
  });
});
