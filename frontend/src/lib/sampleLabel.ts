import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import toast from 'react-hot-toast';
import type { SampleRecord } from '@/types';

/**
 * Opens a print window for a sample-record sticker (100mm x 50mm, same
 * physical format as the child-box label). Sample records already carry
 * pre-aggregated article/colour/size/MRP summaries (unlike master cartons,
 * there's no per-size assortment grid here — one sample can span many
 * articles/sizes and a per-size breakdown isn't tracked for it).
 */
export function printSampleLabel(sample: SampleRecord): void {
  const printWindow = window.open('', '_blank', 'width=500,height=400');
  if (!printWindow) {
    toast.error('Please allow popups to print labels');
    return;
  }

  const qrSvg = renderToStaticMarkup(
    createElement(QRCodeSVG, { value: sample.sample_barcode, size: 128, level: 'M' })
  );

  const sampleDateSource = sample.sample_date || sample.created_at;
  const sampleDate = (sampleDateSource ? new Date(sampleDateSource) : new Date()).toLocaleDateString(
    'en-IN',
    { day: '2-digit', month: 'short', year: 'numeric' }
  );

  const recipientLabel = sample.customer_firm_name || sample.recipient_name || '-';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Label - ${sample.sample_barcode}</title>
      <style>
        @page { size: 100mm 50mm; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; width: 100mm; height: 50mm; }
        .label { width: 100mm; height: 50mm; border: 1.5px solid #000; overflow: hidden; }
        table { border-collapse: collapse; table-layout: fixed; width: 100mm; height: 47mm; }
        td { border: 0.5px solid #000; vertical-align: middle; overflow: hidden; padding: 1mm 1.5mm; }
        .sample-hdr { font-size: 9pt; font-weight: bold; text-align: center; letter-spacing: 0.4mm; background: #f5f5f5; }

        /* fit-box wrappers give each fitted text block a hard, deterministic
           content height (row height minus the 1mm+1mm td padding) so the
           fitFill()/fitShrink() height check below is meaningful — a CSS
           table row has no real max-height, so without this a long value
           (long article name, long recipient firm name) simply grows the row
           past its intended size and pushes the rest of the label out of the
           50mm sticker instead of shrinking or wrapping in place. */
        .article-cell, .colour-cell, .size-cell { text-align: center; }
        .article-cell .fit-box, .colour-cell .fit-box, .size-cell .fit-box {
          display: flex; flex-direction: column; justify-content: center;
          text-align: center; overflow: hidden; white-space: normal; word-break: break-word;
          font-weight: bold; text-transform: uppercase;
        }
        .article-cell .fit-box { height: 8mm; line-height: 1.05; }
        .colour-cell .fit-box  { height: 6mm; line-height: 1; }
        .size-cell .fit-box    { height: 6mm; line-height: 1; text-transform: none; }

        .mrp-cell { text-align: center; }
        .mrp-box { height: 6mm; display: flex; flex-direction: column; }
        .mrp-main {
          flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center;
          font-weight: bold; white-space: nowrap; overflow: hidden; line-height: 0.9;
        }
        .mrp-sub { flex: 0 0 auto; font-size: 6pt; font-style: italic; line-height: 1; }

        .qr-cell { text-align: center; vertical-align: middle; padding: 1mm; }
        .qr-cell svg { width: 20mm; height: 20mm; display: block; margin: 0 auto; }
        .qr-num { font-family: Arial, Helvetica, sans-serif; font-weight: bold; font-size: 7pt; margin-top: 0.5mm; text-align: center; }

        .small-cell { text-align: left; }
        /* Deliberately NOT a flex container: it holds an inline bold "To:"/
           "Sample Date:" prefix followed by a text run that must wrap onto
           later lines together with it, like a normal paragraph. A flex row
           would treat the prefix and the text as separate flex items, which
           don't reflow across lines the way inline text does — that split
           "To:" from a long recipient name mid-word instead of wrapping it. */
        .small-cell .fit-box {
          height: 5mm; overflow: hidden; white-space: normal; word-break: break-word; line-height: 1.1;
        }
        .small-cell .sub-label { font-weight: bold; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="label">
        <table>
          <colgroup>
            <col style="width:60mm" />
            <col style="width:40mm" />
          </colgroup>
          <tr style="height:6mm">
            <td colspan="2" class="sample-hdr">SAMPLE</td>
          </tr>
          <tr style="height:10mm">
            <td class="article-cell"><div class="fit-box">${sample.article_summary || sample.name}</div></td>
            <td rowspan="4" class="qr-cell">
              ${qrSvg}
              <div class="qr-num">${sample.sample_barcode}</div>
            </td>
          </tr>
          <tr style="height:8mm">
            <td class="colour-cell"><div class="fit-box">${sample.colour_summary || '-'}</div></td>
          </tr>
          <tr style="height:8mm">
            <td class="size-cell"><div class="fit-box">Size: ${sample.size_summary || '-'} &nbsp;&middot;&nbsp; ${sample.child_count} boxes</div></td>
          </tr>
          <tr style="height:8mm">
            <td class="mrp-cell">
              <div class="mrp-box">
                <div class="mrp-main">MRP: &#8377; ${sample.mrp_summary != null ? Number(sample.mrp_summary).toFixed(2) : '-'}</div>
                <div class="mrp-sub">(incl. of all taxes)</div>
              </div>
            </td>
          </tr>
          <tr style="height:7mm">
            <td class="small-cell"><div class="fit-box"><span class="sub-label">Sample Date:&nbsp;</span>${sampleDate}</div></td>
            <td class="small-cell"><div class="fit-box"><span class="sub-label">To:&nbsp;</span>${recipientLabel}</div></td>
          </tr>
        </table>
      </div>
      <script>
        // Generalized fit-to-fill: binary-search the largest font-size (px)
        // that fits BOTH the element's width and height without clipping.
        // Same implementation as childBoxLabel.ts / masterCartonLabel.ts —
        // kept identical across all three label modules deliberately.
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
        window.onload = function () {
          fitFill('.article-cell .fit-box', 32, 8);  // wraps + shrinks so a long article name never clips
          fitFill('.colour-cell .fit-box', 26, 7);    // wraps + shrinks; long/multi colour lists never clip
          fitFill('.size-cell .fit-box', 26, 7);      // wraps + shrinks; wide size ranges never clip
          fitFill('.mrp-main', 30, 8);                 // grows to fill the MRP block, shrinks for long values
          fitFill('.small-cell .fit-box', 16, 6);      // Sample Date / To (recipient firm name) — recipient can be long free text
          window.print();
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
