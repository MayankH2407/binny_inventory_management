'use client';

import { useState } from 'react';
import { Archive, Search, CheckCircle, Truck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import PageHeader from '@/components/layout/PageHeader';
import { masterCartonService } from '@/services/masterCarton.service';
import { useApiMutation } from '@/hooks/useApi';
import type { MasterCarton } from '@/types';
import toast from 'react-hot-toast';

export default function StoragePage() {
  const [selectedCarton, setSelectedCarton] = useState<MasterCarton | null>(null);
  const [cartonQR, setCartonQR] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const lookupCarton = async (code: string) => {
    if (!code.trim()) return;
    setIsSearching(true);
    try {
      const carton = await masterCartonService.getByBarcode(code.trim());
      setSelectedCarton(carton);
      toast.success(`Found carton: ${carton.carton_barcode}`);
    } catch {
      toast.error('Master carton not found');
    } finally {
      setIsSearching(false);
    }
  };

  const { mutate: closeCarton, isPending } = useApiMutation(
    () => masterCartonService.close(selectedCarton!.id),
    {
      successMessage: 'Carton closed and stored successfully',
      invalidateKeys: [['master-cartons'], ['dashboard-stats']],
      onSuccess: () => {
        setSelectedCarton(null);
        setCartonQR('');
      },
    }
  );

  const handleReset = () => {
    setSelectedCarton(null);
    setCartonQR('');
  };

  return (
    <div>
      <PageHeader
        title="Storage"
        description="Seal a packed master carton for storage. Closing a carton prevents further packing changes and marks it ready for dispatch."
      />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Step 1: Find carton */}
        <Card className="p-6">
          <h3 className="font-semibold text-brand-text-dark mb-4">
            Scan or Enter Master Carton Barcode
          </h3>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Scan or enter carton barcode..."
                value={cartonQR}
                onChange={(e) => setCartonQR(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && lookupCarton(cartonQR)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Button onClick={() => lookupCarton(cartonQR)} isLoading={isSearching}>
              Find
            </Button>
          </div>
        </Card>

        {/* Carton info */}
        {selectedCarton && (
          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">Carton Details</h3>
            <div className="p-4 bg-gray-50 rounded-lg border border-brand-border space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-brand-text-muted">Barcode</span>
                <span className="font-mono text-sm text-brand-text-dark">
                  {selectedCarton.carton_barcode}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-brand-text-muted">Status</span>
                <StatusBadge status={selectedCarton.status} size="sm" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-brand-text-muted">Child Boxes</span>
                <span className="text-sm font-semibold text-brand-text-dark">
                  {selectedCarton.child_count}
                </span>
              </div>
            </div>

            {/* Child boxes summary */}
            {selectedCarton.child_boxes && selectedCarton.child_boxes.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-brand-text-muted mb-2">
                  Child Boxes ({selectedCarton.child_boxes.length})
                </h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {selectedCarton.child_boxes.map((box) => (
                    <div
                      key={box.id}
                      className="flex items-center justify-between p-2 bg-blue-50 rounded text-sm"
                    >
                      <span className="font-mono text-xs">{box.barcode}</span>
                      <span className="text-xs text-brand-text-muted">
                        {box.article_name} - {box.colour} - {box.size}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action based on status */}
            <div className="mt-6">
              {selectedCarton.status === 'ACTIVE' && (
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={handleReset} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    size="lg"
                    className="flex-1"
                    isLoading={isPending}
                    onClick={() => closeCarton(undefined as void)}
                    leftIcon={<Archive className="h-5 w-5" />}
                  >
                    Close &amp; Store
                  </Button>
                </div>
              )}

              {selectedCarton.status === 'CLOSED' && (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Already Stored</p>
                    <p className="text-xs text-green-600">
                      This carton has already been closed and stored.
                    </p>
                  </div>
                </div>
              )}

              {selectedCarton.status === 'DISPATCHED' && (
                <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <Truck className="h-5 w-5 text-gray-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Already Dispatched</p>
                    <p className="text-xs text-gray-500">
                      This carton has already been dispatched.
                    </p>
                  </div>
                </div>
              )}

              {selectedCarton.status === 'CREATED' && (
                <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <Archive className="h-5 w-5 text-yellow-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-yellow-800">Empty Carton</p>
                    <p className="text-xs text-yellow-600">
                      This carton has no packed boxes yet. Pack boxes first before closing.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
