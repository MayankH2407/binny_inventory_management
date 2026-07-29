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
        .article-cell { font-size: 15pt; font-weight: bold; text-align: center; text-transform: uppercase; line-height: 1.1; }
        .colour-cell { font-size: 12pt; font-weight: bold; text-align: center; text-transform: uppercase; line-height: 1; }
        .size-cell { font-size: 12pt; font-weight: bold; text-align: center; line-height: 1; }
        .mrp-cell { text-align: center; line-height: 1.1; }
        .mrp-main { font-size: 12pt; font-weight: bold; white-space: nowrap; }
        .mrp-sub { font-size: 6pt; font-style: italic; }
        .qr-cell { text-align: center; vertical-align: middle; padding: 1mm; }
        .qr-cell svg { width: 20mm; height: 20mm; display: block; margin: 0 auto; }
        .qr-num { font-family: Arial, Helvetica, sans-serif; font-weight: bold; font-size: 7pt; margin-top: 0.5mm; text-align: center; }
        .small-cell { font-size: 7pt; line-height: 1.3; }
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
            <td class="article-cell">${sample.article_summary || sample.name}</td>
            <td rowspan="4" class="qr-cell">
              ${qrSvg}
              <div class="qr-num">${sample.sample_barcode}</div>
            </td>
          </tr>
          <tr style="height:8mm">
            <td class="colour-cell">${sample.colour_summary || '-'}</td>
          </tr>
          <tr style="height:8mm">
            <td class="size-cell">Size: ${sample.size_summary || '-'} &nbsp;·&nbsp; ${sample.child_count} boxes</td>
          </tr>
          <tr style="height:8mm">
            <td class="mrp-cell">
              <div class="mrp-main">MRP: &#8377; ${sample.mrp_summary != null ? Number(sample.mrp_summary).toFixed(2) : '-'}</div>
              <div class="mrp-sub">(incl. of all taxes)</div>
            </td>
          </tr>
          <tr style="height:7mm">
            <td class="small-cell"><span class="sub-label">Sample Date:</span> ${sampleDate}</td>
            <td class="small-cell"><span class="sub-label">To:</span> ${recipientLabel}</td>
          </tr>
        </table>
      </div>
      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}
