'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Package,
  Lock,
  PackageOpen,
  ScanLine,
  Printer,
  Plus,
  X,
  BarChart3,
} from 'lucide-react';
// QRCodeSVG removed — master carton label no longer uses QR per client wireframe
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui/Table';
import StatusBadge from '@/components/ui/StatusBadge';
import { PageSpinner } from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/layout/PageHeader';
import QRScanner from '@/components/scanning/QRScanner';
import { ROUTES } from '@/constants';
import { masterCartonService } from '@/services/masterCarton.service';
import { childBoxService } from '@/services/childBox.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function MasterCartonDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [showUnpackConfirm, setShowUnpackConfirm] = useState(false);
  const [showAddBoxes, setShowAddBoxes] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isPacking, setIsPacking] = useState(false);
  const queryClient = useQueryClient();

  const { data: carton, isLoading } = useApiQuery(
    ['master-carton', id],
    () => masterCartonService.getById(id)
  );

  const { data: assortment } = useApiQuery(
    ['master-carton-assortment', id],
    () => masterCartonService.getAssortment(id),
    { enabled: !!carton }
  );

  const { mutate: closeCarton, isPending: isClosing } = useApiMutation(
    () => masterCartonService.close(id),
    {
      successMessage: 'Master carton closed successfully',
      invalidateKeys: [['master-carton', id], ['master-carton-assortment', id], ['master-cartons'], ['dashboard-stats']],
    }
  );

  const { mutate: fullUnpack, isPending: isUnpacking } = useApiMutation(
    () => masterCartonService.fullUnpack(id),
    {
      successMessage: 'Master carton fully unpacked',
      invalidateKeys: [['master-carton', id], ['master-carton-assortment', id], ['master-cartons'], ['child-boxes'], ['dashboard-stats']],
      onSuccess: () => setShowUnpackConfirm(false),
    }
  );

  const packByBarcode = useCallback(
    async (barcode: string) => {
      if (!barcode.trim()) {
        toast.error('Enter a barcode');
        return;
      }
      setIsPacking(true);
      try {
        const childBox = await childBoxService.getByBarcode(barcode.trim());
        await masterCartonService.pack({
          child_box_id: childBox.id,
          master_carton_id: id,
        });
        toast.success(`Packed: ${barcode}`);
        setManualBarcode('');
        queryClient.invalidateQueries({ queryKey: ['master-carton', id] });
        queryClient.invalidateQueries({ queryKey: ['master-carton-assortment', id] });
        queryClient.invalidateQueries({ queryKey: ['master-cartons'] });
        queryClient.invalidateQueries({ queryKey: ['child-boxes'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Failed to pack box';
        toast.error(message);
      } finally {
        setIsPacking(false);
      }
    },
    [id]
  );

  const handleScan = useCallback(
    (qrCode: string) => {
      packByBarcode(qrCode);
    },
    [packByBarcode]
  );

  const handleManualAdd = () => {
    packByBarcode(manualBarcode);
  };

  const handlePrintLabel = async () => {
    if (!carton) return;

    // Pre-fetch logo as base64 for offline-safe printing
    let logoSrc = '/monogram.png';
    try {
      const resp = await fetch('/monogram.png');
      const blob = await resp.blob();
      logoSrc = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      // Fallback to URL — onerror handler will show text
    }

    const printWindow = window.open('', '_blank', 'width=500,height=700');
    if (!printWindow) {
      toast.error('Please allow popups to print labels');
      return;
    }

    // Compute size assortment from assortment data: pivot by size
    const sizeMap: Record<string, number> = {};
    let primaryArticle = '';
    let primaryColour = '';
    let primaryMrp = 0;

    if (assortment && assortment.length > 0) {
      for (const item of assortment) {
        sizeMap[item.size] = (sizeMap[item.size] || 0) + item.count;
        if (!primaryArticle) {
          primaryArticle = item.article_name;
          primaryColour = item.colour;
          primaryMrp = item.mrp;
        }
      }
    }

    const sizes = Object.keys(sizeMap).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });

    const sizeHeaders = sizes.map((s) => `<td>${s}</td>`).join('');
    const sizeQtys = sizes.map((s) => `<td>${sizeMap[s]}</td>`).join('');

    const packDate = carton.closed_at
      ? new Date(carton.closed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const mrpFormatted = primaryMrp ? Number(primaryMrp).toFixed(2) : '-';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Label - ${carton.carton_barcode}</title>
        <style>
          @page { size: 100mm 150mm; margin: 4mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, Helvetica, sans-serif; width: 92mm; }
          .label { border: 2px solid #000; }
          .logo { text-align: center; padding: 3mm 2mm 2mm 2mm; }
          .logo img { height: 14mm; }
          table.info { width: 100%; border-collapse: collapse; }
          table.info td { border: 1px solid #000; padding: 2mm 3mm; font-size: 10pt; }
          .article-row { font-weight: bold; font-size: 12pt; }
          .split-row td { width: 50%; }
          .assortment-label { font-weight: bold; font-size: 10pt; padding: 2mm 3mm; border: 1px solid #000; border-top: none; }
          table.sizes { width: 100%; border-collapse: collapse; font-size: 10pt; }
          table.sizes td { border: 1px solid #000; text-align: center; padding: 2mm 1.5mm; }
          table.sizes .hdr { font-weight: bold; background: #f5f5f5; }
          table.sizes .total { font-weight: bold; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="logo">
            <img src="${logoSrc}" alt="Binny" onerror="this.outerHTML='<strong style=\\'font-size:18pt;color:#1B1464;\\'>BINNY</strong>'" />
          </div>
          <table class="info">
            <tr>
              <td colspan="2" class="article-row">Article No.: ${primaryArticle || '-'}</td>
            </tr>
            <tr>
              <td colspan="2">Colour: ${primaryColour || '-'}</td>
            </tr>
            <tr class="split-row">
              <td>MRP: &#8377; ${mrpFormatted}</td>
              <td>Pack Date: ${packDate}</td>
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
              <td class="total">${totalAssortmentQty} Prs</td>
            </tr>
          </table>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.print();
    };
  };

  if (isLoading) return <PageSpinner />;

  if (!carton) {
    return (
      <div className="text-center py-12">
        <p className="text-brand-text-muted">Carton not found.</p>
      </div>
    );
  }

  const canUnpack = carton.status === 'ACTIVE' || carton.status === 'CLOSED';
  const canAddBoxes = carton.status === 'ACTIVE' || carton.status === 'CREATED';
  const totalAssortmentQty = assortment?.reduce((sum, item) => sum + item.count, 0) || 0;

  return (
    <div>
      <PageHeader
        title={`Carton: ${carton.carton_barcode}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePrintLabel}
              leftIcon={<Printer className="h-4 w-4" />}
            >
              Print Label
            </Button>
            {canAddBoxes && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddBoxes(!showAddBoxes)}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add Boxes
              </Button>
            )}
            {canUnpack && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowUnpackConfirm(true)}
                leftIcon={<PackageOpen className="h-4 w-4" />}
              >
                Full Unpack
              </Button>
            )}
            {carton.status === 'ACTIVE' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => closeCarton(undefined as void)}
                isLoading={isClosing}
                leftIcon={<Lock className="h-4 w-4" />}
              >
                Close Carton
              </Button>
            )}
            <Link href={ROUTES.MASTER_CARTONS}>
              <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Back
              </Button>
            </Link>
          </div>
        }
      />

      {/* Status / Capacity / Dates cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Status</p>
          <StatusBadge status={carton.status} />
        </Card>
        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Capacity</p>
          <p className="text-2xl font-bold text-brand-text-dark">
            {carton.child_count} / {carton.max_capacity}
          </p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Created</p>
          <p className="text-sm font-medium text-brand-text-dark">
            {formatDateTime(carton.created_at)}
          </p>
          {carton.closed_at && (
            <p className="text-xs text-brand-text-muted mt-1">
              Closed: {formatDateTime(carton.closed_at)}
            </p>
          )}
          {carton.dispatched_at && (
            <p className="text-xs text-brand-text-muted mt-1">
              Dispatched: {formatDateTime(carton.dispatched_at)}
            </p>
          )}
        </Card>
      </div>

      {/* Scan to Pack section */}
      {showAddBoxes && canAddBoxes && (
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
              <ScanLine className="h-4 w-4" />
              Scan to Pack
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddBoxes(false);
                setShowScanner(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Manual barcode entry */}
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <Input
                placeholder="Enter barcode (e.g. BINNY-CB-001)"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleManualAdd();
                }}
              />
            </div>
            <Button
              onClick={handleManualAdd}
              isLoading={isPacking}
              disabled={!manualBarcode.trim()}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Add
            </Button>
          </div>

          {/* Scanner toggle */}
          <div className="flex items-center gap-3 mb-4">
            <Button
              variant={showScanner ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowScanner(!showScanner)}
              leftIcon={<ScanLine className="h-4 w-4" />}
            >
              {showScanner ? 'Hide Camera' : 'Open Camera Scanner'}
            </Button>
          </div>

          {showScanner && (
            <div className="max-w-md">
              <QRScanner onScanSuccess={handleScan} autoStart />
            </div>
          )}
        </Card>
      )}

      {/* Assortment Summary */}
      {assortment && assortment.length > 0 && (
        <Card padding={false} className="mb-6">
          <div className="p-4 border-b border-brand-border">
            <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Assortment Summary
            </h3>
          </div>

          {/* Mobile cards */}
          <div className="block md:hidden divide-y divide-brand-border">
            {assortment.map((item, index) => (
              <div key={`${item.article_name}-${item.colour}-${item.size}`} className="p-4">
                <p className="text-sm font-medium">{item.article_name}</p>
                <div className="flex gap-3 text-xs text-brand-text-muted mt-1">
                  <span>{item.colour}</span>
                  <span>Size {item.size}</span>
                  <span>{formatCurrency(item.mrp)}</span>
                </div>
                <p className="text-sm font-bold mt-1">Qty: {item.count}</p>
              </div>
            ))}
            <div className="p-4 bg-gray-50">
              <p className="text-sm font-bold text-brand-text-dark">
                Total: {totalAssortmentQty} Prs
              </p>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Article</TableHeader>
                  <TableHeader>Colour</TableHeader>
                  <TableHeader>Size</TableHeader>
                  <TableHeader>MRP</TableHeader>
                  <TableHeader className="text-right">Qty</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {assortment.map((item) => (
                  <TableRow key={`${item.article_name}-${item.colour}-${item.size}`}>
                    <TableCell className="font-medium">{item.article_name}</TableCell>
                    <TableCell>{item.colour}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>{formatCurrency(item.mrp)}</TableCell>
                    <TableCell className="text-right font-bold">{item.count}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="font-bold text-brand-text-dark">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold text-brand-text-dark">
                    {totalAssortmentQty}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Child Boxes */}
      <Card padding={false}>
        <div className="p-4 border-b border-brand-border">
          <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
            <Package className="h-4 w-4" />
            Child Boxes ({carton.child_boxes?.length || 0})
          </h3>
        </div>
        {!carton.child_boxes?.length ? (
          <div className="p-12 text-center">
            <p className="text-brand-text-muted">No child boxes in this carton.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {carton.child_boxes.map((box, index) => (
                <div key={box.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-brand-text-muted">#{index + 1}</span>
                    <StatusBadge status={box.status} size="sm" />
                  </div>
                  <p className="font-mono text-xs mb-1">{box.barcode}</p>
                  <p className="text-sm font-medium">{box.article_name}</p>
                  <div className="flex gap-3 text-xs text-brand-text-muted mt-1">
                    <span>{box.sku}</span>
                    <span>{box.colour}</span>
                    <span>Size {box.size}</span>
                    <span>{formatCurrency(box.mrp)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>#</TableHeader>
                    <TableHeader>Barcode</TableHeader>
                    <TableHeader>SKU</TableHeader>
                    <TableHeader>Product</TableHeader>
                    <TableHeader>Colour</TableHeader>
                    <TableHeader>Size</TableHeader>
                    <TableHeader>MRP</TableHeader>
                    <TableHeader>Status</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {carton.child_boxes.map((box, index) => (
                    <TableRow key={box.id}>
                      <TableCell className="text-brand-text-muted">{index + 1}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{box.barcode}</span>
                      </TableCell>
                      <TableCell>{box.sku}</TableCell>
                      <TableCell className="font-medium">{box.article_name}</TableCell>
                      <TableCell>{box.colour}</TableCell>
                      <TableCell>{box.size}</TableCell>
                      <TableCell>{formatCurrency(box.mrp)}</TableCell>
                      <TableCell>
                        <StatusBadge status={box.status} size="sm" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {/* Full Unpack Confirmation Modal */}
      <Modal
        isOpen={showUnpackConfirm}
        onClose={() => setShowUnpackConfirm(false)}
        title="Full Unpack"
        description="Are you sure you want to fully unpack this master carton? All child boxes will be removed and set to FREE status."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowUnpackConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isUnpacking}
              onClick={() => fullUnpack(undefined as void)}
              leftIcon={<PackageOpen className="h-4 w-4" />}
            >
              Confirm Unpack
            </Button>
          </>
        }
      >
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">
            This will unpack <strong>{carton.child_count}</strong> child box(es) from carton{' '}
            <strong className="font-mono">{carton.carton_barcode}</strong>. This action cannot be
            undone.
          </p>
        </div>
      </Modal>

      {/* Print label is now generated directly in handlePrintLabel — no hidden div needed */}
    </div>
  );
}
