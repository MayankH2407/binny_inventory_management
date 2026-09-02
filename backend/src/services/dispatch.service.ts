import { query, getClient } from '../config/database';
import { DispatchRecord } from '../types';
import { MASTER_CARTON_STATUS, CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateDispatchInput } from '../models/schemas/dispatch.schema';
import { assertFootAvailable } from './sample.service';
import { logger } from '../utils/logger';
import { dateFromCondition, dateToCondition } from '../utils/dateRange';

export async function createDispatch(
  input: CreateDispatchInput,
  dispatchedBy: string
): Promise<DispatchRecord[]> {
  // Route to appropriate handler based on source type
  if (input.sample_dispatch) {
    return _dispatchSample(input, dispatchedBy);
  }
  if (input.ecommerce_pool) {
    return _dispatchEcommercePool(input, dispatchedBy);
  }
  return _dispatchMasterCartons(input, dispatchedBy);
}

/**
 * Auto-fill destination from the customer's delivery_location when the
 * caller didn't provide one explicitly. Shared by all three dispatch flows.
 */
async function resolveDestination(
  client: { query: typeof query },
  customerId: string | undefined,
  explicitDestination: string | undefined
): Promise<string | null> {
  if (explicitDestination) return explicitDestination;
  if (!customerId) return null;
  const customerResult = await client.query(
    'SELECT delivery_location FROM customers WHERE id = $1',
    [customerId]
  );
  return customerResult.rows[0]?.delivery_location || null;
}

async function _dispatchMasterCartons(
  input: CreateDispatchInput,
  dispatchedBy: string
): Promise<DispatchRecord[]> {
  const masterCartonIds = input.master_carton_ids!;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock and validate all master cartons
    const cartonPlaceholders = masterCartonIds.map((_, i) => `$${i + 1}`).join(', ');
    const cartonsResult = await client.query(
      `SELECT * FROM master_cartons WHERE id IN (${cartonPlaceholders}) FOR UPDATE`,
      masterCartonIds
    );

    if (cartonsResult.rows.length !== masterCartonIds.length) {
      const foundIds = new Set(cartonsResult.rows.map((r: { id: string }) => r.id));
      const missing = masterCartonIds.filter((id) => !foundIds.has(id));
      throw new NotFoundError(`Master cartons not found: ${missing.join(', ')}`);
    }

    // Validate all cartons are in CLOSED or ACTIVE status
    const invalidCartons = cartonsResult.rows.filter(
      (c: { status: string; carton_barcode: string }) =>
        c.status !== MASTER_CARTON_STATUS.CLOSED && c.status !== MASTER_CARTON_STATUS.ACTIVE
    );
    if (invalidCartons.length > 0) {
      const invalidIds = invalidCartons.map((c: { carton_barcode: string }) => c.carton_barcode).join(', ');
      throw new BadRequestError(
        `Cartons must be in ACTIVE or CLOSED status for dispatch. Invalid: ${invalidIds}`
      );
    }

    // Reject any carton that is allocated intact to a sample/e-commerce record —
    // it must be dispatched from that record instead (see _dispatchSample / _dispatchEcommerce).
    const allocatedResult = await client.query(
      `SELECT mc.carton_barcode
       FROM master_cartons mc
       WHERE mc.id IN (${cartonPlaceholders})
         AND (
           EXISTS (SELECT 1 FROM sample_carton_mapping scm WHERE scm.master_carton_id = mc.id AND scm.is_active = true AND scm.dispatch_record_id IS NULL)
           OR EXISTS (SELECT 1 FROM ecommerce_carton_mapping ecm WHERE ecm.master_carton_id = mc.id AND ecm.is_active = true AND ecm.dispatch_record_id IS NULL)
         )`,
      masterCartonIds
    );
    if (allocatedResult.rows.length > 0) {
      const allocatedBarcodes = allocatedResult.rows.map((r: { carton_barcode: string }) => r.carton_barcode).join(', ');
      throw new BadRequestError(
        `Carton(s) ${allocatedBarcodes} are allocated to a sample/e-commerce record; dispatch them from there`
      );
    }

    const dispatchDate = input.dispatch_date ? new Date(input.dispatch_date) : new Date();
    const dispatchRecords: DispatchRecord[] = [];

    const destination = await resolveDestination(client, input.customer_id, input.destination);

    for (const cartonId of masterCartonIds) {
      // Update master carton to DISPATCHED
      await client.query(
        `UPDATE master_cartons SET status = $1, dispatched_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [MASTER_CARTON_STATUS.DISPATCHED, cartonId]
      );

      // Get all active child boxes in this carton via mapping
      const childBoxesResult = await client.query(
        `SELECT cb.id FROM carton_child_mapping ccm
         JOIN child_boxes cb ON cb.id = ccm.child_box_id
         WHERE ccm.master_carton_id = $1 AND ccm.is_active = true AND cb.status = $2`,
        [cartonId, CHILD_BOX_STATUS.PACKED]
      );

      const childBoxIds = childBoxesResult.rows.map((cb: { id: string }) => cb.id);

      // Update all child boxes to DISPATCHED
      if (childBoxIds.length > 0) {
        const cbPlaceholders = childBoxIds.map((_: string, i: number) => `$${i + 2}`).join(', ');
        await client.query(
          `UPDATE child_boxes SET status = $1, updated_at = NOW()
           WHERE id IN (${cbPlaceholders})`,
          [CHILD_BOX_STATUS.DISPATCHED, ...childBoxIds]
        );

        // Log CHILD_DISPATCHED for each child box
        for (const cbId of childBoxIds) {
          await client.query(
            `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              TRANSACTION_TYPES.CHILD_DISPATCHED, cbId, cartonId, dispatchedBy,
              `Child box dispatched to ${destination || 'unknown'}`,
              JSON.stringify({ destination }),
            ]
          );
        }
      }

      // Create dispatch record (one per carton)
      const dispatchResult = await client.query(
        `INSERT INTO dispatch_records
         (source_type, master_carton_id, dispatched_by, customer_id, destination, transport_details, lr_number, vehicle_number, dispatch_date, notes, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          'MASTER_CARTON',
          cartonId,
          dispatchedBy,
          input.customer_id || null,
          destination,
          input.transport_details || null,
          input.lr_number || null,
          input.vehicle_number || null,
          dispatchDate,
          input.notes || null,
          JSON.stringify({ child_box_count: childBoxIds.length }),
        ]
      );

      dispatchRecords.push(dispatchResult.rows[0]);

      // Log CARTON_DISPATCHED transaction
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CARTON_DISPATCHED, cartonId, dispatchedBy,
          `Dispatched to ${destination || 'unknown'}`,
          JSON.stringify({ dispatch_record_id: dispatchResult.rows[0].id, destination }),
        ]
      );
    }

    await client.query('COMMIT');

    await createAuditLog({
      userId: dispatchedBy,
      action: 'CREATE_DISPATCH',
      entityType: 'dispatch_record',
      newValues: {
        destination,
        total_cartons: masterCartonIds.length,
      },
    });

    logger.info(`Dispatch created: ${masterCartonIds.length} cartons to ${destination}`);
    return dispatchRecords;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Dispatch specific items OUT of one sample record. Items are addressed by
 * mapping_id, not barcode — a box can hold LEFT in this record and RIGHT in
 * another, so barcode alone is ambiguous (mapping_id also already encodes the
 * foot). Validates and locks everything before any mutation (one bad item
 * fails the whole batch), same atomicity convention as _dispatchEcommercePool.
 * Nothing unticked is released — an item not in this dispatch's `items` list
 * just stays open in the sample, unlike the old scoped-dispatch behavior.
 */
async function _dispatchSample(
  input: CreateDispatchInput,
  dispatchedBy: string
): Promise<DispatchRecord[]> {
  const { sample_record_id: sampleRecordId, items } = input.sample_dispatch!;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const srResult = await client.query('SELECT * FROM sample_records WHERE id = $1 FOR UPDATE', [sampleRecordId]);
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];

    // Dedupe by item_type:mapping_id, keeping the first occurrence (and any
    // foot override it carried) so a duplicate scan doesn't double-ship.
    const dedupedByKey = new Map<string, { item_type: 'BOX' | 'CARTON'; mapping_id: string; foot?: 'LEFT' | 'RIGHT' | 'PAIR' }>();
    for (const item of items) {
      const key = `${item.item_type}:${item.mapping_id}`;
      if (!dedupedByKey.has(key)) dedupedByKey.set(key, item);
    }
    const dedupedItems = Array.from(dedupedByKey.values());

    const dispatchDate = input.dispatch_date ? new Date(input.dispatch_date) : new Date();
    const destination = await resolveDestination(client, input.customer_id, input.destination);

    // Validate + lock everything FIRST — abort before any mutation on a bad item.
    const boxesToShip: { mapping_id: string; child_box_id: string; barcode: string; foot: string }[] = [];
    const cartonsToShip: { mapping_id: string; carton_id: string; carton_barcode: string; box_ids: string[] }[] = [];

    for (const item of dedupedItems) {
      if (item.item_type === 'BOX') {
        const boxResult = await client.query(
          `SELECT sbm.id AS mapping_id, sbm.foot, cb.id AS child_box_id, cb.barcode, cb.quantity,
                  cb.left_dispatched_at, cb.right_dispatched_at, cb.status
           FROM sample_box_mapping sbm
           JOIN child_boxes cb ON cb.id = sbm.child_box_id
           WHERE sbm.id = $1 AND sbm.sample_record_id = $2
             AND sbm.is_active = true AND sbm.dispatch_record_id IS NULL
           FOR UPDATE OF sbm, cb`,
          [item.mapping_id, sampleRecordId]
        );
        if (boxResult.rows.length === 0) {
          throw new BadRequestError(`Item ${item.mapping_id} is not currently open in sample ${sample.sample_barcode}`);
        }
        const row = boxResult.rows[0];
        let foot = row.foot as string;

        if (item.foot && item.foot !== row.foot) {
          const otherFeetResult = await client.query(
            `SELECT foot FROM sample_box_mapping WHERE child_box_id = $1 AND is_active = true AND dispatch_record_id IS NULL AND id <> $2`,
            [row.child_box_id, item.mapping_id]
          );
          const otherFeet = otherFeetResult.rows.map((r: { foot: string }) => r.foot);
          assertFootAvailable(row.barcode, row, otherFeet, item.foot);
          try {
            await client.query(`UPDATE sample_box_mapping SET foot = $1, updated_at = NOW() WHERE id = $2`, [item.foot, item.mapping_id]);
          } catch (err) {
            if ((err as { code?: string }).code === '23505') {
              throw new BadRequestError(`The ${item.foot.toLowerCase()} foot of box ${row.barcode} is already in another sample`);
            }
            throw err;
          }
          foot = item.foot;
        }

        boxesToShip.push({ mapping_id: item.mapping_id, child_box_id: row.child_box_id, barcode: row.barcode, foot });
      } else {
        const cartonResult = await client.query(
          `SELECT scm.id AS mapping_id, mc.id AS carton_id, mc.carton_barcode
           FROM sample_carton_mapping scm
           JOIN master_cartons mc ON mc.id = scm.master_carton_id
           WHERE scm.id = $1 AND scm.sample_record_id = $2
             AND scm.is_active = true AND scm.dispatch_record_id IS NULL AND mc.status <> $3
           FOR UPDATE OF scm, mc`,
          [item.mapping_id, sampleRecordId, MASTER_CARTON_STATUS.DISPATCHED]
        );
        if (cartonResult.rows.length === 0) {
          throw new BadRequestError(`Carton item ${item.mapping_id} is not currently reserved in sample ${sample.sample_barcode}`);
        }
        const row = cartonResult.rows[0];

        // Re-fetch its CURRENTLY-PACKED boxes fresh — never trust child_count.
        const cartonBoxesResult = await client.query(
          `SELECT cb.id FROM carton_child_mapping ccm
           JOIN child_boxes cb ON cb.id = ccm.child_box_id
           WHERE ccm.master_carton_id = $1 AND ccm.is_active = true AND cb.status = $2
           FOR UPDATE OF cb`,
          [row.carton_id, CHILD_BOX_STATUS.PACKED]
        );
        cartonsToShip.push({
          mapping_id: row.mapping_id, carton_id: row.carton_id, carton_barcode: row.carton_barcode,
          box_ids: cartonBoxesResult.rows.map((r: { id: string }) => r.id),
        });
      }
    }

    const footBreakdown = { PAIR: 0, LEFT: 0, RIGHT: 0 } as Record<string, number>;
    for (const b of boxesToShip) footBreakdown[b.foot] = (footBreakdown[b.foot] ?? 0) + 1;
    const totalBoxCount = boxesToShip.length + cartonsToShip.reduce((sum, c) => sum + c.box_ids.length, 0);

    const dispatchResult = await client.query(
      `INSERT INTO dispatch_records
       (source_type, sample_record_id, dispatched_by, customer_id, destination, transport_details, lr_number, vehicle_number, dispatch_date, notes,
        sample_recipient_name, sample_purpose, sample_reference_date, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        'SAMPLE', sampleRecordId, dispatchedBy, input.customer_id || null, destination,
        input.transport_details || null, input.lr_number || null, input.vehicle_number || null,
        dispatchDate, input.notes || null,
        input.sample_recipient_name || null, input.sample_purpose || null, input.sample_reference_date || null,
        JSON.stringify({ child_box_count: totalBoxCount, sample_item_count: dedupedItems.length, feet: footBreakdown }),
      ]
    );
    const dispatchRecordId = dispatchResult.rows[0].id;

    // Ship whole cartons: PACKED boxes -> DISPATCHED, carton -> DISPATCHED,
    // sample_carton_mapping tagged (stays is_active=true — kept for history).
    for (const carton of cartonsToShip) {
      if (carton.box_ids.length > 0) {
        const cbPlaceholders = carton.box_ids.map((_, i) => `$${i + 2}`).join(', ');
        await client.query(
          `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id IN (${cbPlaceholders})`,
          [CHILD_BOX_STATUS.DISPATCHED, ...carton.box_ids]
        );
        for (const cbId of carton.box_ids) {
          await client.query(
            `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              TRANSACTION_TYPES.CHILD_DISPATCHED, cbId, carton.carton_id, dispatchedBy,
              `Sample carton child box dispatched to ${destination || 'unknown'}`,
              JSON.stringify({ sample_record_id: sampleRecordId, dispatch_record_id: dispatchRecordId, destination }),
            ]
          );
        }
      }
      await client.query(
        `UPDATE master_cartons SET status = $1, dispatched_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [MASTER_CARTON_STATUS.DISPATCHED, carton.carton_id]
      );
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CARTON_DISPATCHED, carton.carton_id, dispatchedBy,
          `Carton ${carton.carton_barcode} dispatched with sample ${sample.sample_barcode} to ${destination || 'unknown'}`,
          JSON.stringify({ dispatch_record_id: dispatchRecordId, sample_record_id: sampleRecordId, destination, box_count: carton.box_ids.length }),
        ]
      );
      await client.query(`UPDATE sample_carton_mapping SET dispatch_record_id = $1 WHERE id = $2`, [dispatchRecordId, carton.mapping_id]);
    }

    // Ship loose boxes — tag the mapping row, log per-foot.
    for (const box of boxesToShip) {
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CHILD_DISPATCHED, box.child_box_id, dispatchedBy,
          `Sample child box (${box.foot.toLowerCase()}) dispatched to ${destination || 'unknown'}`,
          JSON.stringify({ sample_record_id: sampleRecordId, dispatch_record_id: dispatchRecordId, destination, foot: box.foot }),
        ]
      );
      await client.query(`UPDATE sample_box_mapping SET dispatch_record_id = $1 WHERE id = $2`, [dispatchRecordId, box.mapping_id]);
    }

    // Flip box statuses AFTER every shipped mapping row is tagged — one query,
    // covering both same-sample and cross-sample remaining feet. A box goes:
    //   DISPATCHED  if BOTH feet are now gone (shipped this round or previously)
    //   PARTIAL     if one foot just shipped and the other was never allocated
    //   unchanged   (stays SAMPLE) if the other foot is still open elsewhere
    // This is the fix for the "shipping one shoe strands the other" bug: the
    // old rule only checked whether another LIVE sample held the other foot;
    // it never let an unallocated foot return to available stock.
    const shippedBoxIds = [...new Set(boxesToShip.map((b) => b.child_box_id))];
    if (shippedBoxIds.length > 0) {
      await client.query(
        `WITH shipped AS (
           SELECT sbm.child_box_id,
                  bool_or(sbm.foot = 'LEFT')  AS shipped_left,
                  bool_or(sbm.foot = 'RIGHT') AS shipped_right,
                  bool_or(sbm.foot = 'PAIR')  AS shipped_pair
           FROM sample_box_mapping sbm
           WHERE sbm.dispatch_record_id = $1
           GROUP BY sbm.child_box_id
         )
         UPDATE child_boxes cb
            SET left_dispatched_at = CASE WHEN s.shipped_left AND cb.left_dispatched_at IS NULL THEN NOW() ELSE cb.left_dispatched_at END,
                right_dispatched_at = CASE WHEN s.shipped_right AND cb.right_dispatched_at IS NULL THEN NOW() ELSE cb.right_dispatched_at END,
                status = CASE
                  WHEN s.shipped_pair
                    OR ((s.shipped_left OR cb.left_dispatched_at IS NOT NULL) AND (s.shipped_right OR cb.right_dispatched_at IS NOT NULL))
                    THEN 'DISPATCHED'::child_box_status
                  WHEN EXISTS (
                         SELECT 1 FROM sample_box_mapping o
                          WHERE o.child_box_id = cb.id AND o.is_active = true AND o.dispatch_record_id IS NULL)
                    THEN 'SAMPLE'::child_box_status
                  ELSE 'PARTIAL'::child_box_status
                END,
                updated_at = NOW()
           FROM shipped s
          WHERE cb.id = s.child_box_id`,
        [dispatchRecordId]
      );
    }

    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        TRANSACTION_TYPES.SAMPLE_DISPATCHED, dispatchedBy,
        `Sample ${sample.sample_barcode} dispatched (${dedupedItems.length} item(s)) to ${destination || 'unknown'}`,
        JSON.stringify({ sample_record_id: sampleRecordId, dispatch_record_id: dispatchRecordId, destination, item_count: dedupedItems.length, box_count: totalBoxCount, feet: footBreakdown }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: dispatchedBy,
      action: 'CREATE_DISPATCH',
      entityType: 'dispatch_record',
      entityId: dispatchRecordId,
      newValues: { source_type: 'sample', sample_record_id: sampleRecordId, destination, item_count: dedupedItems.length, child_box_count: totalBoxCount },
    });

    logger.info(`Sample dispatch created: ${sample.sample_barcode} (${dedupedItems.length} items) to ${destination}`);
    return [dispatchResult.rows[0]];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Dispatch a mix of loose boxes / whole cartons scanned straight out of the
 * E-commerce Area pool (see ecommerce.service.ts#getEcommercePool). Replaces
 * the old record-scoped _dispatchEcommerce — there is no more ecommerce_records
 * grouping to mark DISPATCHED; only the pool mapping rows themselves get their
 * dispatch_record_id set (and stay is_active=true — the same "kept for history"
 * convention the carton branches used before).
 */
async function _dispatchEcommercePool(
  input: CreateDispatchInput,
  dispatchedBy: string
): Promise<DispatchRecord[]> {
  const items = input.ecommerce_pool!.items;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Dedupe by item_type:barcode — collapse duplicate scans in one payload
    const dedupedByKey = new Map<string, { item_type: 'BOX' | 'CARTON'; barcode: string }>();
    for (const item of items) {
      const key = `${item.item_type}:${item.barcode}`;
      if (!dedupedByKey.has(key)) {
        dedupedByKey.set(key, item);
      }
    }
    const dedupedItems = Array.from(dedupedByKey.values());

    const dispatchDate = input.dispatch_date ? new Date(input.dispatch_date) : new Date();
    const destination = await resolveDestination(client, input.customer_id, input.destination);

    // Validate + lock everything FIRST — abort before any mutation on a bad item.
    const cartonsToShip: { mapping_id: string; carton_id: string; carton_barcode: string; box_ids: string[] }[] = [];
    const boxesToShip: { mapping_id: string; child_box_id: string; barcode: string }[] = [];

    for (const item of dedupedItems) {
      if (item.item_type === 'CARTON') {
        const cartonResult = await client.query(
          `SELECT ecm.id AS mapping_id, mc.id AS carton_id, mc.carton_barcode, mc.child_count
           FROM ecommerce_carton_mapping ecm
           JOIN master_cartons mc ON mc.id = ecm.master_carton_id
           WHERE mc.carton_barcode = $1 AND ecm.is_active = true AND ecm.dispatch_record_id IS NULL AND mc.status <> $2
           FOR UPDATE OF ecm, mc`,
          [item.barcode, MASTER_CARTON_STATUS.DISPATCHED]
        );
        if (cartonResult.rows.length === 0) {
          throw new BadRequestError(`Master carton ${item.barcode} is not in the E-commerce Area`);
        }
        const row = cartonResult.rows[0];

        const cartonBoxesResult = await client.query(
          `SELECT cb.id FROM carton_child_mapping ccm
           JOIN child_boxes cb ON cb.id = ccm.child_box_id
           WHERE ccm.master_carton_id = $1 AND ccm.is_active = true AND cb.status = $2
           FOR UPDATE OF cb`,
          [row.carton_id, CHILD_BOX_STATUS.PACKED]
        );

        cartonsToShip.push({
          mapping_id: row.mapping_id,
          carton_id: row.carton_id,
          carton_barcode: row.carton_barcode,
          box_ids: cartonBoxesResult.rows.map((r: { id: string }) => r.id),
        });
      } else {
        const boxResult = await client.query(
          `SELECT ebm.id AS mapping_id, cb.id AS child_box_id, cb.barcode
           FROM ecommerce_box_mapping ebm
           JOIN child_boxes cb ON cb.id = ebm.child_box_id
           WHERE cb.barcode = $1 AND ebm.is_active = true AND ebm.dispatch_record_id IS NULL AND cb.status = $2
           FOR UPDATE OF ebm, cb`,
          [item.barcode, CHILD_BOX_STATUS.ECOMMERCE]
        );
        if (boxResult.rows.length === 0) {
          throw new BadRequestError(`Child box ${item.barcode} is not in the E-commerce Area`);
        }
        const row = boxResult.rows[0];
        boxesToShip.push({ mapping_id: row.mapping_id, child_box_id: row.child_box_id, barcode: row.barcode });
      }
    }

    const totalBoxCount =
      boxesToShip.length + cartonsToShip.reduce((sum, c) => sum + c.box_ids.length, 0);

    // Create dispatch record
    const dispatchResult = await client.query(
      `INSERT INTO dispatch_records
       (source_type, dispatched_by, customer_id, destination, transport_details, lr_number, vehicle_number, dispatch_date, notes,
        reference_name, marketplace, order_reference, listing_sku, order_date, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        'ECOMMERCE',
        dispatchedBy,
        input.customer_id || null,
        destination,
        input.transport_details || null,
        input.lr_number || null,
        input.vehicle_number || null,
        dispatchDate,
        input.notes || null,
        input.reference_name || null,
        input.marketplace || null,
        input.order_reference || null,
        input.listing_sku || null,
        input.order_date || null,
        JSON.stringify({ child_box_count: totalBoxCount, ecom_pool_item_count: dedupedItems.length }),
      ]
    );
    const dispatchRecordId = dispatchResult.rows[0].id;

    // Ship whole cartons: their PACKED boxes go DISPATCHED, carton goes DISPATCHED,
    // and the pool mapping row is tagged with this dispatch (stays is_active=true).
    for (const carton of cartonsToShip) {
      if (carton.box_ids.length > 0) {
        const cbPlaceholders = carton.box_ids.map((_, i) => `$${i + 2}`).join(', ');
        await client.query(
          `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id IN (${cbPlaceholders})`,
          [CHILD_BOX_STATUS.DISPATCHED, ...carton.box_ids]
        );

        for (const cbId of carton.box_ids) {
          await client.query(
            `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              TRANSACTION_TYPES.CHILD_DISPATCHED, cbId, carton.carton_id, dispatchedBy,
              `E-commerce carton child box dispatched to ${destination || 'unknown'}`,
              JSON.stringify({ dispatch_record_id: dispatchRecordId, destination }),
            ]
          );
        }
      }

      await client.query(
        `UPDATE master_cartons SET status = $1, dispatched_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [MASTER_CARTON_STATUS.DISPATCHED, carton.carton_id]
      );

      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CARTON_DISPATCHED, carton.carton_id, dispatchedBy,
          `Carton ${carton.carton_barcode} dispatched from the E-commerce Area to ${destination || 'unknown'}`,
          JSON.stringify({ dispatch_record_id: dispatchRecordId, destination, box_count: carton.box_ids.length }),
        ]
      );

      await client.query(
        `UPDATE ecommerce_carton_mapping SET dispatch_record_id = $1 WHERE id = $2`,
        [dispatchRecordId, carton.mapping_id]
      );
    }

    // Ship loose boxes
    for (const box of boxesToShip) {
      await client.query(
        `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
        [CHILD_BOX_STATUS.DISPATCHED, box.child_box_id]
      );

      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CHILD_DISPATCHED, box.child_box_id, dispatchedBy,
          `E-commerce child box dispatched to ${destination || 'unknown'}`,
          JSON.stringify({ dispatch_record_id: dispatchRecordId, destination }),
        ]
      );

      await client.query(
        `UPDATE ecommerce_box_mapping SET dispatch_record_id = $1 WHERE id = $2`,
        [dispatchRecordId, box.mapping_id]
      );
    }

    // Log ECOMMERCE_DISPATCHED transaction
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        TRANSACTION_TYPES.ECOMMERCE_DISPATCHED, dispatchedBy,
        `E-commerce Area dispatch (${dedupedItems.length} item${dedupedItems.length === 1 ? '' : 's'}) to ${destination || 'unknown'}`,
        JSON.stringify({
          dispatch_record_id: dispatchRecordId,
          item_count: dedupedItems.length,
          box_count: totalBoxCount,
          marketplace: input.marketplace || null,
          order_reference: input.order_reference || null,
        }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: dispatchedBy,
      action: 'CREATE_DISPATCH',
      entityType: 'dispatch_record',
      entityId: dispatchRecordId,
      newValues: {
        source_type: 'ecommerce',
        destination,
        item_count: dedupedItems.length,
        child_box_count: totalBoxCount,
      },
    });

    logger.info(`E-commerce pool dispatch created: ${dedupedItems.length} items (${totalBoxCount} boxes) to ${destination}`);
    return [dispatchResult.rows[0]];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getDispatchById(id: string): Promise<DispatchRecord> {
  const result = await query(
    `SELECT dr.*,
       mc.carton_barcode, mc.child_count,
       sr.sample_barcode,
       er.ecommerce_barcode,
       c.firm_name AS customer_firm_name,
       lower(dr.source_type) AS source_type,
       COALESCE(mc.carton_barcode, sr.sample_barcode, er.ecommerce_barcode, NULLIF(dr.order_reference, ''), NULLIF(dr.reference_name, ''), NULLIF(dr.marketplace, ''), CASE WHEN dr.source_type = 'ECOMMERCE' THEN 'E-commerce' END) as source_label,
       ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary,
       COALESCE(rc.returned_box_count, 0) AS returned_box_count,
       COALESCE((dr.metadata->>'child_box_count')::int, 0) AS total_box_count,
       CASE
         WHEN COALESCE(rc.returned_box_count,0) = 0 THEN 'none'
         WHEN COALESCE((dr.metadata->>'child_box_count')::int,0) > 0
              AND COALESCE(rc.returned_box_count,0) < COALESCE((dr.metadata->>'child_box_count')::int,0) THEN 'partial'
         ELSE 'full'
       END AS return_status
     FROM dispatch_records dr
     LEFT JOIN master_cartons mc ON mc.id = dr.master_carton_id
     LEFT JOIN sample_records sr ON sr.id = dr.sample_record_id
     LEFT JOIN ecommerce_records er ON er.id = dr.ecommerce_record_id
     LEFT JOIN customers c ON c.id = dr.customer_id
     LEFT JOIN LATERAL (
       SELECT
         string_agg(DISTINCT p.article_name, ', ') as article_summary,
         string_agg(DISTINCT p.colour, ', ') as colour_summary,
         string_agg(DISTINCT p.size, ', ') as size_summary,
         MIN(p.mrp) as mrp_summary
       FROM (
         SELECT cb.id FROM carton_child_mapping ccm JOIN child_boxes cb ON cb.id = ccm.child_box_id WHERE ccm.master_carton_id = mc.id
         UNION ALL
         SELECT cb.id FROM sample_box_mapping sbm JOIN child_boxes cb ON cb.id = sbm.child_box_id WHERE sbm.dispatch_record_id = dr.id
         UNION ALL
         SELECT cb.id FROM sample_carton_mapping scm
         JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id AND ccm.is_active = true
         JOIN child_boxes cb ON cb.id = ccm.child_box_id
         WHERE scm.dispatch_record_id = dr.id
         UNION ALL
         SELECT cb.id FROM ecommerce_box_mapping ebm JOIN child_boxes cb ON cb.id = ebm.child_box_id WHERE ebm.dispatch_record_id = dr.id
         UNION ALL
         SELECT cb.id FROM ecommerce_carton_mapping ecm
         JOIN carton_child_mapping ccm ON ccm.master_carton_id = ecm.master_carton_id AND ccm.is_active = true
         JOIN child_boxes cb ON cb.id = ccm.child_box_id
         WHERE ecm.dispatch_record_id = dr.id
       ) src_boxes
       JOIN child_boxes cb ON cb.id = src_boxes.id
       JOIN products p ON p.id = cb.product_id
     ) ps ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT ri.child_box_id) AS returned_box_count
       FROM return_items ri WHERE ri.dispatch_record_id = dr.id
     ) rc ON true
     WHERE dr.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Dispatch record not found');
  }
  return result.rows[0];
}

export async function getDispatches(
  filters: {
    destination?: string;
    from_date?: string;
    to_date?: string;
    search?: string;
    return_status?: string;
  },
  page: number = 1,
  limit: number = 25
): Promise<{ data: DispatchRecord[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.destination) {
    conditions.push(`dr.destination ILIKE $${paramIndex++}`);
    values.push(`%${filters.destination}%`);
  }
  if (filters.from_date) {
    conditions.push(dateFromCondition('dr.dispatch_date', paramIndex++));
    values.push(filters.from_date);
  }
  if (filters.to_date) {
    conditions.push(dateToCondition('dr.dispatch_date', paramIndex++));
    values.push(filters.to_date);
  }
  if (filters.search) {
    conditions.push(`(dr.destination ILIKE $${paramIndex} OR dr.lr_number ILIKE $${paramIndex} OR dr.vehicle_number ILIKE $${paramIndex} OR mc.carton_barcode ILIKE $${paramIndex} OR sr.sample_barcode ILIKE $${paramIndex} OR er.ecommerce_barcode ILIKE $${paramIndex} OR c.firm_name ILIKE $${paramIndex} OR dr.order_reference ILIKE $${paramIndex} OR dr.reference_name ILIKE $${paramIndex} OR dr.marketplace ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }
  if (filters.return_status === 'none') {
    conditions.push(`COALESCE(rc.returned_box_count,0) = 0`);
  } else if (filters.return_status === 'partial') {
    conditions.push(`COALESCE(rc.returned_box_count,0) > 0 AND COALESCE((dr.metadata->>'child_box_count')::int,0) > 0 AND COALESCE(rc.returned_box_count,0) < COALESCE((dr.metadata->>'child_box_count')::int,0)`);
  } else if (filters.return_status === 'full') {
    conditions.push(`COALESCE(rc.returned_box_count,0) > 0 AND (COALESCE((dr.metadata->>'child_box_count')::int,0) = 0 OR COALESCE(rc.returned_box_count,0) >= COALESCE((dr.metadata->>'child_box_count')::int,0))`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM dispatch_records dr
     LEFT JOIN master_cartons mc ON mc.id = dr.master_carton_id
     LEFT JOIN sample_records sr ON sr.id = dr.sample_record_id
     LEFT JOIN ecommerce_records er ON er.id = dr.ecommerce_record_id
     LEFT JOIN customers c ON c.id = dr.customer_id
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT ri.child_box_id) AS returned_box_count
       FROM return_items ri WHERE ri.dispatch_record_id = dr.id
     ) rc ON true
     ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT dr.*,
       mc.carton_barcode, mc.child_count,
       sr.sample_barcode,
       er.ecommerce_barcode,
       lower(dr.source_type) AS source_type,
       COALESCE(mc.carton_barcode, sr.sample_barcode, er.ecommerce_barcode, NULLIF(dr.order_reference, ''), NULLIF(dr.reference_name, ''), NULLIF(dr.marketplace, ''), CASE WHEN dr.source_type = 'ECOMMERCE' THEN 'E-commerce' END) as source_label,
       c.firm_name AS customer_firm_name,
       ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary,
       COALESCE(rc.returned_box_count, 0) AS returned_box_count,
       COALESCE((dr.metadata->>'child_box_count')::int, 0) AS total_box_count,
       CASE
         WHEN COALESCE(rc.returned_box_count,0) = 0 THEN 'none'
         WHEN COALESCE((dr.metadata->>'child_box_count')::int,0) > 0
              AND COALESCE(rc.returned_box_count,0) < COALESCE((dr.metadata->>'child_box_count')::int,0) THEN 'partial'
         ELSE 'full'
       END AS return_status
     FROM dispatch_records dr
     LEFT JOIN master_cartons mc ON mc.id = dr.master_carton_id
     LEFT JOIN sample_records sr ON sr.id = dr.sample_record_id
     LEFT JOIN ecommerce_records er ON er.id = dr.ecommerce_record_id
     LEFT JOIN customers c ON c.id = dr.customer_id
     LEFT JOIN LATERAL (
       SELECT
         string_agg(DISTINCT p.article_name, ', ') as article_summary,
         string_agg(DISTINCT p.colour, ', ') as colour_summary,
         string_agg(DISTINCT p.size, ', ') as size_summary,
         MIN(p.mrp) as mrp_summary
       FROM (
         SELECT cb.id FROM carton_child_mapping ccm JOIN child_boxes cb ON cb.id = ccm.child_box_id WHERE ccm.master_carton_id = mc.id
         UNION ALL
         SELECT cb.id FROM sample_box_mapping sbm JOIN child_boxes cb ON cb.id = sbm.child_box_id WHERE sbm.dispatch_record_id = dr.id
         UNION ALL
         SELECT cb.id FROM sample_carton_mapping scm
         JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id AND ccm.is_active = true
         JOIN child_boxes cb ON cb.id = ccm.child_box_id
         WHERE scm.dispatch_record_id = dr.id
         UNION ALL
         SELECT cb.id FROM ecommerce_box_mapping ebm JOIN child_boxes cb ON cb.id = ebm.child_box_id WHERE ebm.dispatch_record_id = dr.id
         UNION ALL
         SELECT cb.id FROM ecommerce_carton_mapping ecm
         JOIN carton_child_mapping ccm ON ccm.master_carton_id = ecm.master_carton_id AND ccm.is_active = true
         JOIN child_boxes cb ON cb.id = ccm.child_box_id
         WHERE ecm.dispatch_record_id = dr.id
       ) src_boxes
       JOIN child_boxes cb ON cb.id = src_boxes.id
       JOIN products p ON p.id = cb.product_id
     ) ps ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT ri.child_box_id) AS returned_box_count
       FROM return_items ri WHERE ri.dispatch_record_id = dr.id
     ) rc ON true
     ${whereClause}
     ORDER BY dr.dispatch_date DESC, dr.created_at DESC, dr.id
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}
