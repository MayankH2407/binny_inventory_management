'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, FlaskConical, X, ArrowLeft, Check } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import PageHeader from '@/components/layout/PageHeader';
import QRScanner from '@/components/scanning/QRScanner';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import { ROUTES } from '@/constants';
import { sampleService } from '@/services/sample.service';
import { customerService } from '@/services/customer.service';
import { childBoxService } from '@/services/childBox.service';
import { useApiMutation, useApiQuery } from '@/hooks/useApi';
import { useScanStore } from '@/store/scanStore';
import { formatCurrency } from '@/lib/utils';
import { checkFootAvailability } from '@/lib/sampleFoot';
import toast from 'react-hot-toast';
import Link from 'next/link';
import type { ChildBoxWithProduct } from '@/types';

export default function CreateSamplePage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [sampleDate, setSampleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [fullScreenScan, setFullScreenScan] = useState(false);
  const { scannedItems, addItem, removeItem, clearItems } = useScanStore();
  const [itemDetails, setItemDetails] = useState<Record<string, ChildBoxWithProduct>>({});
  // Dispatch unit (foot) applied to the next scanned box; per-box value tracked in footByBarcode.
  const [selectedFoot, setSelectedFoot] = useState<'PAIR' | 'LEFT' | 'RIGHT'>('PAIR');
  const [footByBarcode, setFootByBarcode] = useState<Record<string, 'PAIR' | 'LEFT' | 'RIGHT'>>({});

  const { data: customersData } = useApiQuery(
    ['customers-list-for-sample'],
    // Load all active customers (not just the first 200) so none are hidden.
    () => customerService.getAll({ limit: 100000, is_active: true })
  );

  const { mutate: createSample, isPending } = useApiMutation(
    () =>
      sampleService.create({
        name: name.trim(),
        customer_id: customerId || null,
        recipient_name: recipientName.trim() || null,
        purpose: purpose.trim() || null,
        sample_date: sampleDate || null,
        notes: notes.trim() || null,
        child_box_barcodes: scannedItems,
        box_feet: footByBarcode,
      }),
    {
      successMessage: 'Sample created successfully',
      invalidateKeys: [['samples'], ['child-boxes'], ['dashboard-stats']],
      onSuccess: (data) => {
        clearItems();
        setItemDetails({});
        setFootByBarcode({});
        router.replace(ROUTES.SAMPLE_DETAIL(data.id));
      },
    }
  );

  const handleScan = useCallback(
    async (qrCode: string) => {
      const normalized = qrCode.trim().toUpperCase();
      const added = addItem(qrCode);
      if (!added) {
        toast.error('Already scanned');
        return;
      }

      // Tag the box with the currently-selected foot for the next scan.
      setFootByBarcode((prev) => ({ ...prev, [normalized]: selectedFoot }));
      toast.success(
        `Added: ${normalized}${selectedFoot !== 'PAIR' ? ` (${selectedFoot === 'LEFT' ? 'Left' : 'Right'} foot)` : ''}`
      );

      // Fetch child box details in background
      try {
        const details = await childBoxService.getByBarcode(normalized);
        // Foot-aware guard: a SAMPLE box is still addable for its other free foot.
        const avail = checkFootAvailability(details, selectedFoot);
        if (!avail.ok) {
          removeItem(normalized);
          setFootByBarcode((prev) => {
            const next = { ...prev };
            delete next[normalized];
            return next;
          });
          toast.error(avail.reason);
          return;
        }
        setItemDetails((prev) => ({ ...prev, [normalized]: details }));
      } catch {
        // Details fetch failed — barcode is still added, just no details shown
      }
    },
    [addItem, removeItem, selectedFoot]
  );

  const handleRemoveItem = useCallback(
    (barcode: string) => {
      removeItem(barcode);
      setItemDetails((prev) => {
        const next = { ...prev };
        delete next[barcode];
        return next;
      });
      setFootByBarcode((prev) => {
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
    setFootByBarcode({});
  }, [clearItems]);

  const handleCreate = () => {
    if (!name.trim()) {
      toast.error('Sample name is required');
      return;
    }
    if (scannedItems.length === 0) {
      toast.error('Scan at least one child box');
      return;
    }
    if (scannedItems.length > 50) {
      toast('Warning: more than 50 boxes scanned', { icon: '⚠️' });
    }
    createSample(undefined as void);
  };

  const customerOptions = [
    { value: '', label: 'No customer (free-text recipient)' },
    ...(customersData?.data?.map((c) => ({ value: c.id, label: c.firm_name })) ?? []),
  ];

  return (
    <div>
      <PageHeader
        title="Create Sample"
        description="Create a new sample batch. Only FREE or GENERATED child boxes can be added. Scan or enter barcodes to add boxes."
        action={
          <Link href={ROUTES.SAMPLES}>
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
                <FlaskConical className="h-4 w-4" style={{ color: '#2D2A6E' }} />
              </div>
              <h3 className="font-semibold text-brand-text-dark">Sample Details</h3>
            </div>

            <div className="space-y-4">
              <Input
                label="Sample Name"
                required
                placeholder="e.g. Spring Exhibition 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                helperText="A descriptive name for this sample batch"
              />

              <Select
                label="Customer (optional)"
                options={customerOptions}
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              />

              <Input
                label="Recipient Name (optional)"
                placeholder="e.g. Raj Footwear, Jaipur"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                helperText="Free-text recipient, used when no customer is selected"
              />

              <div>
                <label className="block text-sm font-medium text-brand-text-dark mb-1.5">
                  Purpose (optional)
                </label>
                <textarea
                  className="w-full rounded-lg border border-brand-border bg-gray-50/50 px-4 py-2.5 text-sm text-brand-text-dark focus:outline-none focus:ring-2 focus:ring-binny-navy/20 focus:border-binny-navy transition-all duration-200 resize-none"
                  rows={2}
                  placeholder="e.g. Dealer exhibition, internal QC, trade fair..."
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
              </div>

              <Input
                label="Sample Date (optional)"
                type="date"
                value={sampleDate}
                onChange={(e) => setSampleDate(e.target.value)}
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

            {/* Dispatch unit applied to the next scanned box(es) */}
            <div className="mb-4">
              <p className="text-xs font-medium text-brand-text-muted mb-1.5">Dispatch unit for scanned boxes</p>
              <div className="flex gap-2">
                {(['PAIR', 'LEFT', 'RIGHT'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setSelectedFoot(f)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      selectedFoot === f
                        ? 'bg-binny-navy text-white border-binny-navy'
                        : 'bg-white text-brand-text-muted border-brand-border hover:bg-gray-50'
                    }`}
                  >
                    {f === 'PAIR' ? 'Pair' : f === 'LEFT' ? 'Left foot' : 'Right foot'}
                  </button>
                ))}
              </div>
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
                  <FlaskConical className="h-4 w-4" style={{ color: '#2D2A6E' }} />
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
                <FlaskConical className="h-12 w-12 mx-auto mb-3 text-brand-text-muted/40" />
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
                          <div className="flex gap-1 mt-1.5">
                            {(['PAIR', 'LEFT', 'RIGHT'] as const).map((f) => (
                              <button
                                key={f}
                                type="button"
                                onClick={() =>
                                  setFootByBarcode((prev) => ({ ...prev, [item]: f }))
                                }
                                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                                  (footByBarcode[item] ?? 'PAIR') === f
                                    ? 'bg-binny-navy text-white border-binny-navy'
                                    : 'bg-white text-brand-text-muted border-brand-border hover:bg-gray-50'
                                }`}
                              >
                                {f === 'PAIR' ? 'Pair' : f === 'LEFT' ? 'L' : 'R'}
                              </button>
                            ))}
                          </div>
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
                Create Sample ({scannedItems.length} boxes)
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
