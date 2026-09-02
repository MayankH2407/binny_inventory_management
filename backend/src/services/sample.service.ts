import { v4 as uuidv4 } from 'uuid';
import type { PoolClient } from 'pg';
import { query, getClient } from '../config/database';
import { MASTER_CARTON_STATUS, CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { assertCartonAllocatable, resolveChannelBarcode } from './channelAllocation.service';
import { CreateSampleInput } from '../models/schemas/sample.schema';
import { generateUniqueBarcode } from '../utils/barcodeGenerator';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Samples pool redesign (2026-09) — mirrors the E-commerce pool pattern
// (ecommerce.service.ts) with two deliberate deviations: a LIGHTWEIGHT parent
// record survives (so staff can look up "what's in this sample" before it
// ships — e-commerce has no such record), and PER-FOOT (single-shoe)
// allocation + dispatch is preserved (e-commerce has no foot concept at all).
//
// sample_records no longer stores status/child_count/customer/recipient/
// purpose/date/notes — those either move to dispatch time (new
// dispatch_records.sample_* columns) or are derived at read time from the
// live mapping rows, exactly like a stored status can't survive a record
// being partially dispatched.
// ---------------------------------------------------------------------------

export type Foot = 'LEFT' | 'RIGHT' | 'PAIR';
export type SampleState = 'EMPTY' | 'OPEN' | 'DISPATCHED';

export interface SampleRecord {
  id: string;
  sample_barcode: string;
  name: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  // Derived, never stored:
  state?: SampleState;
  open_item_count?: number;
  open_box_count?: number;
  open_pairs?: number;
  shipped_box_count?: number;
  last_dispatch_date?: string | null;
  creator_name?: string | null;
  article_summary?: string | null;
  colour_summary?: string | null;
  size_summary?: string | null;
  mrp_summary?: number | null;
}

// Uniform row shape for BOTH loose boxes and whole cartons currently open in
// the sample — the samples analogue of an e-commerce pool item, plus `foot`.
export interface SampleItem {
  item_type: 'BOX' | 'CARTON';
  mapping_id: string;
  barcode: string;
  child_box_id: string | null;
  master_carton_id: string | null;
  foot: Foot;
  box_count: number;
  pairs: number;
  article_summary: string | null;
  colour_summary: string | null;
  size_summary: string | null;
  mrp: number | null;
  source_carton_barcode: string | null;
  added_at: Date;
  added_by_name: string | null;
}

export type SampleLookupResult =
  | { kind: 'RECORD'; sample_record_id: string; sample_barcode: string; name: string | null; open_item_count: number; items: SampleItem[] }
  | (SampleItem & { kind: 'ITEM'; in_sample: true; sample_record_id: string; sample_barcode: string })
  | { kind: 'ITEM'; in_sample: false; reason: string; item_type: 'BOX' | 'CARTON'; barcode: string };

// A record's state is always DERIVED from its mapping rows, never stored:
// OPEN if it currently holds anything; DISPATCHED if it's held nothing open
// but has shipped at least one item historically; EMPTY otherwise. This SQL
// fragment expects `open_items` and `shipped_items` columns already computed
// in the same query (see SAMPLE_COUNTS_LATERAL below).
const STATE_CASE_SQL = `
  CASE
    WHEN open_items > 0 THEN 'OPEN'
    WHEN shipped_items > 0 THEN 'DISPATCHED'
    ELSE 'EMPTY'
  END`;

// Per-record open/shipped item AND box counts + last dispatch date, reused by
// getSamples / getSampleById / getSampleByBarcode. "Items" counts mapping rows
// (a whole carton counts as 1, matching SampleSummary's dashboard stat);
// "box_count" counts actual physical boxes (a carton's contents included) —
// the number the Sent tab / label print actually want to show.
const SAMPLE_COUNTS_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT
      (SELECT COUNT(*) FROM sample_box_mapping sbm
        WHERE sbm.sample_record_id = sr.id AND sbm.is_active = true AND sbm.dispatch_record_id IS NULL)
      +
      (SELECT COUNT(*) FROM sample_carton_mapping scm
        WHERE scm.sample_record_id = sr.id AND scm.is_active = true AND scm.dispatch_record_id IS NULL)
      AS open_items,
      (SELECT COUNT(*) FROM sample_box_mapping sbm
        WHERE sbm.sample_record_id = sr.id AND sbm.dispatch_record_id IS NOT NULL)
      +
      (SELECT COALESCE(SUM(ccm.cnt), 0) FROM sample_carton_mapping scm
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS cnt FROM carton_child_mapping x WHERE x.master_carton_id = scm.master_carton_id
        ) ccm ON true
        WHERE scm.sample_record_id = sr.id AND scm.dispatch_record_id IS NOT NULL)
      AS shipped_items,
      (SELECT COUNT(*) FROM sample_box_mapping sbm
        WHERE sbm.sample_record_id = sr.id AND sbm.is_active = true AND sbm.dispatch_record_id IS NULL)
      +
      (SELECT COALESCE(SUM(ccm.cnt), 0) FROM sample_carton_mapping scm
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS cnt FROM carton_child_mapping x WHERE x.master_carton_id = scm.master_carton_id AND x.is_active = true
        ) ccm ON true
        WHERE scm.sample_record_id = sr.id AND scm.is_active = true AND scm.dispatch_record_id IS NULL)
      AS open_box_count,
      (SELECT COUNT(*) FROM sample_box_mapping sbm
        WHERE sbm.sample_record_id = sr.id AND sbm.dispatch_record_id IS NOT NULL)
      +
      (SELECT COALESCE(SUM(ccm.cnt), 0) FROM sample_carton_mapping scm
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS cnt FROM carton_child_mapping x WHERE x.master_carton_id = scm.master_carton_id
        ) ccm ON true
        WHERE scm.sample_record_id = sr.id AND scm.dispatch_record_id IS NOT NULL)
      AS shipped_box_count,
      (SELECT MAX(dr.dispatch_date) FROM dispatch_records dr WHERE dr.id IN (
         SELECT DISTINCT dispatch_record_id FROM sample_box_mapping WHERE sample_record_id = sr.id AND dispatch_record_id IS NOT NULL
         UNION
         SELECT DISTINCT dispatch_record_id FROM sample_carton_mapping WHERE sample_record_id = sr.id AND dispatch_record_id IS NOT NULL
      )) AS last_dispatch_date
  ) cnt ON true
`;

// Per-record product summary (article/colour/size/MRP) — covers everything
// EVER meaningfully in this sample (currently open OR shipped; excludes rows
// that were scanned in then removed without shipping), so a fully-dispatched
// "Sent" row still shows what it contained, not a blank summary.
const SAMPLE_PRODUCT_SUMMARY_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT
      string_agg(DISTINCT p.article_name, ', ') AS article_summary,
      string_agg(DISTINCT p.colour, ', ') AS colour_summary,
      string_agg(DISTINCT p.size, ', ') AS size_summary,
      MIN(p.mrp) AS mrp_summary
    FROM (
      SELECT sbm.child_box_id FROM sample_box_mapping sbm
       WHERE sbm.sample_record_id = sr.id AND (sbm.is_active = true OR sbm.dispatch_record_id IS NOT NULL)
      UNION ALL
      SELECT ccm.child_box_id FROM sample_carton_mapping scm
       JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id
       WHERE scm.sample_record_id = sr.id AND (scm.is_active = true OR scm.dispatch_record_id IS NOT NULL)
    ) src
    JOIN child_boxes cb ON cb.id = src.child_box_id
    JOIN products p ON p.id = cb.product_id
  ) ps ON true
`;

// ---------------------------------------------------------------------------
// Foot-split helpers — a box (pair) may have its LEFT and RIGHT feet allocated
// to different samples independently. We track allocation via active (not yet
// dispatched) sample_box_mapping rows. The box-level child_boxes.status stays
// SAMPLE while ANY foot is open, which keeps packing/e-commerce (both require
// FREE/GENERATED) correctly blocked with no change to those modules.
// ---------------------------------------------------------------------------

// Feet of a box currently held OPEN (not yet dispatched) by active sample
// mappings, e.g. ['LEFT'] or ['LEFT','RIGHT'].
async function getActiveSampleFeet(client: PoolClient, childBoxId: string): Promise<string[]> {
  const r = await client.query(
    `SELECT foot FROM sample_box_mapping WHERE child_box_id = $1 AND is_active = true AND dispatch_record_id IS NULL`,
    [childBoxId]
  );
  return r.rows.map((row: { foot: string }) => row.foot);
}

// Which feet of this box have ALREADY SHIPPED — read from the box row itself
// (not from sample_box_mapping's is_active, which other flows can legitimately
// flip): "a shoe left the building" is a property of the physical box.
function goneFeet(box: { left_dispatched_at: Date | null; right_dispatched_at: Date | null }): Foot[] {
  const gone: Foot[] = [];
  if (box.left_dispatched_at) gone.push('LEFT');
  if (box.right_dispatched_at) gone.push('RIGHT');
  return gone;
}

// Throws BadRequest unless the requested foot of this box is free to be
// sampled, given its OTHER active sample-foot mappings (independent of the
// box's own status — see assertFootAvailable for the status-gated version
// used when adding a not-yet-sampled box).
function assertNoConflictingFoot(barcode: string, activeFeet: string[], requestedFoot: Foot): void {
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

// Throws BadRequest unless the requested foot of this box is free to be
// sampled. Unlike e-commerce's blanket status reject, a box already partially
// foot-sampled (status SAMPLE) or half-shipped (status PARTIAL) must still be
// addable for its surviving/free foot — that is the whole point of
// foot-splitting and of the PARTIAL status.
export function assertFootAvailable(
  barcode: string,
  box: { status: string; quantity: number; left_dispatched_at: Date | null; right_dispatched_at: Date | null },
  activeFeet: string[],
  requestedFoot: Foot
): void {
  // Consumed by a non-sample flow, or both feet already gone.
  if (
    box.status === CHILD_BOX_STATUS.PACKED ||
    box.status === CHILD_BOX_STATUS.ECOMMERCE ||
    box.status === CHILD_BOX_STATUS.DISPATCHED
  ) {
    throw new BadRequestError(
      `Child box ${barcode} is currently ${box.status} and cannot be added to a sample. ` +
      `Only FREE, GENERATED, SAMPLE (free foot) or PARTIAL (one shoe left) boxes can be sampled.`
    );
  }

  const gone = goneFeet(box);
  if (gone.length > 0) {
    if (requestedFoot === 'PAIR') {
      const survivor = gone[0] === 'LEFT' ? 'right' : 'left';
      throw new BadRequestError(
        `Child box ${barcode} has already shipped its ${gone[0].toLowerCase()} shoe — only the ${survivor} shoe remains. Add it as a single foot.`
      );
    }
    if (gone.includes(requestedFoot)) {
      throw new BadRequestError(
        `The ${requestedFoot.toLowerCase()} shoe of child box ${barcode} has already been dispatched.`
      );
    }
  }

  if (requestedFoot !== 'PAIR' && box.quantity !== 1) {
    throw new BadRequestError(
      `Child box ${barcode} holds ${box.quantity} pairs — single-foot allocation applies to 1-pair boxes only.`
    );
  }

  assertNoConflictingFoot(barcode, activeFeet, requestedFoot);
}

// ---------------------------------------------------------------------------
// deactivateLooseMapping — shared by removeFromSample and clearSample. Caller
// must already hold a lock on the sample_box_mapping row and its child_boxes
// row. Restores PARTIAL (not FREE) if the box has ever shipped a foot — a
// half-shipped box removed from a sample must stay marked half-available, not
// be silently laundered back into full-pair FREE stock.
// ---------------------------------------------------------------------------
export async function deactivateLooseMapping(
  client: PoolClient,
  params: { mappingId: string; childBoxId: string; childBarcode: string; sampleRecordId: string; sampleBarcode: string; userId: string }
): Promise<void> {
  await client.query(
    `UPDATE sample_box_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1 WHERE id = $2`,
    [params.userId, params.mappingId]
  );

  const remainingFeet = await getActiveSampleFeet(client, params.childBoxId);
  if (remainingFeet.length === 0) {
    await client.query(
      `UPDATE child_boxes
         SET status = CASE
               WHEN left_dispatched_at IS NOT NULL OR right_dispatched_at IS NOT NULL
                 THEN 'PARTIAL'::child_box_status
               ELSE 'FREE'::child_box_status
             END,
             updated_at = NOW()
       WHERE id = $1`,
      [params.childBoxId]
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
// releaseCartonFromSample — nothing inside the carton was ever modified when
// it was allocated (addToSample only inserts a link row), so releasing it is
// a pure link-row flip.
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
  if (result.rows.length === 0) return;

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
// createSampleRecord — name only, zero other questions. Everything that used
// to be asked at create time (recipient/customer/purpose/date/notes) is
// captured at dispatch time instead.
// ---------------------------------------------------------------------------
export async function createSampleRecord(
  input: CreateSampleInput,
  createdBy: string
): Promise<SampleRecord> {
  const id = uuidv4();
  const sampleBarcode = await generateUniqueBarcode('SR');
  const name = input.name?.trim() || null;

  const result = await query(
    `INSERT INTO sample_records (id, sample_barcode, name, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, sampleBarcode, name, createdBy]
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
    newValues: { sample_barcode: sampleBarcode, name },
  });

  logger.info(`Sample record created: ${sampleBarcode}`);
  return { ...result.rows[0], state: 'EMPTY', open_item_count: 0 };
}

// ---------------------------------------------------------------------------
// getSamples (paginated list)
// ---------------------------------------------------------------------------
export async function getSamples(
  filters: { search?: string; state?: SampleState },
  page: number = 1,
  limit: number = 25
): Promise<{ data: SampleRecord[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.search) {
    conditions.push(`(sr.sample_barcode ILIKE $${paramIndex} OR sr.name ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  // state is filtered post-derivation (it depends on the LATERAL), so it's
  // applied as a HAVING-style outer filter rather than a plain WHERE. OPEN
  // means "the Samples Area tab" — not-yet-fully-dispatched, i.e. EMPTY or
  // OPEN — matching the class comment above; DISPATCHED is the "Sent" tab.
  const stateFilter =
    filters.state === 'OPEN' ? `WHERE state IN ('EMPTY', 'OPEN')`
    : filters.state ? `WHERE state = $${paramIndex++}`
    : '';
  if (filters.state && filters.state !== 'OPEN') values.push(filters.state);

  const countResult = await query(
    `SELECT COUNT(*) FROM (
       SELECT ${STATE_CASE_SQL} AS state
       FROM sample_records sr
       ${SAMPLE_COUNTS_LATERAL}
       ${whereClause}
     ) x ${stateFilter}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  const dataValues = [...values, limit, offset];

  const result = await query(
    `SELECT * FROM (
       SELECT sr.*, u.name AS creator_name,
         cnt.open_items::int AS open_item_count,
         cnt.open_box_count::int AS open_box_count,
         cnt.shipped_box_count::int AS shipped_box_count,
         cnt.last_dispatch_date,
         ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary,
         ${STATE_CASE_SQL} AS state
       FROM sample_records sr
       LEFT JOIN users u ON u.id = sr.created_by
       ${SAMPLE_COUNTS_LATERAL}
       ${SAMPLE_PRODUCT_SUMMARY_LATERAL}
       ${whereClause}
     ) x
     ${stateFilter}
     ORDER BY x.created_at DESC, x.id
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    dataValues
  );

  return { data: result.rows, total };
}

// ---------------------------------------------------------------------------
// getSampleSummary — stat cards on the Samples list page.
// ---------------------------------------------------------------------------
export interface SampleSummary {
  total_records: number;
  empty_records: number;
  open_records: number;
  dispatched_records: number;
  open_items: number;
  open_boxes: number;
}

export async function getSampleSummary(): Promise<SampleSummary> {
  const result = await query(`
    SELECT
      COUNT(*)::int AS total_records,
      COUNT(*) FILTER (WHERE state = 'EMPTY')::int AS empty_records,
      COUNT(*) FILTER (WHERE state = 'OPEN')::int AS open_records,
      COUNT(*) FILTER (WHERE state = 'DISPATCHED')::int AS dispatched_records,
      COALESCE(SUM(open_items), 0)::int AS open_items
    FROM (
      SELECT ${STATE_CASE_SQL} AS state, cnt.open_items
      FROM sample_records sr
      ${SAMPLE_COUNTS_LATERAL}
    ) x
  `);
  const row = result.rows[0];
  return { ...row, open_boxes: row.open_items };
}

// ---------------------------------------------------------------------------
// getSampleContents — the "pool" of one sample record: loose boxes + whole
// reserved cartons, currently open (not yet dispatched). Uniform SampleItem
// shape, the samples analogue of an e-commerce pool listing.
// ---------------------------------------------------------------------------
export async function getSampleContents(sampleRecordId: string): Promise<SampleItem[]> {
  const result = await query(
    `SELECT 'BOX'::text AS item_type, sbm.id AS mapping_id, cb.barcode,
            cb.id AS child_box_id, NULL::uuid AS master_carton_id, sbm.foot,
            1 AS box_count, cb.quantity AS pairs,
            p.article_name AS article_summary, p.colour AS colour_summary,
            p.size AS size_summary, p.mrp AS mrp,
            src.carton_barcode AS source_carton_barcode,
            sbm.mapped_at AS added_at, u.name AS added_by_name
     FROM sample_box_mapping sbm
     JOIN child_boxes cb ON cb.id = sbm.child_box_id
     JOIN products p ON p.id = cb.product_id
     LEFT JOIN users u ON u.id = sbm.mapped_by
     LEFT JOIN master_cartons src ON src.id = sbm.source_master_carton_id
     WHERE sbm.sample_record_id = $1 AND sbm.is_active = true AND sbm.dispatch_record_id IS NULL

     UNION ALL

     SELECT 'CARTON'::text AS item_type, scm.id AS mapping_id, mc.carton_barcode AS barcode,
            NULL::uuid AS child_box_id, mc.id AS master_carton_id, 'PAIR'::varchar(10) AS foot,
            mc.child_count AS box_count, ps.pairs_total AS pairs,
            ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary AS mrp,
            NULL::varchar(100) AS source_carton_barcode,
            scm.mapped_at AS added_at, u.name AS added_by_name
     FROM sample_carton_mapping scm
     JOIN master_cartons mc ON mc.id = scm.master_carton_id
     LEFT JOIN users u ON u.id = scm.mapped_by
     LEFT JOIN LATERAL (
       SELECT
         string_agg(DISTINCT p.article_name, ', ') AS article_summary,
         string_agg(DISTINCT p.colour, ', ') AS colour_summary,
         string_agg(DISTINCT p.size, ', ') AS size_summary,
         MIN(p.mrp) AS mrp_summary,
         COALESCE(SUM(cb.quantity), 0) AS pairs_total
       FROM carton_child_mapping ccm
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       JOIN products p ON p.id = cb.product_id
       WHERE ccm.master_carton_id = mc.id AND ccm.is_active = true
     ) ps ON true
     WHERE scm.sample_record_id = $1 AND scm.is_active = true AND scm.dispatch_record_id IS NULL

     ORDER BY added_at DESC`,
    [sampleRecordId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// getSampleById / getSampleByBarcode
// ---------------------------------------------------------------------------
export async function getSampleById(id: string): Promise<SampleRecord & { items: SampleItem[] }> {
  const result = await query(
    `SELECT sr.*, u.name AS creator_name,
       cnt.open_items::int AS open_item_count,
       cnt.open_box_count::int AS open_box_count,
       cnt.shipped_box_count::int AS shipped_box_count,
       cnt.last_dispatch_date,
       ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary,
       ${STATE_CASE_SQL} AS state
     FROM sample_records sr
     LEFT JOIN users u ON u.id = sr.created_by
     ${SAMPLE_COUNTS_LATERAL}
     ${SAMPLE_PRODUCT_SUMMARY_LATERAL}
     WHERE sr.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Sample record not found');
  }
  const items = await getSampleContents(id);
  return { ...result.rows[0], items };
}

export async function getSampleByBarcode(barcode: string): Promise<SampleRecord & { items: SampleItem[] }> {
  const result = await query(
    `SELECT sr.*, u.name AS creator_name,
       cnt.open_items::int AS open_item_count,
       cnt.open_box_count::int AS open_box_count,
       cnt.shipped_box_count::int AS shipped_box_count,
       cnt.last_dispatch_date,
       ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary,
       ${STATE_CASE_SQL} AS state
     FROM sample_records sr
     LEFT JOIN users u ON u.id = sr.created_by
     ${SAMPLE_COUNTS_LATERAL}
     ${SAMPLE_PRODUCT_SUMMARY_LATERAL}
     WHERE sr.sample_barcode = UPPER($1)`,
    [barcode]
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('Sample record not found');
  }
  const sample = result.rows[0];
  const items = await getSampleContents(sample.id);
  return { ...sample, items };
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
       WHERE sbm.sample_record_id = $1 AND sbm.is_active = true AND sbm.dispatch_record_id IS NULL
       UNION ALL
       SELECT cb.id AS child_box_id FROM sample_carton_mapping scm
       JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id AND ccm.is_active = true
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       WHERE scm.sample_record_id = $1 AND scm.is_active = true AND scm.dispatch_record_id IS NULL
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
// addToSample — one scan endpoint, resolves box vs. carton server-side.
// Mirrors POST /ecommerce/pool/scan; a record accepts items forever (there's
// no status gate — a sample is dispatchable/addable-to at any non-dispatched
// point, there's no "closed" state).
// ---------------------------------------------------------------------------
export async function addToSample(
  params: { sampleRecordId: string; barcode: string; foot?: Foot },
  userId: string
): Promise<{ item_type: 'BOX' | 'CARTON'; barcode: string; boxes_added: number; mapping_id: string; foot: Foot }> {
  const client = await getClient();
  const requestedFoot = params.foot ?? 'PAIR';

  try {
    await client.query('BEGIN');

    const srResult = await client.query('SELECT * FROM sample_records WHERE id = $1 FOR UPDATE', [params.sampleRecordId]);
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];

    const resolved = await resolveChannelBarcode(client, params.barcode);

    if (resolved.item_type === 'CARTON') {
      const mcResult = await client.query('SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE', [resolved.id]);
      const carton = mcResult.rows[0];
      if (carton.status === MASTER_CARTON_STATUS.DISPATCHED) {
        throw new BadRequestError(`Master carton ${carton.carton_barcode} is DISPATCHED and cannot be added to a sample`);
      }
      if (carton.child_count === 0) {
        throw new BadRequestError(`Master carton ${carton.carton_barcode} is empty and cannot be added to a sample`);
      }
      await assertCartonAllocatable(client, carton.id, carton.carton_barcode);

      const mappingResult = await client.query(
        `INSERT INTO sample_carton_mapping (sample_record_id, master_carton_id, mapped_by)
         VALUES ($1, $2, $3) RETURNING id`,
        [params.sampleRecordId, carton.id, userId]
      );

      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CARTON_SAMPLED, carton.id, userId,
          `Scanned carton ${carton.carton_barcode} (intact, ${carton.child_count} boxes) into sample ${sample.sample_barcode}`,
          JSON.stringify({ sample_record_id: params.sampleRecordId, master_carton_id: carton.id, child_count: carton.child_count }),
        ]
      );

      await client.query('COMMIT');
      await createAuditLog({
        userId, action: 'ADD_CARTON_TO_SAMPLE', entityType: 'sample_record', entityId: params.sampleRecordId,
        newValues: { carton_barcode: carton.carton_barcode, boxes_added: carton.child_count },
      });
      logger.info(`Scanned carton ${carton.carton_barcode} into sample ${sample.sample_barcode} intact: ${carton.child_count} boxes`);
      return { item_type: 'CARTON', barcode: carton.carton_barcode, boxes_added: carton.child_count, mapping_id: mappingResult.rows[0].id, foot: 'PAIR' };
    }

    // BOX branch
    const cbResult = await client.query('SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE', [resolved.id]);
    const childBox = cbResult.rows[0];

    const activeFeet = await getActiveSampleFeet(client, childBox.id);
    assertFootAvailable(childBox.barcode, childBox, activeFeet, requestedFoot);

    if (childBox.status === CHILD_BOX_STATUS.GENERATED) {
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [TRANSACTION_TYPES.CHILD_ACTIVATED, childBox.id, userId, `Child box ${childBox.barcode} auto-activated (implicit activation during add to sample ${sample.sample_barcode})`]
      );
    }

    await client.query(`UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`, [CHILD_BOX_STATUS.SAMPLE, childBox.id]);

    const mappingResult = await client.query(
      `INSERT INTO sample_box_mapping (sample_record_id, child_box_id, mapped_by, foot)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [params.sampleRecordId, childBox.id, userId, requestedFoot]
    );

    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TRANSACTION_TYPES.CHILD_SAMPLED, childBox.id, userId,
        `Added child box ${childBox.barcode} (${requestedFoot.toLowerCase()}) to sample ${sample.sample_barcode}`,
        JSON.stringify({ sample_record_id: params.sampleRecordId, foot: requestedFoot }),
      ]
    );

    await client.query('COMMIT');
    await createAuditLog({
      userId, action: 'ADD_BOX_TO_SAMPLE', entityType: 'sample_record', entityId: params.sampleRecordId,
      newValues: { child_box_id: childBox.id, foot: requestedFoot },
    });
    logger.info(`Added child box ${childBox.barcode} to sample ${sample.sample_barcode}`);
    return { item_type: 'BOX', barcode: childBox.barcode, boxes_added: 1, mapping_id: mappingResult.rows[0].id, foot: requestedFoot };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// unpackCartonInSample — all-or-nothing (replaces the removed partial
// take-boxes-out capability). Mirrors unpackCartonInEcommercePool exactly,
// substituting SAMPLE for ECOMMERCE and CARTON_UNPACKED_TO_SAMPLE for
// CARTON_UNPACKED_TO_ECOM_POOL. Legacy cartons (no tracked child boxes)
// cannot be unpacked this way — must be opened for repacking first.
// ---------------------------------------------------------------------------
export async function unpackCartonInSample(
  params: { sampleRecordId: string; mappingId: string },
  userId: string
): Promise<{ master_carton_id: string; carton_barcode: string; boxes_unpacked: number }> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const scmResult = await client.query(
      `SELECT scm.id, scm.master_carton_id, mc.carton_barcode, mc.is_legacy, mc.status AS carton_status
       FROM sample_carton_mapping scm
       JOIN master_cartons mc ON mc.id = scm.master_carton_id
       WHERE scm.id = $1 AND scm.sample_record_id = $2 AND scm.is_active = true AND scm.dispatch_record_id IS NULL
       FOR UPDATE OF scm, mc`,
      [params.mappingId, params.sampleRecordId]
    );
    if (scmResult.rows.length === 0) {
      throw new NotFoundError('This carton is not currently reserved in this sample');
    }
    const carton = scmResult.rows[0];
    if (carton.carton_status === MASTER_CARTON_STATUS.DISPATCHED) {
      throw new BadRequestError(`Carton ${carton.carton_barcode} is already DISPATCHED`);
    }
    if (carton.is_legacy) {
      throw new BadRequestError(`Carton ${carton.carton_barcode} is a legacy carton with no tracked boxes. Open it for repacking first.`);
    }

    const boxesResult = await client.query(
      `SELECT ccm.id AS ccm_id, cb.id AS child_box_id, cb.barcode, cb.status
       FROM carton_child_mapping ccm
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       WHERE ccm.master_carton_id = $1 AND ccm.is_active = true
       FOR UPDATE OF ccm, cb`,
      [carton.master_carton_id]
    );
    if (boxesResult.rows.length === 0) {
      throw new BadRequestError(`Carton ${carton.carton_barcode} has no boxes to unpack (data inconsistency)`);
    }
    for (const box of boxesResult.rows) {
      if (box.status !== CHILD_BOX_STATUS.PACKED) {
        throw new BadRequestError(`Box ${box.barcode} is ${box.status}, expected PACKED (data inconsistency)`);
      }
    }

    // Deactivate the carton mapping and the carton_child_mapping rows; each
    // box becomes its own independent, foot-splittable loose sample item.
    await client.query(
      `UPDATE sample_carton_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1 WHERE id = $2`,
      [userId, params.mappingId]
    );
    await client.query(
      `UPDATE carton_child_mapping SET is_active = false, unpacked_at = NOW(), unpacked_by = $1 WHERE master_carton_id = $2 AND is_active = true`,
      [userId, carton.master_carton_id]
    );
    await client.query(
      `UPDATE master_cartons SET child_count = 0, status = $1, updated_at = NOW() WHERE id = $2`,
      [MASTER_CARTON_STATUS.CREATED, carton.master_carton_id]
    );

    for (const box of boxesResult.rows) {
      await client.query(`UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`, [CHILD_BOX_STATUS.SAMPLE, box.child_box_id]);
      await client.query(
        `INSERT INTO sample_box_mapping (sample_record_id, child_box_id, mapped_by, foot, source_master_carton_id)
         VALUES ($1, $2, $3, 'PAIR', $4)`,
        [params.sampleRecordId, box.child_box_id, userId, carton.master_carton_id]
      );
    }

    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TRANSACTION_TYPES.CARTON_UNPACKED_TO_SAMPLE, carton.master_carton_id, userId,
        `Unpacked carton ${carton.carton_barcode} in sample — ${boxesResult.rows.length} boxes now individually trackable`,
        JSON.stringify({ sample_record_id: params.sampleRecordId, box_count: boxesResult.rows.length }),
      ]
    );

    await client.query('COMMIT');
    await createAuditLog({
      userId, action: 'UNPACK_CARTON_IN_SAMPLE', entityType: 'sample_record', entityId: params.sampleRecordId,
      newValues: { carton_barcode: carton.carton_barcode, boxes_unpacked: boxesResult.rows.length },
    });
    logger.info(`Unpacked carton ${carton.carton_barcode} in sample: ${boxesResult.rows.length} boxes`);
    return { master_carton_id: carton.master_carton_id, carton_barcode: carton.carton_barcode, boxes_unpacked: boxesResult.rows.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// removeFromSample — merges the old remove-box + remove-carton into one
// endpoint, branching on item_type, mirroring removeFromEcommercePool.
// ---------------------------------------------------------------------------
export async function removeFromSample(
  params: { sampleRecordId: string; itemType: 'BOX' | 'CARTON'; mappingId: string },
  userId: string
): Promise<{ item_type: 'BOX' | 'CARTON'; barcode: string }> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const srResult = await client.query('SELECT * FROM sample_records WHERE id = $1 FOR UPDATE', [params.sampleRecordId]);
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];

    if (params.itemType === 'BOX') {
      const r = await client.query(
        `SELECT sbm.id, sbm.child_box_id, cb.barcode FROM sample_box_mapping sbm
         JOIN child_boxes cb ON cb.id = sbm.child_box_id
         WHERE sbm.id = $1 AND sbm.sample_record_id = $2 AND sbm.is_active = true AND sbm.dispatch_record_id IS NULL
         FOR UPDATE OF sbm`,
        [params.mappingId, params.sampleRecordId]
      );
      if (r.rows.length === 0) {
        throw new NotFoundError('This item is not currently open in this sample');
      }
      const mapping = r.rows[0];
      await deactivateLooseMapping(client, {
        mappingId: mapping.id, childBoxId: mapping.child_box_id, childBarcode: mapping.barcode,
        sampleRecordId: params.sampleRecordId, sampleBarcode: sample.sample_barcode, userId,
      });
      await client.query('COMMIT');
      await createAuditLog({ userId, action: 'REMOVE_BOX_FROM_SAMPLE', entityType: 'sample_record', entityId: params.sampleRecordId, newValues: { child_box_id: mapping.child_box_id } });
      logger.info(`Removed child box ${mapping.barcode} from sample ${sample.sample_barcode}`);
      return { item_type: 'BOX', barcode: mapping.barcode };
    }

    // CARTON
    const r = await client.query(
      `SELECT scm.id, mc.carton_barcode FROM sample_carton_mapping scm
       JOIN master_cartons mc ON mc.id = scm.master_carton_id
       WHERE scm.id = $1 AND scm.sample_record_id = $2 AND scm.is_active = true AND scm.dispatch_record_id IS NULL
       FOR UPDATE OF scm`,
      [params.mappingId, params.sampleRecordId]
    );
    if (r.rows.length === 0) {
      throw new NotFoundError('This carton is not currently reserved in this sample');
    }
    const cartonBarcode = r.rows[0].carton_barcode;
    const mcResult = await client.query('SELECT master_carton_id FROM sample_carton_mapping WHERE id = $1', [params.mappingId]);
    await releaseCartonFromSample(client, { sampleRecordId: params.sampleRecordId, masterCartonId: mcResult.rows[0].master_carton_id, userId });

    await client.query('COMMIT');
    await createAuditLog({ userId, action: 'REMOVE_CARTON_FROM_SAMPLE', entityType: 'sample_record', entityId: params.sampleRecordId, newValues: { carton_barcode: cartonBarcode } });
    logger.info(`Released carton ${cartonBarcode} from sample ${sample.sample_barcode}`);
    return { item_type: 'CARTON', barcode: cartonBarcode };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// setBoxFoot — change the foot designation on an existing OPEN loose mapping.
// ---------------------------------------------------------------------------
export async function setBoxFoot(
  params: { sampleRecordId: string; mappingId: string; foot: Foot },
  userId: string
): Promise<{ mapping_id: string; barcode: string; foot: Foot }> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const mappingResult = await client.query(
      `SELECT sbm.*, cb.barcode AS child_barcode, cb.status AS box_status, cb.quantity,
              cb.left_dispatched_at, cb.right_dispatched_at
       FROM sample_box_mapping sbm
       JOIN child_boxes cb ON cb.id = sbm.child_box_id
       WHERE sbm.id = $1 AND sbm.sample_record_id = $2 AND sbm.is_active = true AND sbm.dispatch_record_id IS NULL
       FOR UPDATE OF sbm, cb`,
      [params.mappingId, params.sampleRecordId]
    );
    if (mappingResult.rows.length === 0) {
      throw new NotFoundError('This item is not currently open in this sample');
    }
    const mapping = mappingResult.rows[0];

    if (mapping.foot === params.foot) {
      await client.query('COMMIT');
      return { mapping_id: mapping.id, barcode: mapping.child_barcode, foot: mapping.foot };
    }

    const otherFeetResult = await client.query(
      `SELECT foot FROM sample_box_mapping WHERE child_box_id = $1 AND is_active = true AND dispatch_record_id IS NULL AND id <> $2`,
      [mapping.child_box_id, params.mappingId]
    );
    const otherFeet = otherFeetResult.rows.map((r: { foot: string }) => r.foot);
    assertFootAvailable(mapping.child_barcode, mapping, otherFeet, params.foot);

    try {
      await client.query(`UPDATE sample_box_mapping SET foot = $1, updated_at = NOW() WHERE id = $2`, [params.foot, params.mappingId]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new BadRequestError(`The ${params.foot.toLowerCase()} foot of box ${mapping.child_barcode} is already in another sample`);
      }
      throw err;
    }

    await client.query('COMMIT');
    await createAuditLog({
      userId, action: 'SET_SAMPLE_BOX_FOOT', entityType: 'sample_record', entityId: params.sampleRecordId,
      oldValues: { foot: mapping.foot }, newValues: { foot: params.foot, child_box_id: mapping.child_box_id },
    });
    logger.info(`Box ${mapping.child_barcode} foot changed ${mapping.foot} -> ${params.foot}`);
    return { mapping_id: mapping.id, barcode: mapping.child_barcode, foot: params.foot };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// clearSample — replaces fullUnpackSample. Releases every open loose mapping
// and every open carton allocation; no status to force (there is none).
// ---------------------------------------------------------------------------
export async function clearSample(
  sampleRecordId: string,
  userId: string
): Promise<{ released_boxes: number; released_cartons: number }> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const srResult = await client.query('SELECT * FROM sample_records WHERE id = $1 FOR UPDATE', [sampleRecordId]);
    if (srResult.rows.length === 0) {
      throw new NotFoundError('Sample record not found');
    }
    const sample = srResult.rows[0];

    const mappingsResult = await client.query(
      `SELECT sbm.*, cb.barcode AS child_barcode FROM sample_box_mapping sbm
       JOIN child_boxes cb ON cb.id = sbm.child_box_id
       WHERE sbm.sample_record_id = $1 AND sbm.is_active = true AND sbm.dispatch_record_id IS NULL
       FOR UPDATE OF sbm`,
      [sampleRecordId]
    );
    for (const mapping of mappingsResult.rows) {
      await deactivateLooseMapping(client, {
        mappingId: mapping.id, childBoxId: mapping.child_box_id, childBarcode: mapping.child_barcode,
        sampleRecordId, sampleBarcode: sample.sample_barcode, userId,
      });
    }

    const cartonsResult = await client.query(
      `SELECT master_carton_id FROM sample_carton_mapping WHERE sample_record_id = $1 AND is_active = true AND dispatch_record_id IS NULL FOR UPDATE`,
      [sampleRecordId]
    );
    for (const c of cartonsResult.rows as { master_carton_id: string }[]) {
      await releaseCartonFromSample(client, { sampleRecordId, masterCartonId: c.master_carton_id, userId });
    }

    await client.query('COMMIT');
    await createAuditLog({
      userId, action: 'CLEAR_SAMPLE', entityType: 'sample_record', entityId: sampleRecordId,
      newValues: { released_boxes: mappingsResult.rows.length, released_cartons: cartonsResult.rows.length },
    });
    logger.info(`Cleared sample ${sample.sample_barcode}: ${mappingsResult.rows.length} boxes + ${cartonsResult.rows.length} cartons released`);
    return { released_boxes: mappingsResult.rows.length, released_cartons: cartonsResult.rows.length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// deleteSampleRecord — hard delete an EMPTY record with no mapping history at
// all (open or historical). Workflow for a real mistake is clear -> delete.
// ---------------------------------------------------------------------------
export async function deleteSampleRecord(sampleRecordId: string, userId: string): Promise<void> {
  const srResult = await query('SELECT * FROM sample_records WHERE id = $1', [sampleRecordId]);
  if (srResult.rows.length === 0) {
    throw new NotFoundError('Sample record not found');
  }
  const hasMappings = await query(
    `SELECT
       EXISTS (SELECT 1 FROM sample_box_mapping WHERE sample_record_id = $1) AS has_box,
       EXISTS (SELECT 1 FROM sample_carton_mapping WHERE sample_record_id = $1) AS has_carton`,
    [sampleRecordId]
  );
  if (hasMappings.rows[0].has_box || hasMappings.rows[0].has_carton) {
    throw new BadRequestError('Cannot delete a sample record that has ever held any boxes or cartons — use Empty Sample first if it currently holds items');
  }
  await query('DELETE FROM sample_records WHERE id = $1', [sampleRecordId]);
  await createAuditLog({ userId, action: 'DELETE_SAMPLE', entityType: 'sample_record', entityId: sampleRecordId });
  logger.info(`Deleted empty sample record ${srResult.rows[0].sample_barcode}`);
}

// ---------------------------------------------------------------------------
// lookupSampleItem — read-only scan-to-check for the Dispatch screen's Sample
// panel. Resolution order: sample_records -> master_cartons -> child_boxes.
// ---------------------------------------------------------------------------
export async function lookupSampleItem(barcode: string): Promise<SampleLookupResult> {
  const resolved = await resolveChannelBarcode({ query }, barcode, { includeSampleRecords: true });

  if (resolved.item_type === 'SAMPLE_RECORD') {
    const sample = await getSampleById(resolved.id);
    return {
      kind: 'RECORD',
      sample_record_id: sample.id,
      sample_barcode: sample.sample_barcode,
      name: sample.name,
      open_item_count: sample.open_item_count ?? 0,
      items: sample.items,
    };
  }

  if (resolved.item_type === 'BOX') {
    const r = await query(
      `SELECT sbm.id AS mapping_id, sbm.sample_record_id, sr.sample_barcode, sbm.foot, cb.barcode
       FROM sample_box_mapping sbm
       JOIN sample_records sr ON sr.id = sbm.sample_record_id
       JOIN child_boxes cb ON cb.id = sbm.child_box_id
       WHERE cb.id = $1 AND sbm.is_active = true AND sbm.dispatch_record_id IS NULL`,
      [resolved.id]
    );
    if (r.rows.length === 0) {
      return { kind: 'ITEM', in_sample: false, reason: 'This box is not currently open in any sample', item_type: 'BOX', barcode: resolved.barcode };
    }
    // A box can have feet in more than one sample — return the first; caller
    // filters to the sample actually being dispatched.
    const row = r.rows[0];
    return {
      kind: 'ITEM', in_sample: true, item_type: 'BOX', mapping_id: row.mapping_id, barcode: row.barcode,
      child_box_id: resolved.id, master_carton_id: null, foot: row.foot, box_count: 1, pairs: 1,
      article_summary: null, colour_summary: null, size_summary: null, mrp: null,
      source_carton_barcode: null, added_at: new Date(), added_by_name: null,
      sample_record_id: row.sample_record_id, sample_barcode: row.sample_barcode,
    };
  }

  // CARTON
  const r = await query(
    `SELECT scm.id AS mapping_id, scm.sample_record_id, sr.sample_barcode, mc.carton_barcode
     FROM sample_carton_mapping scm
     JOIN sample_records sr ON sr.id = scm.sample_record_id
     JOIN master_cartons mc ON mc.id = scm.master_carton_id
     WHERE mc.id = $1 AND scm.is_active = true AND scm.dispatch_record_id IS NULL`,
    [resolved.id]
  );
  if (r.rows.length === 0) {
    return { kind: 'ITEM', in_sample: false, reason: 'This carton is not currently reserved in any sample', item_type: 'CARTON', barcode: resolved.barcode };
  }
  const row = r.rows[0];
  return {
    kind: 'ITEM', in_sample: true, item_type: 'CARTON', mapping_id: row.mapping_id, barcode: row.carton_barcode,
    child_box_id: null, master_carton_id: resolved.id, foot: 'PAIR', box_count: 0, pairs: 0,
    article_summary: null, colour_summary: null, size_summary: null, mrp: null,
    source_carton_barcode: null, added_at: new Date(), added_by_name: null,
    sample_record_id: row.sample_record_id, sample_barcode: row.sample_barcode,
  };
}
