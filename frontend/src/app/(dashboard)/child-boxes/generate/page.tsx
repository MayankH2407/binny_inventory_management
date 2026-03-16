'use client';

import { useState, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, ArrowLeft, Check, Printer } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card, CardBody, CardFooter } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES } from '@/constants';
import { childBoxService } from '@/services/childBox.service';
import { productService } from '@/services/product.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import type { BulkCreateChildBoxRequest, ChildBoxWithProduct } from '@/types';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';

export default function GenerateQRPage() {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [count, setCount] = useState(10);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generatedBoxes, setGeneratedBoxes] = useState<ChildBoxWithProduct[]>([]);

  const { data: productsData, isLoading: productsLoading } = useApiQuery(
    ['products-for-generate'],
    () => productService.getAll({ limit: 200, is_active: true }),
  );

  const products = productsData?.data ?? [];
  const selectedProduct = products.find((p) => p.id === productId);

  const { mutate: generate, isPending } = useApiMutation(
    (data: BulkCreateChildBoxRequest) => childBoxService.createBulk(data),
    {
      successMessage: 'Child boxes created successfully',
      invalidateKeys: [['child-boxes']],
      onSuccess: (data) => {
        setGeneratedBoxes(data);
      },
    }
  );

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!productId) newErrors.product_id = 'Please select a product';
    if (count < 1 || count > 500) {
      newErrors.count = 'Count must be between 1 and 500';
    }
    if (quantity < 1) {
      newErrors.quantity = 'Quantity must be at least 1';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    generate({ product_id: productId, count, quantity });
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    printWindow.document.write(`
      <html>
        <head>
          <title>Print Labels</title>
          <style>
            @page { size: 40mm 60mm; margin: 1mm; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; }
            .label {
              width: 38mm;
              border: 1.5px solid #000;
              page-break-after: always;
              font-size: 7pt;
            }
            .label:last-child { page-break-after: avoid; }
            table.main { width: 100%; border-collapse: collapse; }
            table.main td { border: 0.5px solid #000; padding: 1mm 1.5mm; vertical-align: top; }
            .article-row { font-weight: bold; font-size: 8pt; }
            .size-cell { text-align: center; vertical-align: middle; }
            .size-label { font-size: 6pt; }
            .size-value { font-size: 14pt; font-weight: bold; line-height: 1.1; }
            .mrp-line { font-weight: bold; font-size: 7.5pt; }
            .mrp-sub { font-size: 5.5pt; color: #333; }
            .qr-cell { text-align: center; vertical-align: middle; padding: 0.5mm; }
            .qr-cell svg { width: 14mm; height: 14mm; }
            .footer {
              border-top: 1px solid #000;
              padding: 1mm 1.5mm;
              font-size: 5pt;
              line-height: 1.4;
            }
          </style>
        </head>
        <body>
          ${generatedBoxes
            .map(
              (box) => {
                const qrSvg = renderToStaticMarkup(QRCodeSVG({ value: box.barcode, size: 128, level: 'M' }));
                return `
            <div class="label">
              <table class="main">
                <tr>
                  <td colspan="2" class="article-row">Article No: ${box.article_code}</td>
                </tr>
                <tr>
                  <td>Colour: ${box.colour}</td>
                  <td rowspan="2" class="size-cell" style="width:30%;">
                    <div class="size-label">Size:</div>
                    <div class="size-value">${box.size}</div>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div class="mrp-line">M.R.P.: &#8377; ${Number(box.mrp).toFixed(2)}</div>
                    <div class="mrp-sub">(Inc of all taxes)</div>
                  </td>
                </tr>
                <tr>
                  <td>Packed on: ${today}</td>
                  <td rowspan="2" class="qr-cell">
                    ${qrSvg}
                  </td>
                </tr>
                <tr>
                  <td>Content: ${(box.quantity || 1) * 2}N (${box.quantity || 1} Pair)</td>
                </tr>
              </table>
              <div class="footer">
                Mfg &amp; Mktd by: Mahavir Polymers Pvt Ltd<br/>
                FE 16-17 MIA Jaipur - 302017 Raj (India)<br/>
                Customer Care: 0141 2751684
              </div>
            </div>`;
              }
            )
            .join('')}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (productsLoading) return <PageSpinner />;

  // --- Success state: show generated labels ---
  if (generatedBoxes.length > 0) {
    return (
      <div>
        <PageHeader
          title="Labels Generated"
          description={`Successfully generated ${generatedBoxes.length} child box labels`}
        />
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 mb-6">
            <div className="p-4 rounded-full bg-green-100">
              <Check className="h-8 w-8 text-brand-success" />
            </div>
            <p className="text-lg font-semibold text-brand-text-dark">
              {generatedBoxes.length} Labels Generated
            </p>
            {selectedProduct && (
              <p className="text-sm text-brand-text-muted text-center">
                {selectedProduct.article_name} ({selectedProduct.sku}) | {selectedProduct.colour} |
                Size {selectedProduct.size} | {formatCurrency(selectedProduct.mrp)}
              </p>
            )}
          </div>

          <div ref={printRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
            {generatedBoxes.slice(0, 16).map((box) => (
              <div
                key={box.id}
                className="p-3 bg-gray-50 rounded-lg border border-brand-border text-center"
              >
                <QrCode className="h-8 w-8 mx-auto mb-2 text-brand-text-muted" />
                <p className="text-xs font-mono text-brand-text-dark truncate">{box.barcode}</p>
                <p className="text-[10px] text-brand-text-muted mt-1">{box.sku}</p>
              </div>
            ))}
            {generatedBoxes.length > 16 && (
              <div className="p-3 bg-gray-50 rounded-lg border border-brand-border flex items-center justify-center">
                <p className="text-sm text-brand-text-muted">
                  +{generatedBoxes.length - 16} more
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setGeneratedBoxes([]);
                setProductId('');
                setCount(10);
                setQuantity(1);
              }}
            >
              Generate More
            </Button>
            <Button
              variant="outline"
              leftIcon={<Printer className="h-4 w-4" />}
              onClick={handlePrint}
            >
              Print Labels
            </Button>
            <Link href={ROUTES.CHILD_BOXES}>
              <Button>View All Child Boxes</Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // --- Form state ---
  return (
    <div>
      <PageHeader
        title="Generate Labels"
        description="Bulk generate child box labels with barcodes"
        action={
          <Link href={ROUTES.CHILD_BOXES}>
            <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back
            </Button>
          </Link>
        }
      />

      <Card padding={false} className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <CardBody className="px-6 space-y-5">
            <div>
              <Select
                label="Product"
                placeholder="Select a product..."
                options={products.map((p) => ({
                  value: p.id,
                  label: `${p.article_name} - ${p.sku} (${p.colour}, Size ${p.size})`,
                }))}
                value={productId}
                onChange={(e) => {
                  setProductId(e.target.value);
                  if (errors.product_id) setErrors((prev) => ({ ...prev, product_id: '' }));
                }}
                error={errors.product_id}
              />
            </div>

            {selectedProduct && (
              <div className="p-4 bg-gray-50 rounded-lg border border-brand-border">
                <p className="text-sm font-semibold text-brand-text-dark mb-1">
                  {selectedProduct.article_name}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-brand-text-muted">
                  <span>SKU: {selectedProduct.sku}</span>
                  <span>Article Code: {selectedProduct.article_code}</span>
                  <span>Colour: {selectedProduct.colour}</span>
                  <span>Size: {selectedProduct.size}</span>
                  <span>MRP: {formatCurrency(selectedProduct.mrp)}</span>
                  {selectedProduct.category && <span>Category: {selectedProduct.category}</span>}
                  {selectedProduct.section && <span>Section: {selectedProduct.section}</span>}
                  {selectedProduct.location && <span>Location: {selectedProduct.location}</span>}
                  {selectedProduct.hsn_code && <span>HSN: {selectedProduct.hsn_code}</span>}
                  {selectedProduct.size_group && <span>Size Group: {selectedProduct.size_group}</span>}
                  {selectedProduct.article_group && <span>Article Group: {selectedProduct.article_group}</span>}
                </div>
              </div>
            )}

            <Input
              label="Quantity per Box"
              type="number"
              placeholder="Pairs/units per box"
              value={String(quantity)}
              onChange={(e) => {
                setQuantity(parseInt(e.target.value) || 0);
                if (errors.quantity) setErrors((prev) => ({ ...prev, quantity: '' }));
              }}
              error={errors.quantity}
              helperText="Number of pairs/units in each child box (default: 1)"
            />

            <Input
              label="Number of Labels"
              type="number"
              placeholder="How many labels to generate"
              value={String(count)}
              onChange={(e) => {
                setCount(parseInt(e.target.value) || 0);
                if (errors.count) setErrors((prev) => ({ ...prev, count: '' }));
              }}
              error={errors.count}
              helperText="Generate between 1 and 500 labels at a time"
            />
          </CardBody>
          <CardFooter className="px-6 pb-6">
            <Button variant="secondary" type="button" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isPending}
              leftIcon={<QrCode className="h-4 w-4" />}
            >
              Generate Labels
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
