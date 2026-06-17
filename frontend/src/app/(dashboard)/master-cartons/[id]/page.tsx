'use client';

import { useState, useCallback, useRef } from 'react';
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
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
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
import { PageSpinner } from '@/components/ui/Spinner';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/layout/PageHeader';
import QRScanner from '@/components/scanning/QRScanner';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import { ROUTES } from '@/constants';
import { masterCartonService } from '@/services/masterCarton.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import { printMasterCartonLabel } from '@/lib/masterCartonLabel';
import toast from 'react-hot-toast';
import { useCan } from '@/hooks/useCan';

export default function MasterCartonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canPack = useCan('packing:pack');
  const canUnpack = useCan('packing:unpack');
  const canClose = useCan('cartons:close');

  const [showUnpackConfirm, setShowUnpackConfirm] = useState(false);
  const [showOpenLegacyConfirm, setShowOpenLegacyConfirm] = useState(false);
  const [showAddBoxes, setShowAddBoxes] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
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

  const { mutate: openLegacy, isPending: isOpeningLegacy } = useApiMutation(
    () => masterCartonService.openLegacy(id),
    {
      successMessage: 'Carton opened for repacking — now generate child-box labels and scan them in',
      invalidateKeys: [['master-carton', id], ['master-cartons'], ['inventory-breakdown'], ['dashboard-stats']],
      onSuccess: () => setShowOpenLegacyConfirm(false),
    }
  );

  // ── Serialized scan-to-pack ────────────────────────────────────────────────
  // Rapid scanning used to fire overlapping requests (each scan did two round-trips)
  // and surfaced failures only as a toast that scrolled away — so boxes silently
  // appeared "skipped". Now every scan is queued and drained by a SINGLE worker (one
  // pack at a time), de-duplicated, and recorded in a visible ledger with retry.
  type ScanEntry = { barcode: string; status: 'pending' | 'packed' | 'noop' | 'failed'; message?: string };
  const [scanLog, setScanLog] = useState<ScanEntry[]>([]);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());

  const markEntry = useCallback((barcode: string, patch: Partial<ScanEntry>) => {
    setScanLog((prev) => {
      // Patch the most recent still-pending entry for this barcode.
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].barcode === barcode && prev[i].status === 'pending') {
          const next = [...prev];
          next[i] = { ...next[i], ...patch };
          return next;
        }
      }
      return prev;
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return; // a single worker drains the queue
    processingRef.current = true;
    setIsPacking(true);
    let packedAny = false;
    try {
      while (queueRef.current.length > 0) {
        const barcode = queueRef.current.shift()!;
        try {
          const res = await masterCartonService.packByBarcode({ barcode, master_carton_id: id });
          if (res?.alreadyPacked) {
            markEntry(barcode, { status: 'noop', message: 'Already in this carton' });
          } else {
            markEntry(barcode, { status: 'packed' });
            packedAny = true;
          }
        } catch (err: any) {
          const message = err?.response?.data?.message || err?.message || 'Failed to pack';
          markEntry(barcode, { status: 'failed', message });
          seenRef.current.delete(barcode); // allow this barcode to be retried
        }
      }
    } finally {
      processingRef.current = false;
      setIsPacking(false);
      if (packedAny) {
        queryClient.invalidateQueries({ queryKey: ['master-carton', id] });
        queryClient.invalidateQueries({ queryKey: ['master-carton-assortment', id] });
        queryClient.invalidateQueries({ queryKey: ['master-cartons'] });
        queryClient.invalidateQueries({ queryKey: ['child-boxes'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      }
    }
  }, [id, queryClient, markEntry]);

  const handleScan = useCallback(
    (raw: string) => {
      const barcode = raw.trim().toUpperCase();
      if (!barcode) return;
      if (seenRef.current.has(barcode)) {
        toast.error(`${barcode} already scanned`);
        return;
      }
      seenRef.current.add(barcode);
      setScanLog((prev) => [...prev, { barcode, status: 'pending' }]);
      queueRef.current.push(barcode);
      void processQueue();
    },
    [processQueue]
  );

  const retryScan = useCallback(
    (barcode: string) => {
      setScanLog((prev) => prev.filter((e) => !(e.barcode === barcode && e.status === 'failed')));
      handleScan(barcode);
    },
    [handleScan]
  );

  const clearScanLog = useCallback(() => {
    setScanLog([]);
    seenRef.current = new Set();
  }, []);

  const handlePrintLabel = () => {
    if (!carton) return;
    printMasterCartonLabel(carton, assortment ?? []);
  };

  if (isLoading) return <PageSpinner />;

  if (!carton) {
    return (
      <div className="text-center py-12">
        <p className="text-brand-text-muted">Carton not found.</p>
      </div>
    );
  }

  const statusAllowsUnpack = carton.status === 'ACTIVE' || carton.status === 'CLOSED';
  const statusAllowsAddBoxes = carton.status === 'ACTIVE' || carton.status === 'CREATED';
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
            {canPack && statusAllowsAddBoxes && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddBoxes(!showAddBoxes)}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add Boxes
              </Button>
            )}
            {canUnpack && carton.is_legacy && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowOpenLegacyConfirm(true)}
                leftIcon={<PackageOpen className="h-4 w-4" />}
              >
                Open for Repacking
              </Button>
            )}
            {canUnpack && statusAllowsUnpack && !carton.is_legacy && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setShowUnpackConfirm(true)}
                leftIcon={<PackageOpen className="h-4 w-4" />}
              >
                Full Unpack
              </Button>
            )}
            {canClose && carton.status === 'ACTIVE' && (
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

      {carton.is_legacy && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">Legacy (pre-go-live) carton</p>
          <p className="text-sm text-amber-700 mt-1">
            This carton was imported as a count-only record and has no tracked contents.
            Click <strong>Open for Repacking</strong> to turn it into an empty trackable carton — then
            generate the child-box labels, paste them on the boxes, and scan them in via <strong>Add Boxes</strong>.
          </p>
        </div>
      )}

      {/* Legacy carton details (from the existing-stock CSV upload) */}
      {carton.is_legacy && (
        <Card className="p-6 mb-6">
          <h3 className="font-semibold text-brand-text-dark mb-4">Existing Stock Details</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-brand-text-muted">Article</p>
              <p className="font-medium text-brand-text-dark">{carton.article_group || '—'}</p>
            </div>
            <div>
              <p className="text-brand-text-muted">Colour</p>
              <p className="font-medium text-brand-text-dark">{carton.legacy_colour || '—'}</p>
            </div>
            <div>
              <p className="text-brand-text-muted">MRP</p>
              <p className="font-medium text-brand-text-dark">
                {carton.legacy_mrp ? `₹ ${carton.legacy_mrp}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-brand-text-muted">Size Range</p>
              <p className="font-medium text-brand-text-dark">{carton.size_group || '—'}</p>
            </div>
            <div>
              <p className="text-brand-text-muted">Section</p>
              <p className="font-medium text-brand-text-dark">{carton.section || '—'}</p>
            </div>
            <div>
              <p className="text-brand-text-muted">Category</p>
              <p className="font-medium text-brand-text-dark">{carton.category || '—'}</p>
            </div>
          </div>
        </Card>
      )}

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
      {showAddBoxes && canPack && statusAllowsAddBoxes && (
        <Card className="p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
              <ScanLine className="h-4 w-4" />
              Scan to Pack
              {isPacking && <Loader2 className="h-4 w-4 animate-spin text-brand-text-muted" />}
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

          {/* HID Scanner (primary) */}
          {/* Input stays enabled while packing — the queue absorbs rapid scans, and
              disabling it mid-burst would drop scanner keystrokes (itself a skip cause). */}
          <HIDScannerInput
            onScan={handleScan}
            placeholder="Scan or enter child box barcode..."
            autoFocus
            className="mb-4"
          />

          {/* Camera scanner toggle (secondary) */}
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

          {/* Scan ledger — nothing scanned ever disappears silently */}
          {scanLog.length > 0 && (
            <div className="mt-4 border-t border-brand-border pt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-brand-text-dark">
                  Scanned this session
                  <span className="ml-2 text-xs font-normal text-brand-text-muted">
                    {scanLog.filter((e) => e.status === 'packed').length} packed
                    {scanLog.some((e) => e.status === 'failed') && ` · ${scanLog.filter((e) => e.status === 'failed').length} failed`}
                    {scanLog.some((e) => e.status === 'pending') && ` · ${scanLog.filter((e) => e.status === 'pending').length} pending`}
                  </span>
                </p>
                <Button variant="ghost" size="sm" onClick={clearScanLog}>
                  Clear
                </Button>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-brand-border rounded-lg border border-brand-border">
                {[...scanLog].reverse().map((entry, i) => (
                  <div
                    key={`${entry.barcode}-${i}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="font-mono text-xs truncate">{entry.barcode}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.status === 'pending' && (
                        <span className="flex items-center gap-1 text-brand-text-muted">
                          <Loader2 className="h-4 w-4 animate-spin" /> Packing…
                        </span>
                      )}
                      {entry.status === 'packed' && (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-4 w-4" /> Packed
                        </span>
                      )}
                      {entry.status === 'noop' && (
                        <span className="flex items-center gap-1 text-brand-text-muted">
                          <CheckCircle2 className="h-4 w-4" /> {entry.message || 'Already packed'}
                        </span>
                      )}
                      {entry.status === 'failed' && (
                        <>
                          <span className="flex items-center gap-1 text-red-600" title={entry.message}>
                            <XCircle className="h-4 w-4" /> Failed
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => retryScan(entry.barcode)}
                            leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                          >
                            Retry
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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

      {/* Open Legacy Carton Confirmation Modal */}
      <Modal
        isOpen={showOpenLegacyConfirm}
        onClose={() => setShowOpenLegacyConfirm(false)}
        title="Open for Repacking"
        description="This converts the legacy carton into an empty, trackable carton so you can pack real child boxes into it."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowOpenLegacyConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={isOpeningLegacy}
              onClick={() => openLegacy(undefined as void)}
              leftIcon={<PackageOpen className="h-4 w-4" />}
            >
              Open Carton
            </Button>
          </>
        }
      >
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            Carton <strong className="font-mono">{carton.carton_barcode}</strong> will become an empty
            open carton (status CREATED). No child boxes are created automatically — you&apos;ll generate and
            scan them in next. This stops it being counted as a legacy carton in inventory.
          </p>
        </div>
      </Modal>

      {/* Print label is now generated directly in handlePrintLabel — no hidden div needed */}
    </div>
  );
}
