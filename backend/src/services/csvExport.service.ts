import { query } from '../config/database';
import { getProductWiseReport, getDailyActivity, getSampleReport, getEcommerceReport } from './report.service';
import { SampleStatus, EcommerceStatus } from '../config/constants';
import { getCartonHierarchy } from './inventory.service';

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

export async function exportDispatchCSV(fromDate?: string, toDate?: string): Promise<string> {
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

  const result = await query(`
    SELECT
      COALESCE(c.firm_name, 'Walk-in / No Customer') as customer_name,
      dr.dispatch_date,
      dr.destination,
      mc.carton_barcode,
      mc.child_count,
      p.article_name,
      p.colour,
      p.size,
      p.mrp,
      COUNT(DISTINCT ccm.child_box_id) as box_count,
      dr.vehicle_number,
      dr.lr_number,
      dr.transport_details,
      u.name as dispatched_by_name,
      dr.notes
    FROM dispatch_records dr
    JOIN master_cartons mc ON mc.id = dr.master_carton_id
    JOIN users u ON u.id = dr.dispatched_by
    LEFT JOIN customers c ON c.id = dr.customer_id
    LEFT JOIN carton_child_mapping ccm ON ccm.master_carton_id = mc.id
    LEFT JOIN child_boxes cb ON cb.id = ccm.child_box_id
    LEFT JOIN products p ON p.id = cb.product_id
    ${whereClause}
    GROUP BY c.firm_name, dr.dispatch_date, dr.destination, mc.carton_barcode,
             mc.child_count, p.article_name, p.colour, p.size, p.mrp,
             dr.vehicle_number, dr.lr_number, dr.transport_details, u.name, dr.notes
    ORDER BY c.firm_name, dr.dispatch_date DESC, mc.carton_barcode
  `, values);

  const headers = [
    'Customer', 'Dispatch Date', 'Destination', 'Carton Barcode', 'Boxes',
    'Article', 'Colour', 'Size', 'MRP',
    'Vehicle', 'LR Number', 'Transport Details', 'Dispatched By', 'Notes',
  ];

  const rows = result.rows.map((r: Record<string, unknown>) => [
    String(r.customer_name ?? ''),
    String(r.dispatch_date ?? ''),
    String(r.destination ?? ''),
    String(r.carton_barcode ?? ''),
    String(r.child_count ?? ''),
    String(r.article_name ?? ''),
    String(r.colour ?? ''),
    String(r.size ?? ''),
    String(r.mrp ?? ''),
    String(r.vehicle_number ?? ''),
    String(r.lr_number ?? ''),
    String(r.transport_details ?? ''),
    String(r.dispatched_by_name ?? ''),
    String(r.notes ?? ''),
  ]);

  return toCSV(headers, rows);
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
  from?: Date;
  to?: Date;
  status?: SampleStatus;
  customer_id?: string;
}): Promise<string> {
  const report = await getSampleReport(filters);

  const headers = [
    'Sample Barcode', 'Name', 'Customer', 'Recipient', 'Status',
    'Box Count', 'Sample Date', 'Created At', 'Dispatched At', 'Created By',
  ];

  const rows = report.rows.map((r) => [
    String(r.sample_barcode ?? ''),
    String(r.name ?? ''),
    String(r.customer_name ?? ''),
    String(r.recipient_name ?? ''),
    String(r.status ?? ''),
    String(r.child_count ?? ''),
    String(r.sample_date ?? ''),
    String(r.created_at ?? ''),
    String(r.dispatched_at ?? ''),
    String(r.creator_name ?? ''),
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

export async function exportEcommerceReportCSV(filters: {
  from?: Date;
  to?: Date;
  status?: EcommerceStatus;
  marketplace?: string;
}): Promise<string> {
  const report = await getEcommerceReport(filters);

  const headers = [
    'E-commerce Barcode', 'Name', 'Marketplace', 'Order Reference', 'Listing SKU',
    'Status', 'Box Count', 'Mapped Date', 'Created At', 'Dispatched At', 'Created By',
  ];

  const rows = report.rows.map((r) => [
    String(r.ecommerce_barcode ?? ''),
    String(r.name ?? ''),
    String(r.marketplace ?? ''),
    String(r.order_reference ?? ''),
    String(r.listing_sku ?? ''),
    String(r.status ?? ''),
    String(r.child_count ?? ''),
    String(r.mapped_date ?? ''),
    String(r.created_at ?? ''),
    String(r.dispatched_at ?? ''),
    String(r.creator_name ?? ''),
  ]);

  return toCSV(headers, rows);
}
