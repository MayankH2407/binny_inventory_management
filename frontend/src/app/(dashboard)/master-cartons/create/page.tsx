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
import { childBoxService } from '@/services/childBox.service';
import { useApiMutation } from '@/hooks/useApi';
import { useScanStore } from '@/store/scanStore';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';
import type { ChildBoxWithProduct } from '@/types';

export default function CreateMasterCartonPage() {
  const router = useRouter();
  const [maxCapacity, setMaxCapacity] = useState(24);
  const [showScanner, setShowScanner] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const { scannedItems, addItem, removeItem, clearItems } = useScanStore();
  const [itemDetails, setItemDetails] = useState<Record<string, ChildBoxWithProduct>>({});

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
        setItemDetails({});
        router.push(ROUTES.MASTER_CARTON_DETAIL(data.id));
      },
    }
  );

  const handleScan = useCallback(
    async (qrCode: string) => {
      const added = addItem(qrCode);
      if (!added) {
        toast.error('Already scanned');
        return;
      }

      toast.success(`Added: ${qrCode}`);

      // Fetch child box details in background
      try {
        const details = await childBoxService.getByBarcode(qrCode);
        setItemDetails((prev) => ({ ...prev, [qrCode]: details }));
      } catch {
        // Details fetch failed — barcode is still added, just no details shown
      }
    },
    [addItem]
  );

  const handleRemoveItem = useCallback(
    (barcode: string) => {
      removeItem(barcode);
      setItemDetails((prev) => {
        const next = { ...prev };
        delete next[barcode];
        return next;
      });
    },
    [removeItem]
  );

  const handleClearAll = useCallback(() => {
    clearItems();
    setItemDetails({});
  }, [clearItems]);

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
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
                <Package className="h-4 w-4" style={{ color: '#2D2A6E' }} />
              </div>
              <h3 className="font-semibold text-brand-text-dark">Carton Settings</h3>
            </div>
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
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
                  <ScanLine className="h-4 w-4" style={{ color: '#2D2A6E' }} />
                </div>
                <h3 className="font-semibold text-brand-text-dark">Scan Child Boxes</h3>
              </div>
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
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
                  <Package className="h-4 w-4" style={{ color: '#2D2A6E' }} />
                </div>
                <h3 className="font-semibold text-brand-text-dark">
                  Scanned Items ({scannedItems.length}/{maxCapacity})
                </h3>
              </div>
              {scannedItems.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleClearAll}>
                  Clear All
                </Button>
              )}
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
              <div
                className="bg-binny-navy rounded-full h-2 transition-all duration-300"
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
                {scannedItems.map((item, index) => {
                  const details = itemDetails[item];
                  return (
                    <div
                      key={item}
                      className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-xs font-medium text-brand-text-muted w-6 pt-0.5">
                          {index + 1}.
                        </span>
                        <div className="min-w-0">
                          <span className="text-sm font-mono text-brand-text-dark block truncate">
                            {item}
                          </span>
                          {details && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              <span className="text-xs text-brand-text-muted">{details.article_name}</span>
                              <span className="text-xs text-brand-text-muted">{details.colour}</span>
                              <span className="text-xs text-brand-text-muted">Size {details.size}</span>
                              <span className="text-xs text-brand-text-muted">{formatCurrency(details.mrp)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveItem(item)}
                        className="p-1 rounded text-brand-text-muted hover:text-brand-error hover:bg-red-50 transition-colors shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
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
