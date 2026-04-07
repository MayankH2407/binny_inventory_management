'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  addPendingScanToDB,
  getAllPendingScans,
  deletePendingScan,
  clearAllPendingScans,
  type PendingScan,
} from '@/lib/indexedDb';
import { useNetworkStatus } from './useNetworkStatus';
import toast from 'react-hot-toast';

export function useOfflineScanQueue() {
  const [pendingScans, setPendingScans] = useState<PendingScan[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const { isOnline } = useNetworkStatus();

  // Load pending scans from IndexedDB on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    getAllPendingScans()
      .then(setPendingScans)
      .catch(() => { /* IndexedDB unavailable */ });
  }, []);

  const addPendingScan = useCallback(
    async (barcode: string, sessionType: PendingScan['sessionType']) => {
      const scan: PendingScan = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        barcode,
        sessionType,
        scannedAt: new Date().toISOString(),
      };
      try {
        await addPendingScanToDB(scan);
        setPendingScans((prev) => [...prev, scan]);
      } catch {
        // Fallback: at least keep in memory
        setPendingScans((prev) => [...prev, scan]);
      }
    },
    []
  );

  const syncPendingScans = useCallback(async () => {
    if (isSyncing || pendingScans.length === 0) return;
    setIsSyncing(true);

    const token = typeof window !== 'undefined' ? localStorage.getItem('binny_token') : null;
    if (!token) {
      setIsSyncing(false);
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
    let syncedCount = 0;

    for (const scan of pendingScans) {
      try {
        // Attempt to validate the barcode via API (trace lookup)
        const res = await fetch(`${baseUrl}/inventory/trace/${encodeURIComponent(scan.barcode)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          await deletePendingScan(scan.id);
          syncedCount++;
        }
      } catch {
        // Still offline or API error — stop trying
        break;
      }
    }

    if (syncedCount > 0) {
      const remaining = await getAllPendingScans().catch(() => []);
      setPendingScans(remaining);
      toast.success(`Synced ${syncedCount} offline scan${syncedCount > 1 ? 's' : ''}`);
    }

    setIsSyncing(false);
  }, [isSyncing, pendingScans]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && pendingScans.length > 0) {
      syncPendingScans();
    }
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearQueue = useCallback(async () => {
    await clearAllPendingScans().catch(() => {});
    setPendingScans([]);
  }, []);

  return {
    pendingScans,
    pendingCount: pendingScans.length,
    addPendingScan,
    syncPendingScans,
    clearQueue,
    isSyncing,
  };
}
