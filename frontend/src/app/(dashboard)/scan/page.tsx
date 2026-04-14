'use client';

import { useState, useCallback } from 'react';
import { Search, Package, Boxes, Truck, Clock, Archive, CheckCircle, CloudOff } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import Badge from '@/components/ui/Badge';
import QRScanner from '@/components/scanning/QRScanner';
import PageHeader from '@/components/layout/PageHeader';
import { inventoryService } from '@/services/inventory.service';
import { childBoxService } from '@/services/childBox.service';
import { masterCartonService } from '@/services/masterCarton.service';
import { useApiMutation } from '@/hooks/useApi';
import { useOfflineScanQueue } from '@/hooks/useOfflineScanQueue';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import type { MasterCarton } from '@/types';
import toast from 'react-hot-toast';

// Result from the trace API — childBox optional (absent for master carton scans)
interface TraceResult {
  childBox?: {
    barcode: string;
    article_name: string;
    sku: string;
    colour: string;
    size: string;
    mrp: number | string;
    status: string;
    created_at: string;
    [key: string]: unknown;
  };
  masterCarton?: {
    id: string;
    carton_barcode: string;
    status: string;
    child_count: number;
    max_capacity: number;
    created_at: string;
    child_boxes?: { id: string; barcode: string; article_name: string; colour: string; size: string; status: string }[];
    [key: string]: unknown;
  };
  dispatch?: {
    destination?: string;
    vehicle_number?: string;
    dispatch_date?: string;
    [key: string]: unknown;
  };
  timeline: {
    id: string;
    action: string;
    description: string;
    performed_by: string;
    performed_at: string;
    metadata?: Record<string, unknown>;
  }[];
}

// Direct lookup result (used for master carton actions like seal)
interface LookupCarton {
  carton: MasterCarton;
}

export default function ScanTracePage() {
  const [barcode, setBarcode] = useState('');
  const [traceResult, setTraceResult] = useState<TraceResult | null>(null);
  const [cartonDetail, setCartonDetail] = useState<LookupCarton | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const { isOnline } = useNetworkStatus();
  const { pendingCount, addPendingScan } = useOfflineScanQueue();

  const lookup = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setIsSearching(true);
    setTraceResult(null);
    setCartonDetail(null);

    // Offline fallback
    if (!navigator.onLine) {
      await addPendingScan(code, 'trace');
      toast('Saved offline — will sync when back online', { icon: '📡' });
      setIsSearching(false);
      return;
    }

    try {
      // Use the trace API — returns full details + timeline for any barcode
      const data = await inventoryService.trace(code);
      setTraceResult(data as unknown as TraceResult);

      // If it's a master carton, also fetch the full carton object for actions (seal/close)
      if (!data.childBox && data.masterCarton) {
        try {
          const carton = await masterCartonService.getByBarcode(code);
          setCartonDetail({ carton });
        } catch {
          // Carton detail fetch failed — not critical, actions won't be available
        }
      }

      toast.success('Item found');
    } catch {
      toast.error('Item not found in system');
    } finally {
      setIsSearching(false);
    }
  }, [addPendingScan]);

  const handleScan = useCallback(
    (decodedText: string) => {
      setBarcode(decodedText);
      lookup(decodedText);
    },
    [lookup]
  );

  const { mutate: closeCarton, isPending: isClosing } = useApiMutation(
    () => masterCartonService.close(cartonDetail!.carton.id),
    {
      successMessage: 'Carton sealed and stored successfully',
      invalidateKeys: [['master-cartons'], ['dashboard-stats']],
      onSuccess: () => {
        // Re-fetch to update status in UI
        if (barcode) lookup(barcode);
      },
    }
  );

  const handleReset = () => {
    setTraceResult(null);
    setCartonDetail(null);
    setBarcode('');
  };

  return (
    <div>
      <PageHeader
        title="Scan & Trace"
        description="Scan or enter any barcode to view full item details, lifecycle timeline, and take actions"
        action={
          pendingCount > 0 ? (
            <Badge variant="orange" dot>{pendingCount} scan{pendingCount > 1 ? 's' : ''} pending sync</Badge>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Scanner + Manual Entry */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">Camera Scanner</h3>
            <QRScanner
              onScanSuccess={handleScan}
              fullScreen={fullScreen}
              onToggleFullScreen={() => setFullScreen(!fullScreen)}
              pendingOfflineCount={pendingCount}
            />
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">Manual Entry</h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Enter barcode..."
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && lookup(barcode)}
                  leftIcon={<Search className="h-4 w-4" />}
                />
              </div>
              <Button onClick={() => lookup(barcode)} isLoading={isSearching}>
                Look Up
              </Button>
            </div>
          </Card>
        </div>

        {/* Right: Results */}
        <div className="space-y-6">
          {!traceResult ? (
            <Card className="p-6">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="h-12 w-12 text-brand-text-muted/30 mb-4" />
                <h3 className="text-lg font-semibold text-brand-text-dark mb-2">Scan or Enter a Barcode</h3>
                <p className="text-brand-text-muted max-w-sm">
                  View current status, full lifecycle timeline, and take actions like sealing cartons for storage.
                </p>
              </div>
            </Card>
          ) : (
            <>
              {/* Item Details */}
              {traceResult.childBox && (
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-blue-50">
                      <Package className="h-5 w-5 text-blue-600" />
                    </div>
                    <h3 className="font-semibold text-brand-text-dark">Child Box</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-brand-text-muted">Barcode</span>
                      <span className="font-mono text-xs">{traceResult.childBox.barcode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-text-muted">Product</span>
                      <span className="font-medium">{traceResult.childBox.article_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-text-muted">SKU</span>
                      <span>{traceResult.childBox.sku}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-text-muted">Size / Colour</span>
                      <span>{traceResult.childBox.size} / {traceResult.childBox.colour}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-text-muted">MRP</span>
                      <span className="font-medium">{formatCurrency(Number(traceResult.childBox.mrp))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-brand-text-muted">Status</span>
                      <StatusBadge status={traceResult.childBox.status} size="sm" />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-text-muted">Created</span>
                      <span className="text-xs text-brand-text-muted">{formatDateTime(traceResult.childBox.created_at)}</span>
                    </div>
                  </div>
                </Card>
              )}

              {/* Master Carton */}
              {traceResult.masterCarton && (
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-green-50">
                      <Boxes className="h-5 w-5 text-green-600" />
                    </div>
                    <h3 className="font-semibold text-brand-text-dark">Master Carton</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-brand-text-muted">Carton Barcode</span>
                      <span className="font-mono text-xs">{traceResult.masterCarton.carton_barcode}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-brand-text-muted">Boxes</span>
                      <span className="font-semibold">{traceResult.masterCarton.child_count} / {traceResult.masterCarton.max_capacity}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-brand-text-muted">Status</span>
                      <StatusBadge status={traceResult.masterCarton.status} size="sm" />
                    </div>
                  </div>

                  {/* Carton child boxes list (from direct lookup) */}
                  {cartonDetail?.carton.child_boxes && cartonDetail.carton.child_boxes.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-brand-text-muted mb-2">
                        Child Boxes ({cartonDetail.carton.child_boxes.length})
                      </h4>
                      <div className="space-y-1 max-h-[200px] overflow-y-auto">
                        {cartonDetail.carton.child_boxes.map((box) => (
                          <div key={box.id} className="flex items-center justify-between p-2 bg-blue-50 rounded text-sm">
                            <span className="font-mono text-xs">{box.barcode}</span>
                            <span className="text-xs text-brand-text-muted">
                              {box.article_name} - {box.colour} - {box.size}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Storage Actions */}
                  {cartonDetail && (
                    <div className="mt-4">
                      {cartonDetail.carton.status === 'ACTIVE' && (
                        <div className="flex gap-3">
                          <Button variant="secondary" onClick={handleReset} className="flex-1">
                            Clear
                          </Button>
                          <Button
                            className="flex-1"
                            isLoading={isClosing}
                            onClick={() => closeCarton(undefined as void)}
                            leftIcon={<Archive className="h-4 w-4" />}
                          >
                            Seal for Storage
                          </Button>
                        </div>
                      )}
                      {cartonDetail.carton.status === 'CLOSED' && (
                        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                          <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-green-800">Sealed & Stored</p>
                            <p className="text-xs text-green-600">This carton is sealed and ready for dispatch.</p>
                          </div>
                        </div>
                      )}
                      {cartonDetail.carton.status === 'DISPATCHED' && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <Truck className="h-5 w-5 text-gray-500 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-gray-700">Already Dispatched</p>
                            <p className="text-xs text-gray-500">This carton has been dispatched.</p>
                          </div>
                        </div>
                      )}
                      {cartonDetail.carton.status === 'CREATED' && (
                        <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                          <Archive className="h-5 w-5 text-yellow-600 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-yellow-800">Empty Carton</p>
                            <p className="text-xs text-yellow-600">No boxes packed yet. Pack boxes first.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              )}

              {/* Dispatch */}
              {traceResult.dispatch && (
                <Card className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-purple-50">
                      <Truck className="h-5 w-5 text-purple-600" />
                    </div>
                    <h3 className="font-semibold text-brand-text-dark">Dispatch</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    {traceResult.dispatch.destination && (
                      <div className="flex justify-between">
                        <span className="text-brand-text-muted">Destination</span>
                        <span>{traceResult.dispatch.destination}</span>
                      </div>
                    )}
                    {traceResult.dispatch.vehicle_number && (
                      <div className="flex justify-between">
                        <span className="text-brand-text-muted">Vehicle</span>
                        <span>{traceResult.dispatch.vehicle_number}</span>
                      </div>
                    )}
                    {traceResult.dispatch.dispatch_date && (
                      <div className="flex justify-between">
                        <span className="text-brand-text-muted">Dispatch Date</span>
                        <span>{formatDateTime(traceResult.dispatch.dispatch_date)}</span>
                      </div>
                    )}
                  </div>
                </Card>
              )}

              {/* Timeline */}
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Clock className="h-5 w-5 text-brand-text-muted" />
                  <h3 className="font-semibold text-brand-text-dark">Timeline</h3>
                </div>

                {traceResult.timeline.length === 0 ? (
                  <p className="text-sm text-brand-text-muted text-center py-4">
                    No timeline events available
                  </p>
                ) : (
                  <div className="space-y-0">
                    {traceResult.timeline.map((event, index) => (
                      <div key={event.id} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-3 h-3 rounded-full bg-binny-red shrink-0 mt-1.5" />
                          {index < traceResult.timeline.length - 1 && (
                            <div className="w-0.5 flex-1 bg-brand-border my-1" />
                          )}
                        </div>
                        <div className="pb-6 min-w-0">
                          <p className="text-sm font-medium text-brand-text-dark">{event.action}</p>
                          <p className="text-sm text-brand-text-muted mt-0.5">{event.description}</p>
                          <p className="text-xs text-brand-text-muted mt-1">
                            {formatDateTime(event.performed_at)} &mdash; {event.performed_by}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Clear result */}
              <Button variant="outline" fullWidth onClick={handleReset}>
                Clear & Scan Another
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
