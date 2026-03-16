import { query } from '../config/database';
import { CHILD_BOX_STATUS, TRANSACTION_TYPES } from '../config/constants';

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
  dispatched_boxes: number;
  total_pairs: number;
  pairs_in_stock: number;
  pairs_dispatched: number;
}

export interface DispatchSummaryReport {
  total_dispatches: number;
  total_cartons_dispatched: number;
  dispatches_by_destination: Array<{
    destination: string;
    dispatch_count: number;
    carton_count: number;
  }>;
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
      COUNT(cb.id) FILTER (WHERE cb.status = $3) as dispatched_boxes,
      COALESCE(SUM(cb.quantity), 0) as total_pairs,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status IN ($1, $2)), 0) as pairs_in_stock,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status = $3), 0) as pairs_dispatched
    FROM products p
    LEFT JOIN child_boxes cb ON cb.product_id = p.id
    WHERE p.is_active = true
    GROUP BY p.id, p.article_name, p.sku, p.size, p.colour
    ORDER BY p.article_name
  `, [CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.PACKED, CHILD_BOX_STATUS.DISPATCHED]);

  return result.rows.map((row) => ({
    ...row,
    total_child_boxes: parseInt(row.total_child_boxes, 10),
    free_boxes: parseInt(row.free_boxes, 10),
    packed_boxes: parseInt(row.packed_boxes, 10),
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
    conditions.push(`dispatch_date >= $${paramIndex++}`);
    values.push(fromDate);
  }
  if (toDate) {
    conditions.push(`dispatch_date <= $${paramIndex++}`);
    values.push(toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [totals, byDestination] = await Promise.all([
    query(`
      SELECT
        COUNT(*) as total_dispatches,
        COUNT(DISTINCT master_carton_id) as total_cartons_dispatched
      FROM dispatch_records ${whereClause}
    `, values),
    query(`
      SELECT
        destination,
        COUNT(*) as dispatch_count,
        COUNT(DISTINCT master_carton_id) as carton_count
      FROM dispatch_records ${whereClause}
      GROUP BY destination
      ORDER BY dispatch_count DESC
    `, values),
  ]);

  const t = totals.rows[0];

  return {
    total_dispatches: parseInt(t.total_dispatches, 10),
    total_cartons_dispatched: parseInt(t.total_cartons_dispatched, 10),
    dispatches_by_destination: byDestination.rows.map((row) => ({
      destination: row.destination,
      dispatch_count: parseInt(row.dispatch_count, 10),
      carton_count: parseInt(row.carton_count, 10),
    })),
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
