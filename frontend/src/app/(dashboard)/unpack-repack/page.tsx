'use client';

import { useState, useCallback, useRef } from 'react';
import {
  PackageOpen,
  ScanLine,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Package,
  Printer,
  Lock,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import PageHeader from '@/components/layout/PageHeader';
import Modal from '@/components/ui/Modal';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import { masterCartonService } from '@/services/masterCarton.service';
import { printMasterCartonLabel } from '@/lib/masterCartonLabel';
import { useQueryClient } from '@tanstack/react-query';
import type { MasterCarton } from '@/types';
import toast from 'react-hot-toast';
import { useCan } from '@/hooks/useCan';

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'unpack' | 'repack';

type ScanEntry = {
  barcode: string;
  status: 'pending' | 'packed' | 'noop' | 'failed';
  message?: string;
};

// ── Unpack Tab ────────────────────────────────────────────────────────────────

function UnpackTab() {
  const [carton, setCarton] = useState<MasterCarton | null>(null);
  const [scanning, setScanning] = useState(false);
  const [unpacking, setUnpacking] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleCartonScan = async (raw: string) => {
    const barcode = raw.trim();
    if (!barcode) return;
    setScanning(true);
    try {
      const found = await masterCartonService.getByBarcode(barcode);
      if (found.status === 'DISPATCHED') {
        toast.error('Cannot unpack a dispatched carton');
        return;
      }
      if (found.status === 'CREATED' || (found.child_count ?? 0) === 0) {
        toast.error('This carton has no packed boxes');
        return;
      }
      setCarton(found);
      toast.success(`Found carton: ${found.carton_barcode}`);
    } catch {
      toast.error('Master carton not found');
    } finally {
      setScanning(false);
    }
  };

  const handleUnpack = async () => {
    if (!carton) return;
    setUnpacking(true);
    try {
      await masterCartonService.fullUnpack(carton.id);
      const count = carton.child_count ?? 0;
      toast.success(`Carton ${carton.carton_barcode} unpacked — ${count} box${count !== 1 ? 'es' : ''} freed`);
      setCarton(null);
      setShowConfirm(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(axiosErr?.response?.data?.message ?? axiosErr?.message ?? 'Failed to unpack');
    } finally {
      setUnpacking(false);
    }
  };

  const handleReset = () => {
    setCarton(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Carton scan */}
      <Card className="p-6">
        <h3 className="font-semibold text-brand-text-dark mb-4">
          Scan Master Carton Barcode
        </h3>
        <HIDScannerInput
          onScan={handleCartonScan}
          placeholder="Scan or enter carton barcode..."
          autoFocus
          disabled={scanning || !!carton}
        />
        {scanning && (
          <p className="mt-2 text-sm text-brand-text-muted flex items-center gap-1">
            <Loader2 className="h-4 w-4 animate-spin" /> Looking up carton…
          </p>
        )}
      </Card>

      {/* Carton summary + unpack button */}
      {carton && (
        <Card className="p-6">
          <h3 className="font-semibold text-brand-text-dark mb-4">Carton Details</h3>
          <div className="p-4 bg-gray-50 rounded-lg border border-brand-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-brand-text-muted">Barcode</span>
              <span className="font-mono text-sm text-brand-text-dark">
                {carton.carton_barcode}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-brand-text-muted">Status</span>
              <StatusBadge status={carton.status} size="sm" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-brand-text-muted">Child Boxes</span>
              <span className="text-sm font-semibold text-brand-text-dark">
                {carton.child_count}
              </span>
            </div>
          </div>

          {carton.child_boxes && carton.child_boxes.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-brand-text-muted mb-2">
                Contents
              </h4>
              <div className="space-y-1 max-h-[250px] overflow-y-auto">
                {carton.child_boxes.map((box) => (
                  <div
                    key={box.id}
                    className="flex items-center justify-between p-2 bg-orange-50 rounded text-sm"
                  >
                    <span className="font-mono text-xs">{box.barcode}</span>
                    <span className="text-xs text-brand-text-muted">
                      {box.article_name} — {box.colour} — {box.size}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={handleReset} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="danger"
              size="lg"
              className="flex-1"
              onClick={() => setShowConfirm(true)}
              leftIcon={<PackageOpen className="h-5 w-5" />}
            >
              Unpack
            </Button>
          </div>
        </Card>
      )}

      {/* Confirm modal */}
      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirm Full Unpack"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={unpacking}
              onClick={() => void handleUnpack()}
              leftIcon={<PackageOpen className="h-4 w-4" />}
            >
              Yes, Unpack All
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-brand-text-dark">
              Fully unpack carton{' '}
              <strong className="font-mono">{carton?.carton_barcode}</strong>?
            </p>
            <p className="mt-2 text-sm text-brand-text-muted">
              All <strong>{carton?.child_count}</strong> child boxes will be freed and available for
              repacking.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Repack Tab ────────────────────────────────────────────────────────────────

function RepackTab() {
  const queryClient = useQueryClient();

  // ── Phase: 'scan-carton' → 'box-scan' ──
  type Phase = 'scan-carton' | 'box-scan';
  const [phase, setPhase] = useState<Phase>('scan-carton');

  // Carton lookup
  const [carton, setCarton] = useState<MasterCarton | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Confirm-unpack modal (shown when carton still has boxes)
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isFreeing, setIsFreeing] = useState(false);

  // Box-scan state
  const [scanLog, setScanLog] = useState<ScanEntry[]>([]);
  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());
  const [isPacking, setIsPacking] = useState(false);
  const [packedCount, setPackedCount] = useState(0);
  const [isPrintingLabel, setIsPrintingLabel] = useState(false);
  const canClose = useCan('cartons:close');
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // ── Print the master-carton label (fetches current assortment first) ──
  const handlePrintCartonLabel = async () => {
    if (!carton) return;
    setIsPrintingLabel(true);
    try {
      const assortment = await masterCartonService.getAssortment(carton.id);
      printMasterCartonLabel(carton, assortment);
    } catch {
      toast.error('Failed to load carton contents for the label');
    } finally {
      setIsPrintingLabel(false);
    }
  };

  // ── Close carton ──
  const handleCloseCarton = async () => {
    if (!carton) return;
    setIsClosing(true);
    try {
      await masterCartonService.close(carton.id);
      queryClient.invalidateQueries({ queryKey: ['master-cartons'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success(`Carton ${carton.carton_barcode} closed`);
      setShowCloseConfirm(false);
      handleReset();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(axiosErr?.response?.data?.message ?? axiosErr?.message ?? 'Failed to close carton');
    } finally {
      setIsClosing(false);
    }
  };

  // ── Capacity helpers ──
  const maxCapacity = carton?.max_capacity ?? 0;
  const capacityWarning = maxCapacity > 0 && packedCount >= maxCapacity * 0.8;
  const capacityFull = maxCapacity > 0 && packedCount >= maxCapacity;

  // ── Scan-queue helpers ──
  const markEntry = useCallback((barcode: string, patch: Partial<ScanEntry>) => {
    setScanLog((prev) => {
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
    if (processingRef.current) return;
    processingRef.current = true;
    setIsPacking(true);
    let packedAny = false;
    try {
      while (queueRef.current.length > 0) {
        const barcode = queueRef.current.shift()!;
        const targetId = carton?.id;
        if (!targetId) {
          markEntry(barcode, { status: 'failed', message: 'No carton selected' });
          seenRef.current.delete(barcode);
          continue;
        }
        try {
          const res = await masterCartonService.packByBarcode({
            barcode,
            master_carton_id: targetId,
          });
          if (res?.alreadyPacked) {
            markEntry(barcode, { status: 'noop', message: 'Already in this carton' });
          } else {
            markEntry(barcode, { status: 'packed' });
            setPackedCount((n) => n + 1);
            packedAny = true;
          }
        } catch (err: unknown) {
          const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
          const message =
            axiosErr?.response?.data?.message ?? axiosErr?.message ?? 'Failed to pack';
          markEntry(barcode, { status: 'failed', message });
          seenRef.current.delete(barcode);
        }
      }
    } finally {
      processingRef.current = false;
      setIsPacking(false);
      if (packedAny) {
        queryClient.invalidateQueries({ queryKey: ['master-cartons'] });
        queryClient.invalidateQueries({ queryKey: ['child-boxes'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      }
    }
  }, [carton, markEntry, queryClient]);

  const handleBoxScan = useCallback(
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
      setScanLog((prev) =>
        prev.filter((e) => !(e.barcode === barcode && e.status === 'failed'))
      );
      handleBoxScan(barcode);
    },
    [handleBoxScan]
  );

  const clearScanLog = useCallback(() => {
    setScanLog([]);
    seenRef.current = new Set();
  }, []);

  // ── Carton lookup ──
  const handleCartonScan = async (raw: string) => {
    const barcode = raw.trim();
    if (!barcode) return;
    setIsSearching(true);
    try {
      const found = await masterCartonService.getByBarcode(barcode);
      if (found.status === 'DISPATCHED') {
        toast.error('Cannot repack a dispatched carton');
        return;
      }
      setCarton(found);
      if ((found.child_count ?? 0) > 0) {
        // Has boxes — ask to unpack first
        setShowConfirmModal(true);
      } else {
        // Empty carton — enter box-scan mode directly
        enterBoxScanMode();
      }
      toast.success(`Found carton: ${found.carton_barcode}`);
    } catch {
      toast.error('Master carton not found');
    } finally {
      setIsSearching(false);
    }
  };

  const enterBoxScanMode = () => {
    setScanLog([]);
    seenRef.current = new Set();
    queueRef.current = [];
    setPackedCount(0);
    setPhase('box-scan');
  };

  // ── Confirm: unpack then enter box-scan ──
  const handleConfirmUnpackAndRepack = async () => {
    if (!carton) return;
    setIsFreeing(true);
    try {
      await masterCartonService.fullUnpack(carton.id);
      const count = carton.child_count ?? 0;
      queryClient.invalidateQueries({ queryKey: ['master-cartons'] });
      queryClient.invalidateQueries({ queryKey: ['child-boxes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success(`Carton emptied — ${count} box${count !== 1 ? 'es' : ''} freed`);
      setShowConfirmModal(false);
      enterBoxScanMode();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(axiosErr?.response?.data?.message ?? axiosErr?.message ?? 'Failed to empty carton');
    } finally {
      setIsFreeing(false);
    }
  };

  // ── Reset ──
  const handleReset = () => {
    setCarton(null);
    setPhase('scan-carton');
    setScanLog([]);
    seenRef.current = new Set();
    queueRef.current = [];
    setPackedCount(0);
    setShowConfirmModal(false);
  };

  // ── Phase: scan-carton ──
  if (phase === 'scan-carton') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <Card className="p-6">
          <h3 className="font-semibold text-brand-text-dark mb-4">
            Scan Master Carton Barcode
          </h3>
          <p className="text-sm text-brand-text-muted mb-4">
            Scan the carton you want to repack. Empty cartons go straight to box-scanning; cartons
            with boxes will be unpacked first.
          </p>
          <HIDScannerInput
            onScan={handleCartonScan}
            placeholder="Scan or enter carton barcode..."
            autoFocus
            disabled={isSearching}
          />
          {isSearching && (
            <p className="mt-2 text-sm text-brand-text-muted flex items-center gap-1">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking up carton…
            </p>
          )}
        </Card>

        {/* Confirm-unpack modal */}
        <Modal
          isOpen={showConfirmModal}
          onClose={() => { setShowConfirmModal(false); setCarton(null); }}
          title="Unpack &amp; Repack"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => { setShowConfirmModal(false); setCarton(null); }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                isLoading={isFreeing}
                onClick={() => void handleConfirmUnpackAndRepack()}
                leftIcon={<PackageOpen className="h-4 w-4" />}
              >
                Unpack &amp; Start Repacking
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-brand-text-dark">
                Carton{' '}
                <strong className="font-mono">{carton?.carton_barcode}</strong> currently holds{' '}
                <strong>{carton?.child_count}</strong> box{(carton?.child_count ?? 0) !== 1 ? 'es' : ''}.
                Unpack them and start repacking?
              </p>
            </div>

            {carton?.child_boxes && carton.child_boxes.length > 0 && (
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {carton.child_boxes.map((box) => (
                  <div
                    key={box.id}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm border border-brand-border"
                  >
                    <span className="font-mono text-xs">{box.barcode}</span>
                    <span className="text-xs text-brand-text-muted">
                      {box.article_name} — {box.colour} — {box.size}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-sm text-brand-text-muted">
              On confirm, all boxes are freed and you can scan whichever FREE boxes you want back
              into this carton.
            </p>
          </div>
        </Modal>
      </div>
    );
  }

  // ── Phase: box-scan ──
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Summary bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-brand-text-muted">Repacking carton</p>
              <p className="font-mono text-sm font-semibold">{carton?.carton_barcode}</p>
            </div>
            {maxCapacity > 0 && (
              <div>
                <p className="text-xs text-brand-text-muted">Packed</p>
                <p
                  className={`text-lg font-bold ${
                    capacityFull
                      ? 'text-red-600'
                      : capacityWarning
                      ? 'text-amber-600'
                      : 'text-green-600'
                  }`}
                >
                  {packedCount} / {maxCapacity}
                </p>
              </div>
            )}
            {maxCapacity === 0 && packedCount > 0 && (
              <div>
                <p className="text-xs text-brand-text-muted">Packed</p>
                <p className="text-lg font-bold text-green-600">{packedCount}</p>
              </div>
            )}
            {capacityFull && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                Carton Full
              </span>
            )}
            {capacityWarning && !capacityFull && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                Nearing Capacity
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handlePrintCartonLabel()}
              isLoading={isPrintingLabel}
              leftIcon={<Printer className="h-4 w-4" />}
            >
              Print Carton Label
            </Button>
            {canClose && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCloseConfirm(true)}
                disabled={packedCount === 0 || isPacking}
                leftIcon={<Lock className="h-4 w-4" />}
              >
                Close Carton
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={handleReset}>
              Done / Repack Another Carton
            </Button>
          </div>
        </div>
      </Card>

      {/* HID Scanner */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
            <ScanLine className="h-4 w-4" />
            Scan Boxes to Pack
            {isPacking && <Loader2 className="h-4 w-4 animate-spin text-brand-text-muted" />}
          </h3>
        </div>

        <p className="text-sm text-brand-text-muted mb-4">
          Scan any FREE box to pack it into{' '}
          <span className="font-mono font-semibold">{carton?.carton_barcode}</span>. You are not
          limited to the boxes that were just freed — any FREE box is accepted.
        </p>

        <HIDScannerInput
          onScan={handleBoxScan}
          placeholder="Scan or enter child box barcode..."
          autoFocus
          className="mb-4"
          disabled={capacityFull}
        />

        {capacityFull && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">
              Carton is at full capacity ({maxCapacity} boxes). No more boxes can be packed.
            </p>
          </div>
        )}

        {/* Scan ledger */}
        {scanLog.length > 0 && (
          <div className="mt-4 border-t border-brand-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-brand-text-dark">
                Scanned this session
                <span className="ml-2 text-xs font-normal text-brand-text-muted">
                  {scanLog.filter((e) => e.status === 'packed').length} packed
                  {scanLog.some((e) => e.status === 'failed') &&
                    ` · ${scanLog.filter((e) => e.status === 'failed').length} failed`}
                  {scanLog.some((e) => e.status === 'pending') &&
                    ` · ${scanLog.filter((e) => e.status === 'pending').length} pending`}
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
                        <CheckCircle2 className="h-4 w-4" />{' '}
                        {entry.message ?? 'Already in carton'}
                      </span>
                    )}
                    {entry.status === 'failed' && (
                      <>
                        <span
                          className="flex items-center gap-1 text-red-600"
                          title={entry.message}
                        >
                          <XCircle className="h-4 w-4" /> Failed
                          {entry.message && (
                            <span className="text-xs text-red-500 max-w-[200px] truncate">
                              — {entry.message}
                            </span>
                          )}
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

      {/* Close Carton confirmation modal */}
      <Modal
        isOpen={showCloseConfirm}
        onClose={() => setShowCloseConfirm(false)}
        title="Close Carton"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCloseConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isLoading={isClosing}
              onClick={() => void handleCloseCarton()}
              leftIcon={<Lock className="h-4 w-4" />}
            >
              Yes, Close Carton
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <Lock className="h-6 w-6 text-brand-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-brand-text-dark">
              Seal carton{' '}
              <strong className="font-mono">{carton?.carton_barcode}</strong> with{' '}
              <strong>{packedCount}</strong> box{packedCount !== 1 ? 'es' : ''} packed?
            </p>
            <p className="mt-2 text-sm text-brand-text-muted">
              A closed carton can no longer have boxes added or removed without unpacking it first.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function UnpackRepackPage() {
  const canUnpack = useCan('packing:unpack');
  const canPack = useCan('packing:pack');
  const [tab, setTab] = useState<Tab>('unpack');

  if (!canUnpack) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <PackageOpen className="h-16 w-16 text-brand-text-muted/20 mb-4" />
        <h2 className="text-lg font-semibold text-brand-text-dark mb-2">Access Denied</h2>
        <p className="text-brand-text-muted">You do not have permission to unpack cartons.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Unpack &amp; Repack"
        description="Unpack frees all boxes from a carton. Repack empties a carton and lets you scan boxes back in."
      />

      {/* Tab toggle */}
      <div className="flex gap-3 max-w-md mx-auto mb-8">
        {/* Unpack tab */}
        <button
          type="button"
          onClick={() => setTab('unpack')}
          className={`flex-1 text-left p-5 rounded-xl border-2 transition-all duration-200 ${
            tab === 'unpack'
              ? 'border-binny-navy bg-binny-navy/5 shadow-md'
              : 'border-brand-border bg-white hover:border-brand-text-muted/40'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <PackageOpen
              className={`h-6 w-6 ${tab === 'unpack' ? 'text-binny-navy' : 'text-brand-text-muted'}`}
            />
            <span
              className={`font-semibold ${tab === 'unpack' ? 'text-binny-navy' : 'text-brand-text-dark'}`}
            >
              Unpack
            </span>
            {tab === 'unpack' && (
              <CheckCircle2 className="h-4 w-4 text-binny-navy ml-auto" />
            )}
          </div>
          <p className="text-xs text-brand-text-muted">
            Free all boxes from a carton. Boxes return to FREE status.
          </p>
        </button>

        {/* Repack tab */}
        <button
          type="button"
          onClick={() => canPack && setTab('repack')}
          disabled={!canPack}
          title={!canPack ? 'Requires Pack permission (packing:pack)' : undefined}
          className={`flex-1 text-left p-5 rounded-xl border-2 transition-all duration-200 ${
            !canPack
              ? 'border-brand-border bg-gray-50 opacity-60 cursor-not-allowed'
              : tab === 'repack'
              ? 'border-binny-navy bg-binny-navy/5 shadow-md'
              : 'border-brand-border bg-white hover:border-brand-text-muted/40'
          }`}
        >
          <div className="flex items-center gap-3 mb-2">
            <Package
              className={`h-6 w-6 ${tab === 'repack' && canPack ? 'text-binny-navy' : 'text-brand-text-muted'}`}
            />
            <span
              className={`font-semibold ${tab === 'repack' && canPack ? 'text-binny-navy' : 'text-brand-text-dark'}`}
            >
              Repack
            </span>
            {tab === 'repack' && canPack && (
              <CheckCircle2 className="h-4 w-4 text-binny-navy ml-auto" />
            )}
            {!canPack && (
              <span className="ml-auto text-xs text-brand-text-muted bg-gray-200 px-2 py-0.5 rounded-full">
                No permission
              </span>
            )}
          </div>
          <p className="text-xs text-brand-text-muted">
            Scan a carton to repack. Optionally unpack first, then scan boxes in.
          </p>
        </button>
      </div>

      {/* Active tab content */}
      {tab === 'unpack' && <UnpackTab />}
      {tab === 'repack' && canPack && <RepackTab />}
    </div>
  );
}
