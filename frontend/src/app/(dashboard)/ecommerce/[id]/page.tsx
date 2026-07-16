'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ShoppingCart,
  Lock,
  PackageOpen,
  ScanLine,
  Copy,
  Plus,
  X,
  BarChart3,
  Boxes,
} from 'lucide-react';
import Button from '@/components/ui/Button';
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
import Badge from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/layout/PageHeader';
import QRScanner from '@/components/scanning/QRScanner';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import { ROUTES } from '@/constants';
import { ecommerceService } from '@/services/ecommerce.service';
import { childBoxService } from '@/services/childBox.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function EcommerceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isManager } = useAuth();

  const [showUnpackConfirm, setShowUnpackConfirm] = useState(false);
  const [showAddBox, setShowAddBox] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cartonBarcode, setCartonBarcode] = useState('');
  const [isScanningCarton, setIsScanningCarton] = useState(false);
  const queryClient = useQueryClient();

  const { data: record, isLoading } = useApiQuery(
    ['ecommerce', id],
    () => ecommerceService.getById(id)
  );

  const { data: assortment } = useApiQuery(
    ['ecommerce-assortment', id],
    () => ecommerceService.getAssortment(id),
    { enabled: !!record }
  );

  const { data: cartons } = useApiQuery(
    ['ecommerce-cartons', id],
    () => ecommerceService.getCartons(id),
    { enabled: !!record }
  );

  const { mutate: closeRecord, isPending: isClosing } = useApiMutation(
    () => ecommerceService.close(id),
    {
      successMessage: 'E-commerce record closed successfully',
      invalidateKeys: [['ecommerce', id], ['ecommerce-assortment', id], ['ecommerce'], ['dashboard-stats']],
    }
  );

  const { mutate: fullUnpack, isPending: isUnpacking } = useApiMutation(
    () => ecommerceService.fullUnpack(id),
    {
      successMessage: 'E-commerce record fully unpacked',
      invalidateKeys: [['ecommerce', id], ['ecommerce-assortment', id], ['ecommerce-cartons', id], ['ecommerce'], ['child-boxes'], ['dashboard-stats']],
      onSuccess: () => setShowUnpackConfirm(false),
    }
  );

  const invalidateRecord = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['ecommerce', id] });
    queryClient.invalidateQueries({ queryKey: ['ecommerce-assortment', id] });
    queryClient.invalidateQueries({ queryKey: ['ecommerce-cartons', id] });
    queryClient.invalidateQueries({ queryKey: ['ecommerce'] });
    queryClient.invalidateQueries({ queryKey: ['child-boxes'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  }, [id, queryClient]);

  const addBoxByBarcode = useCallback(
    async (barcode: string) => {
      if (!barcode.trim()) {
        toast.error('Enter a barcode');
        return;
      }
      setIsAdding(true);
      try {
        const childBox = await childBoxService.getByBarcode(barcode.trim());
        if (childBox.status !== 'FREE' && childBox.status !== 'GENERATED') {
          toast.error(`Box ${barcode} is ${childBox.status} — only FREE or GENERATED boxes can be added`);
          return;
        }
        await ecommerceService.addBox({ child_box_id: childBox.id, ecommerce_record_id: id });
        toast.success(`Added: ${barcode}`);
        invalidateRecord();
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Failed to add box';
        toast.error(message);
      } finally {
        setIsAdding(false);
      }
    },
    [id, invalidateRecord]
  );

  const handleScan = useCallback(
    (qrCode: string) => {
      addBoxByBarcode(qrCode);
    },
    [addBoxByBarcode]
  );

  // Scan a whole master carton → move ALL its packed boxes into this record at once.
  const handleScanCarton = useCallback(
    async (barcode: string) => {
      const code = barcode.trim().toUpperCase();
      if (!code) {
        toast.error('Enter a carton barcode');
        return;
      }
      setIsScanningCarton(true);
      try {
        const result = await ecommerceService.scanCarton({ ecommerce_record_id: id, carton_barcode: code });
        toast.success(`Added ${result.added} box${result.added === 1 ? '' : 'es'} from carton ${result.cartonBarcode}`);
        setCartonBarcode('');
        invalidateRecord();
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Failed to scan carton';
        toast.error(message);
      } finally {
        setIsScanningCarton(false);
      }
    },
    [id, invalidateRecord]
  );

  const handleRemoveBox = useCallback(
    async (childBoxId: string, barcode: string) => {
      setRemovingId(childBoxId);
      try {
        await ecommerceService.removeBox({ child_box_id: childBoxId, ecommerce_record_id: id });
        toast.success(`Removed: ${barcode}`);
        invalidateRecord();
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Failed to remove box';
        toast.error(message);
      } finally {
        setRemovingId(null);
      }
    },
    [id, invalidateRecord]
  );

  const handleCopyBarcode = () => {
    if (record?.ecommerce_barcode) {
      navigator.clipboard.writeText(record.ecommerce_barcode);
      toast.success('Barcode copied');
    }
  };

  if (isLoading) return <PageSpinner />;

  if (!record) {
    return (
      <div className="text-center py-12">
        <p className="text-brand-text-muted">E-commerce record not found.</p>
      </div>
    );
  }

  const canAddBox = record.status === 'CREATED' || record.status === 'ACTIVE';
  const canClose = record.status === 'ACTIVE' && isManager;
  const canUnpack = record.status === 'CREATED' || record.status === 'ACTIVE' || record.status === 'CLOSED';
  const totalAssortmentQty = assortment?.reduce((sum, item) => sum + item.count, 0) || 0;

  return (
    <div>
      <PageHeader
        title={`E-commerce: ${record.ecommerce_barcode}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyBarcode}
              leftIcon={<Copy className="h-4 w-4" />}
            >
              Copy Barcode
            </Button>
            {canAddBox && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddBox(!showAddBox)}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add Box
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
            {canClose && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => closeRecord(undefined as void)}
                isLoading={isClosing}
                leftIcon={<Lock className="h-4 w-4" />}
              >
                Close Record
              </Button>
            )}
            <Link href={ROUTES.ECOMMERCE}>
              <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Back
              </Button>
            </Link>
          </div>
        }
      />

      {/* Status / Info / Timeline cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Status</p>
          <StatusBadge status={record.status} />
          <p className="mt-2 text-sm font-medium text-brand-text-dark">{record.name}</p>
          {record.marketplace && (
            <p className="text-xs text-brand-text-muted mt-0.5">{record.marketplace}</p>
          )}
          {record.order_reference && (
            <p className="text-xs text-brand-text-muted font-mono mt-0.5">{record.order_reference}</p>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Details</p>
          {record.listing_sku && (
            <p className="text-xs text-brand-text-muted mb-1">
              <span className="font-medium text-brand-text-dark">Listing SKU:</span>{' '}
              {record.listing_sku}
            </p>
          )}
          {record.mapped_date && (
            <p className="text-xs text-brand-text-muted mb-1">
              <span className="font-medium text-brand-text-dark">Mapped Date:</span>{' '}
              {formatDateTime(record.mapped_date)}
            </p>
          )}
          {record.notes && (
            <p className="text-xs text-brand-text-muted">
              <span className="font-medium text-brand-text-dark">Notes:</span> {record.notes}
            </p>
          )}
          {!record.listing_sku && !record.mapped_date && !record.notes && (
            <p className="text-sm text-brand-text-muted">No additional details.</p>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Timeline</p>
          <p className="text-xs text-brand-text-muted">
            <span className="font-medium text-brand-text-dark">Created:</span>{' '}
            {formatDateTime(record.created_at)}
            {record.creator?.name ? ` by ${record.creator.name}` : ''}
          </p>
          {record.closed_at && (
            <p className="text-xs text-brand-text-muted mt-1">
              <span className="font-medium text-brand-text-dark">Closed:</span>{' '}
              {formatDateTime(record.closed_at)}
            </p>
          )}
          {record.dispatched_at && (
            <p className="text-xs text-brand-text-muted mt-1">
              <span className="font-medium text-brand-text-dark">Dispatched:</span>{' '}
              {formatDateTime(record.dispatched_at)}
            </p>
          )}
          <p className="text-sm font-bold text-brand-text-dark mt-2">{record.child_count} boxes</p>
        </Card>
      </div>

      {/* Add Box section */}
      {showAddBox && canAddBox && (
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
              <ScanLine className="h-4 w-4" />
              Scan to Add Box
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAddBox(false);
                setShowScanner(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <HIDScannerInput
            onScan={handleScan}
            placeholder="Scan or enter child box barcode..."
            autoFocus
            disabled={isAdding}
            className="mb-4"
          />

          <div className="flex items-center gap-3 mb-4">
            <Button
              variant={showScanner ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowScanner(!showScanner)}
              leftIcon={<ScanLine className="h-4 w-4" />}
            >
              {showScanner ? 'Hide Camera' : 'Use Camera Instead'}
            </Button>
          </div>

          {showScanner && (
            <div className="max-w-md">
              <QRScanner onScanSuccess={handleScan} autoStart />
            </div>
          )}

          {/* Add a full master carton in one scan */}
          <div className="mt-4 pt-4 border-t border-brand-border">
            <p className="text-sm font-medium text-brand-text-dark mb-1 flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Or add a full carton
            </p>
            <p className="text-xs text-brand-text-muted mb-2">
              Scan/enter a master carton barcode to add ALL of its packed boxes to this record at
              once. The carton itself stays intact — it is not unpacked or emptied.
            </p>
            <div className="flex gap-2 max-w-md">
              <input
                type="text"
                value={cartonBarcode}
                onChange={(e) => setCartonBarcode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleScanCarton(cartonBarcode); }}
                placeholder="Master carton barcode..."
                className="flex-1 px-3 py-2 border border-brand-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              />
              <Button
                onClick={() => handleScanCarton(cartonBarcode)}
                isLoading={isScanningCarton}
                disabled={!cartonBarcode.trim() || isScanningCarton}
                leftIcon={<PackageOpen className="h-4 w-4" />}
              >
                Add Carton
              </Button>
            </div>
          </div>
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
            {assortment.map((item) => (
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
            <ShoppingCart className="h-4 w-4" />
            Child Boxes ({record.child_boxes?.length || 0})
          </h3>
        </div>
        {!record.child_boxes?.length ? (
          <div className="p-12 text-center">
            <p className="text-brand-text-muted">No child boxes in this e-commerce record.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {record.child_boxes.map((box, index) => (
                <div key={box.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-brand-text-muted">#{index + 1}</span>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={box.status} size="sm" />
                      {record.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleRemoveBox(box.id, box.barcode)}
                          disabled={removingId === box.id}
                          className="p-1 rounded text-brand-text-muted hover:text-brand-error hover:bg-red-50 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="font-mono text-xs mb-1">{box.barcode}</p>
                  <p className="text-sm font-medium">{box.article_name}</p>
                  <div className="flex gap-3 text-xs text-brand-text-muted mt-1">
                    <span>{box.sku}</span>
                    <span>{box.colour}</span>
                    <span>Size {box.size}</span>
                    <span>{formatCurrency(box.mrp)}</span>
                  </div>
                  {box.source === 'carton' && (
                    <div className="mt-1.5">
                      <Badge variant="blue" size="sm">
                        Carton {box.carton_barcode}
                      </Badge>
                    </div>
                  )}
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
                    <TableHeader>Source</TableHeader>
                    {record.status === 'ACTIVE' && <TableHeader>{''}</TableHeader>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {record.child_boxes.map((box, index) => (
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
                      <TableCell>
                        {box.source === 'carton' ? (
                          <Badge variant="blue" size="sm">
                            Carton {box.carton_barcode}
                          </Badge>
                        ) : (
                          <span className="text-brand-text-muted text-xs">—</span>
                        )}
                      </TableCell>
                      {record.status === 'ACTIVE' && (
                        <TableCell>
                          <button
                            onClick={() => handleRemoveBox(box.id, box.barcode)}
                            disabled={removingId === box.id}
                            className="p-1 rounded text-brand-text-muted hover:text-brand-error hover:bg-red-50 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {/* Cartons in this record — secondary section (boxes are primary for the
          e-commerce channel; whole cartons allocated intact list below). */}
      {cartons && cartons.length > 0 && (
        <Card padding={false} className="mt-6">
          <div className="p-4 border-b border-brand-border">
            <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Cartons in this Record ({cartons.length})
            </h3>
          </div>

          {/* Mobile cards */}
          <div className="block md:hidden divide-y divide-brand-border">
            {cartons.map((c) => (
              <div key={c.mapping_id} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs">{c.carton_barcode}</span>
                  <StatusBadge status={c.status} size="sm" />
                </div>
                {c.article_summary && <p className="text-sm font-medium">{c.article_summary}</p>}
                <div className="flex gap-3 text-xs text-brand-text-muted mt-1">
                  {c.colour_summary && <span>{c.colour_summary}</span>}
                  {c.size_summary && <span>{c.size_summary}</span>}
                  {c.mrp_summary != null && <span>{formatCurrency(c.mrp_summary)}</span>}
                </div>
                <p className="text-sm font-bold mt-1">{c.child_count} boxes</p>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Carton Barcode</TableHeader>
                  <TableHeader>Boxes</TableHeader>
                  <TableHeader>Article</TableHeader>
                  <TableHeader>Colour</TableHeader>
                  <TableHeader>Size</TableHeader>
                  <TableHeader>MRP</TableHeader>
                  <TableHeader>Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {cartons.map((c) => (
                  <TableRow key={c.mapping_id}>
                    <TableCell>
                      <span className="font-mono text-xs">{c.carton_barcode}</span>
                    </TableCell>
                    <TableCell className="font-semibold">{c.child_count}</TableCell>
                    <TableCell className="font-medium">{c.article_summary || '—'}</TableCell>
                    <TableCell>{c.colour_summary || '—'}</TableCell>
                    <TableCell>{c.size_summary || '—'}</TableCell>
                    <TableCell>{c.mrp_summary != null ? formatCurrency(c.mrp_summary) : '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Full Unpack Confirmation Modal */}
      <Modal
        isOpen={showUnpackConfirm}
        onClose={() => setShowUnpackConfirm(false)}
        title="Full Unpack"
        description="Are you sure you want to fully unpack this e-commerce record? All child boxes will be removed and set to FREE status."
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
            This will unpack <strong>{record.child_count}</strong> child box(es) from e-commerce
            record{' '}
            <strong className="font-mono">{record.ecommerce_barcode}</strong>. This action cannot
            be undone.
          </p>
        </div>
      </Modal>
    </div>
  );
}
