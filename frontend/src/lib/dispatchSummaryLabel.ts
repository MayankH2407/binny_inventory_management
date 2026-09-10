import toast from 'react-hot-toast';
import type { PartyWiseDispatchRow } from '@/services/dispatch.service';

/**
 * Opens a print window for the party-wise dispatch summary (A4 page).
 * Same browser print-to-PDF pattern as childBoxLabel.ts / masterCartonLabel.ts
 * / sampleLabel.ts — no server-side PDF library, the user picks "Save as PDF"
 * from the browser's print dialog. Built from the exact same aggregation as
 * the CSV export (dispatchService.getSummary / exportCsv both read
 * csvExportService.getPartyWiseDispatchRows), so the two downloads offered
 * from the same date range never disagree.
 */
export function printDispatchSummary(
  rows: PartyWiseDispatchRow[],
  fromDate?: string,
  toDate?: string,
): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Please allow popups to print the summary');
    return;
  }

  const rangeLabel = fromDate || toDate
    ? `${fromDate || 'earliest'} to ${toDate || 'latest'}`
    : 'All dispatches';

  // Group rows by party for a readable report — the query already sorts by
  // party_name, product_name, size_group, so this preserves that order.
  const byParty = new Map<string, PartyWiseDispatchRow[]>();
  for (const row of rows) {
    const list = byParty.get(row.party_name) ?? [];
    list.push(row);
    byParty.set(row.party_name, list);
  }

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const partySections = Array.from(byParty.entries()).map(([party, items]) => {
    const partyQty = items.reduce((sum, r) => sum + r.qty, 0);
    const partyCartons = items.reduce((sum, r) => sum + r.master_carton_count, 0);
    const itemRows = items.map((r) => `
      <tr>
        <td>${escapeHtml(r.product_name)}</td>
        <td>${escapeHtml(r.size_group) || '-'}</td>
        <td class="num">${r.qty}</td>
        <td class="num">${r.master_carton_count}</td>
      </tr>
    `).join('');

    return `
      <h2>${escapeHtml(party)}</h2>
      <table>
        <thead>
          <tr><th>Product Name</th><th>Size Group</th><th class="num">Qty</th><th class="num">Master Carton</th></tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="2">Party Total</td>
            <td class="num">${partyQty}</td>
            <td class="num">${partyCartons}</td>
          </tr>
        </tfoot>
      </table>
    `;
  }).join('');

  const grandQty = rows.reduce((sum, r) => sum + r.qty, 0);
  const grandCartons = rows.reduce((sum, r) => sum + r.master_carton_count, 0);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Dispatch Summary</title>
      <style>
        @page { size: A4; margin: 15mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; }
        h1 { font-size: 16px; margin: 0 0 4px; }
        .meta { font-size: 11px; color: #555; margin-bottom: 16px; }
        h2 { font-size: 13px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 4px; }
        th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; }
        th { background: #f3f4f6; }
        td.num, th.num { text-align: right; }
        tfoot .total-row td { font-weight: bold; background: #fafafa; }
        .grand-total { margin-top: 16px; font-size: 12px; font-weight: bold; text-align: right; }
      </style>
    </head>
    <body>
      <h1>Dispatch Summary</h1>
      <p class="meta">${escapeHtml(rangeLabel)} &bull; Generated ${new Date().toLocaleString('en-IN')}</p>
      ${rows.length === 0 ? '<p>No dispatches in this range.</p>' : partySections}
      ${rows.length > 0 ? `<p class="grand-total">Grand Total — Qty: ${grandQty} &bull; Master Cartons: ${grandCartons}</p>` : ''}
      <script>
        window.onload = function () { window.print(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
}
