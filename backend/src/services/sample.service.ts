import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
import { query, getClient } from '../config/database';
import { SAMPLE_STATUS, CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { generateUniqueBarcode } from '../utils/barcodeGenerator';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateSampleInput, AddBoxToSampleInput, RemoveBoxFromSampleInput } from '../models/schemas/sample.schema';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Types (inline — no dedicated interface file needed yet)
// ---------------------------------------------------------------------------
export interface SampleRecord {
  id: string;
  sample_barcode: string;
  name: string;
  customer_id: string | null;
  recipient_name: string | null;
  purpose: string | null;
  sample_date: string | null;
  notes: string | null;
  status: string;
  child_count: number;
  closed_at: Date | null;
  dispatched_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SampleBoxMapping {
  id: string;
  sample_record_id: string;
  child_box_id: string;
  is_active: boolean;
  mapped_at: Date;
  unmapped_at: Date | null;
  mapped_by: string | null;
  unmapped_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Foot-split helpers — a box (pair) may have its LEFT and RIGHT feet allocated to
// different samples independently. We track allocation via active sample_box_mapping
// rows (one per foot). The box-level child_boxes.status stays SAMPLE while ANY foot is
// allocated, which keeps packing/e-commerce/dispatch (all of which require FREE/GENERATED)
// correctly blocked without any change to those modules.
// ---------------------------------------------------------------------------

type Foot = 'LEFT' | 'RIGHT' | 'PAIR';

// Feet of a box currently held by ACTIVE sample mappings (e.g. ['LEFT'] or ['LEFT','RIGHT']).
async function getActiveSampleFeet(client: PoolClient, childBoxId: string): Promise<string[]> {
  const r = await client.query(
    `SELECT foot FROM sample_box_mapping WHERE child_box_id = $1 AND is_active = true`,
    [childBoxId]
  );
  return r.rows.map((row: { foot: string }) => row.foot);
}

// Throws BadRequest/—unless the requested foot of this box is free to be sampled.
function assertFootAvailable(
  barcode: string,
  status: string,
  activeFeet: string[],
  requestedFoot: Foot
): void {
  // Consumed by a non-sample flow — the whole box is unavailable.
  if (
    status === CHILD_BOX_STATUS.PACKED ||
    status === CHILD_BOX_STATUS.ECOMMERCE ||
    status === CHILD_BOX_STATUS.DISPATCHED
  ) {
    throw new BadRequestError(
      `Child box ${barcode} is currently ${status} and cannot be added to a sample. Only FREE or GENERATED boxes (or a box with a free foot) can be sampled.`
    );
  }
  if (activeFeet.includes('PAIR')) {
    throw new BadRequestError(`Child box ${barcode} is already fully in a sample (as a pair).`);
  }
  if (requestedFoot === 'PAIR') {
    if (activeFeet.length > 0) {
      throw new BadRequestError(
        `Child box ${barcode} already has its ${activeFeet.join('/').toLowerCase()} foot in a sample; cannot add the whole pair.`
      );
    }
  } else if (activeFeet.includes(requestedFoot)) {
    throw new BadRequestError(
      `The ${requestedFoot.toLowerCase()} foot of child box ${barcode} is already in a sample.`
    );
  }
}

// ---------------------------------------------------------------------------
// createSample
// ---------------------------------------------------------------------------
export async function createSample(
  input: CreateSampleInput,
  createdBy: string
): Promise<SampleRecord> {
  const id = uuidv4();
  const sampleBarcode = await generateUniqueBarcode('SR');
  const barcodes = input.child_box_barcodes || [];

  // Per-barcode foot, normalized to uppercase keys to match the uppercased barcodes. Missing → PAIR.
  const footMap: Record<string, string> = {};
  if (input.box_feet) {
    for (const [bc, foot] of Object.entries(input.box_feet)) {
      footMap[bc.trim().toUpperCase()] = foot;
    }
  }

  if (barcodes.length > 0) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO sample_records (id, sample_barcode, name, customer_id, recipient_name, purpose, sample_date, notes, status, child_count, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id, sampleBarcode, input.name, input.customer_id ?? null,
          input.recipient_name ?? null, input.purpose ?? null,
          input.sample_date ?? null, input.notes ?? null,
          SAMPLE_STATUS.CREATED, 0, createdBy,
        ]
      );

      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          TRANSACTION_TYPES.SAMPLE_CREATED, createdBy,
          `Sample record created with barcode ${sampleBarcode}`,
          JSON.stringify({ sample_record_id: id }),
        ]
      );

      let mappedCount = 0;
      for (const barcode of barcodes) {
        const cbResult = await client.query(
          'SELECT * FROM child_boxes WHERE barcode = UPPER($1) FOR UPDATE',
          [barcode]
        );
        if (cbResult.rows.length === 0) {
          throw new NotFoundError(`Child box with barcode ${barcode} not found`);
        }
        const childBox = cbResult.rows[0];
        const requestedFoot = (footMap[barcode] ?? 'PAIR') as Foot;

        // Foot-aware availability: a SAMPLE box is still addable for its OTHER free foot.
        const activeFeet = await getActiveSampleFeet(client, childBox.id);
        assertFootAvailable(barcode, childBox.status, activeFeet, requestedFoot);

        if (childBox.status === CHILD_BOX_STATUS.GENERATED) {
          await client.query(
            `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
             VALUES ($1, $2, $3, $4)`,
            [
              TRANSACTION_TYPES.CHILD_ACTIVATED, childBox.id, createdBy,
              `Child box ${barcode} auto-activated (implicit activation during add to sample ${sampleBarcode})`,
            ]
          );
        }

        await client.query(
          `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
          [CHILD_BOX_STATUS.SAMPLE, childBox.id]
        );

        await client.query(
          `INSERT INTO sample_box_mapping (sample_record_id, child_box_id, mapped_by, foot)
           VALUES ($1, $2, $3, $4)`,
          [id, childBox.id, createdBy, requestedFoot]
        );

        await client.query(
          `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            TRANSACTION_TYPES.CHILD_SAMPLED, childBox.id, createdBy,
            `Added child box ${barcode} to sample ${sampleBarcode}`,
            JSON.stringify({ sample_record_id: id }),
          ]
        );

        mappedCount++;
      }

      const newStatus = mappedCount > 0 ? SAMPLE_STATUS.ACTIVE : SAMPLE_STATUS.CREATED;
      const updatedResult = await client.query(
        `UPDATE sample_records SET child_count = $1, status = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [mappedCount, newStatus, id]
      );

      await client.query('COMMIT');

      await createAuditLog({
        userId: createdBy,
        action: 'CREATE_SAMPLE',
        entityType: 'sample_record',
        entityId: id,
        newValues: { sample_barcode: sampleBarcode, name: input.name, child_box_barcodes: barcodes },
      });

      logger.info(`Sample record created: ${sampleBarcode} with ${mappedCount} child boxes`);
      return updatedResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // No barcodes — simple creation without transaction
  const result = await query(
    `INSERT INTO sample_records (id, sample_barcode, name, customer_id, recipient_name, purpose, sample_date, notes, status, child_count, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      id, sampleBarcode, input.name, input.customer_id ?? null,
      input.recipient_name ?? null, input.purpose ?? null,
      input.sample_date ?? null, input.notes ?? null,
      SAMPLE_STATUS.CREATED, 0, createdBy,
    ]
  );

  await query(
    `INSERT INTO inventory_transactions (transaction_type, performed_by, notes, metadata)
     VALUES ($1, $2, $3, $4)`,
    [
      TRANSACTION_TYPES.SAMPLE_CREATED, createdBy,
      `Sample record created with barcode ${sampleBarcode}`,
      JSON.stringify({ sample_record_id: id }),
    ]
  );

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_SAMPLE',
    entityType: 'sample_record',
    entityId: id,
    newValues: { sample_barcode: sampleBarcode, name: input.name },
  });

  logger.info(`Sample record created: ${sampleBarcode}`);
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// getSampleById
// ---------------------------------------------------------------------------
export async function getSampleById(
  id: string
): Promise<SampleRecord & { child_boxes: SampleBoxMapping[] }> {
  const result = await query('SELECT * FROM sample_records WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Sample record not found');
  }
  const childBoxes = await getSampleChildren(id);
  return { ...result.rows[0], child_boxes: childBoxes };
}

// ---------------------------------------------------------------------------
// getSamples
// ---------------------------------------------------------------------------
export async function getSamples(
  filters: { status?: string; search?: string; customer_id?: string },
  page: number = 1,
  limit: number = 25
): Promise<{ data: SampleRecord[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`sr.status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters.search) {
    conditions.push(`(sr.sample_barcode ILIKE $${paramIndex} OR sr.name ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }
  if (filters.customer_id) {
    conditions.push(`sr.customer_id = $${paramIndex++}`);
    values.push(filters.customer_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM sample_records sr ${whereClause}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT sr.*,
       u.name AS creator_name,
       c.firm_name AS customer_name,
       ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary
     FROM sample_records sr
     LEFT JOIN users u ON u.id = sr.created_by
     LEFT JOIN customers c ON c.id = sr.customer_id
     LEFT JOIN LATERAL (
       SELECT
         string_agg(DISTINCT p.article_name, ', ') AS article_summary,
         string_agg(DISTINCT p.colour, ', ') AS colour_summary,
         string_agg(DISTINCT p.size, ', ') AS size_summary,
         MIN(p.mrp) AS mrp_summary
       FROM sample_box_mapping sbm
       JOIN child_boxes cb ON cb.id = sbm.child_box_id
       JOIN products p ON p.id = cb.product_id
       WHERE sbm.sample_record_id = sr.id AND sbm.is_active = true
     ) ps ON true
     ${whereClause}
     ORDER BY sr.created_at DESC, sr.id
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

// ---------------------------------------------------------------------------
// getSampleSummary — aggregate status counts + total boxes for the stat cards
// on the samples list page.
// ---------------------------------------------------------------------------
export interface SampleSummary {
  total: number;
  created: number;
  active: number;
  closed: number;
  dispatched: number;
  totalBoxes: number;
}

export async function getSampleSummary(): Promise<SampleSummary> {
  const result = await query(`
    SELECT
      COUNT(*)::int                                        AS total,
      COUNT(*) FILTER (WHERE status = 'CREATED')::int      AS created,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int       AS active,
      COUNT(*) FILTER (WHERE status = 'CLOSED')::int       AS closed,
      COUNT(*) FILTER (WHERE status = 'DISPATCHED')::int   AS dispatched,
      COALESCE(SUM(child_count), 0)::int                   AS total_boxes
    FROM sample_records
  `);
  const row = result.rows[0];
  return {
    total:      parseInt(row.total, 10),
    created:    parseInt(row.created, 10),
    active:     parseInt(row.active, 10),
    closed:     parseInt(row.closed, 10),
    dispatched: parseInt(row.dispatched, 10),
    totalBoxes: parseInt(row.total_boxes, 10),
  };
}

// ---------------------------------------------------------------------------
// getSampleChildren
// ---------------------------------------------------------------------------
export async function getSampleChildren(sampleId: string): Promise<SampleBoxMapping[]> {
  const result = await query(
    `SELECT sbm.*, cb.barcode, cb.status, cb.quantity,
            p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp
     FROM sample_box_mapping sbm
     JOIN child_boxes cb ON cb.id = sbm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE sbm.sample_record_id = $1 AND sbm.is_active = true
     ORDER BY sbm.mapped_at DESC`,
    [sampleId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// addBoxToSample
// ---------------------------------------------------------------------------
export async function addBoxToSample(
  input: AddBoxToSampleInput,
  addedBy: string
): Promise<{ sample: SampleRecord; mapping: SampleBoxMapping }> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock and fetch child box
    const cbResult = await client.query(
      'SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE',
      [input.child_box_id]
    );
    if (cbResult.rows.length === 0) {
      throw new NotFoundError('Child box not found');
    }
    const childBox = cbResult.rows[0];
    const requestedFoot = (input.foot ?? 'PAIR') as Foot;

    // Foot-aware availability: a SAMPLE box is still addable for its OTHER free foot.
    const activeFeet = await getActiveSampleFeet(client, childBox.id);
    assertFootAvailable(childBox.barcode, childBox.status, activeFeet, requestedFoot);

    // Lock and fetch sample record
    const srResult = await client.query(
      'SELECT * FROM sample_records WHERE id = $1 FOR UPDATE',
      [input.sample_record_id]
    );
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];

    if (
      sample.status === SAMPLE_STATUS.CLOSED ||
      sample.status === SAMPLE_STATUS.DISPATCHED
    ) {
      throw new BadRequestError(
        `Sample record is ${sample.status} and cannot accept new child boxes`
      );
    }

    // Auto-activate GENERATED boxes
    if (childBox.status === CHILD_BOX_STATUS.GENERATED) {
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [
          TRANSACTION_TYPES.CHILD_ACTIVATED, input.child_box_id, addedBy,
          `Child box ${childBox.barcode} auto-activated (implicit activation during add to sample ${sample.sample_barcode})`,
        ]
      );
    }

    // Update child box status to SAMPLE
    await client.query(
      `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
      [CHILD_BOX_STATUS.SAMPLE, input.child_box_id]
    );

    // Create mapping (foot defaults to PAIR; samples may be a single LEFT/RIGHT foot)
    const mappingResult = await client.query(
      `INSERT INTO sample_box_mapping (sample_record_id, child_box_id, mapped_by, foot)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.sample_record_id, input.child_box_id, addedBy, requestedFoot]
    );

    // Update sample child_count and status
    const newChildCount = sample.child_count + 1;
    const newStatus =
      sample.status === SAMPLE_STATUS.CREATED ? SAMPLE_STATUS.ACTIVE : sample.status;

    const updatedSampleResult = await client.query(
      `UPDATE sample_records SET child_count = $1, status = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [newChildCount, newStatus, input.sample_record_id]
    );

    // Log inventory transaction
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TRANSACTION_TYPES.CHILD_SAMPLED, input.child_box_id, addedBy,
        `Added child box ${childBox.barcode} to sample ${sample.sample_barcode}`,
        JSON.stringify({ sample_record_id: input.sample_record_id }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: addedBy,
      action: 'ADD_BOX_TO_SAMPLE',
      entityType: 'sample_record',
      entityId: mappingResult.rows[0].id,
      newValues: { child_box_id: input.child_box_id, sample_record_id: input.sample_record_id },
    });

    logger.info(`Added child box ${childBox.barcode} to sample ${sample.sample_barcode}`);

    return {
      sample: updatedSampleResult.rows[0],
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
// removeBoxFromSample
// ---------------------------------------------------------------------------
export async function removeBoxFromSample(
  input: RemoveBoxFromSampleInput,
  removedBy: string
): Promise<SampleRecord> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock and fetch the mapping
    const mappingResult = await client.query(
      `SELECT * FROM sample_box_mapping
       WHERE child_box_id = $1 AND sample_record_id = $2 AND is_active = true
       FOR UPDATE`,
      [input.child_box_id, input.sample_record_id]
    );
    if (mappingResult.rows.length === 0) {
      throw new NotFoundError('Active mapping not found for this child box and sample record');
    }

    const cbResult = await client.query(
      'SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE',
      [input.child_box_id]
    );
    const childBox = cbResult.rows[0];

    const srResult = await client.query(
      'SELECT * FROM sample_records WHERE id = $1 FOR UPDATE',
      [input.sample_record_id]
    );
    const sample = srResult.rows[0];

    if (sample.status === SAMPLE_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot remove a child box from a dispatched sample');
    }

    // Deactivate mapping
    await client.query(
      `UPDATE sample_box_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1
       WHERE id = $2`,
      [removedBy, mappingResult.rows[0].id]
    );

    // Set child box back to FREE only if no other foot of it is still in an active sample.
    const remainingFeet = await getActiveSampleFeet(client, input.child_box_id);
    if (remainingFeet.length === 0) {
      await client.query(
        `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
        [CHILD_BOX_STATUS.FREE, input.child_box_id]
      );
    }

    // Update sample child_count and status
    const newChildCount = Math.max(0, sample.child_count - 1);
    let newStatus = sample.status;
    if (newChildCount === 0 && sample.status === SAMPLE_STATUS.ACTIVE) {
      newStatus = SAMPLE_STATUS.CREATED;
    }

    const updatedSampleResult = await client.query(
      `UPDATE sample_records SET child_count = $1, status = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [newChildCount, newStatus, input.sample_record_id]
    );

    // Log CHILD_UNSAMPLED transaction
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TRANSACTION_TYPES.CHILD_UNSAMPLED, input.child_box_id, removedBy,
        `Removed child box ${childBox.barcode} from sample ${sample.sample_barcode}`,
        JSON.stringify({ sample_record_id: input.sample_record_id }),
      ]
    );

    // If sample was reverted to CREATED, log SAMPLE_REOPENED
    if (newChildCount === 0 && sample.status === SAMPLE_STATUS.ACTIVE) {
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          TRANSACTION_TYPES.SAMPLE_REOPENED, removedBy,
          `Sample ${sample.sample_barcode} reverted to CREATED (all boxes removed)`,
          JSON.stringify({ sample_record_id: input.sample_record_id }),
        ]
      );
    }

    await client.query('COMMIT');

    await createAuditLog({
      userId: removedBy,
      action: 'REMOVE_BOX_FROM_SAMPLE',
      entityType: 'sample_record',
      newValues: { child_box_id: input.child_box_id, sample_record_id: input.sample_record_id },
    });

    logger.info(`Removed child box ${childBox.barcode} from sample ${sample.sample_barcode}`);
    return updatedSampleResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// closeSample
// ---------------------------------------------------------------------------
export async function closeSample(
  sampleId: string,
  closedBy: string
): Promise<SampleRecord> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const srResult = await client.query(
      'SELECT * FROM sample_records WHERE id = $1 FOR UPDATE',
      [sampleId]
    );
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }

    const sample = srResult.rows[0];

    if (sample.status === SAMPLE_STATUS.CLOSED) {
      throw new BadRequestError('Sample record is already closed');
    }
    if (sample.status === SAMPLE_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot close a dispatched sample');
    }
    if (sample.child_count === 0) {
      throw new BadRequestError('Cannot close an empty sample record');
    }

    const result = await client.query(
      `UPDATE sample_records SET status = $1, closed_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [SAMPLE_STATUS.CLOSED, sampleId]
    );

    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4)`,
      [
        TRANSACTION_TYPES.SAMPLE_CLOSED, closedBy,
        `Sample record ${sample.sample_barcode} closed`,
        JSON.stringify({ sample_record_id: sampleId }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: closedBy,
      action: 'CLOSE_SAMPLE',
      entityType: 'sample_record',
      entityId: sampleId,
    });

    logger.info(`Sample record closed: ${sample.sample_barcode}`);
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getSampleByBarcode
// ---------------------------------------------------------------------------
export async function getSampleByBarcode(
  barcode: string
): Promise<SampleRecord & { child_boxes: SampleBoxMapping[] }> {
  const result = await query(
    'SELECT * FROM sample_records WHERE sample_barcode = UPPER($1)',
    [barcode]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Sample record not found');
  }
  const sample = result.rows[0];
  const childBoxes = await getSampleChildren(sample.id);
  return { ...sample, child_boxes: childBoxes };
}

// ---------------------------------------------------------------------------
// fullUnpackSample
// ---------------------------------------------------------------------------
export async function fullUnpackSample(
  sampleId: string,
  performedBy: string
): Promise<SampleRecord> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const srResult = await client.query(
      'SELECT * FROM sample_records WHERE id = $1 FOR UPDATE',
      [sampleId]
    );
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];

    if (sample.status === SAMPLE_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot unpack a dispatched sample');
    }
    if (sample.status === SAMPLE_STATUS.CREATED) {
      throw new BadRequestError('Cannot unpack an empty sample record');
    }

    // Fetch all active mappings
    const mappingsResult = await client.query(
      `SELECT sbm.*, cb.barcode AS child_barcode
       FROM sample_box_mapping sbm
       JOIN child_boxes cb ON cb.id = sbm.child_box_id
       WHERE sbm.sample_record_id = $1 AND sbm.is_active = true`,
      [sampleId]
    );

    for (const mapping of mappingsResult.rows) {
      // Deactivate mapping
      await client.query(
        `UPDATE sample_box_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1
         WHERE id = $2`,
        [performedBy, mapping.id]
      );

      // Set child box back to FREE only if no other foot of it is still in an active sample.
      const remainingFeet = await getActiveSampleFeet(client, mapping.child_box_id);
      if (remainingFeet.length === 0) {
        await client.query(
          `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
          [CHILD_BOX_STATUS.FREE, mapping.child_box_id]
        );
      }

      // Log CHILD_UNSAMPLED per box
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CHILD_UNSAMPLED, mapping.child_box_id, performedBy,
          `Full unpack: removed child box ${mapping.child_barcode} from sample ${sample.sample_barcode}`,
          JSON.stringify({ sample_record_id: sampleId }),
        ]
      );
    }

    // Reset sample record
    const updatedResult = await client.query(
      `UPDATE sample_records SET child_count = 0, status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [SAMPLE_STATUS.CREATED, sampleId]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: performedBy,
      action: 'FULL_UNPACK_SAMPLE',
      entityType: 'sample_record',
      entityId: sampleId,
      newValues: { unpacked_count: mappingsResult.rows.length },
    });

    logger.info(`Full unpack of sample ${sample.sample_barcode}: ${mappingsResult.rows.length} child boxes removed`);
    return updatedResult.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getSampleAssortment
// ---------------------------------------------------------------------------
export async function getSampleAssortment(
  sampleId: string
): Promise<{ article_name: string; colour: string; size: string; mrp: number; count: number }[]> {
  const sampleResult = await query('SELECT id FROM sample_records WHERE id = $1', [sampleId]);
  if (sampleResult.rows.length === 0) {
    throw new NotFoundError('Sample record not found');
  }

  const result = await query(
    `SELECT p.article_name, p.colour, p.size, p.mrp, COUNT(*)::int AS count
     FROM sample_box_mapping sbm
     JOIN child_boxes cb ON cb.id = sbm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE sbm.sample_record_id = $1 AND sbm.is_active = true
     GROUP BY p.article_name, p.colour, p.size, p.mrp
     ORDER BY p.article_name, p.colour, p.size`,
    [sampleId]
  );

  return result.rows;
}
