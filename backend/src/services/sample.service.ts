import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
import { query, getClient } from '../config/database';
import { SAMPLE_STATUS, MASTER_CARTON_STATUS, CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { generateUniqueBarcode } from '../utils/barcodeGenerator';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import {
  CreateSampleInput,
  AddBoxToSampleInput,
  RemoveBoxFromSampleInput,
  TakeOutCartonBoxesInput,
  RemoveCartonFromSampleInput,
  SetBoxFootInput,
} from '../models/schemas/sample.schema';
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
  // Joined, not stored — present on getSampleById/getSampleByBarcode/getSamples.
  creator_name?: string | null;
  customer_firm_name?: string | null;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  mrp_summary?: number | null;
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
  // Joined, from getSampleChildren's loose/carton union — not real columns on one table.
  foot?: string;
  barcode?: string;
  status?: string;
  source?: 'loose' | 'carton';
  carton_barcode?: string | null;
  master_carton_id?: string | null;
  source_master_carton_id?: string | null;
}

// ---------------------------------------------------------------------------
// Foot-split helpers — a box (pair) may have its LEFT and RIGHT feet allocated to
// different samples independently. We track allocation via active sample_box_mapping
// rows (one per foot). The box-level child_boxes.status stays SAMPLE while ANY foot is
// allocated, which keeps packing/e-commerce/dispatch (all of which require FREE/GENERATED)
// correctly blocked without any change to those modules.
// ---------------------------------------------------------------------------

export type Foot = 'LEFT' | 'RIGHT' | 'PAIR';

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
// Carton-membership (whole-carton scan-in) — a master carton can be added
// INTACT to a sample or e-commerce record: its boxes stay PACKED and its
// carton_child_mapping rows stay active. Only sample_carton_mapping /
// ecommerce_carton_mapping records the allocation. Shared across
// sample.service.ts and ecommerce.service.ts (imported there).
// ---------------------------------------------------------------------------
export interface SampleCartonMapping {
  id: string;
  sample_record_id: string;
  master_carton_id: string;
  is_active: boolean;
  mapped_at: Date;
  unmapped_at: Date | null;
  mapped_by: string | null;
  unmapped_by: string | null;
  created_at: Date;
  updated_at: Date;
}

// Throws if the carton is already actively allocated to ANY sample or e-commerce
// record (a carton may be allocated to at most one such record at a time).
export async function assertCartonAllocatable(
  client: PoolClient,
  cartonId: string,
  cartonBarcode: string
): Promise<void> {
  const result = await client.query(
    `SELECT
       EXISTS (SELECT 1 FROM sample_carton_mapping WHERE master_carton_id = $1 AND is_active = true) AS sample_hit,
       EXISTS (SELECT 1 FROM ecommerce_carton_mapping WHERE master_carton_id = $1 AND is_active = true) AS ecommerce_hit`,
    [cartonId]
  );
  const { sample_hit, ecommerce_hit } = result.rows[0];
  if (sample_hit || ecommerce_hit) {
    throw new BadRequestError(
      `Master carton ${cartonBarcode} is already allocated to another sample/e-commerce record`
    );
  }
}

// ---------------------------------------------------------------------------
// recomputeSampleChildCount — derives child_count from the live mapping tables
// (loose sample_box_mapping rows + boxes reached via active sample_carton_mapping)
// instead of hand-incrementing/decrementing it. Every mutator below calls this
// instead of doing child_count +/- 1 by hand, so it can never drift — which is
// exactly how fullUnpackSample's hardcoded child_count=0 went stale the moment
// carton releasing was added (it forgot the carton branch existed).
// Derives status from the recomputed count: 0 -> CREATED (if currently ACTIVE),
// >0 -> ACTIVE (if currently CREATED). Never touches CLOSED/DISPATCHED — those
// are terminal-ish states that only their own dedicated actions change.
// Caller must already hold a lock on the sample_records row.
// ---------------------------------------------------------------------------
export async function recomputeSampleChildCount(
  client: PoolClient,
  sampleRecordId: string
): Promise<SampleRecord> {
  const result = await client.query(
    `WITH counted AS (
       SELECT
         (SELECT COUNT(*) FROM sample_box_mapping
          WHERE sample_record_id = $1 AND is_active = true)
         +
         (SELECT COUNT(*) FROM sample_carton_mapping scm
          JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id AND ccm.is_active = true
          WHERE scm.sample_record_id = $1 AND scm.is_active = true)
         AS total
     )
     UPDATE sample_records sr SET
       child_count = counted.total,
       status = CASE
         WHEN counted.total = 0 AND sr.status = 'ACTIVE' THEN 'CREATED'
         WHEN counted.total > 0 AND sr.status = 'CREATED' THEN 'ACTIVE'
         ELSE sr.status
       END,
       updated_at = NOW()
     FROM counted
     WHERE sr.id = $1
     RETURNING sr.*`,
    [sampleRecordId]
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// takeBoxOutOfCartonAllocation — pulls ONE box physically out of a carton that's
// allocated to a sample: the box leaves the carton for real (carton_child_mapping
// deactivated, master_cartons.child_count--, carton -> CREATED if it hits 0 —
// mirrors masterCarton.service.ts#unpackChildBox exactly) and re-enters the SAME
// sample as a normal loose, foot-splittable sample_box_mapping row. The carton's
// sample_carton_mapping row is untouched (still covers whatever's left in it) —
// caller decides separately whether to also release it (see releaseCartonFromSample).
//
// Rejected alternative: recording an "exclusion" so the box stays inside the
// carton on paper. That lies about physical reality (the carton would then ship
// a box that isn't in it) and taxes every carton-derived query with exclusion
// logic. This function's approach needs none of that.
//
// Caller must already hold a lock on: sample_records, the sample_carton_mapping
// row, and master_cartons (in that order) before calling this per box.
// ---------------------------------------------------------------------------
export async function takeBoxOutOfCartonAllocation(
  client: PoolClient,
  params: { sampleRecordId: string; childBoxId: string; foot?: Foot; userId: string }
): Promise<{ cartonId: string; cartonBarcode: string; cartonEmptied: boolean }> {
  const foot = params.foot ?? 'PAIR';

  const ccmResult = await client.query(
    `SELECT ccm.id AS ccm_id, ccm.master_carton_id, mc.carton_barcode, mc.child_count, mc.status AS carton_status,
            cb.status AS box_status, cb.barcode AS box_barcode
     FROM sample_carton_mapping scm
     JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id AND ccm.is_active = true
     JOIN master_cartons mc ON mc.id = scm.master_carton_id
     JOIN child_boxes cb ON cb.id = ccm.child_box_id
     WHERE scm.sample_record_id = $1 AND scm.is_active = true
       AND ccm.child_box_id = $2
     FOR UPDATE OF ccm, mc, cb`,
    [params.sampleRecordId, params.childBoxId]
  );
  if (ccmResult.rows.length === 0) {
    throw new NotFoundError('Box is not part of a carton allocated to this sample');
  }
  const row = ccmResult.rows[0];
  if (row.carton_status === MASTER_CARTON_STATUS.DISPATCHED) {
    throw new BadRequestError(`Carton ${row.carton_barcode} is already DISPATCHED`);
  }
  if (row.box_status !== CHILD_BOX_STATUS.PACKED) {
    throw new BadRequestError(`Box ${row.box_barcode} is ${row.box_status}, expected PACKED (data inconsistency)`);
  }

  // Cheap safety net — a PACKED box cannot have active sample feet, so this can
  // only ever fail on corrupt data, but it's the one source of truth for the rule.
  const activeFeet = await getActiveSampleFeet(client, params.childBoxId);
  assertFootAvailable(row.box_barcode, row.box_status, activeFeet, foot);

  // 1. Leave the carton for real.
  await client.query(
    `UPDATE carton_child_mapping SET is_active = false, unpacked_at = NOW(), unpacked_by = $1 WHERE id = $2`,
    [params.userId, row.ccm_id]
  );

  // 2. Shrink the carton; release it if it's now empty (an empty carton cannot stay allocated).
  const newCartonCount = row.child_count - 1;
  const cartonEmptied = newCartonCount <= 0;
  await client.query(
    `UPDATE master_cartons SET child_count = $1, status = $2, updated_at = NOW() WHERE id = $3`,
    [Math.max(0, newCartonCount), cartonEmptied ? MASTER_CARTON_STATUS.CREATED : row.carton_status, row.master_carton_id]
  );
  if (cartonEmptied) {
    await releaseCartonFromSample(client, {
      sampleRecordId: params.sampleRecordId,
      masterCartonId: row.master_carton_id,
      userId: params.userId,
    });
  }

  // 3. Box becomes a normal sample-allocated box.
  await client.query(
    `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
    [CHILD_BOX_STATUS.SAMPLE, params.childBoxId]
  );

  // 4. Re-enter the SAME sample as a loose, foot-splittable mapping.
  await client.query(
    `INSERT INTO sample_box_mapping (sample_record_id, child_box_id, mapped_by, foot, source_master_carton_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [params.sampleRecordId, params.childBoxId, params.userId, foot, row.master_carton_id]
  );

  await client.query(
    `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      TRANSACTION_TYPES.CHILD_UNPACKED, params.childBoxId, row.master_carton_id, params.userId,
      `Took box ${row.box_barcode} out of carton ${row.carton_barcode} to sample individually (${foot.toLowerCase()})`,
      JSON.stringify({ sample_record_id: params.sampleRecordId, foot }),
    ]
  );

  return { cartonId: row.master_carton_id, cartonBarcode: row.carton_barcode, cartonEmptied };
}

// ---------------------------------------------------------------------------
// releaseCartonFromSample — the missing inverse of scanCartonToSample. Nothing
// inside the carton was ever modified when it was allocated (scanCartonToSample
// only inserts a link row), so releasing it is a pure link-row flip: nothing
// else changes. Caller must already hold a lock on the sample_carton_mapping row
// (via its parent sample_records / master_cartons lock).
// ---------------------------------------------------------------------------
export async function releaseCartonFromSample(
  client: PoolClient,
  params: { sampleRecordId: string; masterCartonId: string; userId: string }
): Promise<void> {
  const result = await client.query(
    `UPDATE sample_carton_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1
     WHERE sample_record_id = $2 AND master_carton_id = $3 AND is_active = true
     RETURNING id`,
    [params.userId, params.sampleRecordId, params.masterCartonId]
  );
  if (result.rows.length === 0) return; // already released (e.g. emptied by takeBoxOutOfCartonAllocation) — no-op

  await client.query(
    `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      TRANSACTION_TYPES.CARTON_UNSAMPLED, params.masterCartonId, params.userId,
      `Carton released from sample allocation, back to stock`,
      JSON.stringify({ sample_record_id: params.sampleRecordId }),
    ]
  );
}

// ---------------------------------------------------------------------------
// deactivateLooseMapping — shared by remove-box, full-unpack, and scoped
// dispatch. Extracted from removeBoxFromSample's original body. Caller must
// already hold a lock on the sample_box_mapping row and its child_boxes row.
// ---------------------------------------------------------------------------
export async function deactivateLooseMapping(
  client: PoolClient,
  params: { mappingId: string; childBoxId: string; childBarcode: string; sampleRecordId: string; sampleBarcode: string; userId: string }
): Promise<void> {
  await client.query(
    `UPDATE sample_box_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1 WHERE id = $2`,
    [params.userId, params.mappingId]
  );

  // Box goes back to FREE only if no other foot of it is still in an active sample.
  const remainingFeet = await getActiveSampleFeet(client, params.childBoxId);
  if (remainingFeet.length === 0) {
    await client.query(
      `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
      [CHILD_BOX_STATUS.FREE, params.childBoxId]
    );
  }

  await client.query(
    `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      TRANSACTION_TYPES.CHILD_UNSAMPLED, params.childBoxId, params.userId,
      `Removed child box ${params.childBarcode} from sample ${params.sampleBarcode}`,
      JSON.stringify({ sample_record_id: params.sampleRecordId }),
    ]
  );
}

// ---------------------------------------------------------------------------
// scanCartonToSample — add a WHOLE master carton intact to a sample record.
// The carton is NOT emptied: its child boxes stay PACKED and its
// carton_child_mapping rows stay active. Only a sample_carton_mapping row is
// created and the sample's child_count is bumped by the carton's child_count.
// ---------------------------------------------------------------------------
export async function scanCartonToSample(
  sampleRecordId: string,
  cartonBarcode: string,
  addedBy: string
): Promise<{ sample: SampleRecord; added: number; cartonBarcode: string }> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Lock sample record
    const srResult = await client.query(
      'SELECT * FROM sample_records WHERE id = $1 FOR UPDATE',
      [sampleRecordId]
    );
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];
    if (sample.status === SAMPLE_STATUS.CLOSED || sample.status === SAMPLE_STATUS.DISPATCHED) {
      throw new BadRequestError(
        `Sample record is ${sample.status} and cannot accept new child boxes`
      );
    }

    // Lock master carton by barcode
    const mcResult = await client.query(
      'SELECT * FROM master_cartons WHERE carton_barcode = UPPER($1) FOR UPDATE',
      [cartonBarcode]
    );
    if (mcResult.rows.length === 0) {
      throw new NotFoundError(`No master carton found with barcode ${cartonBarcode}`);
    }
    const carton = mcResult.rows[0];
    if (carton.status === MASTER_CARTON_STATUS.DISPATCHED) {
      throw new BadRequestError(`Master carton ${carton.carton_barcode} is DISPATCHED and cannot be added to a sample`);
    }
    if (carton.child_count === 0) {
      throw new BadRequestError(`Master carton ${carton.carton_barcode} is empty and cannot be added to a sample`);
    }

    await assertCartonAllocatable(client, carton.id, carton.carton_barcode);

    // Create the carton-level mapping (carton stays intact — no unpack, no box status change)
    await client.query(
      `INSERT INTO sample_carton_mapping (sample_record_id, master_carton_id, mapped_by)
       VALUES ($1, $2, $3)`,
      [sampleRecordId, carton.id, addedBy]
    );

    // Grow the sample record by the carton's full child_count
    const newChildCount = sample.child_count + carton.child_count;
    const newStatus = sample.status === SAMPLE_STATUS.CREATED ? SAMPLE_STATUS.ACTIVE : sample.status;

    const updatedSampleResult = await client.query(
      `UPDATE sample_records SET child_count = $1, status = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [newChildCount, newStatus, sampleRecordId]
    );

    // Single CARTON_SAMPLED transaction — the boxes themselves did not move, so no
    // per-child transactions are logged here (unlike the old emptying scan-carton flow).
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TRANSACTION_TYPES.CARTON_SAMPLED, carton.id, addedBy,
        `Scanned carton ${carton.carton_barcode} (intact, ${carton.child_count} boxes) into sample ${sample.sample_barcode}`,
        JSON.stringify({ sample_record_id: sampleRecordId, master_carton_id: carton.id, child_count: carton.child_count }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: addedBy,
      action: 'SCAN_CARTON_TO_SAMPLE',
      entityType: 'sample_record',
      entityId: sampleRecordId,
      newValues: { sample_record_id: sampleRecordId, carton_barcode: carton.carton_barcode, boxes_added: carton.child_count },
    });

    logger.info(`Scanned carton ${carton.carton_barcode} into sample ${sample.sample_barcode} intact: ${carton.child_count} boxes`);

    return { sample: updatedSampleResult.rows[0], added: carton.child_count, cartonBarcode: carton.carton_barcode };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getSampleCartons — mapped (allocated) cartons for a sample, with a per-carton
// product summary, for the detail-page "cartons" section.
// ---------------------------------------------------------------------------
export async function getSampleCartons(sampleId: string): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT
       scm.id AS mapping_id, scm.mapped_at, scm.mapped_by,
       mc.id AS master_carton_id, mc.carton_barcode, mc.status, mc.child_count,
       ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary,
       COALESCE(tk.taken_out_count, 0)::int AS taken_out_count
     FROM sample_carton_mapping scm
     JOIN master_cartons mc ON mc.id = scm.master_carton_id
     LEFT JOIN LATERAL (
       SELECT
         string_agg(DISTINCT p.article_name, ', ') AS article_summary,
         string_agg(DISTINCT p.colour, ', ') AS colour_summary,
         string_agg(DISTINCT p.size, ', ') AS size_summary,
         MIN(p.mrp) AS mrp_summary
       FROM carton_child_mapping ccm
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       JOIN products p ON p.id = cb.product_id
       WHERE ccm.master_carton_id = mc.id AND ccm.is_active = true
     ) ps ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS taken_out_count
       FROM sample_box_mapping sbm
       WHERE sbm.source_master_carton_id = mc.id
         AND sbm.sample_record_id = scm.sample_record_id
         AND sbm.is_active = true
     ) tk ON true
     WHERE scm.sample_record_id = $1 AND scm.is_active = true
     ORDER BY scm.mapped_at DESC`,
    [sampleId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// defaultSampleName — the create form no longer requires a name (Samples
// simplification, 2026-07-31); this fills in something sensible when omitted:
// "<Customer firm name> · <date>", or "Sample <SR-barcode>" with no customer.
// ---------------------------------------------------------------------------
async function defaultSampleName(input: CreateSampleInput, sampleBarcode: string): Promise<string> {
  const date = (input.sample_date ?? new Date().toISOString()).slice(0, 10);
  if (input.customer_id) {
    const r = await query('SELECT firm_name FROM customers WHERE id = $1', [input.customer_id]);
    if (r.rows.length > 0) return `${r.rows[0].firm_name} · ${date}`;
  }
  if (input.recipient_name?.trim()) return `${input.recipient_name.trim()} · ${date}`;
  return `Sample ${sampleBarcode}`;
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
  const cartonBarcodes = input.carton_barcodes || [];
  const name = input.name?.trim() || (await defaultSampleName(input, sampleBarcode));

  // Per-barcode foot, normalized to uppercase keys to match the uppercased barcodes. Missing → PAIR.
  const footMap: Record<string, string> = {};
  if (input.box_feet) {
    for (const [bc, foot] of Object.entries(input.box_feet)) {
      footMap[bc.trim().toUpperCase()] = foot;
    }
  }

  if (barcodes.length > 0 || cartonBarcodes.length > 0) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO sample_records (id, sample_barcode, name, customer_id, recipient_name, purpose, sample_date, notes, status, child_count, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id, sampleBarcode, name, input.customer_id ?? null,
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

      // Whole-carton allocations — carton stays intact (no unpack, no box status change).
      let cartonBoxesAdded = 0;
      for (const cartonBarcode of cartonBarcodes) {
        const mcResult = await client.query(
          'SELECT * FROM master_cartons WHERE carton_barcode = UPPER($1) FOR UPDATE',
          [cartonBarcode]
        );
        if (mcResult.rows.length === 0) {
          throw new NotFoundError(`No master carton found with barcode ${cartonBarcode}`);
        }
        const carton = mcResult.rows[0];
        if (carton.status === MASTER_CARTON_STATUS.DISPATCHED) {
          throw new BadRequestError(`Master carton ${carton.carton_barcode} is DISPATCHED and cannot be added to a sample`);
        }
        if (carton.child_count === 0) {
          throw new BadRequestError(`Master carton ${carton.carton_barcode} is empty and cannot be added to a sample`);
        }

        await assertCartonAllocatable(client, carton.id, carton.carton_barcode);

        await client.query(
          `INSERT INTO sample_carton_mapping (sample_record_id, master_carton_id, mapped_by)
           VALUES ($1, $2, $3)`,
          [id, carton.id, createdBy]
        );

        await client.query(
          `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            TRANSACTION_TYPES.CARTON_SAMPLED, carton.id, createdBy,
            `Carton ${carton.carton_barcode} (intact, ${carton.child_count} boxes) added to sample ${sampleBarcode} at creation`,
            JSON.stringify({ sample_record_id: id, master_carton_id: carton.id, child_count: carton.child_count }),
          ]
        );

        cartonBoxesAdded += carton.child_count;
      }

      const totalChildCount = mappedCount + cartonBoxesAdded;
      const newStatus = totalChildCount > 0 ? SAMPLE_STATUS.ACTIVE : SAMPLE_STATUS.CREATED;
      const updatedResult = await client.query(
        `UPDATE sample_records SET child_count = $1, status = $2, updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [totalChildCount, newStatus, id]
      );

      await client.query('COMMIT');

      await createAuditLog({
        userId: createdBy,
        action: 'CREATE_SAMPLE',
        entityType: 'sample_record',
        entityId: id,
        newValues: { sample_barcode: sampleBarcode, name: name, child_box_barcodes: barcodes, carton_barcodes: cartonBarcodes },
      });

      logger.info(`Sample record created: ${sampleBarcode} with ${mappedCount} child boxes + ${cartonBoxesAdded} carton boxes`);
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
      id, sampleBarcode, name, input.customer_id ?? null,
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
    newValues: { sample_barcode: sampleBarcode, name: name },
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
  const result = await query(
    `SELECT sr.*, u.name AS creator_name, c.firm_name AS customer_firm_name
     FROM sample_records sr
     LEFT JOIN users u ON u.id = sr.created_by
     LEFT JOIN customers c ON c.id = sr.customer_id
     WHERE sr.id = $1`,
    [id]
  );
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
       c.firm_name AS customer_firm_name,
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
       FROM (
         SELECT cb.id FROM sample_box_mapping sbm JOIN child_boxes cb ON cb.id = sbm.child_box_id
         WHERE sbm.sample_record_id = sr.id AND sbm.is_active = true
         UNION ALL
         SELECT cb.id FROM sample_carton_mapping scm
         JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id AND ccm.is_active = true
         JOIN child_boxes cb ON cb.id = ccm.child_box_id
         WHERE scm.sample_record_id = sr.id AND scm.is_active = true
       ) src_boxes
       JOIN child_boxes cb ON cb.id = src_boxes.id
       JOIN products p ON p.id = cb.product_id
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
  // Union loose boxes (sample_box_mapping) with boxes reached through whole-carton
  // allocations (sample_carton_mapping -> carton_child_mapping). Carton-sourced boxes
  // stay PACKED (the carton is never emptied) and always enter as a full PAIR.
  const result = await query(
    `SELECT sbm.id, sbm.sample_record_id, sbm.child_box_id, sbm.is_active,
            sbm.mapped_at, sbm.unmapped_at, sbm.mapped_by, sbm.unmapped_by,
            sbm.created_at, sbm.updated_at, sbm.foot,
            cb.barcode, cb.status, cb.quantity,
            p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp,
            'loose'::text AS source, NULL::varchar(100) AS carton_barcode,
            NULL::uuid AS master_carton_id, sbm.source_master_carton_id
     FROM sample_box_mapping sbm
     JOIN child_boxes cb ON cb.id = sbm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE sbm.sample_record_id = $1 AND sbm.is_active = true

     UNION ALL

     SELECT ccm.id, scm.sample_record_id, ccm.child_box_id, ccm.is_active,
            ccm.packed_at AS mapped_at, ccm.unpacked_at AS unmapped_at,
            ccm.packed_by AS mapped_by, ccm.unpacked_by AS unmapped_by,
            ccm.created_at, ccm.updated_at, 'PAIR'::varchar(10) AS foot,
            cb.barcode, cb.status, cb.quantity,
            p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp,
            'carton'::text AS source, mc.carton_barcode,
            mc.id AS master_carton_id, NULL::uuid AS source_master_carton_id
     FROM sample_carton_mapping scm
     JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id AND ccm.is_active = true
     JOIN master_cartons mc ON mc.id = scm.master_carton_id
     JOIN child_boxes cb ON cb.id = ccm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE scm.sample_record_id = $1 AND scm.is_active = true

     ORDER BY mapped_at DESC`,
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

    const srResult = await client.query(
      'SELECT * FROM sample_records WHERE id = $1 FOR UPDATE',
      [input.sample_record_id]
    );
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];
    if (sample.status === SAMPLE_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot remove a child box from a dispatched sample');
    }

    // Resolve which loose mapping (if any) this call refers to. mapping_id is
    // preferred and unambiguous — a sample can legitimately hold BOTH feet of
    // one box as two separate mappings, so child_box_id alone can be ambiguous.
    let mapping: { id: string; child_box_id: string } | null = null;
    if (input.mapping_id) {
      const r = await client.query(
        `SELECT id, child_box_id FROM sample_box_mapping
         WHERE id = $1 AND sample_record_id = $2 AND is_active = true FOR UPDATE`,
        [input.mapping_id, input.sample_record_id]
      );
      if (r.rows.length === 0) {
        throw new NotFoundError('Active mapping not found for this sample record');
      }
      mapping = r.rows[0];
    } else if (input.child_box_id) {
      const r = await client.query(
        `SELECT id, child_box_id FROM sample_box_mapping
         WHERE child_box_id = $1 AND sample_record_id = $2 AND is_active = true FOR UPDATE`,
        [input.child_box_id, input.sample_record_id]
      );
      if (r.rows.length > 1) {
        throw new BadRequestError('This box has both feet in this sample — specify mapping_id to say which one');
      }
      if (r.rows.length === 1) mapping = r.rows[0];
    }

    let removedBarcode: string;

    if (mapping) {
      // Loose box — deactivate its own mapping.
      const cbResult = await client.query('SELECT barcode FROM child_boxes WHERE id = $1 FOR UPDATE', [mapping.child_box_id]);
      removedBarcode = cbResult.rows[0].barcode;
      await deactivateLooseMapping(client, {
        mappingId: mapping.id,
        childBoxId: mapping.child_box_id,
        childBarcode: removedBarcode,
        sampleRecordId: input.sample_record_id,
        sampleBarcode: sample.sample_barcode,
        userId: removedBy,
      });
    } else if (input.child_box_id) {
      // No loose mapping — see if it's reachable via a carton allocated to this sample.
      // Taking it out of the carton AND straight out of the sample in one call.
      const takeOut = await takeBoxOutOfCartonAllocation(client, {
        sampleRecordId: input.sample_record_id,
        childBoxId: input.child_box_id,
        userId: removedBy,
      });
      const cbResult = await client.query('SELECT barcode FROM child_boxes WHERE id = $1', [input.child_box_id]);
      removedBarcode = cbResult.rows[0].barcode;
      // takeBoxOutOfCartonAllocation just created a fresh loose mapping for this box —
      // find and immediately deactivate it so the box actually leaves the sample.
      const freshMapping = await client.query(
        `SELECT id FROM sample_box_mapping WHERE sample_record_id = $1 AND child_box_id = $2 AND is_active = true`,
        [input.sample_record_id, input.child_box_id]
      );
      await deactivateLooseMapping(client, {
        mappingId: freshMapping.rows[0].id,
        childBoxId: input.child_box_id,
        childBarcode: removedBarcode,
        sampleRecordId: input.sample_record_id,
        sampleBarcode: sample.sample_barcode,
        userId: removedBy,
      });
      logger.info(`Box ${removedBarcode} taken out of carton ${takeOut.cartonBarcode} while being removed from sample ${sample.sample_barcode}`);
    } else {
      throw new NotFoundError('Active mapping not found for this child box and sample record');
    }

    const wasActive = sample.status === SAMPLE_STATUS.ACTIVE;
    const updatedSample = await recomputeSampleChildCount(client, input.sample_record_id);

    if (wasActive && updatedSample.status === SAMPLE_STATUS.CREATED) {
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
      newValues: { child_box_id: mapping?.child_box_id ?? input.child_box_id, sample_record_id: input.sample_record_id },
    });

    logger.info(`Removed child box ${removedBarcode} from sample ${sample.sample_barcode}`);
    return updatedSample;
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
    `SELECT sr.*, u.name AS creator_name, c.firm_name AS customer_firm_name
     FROM sample_records sr
     LEFT JOIN users u ON u.id = sr.created_by
     LEFT JOIN customers c ON c.id = sr.customer_id
     WHERE sr.sample_barcode = UPPER($1)`,
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

    // Fetch all active loose mappings
    const mappingsResult = await client.query(
      `SELECT sbm.*, cb.barcode AS child_barcode
       FROM sample_box_mapping sbm
       JOIN child_boxes cb ON cb.id = sbm.child_box_id
       WHERE sbm.sample_record_id = $1 AND sbm.is_active = true`,
      [sampleId]
    );

    for (const mapping of mappingsResult.rows) {
      await deactivateLooseMapping(client, {
        mappingId: mapping.id,
        childBoxId: mapping.child_box_id,
        childBarcode: mapping.child_barcode,
        sampleRecordId: sampleId,
        sampleBarcode: sample.sample_barcode,
        userId: performedBy,
      });
    }

    // Also release any whole-carton allocations — a carton was never emptied
    // by scanCartonToSample, so releasing it is just deactivating the link row
    // (this was the "cartons stay locked forever" bug: this loop was entirely
    // missing, so an unpacked sample kept holding its cartons hostage).
    const cartonsResult = await client.query(
      `SELECT master_carton_id FROM sample_carton_mapping WHERE sample_record_id = $1 AND is_active = true FOR UPDATE`,
      [sampleId]
    );
    for (const c of cartonsResult.rows as { master_carton_id: string }[]) {
      await releaseCartonFromSample(client, { sampleRecordId: sampleId, masterCartonId: c.master_carton_id, userId: performedBy });
    }

    // Full unpack always lands on CREATED regardless of prior status (ACTIVE or
    // CLOSED) — force it first, then recompute so child_count reflects reality
    // (everything was just released, so this settles at 0) rather than hardcoding it.
    await client.query(
      `UPDATE sample_records SET status = $1, updated_at = NOW() WHERE id = $2`,
      [SAMPLE_STATUS.CREATED, sampleId]
    );
    const updatedResult = await recomputeSampleChildCount(client, sampleId);

    await client.query('COMMIT');

    await createAuditLog({
      userId: performedBy,
      action: 'FULL_UNPACK_SAMPLE',
      entityType: 'sample_record',
      entityId: sampleId,
      newValues: { unpacked_count: mappingsResult.rows.length, released_cartons: cartonsResult.rows.length },
    });

    logger.info(`Full unpack of sample ${sample.sample_barcode}: ${mappingsResult.rows.length} child boxes + ${cartonsResult.rows.length} cartons released`);
    return updatedResult;
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
     FROM (
       SELECT cb.id AS child_box_id FROM sample_box_mapping sbm
       JOIN child_boxes cb ON cb.id = sbm.child_box_id
       WHERE sbm.sample_record_id = $1 AND sbm.is_active = true
       UNION ALL
       SELECT cb.id AS child_box_id FROM sample_carton_mapping scm
       JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id AND ccm.is_active = true
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       WHERE scm.sample_record_id = $1 AND scm.is_active = true
     ) src_boxes
     JOIN child_boxes cb ON cb.id = src_boxes.child_box_id
     JOIN products p ON p.id = cb.product_id
     GROUP BY p.article_name, p.colour, p.size, p.mrp
     ORDER BY p.article_name, p.colour, p.size`,
    [sampleId]
  );

  return result.rows;
}

// ---------------------------------------------------------------------------
// takeOutCartonBoxes — pull specific boxes out of a carton allocated to a
// sample. Optionally also release the rest of the carton back to stock in the
// same call ("keep these 2, send the rest of the carton back").
// ---------------------------------------------------------------------------
export async function takeOutCartonBoxes(
  input: TakeOutCartonBoxesInput,
  performedBy: string
): Promise<SampleRecord> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const srResult = await client.query(
      'SELECT * FROM sample_records WHERE id = $1 FOR UPDATE',
      [input.sample_record_id]
    );
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];
    if (sample.status === SAMPLE_STATUS.CLOSED || sample.status === SAMPLE_STATUS.DISPATCHED) {
      throw new BadRequestError(`Sample record is ${sample.status} and cannot be modified`);
    }

    const scmResult = await client.query(
      `SELECT scm.id, mc.carton_barcode FROM sample_carton_mapping scm
       JOIN master_cartons mc ON mc.id = scm.master_carton_id
       WHERE scm.sample_record_id = $1 AND scm.master_carton_id = $2 AND scm.is_active = true
       FOR UPDATE OF scm, mc`,
      [input.sample_record_id, input.master_carton_id]
    );
    if (scmResult.rows.length === 0) {
      throw new NotFoundError('This carton is not allocated to this sample');
    }
    const cartonBarcode = scmResult.rows[0].carton_barcode;

    for (const childBoxId of input.child_box_ids) {
      await takeBoxOutOfCartonAllocation(client, {
        sampleRecordId: input.sample_record_id,
        childBoxId,
        foot: input.box_feet?.[childBoxId],
        userId: performedBy,
      });
    }

    if (input.release_carton) {
      await releaseCartonFromSample(client, {
        sampleRecordId: input.sample_record_id,
        masterCartonId: input.master_carton_id,
        userId: performedBy,
      });
    }

    const updatedSample = await recomputeSampleChildCount(client, input.sample_record_id);

    await client.query('COMMIT');

    await createAuditLog({
      userId: performedBy,
      action: 'TAKE_OUT_CARTON_BOXES',
      entityType: 'sample_record',
      entityId: input.sample_record_id,
      newValues: { carton_barcode: cartonBarcode, child_box_ids: input.child_box_ids, release_carton: input.release_carton },
    });

    logger.info(`Took ${input.child_box_ids.length} box(es) out of carton ${cartonBarcode} for sample ${sample.sample_barcode}${input.release_carton ? ' (carton released)' : ''}`);
    return updatedSample;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// removeCartonFromSample — the missing selective undo for scanCartonToSample.
// Releases the WHOLE carton back to stock untouched (nothing inside it was
// ever modified when it was allocated).
// ---------------------------------------------------------------------------
export async function removeCartonFromSample(
  input: RemoveCartonFromSampleInput,
  performedBy: string
): Promise<SampleRecord> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const srResult = await client.query(
      'SELECT * FROM sample_records WHERE id = $1 FOR UPDATE',
      [input.sample_record_id]
    );
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];
    if (sample.status === SAMPLE_STATUS.DISPATCHED) {
      throw new BadRequestError('Cannot remove a carton from a dispatched sample');
    }

    const scmResult = await client.query(
      `SELECT scm.id, mc.carton_barcode FROM sample_carton_mapping scm
       JOIN master_cartons mc ON mc.id = scm.master_carton_id
       WHERE scm.sample_record_id = $1 AND scm.master_carton_id = $2 AND scm.is_active = true
       FOR UPDATE OF scm`,
      [input.sample_record_id, input.master_carton_id]
    );
    if (scmResult.rows.length === 0) {
      throw new NotFoundError('This carton is not allocated to this sample');
    }
    const cartonBarcode = scmResult.rows[0].carton_barcode;

    await releaseCartonFromSample(client, {
      sampleRecordId: input.sample_record_id,
      masterCartonId: input.master_carton_id,
      userId: performedBy,
    });

    const wasActive = sample.status === SAMPLE_STATUS.ACTIVE;
    const updatedSample = await recomputeSampleChildCount(client, input.sample_record_id);

    if (wasActive && updatedSample.status === SAMPLE_STATUS.CREATED) {
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4)`,
        [
          TRANSACTION_TYPES.SAMPLE_REOPENED, performedBy,
          `Sample ${sample.sample_barcode} reverted to CREATED (carton removed)`,
          JSON.stringify({ sample_record_id: input.sample_record_id }),
        ]
      );
    }

    await client.query('COMMIT');

    await createAuditLog({
      userId: performedBy,
      action: 'REMOVE_CARTON_FROM_SAMPLE',
      entityType: 'sample_record',
      entityId: input.sample_record_id,
      newValues: { carton_barcode: cartonBarcode },
    });

    logger.info(`Released carton ${cartonBarcode} from sample ${sample.sample_barcode}`);
    return updatedSample;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// setBoxFoot — change the foot designation on an existing LOOSE mapping (a
// deliberate, explicit action — e.g. "send just the left shoe" — taken after
// the box is already in the sample). Carton-sourced boxes have no mapping row
// to change here; the caller must use takeOutCartonBoxes with box_feet instead.
// ---------------------------------------------------------------------------
export async function setBoxFoot(
  input: SetBoxFootInput,
  performedBy: string
): Promise<SampleRecord> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const srResult = await client.query(
      'SELECT * FROM sample_records WHERE id = $1 FOR UPDATE',
      [input.sample_record_id]
    );
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];
    if (sample.status === SAMPLE_STATUS.CLOSED || sample.status === SAMPLE_STATUS.DISPATCHED) {
      throw new BadRequestError(`Sample record is ${sample.status} and cannot be modified`);
    }

    const mappingResult = await client.query(
      `SELECT sbm.*, cb.barcode AS child_barcode, cb.status AS box_status FROM sample_box_mapping sbm
       JOIN child_boxes cb ON cb.id = sbm.child_box_id
       WHERE sbm.id = $1 AND sbm.sample_record_id = $2 AND sbm.is_active = true
       FOR UPDATE OF sbm, cb`,
      [input.mapping_id, input.sample_record_id]
    );
    if (mappingResult.rows.length === 0) {
      throw new NotFoundError('Active mapping not found for this sample record');
    }
    const mapping = mappingResult.rows[0];

    if (mapping.foot === input.foot) {
      return sample; // no-op
    }

    // Check the OTHER active mappings of this box (any sample) for a conflict,
    // excluding this mapping's own current allocation.
    const otherFeetResult = await client.query(
      `SELECT foot FROM sample_box_mapping WHERE child_box_id = $1 AND is_active = true AND id <> $2`,
      [mapping.child_box_id, input.mapping_id]
    );
    const otherFeet = otherFeetResult.rows.map((r: { foot: string }) => r.foot);
    assertFootAvailable(mapping.child_barcode, mapping.box_status, otherFeet, input.foot);

    try {
      await client.query(
        `UPDATE sample_box_mapping SET foot = $1, updated_at = NOW() WHERE id = $2`,
        [input.foot, input.mapping_id]
      );
    } catch (err) {
      // Partial unique index (child_box_id, foot) WHERE is_active — under
      // concurrency this can fire before the assert above catches it.
      if ((err as { code?: string }).code === '23505') {
        throw new BadRequestError(`The ${input.foot.toLowerCase()} foot of box ${mapping.child_barcode} is already in another sample`);
      }
      throw err;
    }

    await client.query('COMMIT');

    await createAuditLog({
      userId: performedBy,
      action: 'SET_SAMPLE_BOX_FOOT',
      entityType: 'sample_record',
      entityId: input.sample_record_id,
      oldValues: { foot: mapping.foot },
      newValues: { foot: input.foot, child_box_id: mapping.child_box_id },
    });

    logger.info(`Box ${mapping.child_barcode} foot changed ${mapping.foot} -> ${input.foot} in sample ${sample.sample_barcode}`);
    return sample;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
