import { query, getClient } from '../config/database';
import { MASTER_CARTON_STATUS, CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { assertCartonAllocatable } from './sample.service';
import { EcommerceListQuery, PoolItemActionInput, PoolListQuery } from '../models/schemas/ecommerce.schema';
import { logger } from '../utils/logger';

type QueryExecutor = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[] }> };

// ---------------------------------------------------------------------------
// resolvePoolBarcode — identifies a scanned barcode as either a master carton
// or a child box, purely by DB lookup (master_cartons first, then
// child_boxes). NEVER branch on barcode prefix — legacy `BINNY-CB-{uuid}`
// child box codes exist alongside the current short-format ones, so prefix
// sniffing would misclassify them.
// ---------------------------------------------------------------------------
async function resolvePoolBarcode(
  exec: QueryExecutor,
  barcode: string
): Promise<{ item_type: 'BOX' | 'CARTON'; id: string; barcode: string }> {
  const upper = barcode.trim().toUpperCase();

  const mcResult = await exec.query(
    'SELECT id, carton_barcode FROM master_cartons WHERE carton_barcode = UPPER($1)',
    [upper]
  );
  if (mcResult.rows.length > 0) {
    return { item_type: 'CARTON', id: mcResult.rows[0].id, barcode: mcResult.rows[0].carton_barcode };
  }

  const cbResult = await exec.query(
    `SELECT cb.id, cb.barcode FROM child_boxes cb JOIN products p ON p.id = cb.product_id WHERE cb.barcode = UPPER($1)`,
    [upper]
  );
  if (cbResult.rows.length > 0) {
    return { item_type: 'BOX', id: cbResult.rows[0].id, barcode: cbResult.rows[0].barcode };
  }

  throw new NotFoundError(`No child box or master carton found with barcode ${upper}`);
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
       FROM (
         SELECT cb.id FROM ecommerce_box_mapping ebm JOIN child_boxes cb ON cb.id = ebm.child_box_id
         WHERE ebm.ecommerce_record_id = er.id AND ebm.is_active = true
         UNION ALL
         SELECT cb.id FROM ecommerce_carton_mapping ecm
         JOIN carton_child_mapping ccm ON ccm.master_carton_id = ecm.master_carton_id AND ccm.is_active = true
         JOIN child_boxes cb ON cb.id = ccm.child_box_id
         WHERE ecm.ecommerce_record_id = er.id AND ecm.is_active = true
       ) src_boxes
       JOIN child_boxes cb ON cb.id = src_boxes.id
       JOIN products p ON p.id = cb.product_id
     ) ps ON true
     ${whereClause}
     ORDER BY er.created_at DESC, er.id
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

// ---------------------------------------------------------------------------
// getEcommerceSummary — aggregate status counts + total boxes for the stat
// cards on the e-commerce list page.
// ---------------------------------------------------------------------------
export interface EcommerceSummary {
  total: number;
  created: number;
  active: number;
  closed: number;
  dispatched: number;
  totalBoxes: number;
}

export async function getEcommerceSummary(): Promise<EcommerceSummary> {
  const result = await query(`
    SELECT
      COUNT(*)::int                                        AS total,
      COUNT(*) FILTER (WHERE status = 'CREATED')::int      AS created,
      COUNT(*) FILTER (WHERE status = 'ACTIVE')::int       AS active,
      COUNT(*) FILTER (WHERE status = 'CLOSED')::int       AS closed,
      COUNT(*) FILTER (WHERE status = 'DISPATCHED')::int   AS dispatched,
      COALESCE(SUM(child_count), 0)::int                   AS total_boxes
    FROM ecommerce_records
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
// getEcommerceChildren
// ---------------------------------------------------------------------------
export async function getEcommerceChildren(ecommerceId: string): Promise<Record<string, unknown>[]> {
  // Union loose boxes (ecommerce_box_mapping) with boxes reached through whole-carton
  // allocations (ecommerce_carton_mapping -> carton_child_mapping). Carton-sourced boxes
  // stay PACKED (the carton is never emptied).
  const result = await query(
    `SELECT ebm.id, ebm.ecommerce_record_id, ebm.child_box_id, ebm.is_active,
            ebm.mapped_at, ebm.unmapped_at, ebm.mapped_by, ebm.unmapped_by,
            ebm.created_at, ebm.updated_at,
            cb.barcode, cb.status, cb.quantity,
            p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp,
            'loose'::text AS source, NULL::varchar(100) AS carton_barcode
     FROM ecommerce_box_mapping ebm
     JOIN child_boxes cb ON cb.id = ebm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE ebm.ecommerce_record_id = $1 AND ebm.is_active = true

     UNION ALL

     SELECT ccm.id, ecm.ecommerce_record_id, ccm.child_box_id, ccm.is_active,
            ccm.packed_at AS mapped_at, ccm.unpacked_at AS unmapped_at,
            ccm.packed_by AS mapped_by, ccm.unpacked_by AS unmapped_by,
            ccm.created_at, ccm.updated_at,
            cb.barcode, cb.status, cb.quantity,
            p.article_name, p.article_code, p.sku, p.size, p.colour, p.mrp,
            'carton'::text AS source, mc.carton_barcode
     FROM ecommerce_carton_mapping ecm
     JOIN carton_child_mapping ccm ON ccm.master_carton_id = ecm.master_carton_id AND ccm.is_active = true
     JOIN master_cartons mc ON mc.id = ecm.master_carton_id
     JOIN child_boxes cb ON cb.id = ccm.child_box_id
     JOIN products p ON p.id = cb.product_id
     WHERE ecm.ecommerce_record_id = $1 AND ecm.is_active = true

     ORDER BY mapped_at DESC`,
    [ecommerceId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// getEcommerceStockSummary — per-product stock split into ALLOCATED (boxes
// currently mapped to e-commerce) vs AVAILABLE (free/unassigned boxes).
// ---------------------------------------------------------------------------
export async function getEcommerceStockSummary(): Promise<Record<string, unknown>[]> {
  // "Allocated" = boxes mapped loose (status ECOMMERCE) PLUS boxes reached through a
  // whole-carton allocation (ecommerce_carton_mapping) — those stay PACKED status since
  // the carton is never emptied, so a plain cb.status filter would miss them.
  const result = await query(
    `WITH allocated AS (
       SELECT cb.id, cb.product_id, cb.quantity
       FROM ecommerce_box_mapping ebm
       JOIN child_boxes cb ON cb.id = ebm.child_box_id
       WHERE ebm.is_active = true AND cb.status = $1
       UNION ALL
       SELECT cb.id, cb.product_id, cb.quantity
       FROM ecommerce_carton_mapping ecm
       JOIN carton_child_mapping ccm ON ccm.master_carton_id = ecm.master_carton_id AND ccm.is_active = true
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       WHERE ecm.is_active = true
     )
     SELECT p.id AS product_id, p.article_name, p.colour, p.size, p.sku, p.mrp,
            COALESCE(a.cnt, 0)::int AS allocated_boxes,
            COALESCE(a.pairs, 0)::int AS allocated_pairs,
            COALESCE(av.cnt, 0)::int AS available_boxes,
            COALESCE(av.pairs, 0)::int AS available_pairs
     FROM products p
     LEFT JOIN (
       SELECT product_id, COUNT(*)::int AS cnt, SUM(quantity)::int AS pairs
       FROM allocated GROUP BY product_id
     ) a ON a.product_id = p.id
     LEFT JOIN (
       SELECT cb.product_id, COUNT(*)::int AS cnt, SUM(cb.quantity)::int AS pairs
       FROM child_boxes cb WHERE cb.status IN ($2, $3) GROUP BY cb.product_id
     ) av ON av.product_id = p.id
     WHERE COALESCE(a.cnt, 0) > 0 OR COALESCE(av.cnt, 0) > 0
     ORDER BY p.article_name, p.colour, p.size`,
    [CHILD_BOX_STATUS.ECOMMERCE, CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.GENERATED]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// getEcommerceCartons — mapped (allocated) cartons for an e-commerce record,
// with a per-carton product summary, for the detail-page "cartons" section.
// ---------------------------------------------------------------------------
export async function getEcommerceCartons(ecommerceId: string): Promise<Record<string, unknown>[]> {
  const result = await query(
    `SELECT
       ecm.id AS mapping_id, ecm.mapped_at, ecm.mapped_by,
       mc.id AS master_carton_id, mc.carton_barcode, mc.status, mc.child_count,
       ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp_summary
     FROM ecommerce_carton_mapping ecm
     JOIN master_cartons mc ON mc.id = ecm.master_carton_id
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
     WHERE ecm.ecommerce_record_id = $1 AND ecm.is_active = true
     ORDER BY ecm.mapped_at DESC`,
    [ecommerceId]
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// getEcommerceByBarcode
// ---------------------------------------------------------------------------
export async function getEcommerceByBarcode(
  barcode: string
): Promise<Record<string, unknown>> {
  const result = await query('SELECT * FROM ecommerce_records WHERE ecommerce_barcode = UPPER($1)', [barcode]);
  if (result.rows.length === 0) {
    throw new NotFoundError('E-commerce record not found');
  }
  const record = result.rows[0];
  const children = await getEcommerceChildren(record.id as string);
  return { ...record, child_boxes: children };
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
     FROM (
       SELECT cb.id AS child_box_id FROM ecommerce_box_mapping ebm
       JOIN child_boxes cb ON cb.id = ebm.child_box_id
       WHERE ebm.ecommerce_record_id = $1 AND ebm.is_active = true
       UNION ALL
       SELECT cb.id AS child_box_id FROM ecommerce_carton_mapping ecm
       JOIN carton_child_mapping ccm ON ccm.master_carton_id = ecm.master_carton_id AND ccm.is_active = true
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       WHERE ecm.ecommerce_record_id = $1 AND ecm.is_active = true
     ) src_boxes
     JOIN child_boxes cb ON cb.id = src_boxes.child_box_id
     JOIN products p ON p.id = cb.product_id
     GROUP BY p.article_name, p.colour, p.size, p.mrp
     ORDER BY p.article_name, p.colour, p.size`,
    [ecommerceId]
  );

  return result.rows;
}

// ===========================================================================
// E-commerce pool — the redesigned workflow. Loose boxes / whole cartons sit
// in an unordered "E-commerce Area" pool (no parent record) until they are
// dispatched. Canonical "is this in the pool" predicate:
//   Loose box:      ebm.is_active = true AND ebm.dispatch_record_id IS NULL AND cb.status = 'ECOMMERCE'
//   Whole carton:   ecm.is_active = true AND ecm.dispatch_record_id IS NULL AND mc.status <> 'DISPATCHED'
// ===========================================================================

// ---------------------------------------------------------------------------
// addToEcommercePool — scan a barcode (loose FREE/GENERATED box, or an intact
// whole carton) into the E-commerce Area pool.
// ---------------------------------------------------------------------------
export async function addToEcommercePool(
  barcode: string,
  userId: string
): Promise<{ item_type: 'BOX' | 'CARTON'; barcode: string; boxes_added: number; mapping_id: string }> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const resolved = await resolvePoolBarcode(client, barcode);

    if (resolved.item_type === 'CARTON') {
      const mcResult = await client.query('SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE', [resolved.id]);
      const carton = mcResult.rows[0];

      if (carton.status === MASTER_CARTON_STATUS.DISPATCHED) {
        throw new BadRequestError(`Master carton ${carton.carton_barcode} has already been dispatched`);
      }
      if (carton.child_count === 0) {
        throw new BadRequestError(`Master carton ${carton.carton_barcode} is empty and cannot be added to the E-commerce Area`);
      }

      const existingResult = await client.query(
        `SELECT 1 FROM ecommerce_carton_mapping
         WHERE master_carton_id = $1 AND is_active = true AND dispatch_record_id IS NULL`,
        [carton.id]
      );
      if (existingResult.rows.length > 0) {
        throw new BadRequestError(`Master carton ${carton.carton_barcode} is already in the E-commerce Area`);
      }

      // Reject cartons currently allocated to a sample (or, defensively, another
      // active e-commerce allocation) — must be checked AFTER the pool-membership
      // check above so the "already in the E-commerce Area" message wins for that case.
      await assertCartonAllocatable(client, carton.id, carton.carton_barcode);

      const mappingResult = await client.query(
        `INSERT INTO ecommerce_carton_mapping (ecommerce_record_id, master_carton_id, mapped_by)
         VALUES (NULL, $1, $2) RETURNING id`,
        [carton.id, userId]
      );

      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CARTON_ECOMMERCED, carton.id, userId,
          `Carton ${carton.carton_barcode} (intact, ${carton.child_count} boxes) added to the E-commerce Area`,
          JSON.stringify({ pool: true, child_count: carton.child_count }),
        ]
      );

      await client.query('COMMIT');

      await createAuditLog({
        userId,
        action: 'ADD_TO_ECOMMERCE_POOL',
        entityType: 'ecommerce_carton_mapping',
        entityId: mappingResult.rows[0].id,
        newValues: { master_carton_id: carton.id, carton_barcode: carton.carton_barcode, child_count: carton.child_count },
      });

      logger.info(`Carton ${carton.carton_barcode} added to the E-commerce Area pool (${carton.child_count} boxes)`);
      return {
        item_type: 'CARTON',
        barcode: carton.carton_barcode,
        boxes_added: carton.child_count,
        mapping_id: mappingResult.rows[0].id,
      };
    }

    // BOX
    const cbResult = await client.query('SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE', [resolved.id]);
    const childBox = cbResult.rows[0];

    if (childBox.status === CHILD_BOX_STATUS.PACKED) {
      const ccmResult = await client.query(
        `SELECT mc.carton_barcode FROM carton_child_mapping ccm
         JOIN master_cartons mc ON mc.id = ccm.master_carton_id
         WHERE ccm.child_box_id = $1 AND ccm.is_active = true LIMIT 1`,
        [childBox.id]
      );
      const inCarton = ccmResult.rows[0]?.carton_barcode as string | undefined;
      throw new BadRequestError(
        inCarton
          ? `Child box ${childBox.barcode} is packed inside master carton ${inCarton}. Scan the carton instead.`
          : `Child box ${childBox.barcode} is marked PACKED but has no active carton mapping (data inconsistency) — unpack/repack it before adding to the E-commerce Area.`
      );
    }
    if (childBox.status === CHILD_BOX_STATUS.ECOMMERCE) {
      throw new BadRequestError(`Child box ${childBox.barcode} is already in the E-commerce Area`);
    }
    if (childBox.status === CHILD_BOX_STATUS.SAMPLE) {
      throw new BadRequestError(`Child box ${childBox.barcode} is allocated to a sample`);
    }
    if (childBox.status === CHILD_BOX_STATUS.DISPATCHED) {
      throw new BadRequestError(`Child box ${childBox.barcode} has already been dispatched`);
    }

    // Auto-activate GENERATED boxes, then fall through to the FREE handling below.
    if (childBox.status === CHILD_BOX_STATUS.GENERATED) {
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [
          TRANSACTION_TYPES.CHILD_ACTIVATED, childBox.id, userId,
          `Child box ${childBox.barcode} auto-activated (implicit activation during add to the E-commerce Area)`,
        ]
      );
    }

    await client.query(
      `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
      [CHILD_BOX_STATUS.ECOMMERCE, childBox.id]
    );

    const mappingResult = await client.query(
      `INSERT INTO ecommerce_box_mapping (ecommerce_record_id, child_box_id, mapped_by)
       VALUES (NULL, $1, $2) RETURNING id`,
      [childBox.id, userId]
    );

    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TRANSACTION_TYPES.CHILD_ECOMMERCED, childBox.id, userId,
        `Added child box ${childBox.barcode} to the E-commerce Area`,
        JSON.stringify({ pool: true }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId,
      action: 'ADD_TO_ECOMMERCE_POOL',
      entityType: 'ecommerce_box_mapping',
      entityId: mappingResult.rows[0].id,
      newValues: { child_box_id: childBox.id, barcode: childBox.barcode },
    });

    logger.info(`Child box ${childBox.barcode} added to the E-commerce Area pool`);
    return { item_type: 'BOX', barcode: childBox.barcode, boxes_added: 1, mapping_id: mappingResult.rows[0].id };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// getEcommercePool — paginated list of everything currently sitting in the
// E-commerce Area (loose boxes + whole cartons), uniform row shape.
// ---------------------------------------------------------------------------
export async function getEcommercePool(
  filters: PoolListQuery
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const { page = 1, limit = 50, search, item_type } = filters;

  const baseUnion = `
    SELECT
      'BOX'::text AS item_type, ebm.id AS mapping_id, cb.barcode AS barcode,
      1::int AS box_count, cb.quantity::int AS pairs,
      p.article_name AS article_summary, p.colour AS colour_summary, p.size AS size_summary, p.mrp AS mrp,
      smc.carton_barcode AS source_carton_barcode, er.ecommerce_barcode AS legacy_record_barcode,
      ebm.mapped_at AS added_at, u.name AS added_by_name
    FROM ecommerce_box_mapping ebm
    JOIN child_boxes cb ON cb.id = ebm.child_box_id
    JOIN products p ON p.id = cb.product_id
    LEFT JOIN master_cartons smc ON smc.id = ebm.source_master_carton_id
    LEFT JOIN ecommerce_records er ON er.id = ebm.ecommerce_record_id
    LEFT JOIN users u ON u.id = ebm.mapped_by
    WHERE ebm.is_active = true AND ebm.dispatch_record_id IS NULL AND cb.status = 'ECOMMERCE'

    UNION ALL

    SELECT
      'CARTON'::text AS item_type, ecm.id AS mapping_id, mc.carton_barcode AS barcode,
      COALESCE(ps.box_count, 0)::int AS box_count, COALESCE(ps.pairs, 0)::int AS pairs,
      ps.article_summary, ps.colour_summary, ps.size_summary, ps.mrp,
      NULL::varchar(100) AS source_carton_barcode, er.ecommerce_barcode AS legacy_record_barcode,
      ecm.mapped_at AS added_at, u.name AS added_by_name
    FROM ecommerce_carton_mapping ecm
    JOIN master_cartons mc ON mc.id = ecm.master_carton_id
    LEFT JOIN ecommerce_records er ON er.id = ecm.ecommerce_record_id
    LEFT JOIN users u ON u.id = ecm.mapped_by
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS box_count, COALESCE(SUM(cb.quantity), 0)::int AS pairs,
        string_agg(DISTINCT p.article_name, ', ') AS article_summary,
        string_agg(DISTINCT p.colour, ', ') AS colour_summary,
        string_agg(DISTINCT p.size, ', ') AS size_summary,
        MIN(p.mrp) AS mrp
      FROM carton_child_mapping ccm
      JOIN child_boxes cb ON cb.id = ccm.child_box_id
      JOIN products p ON p.id = cb.product_id
      WHERE ccm.master_carton_id = mc.id AND ccm.is_active = true
    ) ps ON true
    WHERE ecm.is_active = true AND ecm.dispatch_record_id IS NULL AND mc.status <> 'DISPATCHED'
  `;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (item_type) {
    conditions.push(`pool.item_type = $${paramIndex++}`);
    values.push(item_type);
  }
  if (search) {
    conditions.push(`(pool.barcode ILIKE $${paramIndex} OR pool.article_summary ILIKE $${paramIndex})`);
    values.push(`%${search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM (${baseUnion}) pool ${whereClause}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  const limitParamIndex = paramIndex;
  const offsetParamIndex = paramIndex + 1;
  values.push(limit, offset);

  const result = await query(
    `SELECT * FROM (${baseUnion}) pool
     ${whereClause}
     ORDER BY pool.added_at DESC
     LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
    values
  );

  return { data: result.rows, total };
}

// ---------------------------------------------------------------------------
// getEcommercePoolSummary — stat-card counts for the pool.
// ---------------------------------------------------------------------------
export async function getEcommercePoolSummary(): Promise<{
  carton_items: number;
  box_items: number;
  total_items: number;
  total_boxes: number;
  total_pairs: number;
}> {
  const result = await query(`
    WITH pool AS (
      SELECT 'BOX'::text AS item_type, 1::int AS box_count, cb.quantity::int AS pairs
      FROM ecommerce_box_mapping ebm
      JOIN child_boxes cb ON cb.id = ebm.child_box_id
      WHERE ebm.is_active = true AND ebm.dispatch_record_id IS NULL AND cb.status = 'ECOMMERCE'
      UNION ALL
      SELECT 'CARTON'::text AS item_type, COALESCE(ps.box_count, 0)::int AS box_count, COALESCE(ps.pairs, 0)::int AS pairs
      FROM ecommerce_carton_mapping ecm
      JOIN master_cartons mc ON mc.id = ecm.master_carton_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS box_count, COALESCE(SUM(cb.quantity), 0)::int AS pairs
        FROM carton_child_mapping ccm
        JOIN child_boxes cb ON cb.id = ccm.child_box_id
        WHERE ccm.master_carton_id = mc.id AND ccm.is_active = true
      ) ps ON true
      WHERE ecm.is_active = true AND ecm.dispatch_record_id IS NULL AND mc.status <> 'DISPATCHED'
    )
    SELECT
      COUNT(*) FILTER (WHERE item_type = 'CARTON')::int AS carton_items,
      COUNT(*) FILTER (WHERE item_type = 'BOX')::int AS box_items,
      COUNT(*)::int AS total_items,
      COALESCE(SUM(box_count), 0)::int AS total_boxes,
      COALESCE(SUM(pairs), 0)::int AS total_pairs
    FROM pool
  `);
  const row = result.rows[0];
  return {
    carton_items: row.carton_items,
    box_items: row.box_items,
    total_items: row.total_items,
    total_boxes: row.total_boxes,
    total_pairs: row.total_pairs,
  };
}

// ---------------------------------------------------------------------------
// lookupEcommercePoolItem — read-only scan-to-check for the dispatch UI. Never
// throws for a known-but-ineligible barcode; only a totally unknown barcode
// 404s (via resolvePoolBarcode).
// ---------------------------------------------------------------------------
export async function lookupEcommercePoolItem(barcode: string): Promise<Record<string, unknown>> {
  const resolved = await resolvePoolBarcode({ query }, barcode);

  if (resolved.item_type === 'CARTON') {
    const mcResult = await query('SELECT * FROM master_cartons WHERE id = $1', [resolved.id]);
    const carton = mcResult.rows[0];

    if (carton.status === MASTER_CARTON_STATUS.DISPATCHED) {
      return {
        in_pool: false,
        reason: `Master carton ${carton.carton_barcode} has already been dispatched`,
        item_type: 'CARTON',
        barcode: carton.carton_barcode,
      };
    }

    const poolResult = await query(
      `SELECT id AS mapping_id FROM ecommerce_carton_mapping
       WHERE master_carton_id = $1 AND is_active = true AND dispatch_record_id IS NULL`,
      [carton.id]
    );
    if (poolResult.rows.length === 0) {
      const sampleHit = await query(
        'SELECT 1 FROM sample_carton_mapping WHERE master_carton_id = $1 AND is_active = true',
        [carton.id]
      );
      if (sampleHit.rows.length > 0) {
        return {
          in_pool: false,
          reason: `Master carton ${carton.carton_barcode} is allocated to a sample`,
          item_type: 'CARTON',
          barcode: carton.carton_barcode,
        };
      }
      return {
        in_pool: false,
        reason: `Master carton ${carton.carton_barcode} is not in the E-commerce Area`,
        item_type: 'CARTON',
        barcode: carton.carton_barcode,
      };
    }

    const summaryResult = await query(
      `SELECT
         COUNT(*)::int AS box_count, COALESCE(SUM(cb.quantity), 0)::int AS pairs,
         string_agg(DISTINCT p.article_name, ', ') AS article_summary,
         string_agg(DISTINCT p.colour, ', ') AS colour_summary,
         string_agg(DISTINCT p.size, ', ') AS size_summary,
         MIN(p.mrp) AS mrp
       FROM carton_child_mapping ccm
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       JOIN products p ON p.id = cb.product_id
       WHERE ccm.master_carton_id = $1 AND ccm.is_active = true`,
      [carton.id]
    );
    const s = summaryResult.rows[0];
    return {
      in_pool: true,
      item_type: 'CARTON',
      mapping_id: poolResult.rows[0].mapping_id,
      barcode: carton.carton_barcode,
      box_count: s.box_count,
      pairs: s.pairs,
      article_summary: s.article_summary,
      colour_summary: s.colour_summary,
      size_summary: s.size_summary,
      mrp: s.mrp !== null ? Number(s.mrp) : null,
    };
  }

  // BOX
  const cbResult = await query(
    `SELECT cb.*, p.article_name, p.colour, p.size, p.mrp
     FROM child_boxes cb JOIN products p ON p.id = cb.product_id
     WHERE cb.id = $1`,
    [resolved.id]
  );
  const box = cbResult.rows[0];

  if (box.status === CHILD_BOX_STATUS.DISPATCHED) {
    return { in_pool: false, reason: `Child box ${box.barcode} has already been dispatched`, item_type: 'BOX', barcode: box.barcode };
  }
  if (box.status === CHILD_BOX_STATUS.SAMPLE) {
    return { in_pool: false, reason: `Child box ${box.barcode} is allocated to a sample`, item_type: 'BOX', barcode: box.barcode };
  }
  if (box.status !== CHILD_BOX_STATUS.ECOMMERCE) {
    return { in_pool: false, reason: `Child box ${box.barcode} is not in the E-commerce Area`, item_type: 'BOX', barcode: box.barcode };
  }

  const mappingResult = await query(
    `SELECT id FROM ecommerce_box_mapping WHERE child_box_id = $1 AND is_active = true AND dispatch_record_id IS NULL`,
    [box.id]
  );
  if (mappingResult.rows.length === 0) {
    return { in_pool: false, reason: `Child box ${box.barcode} is not in the E-commerce Area`, item_type: 'BOX', barcode: box.barcode };
  }

  return {
    in_pool: true,
    item_type: 'BOX',
    mapping_id: mappingResult.rows[0].id,
    barcode: box.barcode,
    box_count: 1,
    pairs: box.quantity,
    article_summary: box.article_name,
    colour_summary: box.colour,
    size_summary: box.size,
    mrp: box.mrp !== null ? Number(box.mrp) : null,
  };
}

// ---------------------------------------------------------------------------
// removeFromEcommercePool — take a loose box or whole carton back out of the
// E-commerce Area to main stock. Box -> FREE. Carton -> mapping deactivated
// only; its boxes stay PACKED (the carton was never emptied).
// ---------------------------------------------------------------------------
export async function removeFromEcommercePool(
  input: PoolItemActionInput,
  userId: string
): Promise<{ item_type: 'BOX' | 'CARTON'; barcode: string }> {
  const { item_type, mapping_id } = input;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    if (item_type === 'BOX') {
      const mappingResult = await client.query(
        'SELECT * FROM ecommerce_box_mapping WHERE id = $1 FOR UPDATE',
        [mapping_id]
      );
      if (mappingResult.rows.length === 0) {
        throw new NotFoundError('E-commerce pool mapping not found');
      }
      const mapping = mappingResult.rows[0];
      if (!mapping.is_active || mapping.dispatch_record_id !== null) {
        throw new BadRequestError('This item has already left the E-commerce Area');
      }

      const cbResult = await client.query('SELECT * FROM child_boxes WHERE id = $1 FOR UPDATE', [mapping.child_box_id]);
      const childBox = cbResult.rows[0];

      await client.query(
        `UPDATE ecommerce_box_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1 WHERE id = $2`,
        [userId, mapping.id]
      );
      await client.query(
        `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
        [CHILD_BOX_STATUS.FREE, childBox.id]
      );
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          TRANSACTION_TYPES.CHILD_UNECOMMERCED, childBox.id, userId,
          `Removed child box ${childBox.barcode} from the E-commerce Area`,
          JSON.stringify({ pool: true }),
        ]
      );

      await client.query('COMMIT');

      await createAuditLog({
        userId,
        action: 'REMOVE_FROM_ECOMMERCE_POOL',
        entityType: 'ecommerce_box_mapping',
        entityId: mapping.id,
        newValues: { child_box_id: childBox.id, barcode: childBox.barcode },
      });

      logger.info(`Removed child box ${childBox.barcode} from the E-commerce Area pool`);
      return { item_type: 'BOX', barcode: childBox.barcode };
    }

    // CARTON
    const mappingResult = await client.query(
      'SELECT * FROM ecommerce_carton_mapping WHERE id = $1 FOR UPDATE',
      [mapping_id]
    );
    if (mappingResult.rows.length === 0) {
      throw new NotFoundError('E-commerce pool mapping not found');
    }
    const mapping = mappingResult.rows[0];
    if (!mapping.is_active || mapping.dispatch_record_id !== null) {
      throw new BadRequestError('This item has already left the E-commerce Area');
    }

    const mcResult = await client.query('SELECT * FROM master_cartons WHERE id = $1 FOR UPDATE', [mapping.master_carton_id]);
    const carton = mcResult.rows[0];

    await client.query(
      `UPDATE ecommerce_carton_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1 WHERE id = $2`,
      [userId, mapping.id]
    );
    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TRANSACTION_TYPES.CARTON_UNECOMMERCED, carton.id, userId,
        `Removed carton ${carton.carton_barcode} from the E-commerce Area (boxes stay packed)`,
        JSON.stringify({ pool: true }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId,
      action: 'REMOVE_FROM_ECOMMERCE_POOL',
      entityType: 'ecommerce_carton_mapping',
      entityId: mapping.id,
      newValues: { master_carton_id: carton.id, carton_barcode: carton.carton_barcode },
    });

    logger.info(`Removed carton ${carton.carton_barcode} from the E-commerce Area pool`);
    return { item_type: 'CARTON', barcode: carton.carton_barcode };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// unpackCartonInEcommercePool — break a whole pooled carton into individually
// dispatchable loose boxes. Unlike masterCarton.service.ts#fullUnpackMasterCarton,
// the boxes land in ECOMMERCE (not FREE) — the stock stays committed to
// e-commerce, it just stops being "one indivisible carton".
// ---------------------------------------------------------------------------
export async function unpackCartonInEcommercePool(
  mappingId: string,
  performedBy: string
): Promise<{ master_carton_id: string; carton_barcode: string; boxes_unpacked: number }> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const lockResult = await client.query(
      `SELECT ecm.*, mc.id AS carton_id, mc.carton_barcode, mc.status, mc.child_count, mc.is_legacy
       FROM ecommerce_carton_mapping ecm
       JOIN master_cartons mc ON mc.id = ecm.master_carton_id
       WHERE ecm.id = $1
       FOR UPDATE OF ecm, mc`,
      [mappingId]
    );
    if (lockResult.rows.length === 0) {
      throw new NotFoundError('E-commerce pool mapping not found');
    }
    const row = lockResult.rows[0];

    if (!row.is_active || row.dispatch_record_id !== null) {
      throw new BadRequestError('This carton is no longer in the E-commerce Area');
    }
    if (row.status === MASTER_CARTON_STATUS.DISPATCHED) {
      throw new BadRequestError(`Master carton ${row.carton_barcode} has already been dispatched`);
    }
    if (row.is_legacy) {
      throw new BadRequestError(
        `Master carton ${row.carton_barcode} is a legacy carton with no tracked boxes. Open it for repacking first.`
      );
    }

    const contentsResult = await client.query(
      `SELECT ccm.id AS ccm_id, ccm.child_box_id, cb.barcode, cb.status
       FROM carton_child_mapping ccm
       JOIN child_boxes cb ON cb.id = ccm.child_box_id
       WHERE ccm.master_carton_id = $1 AND ccm.is_active = true
       FOR UPDATE OF ccm, cb`,
      [row.carton_id]
    );
    if (contentsResult.rows.length === 0) {
      throw new BadRequestError(`Master carton ${row.carton_barcode} has no boxes to unpack`);
    }
    const inconsistentBox = (contentsResult.rows as { barcode: string; status: string }[]).find(
      (r) => r.status !== CHILD_BOX_STATUS.PACKED
    );
    if (inconsistentBox) {
      throw new BadRequestError(
        `Child box ${inconsistentBox.barcode} in carton ${row.carton_barcode} is ${inconsistentBox.status}, not PACKED (data inconsistency) — cannot unpack`
      );
    }

    for (const box of contentsResult.rows as { ccm_id: string; child_box_id: string; barcode: string }[]) {
      await client.query(
        `UPDATE carton_child_mapping SET is_active = false, unpacked_at = NOW(), unpacked_by = $1 WHERE id = $2`,
        [performedBy, box.ccm_id]
      );
      await client.query(
        `UPDATE child_boxes SET status = $1, updated_at = NOW() WHERE id = $2`,
        [CHILD_BOX_STATUS.ECOMMERCE, box.child_box_id]
      );
      await client.query(
        `INSERT INTO ecommerce_box_mapping (ecommerce_record_id, child_box_id, mapped_by, source_master_carton_id)
         VALUES (NULL, $1, $2, $3)`,
        [box.child_box_id, performedBy, row.carton_id]
      );
      await client.query(
        `INSERT INTO inventory_transactions (transaction_type, child_box_id, master_carton_id, performed_by, notes, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          TRANSACTION_TYPES.CHILD_UNPACKED, box.child_box_id, row.carton_id, performedBy,
          `Unpacked box ${box.barcode} out of carton ${row.carton_barcode} into the E-commerce Area (stays in e-commerce)`,
          JSON.stringify({ ecommerce_pool: true }),
        ]
      );
    }

    await client.query(
      `UPDATE ecommerce_carton_mapping SET is_active = false, unmapped_at = NOW(), unmapped_by = $1 WHERE id = $2`,
      [performedBy, mappingId]
    );

    await client.query(
      `UPDATE master_cartons
       SET child_count = 0, status = $1, unpacked_at = NOW(), unpacked_by = $2, updated_at = NOW()
       WHERE id = $3`,
      [MASTER_CARTON_STATUS.CREATED, performedBy, row.carton_id]
    );

    await client.query(
      `INSERT INTO inventory_transactions (transaction_type, master_carton_id, performed_by, notes, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        TRANSACTION_TYPES.CARTON_UNPACKED_TO_ECOM_POOL, row.carton_id, performedBy,
        `Carton ${row.carton_barcode} unpacked into ${contentsResult.rows.length} loose boxes in the E-commerce Area`,
        JSON.stringify({ box_count: contentsResult.rows.length, ecommerce_carton_mapping_id: mappingId }),
      ]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId: performedBy,
      action: 'UNPACK_CARTON_IN_ECOMMERCE_POOL',
      entityType: 'master_carton',
      entityId: row.carton_id,
      newValues: { box_count: contentsResult.rows.length },
    });

    logger.info(`Unpacked carton ${row.carton_barcode} into the E-commerce Area pool: ${contentsResult.rows.length} boxes`);
    return {
      master_carton_id: row.carton_id,
      carton_barcode: row.carton_barcode,
      boxes_unpacked: contentsResult.rows.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
