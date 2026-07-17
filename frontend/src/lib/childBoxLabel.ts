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
    // fitFill() below overrides this and responsively grows/shrinks the value
    // to fill the (now 17mm-tall) size cell (e.g. "13" -> large, "12K" -> smaller).
    const sizeStr = String(box.size ?? '');
    const sizeFont =
      sizeStr.length <= 2 ? 52 : sizeStr.length === 3 ? 34 : sizeStr.length === 4 ? 24 : 18;
    return `
        <div class="label">
          <table class="main">
            <colgroup>
              <col style="width:27mm;" />
              <col style="width:20mm;" />
            </colgroup>
            <tr>
              <td colspan="2" class="article-row"><div class="fit-box">${box.article_name}</div></td>
            </tr>
            <tr>
              <td class="colour-row"><div class="fit-box">${box.colour}</div></td>
              <td class="size-cell" rowspan="2">
                <div class="size-label">Size:</div>
                <div class="size-value" style="font-size:${sizeFont}pt">${box.size}</div>
              </td>
            </tr>
            <tr>
              <td class="mrp-row">
                <div class="mrp-box">
                  <div class="mrp-label">M.R.P.</div>
                  <div class="mrp-value">&#8377; ${Number(box.mrp).toFixed(2)}</div>
                  <div class="mrp-sub">(Inc of all taxes)</div>
                </div>
              </td>
            </tr>
            <tr>
              <td class="small-row"><div class="fit-box">Packed on: ${packedOn}</div></td>
              <td rowspan="3" class="qr-cell">
                ${qrSvg}
                <div class="barcode-text">${box.barcode}</div>
              </td>
            </tr>
            <tr>
              <td class="small-row"><div class="fit-box">Content: ${(box.quantity || 1) * 2}N (${box.quantity || 1} Pair)</div></td>
            </tr>
            <tr>
              <td class="footer-row"><div class="fit-box">
                Mfg &amp; Mktd by: Mahavir Polymers Pvt Ltd,
                FE 16-17 MIA Jaipur - 302017 Raj (India).
                Customer Care: 0141 2751684
              </div></td>
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
            /* Content grid = 47mm inside the 48mm label; the label's own
               border/box-model rounding absorbs the remaining ~1mm. Row
               heights below are exact per the client's "New Iteration"
               spec: 10 / 7 / 10 / 5 / 5 / 10 mm -> size-cell (colour+mrp
               rowspan) = 17mm, qr-cell (packed+content+footer rowspan) = 20mm. */
            table.main { width: 100%; height: 47mm; border-collapse: collapse; table-layout: fixed; }
            table.main td { border: 0.5px solid #000; padding: 1mm; vertical-align: middle; overflow: hidden; }

            .article-row { height: 10mm; font-weight: bold; text-align: center; text-transform: uppercase; }
            .colour-row  { height: 7mm;  font-weight: bold; text-align: center; text-transform: uppercase; }
            .mrp-row     { height: 10mm; text-align: center; }
            .small-row   { height: 5mm;  text-align: left; }
            .footer-row  { height: 10mm; border-top: 1px solid #000; }

            /* fit-box / *-box wrappers give each fitted text block a hard,
               deterministic content height (row height minus the 1mm+1mm td
               padding) so the fitFill() height check below is meaningful.
               Without this, a table row simply grows to fit its content
               (rows have no real max-height in CSS table layout), which
               would silently defeat any self-measuring fit/clip check. */
            /* Small rows are fixed-format, bounded-length text → single line. */
            .small-row .fit-box {
              display: flex; align-items: center; justify-content: flex-start;
              height: 3mm; overflow: hidden; white-space: nowrap; line-height: 1;
            }
            /* Article (product name) + colour WRAP and shrink so a long value is
               NEVER clipped: white-space normal lets it wrap, and fitFill() reduces
               the font until the (possibly multi-line) text fits the box. Vertically
               centred via the flex column; short values stay one big centred line. */
            .article-row .fit-box, .colour-row .fit-box {
              display: flex; flex-direction: column; justify-content: center;
              text-align: center; overflow: hidden; white-space: normal; word-break: break-word;
            }
            .article-row .fit-box { height: 8mm; line-height: 1.05; }
            .colour-row .fit-box  { height: 5mm; line-height: 1; }
            /* Footer keeps its 3 <br/>-separated lines (not a flex row); each
               line is width-limited by the long address line, not height. */
            /* Footer WRAPS to fill the cell (client preference: minimal blank space,
               lines as needed rather than a fixed 3). fitFill grows the font until the
               wrapped text fills the 8mm block height, so the cell is packed with the
               largest font that still shows all the Mfg detail. line-height kept tight
               so the fill is dense. */
            .footer-row .fit-box { height: 8mm; overflow: hidden; white-space: normal; line-height: 1.08; word-break: break-word; }

            /* mrp-box / size-box: a fixed-height flex column holding one or
               two static (label/sub) rows plus one flex:1 fitted row. The
               flex:1 + min-height:0 + overflow:hidden trio makes the fitted
               element's own clientHeight deterministic (the leftover space
               after the static rows), so fitFill can measure and set
               font-size directly on it with no extra wrapper needed. */
            .mrp-box  { height: 8mm; display: flex; flex-direction: column; }
            .mrp-label { flex: 0 0 auto; font-weight: bold; font-size: 6pt; line-height: 1; text-align: center; }
            /* line-height 0.8 on the fitted value shrinks the line-box toward the
               glyph height so fitFill() can grow the font until the actual digits
               (not the em's blank ascender/descender) fill the cell — removes the
               vertical blank space the client flagged. */
            .mrp-value {
              flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center;
              font-weight: 900; line-height: 0.85; white-space: nowrap; overflow: hidden;
            }
            .mrp-sub { flex: 0 0 auto; font-size: 4.5pt; color: #333; line-height: 1; text-align: center; }

            /* Size cell: a small "Size:" label + a big numeral that fitSizeValue()
               grows to fill the WHOLE cell (measured against the td, not a wrapper —
               a rowspan cell doesn't give height:% children a definite height, which
               left the digit short). line-height 0.72 ≈ the digit cap height so the
               numeral (no descender) fills the cell bottom without a gap. */
            /* Size numeral sits in a FIXED-height box (12.5mm) so fitFill has a bounded
               target — measuring against the rowspan cell instead let the cell grow with
               the content and the number ballooned. 12.5mm + the small label + padding
               ≈ the 17mm cell, so the digit fills the cell top-to-bottom. */
            .size-cell { text-align: center; vertical-align: middle; }
            .size-label { font-size: 5.5pt; font-weight: bold; line-height: 1; }
            .size-value {
              height: 13.5mm; display: flex; align-items: center; justify-content: center;
              font-weight: bold; line-height: 0.62; white-space: nowrap; overflow: hidden;
            }

            .qr-cell { text-align: center; vertical-align: middle; }
            /* QR + caption must both fit inside the 20mm qr-cell (18mm content
               after the uniform 1mm padding on every side). 15mm QR + ~7pt
               caption (~2.5mm) + a small margin comfortably clears 18mm. */
            .qr-cell svg { width: 15mm; height: 15mm; display: block; margin: 0 auto; }
            .qr-cell .barcode-text { font-family: Arial, Helvetica, sans-serif; font-weight: bold; font-size: 7pt; margin-top: 0.2mm; text-align: center; white-space: nowrap; text-transform: uppercase; }
          </style>
        </head>
        <body>
          ${rowsHtml}
          <script>
            // Generalized fit-to-fill: binary-search the largest font-size (px)
            // that fits BOTH the element's width and height without clipping.
            // Replaces the old shrink-only fitText/fitSizeValue pair. Every
            // selector below targets an element whose own clientHeight is
            // deterministic (either a fixed-height flex wrapper, or a flex:1
            // row inside one) so the height half of the check is meaningful.
            function fitFill(selector, maxPx, minPx) {
              document.querySelectorAll(selector).forEach(function (el) {
                function fits(px) {
                  el.style.fontSize = px + 'px';
                  return el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1;
                }
                var lo = minPx, hi = maxPx, best = minPx;
                for (var i = 0; i < 30 && hi - lo > 0.25; i++) {
                  var mid = (lo + hi) / 2;
                  if (fits(mid)) { best = mid; lo = mid; } else { hi = mid; }
                }
                el.style.fontSize = best + 'px';
              });
            }
            // Size uses a large fixed font (set inline, sized to fill the 13.5mm box)
            // and only SHRINKS if a long value ("12K") overflows — the grow-to-fill
            // path undershot badly for the size numeral in this table/flex layout.
            function fitShrink(selector, minPx) {
              document.querySelectorAll(selector).forEach(function (el) {
                var px = parseFloat(getComputedStyle(el).fontSize);
                var g = 0;
                while ((el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) && px > minPx && g < 400) {
                  px -= 0.5; el.style.fontSize = px + 'px'; g++;
                }
              });
            }
            window.onload = function () {
              fitFill('.article-row .fit-box', 28, 6);   // wraps + shrinks so a long product name never clips
              fitFill('.colour-row .fit-box', 24, 6);     // wraps + shrinks; long colour names never clip
              fitFill('.small-row .fit-box', 16, 6);      // Packed on / Content, 1 line each in 5mm
              fitFill('.footer-row .fit-box', 24, 4);     // wraps to pack the 8mm block, largest font that fills it
              fitFill('.mrp-value', 52, 9);               // ₹ amount grows until it fills the MRP block width
              fitShrink('.size-value', 12);               // keep the big fixed numeral; only shrink long values to fit
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
