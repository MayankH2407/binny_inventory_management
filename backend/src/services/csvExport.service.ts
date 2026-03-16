import { query } from '../config/database';
import { getProductWiseReport, getDailyActivity } from './report.service';

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
    SELECT dr.*, mc.carton_barcode, mc.child_count, u.name as dispatched_by_name
    FROM dispatch_records dr
    JOIN master_cartons mc ON mc.id = dr.master_carton_id
    JOIN users u ON u.id = dr.dispatched_by
    ${whereClause}
    ORDER BY dr.dispatch_date DESC
  `, values);

  const headers = [
    'Dispatch Date', 'Carton Barcode', 'Boxes', 'Destination',
    'Vehicle', 'LR Number', 'Transport Details', 'Dispatched By', 'Notes',
  ];

  const rows = result.rows.map((r: Record<string, unknown>) => [
    String(r.dispatch_date ?? ''),
    String(r.carton_barcode ?? ''),
    String(r.child_count ?? ''),
    String(r.destination ?? ''),
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
