'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { ArrowLeft, ScanLine, CloudOff, PackageOpen, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import QRScanner from '@/components/scanning/QRScanner';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES } from '@/constants';
import { stockReconciliationService } from '@/services/stockReconciliation.service';
import { useApiQuery } from '@/hooks/useApi';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useScanFeedback } from '@/hooks/useScanFeedback';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { addPendingScanToDB, getAllPendingScans, deletePendingScan, type PendingScan } from '@/lib/indexedDb';
import { cn } from '@/lib/utils';
import type { StockReconScanResult } from '@/types';

interface FeedEntry {
  id: string;
  code: string;
  result: StockReconScanResult['result'] | 'QUEUED';
  scanType?: StockReconScanResult['scan_type'];
  message?: string | null;
  contentsMismatch?: boolean;
}

const RESULT_STYLE: Record<string, { badge: 'green' | 'yellow' | 'red' | 'gray' | 'orange'; label: string }> = {
  OK: { badge: 'green', label: 'Counted' },
  DUPLICATE: { badge: 'yellow', label: 'Duplicate' },
  NOT_EXPECTED: { badge: 'yellow', label: 'Not expected' },
  OUT_OF_SCOPE: { badge: 'orange', label: 'Out of scope' },
  STATUS_CONFLICT: { badge: 'red', label: 'Status conflict' },
  UNKNOWN: { badge: 'red', label: 'Unrecognized' },
  QUEUED: { badge: 'gray', label: 'Queued offline' },
};

export default function StockReconciliationCountPage() {
  const params = useParams();
  const id = params.id as string;

  const { isOnline } = useNetworkStatus();
  const { requestWakeLock, releaseWakeLock } = useWakeLock();
  const { triggerSuccess, triggerWarning, triggerError } = useScanFeedback();

  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [cartonMismatchNext, setCartonMismatchNext] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const lastCodeRef = useRef<string | null>(null);
  // A ref, not state: the periodic retry effect below holds a closure from
  // mount time, so a state-based guard would go stale and never see a sync
  // that started after the first render — a ref is always read live.
  const isSyncingRef = useRef(false);

  const { data: session } = useApiQuery(['stock-reconciliation', id], () => stockReconciliationService.getById(id));
  const { data: progress, refetch: refetchProgress } = useApiQuery(
    ['stock-reconciliation-progress', id],
    () => stockReconciliationService.getProgress(id)
  );
  // Live list of expected items not yet scanned. Refreshes on an interval
  // (and the cache is shared with the session detail page) — no "Submit for
  // Approval" needed, so counting is never locked just to see what's missing.
  const { data: variance } = useApiQuery(
    ['stock-reconciliation-variance', id],
    () => stockReconciliationService.getVariance(id),
    { refetchInterval: 15000 }
  );
  const missingBoxes = variance?.missing_boxes ?? [];
  const missingLegacy = variance?.missing_legacy_cartons ?? [];
  // Loaded once on mount so a reopened session (after a crash, reload, or the
  // device itself dying) shows exactly what's already been scanned — not
  // just the aggregate count above — instead of leaving the operator unsure
  // whether they need to start over.
  const { data: scanHistory } = useApiQuery(
    ['stock-reconciliation-scans', id],
    () => stockReconciliationService.getScans(id, { limit: 200 })
  );
  const historySeededRef = useRef(false);

  useEffect(() => {
    requestWakeLock();
    return () => { releaseWakeLock(); };
  }, [requestWakeLock, releaseWakeLock]);

  const refreshPendingCount = useCallback(async () => {
    try {
      const all = await getAllPendingScans();
      setPendingCount(all.filter((s) => s.sessionType === 'reconcile' && s.reconcileSessionId === id).length);
    } catch {
      // IndexedDB unavailable — offline queue simply won't persist across reloads.
    }
  }, [id]);

  const syncPending = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    try {
      const all = await getAllPendingScans();
      const mine = all.filter((s) => s.sessionType === 'reconcile' && s.reconcileSessionId === id);
      if (mine.length === 0) return;

      const { results } = await stockReconciliationService.submitScans(
        id,
        mine.map((s) => ({
          client_scan_id: s.id,
          raw_payload: s.barcode,
          contents_mismatch: s.contentsMismatch,
          scanned_at: s.scannedAt,
        }))
      );
      for (const s of mine) {
        await deletePendingScan(s.id);
      }
      toast.success(`Synced ${mine.length} offline scan${mine.length > 1 ? 's' : ''}`);
      const byId = new Map(mine.map((s) => [s.id, s]));
      setFeed((prev) => [
        ...results.map((r) => toFeedEntry(r, byId.get(r.client_scan_id)?.barcode || '')).reverse(),
        ...prev,
      ]);
      await refreshPendingCount();
      refetchProgress();
    } catch {
      // Still offline or a server error — leave queued, try again next time.
    } finally {
      isSyncingRef.current = false;
    }
  }, [id, refreshPendingCount, refetchProgress]);

  useEffect(() => {
    refreshPendingCount();
    // Always attempt a sync on mount too, not just on an 'online' transition —
    // a session resumed after a reload/reboot may already be online with
    // scans still sitting in the queue from before.
    syncPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshPendingCount]);

  useEffect(() => {
    if (isOnline) syncPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // Seed the visible feed once from the server's scan history, plus whatever
  // is still sitting unsynced in the local offline queue — so reopening this
  // screen after a crash, reload, or the counting device itself dying shows
  // exactly what's already been scanned, not an empty list implying nothing
  // was saved. Runs once; scans made after that append normally via setFeed.
  useEffect(() => {
    if (historySeededRef.current || !scanHistory) return;
    historySeededRef.current = true;
    (async () => {
      let queuedEntries: FeedEntry[] = [];
      try {
        const all = await getAllPendingScans();
        queuedEntries = all
          .filter((s) => s.sessionType === 'reconcile' && s.reconcileSessionId === id)
          // IndexedDB returns rows in primary-key (uuid) order, not
          // insertion order — sort by the actual scan time instead so the
          // most recently queued scan lands on top, same as everything else.
          .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
          .map((s) => ({ id: s.id, code: s.barcode, result: 'QUEUED' as const, contentsMismatch: s.contentsMismatch }));
      } catch {
        // IndexedDB unavailable — server history still seeds below.
      }
      const historyEntries: FeedEntry[] = scanHistory.data.map((row) => ({
        id: row.id,
        code: row.resolved_code,
        result: row.result,
        scanType: row.scan_type,
        contentsMismatch: row.contents_mismatch,
      }));
      setFeed((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const fresh = [...queuedEntries, ...historyEntries].filter((e) => !seen.has(e.id));
        return [...prev, ...fresh];
      });
    })();
  }, [scanHistory, id]);

  // Belt-and-braces retry: a real warehouse network can be flaky in ways that
  // never fire a clean browser 'online' event (WiFi degrading rather than
  // dropping, the backend restarting for a moment). Re-attempt periodically
  // rather than relying solely on that event — this is what actually
  // guarantees queued scans don't sit stuck indefinitely through a glitch.
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine) syncPending();
    }, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const queueOffline = useCallback(
    async (clientScanId: string, code: string, mismatchFlag: boolean) => {
      const pending: PendingScan = {
        id: clientScanId,
        barcode: code,
        sessionType: 'reconcile',
        scannedAt: new Date().toISOString(),
        reconcileSessionId: id,
        contentsMismatch: mismatchFlag,
      };
      try {
        await addPendingScanToDB(pending);
      } catch {
        // Best effort — scan is still shown in the feed below even if it
        // can't be persisted, so the operator sees it was captured.
      }
      triggerWarning();
      setFeed((prev) => [{ id: clientScanId, code, result: 'QUEUED', contentsMismatch: mismatchFlag }, ...prev]);
      await refreshPendingCount();
    },
    [id, triggerWarning, refreshPendingCount]
  );

  const handleScan = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim().toUpperCase();
      if (!code) return;
      // Cheap re-scan guard — the real duplicate check is server-side (or,
      // offline, resolved on sync); this just stops an accidental double-fire
      // from the same physical scan event.
      if (code === lastCodeRef.current) return;
      lastCodeRef.current = code;
      setTimeout(() => { if (lastCodeRef.current === code) lastCodeRef.current = null; }, 1500);

      const clientScanId = crypto.randomUUID();
      const mismatchFlag = cartonMismatchNext;
      setCartonMismatchNext(false);

      if (!navigator.onLine) {
        await queueOffline(clientScanId, code, mismatchFlag);
        return;
      }

      try {
        const { results } = await stockReconciliationService.submitScans(id, [
          { client_scan_id: clientScanId, raw_payload: code, contents_mismatch: mismatchFlag },
        ]);
        const result = results[0];
        if (result.result === 'OK') triggerSuccess();
        else if (result.result === 'UNKNOWN' || result.result === 'STATUS_CONFLICT') triggerError();
        else triggerWarning();
        setFeed((prev) => [toFeedEntry(result, code), ...prev]);
        refetchProgress();
      } catch {
        // The browser thought it was online but the request still failed
        // (flaky connection, backend blip mid-scan) — queue it the same as
        // an explicit offline scan rather than just erroring and dropping
        // it, so the operator never has to notice and manually re-scan.
        await queueOffline(clientScanId, code, mismatchFlag);
        toast('Scan saved offline — will sync automatically', { icon: '📡' });
      }
    },
    [id, cartonMismatchNext, triggerSuccess, triggerWarning, triggerError, refetchProgress, queueOffline]
  );

  if (session && session.status !== 'COUNTING') {
    return (
      <div>
        <PageHeader title="Counting closed" description={`This session is ${session.status.toLowerCase()} and can no longer be scanned.`} />
        <Link href={ROUTES.STOCK_RECONCILIATION_DETAIL(id)}>
          <Button leftIcon={<ArrowLeft className="h-4 w-4" />}>Back to session</Button>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={session ? `Counting — ${session.session_code}` : 'Counting'}
        description="Scan continuously. Duplicates and issues are flagged, not blocked."
        action={
          <div className="flex items-center gap-2">
            {!isOnline && (
              <Badge variant="orange" dot>
                <CloudOff className="h-3 w-3" /> Offline
              </Badge>
            )}
            {pendingCount > 0 && (
              <Badge variant="yellow" dot>
                {pendingCount} scan{pendingCount > 1 ? 's' : ''} queued — syncing automatically
              </Badge>
            )}
            <Link href={ROUTES.STOCK_RECONCILIATION_DETAIL(id)}>
              <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Session
              </Button>
            </Link>
          </div>
        }
      />

      {progress && (
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-brand-text-dark">
                {progress.found_total} <span className="text-base font-normal text-brand-text-muted">of {progress.expected_total} expected</span>
              </p>
            </div>
            <div className="w-40 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${progress.expected_total > 0 ? Math.min(100, (progress.found_total / progress.expected_total) * 100) : 0}%` }}
              />
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <HIDScannerInput onScan={handleScan} placeholder="Scan or type a box/carton code..." autoFocus />
            <div className="mt-4 pt-4 border-t border-brand-border flex flex-wrap items-center gap-2">
              <Button
                variant={showScanner ? 'secondary' : 'outline'}
                size="sm"
                leftIcon={<ScanLine className="h-4 w-4" />}
                onClick={() => setShowScanner(!showScanner)}
              >
                {showScanner ? 'Hide Camera' : 'Use Camera'}
              </Button>
              <button
                type="button"
                onClick={() => setCartonMismatchNext((v) => !v)}
                className={cn(
                  'text-xs font-medium px-3 py-1.5 rounded-full border transition-colors',
                  cartonMismatchNext
                    ? 'bg-red-50 border-red-300 text-red-700'
                    : 'bg-gray-50 border-brand-border text-brand-text-muted'
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5 inline -mt-0.5 mr-1" />
                {cartonMismatchNext ? 'Next carton scan: contents don’t match' : 'Flag next carton as mismatched'}
              </button>
            </div>
            {showScanner && (
              <div className="mt-4">
                <QRScanner onScanSuccess={handleScan} autoStart />
              </div>
            )}
          </Card>
        </div>

        <Card>
          <h3 className="font-semibold text-brand-text-dark mb-3">Recent scans</h3>
          {feed.length === 0 ? (
            <div className="text-center py-12">
              <PackageOpen className="h-10 w-10 mx-auto mb-2 text-brand-text-muted/30" />
              <p className="text-sm text-brand-text-muted">Scans will appear here as you go.</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
              {feed.map((entry) => {
                const style = RESULT_STYLE[entry.result] || RESULT_STYLE.UNKNOWN;
                return (
                  <div key={entry.id} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg bg-gray-50 text-sm">
                    <span className="font-mono text-xs truncate">{entry.code}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {entry.contentsMismatch && <Badge variant="red" size="sm">Mismatch flagged</Badge>}
                      <Badge variant={style.badge} size="sm">{style.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {variance && (
        <Card className="mt-6">
          <h3 className="font-semibold text-brand-text-dark mb-1">
            Not yet scanned ({missingBoxes.length + missingLegacy.length})
          </h3>
          <p className="text-xs text-brand-text-muted mb-3">
            Live list — drops items off as they are scanned. Counting stays open.
          </p>
          {missingBoxes.length + missingLegacy.length === 0 ? (
            <p className="text-sm text-brand-text-muted">Everything expected has been scanned.</p>
          ) : (
            <div className="space-y-1 max-h-[360px] overflow-y-auto">
              {missingBoxes.slice(0, 300).map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 py-1 text-sm border-b border-brand-border last:border-0">
                  <span className="font-mono text-xs">{b.barcode}</span>
                  <span className="text-brand-text-muted truncate">{b.article_name} — {b.colour} / {b.size}</span>
                </div>
              ))}
              {missingLegacy.slice(0, 300).map((c2) => (
                <div key={c2.id} className="flex items-center justify-between gap-2 py-1 text-sm border-b border-brand-border last:border-0">
                  <span className="font-mono text-xs">{c2.carton_barcode}</span>
                  <span className="text-brand-text-muted truncate">Legacy carton — {c2.article_group || '—'} ({c2.legacy_pairs ?? '?'} pairs)</span>
                </div>
              ))}
              {missingBoxes.length > 300 && (
                <p className="text-xs text-brand-text-muted pt-2">Showing first 300 of {missingBoxes.length} boxes — see the session page for the full list.</p>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function toFeedEntry(r: StockReconScanResult, code: string): FeedEntry {
  return {
    id: r.client_scan_id,
    code,
    result: r.result,
    scanType: r.scan_type,
    message: r.message,
    contentsMismatch: r.contents_mismatch,
  };
}
