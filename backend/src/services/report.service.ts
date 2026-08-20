import { query } from '../config/database';
import { CHILD_BOX_STATUS, TRANSACTION_TYPES, SAMPLE_STATUS, SampleStatus } from '../config/constants';
import { getEcommercePoolSummary } from './ecommerce.service';

export interface InventorySummaryReport {
  totalProducts: number;
  totalChildBoxes: number;
  totalMasterCartons: number;
  totalPairsInStock: number;
  totalPairsDispatched: number;
  childBoxesByStatus: Record<string, number>;
  masterCartonsByStatus: Record<string, number>;
}

export interface ProductWiseReport {
  product_id: string;
  product_name: string;
  product_sku: string;
  size: string;
  colour: string;
  total_child_boxes: number;
  free_boxes: number;
  packed_boxes: number;
  sample_boxes: number;
  ecommerce_boxes: number;
  dispatched_boxes: number;
  total_pairs: number;
  pairs_in_stock: number;
  pairs_dispatched: number;
}

export interface CustomerDispatchItem {
  article_name: string;
  colour: string;
  sizes: string;
  mrp: number;
  carton_count: number;
  box_count: number;
}

export interface CustomerDispatchGroup {
  customer_id: string | null;
  customer_name: string;
  total_cartons: number;
  total_dispatches: number;
  dispatch_dates: string[];
  destinations: string[];
  items: CustomerDispatchItem[];
}

export interface DispatchSummaryReport {
  total_dispatches: number;
  total_cartons_dispatched: number;
  by_customer: CustomerDispatchGroup[];
}

export interface DailyActivityReport {
  date: string;
  boxes_created: number;
  boxes_packed: number;
  boxes_unpacked: number;
  boxes_dispatched: number;
  cartons_created: number;
  cartons_closed: number;
  cartons_dispatched: number;
}

export async function getInventorySummary(): Promise<InventorySummaryReport> {
  const [productCount, cbStats, mcStats, pairsInStock, pairsDispatched] = await Promise.all([
    query('SELECT COUNT(*) as total FROM products WHERE is_active = true'),
    query(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(quantity), 0) as pairs
      FROM child_boxes
      GROUP BY status
    `),
    query(`
      SELECT status, COUNT(*) as count
      FROM master_cartons
      GROUP BY status
    `),
    query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM child_boxes WHERE status IN ($1, $2)
    `, [CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.PACKED]),
    query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM child_boxes WHERE status = $1
    `, [CHILD_BOX_STATUS.DISPATCHED]),
  ]);

  const childBoxesByStatus: Record<string, number> = {};
  let totalChildBoxes = 0;
  for (const row of cbStats.rows) {
    childBoxesByStatus[row.status] = parseInt(row.count, 10);
    totalChildBoxes += parseInt(row.count, 10);
  }

  const masterCartonsByStatus: Record<string, number> = {};
  let totalMasterCartons = 0;
  for (const row of mcStats.rows) {
    masterCartonsByStatus[row.status] = parseInt(row.count, 10);
    totalMasterCartons += parseInt(row.count, 10);
  }

  return {
    totalProducts: parseInt(productCount.rows[0].total, 10),
    totalChildBoxes,
    totalMasterCartons,
    totalPairsInStock: parseInt(pairsInStock.rows[0].total, 10),
    totalPairsDispatched: parseInt(pairsDispatched.rows[0].total, 10),
    childBoxesByStatus,
    masterCartonsByStatus,
  };
}

export async function getProductWiseReport(): Promise<ProductWiseReport[]> {
  const result = await query(`
    SELECT
      p.id as product_id,
      p.article_name as product_name,
      p.sku as product_sku,
      p.size,
      p.colour,
      COUNT(cb.id) as total_child_boxes,
      COUNT(cb.id) FILTER (WHERE cb.status = $1) as free_boxes,
      COUNT(cb.id) FILTER (WHERE cb.status = $2) as packed_boxes,
      COUNT(cb.id) FILTER (WHERE cb.status = $4) as sample_boxes,
      COUNT(cb.id) FILTER (WHERE cb.status = $5) as ecommerce_boxes,
      COUNT(cb.id) FILTER (WHERE cb.status = $3) as dispatched_boxes,
      COALESCE(SUM(cb.quantity), 0) as total_pairs,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status IN ($1, $2)), 0) as pairs_in_stock,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status = $3), 0) as pairs_dispatched
    FROM products p
    LEFT JOIN child_boxes cb ON cb.product_id = p.id
    WHERE p.is_active = true
    GROUP BY p.id, p.article_name, p.sku, p.size, p.colour
    ORDER BY p.article_name
  `, [CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.PACKED, CHILD_BOX_STATUS.DISPATCHED, CHILD_BOX_STATUS.SAMPLE, CHILD_BOX_STATUS.ECOMMERCE]);

  return result.rows.map((row) => ({
    ...row,
    total_child_boxes: parseInt(row.total_child_boxes, 10),
    free_boxes: parseInt(row.free_boxes, 10),
    packed_boxes: parseInt(row.packed_boxes, 10),
    sample_boxes: parseInt(row.sample_boxes, 10),
    ecommerce_boxes: parseInt(row.ecommerce_boxes, 10),
    dispatched_boxes: parseInt(row.dispatched_boxes, 10),
    total_pairs: parseInt(row.total_pairs, 10),
    pairs_in_stock: parseInt(row.pairs_in_stock, 10),
    pairs_dispatched: parseInt(row.pairs_dispatched, 10),
  }));
}

export async function getDispatchSummary(
  fromDate?: string,
  toDate?: string
): Promise<DispatchSummaryReport> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (fromDate) {
    conditions.push(`dr.dispatch_date >= $${paramIndex++}`);
    values.push(fromDate);
  }
  if (toDate) {
    conditions.push(`dr.dispatch_date <= $${paramIndex++}`);
    values.push(toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Totals
  const totalsResult = await query(`
    SELECT
      COUNT(*) as total_dispatches,
      COUNT(DISTINCT dr.master_carton_id) as total_cartons_dispatched
    FROM dispatch_records dr
    ${whereClause}
  `, values);

  const t = totalsResult.rows[0];

  // Group by customer
  const customerGroups = await query(`
    SELECT
      c.id as customer_id,
      COALESCE(c.firm_name, 'Walk-in / No Customer') as customer_name,
      COUNT(DISTINCT dr.id) as total_dispatches,
      COUNT(DISTINCT dr.master_carton_id) as total_cartons,
      array_agg(DISTINCT dr.dispatch_date::text ORDER BY dr.dispatch_date::text) as dispatch_dates,
      array_agg(DISTINCT dr.destination) FILTER (WHERE dr.destination IS NOT NULL) as destinations
    FROM dispatch_records dr
    LEFT JOIN customers c ON c.id = dr.customer_id
    ${whereClause}
    GROUP BY c.id, c.firm_name
    ORDER BY total_cartons DESC
  `, values);

  // Product breakdown per customer
  const itemDetails = await query(`
    SELECT
      dr.customer_id,
      p.article_name,
      p.colour,
      string_agg(DISTINCT p.size, ', ') as sizes,
      p.mrp,
      COUNT(DISTINCT dr.master_carton_id) as carton_count,
      COUNT(DISTINCT ccm.child_box_id) as box_count
    FROM dispatch_records dr
    JOIN carton_child_mapping ccm ON ccm.master_carton_id = dr.master_carton_id
    JOIN child_boxes cb ON cb.id = ccm.child_box_id
    JOIN products p ON p.id = cb.product_id
    ${whereClause}
    GROUP BY dr.customer_id, p.article_name, p.colour, p.mrp
    ORDER BY dr.customer_id, p.article_name, p.colour
  `, values);

  // Build items map keyed by customer_id (null key = walk-in)
  const itemsByCustomer = new Map<string | null, CustomerDispatchItem[]>();
  for (const row of itemDetails.rows) {
    const key = row.customer_id ?? null;
    if (!itemsByCustomer.has(key)) {
      itemsByCustomer.set(key, []);
    }
    itemsByCustomer.get(key)!.push({
      article_name: row.article_name,
      colour: row.colour,
      sizes: row.sizes,
      mrp: parseFloat(row.mrp),
      carton_count: parseInt(row.carton_count, 10),
      box_count: parseInt(row.box_count, 10),
    });
  }

  const by_customer: CustomerDispatchGroup[] = customerGroups.rows.map((row) => ({
    customer_id: row.customer_id ?? null,
    customer_name: row.customer_name,
    total_cartons: parseInt(row.total_cartons, 10),
    total_dispatches: parseInt(row.total_dispatches, 10),
    dispatch_dates: row.dispatch_dates ?? [],
    destinations: row.destinations ?? [],
    items: itemsByCustomer.get(row.customer_id ?? null) ?? [],
  }));

  return {
    total_dispatches: parseInt(t.total_dispatches, 10),
    total_cartons_dispatched: parseInt(t.total_cartons_dispatched, 10),
    by_customer,
  };
}

export interface CartonInventoryRecord {
  id: string;
  carton_barcode: string;
  status: string;
  child_count: number;
  max_capacity: number;
  closed_at: string | null;
  dispatched_at: string | null;
  created_at: string;
  created_by_name: string | null;
  destination: string | null;
  dispatch_date: string | null;
  vehicle_number: string | null;
  lr_number: string | null;
}

export async function getCartonInventoryReport(): Promise<CartonInventoryRecord[]> {
  const result = await query(`
    SELECT
      mc.id, mc.carton_barcode, mc.status, mc.child_count, mc.max_capacity,
      mc.closed_at, mc.dispatched_at, mc.created_at,
      u.name as created_by_name,
      dr.destination, dr.dispatch_date, dr.vehicle_number, dr.lr_number
    FROM master_cartons mc
    LEFT JOIN users u ON u.id = mc.created_by
    LEFT JOIN dispatch_records dr ON dr.master_carton_id = mc.id
    ORDER BY mc.created_at DESC
  `);

  return result.rows;
}

export async function getDailyActivity(
  fromDate: string,
  toDate: string
): Promise<DailyActivityReport[]> {
  const result = await query(`
    WITH date_range AS (
      SELECT generate_series($1::date, $2::date, '1 day'::interval)::date as date
    ),
    box_activity AS (
      SELECT
        DATE(it.created_at) as date,
        COUNT(*) FILTER (WHERE it.transaction_type = '${TRANSACTION_TYPES.CHILD_CREATED}') as boxes_created,
        COUNT(*) FILTER (WHERE it.transaction_type = '${TRANSACTION_TYPES.CHILD_PACKED}') as boxes_packed,
        COUNT(*) FILTER (WHERE it.transaction_type = '${TRANSACTION_TYPES.CHILD_UNPACKED}') as boxes_unpacked,
        COUNT(*) FILTER (WHERE it.transaction_type = '${TRANSACTION_TYPES.CHILD_DISPATCHED}') as boxes_dispatched
      FROM inventory_transactions it
      WHERE it.created_at >= $1 AND it.created_at <= ($2::date + interval '1 day')
      GROUP BY DATE(it.created_at)
    ),
    carton_activity AS (
      SELECT
        DATE(mc.created_at) as date,
        COUNT(*) as cartons_created
      FROM master_cartons mc
      WHERE mc.created_at >= $1 AND mc.created_at <= ($2::date + interval '1 day')
      GROUP BY DATE(mc.created_at)
    ),
    carton_closed AS (
      SELECT
        DATE(mc.closed_at) as date,
        COUNT(*) as cartons_closed
      FROM master_cartons mc
      WHERE mc.closed_at IS NOT NULL AND mc.closed_at >= $1 AND mc.closed_at <= ($2::date + interval '1 day')
      GROUP BY DATE(mc.closed_at)
    ),
    carton_dispatched AS (
      SELECT
        DATE(dr.dispatch_date) as date,
        COUNT(*) as cartons_dispatched
      FROM dispatch_records dr
      WHERE dr.dispatch_date >= $1 AND dr.dispatch_date <= ($2::date + interval '1 day')
      GROUP BY DATE(dr.dispatch_date)
    )
    SELECT
      dr.date::text,
      COALESCE(ba.boxes_created, 0)::int as boxes_created,
      COALESCE(ba.boxes_packed, 0)::int as boxes_packed,
      COALESCE(ba.boxes_unpacked, 0)::int as boxes_unpacked,
      COALESCE(ba.boxes_dispatched, 0)::int as boxes_dispatched,
      COALESCE(ca.cartons_created, 0)::int as cartons_created,
      COALESCE(cc.cartons_closed, 0)::int as cartons_closed,
      COALESCE(cd.cartons_dispatched, 0)::int as cartons_dispatched
    FROM date_range dr
    LEFT JOIN box_activity ba ON ba.date = dr.date
    LEFT JOIN carton_activity ca ON ca.date = dr.date
    LEFT JOIN carton_closed cc ON cc.date = dr.date
    LEFT JOIN carton_dispatched cd ON cd.date = dr.date
    ORDER BY dr.date
  `, [fromDate, toDate]);

  return result.rows;
}

// ─── Sample Report ─────────────────────────────────────────────────────────

export interface SampleReportRow {
  sample_barcode: string;
  name: string;
  customer_name: string | null;
  recipient_name: string | null;
  status: string;
  child_count: number;
  sample_date: string | null;
  created_at: string;
  dispatched_at: string | null;
  creator_name: string | null;
}

export interface SampleReportSummary {
  total: number;
  created: number;
  active: number;
  closed: number;
  dispatched: number;
  pairs_total: number;
}

export interface SampleReport {
  summary: SampleReportSummary;
  rows: SampleReportRow[];
}

export async function getSampleReport(filters: {
  from?: Date;
  to?: Date;
  status?: SampleStatus;
  customer_id?: string;
}): Promise<SampleReport> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.from) {
    conditions.push(`sr.created_at >= $${paramIndex++}`);
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`sr.created_at <= $${paramIndex++}`);
    values.push(filters.to);
  }
  if (filters.status) {
    conditions.push(`sr.status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters.customer_id) {
    conditions.push(`sr.customer_id = $${paramIndex++}`);
    values.push(filters.customer_id);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const statusParams = [...values, SAMPLE_STATUS.CREATED, SAMPLE_STATUS.ACTIVE, SAMPLE_STATUS.CLOSED, SAMPLE_STATUS.DISPATCHED];
  const pi = paramIndex;

  const [summaryResult, rowsResult] = await Promise.all([
    query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE sr.status = $${pi}) as created,
        COUNT(*) FILTER (WHERE sr.status = $${pi + 1}) as active,
        COUNT(*) FILTER (WHERE sr.status = $${pi + 2}) as closed,
        COUNT(*) FILTER (WHERE sr.status = $${pi + 3}) as dispatched,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(cb.quantity), 0)
           FROM sample_box_mapping sbm
           JOIN child_boxes cb ON cb.id = sbm.child_box_id
           WHERE sbm.sample_record_id = sr.id AND sbm.is_active = true)
        ), 0) as pairs_total
      FROM sample_records sr
      ${whereClause}
    `, statusParams),

    query(`
      SELECT
        sr.sample_barcode, sr.name, c.firm_name as customer_name,
        sr.recipient_name, sr.status, sr.child_count,
        sr.sample_date, sr.created_at, sr.dispatched_at,
        u.name as creator_name
      FROM sample_records sr
      LEFT JOIN customers c ON c.id = sr.customer_id
      LEFT JOIN users u ON u.id = sr.created_by
      ${whereClause}
      ORDER BY sr.created_at DESC
    `, values),
  ]);

  const s = summaryResult.rows[0];
  return {
    summary: {
      total: parseInt(s.total, 10),
      created: parseInt(s.created, 10),
      active: parseInt(s.active, 10),
      closed: parseInt(s.closed, 10),
      dispatched: parseInt(s.dispatched, 10),
      pairs_total: parseInt(s.pairs_total, 10),
    },
    rows: rowsResult.rows,
  };
}

// ─── Ecommerce Report ───────────────────────────────────────────────────────
// Rewritten for the pool redesign: e-commerce activity is now dispatch-based
// (dispatch_records WHERE source_type = 'ECOMMERCE'), not ecommerce_records-based
// — there is no more per-record status/marketplace to report on. The report
// combines (1) dispatched-out activity in the date range with (2) a live,
// date-unfiltered snapshot of what's currently sitting in the pool.

export interface EcommerceReportRow {
  dispatch_id: string;
  dispatch_date: string;
  reference_name: string | null;
  marketplace: string | null;
  order_reference: string | null;
  listing_sku: string | null;
  order_date: string | null;
  customer_firm_name: string | null;
  destination: string | null;
  box_count: number;
  pairs: number;
  article_summary: string | null;
  colour_summary: string | null;
  size_summary: string | null;
  lr_number: string | null;
  vehicle_number: string | null;
  dispatched_by_name: string | null;
  notes: string | null;
}

export interface EcommerceReportSummary {
  dispatch_count: number;
  box_count: number;
  pairs_total: number;
  pool: {
    carton_items: number;
    box_items: number;
    total_boxes: number;
    total_pairs: number;
  };
  by_marketplace: Array<{ marketplace: string; dispatch_count: number; box_count: number; pairs: number }>;
}

export interface EcommerceReport {
  summary: EcommerceReportSummary;
  rows: EcommerceReportRow[];
}

// Shared LATERAL: rolls up an e-commerce dispatch's shipped boxes (loose +
// whole-carton) into box_count / pairs / product-summary strings. Mirrors the
// dispatch_record_id-keyed union used in dispatch.service.ts#getDispatches.
const ECOMMERCE_DISPATCH_ROLLUP_LATERAL = `
  LEFT JOIN LATERAL (
    SELECT
      COUNT(DISTINCT src.child_box_id)::int AS box_count,
      COALESCE(SUM(cb.quantity), 0)::int AS pairs,
      string_agg(DISTINCT p.article_name, ', ') AS article_summary,
      string_agg(DISTINCT p.colour, ', ') AS colour_summary,
      string_agg(DISTINCT p.size, ', ') AS size_summary
    FROM (
      SELECT ebm.child_box_id FROM ecommerce_box_mapping ebm WHERE ebm.dispatch_record_id = dr.id
      UNION ALL
      SELECT ccm.child_box_id FROM ecommerce_carton_mapping ecm
      JOIN carton_child_mapping ccm ON ccm.master_carton_id = ecm.master_carton_id AND ccm.is_active = true
      WHERE ecm.dispatch_record_id = dr.id
    ) src
    JOIN child_boxes cb ON cb.id = src.child_box_id
    JOIN products p ON p.id = cb.product_id
  ) ps ON true
`;

export async function getEcommerceReport(filters: {
  from?: Date;
  to?: Date;
  marketplace?: string;
}): Promise<EcommerceReport> {
  const conditions: string[] = [`dr.source_type = 'ECOMMERCE'`];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.from) {
    conditions.push(`dr.dispatch_date >= $${paramIndex++}`);
    values.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`dr.dispatch_date <= $${paramIndex++}`);
    values.push(filters.to);
  }
  if (filters.marketplace) {
    conditions.push(`dr.marketplace ILIKE $${paramIndex++}`);
    values.push(`%${filters.marketplace}%`);
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [summaryResult, marketplaceResult, rowsResult, poolSummary] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int AS dispatch_count,
        COALESCE(SUM(ps.box_count), 0)::int AS box_count,
        COALESCE(SUM(ps.pairs), 0)::int AS pairs_total
      FROM dispatch_records dr
      ${ECOMMERCE_DISPATCH_ROLLUP_LATERAL}
      ${whereClause}
    `, values),

    query(`
      SELECT
        COALESCE(dr.marketplace, 'Unknown') AS marketplace,
        COUNT(*)::int AS dispatch_count,
        COALESCE(SUM(ps.box_count), 0)::int AS box_count,
        COALESCE(SUM(ps.pairs), 0)::int AS pairs
      FROM dispatch_records dr
      ${ECOMMERCE_DISPATCH_ROLLUP_LATERAL}
      ${whereClause}
      GROUP BY dr.marketplace
      ORDER BY box_count DESC
    `, values),

    query(`
      SELECT
        dr.id AS dispatch_id, dr.dispatch_date,
        dr.reference_name, dr.marketplace, dr.order_reference, dr.listing_sku, dr.order_date,
        c.firm_name AS customer_firm_name, dr.destination,
        COALESCE(ps.box_count, 0)::int AS box_count, COALESCE(ps.pairs, 0)::int AS pairs,
        ps.article_summary, ps.colour_summary, ps.size_summary,
        dr.lr_number, dr.vehicle_number,
        u.name AS dispatched_by_name, dr.notes
      FROM dispatch_records dr
      LEFT JOIN customers c ON c.id = dr.customer_id
      LEFT JOIN users u ON u.id = dr.dispatched_by
      ${ECOMMERCE_DISPATCH_ROLLUP_LATERAL}
      ${whereClause}
      ORDER BY dr.dispatch_date DESC, dr.created_at DESC
    `, values),

    getEcommercePoolSummary(),
  ]);

  const s = summaryResult.rows[0];
  return {
    summary: {
      dispatch_count: s.dispatch_count,
      box_count: s.box_count,
      pairs_total: s.pairs_total,
      pool: {
        carton_items: poolSummary.carton_items,
        box_items: poolSummary.box_items,
        total_boxes: poolSummary.total_boxes,
        total_pairs: poolSummary.total_pairs,
      },
      by_marketplace: marketplaceResult.rows.map((r) => ({
        marketplace: r.marketplace,
        dispatch_count: r.dispatch_count,
        box_count: r.box_count,
        pairs: r.pairs,
      })),
    },
    rows: rowsResult.rows,
  };
}
