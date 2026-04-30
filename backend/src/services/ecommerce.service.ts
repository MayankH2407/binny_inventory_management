import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../config/database';
import { ECOMMERCE_STATUS, CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateEcommerceInput, AddBoxToEcommerceInput, RemoveBoxFromEcommerceInput, EcommerceListQuery } from '../models/schemas/ecommerce.schema';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// createEcommerce
// ---------------------------------------------------------------------------
export async function createEcommerce(
  input: CreateEcommerceInput,
  createdBy: string
): Promise<Record<string, unknown> & { qr_barcode: string }> {
  const id = uuidv4();
  const ecommerceBarcode = `BINNY-EC-${id}`;
  const barcodes = input.child_box_barcodes || [];

  if (barcodes.length > 0) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO ecommerce_records
           (id, ecommerce_barcode, name, marketplace, order_reference, listing_sku, mapped_date, notes, status, child_count, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          id, ecommerceBarcode, input.name, input.marketplace ?? null, input.order_reference ?? null,
          input.listing_sku ?? null, input.mapped_date ?? null, input.notes ?? null,
          ECOMMERCE_STATUS.CREATED, 0, createdBy,
        ]
      );

      let mappedCount = 0;
      for (const barcode of barcodes) {
        const cbResult = await client.query(
          'SELECT * FROM child_boxes WHERE barcode = $1 FOR UPDATE',
          [barcode]
        );
        if (cbResult.rows.length === 0) {
          throw new NotFoundError(`Child box with barcode ${barcode} not found`);
        }
        const childBox = cbResult.rows[0];

        if (
          childBox.status !== CHILD_BOX_STATUS.FREE &&
          childBox.status !== CHILD_BOX_STATUS.GENERATED
        ) {
          throw new BadRequestError(
            `Child box ${barcode} is currently ${childBox.status} and cannot be added to an e-commerce record. Only FREE or GENERATED boxes can be added.`
          );
        }

        // Auto-activate GENERATED boxes
        if (childBox.status === CHILD_BOX_STATUS.GENERATED) {
          await client.query(
            `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
             VALUES ($1, $2, $3, $4)`,
            [
              TRANSACTION_TYPES.CHILD_ACTIVATED, childBox.id, createdBy,
              `Child box ${barcode} auto-activated (implicit activation during add to e-commerce record ${ecommerceBarcode})`,
            ]
          );
        }

        // Update child box status to ECOMMERCE
        await client.query(
          `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
          [CHILD_BOX_STATUS.ECOMMERCE, childBox.id]
        );

        // Create ecommerce_box_mapping
        await client.query(
          `INSERT INTO ecommerce_box_mapping (ecommerce_record_id, child_box_id, mapped_by)
           VALUES ($1, $2, $3)`,
          [id, childBox.id, createdBy]
        );

        // Log CHILD_ECOMMERCED transaction
        await client.query(
          `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
           VALUES ($1, $2, $3, $4)`,
          [
            TRANSACTION_TYPES.CHILD_ECOMMERCED, childBox.id, createdBy,
            `Added child box ${barcode} to e-commerce record ${ecommerceBarcode}`,
          ]
        );

        mappedCount++;
      }

      const newStatus = mappedCount > 0 ? ECOMMERCE_STATUS.ACTIVE : ECOMMERCE_STATUS.CREATED;
      const updatedResult = await client.query(
        `UPDATE ecommerce_records SET child_count = $1, status = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [mappedCount, newStatus, id]
      );

      await client.query('COMMIT');

      await createAuditLog({
        userId: createdBy,
        action: 'CREATE_ECOMMERCE',
        entityType: 'ecommerce_record',
        entityId: id,
        newValues: { ecommerce_barcode: ecommerceBarcode, child_box_barcodes: barcodes },
      });

      logger.info(`E-commerce record created: ${ecommerceBarcode} with ${mappedCount} child boxes`);
      return { ...updatedResult.rows[0], qr_barcode: ecommerceBarcode };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // No barcodes — simple creation
  const result = await query(
    `INSERT INTO ecommerce_records
       (id, ecommerce_barcode, name, marketplace, order_reference, listing_sku, mapped_date, notes, status, child_count, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      id, ecommerceBarcode, input.name, input.marketplace ?? null, input.order_reference ?? null,
      input.listing_sku ?? null, input.mapped_date ?? null, input.notes ?? null,
      ECOMMERCE_STATUS.CREATED, 0, createdBy,
    ]
  );

  await query(
    `INSERT INTO inventory_transactions (transaction_type, performed_by, notes)
     VALUES ($1, $2, $3)`,
    [TRANSACTION_TYPES.ECOMMERCE_CREATED, createdBy, `E-commerce record created with barcode ${ecommerceBarcode}`]
  );

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_ECOMMERCE',
    entityType: 'ecommerce_record',
    entityId: id,
    newValues: { ecommerce_barcode: ecommerceBarcode, name: input.name },
  });

  logger.info(`E-commerce record created: ${ecommerceBarcode}`);
  return { ...result.rows[0], qr_barcode: ecommerceBarcode };
}

// ---------------------------------------------------------------------------
// getEcommerceById
// ---------------------------------------------------------------------------
export async function getEcommerceById(id: string): Promise<Record<string, unknown>> {
  const result = await query('SELECT * FROM ecommerce_records WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('E-commerce record not found');
  }
  const children = await getEcommerceChildren(id);
  return { ...result.rows[0], child_boxes: children };
}

// ---------------------------------------------------------------------------
// getEcommerceRecords (paginated list)
// ---------------------------------------------------------------------------
export async function getEcommerceRecords(
  filters: EcommerceListQuery
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const { page = 1, limit = 25, status, search, marketplace } = filters;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`er.status = $${paramIndex++}`);
    values.push(status);
  }
  if (search) {
    conditions.push(
      `(er.ecommerce_barcode ILIKE $${paramIndex} OR er.name ILIKE $${paramIndex} OR er.order_reference ILIKE $${paramIndex})`
    );
    values.push(`%${search}%`);
    paramIndex++;
  }
  if (marketplace) {
    conditions.push(`er.marketplace ILIKE $${paramIndex++}`);
    values.push(`%${marketplace}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM ecommerce_records er ${whereClause}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT er.*,
       u.name as creator_name,
       ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary
     FROM ecommerce_records er
     LEFT JOIN users u ON u.id = er.created_by
     LEFT JOIN LATERAL (
       SELECT
         string_agg(DISTINCT p.article_name, ', ') as article_summary,
         string_agg(DISTINCT p.colour, ', ') as colour_summary,
         string_agg(DISTINCT p.size, ', ') as size_summary,
         MIN(p.mrp) as mrp_summary
       FROM ecommerce_box_mapping ebm
       JOIN child_boxes cb ON cb.id = ebm.child_box_id
       JOIN products p ON p.id = cb.product_id
       WHERE ebm.ecommerce_record_id = er.id AND ebm.is_active = true
     ) ps ON true
     ${whereClause}
     ORDER BY er.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

// ---------------------------------------------------------------------------
// getEcommerceChildren
// ---------------------------------------------------------------------------
export async function getEcommerceChildren(ecommerceId: string): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT ebm.*, cb.barcode, cb.status, cb.quantity,
            p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp
     FROM ecommerce_box_mapping ebm
     JOIN child_boxes cb ON cb.id = ebm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE ebm.ecommerce_record_id = $1 AND ebm.is_active = true
     ORDER BY ebm.mapped_at DESC`,
    [ecommerceId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// addBoxToEcommerce
// ---------------------------------------------------------------------------
export async function addBoxToEcommerce(
  input: AddBoxToEcommerceInput,
  addedBy: string
): Promise<{ record: Record<string, unknown>; mapping: Record<string, unknown> }> {
  const { child_box_id: childBoxId, ecommerce_record_id: ecommerceRecordId } = input;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock and fetch child box
    const cbResult = await client.query(
      'SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE',
      [childBoxId]
    );
    if (cbResult.rows.length === 0) {
      throw new NotFoundError('Child box not found');
    }
    const childBox = cbResult.rows[0];

    if (childBox.status !== CHILD_BOX_STATUS.FREE && childBox.status !== CHILD_BOX_STATUS.GENERATED) {
      throw new BadRequestError(
        `Child box is currently ${childBox.status} and cannot be added to an e-commerce record. Only FREE or GENERATED boxes can be added.`
      );
    }

    // Lock and fetch ecommerce record
    const erResult = await client.query(
      'SELECT * FROM ecommerce_records WHERE id = $1 FOR UPDATE',
      [ecommerceRecordId]
    );
    if (erResult.rows.length === 0) {
      throw new NotFoundError('E-commerce record not found');
    }
    const record = erResult.rows[0];

    if (record.status === ECOMMERCE_STATUS.CLOSED || record.status === ECOMMERCE_STATUS.DISPATCHED) {
      throw new BadRequestError(
        `E-commerce record is ${record.status} and cannot accept new child boxes`
      );
    }

    // Auto-activate GENERATED boxes
    if (childBox.status === CHILD_BOX_STATUS.GENERATED) {
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [
          TRANSACTION_TYPES.CHILD_ACTIVATED, childBoxId, addedBy,
          `Child box ${childBox.barcode} auto-activated (implicit activation during add to e-commerce record ${record.ecommerce_barcode})`,
        ]
      );
    }

    // Update child box status to ECOMMERCE
    await client.query(
      `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
      [CHILD_BOX_STATUS.ECOMMERCE, childBoxId]
    );

    // Create mapping
    const mappingResult = await client.query(
      `INSERT INTO ecommerce_box_mapping (ecommerce_record_id, child_box_id, mapped_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [ecommerceRecordId, childBoxId, addedBy]
    );

    // Update record child_count and status
    const newChildCount = record.child_count + 1;
    const newStatus = record.status === ECOMMERCE_STATUS.CREATED
      ? ECOMMERCE_STATUS.ACTIVE
      : record.status;

    const updatedRecordResult = await client.query(
      `UPDATE ecommerce_records SET child_count = $1, status = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [newChildCount, newStatus, ecommerceRecordId]
    );

    // Log CHILD_ECOMMERCED transaction
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
       VALUES ($1, $2, $3, $4)`,
      [
        TRANSACTION_TYPES.CHILD_ECOMMERCED, childBoxId, addedBy,
        `Added child box ${childBox.barcode} to e-commerce record ${record.ecommerce_barcode}`,
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: addedBy,
      action: 'ADD_BOX_TO_ECOMMERCE',
      entityType: 'ecommerce_record',
      entityId: mappingResult.rows[0].id,
      newValues: { child_box_id: childBoxId, ecommerce_record_id: ecommerceRecordId },
    });

    logger.info(`Added child box ${childBox.barcode} to e-commerce record ${record.ecommerce_barcode}`);

    return {
      record: updatedRecordResult.rows[0],
      mapping: mappingResult.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// removeBoxFromEcommerce
// ---------------------------------------------------------------------------
export async function removeBoxFromEcommerce(
  input: RemoveBoxFromEcommerceInput,
  removedBy: string
): Promise<Record<string, unknown>> {
  const { child_box_id: childBoxId, ecommerce_record_id: ecommerceRecordId } = input;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock and fetch mapping
    const mappingResult = await client.query(
      `SELECT * FROM ecommerce_box_mapping
       WHERE child_box_id = $1 AND ecommerce_record_id = $2 AND is_active = true
       FOR UPDATE`,
      [childBoxId, ecommerceRecordId]
    );
    if (mappingResult.rows.length === 0) {
      throw new NotFoundError('Active mapping not found for this child box and e-commerce record');
    }

    const cbResult = await client.query(
      'SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE',
      [childBoxId]
    );
    const childBox = cbResult.rows[0];

    const erResult = await client.query(
      'SELECT * FROM ecommerce_records WHERE id = $1 FOR UPDATE',
      [ecommerceRecordId]
    );
    const record = erResult.rows[0];

    if (record.status === ECOMMERCE_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot remove box from a dispatched e-commerce record');
    }

    // Deactivate mapping
    await client.query(
      `UPDATE ecommerce_box_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1
       WHERE id = $2`,
      [removedBy, mappingResult.rows[0].id]
    );

    // Set child box back to FREE
    await client.query(
      `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
      [CHILD_BOX_STATUS.FREE, childBoxId]
    );

    // Update record child_count and status
    const newChildCount = Math.max(0, record.child_count - 1);
    let newStatus = record.status;
    if (newChildCount === 0 && record.status === ECOMMERCE_STATUS.ACTIVE) {
      newStatus = ECOMMERCE_STATUS.CREATED;
      // Log ECOMMERCE_REOPENED
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, performed_by, notes)
         VALUES ($1, $2, $3)`,
        [
          TRANSACTION_TYPES.ECOMMERCE_REOPENED, removedBy,
          `E-commerce record ${record.ecommerce_barcode} reverted to CREATED (all boxes removed)`,
        ]
      );
    }

    const updatedRecordResult = await client.query(
      `UPDATE ecommerce_records SET child_count = $1, status = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [newChildCount, newStatus, ecommerceRecordId]
    );

    // Log CHILD_UNECOMMERCED transaction
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
       VALUES ($1, $2, $3, $4)`,
      [
        TRANSACTION_TYPES.CHILD_UNECOMMERCED, childBoxId, removedBy,
        `Removed child box ${childBox.barcode} from e-commerce record ${record.ecommerce_barcode}`,
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: removedBy,
      action: 'REMOVE_BOX_FROM_ECOMMERCE',
      entityType: 'ecommerce_record',
      newValues: { child_box_id: childBoxId, ecommerce_record_id: ecommerceRecordId },
    });

    logger.info(`Removed child box ${childBox.barcode} from e-commerce record ${record.ecommerce_barcode}`);
    return updatedRecordResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// closeEcommerce
// ---------------------------------------------------------------------------
export async function closeEcommerce(
  id: string,
  closedBy: string
): Promise<Record<string, unknown>> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const erResult = await client.query(
      'SELECT * FROM ecommerce_records WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (erResult.rows.length === 0) {
      throw new NotFoundError('E-commerce record not found');
    }
    const record = erResult.rows[0];

    if (record.status === ECOMMERCE_STATUS.CLOSED) {
      throw new BadRequestError('E-commerce record is already closed');
    }
    if (record.status === ECOMMERCE_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot close a dispatched e-commerce record');
    }
    if (record.child_count === 0) {
      throw new BadRequestError('Cannot close an empty e-commerce record');
    }

    const result = await client.query(
      `UPDATE ecommerce_records SET status = $1, closed_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [ECOMMERCE_STATUS.CLOSED, id]
    );

    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, performed_by, notes)
       VALUES ($1, $2, $3)`,
      [TRANSACTION_TYPES.ECOMMERCE_CLOSED, closedBy, `E-commerce record ${record.ecommerce_barcode} closed`]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: closedBy,
      action: 'CLOSE_ECOMMERCE',
      entityType: 'ecommerce_record',
      entityId: id,
    });

    logger.info(`E-commerce record closed: ${record.ecommerce_barcode}`);
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getEcommerceByBarcode
// ---------------------------------------------------------------------------
export async function getEcommerceByBarcode(
  barcode: string
): Promise<Record<string, unknown>> {
  const result = await query('SELECT * FROM ecommerce_records WHERE ecommerce_barcode = $1', [barcode]);
  if (result.rows.length === 0) {
    throw new NotFoundError('E-commerce record not found');
  }
  const record = result.rows[0];
  const children = await getEcommerceChildren(record.id as string);
  return { ...record, child_boxes: children };
}

// ---------------------------------------------------------------------------
// fullUnpackEcommerce
// ---------------------------------------------------------------------------
export async function fullUnpackEcommerce(
  id: string,
  performedBy: string
): Promise<Record<string, unknown>> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const erResult = await client.query(
      'SELECT * FROM ecommerce_records WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (erResult.rows.length === 0) {
      throw new NotFoundError('E-commerce record not found');
    }
    const record = erResult.rows[0];

    if (record.status === ECOMMERCE_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot unpack a dispatched e-commerce record');
    }
    if (record.status === ECOMMERCE_STATUS.CREATED) {
      throw new BadRequestError('Cannot unpack an empty e-commerce record');
    }

    // Get all active mappings
    const mappingsResult = await client.query(
      `SELECT ebm.*, cb.barcode as child_barcode
       FROM ecommerce_box_mapping ebm
       JOIN child_boxes cb ON cb.id = ebm.child_box_id
       WHERE ebm.ecommerce_record_id = $1 AND ebm.is_active = true`,
      [id]
    );

    for (const mapping of mappingsResult.rows) {
      // Deactivate mapping
      await client.query(
        `UPDATE ecommerce_box_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1
         WHERE id = $2`,
        [performedBy, mapping.id]
      );

      // Set child box back to FREE
      await client.query(
        `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
        [CHILD_BOX_STATUS.FREE, mapping.child_box_id]
      );

      // Log CHILD_UNECOMMERCED transaction
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [
          TRANSACTION_TYPES.CHILD_UNECOMMERCED, mapping.child_box_id, performedBy,
          `Full unpack: removed child box ${mapping.child_barcode} from e-commerce record ${record.ecommerce_barcode}`,
        ]
      );
    }

    // Reset ecommerce record
    const updatedResult = await client.query(
      `UPDATE ecommerce_records SET child_count = 0, status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [ECOMMERCE_STATUS.CREATED, id]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: performedBy,
      action: 'FULL_UNPACK_ECOMMERCE',
      entityType: 'ecommerce_record',
      entityId: id,
      newValues: { unpacked_count: mappingsResult.rows.length },
    });

    logger.info(`Full unpack of e-commerce record ${record.ecommerce_barcode}: ${mappingsResult.rows.length} child boxes removed`);
    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getEcommerceAssortment
// ---------------------------------------------------------------------------
export async function getEcommerceAssortment(
  ecommerceId: string
): Promise<{ article_name: string; colour: string; size: string; mrp: number; count: number }[]> {
  const erResult = await query('SELECT id FROM ecommerce_records WHERE id = $1', [ecommerceId]);
  if (erResult.rows.length === 0) {
    throw new NotFoundError('E-commerce record not found');
  }

  const result = await query(
    `SELECT p.article_name, p.colour, p.size, p.mrp, COUNT(*)::int as count
     FROM ecommerce_box_mapping ebm
     JOIN child_boxes cb ON cb.id = ebm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE ebm.ecommerce_record_id = $1 AND ebm.is_active = true
     GROUP BY p.article_name, p.colour, p.size, p.mrp
     ORDER BY p.article_name, p.colour, p.size`,
    [ecommerceId]
  );

  return result.rows;
}
