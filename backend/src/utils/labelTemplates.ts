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
    .label { border: 2px solid #000; width: 57mm; font-size: 8.5pt; }
    table.main { width: 100%; border-collapse: collapse; }
    table.main td { border: 1px solid #000; padding: 1.5mm 2.5mm; vertical-align: top; }
    .article-row { font-weight: bold; font-size: 10pt; }
    .size-cell { text-align: center; font-weight: bold; vertical-align: middle; }
    .size-label { font-size: 7pt; font-weight: normal; }
    .size-value { font-size: 18pt; line-height: 1.1; }
    .mrp-line { font-weight: bold; font-size: 9pt; }
    .mrp-sub { font-size: 6.5pt; font-weight: normal; color: #333; }
    .qr-cell { text-align: center; vertical-align: middle; padding: 1.5mm; }
    .qr-cell img { width: 22mm; height: 22mm; }
    .footer { border-top: 1.5px solid #000; padding: 1.5mm 2.5mm; font-size: 6pt; line-height: 1.4; }
  </style>
</head>
<body>
  <div class="label">
    <table class="main">
      <tr>
        <td colspan="2" class="article-row">Article No: ${data.articleCode}</td>
      </tr>
      <tr>
        <td>Colour: ${data.colour}</td>
        <td class="size-cell" style="width:42%;">
          <div class="size-label">Size:</div>
          <div class="size-value">${data.size}</div>
        </td>
      </tr>
      <tr>
        <td>
          <div class="mrp-line">M.R.P.: &#8377; ${mrpFormatted}</div>
          <div class="mrp-sub">(Inc of all taxes)</div>
        </td>
        <td rowspan="3" class="qr-cell">
          <img src="${data.qrDataUri}" alt="QR" />
        </td>
      </tr>
      <tr>
        <td>Packed on: ${data.packedOn}</td>
      </tr>
      <tr>
        <td>Content: ${contentText}</td>
      </tr>
    </table>
    <div class="footer">
      Mfg &amp; Mktd by: Mahavir Polymers Pvt Ltd<br/>
      FE 16-17 MIA Jaipur - 302017 Raj (India)<br/>
      Customer Care: 0141 2751684
    </div>
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
