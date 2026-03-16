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
  // First try to find a child box
  const childBoxResult = await query(
    `SELECT cb.*, p.* FROM child_boxes cb JOIN products p ON p.id = cb.product_id WHERE cb.barcode = $1`,
    [barcode]
  );

  if (childBoxResult.rows.length > 0) {
    const childBox = childBoxResult.rows[0];

    // Get current master carton mapping
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

    // Get timeline
    const timelineResult = await query(
      `SELECT it.*, u.name as performed_by_name FROM inventory_transactions it LEFT JOIN users u ON u.id = it.performed_by WHERE it.child_box_id = $1 ORDER BY it.created_at ASC`,
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

    // Get timeline
    const timelineResult = await query(
      `SELECT it.*, u.name as performed_by_name FROM inventory_transactions it LEFT JOIN users u ON u.id = it.performed_by WHERE it.master_carton_id = $1 ORDER BY it.created_at ASC`,
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
