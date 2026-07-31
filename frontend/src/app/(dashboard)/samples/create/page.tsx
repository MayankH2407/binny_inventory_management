'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, FlaskConical, X, ArrowLeft, Check, Boxes, ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Card } from '@/components/ui/Card';
import PageHeader from '@/components/layout/PageHeader';
import QRScanner from '@/components/scanning/QRScanner';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import { ROUTES } from '@/constants';
import { sampleService } from '@/services/sample.service';
import { customerService } from '@/services/customer.service';
import { childBoxService } from '@/services/childBox.service';
import { masterCartonService } from '@/services/masterCarton.service';
import { useApiMutation } from '@/hooks/useApi';
import { useScanStore } from '@/store/scanStore';
import { formatCurrency } from '@/lib/utils';
import { checkFootAvailability } from '@/lib/sampleFoot';
import toast from 'react-hot-toast';
import Link from 'next/link';
import type { ChildBoxWithProduct, MasterCarton } from '@/types';

const PURPOSE_CHIPS = ['Dealer sample', 'Exhibition', 'QC', 'Other'] as const;
type PurposeChip = (typeof PURPOSE_CHIPS)[number];

export default function CreateSamplePage() {
  const router = useRouter();
  // Everything below is optional — the only thing required to submit is at
  // least one scanned item. Name auto-generates server-side when left blank.
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [purposeChip, setPurposeChip] = useState<PurposeChip | null>(null);
  const [purposeOther, setPurposeOther] = useState('');
  const [sampleDate, setSampleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);

  const [showScanner, setShowScanner] = useState(false);
  const [fullScreenScan, setFullScreenScan] = useState(false);
  const { scannedItems, addItem, removeItem, clearItems } = useScanStore();
  const [itemDetails, setItemDetails] = useState<Record<string, ChildBoxWithProduct>>({});
  // Every scan defaults to a whole pair — foot only gets set when the operator
  // deliberately splits an item via "Send one shoe only" below.
  const [footByBarcode, setFootByBarcode] = useState<Record<string, 'LEFT' | 'RIGHT'>>({});
  // Barcodes currently showing the Left/Right picker (mid-split, not yet decided).
  const [splittingBarcode, setSplittingBarcode] = useState<string | null>(null);

  const [cartonScanOpen, setCartonScanOpen] = useState(false);
  const [scannedCartons, setScannedCartons] = useState<MasterCarton[]>([]);
  const [showCartonScanner, setShowCartonScanner] = useState(false);
  const [fullScreenCartonScan, setFullScreenCartonScan] = useState(false);

  const fetchCustomerOptions = useCallback(
    (search: string) =>
      customerService
        .getAll({ search: search || undefined, is_active: true, limit: 50 })
        .then((r) => r.data.map((c) => ({ value: c.id, label: c.firm_name }))),
    []
  );

  const purpose = purposeChip === 'Other' ? purposeOther.trim() : purposeChip;

  const { mutate: createSample, isPending } = useApiMutation(
    () =>
      sampleService.create({
        name: name.trim() || null,
        customer_id: customerId || null,
        recipient_name: !customerId ? recipientName.trim() || null : null,
        purpose: purpose || null,
        sample_date: sampleDate || null,
        notes: notes.trim() || null,
        child_box_barcodes: scannedItems,
        box_feet: footByBarcode,
        carton_barcodes: scannedCartons.map((c) => c.carton_barcode),
      }),
    {
      successMessage: 'Sample created successfully',
      invalidateKeys: [['samples'], ['child-boxes'], ['master-cartons'], ['dashboard-stats']],
      onSuccess: (data) => {
        clearItems();
        setItemDetails({});
        setFootByBarcode({});
        setScannedCartons([]);
        router.replace(ROUTES.SAMPLE_DETAIL(data.id));
      },
    }
  );

  // Success toast only fires once the box is actually confirmed addable — no
  // more "Added!" immediately followed by a contradicting rejection toast.
  const handleScan = useCallback(
    async (qrCode: string) => {
      const normalized = qrCode.trim().toUpperCase();
      const added = addItem(qrCode);
      if (!added) {
        toast.error('Already scanned');
        return;
      }

      try {
        const details = await childBoxService.getByBarcode(normalized);
        const avail = checkFootAvailability(details, 'PAIR');
        if (!avail.ok) {
          removeItem(normalized);
          toast.error(avail.reason);
          return;
        }
        setItemDetails((prev) => ({ ...prev, [normalized]: details }));
        toast.success(`Added: ${normalized}`);
      } catch {
        // Details fetch failed — barcode is still added, just no details shown.
        toast.success(`Added: ${normalized}`);
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
      setFootByBarcode((prev) => {
        const next = { ...prev };
        delete next[barcode];
        return next;
      });
      if (splittingBarcode === barcode) setSplittingBarcode(null);
    },
    [removeItem, splittingBarcode]
  );

  const handleSplit = useCallback((barcode: string, foot: 'LEFT' | 'RIGHT') => {
    setFootByBarcode((prev) => ({ ...prev, [barcode]: foot }));
    setSplittingBarcode(null);
  }, []);

  const handleUnsplit = useCallback((barcode: string) => {
    setFootByBarcode((prev) => {
      const next = { ...prev };
      delete next[barcode];
      return next;
    });
  }, []);

  // ── Master carton helpers (scan a whole carton in intact, alongside loose boxes) ──
  const addCarton = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      if (scannedCartons.find((c) => c.carton_barcode === trimmed.toUpperCase())) {
        toast.error('Carton already added');
        return;
      }
      try {
        const carton = await masterCartonService.getByBarcode(trimmed);
        if (carton.status === 'DISPATCHED') {
          toast.error('This carton has already been dispatched');
          return;
        }
        if (carton.status === 'CREATED' || carton.child_count === 0) {
          toast.error('This carton is empty. Pack boxes first.');
          return;
        }
        setScannedCartons((prev) => [...prev, carton]);
        toast.success(`Added carton: ${carton.carton_barcode} (${carton.child_count} boxes)`);
      } catch {
        toast.error('Master carton not found');
      }
    },
    [scannedCartons]
  );

  const removeCarton = useCallback((id: string) => {
    setScannedCartons((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const totalItemCount = scannedItems.length + scannedCartons.reduce((s, c) => s + c.child_count, 0);

  const handleCreate = () => {
    if (scannedItems.length === 0 && scannedCartons.length === 0) {
      toast.error('Scan at least one box to send');
      return;
    }
    createSample(undefined as void);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="New Sample"
        description="Scan the boxes you're sending. Everything else is optional."
        action={
          <Link href={ROUTES.SAMPLES}>
            <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back
            </Button>
          </Link>
        }
      />

      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
            <ScanLine className="h-4 w-4" style={{ color: '#2D2A6E' }} />
          </div>
          <h3 className="font-semibold text-brand-text-dark">Scan boxes</h3>
        </div>

        <HIDScannerInput onScan={handleScan} placeholder="Scan or enter child box barcode..." autoFocus />

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-brand-border">
          <Button
            variant={showScanner ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowScanner(!showScanner)}
            leftIcon={<ScanLine className="h-4 w-4" />}
          >
            {showScanner ? 'Hide Camera' : 'Use Camera Instead'}
          </Button>
          <button
            type="button"
            onClick={() => setCartonScanOpen(!cartonScanOpen)}
            className="text-sm text-brand-text-muted hover:text-brand-text-dark inline-flex items-center gap-1"
          >
            {cartonScanOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Scan a whole carton instead
          </button>
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

        {cartonScanOpen && (
          <div className="mt-4 pt-4 border-t border-brand-border">
            <div className="flex items-center gap-2 mb-3">
              <Boxes className="h-4 w-4 text-brand-text-muted" />
              <p className="text-sm font-medium text-brand-text-dark">Scan a whole master carton</p>
            </div>
            <p className="text-xs text-brand-text-muted mb-3">
              The whole carton gets reserved for this sample. You can take individual boxes out of it
              later, or send it back to stock.
            </p>
            <HIDScannerInput onScan={addCarton} placeholder="Scan or enter master carton barcode..." />
            <div className="mt-3">
              <Button
                variant={showCartonScanner ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setShowCartonScanner(!showCartonScanner)}
                leftIcon={<ScanLine className="h-4 w-4" />}
              >
                {showCartonScanner ? 'Hide Camera' : 'Use Camera Instead'}
              </Button>
            </div>
            {showCartonScanner && (
              <div className="mt-4">
                <QRScanner
                  onScanSuccess={addCarton}
                  autoStart
                  fullScreen={fullScreenCartonScan}
                  onToggleFullScreen={() => setFullScreenCartonScan(!fullScreenCartonScan)}
                />
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-brand-text-dark">Items ({totalItemCount})</h3>
          {scannedItems.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearItems();
                setItemDetails({});
                setFootByBarcode({});
                setSplittingBarcode(null);
              }}
            >
              Clear boxes
            </Button>
          )}
        </div>

        {scannedItems.length === 0 && scannedCartons.length === 0 ? (
          <div className="text-center py-10">
            <FlaskConical className="h-10 w-10 mx-auto mb-2 text-brand-text-muted/40" />
            <p className="text-sm text-brand-text-muted">Nothing scanned yet.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[420px] overflow-y-auto scrollbar-hide">
            {scannedCartons.map((carton) => (
              <div key={carton.id} className="flex items-start justify-between p-3 bg-blue-50/60 rounded-lg">
                <div className="flex items-start gap-2 min-w-0">
                  <Boxes className="h-4 w-4 text-binny-navy mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-brand-text-dark">
                      Carton {carton.carton_barcode} — {carton.child_count} boxes{' '}
                      <span className="text-xs font-normal text-brand-text-muted">· reserved whole</span>
                    </p>
                    {(carton.article_summary || carton.colour_summary || carton.size_summary) && (
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        {[carton.article_summary, carton.colour_summary, carton.size_summary].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeCarton(carton.id)}
                  className="p-1 rounded text-brand-text-muted hover:text-brand-error hover:bg-red-50 transition-colors shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            {scannedItems.map((item, index) => {
              const details = itemDetails[item];
              const foot = footByBarcode[item];
              const isSplitting = splittingBarcode === item;
              return (
                <div key={item} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-xs font-medium text-brand-text-muted w-6 pt-0.5">{index + 1}.</span>
                    <div className="min-w-0">
                      <span className="text-sm font-mono text-brand-text-dark block truncate">{item}</span>
                      {details && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                          <span className="text-xs text-brand-text-muted">{details.article_name}</span>
                          <span className="text-xs text-brand-text-muted">{details.colour}</span>
                          <span className="text-xs text-brand-text-muted">Size {details.size}</span>
                          <span className="text-xs text-brand-text-muted">{formatCurrency(details.mrp)}</span>
                        </div>
                      )}

                      {isSplitting ? (
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-xs text-brand-text-muted">Which shoe?</span>
                          <button
                            type="button"
                            onClick={() => handleSplit(item, 'LEFT')}
                            className="px-2 py-0.5 rounded text-[11px] font-medium border border-brand-border bg-white hover:bg-gray-100"
                          >
                            Left
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSplit(item, 'RIGHT')}
                            className="px-2 py-0.5 rounded text-[11px] font-medium border border-brand-border bg-white hover:bg-gray-100"
                          >
                            Right
                          </button>
                          <button
                            type="button"
                            onClick={() => setSplittingBarcode(null)}
                            className="text-[11px] text-brand-text-muted hover:text-brand-text-dark"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : foot ? (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700">
                            {foot === 'LEFT' ? 'Left' : 'Right'} shoe only
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUnsplit(item)}
                            title="Undo — send as a whole pair"
                            className="p-0.5 rounded text-brand-text-muted hover:text-brand-text-dark"
                          >
                            <Undo2 className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSplittingBarcode(item)}
                          className="text-[11px] text-brand-text-muted hover:text-brand-text-dark underline decoration-dotted mt-1"
                        >
                          Send one shoe only
                        </button>
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
      </Card>

      <Card className="p-0 mb-6 overflow-hidden">
        <button
          type="button"
          onClick={() => setDetailsOpen(!detailsOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-medium text-brand-text-dark">Who's it for? (optional)</span>
          {detailsOpen ? <ChevronDown className="h-4 w-4 text-brand-text-muted" /> : <ChevronRight className="h-4 w-4 text-brand-text-muted" />}
        </button>

        {detailsOpen && (
          <div className="p-6 pt-2 space-y-4 border-t border-brand-border">
            <Input
              label="Sample Name"
              placeholder="Auto-generated if left blank"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <div>
              <label className="block text-sm font-medium text-brand-text-dark mb-1.5">Customer</label>
              <SearchableSelect
                value={customerId}
                onChange={setCustomerId}
                fetchOptions={fetchCustomerOptions}
                placeholder="No customer (free-text recipient)"
              />
            </div>

            {!customerId && (
              <Input
                label="Recipient (if not a registered customer)"
                placeholder="e.g. Raj Footwear, Jaipur"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
              />
            )}

            <div>
              <label className="block text-sm font-medium text-brand-text-dark mb-1.5">Purpose</label>
              <div className="flex flex-wrap gap-2">
                {PURPOSE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setPurposeChip(purposeChip === chip ? null : chip)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      purposeChip === chip
                        ? 'bg-binny-navy text-white border-binny-navy'
                        : 'bg-white text-brand-text-muted border-brand-border hover:bg-gray-50'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              {purposeChip === 'Other' && (
                <Input
                  className="mt-2"
                  placeholder="Describe the purpose"
                  value={purposeOther}
                  onChange={(e) => setPurposeOther(e.target.value)}
                />
              )}
            </div>

            <Input label="Sample Date" type="date" value={sampleDate} onChange={(e) => setSampleDate(e.target.value)} />

            <div>
              <label className="block text-sm font-medium text-brand-text-dark mb-1.5">Notes</label>
              <textarea
                className="w-full rounded-lg border border-brand-border bg-gray-50/50 px-4 py-2.5 text-sm text-brand-text-dark focus:outline-none focus:ring-2 focus:ring-binny-navy/20 focus:border-binny-navy transition-all duration-200 resize-none"
                rows={2}
                placeholder="Any additional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </Card>

      <div className="sticky bottom-4">
        <Button
          fullWidth
          size="lg"
          isLoading={isPending}
          disabled={scannedItems.length === 0 && scannedCartons.length === 0}
          onClick={handleCreate}
          leftIcon={<Check className="h-4 w-4" />}
        >
          Create Sample ({totalItemCount} item{totalItemCount !== 1 ? 's' : ''})
        </Button>
      </div>
    </div>
  );
}
