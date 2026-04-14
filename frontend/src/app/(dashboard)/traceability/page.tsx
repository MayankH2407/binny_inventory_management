'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, Package, Boxes, Truck, Clock } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import QRScanner from '@/components/scanning/QRScanner';
import PageHeader from '@/components/layout/PageHeader';
import { inventoryService } from '@/services/inventory.service';
import type { TraceabilityResult } from '@/types';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function TraceabilityPage() {
  const searchParams = useSearchParams();
  const [qrCode, setQrCode] = useState(searchParams.get('qr') || '');
  const [result, setResult] = useState<TraceabilityResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const trace = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setIsSearching(true);
    try {
      const data = await inventoryService.trace(code);
      setResult(data);
    } catch {
      toast.error('Item not found in system');
      setResult(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const qr = searchParams.get('qr');
    if (qr) {
      setQrCode(qr);
      trace(qr);
    }
  }, [searchParams, trace]);

  const handleScan = useCallback(
    (decodedText: string) => {
      setQrCode(decodedText);
      setShowScanner(false);
      trace(decodedText);
    },
    [trace]
  );

  return (
    <div>
      <PageHeader
        title="Traceability"
        description="Track the complete lifecycle of any item — from creation through packing, storage, and dispatch with a full timeline"
      />

      <Card className="p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder="Enter barcode to trace..."
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && trace(qrCode)}
              leftIcon={<Search className="h-4 w-4" />}
            />
          </div>
          <Button onClick={() => trace(qrCode)} isLoading={isSearching}>
            Trace
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowScanner(!showScanner)}
          >
            Scan QR
          </Button>
        </div>
        {showScanner && (
          <div className="mt-4">
            <QRScanner onScanSuccess={handleScan} autoStart />
          </div>
        )}
      </Card>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-brand-text-dark">Child Box</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-brand-text-muted">Barcode</span>
                  <span className="font-mono text-xs">{result.childBox.barcode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-text-muted">Product</span>
                  <span>{result.childBox.article_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-text-muted">SKU</span>
                  <span>{result.childBox.sku}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-text-muted">Size / Colour</span>
                  <span>
                    {result.childBox.size} / {result.childBox.colour}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-brand-text-muted">MRP</span>
                  <span>{formatCurrency(result.childBox.mrp)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-brand-text-muted">Status</span>
                  <StatusBadge status={result.childBox.status} size="sm" />
                </div>
              </div>
            </Card>

            {result.masterCarton && (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-green-50">
                    <Boxes className="h-5 w-5 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-brand-text-dark">Master Carton</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-brand-text-muted">Carton Barcode</span>
                    <span className="font-mono text-xs">{result.masterCarton.carton_barcode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-text-muted">Boxes</span>
                    <span>
                      {result.masterCarton.child_count} / {result.masterCarton.max_capacity}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-brand-text-muted">Status</span>
                    <StatusBadge status={result.masterCarton.status} size="sm" />
                  </div>
                </div>
              </Card>
            )}

            {result.dispatch && (
              <Card className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-purple-50">
                    <Truck className="h-5 w-5 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-brand-text-dark">Dispatch</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-brand-text-muted">Dispatch #</span>
                    <span>{result.dispatch.dispatch_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-text-muted">Destination</span>
                    <span>{result.dispatch.destination}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-text-muted">Vehicle</span>
                    <span>{result.dispatch.vehicle_number}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-brand-text-muted">Status</span>
                    <StatusBadge status={result.dispatch.status} size="sm" />
                  </div>
                </div>
              </Card>
            )}
          </div>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <Clock className="h-5 w-5 text-brand-text-muted" />
              <h3 className="font-semibold text-brand-text-dark">Timeline</h3>
            </div>

            {result.timeline.length === 0 ? (
              <p className="text-sm text-brand-text-muted text-center py-4">
                No timeline events available
              </p>
            ) : (
              <div className="space-y-0">
                {result.timeline.map((event, index) => (
                  <div key={event.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-binny-red shrink-0 mt-1.5" />
                      {index < result.timeline.length - 1 && (
                        <div className="w-0.5 flex-1 bg-brand-border my-1" />
                      )}
                    </div>
                    <div className="pb-6 min-w-0">
                      <p className="text-sm font-medium text-brand-text-dark">
                        {event.action}
                      </p>
                      <p className="text-sm text-brand-text-muted mt-0.5">
                        {event.description}
                      </p>
                      <p className="text-xs text-brand-text-muted mt-1">
                        {formatDateTime(event.performed_at)} &mdash; {event.performed_by}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {!result && !isSearching && (
        <Card className="p-12">
          <div className="text-center">
            <Search className="h-16 w-16 mx-auto mb-4 text-brand-text-muted/20" />
            <h3 className="text-lg font-semibold text-brand-text-dark mb-2">
              Trace an Item
            </h3>
            <p className="text-brand-text-muted max-w-md mx-auto">
              Traceability shows the full journey of a child box or master carton — creation, packing into cartons, storage, and dispatch. Enter or scan a barcode to trace an item.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
