'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, Package, X, ArrowLeft, Check } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardBody, CardFooter } from '@/components/ui/Card';
import PageHeader from '@/components/layout/PageHeader';
import QRScanner from '@/components/scanning/QRScanner';
import { ROUTES } from '@/constants';
import { masterCartonService } from '@/services/masterCarton.service';
import { useApiMutation } from '@/hooks/useApi';
import { useScanStore } from '@/store/scanStore';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function CreateMasterCartonPage() {
  const router = useRouter();
  const [maxCapacity, setMaxCapacity] = useState(24);
  const [showScanner, setShowScanner] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const { scannedItems, addItem, removeItem, clearItems } = useScanStore();

  const { mutate: createCarton, isPending } = useApiMutation(
    () =>
      masterCartonService.create({
        max_capacity: maxCapacity,
        child_box_barcodes: scannedItems,
      }),
    {
      successMessage: 'Master carton created successfully',
      invalidateKeys: [['master-cartons'], ['child-boxes'], ['dashboard-stats']],
      onSuccess: (data) => {
        clearItems();
        router.push(ROUTES.MASTER_CARTON_DETAIL(data.id));
      },
    }
  );

  const handleScan = useCallback(
    (qrCode: string) => {
      const added = addItem(qrCode);
      if (added) {
        toast.success(`Added: ${qrCode}`);
      } else {
        toast.error('Already scanned');
      }
    },
    [addItem]
  );

  const handleCreate = () => {
    if (scannedItems.length === 0) {
      toast.error('Scan at least one child box');
      return;
    }
    if (scannedItems.length > maxCapacity) {
      toast.error(`Cannot exceed max capacity of ${maxCapacity}`);
      return;
    }
    createCarton(undefined as void);
  };

  return (
    <div>
      <PageHeader
        title="Create Master Carton"
        description="Scan child boxes to pack into a new master carton"
        action={
          <Link href={ROUTES.MASTER_CARTONS}>
            <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">Carton Settings</h3>
            <Input
              label="Max Capacity"
              type="number"
              value={String(maxCapacity)}
              onChange={(e) => setMaxCapacity(parseInt(e.target.value) || 1)}
              helperText="Maximum number of child boxes this carton can hold"
            />
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-brand-text-dark">Scan Child Boxes</h3>
              <Button
                variant={showScanner ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => setShowScanner(!showScanner)}
                leftIcon={<ScanLine className="h-4 w-4" />}
              >
                {showScanner ? 'Hide Scanner' : 'Open Scanner'}
              </Button>
            </div>

            {showScanner && (
              <QRScanner onScanSuccess={handleScan} autoStart />
            )}

            <div className="mt-4 pt-4 border-t border-brand-border">
              <p className="text-sm text-brand-text-muted mb-2">Or add barcode manually:</p>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Input
                    placeholder="Enter barcode (e.g. BINNY-CB-001)"
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && manualBarcode.trim()) {
                        handleScan(manualBarcode.trim());
                        setManualBarcode('');
                      }
                    }}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={!manualBarcode.trim()}
                  onClick={() => {
                    if (manualBarcode.trim()) {
                      handleScan(manualBarcode.trim());
                      setManualBarcode('');
                    }
                  }}
                  leftIcon={<Check className="h-4 w-4" />}
                >
                  Add
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <div>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-brand-text-dark">
                Scanned Items ({scannedItems.length}/{maxCapacity})
              </h3>
              {scannedItems.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearItems}>
                  Clear All
                </Button>
              )}
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                className="bg-binny-red rounded-full h-2 transition-all duration-300"
                style={{
                  width: `${Math.min((scannedItems.length / maxCapacity) * 100, 100)}%`,
                }}
              />
            </div>

            {scannedItems.length === 0 ? (
              <div className="text-center py-8">
                <Package className="h-12 w-12 mx-auto mb-3 text-brand-text-muted/40" />
                <p className="text-sm text-brand-text-muted">
                  No items scanned yet. Use the scanner to add child boxes.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-hide">
                {scannedItems.map((item, index) => (
                  <div
                    key={item}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-medium text-brand-text-muted w-6">
                        {index + 1}.
                      </span>
                      <span className="text-sm font-mono text-brand-text-dark truncate">
                        {item}
                      </span>
                    </div>
                    <button
                      onClick={() => removeItem(item)}
                      className="p-1 rounded text-brand-text-muted hover:text-brand-error hover:bg-red-50 transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-brand-border">
              <Button
                fullWidth
                size="lg"
                isLoading={isPending}
                disabled={scannedItems.length === 0}
                onClick={handleCreate}
                leftIcon={<Check className="h-4 w-4" />}
              >
                Create Master Carton ({scannedItems.length} boxes)
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
