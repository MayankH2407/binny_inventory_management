import { v4 as uuidv4 } from 'uuid';
import { query, getClient } from '../config/database';
import { MasterCarton, CartonChildMapping } from '../types';
import { MASTER_CARTON_STATUS, CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { generateMasterCartonQR } from '../utils/qrGenerator';
import { createAuditLog } from './auditLog.service';
import { CreateMasterCartonInput } from '../models/schemas/masterCarton.schema';
import { logger } from '../utils/logger';

export async function createMasterCarton(
  input: CreateMasterCartonInput,
  createdBy: string
): Promise<MasterCarton & { qr_data_uri: string }> {
  const id = uuidv4();
  const cartonBarcode = `BINNY-MC-${id}`;
  const qrDataUri = await generateMasterCartonQR(id);
  const barcodes = input.child_box_barcodes || [];

  if (barcodes.length > 0) {
    // Use transaction when auto-packing child boxes
    const client = await getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO master_cartons (id, carton_barcode, status, max_capacity, child_count, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, cartonBarcode, MASTER_CARTON_STATUS.CREATED, input.max_capacity || 50, 0, createdBy]
      );

      // Log carton created transaction
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [TRANSACTION_TYPES.CARTON_CREATED, id, createdBy, `Master carton created with barcode ${cartonBarcode}`]
      );

      let packedCount = 0;
      for (const barcode of barcodes) {
        // Look up child box by barcode
        const cbResult = await client.query(
          'SELECT * FROM child_boxes WHERE barcode = $1 FOR UPDATE',
          [barcode]
        );
        if (cbResult.rows.length === 0) {
          throw new NotFoundError(`Child box with barcode ${barcode} not found`);
        }
        const childBox = cbResult.rows[0];

        if (childBox.status !== CHILD_BOX_STATUS.FREE) {
          throw new BadRequestError(
            `Child box ${barcode} is currently ${childBox.status} and cannot be packed. Only FREE boxes can be packed.`
          );
        }

        if (packedCount >= (input.max_capacity || 50)) {
          throw new BadRequestError(
            `Master carton is full (${packedCount}/${input.max_capacity || 50})`
          );
        }

        // Update child box status to PACKED
        await client.query(
          `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
          [CHILD_BOX_STATUS.PACKED, childBox.id]
        );

        // Create carton_child_mapping
        await client.query(
          `INSERT INTO carton_child_mapping (master_carton_id, child_box_id, packed_by)
           VALUES ($1, $2, $3)`,
          [id, childBox.id, createdBy]
        );

        // Log CHILD_PACKED transaction
        await client.query(
          `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            TRANSACTION_TYPES.CHILD_PACKED, childBox.id, id, createdBy,
            `Packed child box ${barcode} into carton ${cartonBarcode}`,
          ]
        );

        packedCount++;
      }

      // Update child_count and status if any boxes were packed
      const newStatus = packedCount > 0 ? MASTER_CARTON_STATUS.ACTIVE : MASTER_CARTON_STATUS.CREATED;
      const updatedResult = await client.query(
        `UPDATE master_cartons SET child_count = $1, status = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [packedCount, newStatus, id]
      );

      await client.query('COMMIT');

      await createAuditLog({
        userId: createdBy,
        action: 'CREATE_MASTER_CARTON',
        entityType: 'master_carton',
        entityId: id,
        newValues: { carton_barcode: cartonBarcode, max_capacity: input.max_capacity, child_box_barcodes: barcodes },
      });

      logger.info(`Master carton created: ${cartonBarcode} with ${packedCount} child boxes`);
      return { ...updatedResult.rows[0], qr_data_uri: qrDataUri };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // No barcodes provided - simple creation without transaction
  const result = await query(
    `INSERT INTO master_cartons (id, carton_barcode, status, max_capacity, child_count, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      id, cartonBarcode, MASTER_CARTON_STATUS.CREATED,
      input.max_capacity || 50, 0, createdBy,
    ]
  );

  // Log carton created transaction
  await query(
    `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes)
     VALUES ($1, $2, $3, $4)`,
    [TRANSACTION_TYPES.CARTON_CREATED, id, createdBy, `Master carton created with barcode ${cartonBarcode}`]
  );

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_MASTER_CARTON',
    entityType: 'master_carton',
    entityId: id,
    newValues: { carton_barcode: cartonBarcode, max_capacity: input.max_capacity },
  });

  logger.info(`Master carton created: ${cartonBarcode}`);
  return { ...result.rows[0], qr_data_uri: qrDataUri };
}

export async function getMasterCartonById(id: string): Promise<MasterCarton & { child_boxes: CartonChildMapping[] }> {
  const result = await query('SELECT * FROM master_cartons WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Master carton not found');
  }
  const childBoxes = await getCartonChildren(id);
  return { ...result.rows[0], child_boxes: childBoxes };
}

export async function getMasterCartons(
  filters: { status?: string; search?: string },
  page: number = 1,
  limit: number = 25
): Promise<{ data: MasterCarton[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`mc.status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters.search) {
    conditions.push(`mc.carton_barcode ILIKE $${paramIndex}`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM master_cartons mc ${whereClause}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT mc.*,
       ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary
     FROM master_cartons mc
     LEFT JOIN LATERAL (
       SELECT
         string_agg(DISTINCT p.article_name, ', ') as article_summary,
         string_agg(DISTINCT p.colour, ', ') as colour_summary,
         string_agg(DISTINCT p.size, ', ') as size_summary,
         MIN(p.mrp) as mrp_summary
       FROM carton_child_mapping ccm
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       JOIN products p ON p.id = cb.product_id
       WHERE ccm.master_carton_id = mc.id AND ccm.is_active = true
     ) ps ON true
     ${whereClause}
     ORDER BY mc.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

export async function getCartonChildren(cartonId: string): Promise<CartonChildMapping[]> {
  const result = await query(
    `SELECT ccm.*, cb.barcode, cb.status, cb.quantity,
            p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp
     FROM carton_child_mapping ccm
     JOIN child_boxes cb ON cb.id = ccm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE ccm.master_carton_id = $1 AND ccm.is_active = true
     ORDER BY ccm.packed_at DESC`,
    [cartonId]
  );
  return result.rows;
}

export async function packChildBox(
  childBoxId: string,
  masterCartonId: string,
  packedBy: string
): Promise<{ carton: MasterCarton; mapping: CartonChildMapping }> {
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

    if (childBox.status !== CHILD_BOX_STATUS.FREE) {
      throw new BadRequestError(
        `Child box is currently ${childBox.status} and cannot be packed. Only FREE boxes can be packed.`
      );
    }

    // Lock and fetch master carton
    const mcResult = await client.query(
      'SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE',
      [masterCartonId]
    );
    if (mcResult.rows.length === 0) {
      throw new NotFoundError('Master carton not found');
    }
    const carton = mcResult.rows[0];

    if (carton.status === MASTER_CARTON_STATUS.CLOSED || carton.status === MASTER_CARTON_STATUS.DISPATCHED) {
      throw new BadRequestError(
        `Master carton is ${carton.status} and cannot accept new child boxes`
      );
    }

    if (carton.child_count >= carton.max_capacity) {
      throw new BadRequestError(
        `Master carton is full (${carton.child_count}/${carton.max_capacity})`
      );
    }

    // Update child box status
    await client.query(
      `UPDATE child_boxes SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [CHILD_BOX_STATUS.PACKED, childBoxId]
    );

    // Create mapping in carton_child_mapping
    const mappingResult = await client.query(
      `INSERT INTO carton_child_mapping (master_carton_id, child_box_id, packed_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [masterCartonId, childBoxId, packedBy]
    );

    // Update master carton child_count and status
    const newChildCount = carton.child_count + 1;
    const newStatus = carton.status === MASTER_CARTON_STATUS.CREATED
      ? MASTER_CARTON_STATUS.ACTIVE
      : carton.status;

    const updatedCartonResult = await client.query(
      `UPDATE master_cartons
       SET child_count = $1, status = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [newChildCount, newStatus, masterCartonId]
    );

    // Log transaction
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TRANSACTION_TYPES.CHILD_PACKED, childBoxId, masterCartonId, packedBy,
        `Packed child box ${childBox.barcode} into carton ${carton.carton_barcode}`,
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: packedBy,
      action: 'PACK_CHILD_BOX',
      entityType: 'carton_child_mapping',
      entityId: mappingResult.rows[0].id,
      newValues: { child_box_id: childBoxId, master_carton_id: masterCartonId },
    });

    logger.info(`Packed child box ${childBox.barcode} into carton ${carton.carton_barcode}`);

    return {
      carton: updatedCartonResult.rows[0],
      mapping: mappingResult.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function unpackChildBox(
  childBoxId: string,
  masterCartonId: string,
  unpackedBy: string
): Promise<MasterCarton> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock and fetch the mapping
    const mappingResult = await client.query(
      `SELECT * FROM carton_child_mapping
       WHERE child_box_id = $1 AND master_carton_id = $2 AND is_active = true
       FOR UPDATE`,
      [childBoxId, masterCartonId]
    );
    if (mappingResult.rows.length === 0) {
      throw new NotFoundError('Active mapping not found for this child box and carton');
    }

    const cbResult = await client.query(
      'SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE',
      [childBoxId]
    );
    const childBox = cbResult.rows[0];

    const mcResult = await client.query(
      'SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE',
      [masterCartonId]
    );
    const carton = mcResult.rows[0];

    if (carton.status === MASTER_CARTON_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot unpack from a dispatched carton');
    }

    // Deactivate mapping and set unpacked_at, unpacked_by
    await client.query(
      `UPDATE carton_child_mapping SET is_active = false, unpacked_at = NOW(), unpacked_by = $1
       WHERE id = $2`,
      [unpackedBy, mappingResult.rows[0].id]
    );

    // Set child box back to FREE
    await client.query(
      `UPDATE child_boxes SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [CHILD_BOX_STATUS.FREE, childBoxId]
    );

    // Update master carton child_count and status
    const newChildCount = Math.max(0, carton.child_count - 1);
    const newStatus = newChildCount === 0 ? MASTER_CARTON_STATUS.CREATED : carton.status;

    const updatedCartonResult = await client.query(
      `UPDATE master_cartons
       SET child_count = $1, status = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [newChildCount, newStatus, masterCartonId]
    );

    // Log transaction
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TRANSACTION_TYPES.CHILD_UNPACKED, childBoxId, masterCartonId, unpackedBy,
        `Unpacked child box ${childBox.barcode} from carton ${carton.carton_barcode}`,
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: unpackedBy,
      action: 'UNPACK_CHILD_BOX',
      entityType: 'carton_child_mapping',
      newValues: { child_box_id: childBoxId, master_carton_id: masterCartonId },
    });

    logger.info(`Unpacked child box ${childBox.barcode} from carton ${carton.carton_barcode}`);
    return updatedCartonResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function repackChildBox(
  childBoxId: string,
  sourceCartonId: string,
  destinationCartonId: string,
  repackedBy: string
): Promise<{ sourceCarton: MasterCarton; destinationCarton: MasterCarton }> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Validate child box is in source carton
    const mappingResult = await client.query(
      `SELECT * FROM carton_child_mapping
       WHERE child_box_id = $1 AND master_carton_id = $2 AND is_active = true
       FOR UPDATE`,
      [childBoxId, sourceCartonId]
    );
    if (mappingResult.rows.length === 0) {
      throw new NotFoundError('Child box is not in the source carton');
    }

    const cbResult = await client.query(
      'SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE',
      [childBoxId]
    );
    const childBox = cbResult.rows[0];

    // Lock both cartons
    const srcResult = await client.query(
      'SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE',
      [sourceCartonId]
    );
    const sourceCarton = srcResult.rows[0];

    const destResult = await client.query(
      'SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE',
      [destinationCartonId]
    );
    if (destResult.rows.length === 0) {
      throw new NotFoundError('Destination carton not found');
    }
    const destCarton = destResult.rows[0];

    if (destCarton.status === MASTER_CARTON_STATUS.CLOSED || destCarton.status === MASTER_CARTON_STATUS.DISPATCHED) {
      throw new BadRequestError(`Destination carton is ${destCarton.status} and cannot accept child boxes`);
    }
    if (destCarton.child_count >= destCarton.max_capacity) {
      throw new BadRequestError(`Destination carton is full (${destCarton.child_count}/${destCarton.max_capacity})`);
    }

    // Deactivate old mapping
    await client.query(
      `UPDATE carton_child_mapping SET is_active = false, unpacked_at = NOW(), unpacked_by = $1 WHERE id = $2`,
      [repackedBy, mappingResult.rows[0].id]
    );

    // Create new mapping
    await client.query(
      `INSERT INTO carton_child_mapping (master_carton_id, child_box_id, packed_by)
       VALUES ($1, $2, $3)`,
      [destinationCartonId, childBoxId, repackedBy]
    );

    // Update source carton
    const srcNewCount = Math.max(0, sourceCarton.child_count - 1);
    const srcNewStatus = srcNewCount === 0 ? MASTER_CARTON_STATUS.CREATED : sourceCarton.status;

    const updatedSrcResult = await client.query(
      `UPDATE master_cartons SET child_count = $1, status = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [srcNewCount, srcNewStatus, sourceCartonId]
    );

    // Update destination carton
    const destNewCount = destCarton.child_count + 1;
    const destNewStatus = destCarton.status === MASTER_CARTON_STATUS.CREATED
      ? MASTER_CARTON_STATUS.ACTIVE
      : destCarton.status;

    const updatedDestResult = await client.query(
      `UPDATE master_cartons SET child_count = $1, status = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [destNewCount, destNewStatus, destinationCartonId]
    );

    // Log transaction using metadata for source/destination info
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        TRANSACTION_TYPES.CHILD_REPACKED, childBoxId, destinationCartonId, repackedBy,
        `Repacked child box ${childBox.barcode} from ${sourceCarton.carton_barcode} to ${destCarton.carton_barcode}`,
        JSON.stringify({ source_carton_id: sourceCartonId, destination_carton_id: destinationCartonId }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: repackedBy,
      action: 'REPACK_CHILD_BOX',
      entityType: 'carton_child_mapping',
      newValues: { child_box_id: childBoxId, source_carton_id: sourceCartonId, destination_carton_id: destinationCartonId },
    });

    logger.info(`Repacked child box ${childBox.barcode} from ${sourceCarton.carton_barcode} to ${destCarton.carton_barcode}`);

    return {
      sourceCarton: updatedSrcResult.rows[0],
      destinationCarton: updatedDestResult.rows[0],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeMasterCarton(
  cartonId: string,
  closedBy: string
): Promise<MasterCarton> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const mcResult = await client.query(
      'SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE',
      [cartonId]
    );
    if (mcResult.rows.length === 0) {
      throw new NotFoundError('Master carton not found');
    }

    const carton = mcResult.rows[0];

    if (carton.status === MASTER_CARTON_STATUS.CLOSED) {
      throw new BadRequestError('Master carton is already closed');
    }
    if (carton.status === MASTER_CARTON_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot close a dispatched carton');
    }
    if (carton.child_count === 0) {
      throw new BadRequestError('Cannot close an empty carton');
    }

    const result = await client.query(
      `UPDATE master_cartons SET status = $1, closed_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [MASTER_CARTON_STATUS.CLOSED, cartonId]
    );

    // Log carton closed transaction
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes)
       VALUES ($1, $2, $3, $4)`,
      [TRANSACTION_TYPES.CARTON_CLOSED, cartonId, closedBy, `Master carton ${carton.carton_barcode} closed`]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: closedBy,
      action: 'CLOSE_MASTER_CARTON',
      entityType: 'master_carton',
      entityId: cartonId,
    });

    logger.info(`Master carton closed: ${carton.carton_barcode}`);
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getMasterCartonByBarcode(
  barcode: string
): Promise<MasterCarton & { child_boxes: CartonChildMapping[] }> {
  const result = await query('SELECT * FROM master_cartons WHERE carton_barcode = $1', [barcode]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Master carton not found');
  }
  const carton = result.rows[0];
  const childBoxes = await getCartonChildren(carton.id);
  return { ...carton, child_boxes: childBoxes };
}

export async function fullUnpackMasterCarton(
  cartonId: string,
  unpackedBy: string
): Promise<MasterCarton> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock and fetch master carton
    const mcResult = await client.query(
      'SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE',
      [cartonId]
    );
    if (mcResult.rows.length === 0) {
      throw new NotFoundError('Master carton not found');
    }
    const carton = mcResult.rows[0];

    if (carton.status === MASTER_CARTON_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot unpack a dispatched carton');
    }
    if (carton.status === MASTER_CARTON_STATUS.CREATED) {
      throw new BadRequestError('Cannot unpack an empty carton');
    }

    // Get all active mappings
    const mappingsResult = await client.query(
      `SELECT ccm.*, cb.barcode as child_barcode
       FROM carton_child_mapping ccm
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       WHERE ccm.master_carton_id = $1 AND ccm.is_active = true`,
      [cartonId]
    );

    // For each active mapping: deactivate it, set child box back to FREE, log transaction
    for (const mapping of mappingsResult.rows) {
      // Deactivate mapping
      await client.query(
        `UPDATE carton_child_mapping SET is_active = false, unpacked_at = NOW(), unpacked_by = $1
         WHERE id = $2`,
        [unpackedBy, mapping.id]
      );

      // Set child box status back to FREE
      await client.query(
        `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
        [CHILD_BOX_STATUS.FREE, mapping.child_box_id]
      );

      // Log CHILD_UNPACKED transaction
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CHILD_UNPACKED, mapping.child_box_id, cartonId, unpackedBy,
          `Full unpack: unpacked child box ${mapping.child_barcode} from carton ${carton.carton_barcode}`,
        ]
      );
    }

    // Reset master carton
    const updatedResult = await client.query(
      `UPDATE master_cartons SET child_count = 0, status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [MASTER_CARTON_STATUS.CREATED, cartonId]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: unpackedBy,
      action: 'FULL_UNPACK_MASTER_CARTON',
      entityType: 'master_carton',
      entityId: cartonId,
      newValues: { unpacked_count: mappingsResult.rows.length },
    });

    logger.info(`Full unpack of master carton ${carton.carton_barcode}: ${mappingsResult.rows.length} child boxes unpacked`);
    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getAssortmentSummary(
  cartonId: string
): Promise<{ article_name: string; colour: string; size: string; mrp: number; count: number }[]> {
  // Verify carton exists
  const cartonResult = await query('SELECT id FROM master_cartons WHERE id = $1', [cartonId]);
  if (cartonResult.rows.length === 0) {
    throw new NotFoundError('Master carton not found');
  }

  const result = await query(
    `SELECT p.article_name, p.colour, p.size, p.mrp, COUNT(*)::int as count
     FROM carton_child_mapping ccm
     JOIN child_boxes cb ON cb.id = ccm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE ccm.master_carton_id = $1 AND ccm.is_active = true
     GROUP BY p.article_name, p.colour, p.size, p.mrp
     ORDER BY p.article_name, p.colour, p.size`,
    [cartonId]
  );

  return result.rows;
}
