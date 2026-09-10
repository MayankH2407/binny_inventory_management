import { query } from '../config/database';
import { getProductWiseReport, getDailyActivity, getSampleReport, getEcommerceReport, getCartonInventoryReport } from './report.service';
import { getCartonHierarchy } from './inventory.service';
import { dateFromCondition, dateToCondition } from '../utils/dateRange';
import { sizeGroupExpr } from '../utils/sizeGroup';

function toCSV(headers: string[], rows: string[][]): string {
  const escape = (val: string) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const headerLine = headers.map(escape).join(',');
  const dataLines = rows.map(row => row.map(escape).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export async function exportInventorySummaryCSV(): Promise<string> {
  const products = await getProductWiseReport();

  const headers = [
    'SKU', 'Article', 'Colour', 'Size',
    'Total Boxes', 'Free', 'Packed', 'Dispatched',
    'Total Pairs', 'In Stock', 'Dispatched Pairs',
  ];

  const rows = products.map(p => [
    String(p.product_sku),
    String(p.product_name),
    String(p.colour),
    String(p.size),
    String(p.total_child_boxes),
    String(p.free_boxes),
    String(p.packed_boxes),
    String(p.dispatched_boxes),
    String(p.total_pairs),
    String(p.pairs_in_stock),
    String(p.pairs_dispatched),
  ]);

  return toCSV(headers, rows);
}

export interface PartyWiseDispatchRow {
  party_name: string;
  product_name: string;
  size_group: string;
  qty: number;
  master_carton_count: number;
}

/**
 * Party-wise dispatch aggregation (client spec: Party Name | Product Name |
 * Size Group | Qty | Master Carton). Grain = party × article × size-group,
 * aggregated across the whole date-filtered range — NOT one row per dispatch
 * record, unlike the old 26-column export this replaced. Shared by both the
 * CSV export below and the PDF summary data endpoint (dispatch.controller.ts)
 * so the two downloads offered from the same date range never disagree.
 *
 * The 5-branch LATERAL union gathering child boxes across all 3 dispatch
 * sources (master carton / sample / e-commerce, whole-carton and loose
 * variants) is unchanged from the prior version — still the correct roll-up
 * post samples/e-commerce pool redesigns. Each branch now ALSO projects the
 * master_carton_id it shipped through (NULL for the two loose-box branches,
 * since a loose box was never in a carton) so `Master Carton` can be a true
 * COUNT(DISTINCT ...) of actual cartons — the old getDispatchSummary only
 * ever counted dr.master_carton_id directly, undercounting cartons reached
 * via a sample/e-commerce whole-carton allocation.
 */
export async function getPartyWiseDispatchRows(fromDate?: string, toDate?: string): Promise<PartyWiseDispatchRow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (fromDate) {
    conditions.push(dateFromCondition('dr.dispatch_date', paramIndex++));
    values.push(fromDate);
  }
  if (toDate) {
    conditions.push(dateToCondition('dr.dispatch_date', paramIndex++));
    values.push(toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sizeGroup = sizeGroupExpr('p');

  const result = await query(`
    SELECT
      COALESCE(c.firm_name, 'Walk-in / No Customer') AS party_name,
      p.article_name                                 AS product_name,
      ${sizeGroup}                                    AS size_group,
      -- Foot-aware: a box shipped as a single shoe (sample dispatch, foot
      -- LEFT/RIGHT) bills as half a pair, not a full pair. Every other source
      -- ships whole pairs (src.foot is NULL there), collapsing to cb.quantity.
      COALESCE(SUM(CASE WHEN src.foot IN ('LEFT', 'RIGHT') THEN 0.5 ELSE cb.quantity END), 0) AS qty,
      COUNT(DISTINCT src.master_carton_id)           AS master_carton_count
    FROM dispatch_records dr
    LEFT JOIN customers c ON c.id = dr.customer_id
    JOIN LATERAL (
      SELECT ccm.child_box_id, NULL::varchar(10) AS foot, ccm.master_carton_id
      FROM carton_child_mapping ccm WHERE ccm.master_carton_id = dr.master_carton_id AND ccm.is_active = true
      UNION ALL
      -- Samples pool redesign: mapping rows stay is_active=true forever for
      -- history (shipped or not) — dispatch_record_id = dr.id is what "shipped
      -- on THIS dispatch" actually means. foot carries through for the
      -- half-pair billing above; no carton (a loose sample box).
      SELECT sbm.child_box_id, sbm.foot, NULL::uuid FROM sample_box_mapping sbm WHERE sbm.dispatch_record_id = dr.id
      UNION ALL
      -- Whole cartons scanned intact into a sample (carton stays PACKED; see
      -- unpackCartonInSample) — no foot concept, real carton id.
      SELECT ccm.child_box_id, NULL::varchar(10) AS foot, ccm.master_carton_id FROM sample_carton_mapping scm
      JOIN carton_child_mapping ccm ON ccm.master_carton_id = scm.master_carton_id AND ccm.is_active = true
      WHERE scm.dispatch_record_id = dr.id
      UNION ALL
      -- E-commerce pool: loose boxes shipped on this dispatch. No is_active filter —
      -- a returned item must still show on its original shipment's row.
      SELECT ebm.child_box_id, NULL::varchar(10) AS foot, NULL::uuid FROM ecommerce_box_mapping ebm WHERE ebm.dispatch_record_id = dr.id
      UNION ALL
      -- E-commerce pool: whole cartons shipped on this dispatch (carton stays intact
      -- until unpacked; see ecommerce.service.ts#unpackCartonInEcommercePool).
      SELECT ccm.child_box_id, NULL::varchar(10) AS foot, ccm.master_carton_id FROM ecommerce_carton_mapping ecm
      JOIN carton_child_mapping ccm ON ccm.master_carton_id = ecm.master_carton_id AND ccm.is_active = true
      WHERE ecm.dispatch_record_id = dr.id
    ) src ON true
    JOIN child_boxes cb ON cb.id = src.child_box_id
    JOIN products p ON p.id = cb.product_id
    ${whereClause}
    GROUP BY c.id, p.article_name, ${sizeGroup}
    ORDER BY party_name, product_name, size_group
  `, values);

  return result.rows.map((r: Record<string, unknown>) => ({
    party_name: String(r.party_name ?? ''),
    product_name: String(r.product_name ?? ''),
    size_group: String(r.size_group ?? ''),
    qty: Number(r.qty ?? 0),
    master_carton_count: Number(r.master_carton_count ?? 0),
  }));
}

export async function exportDispatchCSV(fromDate?: string, toDate?: string): Promise<string> {
  const rows = await getPartyWiseDispatchRows(fromDate, toDate);
  const headers = ['Party Name', 'Product Name', 'Size Group', 'Qty', 'Master Carton'];
  const csvRows = rows.map((r) => [
    r.party_name,
    r.product_name,
    r.size_group,
    String(r.qty),
    String(r.master_carton_count),
  ]);
  return toCSV(headers, csvRows);
}

export async function exportDailyActivityCSV(fromDate: string, toDate: string): Promise<string> {
  const activity = await getDailyActivity(fromDate, toDate);

  const headers = [
    'Date', 'Boxes Created', 'Boxes Packed', 'Boxes Unpacked',
    'Boxes Dispatched', 'Cartons Created', 'Cartons Closed', 'Cartons Dispatched',
  ];

  const rows = activity.map(a => [
    String(a.date),
    String(a.boxes_created),
    String(a.boxes_packed),
    String(a.boxes_unpacked),
    String(a.boxes_dispatched),
    String(a.cartons_created),
    String(a.cartons_closed),
    String(a.cartons_dispatched),
  ]);

  return toCSV(headers, rows);
}

export async function exportSampleReportCSV(filters: {
  from?: string;
  to?: string;
  customer_id?: string;
}): Promise<string> {
  const report = await getSampleReport(filters);

  const headers = [
    'Dispatch Date', 'Sample Barcode', 'Name', 'Recipient', 'Purpose', 'Reference Date',
    'Customer', 'Destination', 'Box Count', 'Pairs', 'Article', 'Colour', 'Size',
    'Dispatched By', 'Notes',
  ];

  const rows = report.rows.map((r) => [
    r.dispatch_date ? new Date(r.dispatch_date as string).toISOString().slice(0, 10) : '',
    String(r.sample_barcode ?? ''),
    String(r.sample_name ?? ''),
    String(r.recipient_name ?? ''),
    String(r.purpose ?? ''),
    String(r.reference_date ?? ''),
    String(r.customer_name ?? ''),
    String(r.destination ?? ''),
    String(r.box_count ?? ''),
    String(r.pairs ?? ''),
    String(r.article_summary ?? ''),
    String(r.colour_summary ?? ''),
    String(r.size_summary ?? ''),
    String(r.dispatched_by_name ?? ''),
    String(r.notes ?? ''),
  ]);

  return toCSV(headers, rows);
}

export async function exportCartonHierarchyCSV(
  level: 'status' | 'section' | 'article_name' | 'carton',
  filters: {
    status?: string;
    section?: string;
    article_name?: string;
    search?: string;
  }
): Promise<string> {
  if (level === 'status') {
    const result = await getCartonHierarchy('status', { ...filters, page: 1, limit: 10000 });
    const headers = ['Status', 'Carton Count', 'Child Boxes', 'Total Pairs', 'Avg Utilization %'];
    const rows = result.data.map(row => [
      String(row.name ?? ''),
      String(row.cartonCount ?? 0),
      String(row.childBoxCount ?? 0),
      String(row.totalPairs ?? 0),
      String(row.avgUtilization ?? 0),
    ]);
    return toCSV(headers, rows);
  }

  if (level === 'section') {
    const result = await getCartonHierarchy('section', { ...filters, page: 1, limit: 10000 });
    const headers = ['Section', 'Carton Count', 'Created', 'Active', 'Closed', 'Dispatched', 'Child Boxes', 'Total Pairs'];
    const rows = result.data.map(row => [
      String(row.name ?? ''),
      String(row.cartonCount ?? 0),
      String(row.createdCount ?? 0),
      String(row.activeCount ?? 0),
      String(row.closedCount ?? 0),
      String(row.dispatchedCount ?? 0),
      String(row.childBoxCount ?? 0),
      String(row.totalPairs ?? 0),
    ]);
    return toCSV(headers, rows);
  }

  if (level === 'article_name') {
    const result = await getCartonHierarchy('article_name', { ...filters, page: 1, limit: 10000 });
    const headers = ['Section', 'Article', 'Carton Count', 'Created', 'Active', 'Closed', 'Dispatched', 'Child Boxes', 'Total Pairs'];
    const rows = result.data.map(row => [
      String(row.primary_section ?? ''),
      String(row.name ?? ''),
      String(row.cartonCount ?? 0),
      String(row.createdCount ?? 0),
      String(row.activeCount ?? 0),
      String(row.closedCount ?? 0),
      String(row.dispatchedCount ?? 0),
      String(row.childBoxCount ?? 0),
      String(row.totalPairs ?? 0),
    ]);
    return toCSV(headers, rows);
  }

  // Carton leaf level — fetch all pages
  const result = await getCartonHierarchy('carton', { ...filters, page: 1, limit: 10000 });
  const headers = [
    'Carton Barcode', 'Status', 'Section (Primary)', 'Article (Primary)',
    'Child Count', 'Max Capacity', 'Utilization %', 'Created At', 'Closed At', 'Dispatched At',
  ];
  const rows = result.data.map(row => {
    const utilization = row.max_capacity && row.max_capacity > 0
      ? Math.round(((row.child_count ?? 0) / row.max_capacity) * 100)
      : 0;
    return [
      String(row.carton_barcode ?? ''),
      String(row.status ?? ''),
      String(row.primary_section ?? ''),
      String(row.primary_article ?? ''),
      String(row.child_count ?? 0),
      String(row.max_capacity ?? 0),
      String(utilization),
      row.created_at ? new Date(row.created_at).toISOString() : '',
      row.closed_at ? new Date(row.closed_at).toISOString() : '',
      row.dispatched_at ? new Date(row.dispatched_at).toISOString() : '',
    ];
  });
  return toCSV(headers, rows);
}

export async function exportCartonInventoryCSV(status?: string): Promise<string> {
  const cartons = await getCartonInventoryReport();
  const filtered = status ? cartons.filter((c) => c.status === status) : cartons;

  const headers = [
    'Carton Barcode', 'Status', 'Boxes', 'Max Capacity', 'Created By',
    'Created At', 'Closed At', 'Dispatched At', 'Destination',
  ];

  const rows = filtered.map((c) => [
    String(c.carton_barcode ?? ''),
    String(c.status ?? ''),
    String(c.child_count ?? ''),
    String(c.max_capacity ?? ''),
    String(c.created_by_name ?? ''),
    c.created_at ? new Date(c.created_at).toISOString() : '',
    c.closed_at ? new Date(c.closed_at).toISOString() : '',
    c.dispatched_at ? new Date(c.dispatched_at).toISOString() : '',
    String(c.destination ?? ''),
  ]);

  return toCSV(headers, rows);
}

export async function exportReturnCSV(fromDate?: string, toDate?: string): Promise<string> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (fromDate) {
    conditions.push(`rr.return_date >= $${paramIndex++}`);
    values.push(fromDate);
  }
  if (toDate) {
    conditions.push(`rr.return_date <= $${paramIndex++}`);
    values.push(toDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Itemized: one row per return × product variant (and, for whole-carton returns,
  // per returned carton) — mirrors exportDispatchCSV's grouping style.
  const result = await query(`
    SELECT
      rr.return_date,
      COALESCE(odmc.carton_barcode, odsr.sample_barcode, oder.ecommerce_barcode, NULLIF(dr.order_reference, ''), NULLIF(dr.reference_name, ''), NULLIF(dr.marketplace, ''), CASE WHEN dr.source_type = 'ECOMMERCE' THEN 'E-commerce' END) AS origin_dispatch,
      COALESCE(c.firm_name, 'Walk-in / No Customer') AS customer_name,
      ri.item_type,
      mci.carton_barcode,
      p.section,
      p.article_name,
      p.article_code,
      p.colour,
      p.size,
      p.hsn_code,
      COUNT(DISTINCT ri.child_box_id) AS box_count,
      COALESCE(SUM(cb.quantity), 0) AS pairs,
      p.mrp,
      u.name AS returned_by_name,
      rr.reason,
      rr.notes
    FROM return_records rr
    LEFT JOIN customers c ON c.id = rr.customer_id
    JOIN users u ON u.id = rr.returned_by
    JOIN return_items ri ON ri.return_record_id = rr.id
    JOIN child_boxes cb ON cb.id = ri.child_box_id
    JOIN products p ON p.id = cb.product_id
    LEFT JOIN master_cartons mci ON mci.id = ri.master_carton_id
    -- Origin dispatch resolved per item (handles blind scan-in, where the return
    -- itself has no single dispatch link)
    LEFT JOIN dispatch_records dr ON dr.id = ri.dispatch_record_id
    LEFT JOIN master_cartons odmc ON odmc.id = dr.master_carton_id
    LEFT JOIN sample_records odsr ON odsr.id = dr.sample_record_id
    LEFT JOIN ecommerce_records oder ON oder.id = dr.ecommerce_record_id
    ${whereClause}
    GROUP BY rr.id, c.id, u.id, p.id, ri.item_type, mci.id, dr.id, odmc.id, odsr.id, oder.id
    ORDER BY customer_name, rr.return_date DESC, mci.carton_barcode, p.article_name, p.colour, p.size
  `, values);

  const headers = [
    'Return Date', 'Origin Dispatch', 'Customer', 'Item Type', 'Carton Barcode',
    'Section', 'Article', 'Article Code', 'Colour', 'Size', 'HSN Code',
    'Boxes', 'Pairs', 'MRP', 'Returned By', 'Reason', 'Notes',
  ];

  const num = (v: unknown) => (v === null || v === undefined ? '' : Number(v).toFixed(2));

  const rows = result.rows.map((r: Record<string, unknown>) => [
    r.return_date ? new Date(r.return_date as string).toISOString().slice(0, 10) : '',
    String(r.origin_dispatch ?? ''),
    String(r.customer_name ?? ''),
    String(r.item_type ?? ''),
    String(r.carton_barcode ?? ''),
    String(r.section ?? ''),
    String(r.article_name ?? ''),
    String(r.article_code ?? ''),
    String(r.colour ?? ''),
    String(r.size ?? ''),
    String(r.hsn_code ?? ''),
    String(r.box_count ?? ''),
    String(r.pairs ?? ''),
    num(r.mrp),
    String(r.returned_by_name ?? ''),
    String(r.reason ?? ''),
    String(r.notes ?? ''),
  ]);

  return toCSV(headers, rows);
}

export async function exportEcommerceReportCSV(filters: {
  from?: string;
  to?: string;
  marketplace?: string;
}): Promise<string> {
  const report = await getEcommerceReport(filters);

  const headers = [
    'Dispatch Date', 'Reference Name', 'Marketplace', 'Order Reference', 'Listing SKU', 'Order Date',
    'Customer', 'Destination', 'Box Count', 'Pairs', 'Article', 'Colour', 'Size',
    'LR Number', 'Vehicle Number', 'Dispatched By', 'Notes',
  ];

  const rows = report.rows.map((r) => [
    r.dispatch_date ? new Date(r.dispatch_date as string).toISOString().slice(0, 10) : '',
    String(r.reference_name ?? ''),
    String(r.marketplace ?? ''),
    String(r.order_reference ?? ''),
    String(r.listing_sku ?? ''),
    String(r.order_date ?? ''),
    String(r.customer_firm_name ?? ''),
    String(r.destination ?? ''),
    String(r.box_count ?? ''),
    String(r.pairs ?? ''),
    String(r.article_summary ?? ''),
    String(r.colour_summary ?? ''),
    String(r.size_summary ?? ''),
    String(r.lr_number ?? ''),
    String(r.vehicle_number ?? ''),
    String(r.dispatched_by_name ?? ''),
    String(r.notes ?? ''),
  ]);

  return toCSV(headers, rows);
}
