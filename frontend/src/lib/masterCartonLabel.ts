import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import toast from 'react-hot-toast';
import type { MasterCarton, AssortmentItem } from '@/types';
import { sortSizes } from '@/lib/sizeSort';

/**
 * Opens a print window for a master-carton label (146mm × 96mm).
 *
 * Shared by the master-carton detail page and the Unpack/Repack screen so the
 * exact same label renders from either place. `assortment` is the per-size
 * pivot of the carton's current contents (from `getAssortment`); pass `[]` if
 * unavailable (the label then shows '-' placeholders).
 */
export function printMasterCartonLabel(
  carton: MasterCarton,
  assortment: AssortmentItem[],
): void {
  const printWindow = window.open('', '_blank', 'width=500,height=700');
  if (!printWindow) {
    toast.error('Please allow popups to print labels');
    return;
  }

  // Compute size assortment from assortment data: pivot by size.
  // Aggregate distinct articles / colours / MRPs across all rows so a
  // multi-colour or multi-MRP carton lists every value, not just the first.
  const sizeMap: Record<string, number> = {};
  const articleSet = new Set<string>();
  const colourSet = new Set<string>();
  const mrpSet = new Set<number>();

  if (assortment && assortment.length > 0) {
    for (const item of assortment) {
      sizeMap[item.size] = (sizeMap[item.size] || 0) + item.count;
      if (item.article_name) articleSet.add(item.article_name);
      if (item.colour) colourSet.add(item.colour);
      if (item.mrp != null) mrpSet.add(Number(item.mrp));
    }
  }

  // Legacy (pre-go-live, count-only) cartons have no tracked child boxes, so
  // there is no per-size assortment. Their label is printed from the fields
  // captured at CSV upload: article name, colour(s), MRP(s) and a size RANGE.
  // The per-size assortment grid is omitted for these cartons.
  const isLegacy = carton.is_legacy === true;

  const articleLabel = isLegacy
    ? carton.article_group ?? ''
    : Array.from(articleSet).join(', ');
  const colourLabel = isLegacy
    ? carton.legacy_colour ?? ''
    : Array.from(colourSet).join('. ');
  const mrpLabel = isLegacy
    ? carton.legacy_mrp ?? ''
    : Array.from(mrpSet)
        .sort((a, b) => a - b)
        .map((m) => m.toFixed(2))
        .join(' / ');

  const sizes = sortSizes(Object.keys(sizeMap));

  const sizeRangeLabel = isLegacy
    ? carton.size_group || '-'
    : sizes.length === 0
      ? '-'
      : sizes.length === 1
        ? sizes[0]
        : `${sizes[0]} - ${sizes[sizes.length - 1]}`;
  const totalPairs = Object.values(sizeMap).reduce((s, n) => s + n, 0);

  const sizeColCount = Math.max(sizes.length, 1);
  const sizeColWidthMm = (110 / sizeColCount).toFixed(3);
  const sizeColgroup =
    sizes.map(() => `<col style="width:${sizeColWidthMm}mm" />`).join('') +
    `<col style="width:36mm" />`;
  const sizeHeaders = sizes.map((s) => `<td>${s}</td>`).join('');
  const sizeQtys = sizes.map((s) => `<td>${sizeMap[s]}</td>`).join('');

  // The per-size assortment grid only applies to tracked cartons. Legacy cartons
  // carry just a size range (no per-size counts), so the grid is omitted for them.
  const assortmentTable = isLegacy
    ? ''
    : `
        <table class="assortment-grid">
          <colgroup>
            ${sizeColgroup}
          </colgroup>
          <tr style="height:10mm">
            <td colspan="${sizeColCount + 1}" class="assortment-hdr">SIZE ASSORTMENT</td>
          </tr>
          <tr style="height:10mm" class="size-hdr-row">
            ${sizeHeaders || '<td>-</td>'}
            <td>Total</td>
          </tr>
          <tr style="height:11mm" class="size-qty-row">
            ${sizeQtys || '<td>-</td>'}
            <td class="total-qty">${totalPairs} Pairs</td>
          </tr>
        </table>`;

  const packDateSource = carton.closed_at || carton.created_at;
  const packDate = (packDateSource ? new Date(packDateSource) : new Date()).toLocaleDateString(
    'en-IN',
    { day: '2-digit', month: 'short', year: 'numeric' }
  );

  const qrSvg = renderToStaticMarkup(
    createElement(QRCodeSVG, { value: carton.carton_barcode, size: 128, level: 'M' })
  );

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Label - ${carton.carton_barcode}</title>
      <style>
        @page { size: 146mm 96mm; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; width: 146mm; height: 96mm; }
        .label { width: 146mm; height: 96mm; }
        table { border-collapse: collapse; table-layout: fixed; width: 146mm; }
        td { border: 0.5px solid #000; vertical-align: middle; overflow: hidden; padding: 0.8mm 1.5mm; }
        .top-margin-cell { border-left: 0.5px solid #000; border-right: 0.5px solid #000; border-top: 0.5px solid #000; border-bottom: 0.5px solid #000; }
        .article-cell { font-size: 20pt; font-weight: bold; text-align: center; white-space: nowrap; text-overflow: ellipsis; line-height: 1; }
        .colour-cell { font-size: 18pt; font-weight: bold; text-align: center; white-space: nowrap; text-overflow: ellipsis; line-height: 1; }
        .size-summary-cell { font-size: 20pt; font-weight: bold; text-align: center; line-height: 1; }
        .mrp-cell { text-align: center; line-height: 1.1; padding: 1mm 1mm; }
        .mrp-main { font-size: 16pt; font-weight: bold; white-space: nowrap; }
        .mrp-sub { font-size: 7pt; font-style: italic; margin-top: 0.5mm; }
        .qr-cell { text-align: center; vertical-align: middle; padding: 1mm; }
        .qr-cell svg { width: 32mm; height: 32mm; display: block; margin: 0 auto; }
        .small-cell { font-size: 7pt; line-height: 1.25; vertical-align: top; padding: 1mm 1.2mm; }
        .small-cell .sub-label { font-weight: bold; font-size: 8pt; display: block; margin-bottom: 0.8mm; }
        .packed-date { font-size: 14pt; font-weight: bold; }
        .qr-num-cell { text-align: center; vertical-align: top; padding: 1mm; font-size: 7pt; }
        .qr-num-cell .sub-label { font-weight: bold; font-size: 8pt; display: block; margin-bottom: 1.2mm; }
        .qr-num { font-family: Arial, Helvetica, sans-serif; font-size: 13pt; font-weight: bold; }
        .assortment-hdr { font-size: 13pt; font-weight: bold; text-align: center; letter-spacing: 0.6mm; line-height: 1; }
        table.assortment-grid tr.size-hdr-row td { font-size: 17pt; font-weight: bold; text-align: center; background: #f5f5f5; line-height: 1; padding: 0; }
        table.assortment-grid tr.size-qty-row td { font-size: 22pt; font-weight: bold; text-align: center; line-height: 1; padding: 0; }
        table.assortment-grid tr.size-qty-row td.total-qty { font-size: 15pt; }
        table.main-grid tr:last-child td { border-bottom: none; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="label">
        <table class="main-grid">
          <colgroup>
            <col style="width:55mm" />
            <col style="width:55mm" />
            <col style="width:36mm" />
          </colgroup>
          <tr style="height:5mm">
            <td colspan="3" class="top-margin-cell"></td>
          </tr>
          <tr style="height:15mm">
            <td colspan="2" class="article-cell">${articleLabel || '-'}</td>
            <td rowspan="3" class="qr-cell">${qrSvg}</td>
          </tr>
          <tr style="height:15mm">
            <td colspan="2" class="colour-cell">${colourLabel || '-'}</td>
          </tr>
          <tr style="height:15mm">
            <td class="size-summary-cell">${sizeRangeLabel}</td>
            <td class="mrp-cell">
              <div class="mrp-main">MRP: &#8377; ${mrpLabel || '-'}</div>
              <div class="mrp-sub">(incl. of all taxes)</div>
            </td>
          </tr>
          <tr style="height:15mm">
            <td class="small-cell">
              <span class="sub-label">Packed On:</span>
              <span class="packed-date">${packDate}</span>
            </td>
            <td class="small-cell">
              <span class="sub-label">Mfg &amp; Mktd by:</span>
              Mahavir Polymers Pvt Ltd<br/>
              FE 16-17 MIA Jaipur - 302017 Raj (India)<br/>
              Customer Care: 0141 2751684
            </td>
            <td class="qr-num-cell">
              <span class="sub-label">QR Code Number</span>
              <div class="qr-num">${carton.carton_barcode}</div>
            </td>
          </tr>
        </table>${assortmentTable}
      </div>
      <script>
        function fitText(sel, minPx) {
          document.querySelectorAll(sel).forEach(function(el) {
            var px = parseFloat(getComputedStyle(el).fontSize);
            var g = 0;
            while ((el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) && px > minPx && g < 200) {
              px -= 0.5; el.style.fontSize = px + 'px'; g++;
            }
          });
        }
        window.onload = function() {
          fitText('.article-cell', 9);
          fitText('.colour-cell', 9);
          fitText('.size-summary-cell', 9);
          fitText('table.assortment-grid tr.size-hdr-row td', 9);
          fitText('table.assortment-grid tr.size-qty-row td', 9);
          window.print();
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
