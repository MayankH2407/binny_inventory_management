import { query } from '../config/database';
import { InventoryTransaction } from '../types';
import { CHILD_BOX_STATUS, MASTER_CARTON_STATUS } from '../config/constants';
import { NotFoundError } from '../utils/errors';

export interface InventoryDashboard {
  totalChildBoxes: number;
  freeChildBoxes: number;
  packedChildBoxes: number;
  dispatchedChildBoxes: number;
  totalMasterCartons: number;
  createdCartons: number;
  activeCartons: number;
  closedCartons: number;
  dispatchedCartons: number;
  activeMasterCartons: number;
  closedMasterCartons: number;
  todayDispatches: number;
  totalDispatches: number;
  totalPairsInStock: number;
  totalPairsDispatched: number;
  totalProducts: number;
  recentTransactions: InventoryTransaction[];
}

export async function getDashboard(): Promise<InventoryDashboard> {
  const [
    childBoxCounts,
    cartonCounts,
    pairsInStock,
    pairsDispatched,
    productCount,
    recentTxns,
    dispatchCounts,
  ] = await Promise.all([
    query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = $1) as free,
        COUNT(*) FILTER (WHERE status = $2) as packed,
        COUNT(*) FILTER (WHERE status = $3) as dispatched
      FROM child_boxes
    `, [CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.PACKED, CHILD_BOX_STATUS.DISPATCHED]),

    query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = $1) as created,
        COUNT(*) FILTER (WHERE status = $2) as active,
        COUNT(*) FILTER (WHERE status = $3) as closed,
        COUNT(*) FILTER (WHERE status = $4) as dispatched
      FROM master_cartons
    `, [
      MASTER_CARTON_STATUS.CREATED,
      MASTER_CARTON_STATUS.ACTIVE,
      MASTER_CARTON_STATUS.CLOSED,
      MASTER_CARTON_STATUS.DISPATCHED,
    ]),

    query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM child_boxes
      WHERE status IN ($1, $2)
    `, [CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.PACKED]),

    query(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM child_boxes
      WHERE status = $1
    `, [CHILD_BOX_STATUS.DISPATCHED]),

    query('SELECT COUNT(*) as total FROM products WHERE is_active = true'),

    query(`
      SELECT * FROM inventory_transactions
      ORDER BY created_at DESC
      LIMIT 20
    `),

    query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE dispatch_date::date = CURRENT_DATE) as today
      FROM dispatch_records
    `),
  ]);

  const cb = childBoxCounts.rows[0];
  const mc = cartonCounts.rows[0];

  return {
    totalChildBoxes: parseInt(cb.total, 10),
    freeChildBoxes: parseInt(cb.free, 10),
    packedChildBoxes: parseInt(cb.packed, 10),
    dispatchedChildBoxes: parseInt(cb.dispatched, 10),
    totalMasterCartons: parseInt(mc.total, 10),
    createdCartons: parseInt(mc.created, 10),
    activeCartons: parseInt(mc.active, 10),
    closedCartons: parseInt(mc.closed, 10),
    dispatchedCartons: parseInt(mc.dispatched, 10),
    activeMasterCartons: parseInt(mc.active, 10),
    closedMasterCartons: parseInt(mc.closed, 10),
    todayDispatches: parseInt(dispatchCounts.rows[0].today, 10),
    totalDispatches: parseInt(dispatchCounts.rows[0].total, 10),
    totalPairsInStock: parseInt(pairsInStock.rows[0].total, 10),
    totalPairsDispatched: parseInt(pairsDispatched.rows[0].total, 10),
    totalProducts: parseInt(productCount.rows[0].total, 10),
    recentTransactions: recentTxns.rows,
  };
}

export async function getTransactions(
  filters: {
    transaction_type?: string;
    child_box_id?: string;
    master_carton_id?: string;
    performed_by?: string;
    from_date?: string;
    to_date?: string;
  },
  page: number = 1,
  limit: number = 25
): Promise<{ data: InventoryTransaction[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.transaction_type) {
    conditions.push(`transaction_type = $${paramIndex++}`);
    values.push(filters.transaction_type);
  }
  if (filters.child_box_id) {
    conditions.push(`child_box_id = $${paramIndex++}`);
    values.push(filters.child_box_id);
  }
  if (filters.master_carton_id) {
    conditions.push(`master_carton_id = $${paramIndex++}`);
    values.push(filters.master_carton_id);
  }
  if (filters.performed_by) {
    conditions.push(`performed_by = $${paramIndex++}`);
    values.push(filters.performed_by);
  }
  if (filters.from_date) {
    conditions.push(`created_at >= $${paramIndex++}`);
    values.push(filters.from_date);
  }
  if (filters.to_date) {
    conditions.push(`created_at <= $${paramIndex++}`);
    values.push(filters.to_date);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM inventory_transactions ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT * FROM inventory_transactions ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

export async function traceByBarcode(barcode: string): Promise<Record<string, unknown>> {
  // First try to find a child box — use explicit columns to avoid id/timestamp collision
  const childBoxResult = await query(
    `SELECT
       cb.id, cb.barcode, cb.product_id, cb.status, cb.quantity,
       cb.created_by, cb.created_at, cb.updated_at,
       p.sku, p.article_name, p.article_code, p.colour, p.size,
       p.mrp, p.description, p.category, p.section, p.location
     FROM child_boxes cb
     JOIN products p ON p.id = cb.product_id
     WHERE cb.barcode = $1`,
    [barcode]
  );

  if (childBoxResult.rows.length > 0) {
    const childBox = childBoxResult.rows[0];

    // Get current master carton mapping — use cb.id (child box ID, not product ID)
    const cartonResult = await query(
      `SELECT mc.* FROM carton_child_mapping ccm JOIN master_cartons mc ON mc.id = ccm.master_carton_id WHERE ccm.child_box_id = $1 AND ccm.is_active = true`,
      [childBox.id]
    );
    const masterCarton = cartonResult.rows.length > 0 ? cartonResult.rows[0] : null;

    // Get dispatch record if the carton is dispatched
    let dispatch = null;
    if (masterCarton) {
      const dispatchResult = await query(
        `SELECT * FROM dispatch_records WHERE master_carton_id = $1 ORDER BY dispatch_date DESC LIMIT 1`,
        [masterCarton.id]
      );
      dispatch = dispatchResult.rows.length > 0 ? dispatchResult.rows[0] : null;
    }

    // Get timeline — map DB columns to frontend-expected field names
    const timelineResult = await query(
      `SELECT it.id, it.transaction_type as action, it.notes as description, u.name as performed_by, it.created_at as performed_at, it.metadata
       FROM inventory_transactions it LEFT JOIN users u ON u.id = it.performed_by WHERE it.child_box_id = $1 ORDER BY it.created_at ASC`,
      [childBox.id]
    );

    return {
      childBox,
      product: childBoxResult.rows[0],
      masterCarton,
      dispatch,
      timeline: timelineResult.rows,
    };
  }

  // Try master carton
  const masterCartonResult = await query(
    `SELECT * FROM master_cartons WHERE carton_barcode = $1`,
    [barcode]
  );

  if (masterCartonResult.rows.length > 0) {
    const masterCarton = masterCartonResult.rows[0];

    // Get dispatch record
    const dispatchResult = await query(
      `SELECT * FROM dispatch_records WHERE master_carton_id = $1 ORDER BY dispatch_date DESC LIMIT 1`,
      [masterCarton.id]
    );
    const dispatch = dispatchResult.rows.length > 0 ? dispatchResult.rows[0] : null;

    // Get timeline — map DB columns to frontend-expected field names
    const timelineResult = await query(
      `SELECT it.id, it.transaction_type as action, it.notes as description, u.name as performed_by, it.created_at as performed_at, it.metadata
       FROM inventory_transactions it LEFT JOIN users u ON u.id = it.performed_by WHERE it.master_carton_id = $1 ORDER BY it.created_at ASC`,
      [masterCarton.id]
    );

    return {
      masterCarton,
      dispatch,
      timeline: timelineResult.rows,
    };
  }

  throw new NotFoundError(`No child box or master carton found with barcode: ${barcode}`);
}

// ─── Hierarchical Stock Drill-Down ─────────────────────────────────────────

export interface StockNode {
  name: string;
  key: string;
  totalPairs: number;
  inStock: number;
  packed: number;
  dispatched: number;
  childBoxCount: number;
  cartonCount: number;
  children?: number;
}

export interface StockDetail {
  sku: string;
  articleName: string;
  articleCode: string;
  colour: string;
  size: string;
  mrp: number;
  category: string | null;
  section: string | null;
  totalPairs: number;
  freePairs: number;
  packedPairs: number;
  dispatchedPairs: number;
  freeBoxes: number;
  packedBoxes: number;
  dispatchedBoxes: number;
  cartons: number;
}

export async function getStockByLevel(
  level: 'section' | 'article_name' | 'colour' | 'product',
  filters: { section?: string; article_name?: string; colour?: string }
): Promise<StockNode[]> {
  const conditions: string[] = ['p.is_active = true'];
  const values: unknown[] = [CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.PACKED, CHILD_BOX_STATUS.DISPATCHED];
  let paramIndex = 4;

  if (filters.section) {
    conditions.push(`p.section = $${paramIndex++}`);
    values.push(filters.section);
  }
  if (filters.article_name) {
    conditions.push(`p.article_name = $${paramIndex++}`);
    values.push(filters.article_name);
  }
  if (filters.colour) {
    conditions.push(`p.colour = $${paramIndex++}`);
    values.push(filters.colour);
  }

  const whereClause = conditions.join(' AND ');

  let groupCol: string;
  let nameExpr: string;
  let keyExpr: string;
  let childCountExpr: string;

  switch (level) {
    case 'section':
      groupCol = 'p.section';
      nameExpr = "COALESCE(p.section, 'Uncategorized')";
      keyExpr = "COALESCE(p.section, 'Uncategorized')";
      childCountExpr = 'COUNT(DISTINCT p.article_name)';
      break;
    case 'article_name':
      groupCol = 'p.article_name';
      nameExpr = 'p.article_name';
      keyExpr = 'p.article_name';
      childCountExpr = 'COUNT(DISTINCT p.colour)';
      break;
    case 'colour':
      groupCol = 'p.colour';
      nameExpr = 'p.colour';
      keyExpr = 'p.colour';
      childCountExpr = 'COUNT(DISTINCT p.size)';
      break;
    case 'product':
      groupCol = 'p.id';
      nameExpr = "p.size || ' - ₹' || p.mrp";
      keyExpr = 'p.id::text';
      childCountExpr = '0';
      break;
  }

  const result = await query(`
    SELECT
      ${nameExpr} as name,
      ${keyExpr} as key,
      COALESCE(SUM(cb.quantity), 0) as total_pairs,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status = $1), 0) as in_stock,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status = $2), 0) as packed,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status = $3), 0) as dispatched,
      COUNT(cb.id) as child_box_count,
      COUNT(DISTINCT ccm.master_carton_id) FILTER (WHERE ccm.is_active = true) as carton_count,
      ${childCountExpr} as children
    FROM products p
    LEFT JOIN child_boxes cb ON cb.product_id = p.id
    LEFT JOIN carton_child_mapping ccm ON ccm.child_box_id = cb.id
    WHERE ${whereClause}
    GROUP BY ${groupCol}${level === 'product' ? ', p.size, p.mrp' : ''}
    ORDER BY ${level === 'product' ? 'p.size::int' : 'total_pairs DESC NULLS LAST'}
  `, values);

  return result.rows.map(row => ({
    name: row.name,
    key: row.key,
    totalPairs: parseInt(row.total_pairs, 10),
    inStock: parseInt(row.in_stock, 10),
    packed: parseInt(row.packed, 10),
    dispatched: parseInt(row.dispatched, 10),
    childBoxCount: parseInt(row.child_box_count, 10),
    cartonCount: parseInt(row.carton_count, 10),
    children: parseInt(row.children, 10),
  }));
}

export async function getStockSummary(): Promise<{
  totalProducts: number;
  totalPairsInStock: number;
  totalPairsDispatched: number;
  totalChildBoxes: number;
  totalCartons: number;
  sections: number;
  articles: number;
}> {
  const result = await query(`
    SELECT
      COUNT(DISTINCT p.id) as total_products,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status IN ($1, $2)), 0) as pairs_in_stock,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status = $3), 0) as pairs_dispatched,
      COUNT(cb.id) as total_boxes,
      COUNT(DISTINCT p.section) as sections,
      COUNT(DISTINCT p.article_name) as articles
    FROM products p
    LEFT JOIN child_boxes cb ON cb.product_id = p.id
    WHERE p.is_active = true
  `, [CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.PACKED, CHILD_BOX_STATUS.DISPATCHED]);

  const cartonResult = await query(`
    SELECT COUNT(*) as total FROM master_cartons WHERE status IN ($1, $2)
  `, [MASTER_CARTON_STATUS.ACTIVE, MASTER_CARTON_STATUS.CLOSED]);

  const row = result.rows[0];
  return {
    totalProducts: parseInt(row.total_products, 10),
    totalPairsInStock: parseInt(row.pairs_in_stock, 10),
    totalPairsDispatched: parseInt(row.pairs_dispatched, 10),
    totalChildBoxes: parseInt(row.total_boxes, 10),
    totalCartons: parseInt(cartonResult.rows[0].total, 10),
    sections: parseInt(row.sections, 10),
    articles: parseInt(row.articles, 10),
  };
}
