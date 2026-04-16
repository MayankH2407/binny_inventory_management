export interface ChildBoxLabelData {
  childBoxId: string;
  barcode: string;
  articleCode: string;
  productName: string;
  productSKU: string;
  size: string;
  colour: string;
  mrp: number;
  quantity: number;
  qrDataUri: string;
  packedOn: string;
  generatedAt: string;
}

export interface MasterCartonLabelData {
  masterCartonId: string;
  articleCode: string;
  colour: string;
  mrp: number;
  packDate: string;
  sizeAssortment: Array<{ size: string; qty: number }>;
  totalPairs: number;
  childBoxCount: number;
  totalQuantity: number;
  productSummary: string;
  logoBase64?: string;
  qrDataUri: string;
  createdAt: string;
}

export function buildChildBoxLabelHtml(data: ChildBoxLabelData): string {
  const mrpFormatted = Number(data.mrp).toFixed(2);
  const contentText = `${data.quantity * 2}N (${data.quantity} Pair)`;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
    .label { border: 1.5px solid #000; width: 60mm; height: 60mm; }
    table.main { width: 100%; height: 100%; border-collapse: collapse; }
    table.main td { border: 0.5px solid #000; padding: 1mm 1.5mm; vertical-align: middle; }
    .article-row { font-weight: bold; font-size: 9pt; vertical-align: top; padding: 1.2mm 1.5mm; }
    .colour-row { font-size: 9pt; font-weight: bold; }
    .mrp-row { vertical-align: top; }
    .mrp-line { font-weight: bold; font-size: 9pt; }
    .mrp-sub { font-size: 5.5pt; font-weight: normal; color: #333; }
    .size-cell { text-align: center; font-weight: bold; vertical-align: middle; }
    .size-label { font-size: 7pt; font-weight: normal; }
    .size-value { font-size: 28pt; line-height: 1; }
    .small-row { font-size: 6pt; padding: 0.5mm 1.5mm; height: 4mm; }
    .qr-cell { text-align: center; vertical-align: middle; padding: 0.5mm; }
    .qr-cell img { width: 17mm; height: 17mm; }
    .footer-row { font-size: 5.5pt; line-height: 1.3; padding: 1mm 1.5mm; vertical-align: top; border-top: 1px solid #000; }
  </style>
</head>
<body>
  <div class="label">
    <table class="main">
      <tr>
        <td colspan="2" class="article-row">Article No: ${data.articleCode}</td>
      </tr>
      <tr>
        <td class="colour-row">Colour: ${data.colour}</td>
        <td class="size-cell" rowspan="2" style="width:35%;">
          <div class="size-label">Size:</div>
          <div class="size-value">${data.size}</div>
        </td>
      </tr>
      <tr>
        <td class="mrp-row">
          <div class="mrp-line">M.R.P.: &#8377; ${mrpFormatted}</div>
          <div class="mrp-sub">(Inc of all taxes)</div>
        </td>
      </tr>
      <tr>
        <td class="small-row">Packed on: ${data.packedOn}</td>
        <td rowspan="2" class="qr-cell">
          <img src="${data.qrDataUri}" alt="QR" />
        </td>
      </tr>
      <tr>
        <td class="small-row">Content: ${contentText}</td>
      </tr>
      <tr>
        <td colspan="2" class="footer-row">
          Mfg &amp; Mktd by: Mahavir Polymers Pvt Ltd<br/>
          FE 16-17 MIA Jaipur - 302017 Raj (India)<br/>
          Customer Care: 0141 2751684
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`.trim();
}

export function buildMasterCartonLabelHtml(data: MasterCartonLabelData): string {
  const mrpFormatted = Number(data.mrp).toFixed(2);

  const sizeHeaders = data.sizeAssortment.map((s) => `<td>${s.size}</td>`).join('');
  const sizeQtys = data.sizeAssortment.map((s) => `<td>${s.qty}</td>`).join('');

  const logoHtml = data.logoBase64
    ? `<div class="logo"><img src="${data.logoBase64}" alt="Binny" /></div>`
    : `<div class="logo"><strong style="font-size:18pt;color:#1B1464;">BINNY</strong></div>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
    .label { border: 2px solid #000; width: 92mm; font-size: 10pt; }
    .logo { text-align: center; padding: 3mm 2mm 2mm 2mm; }
    .logo img { height: 14mm; }
    table.info { width: 100%; border-collapse: collapse; }
    table.info td { border: 1px solid #000; padding: 2mm 3mm; }
    .article-row { font-weight: bold; font-size: 11pt; }
    .split-row td { width: 50%; }
    .assortment-label { font-weight: bold; font-size: 9pt; padding: 1.5mm 3mm; border: 1px solid #000; }
    table.sizes { width: 100%; border-collapse: collapse; font-size: 9pt; }
    table.sizes td { border: 1px solid #000; text-align: center; padding: 1.5mm 1mm; }
    table.sizes .hdr { font-weight: bold; }
    table.sizes .total { font-weight: bold; }
  </style>
</head>
<body>
  <div class="label">
    ${logoHtml}
    <table class="info">
      <tr>
        <td colspan="2" class="article-row">Article No.: ${data.articleCode}</td>
      </tr>
      <tr>
        <td colspan="2">Colour: ${data.colour}</td>
      </tr>
      <tr class="split-row">
        <td>MRP: &#8377; ${mrpFormatted}</td>
        <td>Pack Date: ${data.packDate}</td>
      </tr>
    </table>
    <div class="assortment-label">Size Assortment</div>
    <table class="sizes">
      <tr class="hdr">
        ${sizeHeaders}
        <td class="hdr">Total</td>
      </tr>
      <tr>
        ${sizeQtys}
        <td class="total">${data.totalPairs} Prs</td>
      </tr>
    </table>
  </div>
</body>
</html>`.trim();
}
