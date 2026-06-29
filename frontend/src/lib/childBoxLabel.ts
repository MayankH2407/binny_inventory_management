import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import toast from 'react-hot-toast';
import type { ChildBoxWithProduct } from '@/types';

export function printChildBoxLabels(boxes: ChildBoxWithProduct[]): void {
  // Pre-render all QR SVGs safely using createElement
  const labelHtmlParts = boxes.map((box) => {
    // Derive packedOn from the box's own created_at so reprints show the
    // original creation date rather than today's date.
    let packedOn: string;
    try {
      const d = new Date(box.created_at);
      if (isNaN(d.getTime())) throw new Error('invalid');
      packedOn = d
        .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
        .toUpperCase();
    } catch {
      // Fallback: use today
      packedOn = new Date()
        .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
        .toUpperCase();
    }

    const qrSvg = renderToStaticMarkup(
      createElement(QRCodeSVG, { value: box.barcode, size: 128, level: 'M' })
    );
    // Inline font-size is a NO-JS fallback only: it is tuned to FIT the ~17.7mm
    // usable width of the size cell without clipping even if scripts don't run
    // (a 3-char value like "12K" at the default 38pt clips the last glyph — the
    // client-reported bug — so 3 chars fall back to 22pt). When scripts run,
    // fitSizeValue() below overrides this and responsively grows/shrinks the
    // value to fill the cell (e.g. "13" -> ~44pt, "12K" -> ~27pt).
    const sizeStr = String(box.size ?? '');
    const sizeFont =
      sizeStr.length <= 2 ? 38 : sizeStr.length === 3 ? 22 : sizeStr.length === 4 ? 16 : 13;
    return `
        <div class="label">
          <table class="main">
            <colgroup>
              <col style="width:27mm;" />
              <col style="width:20mm;" />
            </colgroup>
            <tr>
              <td colspan="2" class="article-row">${box.article_name}</td>
            </tr>
            <tr>
              <td class="colour-row">${box.colour}</td>
              <td class="size-cell" rowspan="2">
                <div class="size-label">Size:</div>
                <div class="size-value" style="font-size:${sizeFont}pt">${box.size}</div>
              </td>
            </tr>
            <tr>
              <td class="mrp-row">
                <div class="mrp-label">M.R.P.</div>
                <div class="mrp-value">&#8377; ${Number(box.mrp).toFixed(2)}</div>
                <div class="mrp-sub">(Inc of all taxes)</div>
              </td>
            </tr>
            <tr>
              <td class="small-row">Packed on: ${packedOn}</td>
              <td rowspan="3" class="qr-cell">
                ${qrSvg}
                <div class="barcode-text">${box.barcode}</div>
              </td>
            </tr>
            <tr>
              <td class="small-row">Content: ${(box.quantity || 1) * 2}N (${box.quantity || 1} Pair)</td>
            </tr>
            <tr>
              <td class="footer-row">
                Mfg &amp; Mktd by: Mahavir Polymers Pvt Ltd<br/>
                FE 16-17 MIA Jaipur - 302017 Raj (India)<br/>
                Customer Care: 0141 2751684
              </td>
            </tr>
          </table>
        </div>`;
  });

  const rowsHtml = labelHtmlParts
    .reduce<string[][]>((acc, label, i) => {
      if (i % 2 === 0) acc.push([label]);
      else acc[acc.length - 1].push(label);
      return acc;
    }, [])
    .map((pair) => `<div class="row">${pair[0]}${pair[1] ?? '<div class="label-empty"></div>'}</div>`)
    .join('');

  const htmlContent = `
      <html>
        <head>
          <title>Print Labels</title>
          <style>
            @page { size: 100mm 50mm; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: 100mm; margin: 0; padding: 0; }
            body { font-family: Arial, Helvetica, sans-serif; }
            /* Inline-block layout (vs flex) is more print-engine-safe.
               flex's cross-axis stretch is implemented inconsistently in
               print contexts across browsers; inline-block sidesteps that. */
            .row {
              width: 100mm;
              height: 50mm;
              page-break-after: always;
              page-break-inside: avoid;
              font-size: 0;        /* kill inline-block whitespace gap */
              white-space: nowrap;
            }
            .row:last-child { page-break-after: avoid; }
            /* 1mm margin on each side gives a 1mm outer gutter and a 2mm
               gap (1mm + 1mm) between adjacent labels' black borders, per
               the physical roll spec. */
            .label, .label-empty {
              display: inline-block;
              vertical-align: top;
              width: 48mm;
              height: 48mm;
              margin: 1mm;
              font-size: 11pt;     /* reset for inner content */
            }
            .label {
              border: 1.5px solid #000;
              overflow: hidden;
            }
            .label-empty { visibility: hidden; }
            table.main { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
            table.main td { border: 0.5px solid #000; padding: 1mm 1.5mm; vertical-align: middle; overflow: hidden; }
            .article-row { font-weight: bold; font-size: 11pt; vertical-align: middle; padding: 0.5mm 1.5mm; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; text-transform: uppercase; }
            .colour-row { font-size: 9pt; font-weight: bold; padding: 0.5mm 1.5mm; line-height: 1; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase; }
            .mrp-row { vertical-align: middle; padding: 0.3mm 1mm; text-align: center; white-space: nowrap; overflow: hidden; }
            .mrp-label { font-weight: bold; font-size: 7pt; line-height: 1; }
            .mrp-value { font-weight: 900; font-size: 12pt; line-height: 1; }
            .mrp-sub { font-size: 4pt; color: #333; line-height: 1; margin-top: 0.2mm; }
            .size-cell { text-align: center; vertical-align: middle; padding: 0.3mm 1mm; }
            .size-label { font-size: 7pt; font-weight: bold; line-height: 1; }
            .size-value { font-size: 38pt; font-weight: bold; line-height: 0.95; margin-top: 0.3mm; white-space: nowrap; overflow: hidden; }
            .small-row { font-size: 6pt; padding: 0.15mm 1.5mm; height: 2.5mm; white-space: nowrap; overflow: hidden; vertical-align: middle; }
            .qr-cell { text-align: center; vertical-align: middle; padding: 0.2mm; }
            /* QR sized so QR + barcode caption fit inside the 48mm label height —
               at 18mm the caption spilled past the label bottom and was clipped. */
            .qr-cell svg { width: 16mm; height: 16mm; display: block; margin: 0 auto; }
            .footer-row { font-size: 5pt; line-height: 1; padding: 0.3mm 1.5mm; vertical-align: middle; border-top: 1px solid #000; }
            .qr-cell .barcode-text { font-family: Arial, Helvetica, sans-serif; font-weight: bold; font-size: 8pt; margin-top: 0.3mm; text-align: center; white-space: nowrap; text-transform: uppercase; }
          </style>
        </head>
        <body>
          ${rowsHtml}
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
            // Responsively size the Size value to FILL its cell: binary-search the
            // largest font (px) that fits both the value's width and the cell's
            // height. Grows short values ("13" -> ~44pt) and shrinks long/suffixed
            // ones ("12K" -> ~27pt) so none clip — replaces fixed-bucket guessing.
            // The inline length-based font-size is only a no-JS print fallback.
            function fitSizeValue(maxPx, minPx) {
              document.querySelectorAll('.size-value').forEach(function(el) {
                var cell = el.closest('td');
                if (!cell) return;
                function fits(px) {
                  el.style.fontSize = px + 'px';
                  return el.scrollWidth <= el.clientWidth + 1 && cell.scrollHeight <= cell.clientHeight + 1;
                }
                var lo = minPx, hi = maxPx, best = minPx;
                for (var i = 0; i < 30 && hi - lo > 0.25; i++) {
                  var mid = (lo + hi) / 2;
                  if (fits(mid)) { best = mid; lo = mid; } else { hi = mid; }
                }
                el.style.fontSize = best + 'px';
              });
            }
            window.onload = function() {
              fitText('.article-row', 9);
              fitText('.colour-row', 9);
              fitSizeValue(60, 9);   // 60px ~= 45pt cap keeps single digits sane
              window.print();
            };
          </script>
        </body>
      </html>
    `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Please allow popups to print labels');
    return;
  }

  printWindow.document.write(htmlContent);
  // document.close() flushes the write buffer; the embedded window.onload
  // script inside the HTML handles fit-then-print.
  printWindow.document.close();
  printWindow.focus();
}
