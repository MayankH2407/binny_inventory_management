'use client';

import { useState, useRef, useMemo, useEffect, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, ArrowLeft, Check, Printer, Search, ChevronDown } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardBody, CardFooter } from '@/components/ui/Card';
import { PageSpinner } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES } from '@/constants';
import { childBoxService } from '@/services/childBox.service';
import { productService } from '@/services/product.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import type { BulkCreateMultiSizeRequest, ChildBoxWithProduct, Product } from '@/types';
import { formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

export default function GenerateQRPage() {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement>(null);
  const [productId, setProductId] = useState('');
  const [colourProductId, setColourProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [sizeQuantities, setSizeQuantities] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generatedBoxes, setGeneratedBoxes] = useState<ChildBoxWithProduct[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load all products for the dropdown
  const { data: productsData, isLoading: productsLoading } = useApiQuery(
    ['products-for-generate'],
    () => productService.getAll({ limit: 200, is_active: true }),
  );

  const products = productsData?.data ?? [];

  // Build unique article options for the first dropdown
  const articleOptions = useMemo(() => {
    const seen = new Map<string, Product>();
    for (const p of products) {
      const key = p.article_name;
      if (!seen.has(key)) {
        seen.set(key, p);
      }
    }
    let options = Array.from(seen.values()).map((p) => ({
      value: p.id,
      label: `${p.article_name}${p.article_code ? ` (${p.article_code})` : ''}`,
      articleName: p.article_name,
    }));

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      options = options.filter(
        (o) =>
          o.label.toLowerCase().includes(term) ||
          o.articleName.toLowerCase().includes(term)
      );
    }

    return options;
  }, [products, searchTerm]);

  const selectedProduct = products.find((p) => p.id === productId);

  // Fetch available colours when an article (product) is selected
  const { data: colourOptions, isLoading: coloursLoading } = useApiQuery(
    ['product-colours', productId],
    () => productService.getColours(productId),
    { enabled: !!productId },
  );

  // The actual product id used for size lookup is the colour-specific one
  const effectiveProductId = colourProductId || productId;
  const effectiveProduct = products.find((p) => p.id === effectiveProductId) || selectedProduct;

  // Fetch sibling sizes when a colour is selected
  const { data: siblingProducts, isLoading: sizesLoading } = useApiQuery(
    ['product-sizes', effectiveProductId],
    () => productService.getSizes(effectiveProductId),
    { enabled: !!effectiveProductId },
  );

  // Sort sizes numerically
  const sortedSizes = useMemo(() => {
    if (!siblingProducts) return [];
    return [...siblingProducts].sort((a, b) => {
      const numA = parseFloat(a.size);
      const numB = parseFloat(b.size);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.size.localeCompare(b.size);
    });
  }, [siblingProducts]);

  // Summary calculations
  const sizeSummary = useMemo(() => {
    const entries = sortedSizes
      .filter((p) => (sizeQuantities[p.size] || 0) > 0)
      .map((p) => ({ size: p.size, count: sizeQuantities[p.size] }));
    const total = entries.reduce((sum, e) => sum + e.count, 0);
    return { entries, total };
  }, [sortedSizes, sizeQuantities]);

  const { mutate: generate, isPending } = useApiMutation(
    (data: BulkCreateMultiSizeRequest) => childBoxService.bulkCreateMultiSize(data),
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
    if (!effectiveProductId) newErrors.product_id = 'Please select a product';
    if (quantity < 1) newErrors.quantity = 'Quantity must be at least 1';
    if (sizeSummary.total === 0) newErrors.sizes = 'Enter at least one size quantity';
    if (sizeSummary.total > 500) newErrors.sizes = 'Total labels must not exceed 500';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    generate({
      product_id: effectiveProductId,
      quantity,
      sizes: sizeSummary.entries,
    });
  };

  const handleSizeQuantityChange = (size: string, value: string) => {
    const num = parseInt(value) || 0;
    setSizeQuantities((prev) => ({ ...prev, [size]: Math.max(0, num) }));
    if (errors.sizes) setErrors((prev) => ({ ...prev, sizes: '' }));
  };

  const handleArticleChange = (value: string) => {
    setProductId(value);
    setColourProductId('');
    setSizeQuantities({});
    if (errors.product_id) setErrors((prev) => ({ ...prev, product_id: '' }));
  };

  const handleColourChange = (value: string) => {
    setColourProductId(value);
    setSizeQuantities({});
  };

  const handlePrint = () => {
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // Pre-render all QR SVGs safely using createElement
    const labelHtmlParts = generatedBoxes.map((box) => {
      const qrSvg = renderToStaticMarkup(
        createElement(QRCodeSVG, { value: box.barcode, size: 128, level: 'M' })
      );
      return `
        <div class="label">
          <table class="main">
            <tr>
              <td colspan="2" class="article-row">Article No: ${box.article_code}</td>
            </tr>
            <tr>
              <td class="colour-row">Colour: ${box.colour}</td>
              <td class="size-cell" rowspan="2" style="width:35%;">
                <div class="size-label">Size:</div>
                <div class="size-value">${box.size}</div>
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
              <td class="small-row">Packed on: ${today}</td>
              <td rowspan="2" class="qr-cell">
                ${qrSvg}
              </td>
            </tr>
            <tr>
              <td class="small-row">Content: ${(box.quantity || 1) * 2}N (${box.quantity || 1} Pair)</td>
            </tr>
            <tr>
              <td colspan="2" class="footer-row">
                Mfg &amp; Mktd by: Mahavir Polymers Pvt Ltd<br/>
                FE 16-17 MIA Jaipur - 302017 Raj (India)<br/>
                Customer Care: 0141 2751684
              </td>
            </tr>
          </table>
        </div>`;
    });

    const htmlContent = `
      <html>
        <head>
          <title>Print Labels</title>
          <style>
            @page { size: 50mm 50mm; margin: 0; }
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; }
            .label {
              width: 50mm;
              height: 50mm;
              border: 1.5px solid #000;
              page-break-after: always;
            }
            .label:last-child { page-break-after: avoid; }
            table.main { width: 100%; height: 100%; border-collapse: collapse; }
            table.main td { border: 0.5px solid #000; padding: 1mm 1.5mm; vertical-align: middle; }
            .article-row { font-weight: bold; font-size: 8pt; vertical-align: top; padding: 1mm 1.5mm; }
            .colour-row { font-size: 11pt; font-weight: bold; padding: 1.5mm 1.5mm; }
            .mrp-row { vertical-align: middle; padding: 1mm 1.5mm; line-height: 1.15; }
            .mrp-label { font-weight: bold; font-size: 8pt; }
            .mrp-value { font-weight: bold; font-size: 11pt; }
            .mrp-sub { font-size: 5pt; color: #333; }
            .size-cell { text-align: center; vertical-align: middle; }
            .size-label { font-size: 7pt; margin-bottom: 0.5mm; }
            .size-value { font-size: 34pt; font-weight: bold; line-height: 1; }
            .small-row { font-size: 6pt; padding: 0.3mm 1.5mm; height: 2.5mm; }
            .qr-cell { text-align: center; vertical-align: middle; padding: 0.3mm; }
            .qr-cell svg { width: 13mm; height: 13mm; }
            .footer-row { font-size: 5pt; line-height: 1.2; padding: 0.8mm 1.5mm; vertical-align: top; border-top: 1px solid #000; }
          </style>
        </head>
        <body>${labelHtmlParts.join('')}</body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Wait for the document to fully load before triggering print
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
    };
  };

  if (productsLoading) return <PageSpinner />;

  // --- Success state: show generated labels ---
  if (generatedBoxes.length > 0) {
    const sizeGroups = generatedBoxes.reduce<Record<string, ChildBoxWithProduct[]>>((acc, box) => {
      if (!acc[box.size]) acc[box.size] = [];
      acc[box.size].push(box);
      return acc;
    }, {});

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
            {effectiveProduct && (
              <p className="text-sm text-brand-text-muted text-center">
                {effectiveProduct.article_name} | {effectiveProduct.colour}
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-center">
              {Object.entries(sizeGroups).map(([size, boxes]) => (
                <span
                  key={size}
                  className="px-3 py-1 rounded-full bg-binny-navy-light text-binny-navy text-sm font-medium"
                >
                  Size {size} &times; {boxes.length}
                </span>
              ))}
            </div>
          </div>

          <div ref={printRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-6">
            {generatedBoxes.slice(0, 16).map((box) => (
              <div
                key={box.id}
                className="p-3 bg-gray-50 rounded-lg border border-brand-border text-center"
              >
                <QrCode className="h-8 w-8 mx-auto mb-2 text-brand-text-muted" />
                <p className="text-xs font-mono text-brand-text-dark truncate">{box.barcode}</p>
                <p className="text-[10px] text-brand-text-muted mt-1">{box.sku} | Size {box.size}</p>
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
                setColourProductId('');
                setSizeQuantities({});
                setQuantity(1);
                setSearchTerm('');
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
        description="Bulk generate child box labels across multiple sizes"
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
            {/* Searchable article dropdown */}
            <div ref={dropdownRef}>
              <label className="block text-sm font-medium text-brand-text-dark mb-1.5">
                Product (Article)
              </label>
              <div className="relative">
                <div
                  className={`w-full flex items-center rounded-lg border bg-white px-4 py-2.5 text-sm cursor-pointer transition-all duration-200 ${
                    errors.product_id
                      ? 'border-brand-error focus-within:border-brand-error focus-within:ring-red-200'
                      : 'border-brand-border focus-within:border-binny-navy focus-within:ring-binny-navy/20'
                  } focus-within:ring-2`}
                  onClick={() => setDropdownOpen(true)}
                  style={{ borderColor: errors.product_id ? '#DC2626' : undefined }}
                >
                  <Search className="h-4 w-4 text-brand-text-muted shrink-0 mr-2" />
                  <input
                    type="text"
                    placeholder={productId ? '' : 'Search and select a product...'}
                    value={dropdownOpen ? searchTerm : (articleOptions.find(o => o.value === productId)?.label || searchTerm)}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      if (!dropdownOpen) setDropdownOpen(true);
                    }}
                    onFocus={() => {
                      setDropdownOpen(true);
                      if (productId) setSearchTerm('');
                    }}
                    className="flex-1 outline-none bg-transparent text-brand-text-dark placeholder:text-brand-text-muted"
                  />
                  <ChevronDown className={`h-4 w-4 text-brand-text-muted shrink-0 ml-2 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </div>
                {dropdownOpen && (
                  <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-white border border-brand-border rounded-lg shadow-lg">
                    {articleOptions.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-brand-text-muted">No products found</div>
                    ) : (
                      articleOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            handleArticleChange(opt.value);
                            setSearchTerm('');
                            setDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                            productId === opt.value ? 'bg-binny-navy-light text-binny-navy font-medium' : 'text-brand-text-dark'
                          }`}
                          style={productId === opt.value ? { backgroundColor: '#EEEDF7', color: '#2D2A6E' } : undefined}
                        >
                          {opt.label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {errors.product_id && <p className="mt-1 text-xs text-brand-error" style={{ color: '#DC2626' }}>{errors.product_id}</p>}
            </div>

            {/* Colour selector */}
            {productId && (
              <div>
                <label className="block text-sm font-medium text-brand-text-dark mb-2">
                  Colour
                </label>
                {coloursLoading ? (
                  <div className="text-sm text-brand-text-muted py-4 text-center">Loading colours...</div>
                ) : colourOptions && colourOptions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {colourOptions.map((opt) => {
                      const isSelected = colourProductId === opt.product_id;
                      return (
                        <button
                          key={opt.product_id}
                          type="button"
                          onClick={() => handleColourChange(opt.product_id)}
                          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            isSelected
                              ? 'bg-binny-navy text-white border-binny-navy'
                              : 'bg-white text-brand-text-dark border-brand-border hover:border-binny-navy hover:text-binny-navy'
                          }`}
                        >
                          {opt.colour}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-brand-text-muted py-2">No colours found for this article.</p>
                )}
              </div>
            )}

            {/* Product info card */}
            {effectiveProduct && colourProductId && (
              <div className="p-4 bg-gray-50 rounded-lg border border-brand-border">
                <p className="text-sm font-semibold text-brand-text-dark mb-1">
                  {effectiveProduct.article_name}
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs text-brand-text-muted">
                  <span>Article Code: {effectiveProduct.article_code}</span>
                  <span>Colour: {effectiveProduct.colour}</span>
                  <span>MRP: {formatCurrency(effectiveProduct.mrp)}</span>
                  {effectiveProduct.category && <span>Category: {effectiveProduct.category}</span>}
                  {effectiveProduct.section && <span>Section: {effectiveProduct.section}</span>}
                  {effectiveProduct.location && <span>Location: {effectiveProduct.location}</span>}
                </div>
              </div>
            )}

            <Input
              label="Quantity per Box (Pairs)"
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

            {/* Size grid */}
            {effectiveProductId && colourProductId && (
              <div>
                <label className="block text-sm font-medium text-brand-text-dark mb-2">
                  Number of Labels per Size
                </label>
                {sizesLoading ? (
                  <div className="text-sm text-brand-text-muted py-4 text-center">Loading sizes...</div>
                ) : sortedSizes.length > 0 ? (
                  <div className="border border-brand-border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left text-xs font-medium text-brand-text-muted px-4 py-2">Size</th>
                          <th className="text-left text-xs font-medium text-brand-text-muted px-4 py-2">MRP</th>
                          <th className="text-left text-xs font-medium text-brand-text-muted px-4 py-2">No. of Labels</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedSizes.map((product) => (
                          <tr key={product.id} className="border-t border-brand-border">
                            <td className="px-4 py-2">
                              <span className="text-sm font-semibold text-brand-text-dark">{product.size}</span>
                            </td>
                            <td className="px-4 py-2">
                              <span className="text-sm text-brand-text-muted">{formatCurrency(product.mrp)}</span>
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="0"
                                max="500"
                                value={sizeQuantities[product.size] || 0}
                                onChange={(e) => handleSizeQuantityChange(product.size, e.target.value)}
                                className="w-24 px-3 py-1.5 text-sm border border-brand-border rounded-md focus:outline-none focus:ring-2 focus:ring-binny-navy focus:border-transparent"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-brand-text-muted py-4 text-center">No sizes found for this product.</p>
                )}
                {errors.sizes && (
                  <p className="text-sm text-red-500 mt-1">{errors.sizes}</p>
                )}
              </div>
            )}

            {/* Summary */}
            {sizeSummary.total > 0 && (
              <div className="p-4 bg-binny-navy-light rounded-lg border border-binny-navy/20">
                <p className="text-sm font-semibold text-brand-text-dark mb-2">Summary</p>
                <p className="text-sm text-brand-text-muted">
                  Sizes selected:{' '}
                  {sizeSummary.entries.map((e) => `${e.size} (\u00d7${e.count})`).join(', ')}
                </p>
                <p className="text-sm font-bold text-binny-navy mt-1">
                  Total labels: {sizeSummary.total}
                </p>
              </div>
            )}
          </CardBody>
          <CardFooter className="px-6 pb-6">
            <Button variant="secondary" type="button" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={isPending}
              disabled={sizeSummary.total === 0 || !effectiveProductId}
              leftIcon={<QrCode className="h-4 w-4" />}
            >
              Confirm &amp; Generate
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
