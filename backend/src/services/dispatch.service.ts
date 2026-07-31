import { query, getClient } from '../config/database';
import { DispatchRecord } from '../types';
import { MASTER_CARTON_STATUS, CHILD_BOX_STATUS, SAMPLE_STATUS, ECOMMERCE_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateDispatchInput } from '../models/schemas/dispatch.schema';
import { deactivateLooseMapping, releaseCartonFromSample, takeBoxOutOfCartonAllocation, recomputeSampleChildCount } from './sample.service';
import { logger } from '../utils/logger';

export async function createDispatch(
  input: CreateDispatchInput,
  dispatchedBy: string
): Promise<DispatchRecord[]> {
  // Route to appropriate handler based on source type
  if (input.sample_record_id) {
    return _dispatchSample(input, dispatchedBy);
  }
  if (input.ecommerce_record_id) {
    return _dispatchEcommerce(input, dispatchedBy);
  }
  return _dispatchMasterCartons(input, dispatchedBy);
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
           EXISTS (SELECT 1 FROM sample_carton_mapping scm WHERE scm.master_carton_id = mc.id AND scm.is_active = true)
           OR EXISTS (SELECT 1 FROM ecommerce_carton_mapping ecm WHERE ecm.master_carton_id = mc.id AND ecm.is_active = true)
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

    // Auto-fill destination from customer if not provided
    let destination = input.destination || null;
    if (input.customer_id && !destination) {
      const customerResult = await client.query(
        'SELECT delivery_location FROM customers WHERE id = $1',
        [input.customer_id]
      );
      if (customerResult.rows.length > 0 && customerResult.rows[0].delivery_location) {
        destination = customerResult.rows[0].delivery_location;
      }
    }

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
         (master_carton_id, dispatched_by, customer_id, destination, transport_details, lr_number, vehicle_number, dispatch_date, notes, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
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

async function _dispatchSample(
  input: CreateDispatchInput,
  dispatchedBy: string
): Promise<DispatchRecord[]> {
  const sampleRecordId = input.sample_record_id!;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock and validate sample record
    const srResult = await client.query(
      'SELECT * FROM sample_records WHERE id = $1 FOR UPDATE',
      [sampleRecordId]
    );
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];

    if (sample.status !== SAMPLE_STATUS.CLOSED && sample.status !== SAMPLE_STATUS.ACTIVE) {
      throw new BadRequestError(
        `Sample record must be in ACTIVE or CLOSED status for dispatch. Current status: ${sample.status}`
      );
    }

    const dispatchDate = input.dispatch_date ? new Date(input.dispatch_date) : new Date();

    // Auto-fill destination from customer if not provided
    let destination = input.destination || null;
    if (input.customer_id && !destination) {
      const customerResult = await client.query(
        'SELECT delivery_location FROM customers WHERE id = $1',
        [input.customer_id]
      );
      if (customerResult.rows.length > 0 && customerResult.rows[0].delivery_location) {
        destination = customerResult.rows[0].delivery_location;
      }
    }

    // Optional partial dispatch: ship only some of the sample's contents.
    // Everything not selected is released back to available stock BEFORE the
    // sample is marked DISPATCHED, so the existing all-or-nothing logic below
    // (which processes "every currently active mapping") is correct by
    // construction once this has run — it only ever sees what's left, i.e.
    // exactly the selected scope.
    let scopeReleasedBoxCount = 0;
    const scopeReleasedCartonBarcodes: string[] = [];
    if (input.sample_scope) {
      const looseResult = await client.query(
        `SELECT id AS mapping_id, child_box_id FROM sample_box_mapping
         WHERE sample_record_id = $1 AND is_active = true FOR UPDATE`,
        [sampleRecordId]
      );
      const cartonAllocResult = await client.query(
        `SELECT scm.master_carton_id, mc.carton_barcode, ccm.child_box_id
         FROM sample_carton_mapping scm
         JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id AND ccm.is_active = true
         JOIN master_cartons mc ON mc.id = scm.master_carton_id
         WHERE scm.sample_record_id = $1 AND scm.is_active = true
         FOR UPDATE OF scm, mc`,
        [sampleRecordId]
      );

      const currentBoxIds = new Set<string>([
        ...looseResult.rows.map((r: { child_box_id: string }) => r.child_box_id),
        ...cartonAllocResult.rows.map((r: { child_box_id: string }) => r.child_box_id),
      ]);
      const selectedSet = new Set(input.sample_scope.child_box_ids);
      const invalidIds = input.sample_scope.child_box_ids.filter((id) => !currentBoxIds.has(id));
      if (invalidIds.length > 0) {
        const bcResult = await client.query(
          `SELECT barcode FROM child_boxes WHERE id = ANY($1::uuid[])`,
          [invalidIds]
        );
        const barcodes = bcResult.rows.map((r: { barcode: string }) => r.barcode);
        throw new BadRequestError(
          `These boxes are not currently in this sample: ${barcodes.length > 0 ? barcodes.join(', ') : invalidIds.join(', ')}`
        );
      }

      // Loose boxes not selected -> leave the sample (back to FREE, or stays
      // SAMPLE if the other foot is still live elsewhere).
      for (const row of looseResult.rows as { mapping_id: string; child_box_id: string }[]) {
        if (selectedSet.has(row.child_box_id)) continue;
        const cbResult = await client.query('SELECT barcode FROM child_boxes WHERE id = $1', [row.child_box_id]);
        await deactivateLooseMapping(client, {
          mappingId: row.mapping_id,
          childBoxId: row.child_box_id,
          childBarcode: cbResult.rows[0].barcode,
          sampleRecordId,
          sampleBarcode: sample.sample_barcode,
          userId: dispatchedBy,
        });
        scopeReleasedBoxCount++;
      }

      // Cartons: none selected -> release whole carton; some selected -> take
      // those out individually then release the rest; all selected -> leave
      // alone (the existing carton-dispatch loop below ships it whole).
      const cartonGroups = new Map<string, { carton_barcode: string; box_ids: string[] }>();
      for (const row of cartonAllocResult.rows as { master_carton_id: string; carton_barcode: string; child_box_id: string }[]) {
        if (!cartonGroups.has(row.master_carton_id)) {
          cartonGroups.set(row.master_carton_id, { carton_barcode: row.carton_barcode, box_ids: [] });
        }
        cartonGroups.get(row.master_carton_id)!.box_ids.push(row.child_box_id);
      }
      for (const [cartonId, group] of cartonGroups) {
        const selectedInCarton = group.box_ids.filter((id) => selectedSet.has(id));
        if (selectedInCarton.length === 0) {
          await releaseCartonFromSample(client, { sampleRecordId, masterCartonId: cartonId, userId: dispatchedBy });
          scopeReleasedCartonBarcodes.push(group.carton_barcode);
        } else if (selectedInCarton.length < group.box_ids.length) {
          for (const boxId of selectedInCarton) {
            await takeBoxOutOfCartonAllocation(client, { sampleRecordId, childBoxId: boxId, userId: dispatchedBy });
          }
          await releaseCartonFromSample(client, { sampleRecordId, masterCartonId: cartonId, userId: dispatchedBy });
          scopeReleasedCartonBarcodes.push(`${group.carton_barcode} (${group.box_ids.length - selectedInCarton.length} boxes)`);
        }
        // else: every box in this carton was selected — leave the allocation as-is.
      }

      await recomputeSampleChildCount(client, sampleRecordId);
    }

    // Mark sample record as DISPATCHED
    await client.query(
      `UPDATE sample_records SET status = $1, dispatched_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [SAMPLE_STATUS.DISPATCHED, sampleRecordId]
    );

    // All active foot allocations shipping with this sample (one row per foot — a box may
    // contribute just its LEFT or RIGHT foot). Used for the shipped-unit count + per-foot audit.
    const shippedFeetResult = await client.query(
      `SELECT cb.id, sbm.foot FROM sample_box_mapping sbm
       JOIN child_boxes cb ON cb.id = sbm.child_box_id
       WHERE sbm.sample_record_id = $1 AND sbm.is_active = true AND cb.status = $2`,
      [sampleRecordId, CHILD_BOX_STATUS.SAMPLE]
    );
    const shippedFeet = shippedFeetResult.rows as { id: string; foot: string }[];

    // Foot-split: only flip a box to DISPATCHED when this sample holds its LAST active foot.
    // If the box's other foot is still in another live (non-dispatched) sample, leave it SAMPLE
    // until that sample dispatches too.
    const lastFootResult = await client.query(
      `SELECT cb.id FROM sample_box_mapping sbm
       JOIN child_boxes cb ON cb.id = sbm.child_box_id
       WHERE sbm.sample_record_id = $1 AND sbm.is_active = true AND cb.status = $2
       AND NOT EXISTS (
         SELECT 1 FROM sample_box_mapping o
         JOIN sample_records osr ON osr.id = o.sample_record_id
         WHERE o.child_box_id = cb.id AND o.is_active = true
           AND o.sample_record_id <> $1 AND osr.status <> $3
       )`,
      [sampleRecordId, CHILD_BOX_STATUS.SAMPLE, SAMPLE_STATUS.DISPATCHED]
    );
    const boxesToDispatch = lastFootResult.rows.map((cb: { id: string }) => cb.id);

    // Update last-foot boxes to DISPATCHED
    if (boxesToDispatch.length > 0) {
      const cbPlaceholders = boxesToDispatch.map((_: string, i: number) => `$${i + 2}`).join(', ');
      await client.query(
        `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id IN (${cbPlaceholders})`,
        [CHILD_BOX_STATUS.DISPATCHED, ...boxesToDispatch]
      );
    }

    // Log a CHILD_DISPATCHED per shipped foot (the foot physically left, even if the box
    // stays SAMPLE because its other foot is still in another live sample).
    for (const m of shippedFeet) {
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CHILD_DISPATCHED, m.id, dispatchedBy,
          `Sample child box (${m.foot.toLowerCase()}) dispatched to ${destination || 'unknown'}`,
          JSON.stringify({ sample_record_id: sampleRecordId, destination, foot: m.foot }),
        ]
      );
    }
    let shippedCount = shippedFeet.length;

    // Whole-carton allocations (sample_carton_mapping) shipping with this sample: the
    // carton + its PACKED child boxes go DISPATCHED, but the carton_child_mapping AND
    // the sample_carton_mapping stay ACTIVE (kept for history / the dispatch CSV report).
    const cartonMappingsResult = await client.query(
      `SELECT mc.id AS master_carton_id, mc.carton_barcode, mc.child_count
       FROM sample_carton_mapping scm
       JOIN master_cartons mc ON mc.id = scm.master_carton_id
       WHERE scm.sample_record_id = $1 AND scm.is_active = true
       FOR UPDATE OF mc`,
      [sampleRecordId]
    );
    const dispatchedCartons: { master_carton_id: string; carton_barcode: string; box_count: number }[] = [];

    for (const carton of cartonMappingsResult.rows as { master_carton_id: string; carton_barcode: string; child_count: number }[]) {
      const cartonBoxesResult = await client.query(
        `SELECT cb.id FROM carton_child_mapping ccm
         JOIN child_boxes cb ON cb.id = ccm.child_box_id
         WHERE ccm.master_carton_id = $1 AND ccm.is_active = true AND cb.status = $2`,
        [carton.master_carton_id, CHILD_BOX_STATUS.PACKED]
      );
      const cartonBoxIds = cartonBoxesResult.rows.map((cb: { id: string }) => cb.id);

      if (cartonBoxIds.length > 0) {
        const cbPlaceholders = cartonBoxIds.map((_: string, i: number) => `$${i + 2}`).join(', ');
        await client.query(
          `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id IN (${cbPlaceholders})`,
          [CHILD_BOX_STATUS.DISPATCHED, ...cartonBoxIds]
        );

        for (const cbId of cartonBoxIds) {
          await client.query(
            `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              TRANSACTION_TYPES.CHILD_DISPATCHED, cbId, carton.master_carton_id, dispatchedBy,
              `Sample carton child box dispatched to ${destination || 'unknown'}`,
              JSON.stringify({ sample_record_id: sampleRecordId, destination }),
            ]
          );
        }
      }

      await client.query(
        `UPDATE master_cartons SET status = $1, dispatched_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [MASTER_CARTON_STATUS.DISPATCHED, carton.master_carton_id]
      );

      dispatchedCartons.push({
        master_carton_id: carton.master_carton_id,
        carton_barcode: carton.carton_barcode,
        box_count: cartonBoxIds.length,
      });
      shippedCount += cartonBoxIds.length;
    }

    // Create dispatch record
    const dispatchResult = await client.query(
      `INSERT INTO dispatch_records
       (sample_record_id, dispatched_by, customer_id, destination, transport_details, lr_number, vehicle_number, dispatch_date, notes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        sampleRecordId,
        dispatchedBy,
        input.customer_id || null,
        destination,
        input.transport_details || null,
        input.lr_number || null,
        input.vehicle_number || null,
        dispatchDate,
        input.notes || null,
        JSON.stringify(
          input.sample_scope
            ? {
                child_box_count: shippedCount,
                scoped: true,
                released_box_count: scopeReleasedBoxCount,
                released_carton_barcodes: scopeReleasedCartonBarcodes,
              }
            : { child_box_count: shippedCount }
        ),
      ]
    );

    // Log CARTON_DISPATCHED for each whole-carton allocation shipped with this sample
    for (const dc of dispatchedCartons) {
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CARTON_DISPATCHED, dc.master_carton_id, dispatchedBy,
          `Carton ${dc.carton_barcode} dispatched with sample ${sample.sample_barcode} to ${destination || 'unknown'}`,
          JSON.stringify({
            dispatch_record_id: dispatchResult.rows[0].id,
            sample_record_id: sampleRecordId,
            destination,
            box_count: dc.box_count,
          }),
        ]
      );
    }

    // Log SAMPLE_DISPATCHED transaction
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        TRANSACTION_TYPES.SAMPLE_DISPATCHED, dispatchedBy,
        `Sample ${sample.sample_barcode} dispatched to ${destination || 'unknown'}`,
        JSON.stringify({ sample_record_id: sampleRecordId, dispatch_record_id: dispatchResult.rows[0].id, destination }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: dispatchedBy,
      action: 'CREATE_DISPATCH',
      entityType: 'dispatch_record',
      newValues: {
        source_type: 'sample',
        sample_record_id: sampleRecordId,
        destination,
        child_box_count: shippedCount,
      },
    });

    logger.info(`Sample dispatch created: ${sample.sample_barcode} to ${destination}`);
    return [dispatchResult.rows[0]];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function _dispatchEcommerce(
  input: CreateDispatchInput,
  dispatchedBy: string
): Promise<DispatchRecord[]> {
  const ecommerceRecordId = input.ecommerce_record_id!;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock and validate ecommerce record
    const erResult = await client.query(
      'SELECT * FROM ecommerce_records WHERE id = $1 FOR UPDATE',
      [ecommerceRecordId]
    );
    if (erResult.rows.length === 0) {
      throw new NotFoundError('E-commerce record not found');
    }
    const ecom = erResult.rows[0];

    if (ecom.status !== ECOMMERCE_STATUS.CLOSED && ecom.status !== ECOMMERCE_STATUS.ACTIVE) {
      throw new BadRequestError(
        `E-commerce record must be in ACTIVE or CLOSED status for dispatch. Current status: ${ecom.status}`
      );
    }

    const dispatchDate = input.dispatch_date ? new Date(input.dispatch_date) : new Date();

    // Auto-fill destination from customer if not provided
    let destination = input.destination || null;
    if (input.customer_id && !destination) {
      const customerResult = await client.query(
        'SELECT delivery_location FROM customers WHERE id = $1',
        [input.customer_id]
      );
      if (customerResult.rows.length > 0 && customerResult.rows[0].delivery_location) {
        destination = customerResult.rows[0].delivery_location;
      }
    }

    // Mark ecommerce record as DISPATCHED
    await client.query(
      `UPDATE ecommerce_records SET status = $1, dispatched_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [ECOMMERCE_STATUS.DISPATCHED, ecommerceRecordId]
    );

    // Get all active ECOMMERCE child boxes in this record
    const childBoxesResult = await client.query(
      `SELECT cb.id FROM ecommerce_box_mapping ebm
       JOIN child_boxes cb ON cb.id = ebm.child_box_id
       WHERE ebm.ecommerce_record_id = $1 AND ebm.is_active = true AND cb.status = $2`,
      [ecommerceRecordId, CHILD_BOX_STATUS.ECOMMERCE]
    );
    const childBoxIds = childBoxesResult.rows.map((cb: { id: string }) => cb.id);

    // Update child boxes to DISPATCHED
    if (childBoxIds.length > 0) {
      const cbPlaceholders = childBoxIds.map((_: string, i: number) => `$${i + 2}`).join(', ');
      await client.query(
        `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id IN (${cbPlaceholders})`,
        [CHILD_BOX_STATUS.DISPATCHED, ...childBoxIds]
      );

      for (const cbId of childBoxIds) {
        await client.query(
          `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            TRANSACTION_TYPES.CHILD_DISPATCHED, cbId, dispatchedBy,
            `E-commerce child box dispatched to ${destination || 'unknown'}`,
            JSON.stringify({ ecommerce_record_id: ecommerceRecordId, destination }),
          ]
        );
      }
    }

    // Whole-carton allocations (ecommerce_carton_mapping) shipping with this record: the
    // carton + its PACKED child boxes go DISPATCHED, but the carton_child_mapping AND
    // the ecommerce_carton_mapping stay ACTIVE (kept for history / the dispatch CSV report).
    const cartonMappingsResult = await client.query(
      `SELECT mc.id AS master_carton_id, mc.carton_barcode, mc.child_count
       FROM ecommerce_carton_mapping ecm
       JOIN master_cartons mc ON mc.id = ecm.master_carton_id
       WHERE ecm.ecommerce_record_id = $1 AND ecm.is_active = true
       FOR UPDATE OF mc`,
      [ecommerceRecordId]
    );
    const dispatchedCartons: { master_carton_id: string; carton_barcode: string; box_count: number }[] = [];
    let totalDispatchedBoxCount = childBoxIds.length;

    for (const carton of cartonMappingsResult.rows as { master_carton_id: string; carton_barcode: string; child_count: number }[]) {
      const cartonBoxesResult = await client.query(
        `SELECT cb.id FROM carton_child_mapping ccm
         JOIN child_boxes cb ON cb.id = ccm.child_box_id
         WHERE ccm.master_carton_id = $1 AND ccm.is_active = true AND cb.status = $2`,
        [carton.master_carton_id, CHILD_BOX_STATUS.PACKED]
      );
      const cartonBoxIds = cartonBoxesResult.rows.map((cb: { id: string }) => cb.id);

      if (cartonBoxIds.length > 0) {
        const cbPlaceholders = cartonBoxIds.map((_: string, i: number) => `$${i + 2}`).join(', ');
        await client.query(
          `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id IN (${cbPlaceholders})`,
          [CHILD_BOX_STATUS.DISPATCHED, ...cartonBoxIds]
        );

        for (const cbId of cartonBoxIds) {
          await client.query(
            `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              TRANSACTION_TYPES.CHILD_DISPATCHED, cbId, carton.master_carton_id, dispatchedBy,
              `E-commerce carton child box dispatched to ${destination || 'unknown'}`,
              JSON.stringify({ ecommerce_record_id: ecommerceRecordId, destination }),
            ]
          );
        }
      }

      await client.query(
        `UPDATE master_cartons SET status = $1, dispatched_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [MASTER_CARTON_STATUS.DISPATCHED, carton.master_carton_id]
      );

      dispatchedCartons.push({
        master_carton_id: carton.master_carton_id,
        carton_barcode: carton.carton_barcode,
        box_count: cartonBoxIds.length,
      });
      totalDispatchedBoxCount += cartonBoxIds.length;
    }

    // Create dispatch record
    const dispatchResult = await client.query(
      `INSERT INTO dispatch_records
       (ecommerce_record_id, dispatched_by, customer_id, destination, transport_details, lr_number, vehicle_number, dispatch_date, notes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        ecommerceRecordId,
        dispatchedBy,
        input.customer_id || null,
        destination,
        input.transport_details || null,
        input.lr_number || null,
        input.vehicle_number || null,
        dispatchDate,
        input.notes || null,
        JSON.stringify({ child_box_count: totalDispatchedBoxCount }),
      ]
    );

    // Log CARTON_DISPATCHED for each whole-carton allocation shipped with this record
    for (const dc of dispatchedCartons) {
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CARTON_DISPATCHED, dc.master_carton_id, dispatchedBy,
          `Carton ${dc.carton_barcode} dispatched with e-commerce record ${ecom.ecommerce_barcode} to ${destination || 'unknown'}`,
          JSON.stringify({
            dispatch_record_id: dispatchResult.rows[0].id,
            ecommerce_record_id: ecommerceRecordId,
            destination,
            box_count: dc.box_count,
          }),
        ]
      );
    }

    // Log ECOMMERCE_DISPATCHED transaction
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        TRANSACTION_TYPES.ECOMMERCE_DISPATCHED, dispatchedBy,
        `E-commerce ${ecom.ecommerce_barcode} dispatched to ${destination || 'unknown'}`,
        JSON.stringify({ ecommerce_record_id: ecommerceRecordId, dispatch_record_id: dispatchResult.rows[0].id, destination }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: dispatchedBy,
      action: 'CREATE_DISPATCH',
      entityType: 'dispatch_record',
      newValues: {
        source_type: 'ecommerce',
        ecommerce_record_id: ecommerceRecordId,
        destination,
        child_box_count: totalDispatchedBoxCount,
      },
    });

    logger.info(`E-commerce dispatch created: ${ecom.ecommerce_barcode} to ${destination}`);
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
       CASE
         WHEN dr.master_carton_id IS NOT NULL THEN 'master_carton'
         WHEN dr.sample_record_id IS NOT NULL THEN 'sample'
         WHEN dr.ecommerce_record_id IS NOT NULL THEN 'ecommerce'
       END as source_type,
       COALESCE(mc.carton_barcode, sr.sample_barcode, er.ecommerce_barcode) as source_label,
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
    conditions.push(`dr.dispatch_date >= $${paramIndex++}`);
    values.push(filters.from_date);
  }
  if (filters.to_date) {
    conditions.push(`dr.dispatch_date <= $${paramIndex++}`);
    values.push(filters.to_date);
  }
  if (filters.search) {
    conditions.push(`(dr.destination ILIKE $${paramIndex} OR dr.lr_number ILIKE $${paramIndex} OR dr.vehicle_number ILIKE $${paramIndex} OR mc.carton_barcode ILIKE $${paramIndex} OR sr.sample_barcode ILIKE $${paramIndex} OR er.ecommerce_barcode ILIKE $${paramIndex} OR c.firm_name ILIKE $${paramIndex})`);
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
       CASE
         WHEN dr.master_carton_id IS NOT NULL THEN 'master_carton'
         WHEN dr.sample_record_id IS NOT NULL THEN 'sample'
         WHEN dr.ecommerce_record_id IS NOT NULL THEN 'ecommerce'
       END as source_type,
       COALESCE(mc.carton_barcode, sr.sample_barcode, er.ecommerce_barcode) as source_label,
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
         SELECT cb.id FROM sample_box_mapping sbm JOIN child_boxes cb ON cb.id = sbm.child_box_id WHERE sbm.sample_record_id = sr.id AND sbm.is_active = true
         UNION ALL
         SELECT cb.id FROM ecommerce_box_mapping ebm JOIN child_boxes cb ON cb.id = ebm.child_box_id WHERE ebm.ecommerce_record_id = er.id AND ebm.is_active = true
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
