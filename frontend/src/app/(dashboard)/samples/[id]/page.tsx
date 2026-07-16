'use client';

import { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FlaskConical,
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
import { sampleService } from '@/services/sample.service';
import { childBoxService } from '@/services/childBox.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import { checkFootAvailability } from '@/lib/sampleFoot';
import toast from 'react-hot-toast';

export default function SampleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { isManager } = useAuth();

  const [showUnpackConfirm, setShowUnpackConfirm] = useState(false);
  const [showAddBox, setShowAddBox] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedFoot, setSelectedFoot] = useState<'PAIR' | 'LEFT' | 'RIGHT'>('PAIR');
  const [showCartonScanner, setShowCartonScanner] = useState(false);
  const [isScanningCarton, setIsScanningCarton] = useState(false);
  const queryClient = useQueryClient();

  const { data: sample, isLoading } = useApiQuery(
    ['sample', id],
    () => sampleService.getById(id)
  );

  const { data: assortment } = useApiQuery(
    ['sample-assortment', id],
    () => sampleService.getAssortment(id),
    { enabled: !!sample }
  );

  const { data: cartons } = useApiQuery(
    ['sample-cartons', id],
    () => sampleService.getCartons(id),
    { enabled: !!sample }
  );

  const { mutate: closeSample, isPending: isClosing } = useApiMutation(
    () => sampleService.close(id),
    {
      successMessage: 'Sample closed successfully',
      invalidateKeys: [['sample', id], ['sample-assortment', id], ['samples'], ['dashboard-stats']],
    }
  );

  const { mutate: fullUnpack, isPending: isUnpacking } = useApiMutation(
    () => sampleService.fullUnpack(id),
    {
      successMessage: 'Sample fully unpacked',
      invalidateKeys: [['sample', id], ['sample-assortment', id], ['sample-cartons', id], ['samples'], ['child-boxes'], ['dashboard-stats']],
      onSuccess: () => setShowUnpackConfirm(false),
    }
  );

  const invalidateSample = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['sample', id] });
    queryClient.invalidateQueries({ queryKey: ['sample-assortment', id] });
    queryClient.invalidateQueries({ queryKey: ['sample-cartons', id] });
    queryClient.invalidateQueries({ queryKey: ['samples'] });
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
        // Foot-aware guard: a SAMPLE box is still addable for its other free foot.
        const avail = checkFootAvailability(childBox, selectedFoot);
        if (!avail.ok) {
          toast.error(avail.reason);
          return;
        }
        await sampleService.addBox({ child_box_id: childBox.id, sample_record_id: id, foot: selectedFoot });
        toast.success(`Added: ${barcode}${selectedFoot !== 'PAIR' ? ` (${selectedFoot === 'LEFT' ? 'Left' : 'Right'} foot)` : ''}`);
        invalidateSample();
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Failed to add box';
        toast.error(message);
      } finally {
        setIsAdding(false);
      }
    },
    [id, invalidateSample, selectedFoot]
  );

  const handleScan = useCallback(
    (qrCode: string) => {
      addBoxByBarcode(qrCode);
    },
    [addBoxByBarcode]
  );

  // Scan a whole master carton → adds ALL its packed boxes into this sample at once.
  // The carton itself stays intact (its boxes remain PACKED, mapping-based).
  const handleScanCarton = useCallback(
    async (barcode: string) => {
      const code = barcode.trim().toUpperCase();
      if (!code) {
        toast.error('Enter a carton barcode');
        return;
      }
      setIsScanningCarton(true);
      try {
        const result = await sampleService.scanCarton({ sample_record_id: id, carton_barcode: code });
        toast.success(`Added ${result.added} box${result.added === 1 ? '' : 'es'} from carton ${result.cartonBarcode}`);
        invalidateSample();
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Failed to scan carton';
        toast.error(message);
      } finally {
        setIsScanningCarton(false);
      }
    },
    [id, invalidateSample]
  );

  const handleRemoveBox = useCallback(
    async (childBoxId: string, barcode: string) => {
      setRemovingId(childBoxId);
      try {
        await sampleService.removeBox({ child_box_id: childBoxId, sample_record_id: id });
        toast.success(`Removed: ${barcode}`);
        invalidateSample();
      } catch (err: any) {
        const message = err?.response?.data?.message || err?.message || 'Failed to remove box';
        toast.error(message);
      } finally {
        setRemovingId(null);
      }
    },
    [id, invalidateSample]
  );

  const handleCopyBarcode = () => {
    if (sample?.sample_barcode) {
      navigator.clipboard.writeText(sample.sample_barcode);
      toast.success('Barcode copied');
    }
  };

  if (isLoading) return <PageSpinner />;

  if (!sample) {
    return (
      <div className="text-center py-12">
        <p className="text-brand-text-muted">Sample not found.</p>
      </div>
    );
  }

  const canAddBox = sample.status === 'CREATED' || sample.status === 'ACTIVE';
  const canClose = sample.status === 'ACTIVE' && isManager;
  const canUnpack = sample.status === 'CREATED' || sample.status === 'ACTIVE' || sample.status === 'CLOSED';
  const totalAssortmentQty = assortment?.reduce((sum, item) => sum + item.count, 0) || 0;

  const recipientLine = sample.customer_firm_name
    ? sample.customer_firm_name
    : sample.recipient_name
    ? `Free-text recipient: ${sample.recipient_name}`
    : null;

  return (
    <div>
      <PageHeader
        title={`Sample: ${sample.sample_barcode}`}
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
                onClick={() => closeSample(undefined as void)}
                isLoading={isClosing}
                leftIcon={<Lock className="h-4 w-4" />}
              >
                Close Sample
              </Button>
            )}
            <Link href={ROUTES.SAMPLES}>
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
          <StatusBadge status={sample.status} />
          <p className="mt-2 text-sm font-medium text-brand-text-dark">{sample.name}</p>
          {recipientLine && (
            <p className="text-xs text-brand-text-muted mt-0.5">{recipientLine}</p>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Details</p>
          {sample.purpose && (
            <p className="text-xs text-brand-text-muted mb-1">
              <span className="font-medium text-brand-text-dark">Purpose:</span> {sample.purpose}
            </p>
          )}
          {sample.sample_date && (
            <p className="text-xs text-brand-text-muted mb-1">
              <span className="font-medium text-brand-text-dark">Sample Date:</span>{' '}
              {formatDateTime(sample.sample_date)}
            </p>
          )}
          {sample.notes && (
            <p className="text-xs text-brand-text-muted">
              <span className="font-medium text-brand-text-dark">Notes:</span> {sample.notes}
            </p>
          )}
          {!sample.purpose && !sample.sample_date && !sample.notes && (
            <p className="text-sm text-brand-text-muted">No additional details.</p>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Timeline</p>
          <p className="text-xs text-brand-text-muted">
            <span className="font-medium text-brand-text-dark">Created:</span>{' '}
            {formatDateTime(sample.created_at)}
            {sample.creator?.name ? ` by ${sample.creator.name}` : ''}
          </p>
          {sample.closed_at && (
            <p className="text-xs text-brand-text-muted mt-1">
              <span className="font-medium text-brand-text-dark">Closed:</span>{' '}
              {formatDateTime(sample.closed_at)}
            </p>
          )}
          {sample.dispatched_at && (
            <p className="text-xs text-brand-text-muted mt-1">
              <span className="font-medium text-brand-text-dark">Dispatched:</span>{' '}
              {formatDateTime(sample.dispatched_at)}
            </p>
          )}
          <p className="text-sm font-bold text-brand-text-dark mt-2">{sample.child_count} boxes</p>
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

          {/* Dispatch unit applied to the next scanned box(es) */}
          <div className="mb-4">
            <p className="text-xs font-medium text-brand-text-muted mb-1.5">Dispatch unit for scanned boxes</p>
            <div className="flex gap-2">
              {(['PAIR', 'LEFT', 'RIGHT'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSelectedFoot(f)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    selectedFoot === f
                      ? 'bg-binny-navy text-white border-binny-navy'
                      : 'bg-white text-brand-text-muted border-brand-border hover:bg-gray-50'
                  }`}
                >
                  {f === 'PAIR' ? 'Pair' : f === 'LEFT' ? 'Left foot' : 'Right foot'}
                </button>
              ))}
            </div>
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

          {/* Scan a whole master carton in one go */}
          <div className="mt-6 pt-4 border-t border-brand-border">
            <h4 className="font-semibold text-brand-text-dark flex items-center gap-2 mb-1">
              <Boxes className="h-4 w-4" />
              Scan Master Carton
            </h4>
            <p className="text-xs text-brand-text-muted mb-3">
              Scan a whole master carton to add all of its packed boxes at once. The carton stays intact.
            </p>
            <HIDScannerInput
              onScan={handleScanCarton}
              placeholder="Scan or enter master carton barcode..."
              disabled={isScanningCarton}
              className="mb-4"
            />
            <div className="flex items-center gap-3">
              <Button
                variant={showCartonScanner ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowCartonScanner(!showCartonScanner)}
                leftIcon={<ScanLine className="h-4 w-4" />}
              >
                {showCartonScanner ? 'Hide Camera' : 'Use Camera Instead'}
              </Button>
            </div>
            {showCartonScanner && (
              <div className="max-w-md mt-4">
                <QRScanner onScanSuccess={handleScanCarton} autoStart />
              </div>
            )}
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
            <FlaskConical className="h-4 w-4" />
            Child Boxes ({sample.child_boxes?.length || 0})
          </h3>
        </div>
        {!sample.child_boxes?.length ? (
          <div className="p-12 text-center">
            <p className="text-brand-text-muted">No child boxes in this sample.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {sample.child_boxes.map((box, index) => (
                <div key={box.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-brand-text-muted">#{index + 1}</span>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={box.status} size="sm" />
                      {sample.status === 'ACTIVE' && (
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
                    <TableHeader>Foot</TableHeader>
                    <TableHeader>MRP</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Source</TableHeader>
                    {sample.status === 'ACTIVE' && <TableHeader>{''}</TableHeader>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sample.child_boxes.map((box, index) => (
                    <TableRow key={box.id}>
                      <TableCell className="text-brand-text-muted">{index + 1}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{box.barcode}</span>
                      </TableCell>
                      <TableCell>{box.sku}</TableCell>
                      <TableCell className="font-medium">{box.article_name}</TableCell>
                      <TableCell>{box.colour}</TableCell>
                      <TableCell>{box.size}</TableCell>
                      <TableCell>
                        {((box as { foot?: string }).foot ?? 'PAIR') === 'PAIR' ? (
                          <span className="text-brand-text-muted text-xs">Pair</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                            {(box as { foot?: string }).foot === 'LEFT' ? 'Left' : 'Right'} foot
                          </span>
                        )}
                      </TableCell>
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
                      {sample.status === 'ACTIVE' && (
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

      {/* Cartons in this sample — secondary section (boxes are primary for the
          sample/e-commerce channel; whole cartons allocated intact list below). */}
      {cartons && cartons.length > 0 && (
        <Card padding={false} className="mt-6">
          <div className="p-4 border-b border-brand-border">
            <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Cartons in this Sample ({cartons.length})
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
        description="Are you sure you want to fully unpack this sample? All child boxes will be removed and set to FREE status."
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
            This will unpack <strong>{sample.child_count}</strong> child box(es) from sample{' '}
            <strong className="font-mono">{sample.sample_barcode}</strong>. This action cannot be
            undone.
          </p>
        </div>
      </Modal>
    </div>
  );
}
