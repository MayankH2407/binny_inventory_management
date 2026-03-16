import { query, getClient } from '../config/database';
import { DispatchRecord } from '../types';
import { MASTER_CARTON_STATUS, CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateDispatchInput } from '../models/schemas/dispatch.schema';
import { logger } from '../utils/logger';

export async function createDispatch(
  input: CreateDispatchInput,
  dispatchedBy: string
): Promise<DispatchRecord[]> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock and validate all master cartons
    const cartonPlaceholders = input.master_carton_ids.map((_, i) => `$${i + 1}`).join(', ');
    const cartonsResult = await client.query(
      `SELECT * FROM master_cartons WHERE id IN (${cartonPlaceholders}) FOR UPDATE`,
      input.master_carton_ids
    );

    if (cartonsResult.rows.length !== input.master_carton_ids.length) {
      const foundIds = new Set(cartonsResult.rows.map((r: { id: string }) => r.id));
      const missing = input.master_carton_ids.filter((id) => !foundIds.has(id));
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

    for (const cartonId of input.master_carton_ids) {
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
        total_cartons: input.master_carton_ids.length,
      },
    });

    logger.info(`Dispatch created: ${input.master_carton_ids.length} cartons to ${destination}`);
    return dispatchRecords;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getDispatchById(id: string): Promise<DispatchRecord> {
  const result = await query(
    `SELECT dr.*, mc.carton_barcode, mc.child_count
     FROM dispatch_records dr
     JOIN master_cartons mc ON mc.id = dr.master_carton_id
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
    conditions.push(`(dr.destination ILIKE $${paramIndex} OR dr.lr_number ILIKE $${paramIndex} OR dr.vehicle_number ILIKE $${paramIndex} OR mc.carton_barcode ILIKE $${paramIndex} OR c.firm_name ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM dispatch_records dr
     JOIN master_cartons mc ON mc.id = dr.master_carton_id
     LEFT JOIN customers c ON c.id = dr.customer_id
     ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT dr.*, mc.carton_barcode, c.firm_name AS customer_firm_name
     FROM dispatch_records dr
     JOIN master_cartons mc ON mc.id = dr.master_carton_id
     LEFT JOIN customers c ON c.id = dr.customer_id
     ${whereClause}
     ORDER BY dr.dispatch_date DESC, dr.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}
