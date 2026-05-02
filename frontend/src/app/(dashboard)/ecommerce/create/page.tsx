'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, ShoppingCart, X, ArrowLeft, Check } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import PageHeader from '@/components/layout/PageHeader';
import QRScanner from '@/components/scanning/QRScanner';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import { ROUTES } from '@/constants';
import { ecommerceService } from '@/services/ecommerce.service';
import { childBoxService } from '@/services/childBox.service';
import { useApiMutation } from '@/hooks/useApi';
import { useScanStore } from '@/store/scanStore';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';
import type { ChildBoxWithProduct } from '@/types';

export default function CreateEcommercePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [marketplace, setMarketplace] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [listingSku, setListingSku] = useState('');
  const [mappedDate, setMappedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [fullScreenScan, setFullScreenScan] = useState(false);
  const { scannedItems, addItem, removeItem, clearItems } = useScanStore();
  const [itemDetails, setItemDetails] = useState<Record<string, ChildBoxWithProduct>>({});

  const { mutate: createRecord, isPending } = useApiMutation(
    () =>
      ecommerceService.create({
        name: name.trim(),
        marketplace: marketplace.trim() || null,
        order_reference: orderReference.trim() || null,
        listing_sku: listingSku.trim() || null,
        mapped_date: mappedDate || null,
        notes: notes.trim() || null,
        child_box_barcodes: scannedItems,
      }),
    {
      successMessage: 'E-commerce record created successfully',
      invalidateKeys: [['ecommerce'], ['child-boxes'], ['dashboard-stats']],
      onSuccess: (data) => {
        clearItems();
        setItemDetails({});
        router.replace(ROUTES.ECOMMERCE_DETAIL(data.id));
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
        // Guard: only FREE or GENERATED
        if (details.status !== 'FREE' && details.status !== 'GENERATED') {
          removeItem(qrCode);
          toast.error(
            `Box ${qrCode} is ${details.status} — only FREE or GENERATED boxes can be added`
          );
          return;
        }
        setItemDetails((prev) => ({ ...prev, [qrCode]: details }));
      } catch {
        // Details fetch failed — barcode is still added, just no details shown
      }
    },
    [addItem, removeItem]
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
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (scannedItems.length === 0) {
      toast.error('Scan at least one child box');
      return;
    }
    createRecord(undefined as void);
  };

  return (
    <div>
      <PageHeader
        title="Create E-commerce Record"
        description="Create a new e-commerce record. Only FREE or GENERATED child boxes can be added. Scan or enter barcodes to add boxes."
        action={
          <Link href={ROUTES.ECOMMERCE}>
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
                <ShoppingCart className="h-4 w-4" style={{ color: '#2D2A6E' }} />
              </div>
              <h3 className="font-semibold text-brand-text-dark">E-commerce Details</h3>
            </div>

            <div className="space-y-4">
              <Input
                label="Name"
                required
                placeholder="e.g. Amazon Summer Batch 01"
                value={name}
                onChange={(e) => setName(e.target.value)}
                helperText="A descriptive name for this e-commerce record"
              />

              <Input
                label="Marketplace (optional)"
                placeholder="e.g. Amazon, Flipkart, Meesho"
                value={marketplace}
                onChange={(e) => setMarketplace(e.target.value)}
              />

              <Input
                label="Order Reference (optional)"
                placeholder="e.g. ORD-12345"
                value={orderReference}
                onChange={(e) => setOrderReference(e.target.value)}
              />

              <Input
                label="Listing SKU (optional)"
                placeholder="e.g. BNY-AMZ-001"
                value={listingSku}
                onChange={(e) => setListingSku(e.target.value)}
              />

              <Input
                label="Mapped Date (optional)"
                type="date"
                value={mappedDate}
                onChange={(e) => setMappedDate(e.target.value)}
              />

              <div>
                <label className="block text-sm font-medium text-brand-text-dark mb-1.5">
                  Notes (optional)
                </label>
                <textarea
                  className="w-full rounded-lg border border-brand-border bg-gray-50/50 px-4 py-2.5 text-sm text-brand-text-dark focus:outline-none focus:ring-2 focus:ring-binny-navy/20 focus:border-binny-navy transition-all duration-200 resize-none"
                  rows={2}
                  placeholder="Any additional notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
                <ScanLine className="h-4 w-4" style={{ color: '#2D2A6E' }} />
              </div>
              <h3 className="font-semibold text-brand-text-dark">Scan Child Boxes</h3>
            </div>

            <HIDScannerInput
              onScan={handleScan}
              placeholder="Scan or enter child box barcode..."
              autoFocus
            />

            <div className="mt-4 pt-4 border-t border-brand-border">
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
              <div className="mt-4">
                <QRScanner
                  onScanSuccess={handleScan}
                  autoStart
                  fullScreen={fullScreenScan}
                  onToggleFullScreen={() => setFullScreenScan(!fullScreenScan)}
                />
              </div>
            )}
          </Card>
        </div>

        <div>
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
                  <ShoppingCart className="h-4 w-4" style={{ color: '#2D2A6E' }} />
                </div>
                <h3 className="font-semibold text-brand-text-dark">
                  Scanned Items ({scannedItems.length} boxes)
                </h3>
              </div>
              {scannedItems.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleClearAll}>
                  Clear All
                </Button>
              )}
            </div>

            {scannedItems.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-brand-text-muted/40" />
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
                disabled={scannedItems.length === 0 || !name.trim()}
                onClick={handleCreate}
                leftIcon={<Check className="h-4 w-4" />}
              >
                Create E-commerce Record ({scannedItems.length} boxes)
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
