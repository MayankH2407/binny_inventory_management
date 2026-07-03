import { query } from '../config/database';
import { InventoryTransaction } from '../types';
import { CHILD_BOX_STATUS, MASTER_CARTON_STATUS } from '../config/constants';
import { NotFoundError } from '../utils/errors';
import { BreakdownLevel, BreakdownPath, BreakdownChannel } from '../models/schemas/inventory.schema';

export interface InventoryDashboard {
  totalChildBoxes: number;
  generatedBoxes: number;
  freeChildBoxes: number;
  packedChildBoxes: number;
  sampleBoxes: number;
  ecommerceBoxes: number;
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
        COUNT(*) FILTER (WHERE status = $1) as generated,
        COUNT(*) FILTER (WHERE status = $2) as free,
        COUNT(*) FILTER (WHERE status = $3) as packed,
        COUNT(*) FILTER (WHERE status = $4) as sample,
        COUNT(*) FILTER (WHERE status = $5) as ecommerce,
        COUNT(*) FILTER (WHERE status = $6) as dispatched
      FROM child_boxes
    `, [CHILD_BOX_STATUS.GENERATED, CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.PACKED, CHILD_BOX_STATUS.SAMPLE, CHILD_BOX_STATUS.ECOMMERCE, CHILD_BOX_STATUS.DISPATCHED]),

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
    generatedBoxes: parseInt(cb.generated, 10),
    freeChildBoxes: parseInt(cb.free, 10),
    packedChildBoxes: parseInt(cb.packed, 10),
    sampleBoxes: parseInt(cb.sample, 10),
    ecommerceBoxes: parseInt(cb.ecommerce, 10),
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
     ORDER BY created_at DESC, id
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
     WHERE cb.barcode = UPPER($1)`,
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
    `SELECT * FROM master_cartons WHERE carton_barcode = UPPER($1)`,
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
  /** Distinct MRP count within this row's group — frontend uses this at the article_name level to decide whether to show an MRP bucket level or skip directly to colour. */
  distinctMrpCount: number;
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
  level: 'section' | 'article_name' | 'mrp' | 'colour' | 'product',
  filters: { section?: string; article_name?: string; mrp?: string; colour?: string }
): Promise<StockNode[]> {
  const conditions: string[] = ['p.is_active = true'];
  // $1=FREE, $2=PACKED, $3=SAMPLE, $4=ECOMMERCE, $5=DISPATCHED — GENERATED excluded (pre-inventory)
  const values: unknown[] = [CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.PACKED, CHILD_BOX_STATUS.SAMPLE, CHILD_BOX_STATUS.ECOMMERCE, CHILD_BOX_STATUS.DISPATCHED];
  let paramIndex = 6;

  if (filters.section) {
    conditions.push(`p.section = $${paramIndex++}`);
    values.push(filters.section);
  }
  if (filters.article_name) {
    conditions.push(`p.article_name = $${paramIndex++}`);
    values.push(filters.article_name);
  }
  if (filters.mrp) {
    conditions.push(`p.mrp = $${paramIndex++}::numeric`);
    values.push(filters.mrp);
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
    case 'mrp':
      groupCol = 'p.mrp';
      // Pretty-format: ₹299 if integral, ₹299.50 if fractional. NUMERIC(10,2) so always 2 decimals.
      nameExpr = "CASE WHEN p.mrp = FLOOR(p.mrp) THEN '₹' || FLOOR(p.mrp)::text ELSE '₹' || p.mrp::text END";
      keyExpr = 'p.mrp::text';
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
      nameExpr = "p.size || ' - ' || CASE WHEN p.mrp = FLOOR(p.mrp) THEN '₹' || FLOOR(p.mrp)::text ELSE '₹' || p.mrp::text END";
      keyExpr = 'p.id::text';
      childCountExpr = '0';
      break;
  }

  const result = await query(`
    SELECT
      ${nameExpr} as name,
      ${keyExpr} as key,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status IN ($1, $2, $3, $4, $5)), 0) as total_pairs,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status = $1), 0) as in_stock,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status = $2), 0) as packed,
      COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status = $5), 0) as dispatched,
      COUNT(cb.id) FILTER (WHERE cb.status IN ($1, $2, $3, $4, $5)) as child_box_count,
      COUNT(DISTINCT ccm.master_carton_id) FILTER (WHERE ccm.is_active = true) as carton_count,
      ${childCountExpr} as children,
      COUNT(DISTINCT p.mrp) as distinct_mrp_count
    FROM products p
    LEFT JOIN child_boxes cb ON cb.product_id = p.id
    LEFT JOIN carton_child_mapping ccm ON ccm.child_box_id = cb.id
    WHERE ${whereClause}
    GROUP BY ${groupCol}${level === 'product' ? ', p.size, p.mrp' : ''}
    ORDER BY ${
      level === 'product' ? 'p.size::int'
      : level === 'mrp' ? 'p.mrp ASC'
      : 'total_pairs DESC NULLS LAST'
    }
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
    distinctMrpCount: parseInt(row.distinct_mrp_count, 10),
  }));
}

// ─── Carton Hierarchy (By Master Carton view) ─────────────────────────────

export interface CartonStockNode {
  name: string;
  key: string;
  cartonCount: number;
  createdCount?: number;
  activeCount?: number;
  closedCount?: number;
  dispatchedCount?: number;
  childBoxCount: number;
  totalPairs: number;
  avgUtilization?: number;
  // For carton leaf only:
  id?: string;
  carton_barcode?: string;
  status?: 'CREATED' | 'ACTIVE' | 'CLOSED' | 'DISPATCHED';
  child_count?: number;
  max_capacity?: number;
  primary_section?: string;
  primary_article?: string;
  created_at?: string;
  closed_at?: string | null;
  dispatched_at?: string | null;
}

export async function getCartonHierarchy(
  level: 'status' | 'section' | 'article_name' | 'carton',
  filters: {
    status?: string;
    section?: string;
    article_name?: string;
    search?: string;
    page?: number;
    limit?: number;
  }
): Promise<{ data: CartonStockNode[]; meta?: { page: number; limit: number; total: number; totalPages: number } }> {
  const page = filters.page || 1;
  const limit = filters.limit || 50;
  const offset = (page - 1) * limit;

  if (level === 'status') {
    // Status level — may need joins if section/article filters are present
    const needsJoin = !!(filters.section || filters.article_name);
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`mc.status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.section && needsJoin) {
      conditions.push(`p.section = $${paramIndex++}`);
      values.push(filters.section);
    }
    if (filters.article_name && needsJoin) {
      conditions.push(`p.article_name = $${paramIndex++}`);
      values.push(filters.article_name);
    }
    if (filters.search) {
      conditions.push(`(mc.carton_barcode ILIKE $${paramIndex} OR p.article_name ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const joinClause = needsJoin
      ? `JOIN carton_child_mapping ccm ON ccm.master_carton_id = mc.id AND ccm.is_active = true
         JOIN child_boxes cb ON cb.id = ccm.child_box_id
         JOIN products p ON p.id = cb.product_id`
      : '';

    const result = await query(`
      SELECT
        mc.status as name,
        mc.status as key,
        COUNT(DISTINCT mc.id)::int as "cartonCount",
        SUM(mc.child_count)::int as "childBoxCount",
        COALESCE(AVG(NULLIF(mc.child_count::numeric / NULLIF(mc.max_capacity, 0) * 100, 0)), 0)::int as "avgUtilization"
      FROM master_cartons mc
      ${joinClause}
      ${whereClause}
      GROUP BY mc.status
      ORDER BY CASE mc.status
        WHEN 'CREATED' THEN 1
        WHEN 'ACTIVE' THEN 2
        WHEN 'CLOSED' THEN 3
        WHEN 'DISPATCHED' THEN 4
      END
    `, values);

    return {
      data: result.rows.map(row => ({
        name: String(row.name),
        key: String(row.key),
        cartonCount: parseInt(row.cartonCount, 10) || 0,
        childBoxCount: parseInt(row.childBoxCount, 10) || 0,
        totalPairs: 0,
        avgUtilization: parseInt(row.avgUtilization, 10) || 0,
      })),
    };
  }

  if (level === 'section') {
    const conditions: string[] = ['ccm.is_active = true'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`mc.status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.section) {
      conditions.push(`p.section = $${paramIndex++}`);
      values.push(filters.section);
    }
    if (filters.article_name) {
      conditions.push(`p.article_name = $${paramIndex++}`);
      values.push(filters.article_name);
    }
    if (filters.search) {
      conditions.push(`(mc.carton_barcode ILIKE $${paramIndex} OR p.article_name ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const result = await query(`
      SELECT
        p.section as name,
        p.section as key,
        COUNT(DISTINCT mc.id)::int as "cartonCount",
        COUNT(DISTINCT mc.id) FILTER (WHERE mc.status = 'CREATED')::int as "createdCount",
        COUNT(DISTINCT mc.id) FILTER (WHERE mc.status = 'ACTIVE')::int as "activeCount",
        COUNT(DISTINCT mc.id) FILTER (WHERE mc.status = 'CLOSED')::int as "closedCount",
        COUNT(DISTINCT mc.id) FILTER (WHERE mc.status = 'DISPATCHED')::int as "dispatchedCount",
        COUNT(DISTINCT cb.id)::int as "childBoxCount",
        COALESCE(SUM(cb.quantity), 0)::int as "totalPairs"
      FROM master_cartons mc
      JOIN carton_child_mapping ccm ON ccm.master_carton_id = mc.id AND ccm.is_active = true
      JOIN child_boxes cb ON cb.id = ccm.child_box_id
      JOIN products p ON p.id = cb.product_id
      ${whereClause}
      GROUP BY p.section
      ORDER BY p.section
    `, values);

    return {
      data: result.rows.map(row => ({
        name: String(row.name || 'Uncategorized'),
        key: String(row.key || 'Uncategorized'),
        cartonCount: parseInt(row.cartonCount, 10) || 0,
        createdCount: parseInt(row.createdCount, 10) || 0,
        activeCount: parseInt(row.activeCount, 10) || 0,
        closedCount: parseInt(row.closedCount, 10) || 0,
        dispatchedCount: parseInt(row.dispatchedCount, 10) || 0,
        childBoxCount: parseInt(row.childBoxCount, 10) || 0,
        totalPairs: parseInt(row.totalPairs, 10) || 0,
      })),
    };
  }

  if (level === 'article_name') {
    const conditions: string[] = ['ccm.is_active = true'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`mc.status = $${paramIndex++}`);
      values.push(filters.status);
    }
    if (filters.section) {
      conditions.push(`p.section = $${paramIndex++}`);
      values.push(filters.section);
    }
    if (filters.article_name) {
      conditions.push(`p.article_name = $${paramIndex++}`);
      values.push(filters.article_name);
    }
    if (filters.search) {
      conditions.push(`(mc.carton_barcode ILIKE $${paramIndex} OR p.article_name ILIKE $${paramIndex})`);
      values.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const result = await query(`
      SELECT
        p.article_name as name,
        p.article_name as key,
        p.section as section,
        COUNT(DISTINCT mc.id)::int as "cartonCount",
        COUNT(DISTINCT mc.id) FILTER (WHERE mc.status = 'CREATED')::int as "createdCount",
        COUNT(DISTINCT mc.id) FILTER (WHERE mc.status = 'ACTIVE')::int as "activeCount",
        COUNT(DISTINCT mc.id) FILTER (WHERE mc.status = 'CLOSED')::int as "closedCount",
        COUNT(DISTINCT mc.id) FILTER (WHERE mc.status = 'DISPATCHED')::int as "dispatchedCount",
        COUNT(DISTINCT cb.id)::int as "childBoxCount",
        COALESCE(SUM(cb.quantity), 0)::int as "totalPairs"
      FROM master_cartons mc
      JOIN carton_child_mapping ccm ON ccm.master_carton_id = mc.id AND ccm.is_active = true
      JOIN child_boxes cb ON cb.id = ccm.child_box_id
      JOIN products p ON p.id = cb.product_id
      ${whereClause}
      GROUP BY p.section, p.article_name
      ORDER BY p.article_name
    `, values);

    return {
      data: result.rows.map(row => ({
        name: String(row.name),
        key: String(row.key),
        cartonCount: parseInt(row.cartonCount, 10) || 0,
        createdCount: parseInt(row.createdCount, 10) || 0,
        activeCount: parseInt(row.activeCount, 10) || 0,
        closedCount: parseInt(row.closedCount, 10) || 0,
        dispatchedCount: parseInt(row.dispatchedCount, 10) || 0,
        childBoxCount: parseInt(row.childBoxCount, 10) || 0,
        totalPairs: parseInt(row.totalPairs, 10) || 0,
        primary_section: String(row.section || ''),
      })),
    };
  }

  // Carton leaf level
  const conditions: string[] = ['ccm.is_active = true'];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`mc.status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters.section) {
    conditions.push(`p.section = $${paramIndex++}`);
    values.push(filters.section);
  }
  if (filters.article_name) {
    conditions.push(`p.article_name = $${paramIndex++}`);
    values.push(filters.article_name);
  }
  if (filters.search) {
    conditions.push(`(mc.carton_barcode ILIKE $${paramIndex} OR p.article_name ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  // Count query for pagination
  const countResult = await query(`
    SELECT COUNT(DISTINCT mc.id) as total
    FROM master_cartons mc
    JOIN carton_child_mapping ccm ON ccm.master_carton_id = mc.id AND ccm.is_active = true
    JOIN child_boxes cb ON cb.id = ccm.child_box_id
    JOIN products p ON p.id = cb.product_id
    ${whereClause}
  `, values);

  const total = parseInt(countResult.rows[0].total, 10) || 0;

  values.push(limit, offset);
  const limitParam = paramIndex++;
  const offsetParam = paramIndex;

  const result = await query(`
    SELECT
      mc.id,
      mc.carton_barcode,
      mc.status,
      mc.child_count,
      mc.max_capacity,
      mc.created_at,
      mc.closed_at,
      mc.dispatched_at,
      prim.section as primary_section,
      prim.article_name as primary_article
    FROM (
      SELECT DISTINCT mc.id
      FROM master_cartons mc
      JOIN carton_child_mapping ccm ON ccm.master_carton_id = mc.id AND ccm.is_active = true
      JOIN child_boxes cb ON cb.id = ccm.child_box_id
      JOIN products p ON p.id = cb.product_id
      ${whereClause}
    ) ids
    JOIN master_cartons mc ON mc.id = ids.id
    LEFT JOIN LATERAL (
      SELECT p2.section, p2.article_name, COUNT(*) as cnt
      FROM carton_child_mapping ccm2
      JOIN child_boxes cb2 ON cb2.id = ccm2.child_box_id
      JOIN products p2 ON p2.id = cb2.product_id
      WHERE ccm2.master_carton_id = mc.id AND ccm2.is_active = true
      GROUP BY p2.section, p2.article_name
      ORDER BY cnt DESC
      LIMIT 1
    ) prim ON true
    ORDER BY mc.created_at DESC, mc.id
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `, values);

  return {
    data: result.rows.map(row => ({
      name: String(row.carton_barcode),
      key: String(row.id),
      cartonCount: 1,
      childBoxCount: parseInt(row.child_count, 10) || 0,
      totalPairs: 0,
      id: String(row.id),
      carton_barcode: String(row.carton_barcode),
      status: row.status as 'CREATED' | 'ACTIVE' | 'CLOSED' | 'DISPATCHED',
      child_count: parseInt(row.child_count, 10) || 0,
      max_capacity: parseInt(row.max_capacity, 10) || 0,
      primary_section: row.primary_section ? String(row.primary_section) : undefined,
      primary_article: row.primary_article ? String(row.primary_article) : undefined,
      created_at: row.created_at ? String(row.created_at) : undefined,
      closed_at: row.closed_at ? String(row.closed_at) : null,
      dispatched_at: row.dispatched_at ? String(row.dispatched_at) : null,
    })),
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
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
      COUNT(cb.id) FILTER (WHERE cb.status IN ($1, $2, $3, $4, $5)) as total_boxes,
      COUNT(DISTINCT p.section) as sections,
      COUNT(DISTINCT p.article_name) as articles
    FROM products p
    LEFT JOIN child_boxes cb ON cb.product_id = p.id
    WHERE p.is_active = true
  `, [CHILD_BOX_STATUS.FREE, CHILD_BOX_STATUS.PACKED, CHILD_BOX_STATUS.DISPATCHED, CHILD_BOX_STATUS.SAMPLE, CHILD_BOX_STATUS.ECOMMERCE]);

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

// ─── Inventory Breakdown (7-level drill-down) ────────────────────────────────

export interface BreakdownItem {
  value: string;
  pieces: number;
  child_box_count: number;
  master_carton_count: number;
  loose_child_box_count: number;
  legacy_carton_count: number;                                         // opaque legacy cartons (not pieces)
  legacy_size_groups?: { size_group: string; carton_count: number }[]; // only populated at level 'group'
}

export interface SizeBreakdownEntry {
  size: string;
  pairs: number;
  box_count: number;
}

export interface BreakdownLeafMasterCarton {
  master_carton_id: string;
  carton_barcode: string;
  child_box_count: number;
  pieces: number;
  mrp: number;
  status: string;
  size_breakdown: SizeBreakdownEntry[];
}

export interface BreakdownLeafLooseStock {
  child_box_id: string;
  barcode: string;
  pieces: number;
  mrp: number;
  size: string;
}

export type BreakdownResult =
  | { items: BreakdownItem[] }
  | { master_cartons: BreakdownLeafMasterCarton[]; loose_stock: BreakdownLeafLooseStock[] };

/**
 * Maps a drill-down level to the SQL expression it groups by.
 *
 * Note: the products table has size_from/size_to (not size_group — that column
 * was dropped in migration 20260414100001). We reconstruct a "size_group" label
 * as "size_from-size_to" for the drill-down grouping.
 */
const LEVEL_TO_COLUMN: Record<BreakdownLevel, string> = {
  section:    'p.section',
  category:   'p.category',
  group:      'p.article_group',
  article:    'p.article_name',
  colour:     'p.colour',
  // size_group column was dropped; reconstruct range label from size_from/size_to
  size_group: "COALESCE(p.size_from, '') || CASE WHEN p.size_to IS NOT NULL AND p.size_to != p.size_from THEN '-' || p.size_to ELSE '' END",
  leaf:       '', // handled separately
};

/**
 * Maps each path key to its product column for WHERE filtering.
 *
 * For size_group we filter using BOTH size_from/size_to to reconstruct the
 * original range string match (client sends "6-10" → we match size_from='6' AND size_to='10',
 * or simply match the full reconstructed expression).
 * We use a SQL expression equality for simplicity.
 */
const PATH_KEY_TO_COLUMN: Record<keyof BreakdownPath, string> = {
  section:    'p.section',
  category:   'p.category',
  group:      'p.article_group',
  article:    'p.article_name',
  colour:     'p.colour',
  // Match the same reconstructed expression used in grouping
  size_group: "COALESCE(p.size_from, '') || CASE WHEN p.size_to IS NOT NULL AND p.size_to != p.size_from THEN '-' || p.size_to ELSE '' END",
};

/**
 * "In-warehouse" child box definition used throughout the breakdown query:
 *
 *   PACKED boxes that have an active mapping to a non-DISPATCHED master carton
 *   → counted in master_carton_count rollup, not loose.
 *
 *   FREE boxes with NO active carton_child_mapping row
 *   → counted as loose stock.
 *
 *   GENERATED boxes are EXCLUDED.
 *   Rationale: GENERATED = barcode printed but not yet validated/scanned into
 *   stock. The pack flow in masterCarton.service.ts auto-activates GENERATED
 *   boxes during pack (sets status → PACKED), so any box still GENERATED
 *   has not been physically confirmed as in-stock. Including them would
 *   inflate counts with speculative inventory.
 *
 *   SAMPLE, ECOMMERCE, DISPATCHED are also excluded (out of warehouse scope).
 */
export async function getInventoryBreakdown(input: {
  level: BreakdownLevel;
  path: BreakdownPath;
  channel?: BreakdownChannel;
}): Promise<BreakdownResult> {
  const { level, path } = input;
  const channel: BreakdownChannel = input.channel ?? 'warehouse';

  // Build path filter conditions
  const conditions: string[] = ['p.is_active = true'];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, col] of Object.entries(PATH_KEY_TO_COLUMN) as [keyof BreakdownPath, string][]) {
    if (path[key] !== undefined && path[key] !== '') {
      conditions.push(`${col} = $${paramIndex++}`);
      values.push(path[key]);
    }
  }

  const whereClause = conditions.join(' AND ');

  // ── Channel scoping (sample / ecommerce) ────────────────────────────────────
  // Sample- and e-commerce-allocated boxes carry a single child_boxes.status
  // (SAMPLE / ECOMMERCE) and are never inside a master carton (the pack/scan
  // flows move a box out of its carton when it is allocated). So the breakdown
  // for these channels is a straight per-status roll-up: every matching box is
  // "loose", there are no cartons, and legacy sealed cartons don't apply.
  // CHANNEL_STATUS values come from a validated enum → safe to inline in SQL.
  if (channel !== 'warehouse') {
    const st = channel === 'sample' ? 'SAMPLE' : 'ECOMMERCE';

    if (level === 'leaf') {
      const looseResult = await query(`
        SELECT
          cb.id          AS child_box_id,
          cb.barcode,
          cb.quantity    AS pieces,
          p.mrp::numeric AS mrp,
          p.size         AS size
        FROM child_boxes cb
        JOIN products p ON p.id = cb.product_id
        WHERE cb.status = '${st}'
          AND ${whereClause}
        ORDER BY
          CASE WHEN p.size ~ '^[0-9]+$' THEN p.size::int ELSE 9999 END,
          p.size,
          cb.created_at DESC
      `, values);

      return {
        master_cartons: [],
        loose_stock: looseResult.rows.map(r => ({
          child_box_id: String(r.child_box_id),
          barcode:      String(r.barcode),
          pieces:       parseInt(r.pieces, 10),
          mrp:          parseFloat(r.mrp),
          size:         String(r.size ?? ''),
        })),
      };
    }

    const chanGroupCol = LEVEL_TO_COLUMN[level];
    const chanResult = await query(`
      SELECT
        ${chanGroupCol} AS value,
        COALESCE(SUM(cb.quantity) FILTER (WHERE cb.status = '${st}'), 0)::int AS pieces,
        COUNT(cb.id) FILTER (WHERE cb.status = '${st}')::int                 AS child_box_count,
        0::int                                                                AS master_carton_count,
        COUNT(cb.id) FILTER (WHERE cb.status = '${st}')::int                 AS loose_child_box_count
      FROM products p
      LEFT JOIN child_boxes cb ON cb.product_id = p.id
      WHERE ${whereClause}
      GROUP BY ${chanGroupCol}
      -- Only surface branches that actually hold stock in this channel; unlike
      -- the warehouse view we don't want the full catalog padded with 0-cards.
      HAVING COUNT(cb.id) FILTER (WHERE cb.status = '${st}') > 0
      ORDER BY pieces DESC NULLS LAST
    `, values);

    const chanItems: BreakdownItem[] = chanResult.rows.map(r => ({
      value:                 String(r.value ?? ''),
      pieces:                parseInt(r.pieces, 10),
      child_box_count:       parseInt(r.child_box_count, 10),
      master_carton_count:   parseInt(r.master_carton_count, 10),
      loose_child_box_count: parseInt(r.loose_child_box_count, 10),
      legacy_carton_count:   0,
    }));

    return { items: chanItems };
  }

  // ── Leaf level ─────────────────────────────────────────────────────────────
  if (level === 'leaf') {
    // Master cartons with per-size breakdown.
    // Inner subquery aggregates child boxes by (carton, size, mrp); outer rolls
    // up to one row per carton and json_aggs the size buckets in numeric order.
    const mcResult = await query(`
      SELECT
        mc.id                                  AS master_carton_id,
        mc.carton_barcode,
        SUM(bs.box_count)::int                 AS child_box_count,
        SUM(bs.pairs)::int                     AS pieces,
        MIN(bs.mrp)::numeric                   AS mrp,
        mc.status,
        json_agg(
          json_build_object('size', bs.size, 'pairs', bs.pairs, 'box_count', bs.box_count)
          ORDER BY
            CASE WHEN bs.size ~ '^[0-9]+$' THEN bs.size::int ELSE 9999 END,
            bs.size
        )                                      AS size_breakdown
      FROM master_cartons mc
      JOIN (
        SELECT
          ccm.master_carton_id,
          p.size,
          p.mrp,
          COUNT(cb.id)::int       AS box_count,
          SUM(cb.quantity)::int   AS pairs
        FROM carton_child_mapping ccm
        JOIN child_boxes cb ON cb.id = ccm.child_box_id
          AND ccm.is_active = true
          -- GENERATED excluded: barcode printed but not confirmed in-stock;
          -- SAMPLE, ECOMMERCE, DISPATCHED excluded: outside warehouse scope.
          AND cb.status = 'PACKED'
        JOIN products p ON p.id = cb.product_id
        WHERE ${whereClause}
        GROUP BY ccm.master_carton_id, p.size, p.mrp
      ) AS bs ON bs.master_carton_id = mc.id
      WHERE mc.status != 'DISPATCHED'
      GROUP BY mc.id, mc.carton_barcode, mc.status, mc.created_at
      ORDER BY mc.created_at DESC
    `, values);

    // Loose child boxes: FREE status with no active carton mapping.
    // size column added so the UI can show per-box size.
    const looseResult = await query(`
      SELECT
        cb.id        AS child_box_id,
        cb.barcode,
        cb.quantity  AS pieces,
        p.mrp::numeric AS mrp,
        p.size       AS size
      FROM child_boxes cb
      JOIN products p ON p.id = cb.product_id
      WHERE cb.status = 'FREE'
        AND NOT EXISTS (
          SELECT 1 FROM carton_child_mapping ccm2
          WHERE ccm2.child_box_id = cb.id AND ccm2.is_active = true
        )
        AND ${whereClause}
      ORDER BY
        CASE WHEN p.size ~ '^[0-9]+$' THEN p.size::int ELSE 9999 END,
        p.size,
        cb.created_at DESC
    `, values);

    return {
      master_cartons: mcResult.rows.map(r => ({
        master_carton_id: String(r.master_carton_id),
        carton_barcode:   String(r.carton_barcode),
        child_box_count:  parseInt(r.child_box_count, 10),
        pieces:           parseInt(r.pieces, 10),
        mrp:              parseFloat(r.mrp),
        status:           String(r.status),
        size_breakdown:   Array.isArray(r.size_breakdown) ? r.size_breakdown.map((sb: { size: string; pairs: number | string; box_count: number | string }) => ({
          size:      String(sb.size ?? ''),
          pairs:     typeof sb.pairs === 'number' ? sb.pairs : parseInt(String(sb.pairs), 10),
          box_count: typeof sb.box_count === 'number' ? sb.box_count : parseInt(String(sb.box_count), 10),
        })) : [],
      })),
      loose_stock: looseResult.rows.map(r => ({
        child_box_id: String(r.child_box_id),
        barcode:      String(r.barcode),
        pieces:       parseInt(r.pieces, 10),
        mrp:          parseFloat(r.mrp),
        size:         String(r.size ?? ''),
      })),
    };
  }

  // ── Non-leaf levels ────────────────────────────────────────────────────────
  const groupCol = LEVEL_TO_COLUMN[level];

  const result = await query(`
    SELECT
      ${groupCol} AS value,

      -- Pieces: sum quantity of all in-warehouse child boxes at this level.
      -- Packed boxes inside non-DISPATCHED cartons + FREE loose boxes.
      -- GENERATED excluded (pre-stock); SAMPLE/ECOMMERCE/DISPATCHED excluded.
      COALESCE(SUM(cb.quantity) FILTER (
        WHERE (
          -- PACKED boxes in a non-DISPATCHED carton
          (cb.status = 'PACKED'
           AND EXISTS (
             SELECT 1 FROM carton_child_mapping ccm2
             JOIN master_cartons mc2 ON mc2.id = ccm2.master_carton_id
             WHERE ccm2.child_box_id = cb.id
               AND ccm2.is_active = true
               AND mc2.status != 'DISPATCHED'
           )
          )
          OR
          -- FREE loose boxes with no active carton mapping
          (cb.status = 'FREE'
           AND NOT EXISTS (
             SELECT 1 FROM carton_child_mapping ccm3
             WHERE ccm3.child_box_id = cb.id AND ccm3.is_active = true
           )
          )
        )
      ), 0)::int AS pieces,

      -- child_box_count: total in-warehouse boxes (packed + loose)
      COUNT(cb.id) FILTER (
        WHERE (
          (cb.status = 'PACKED'
           AND EXISTS (
             SELECT 1 FROM carton_child_mapping ccm2
             JOIN master_cartons mc2 ON mc2.id = ccm2.master_carton_id
             WHERE ccm2.child_box_id = cb.id
               AND ccm2.is_active = true
               AND mc2.status != 'DISPATCHED'
           )
          )
          OR
          (cb.status = 'FREE'
           AND NOT EXISTS (
             SELECT 1 FROM carton_child_mapping ccm3
             WHERE ccm3.child_box_id = cb.id AND ccm3.is_active = true
           )
          )
        )
      )::int AS child_box_count,

      -- master_carton_count: distinct non-DISPATCHED cartons containing matching packed boxes
      COUNT(DISTINCT CASE
        WHEN cb.status = 'PACKED' THEN mc.id
        ELSE NULL
      END)::int AS master_carton_count,

      -- loose_child_box_count: FREE boxes with no active mapping
      COUNT(cb.id) FILTER (
        WHERE cb.status = 'FREE'
          AND NOT EXISTS (
            SELECT 1 FROM carton_child_mapping ccm3
            WHERE ccm3.child_box_id = cb.id AND ccm3.is_active = true
          )
      )::int AS loose_child_box_count

    FROM products p
    LEFT JOIN child_boxes cb ON cb.product_id = p.id
    LEFT JOIN carton_child_mapping ccm ON ccm.child_box_id = cb.id AND ccm.is_active = true
    LEFT JOIN master_cartons mc ON mc.id = ccm.master_carton_id AND mc.status != 'DISPATCHED'
    WHERE ${whereClause}
    GROUP BY ${groupCol}
    ORDER BY pieces DESC NULLS LAST
  `, values);

  // ── Map product rows (legacy_carton_count starts at 0 for all) ───────────────
  const items: BreakdownItem[] = result.rows.map(r => ({
    value:                 String(r.value ?? ''),
    pieces:                parseInt(r.pieces, 10),
    child_box_count:       parseInt(r.child_box_count, 10),
    master_carton_count:   parseInt(r.master_carton_count, 10),
    loose_child_box_count: parseInt(r.loose_child_box_count, 10),
    legacy_carton_count:   0,
  }));

  // ── Legacy aggregation (section / category / group only) ─────────────────────
  // Skip for article / colour / size_group / leaf — legacy data can't reach those depths.
  // Also skip if the path already drills into article or colour (no legacy match possible).
  const legacyApplicableLevels: BreakdownLevel[] = ['section', 'category', 'group'];
  const pathHasArticleOrColour = (path.article !== undefined && path.article !== '')
    || (path.colour !== undefined && path.colour !== '');

  if (legacyApplicableLevels.includes(level) && !pathHasArticleOrColour) {
    // Build legacy WHERE conditions using only legacy-applicable path keys
    const legacyConds: string[] = ['mc.is_legacy = true'];
    const legacyVals: unknown[] = [];
    let legacyParamIdx = 1;

    if (path.section !== undefined && path.section !== '') {
      legacyConds.push(`mc.section = $${legacyParamIdx++}`);
      legacyVals.push(path.section);
    }
    if (path.category !== undefined && path.category !== '') {
      legacyConds.push(`mc.category = $${legacyParamIdx++}`);
      legacyVals.push(path.category);
    }
    if (path.group !== undefined && path.group !== '') {
      legacyConds.push(`mc.article_group = $${legacyParamIdx++}`);
      legacyVals.push(path.group);
    }

    const legacyWhere = legacyConds.join(' AND ');

    // Determine which column to group by for the primary legacy aggregation
    const legacyGroupCol =
      level === 'section'  ? 'mc.section' :
      level === 'category' ? 'mc.category' :
      /* group */            'mc.article_group';

    const legacyResult = await query(`
      SELECT ${legacyGroupCol} AS value, COUNT(*)::int AS carton_count
      FROM master_cartons mc
      WHERE ${legacyWhere}
      GROUP BY ${legacyGroupCol}
    `, legacyVals);

    // Build map: value → legacy_carton_count
    const legacyMap = new Map<string, number>();
    for (const row of legacyResult.rows) {
      legacyMap.set(String(row.value ?? ''), parseInt(row.carton_count, 10));
    }

    // At group level, also fetch per size_group splits
    let legacySizeGroupMap: Map<string, { size_group: string; carton_count: number }[]> | null = null;
    if (level === 'group') {
      const sgResult = await query(`
        SELECT mc.article_group AS grp, mc.size_group, COUNT(*)::int AS carton_count
        FROM master_cartons mc
        WHERE ${legacyWhere}
        GROUP BY mc.article_group, mc.size_group
      `, legacyVals);

      legacySizeGroupMap = new Map<string, { size_group: string; carton_count: number }[]>();
      for (const row of sgResult.rows) {
        const grp = String(row.grp ?? '');
        if (!legacySizeGroupMap.has(grp)) legacySizeGroupMap.set(grp, []);
        legacySizeGroupMap.get(grp)!.push({
          size_group: String(row.size_group ?? ''),
          carton_count: parseInt(row.carton_count, 10),
        });
      }
    }

    // Attach legacy counts to matching product rows
    const seenValues = new Set<string>();
    for (const item of items) {
      seenValues.add(item.value);
      const legacyCount = legacyMap.get(item.value) ?? 0;
      item.legacy_carton_count = legacyCount;
      if (level === 'group' && legacySizeGroupMap && legacyCount > 0) {
        item.legacy_size_groups = legacySizeGroupMap.get(item.value) ?? [];
      }
    }

    // Append synthetic items for legacy-only values (no product row at this level)
    for (const [value, count] of legacyMap) {
      if (seenValues.has(value)) continue;
      const synthetic: BreakdownItem = {
        value,
        pieces: 0,
        child_box_count: 0,
        master_carton_count: 0,
        loose_child_box_count: 0,
        legacy_carton_count: count,
      };
      if (level === 'group' && legacySizeGroupMap) {
        synthetic.legacy_size_groups = legacySizeGroupMap.get(value) ?? [];
      }
      items.push(synthetic);
    }
  }

  return { items };
}
