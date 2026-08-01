'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { Truck, ScanLine, X, Package, FlaskConical, ShoppingCart } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Card } from '@/components/ui/Card';
import QRScanner from '@/components/scanning/QRScanner';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import PageHeader from '@/components/layout/PageHeader';
import { dispatchService } from '@/services/dispatch.service';
import { masterCartonService } from '@/services/masterCarton.service';
import { sampleService } from '@/services/sample.service';
import { ecommerceService } from '@/services/ecommerce.service';
import { customerService } from '@/services/customer.service';
import { useApiMutation } from '@/hooks/useApi';
import type { MasterCarton, ChildBoxWithProduct, SampleRecord, SampleChildBoxRow, EcommerceRecord } from '@/types';
import toast from 'react-hot-toast';
import { ROUTES } from '@/constants';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils';
import { useCan } from '@/hooks/useCan';

type SourceType = 'master_carton' | 'sample' | 'ecommerce';

const SOURCE_TABS: Array<{ id: SourceType; label: string; icon: React.ReactNode }> = [
  { id: 'master_carton', label: 'Master Carton', icon: <Package className="h-4 w-4" /> },
  { id: 'sample', label: 'Sample', icon: <FlaskConical className="h-4 w-4" /> },
  { id: 'ecommerce', label: 'E-commerce', icon: <ShoppingCart className="h-4 w-4" /> },
];

export default function DispatchPage() {
  const router = useRouter();
  const canCreate = useCan('dispatch:create');
  const [sourceType, setSourceType] = useState<SourceType>('master_carton');

  // Master carton state (multi)
  const [showScanner, setShowScanner] = useState(false);
  const [fullScreenScan, setFullScreenScan] = useState(false);
  const [scannedCartons, setScannedCartons] = useState<MasterCarton[]>([]);

  // Sample state (single)
  const [selectedSample, setSelectedSample] = useState<SampleRecord | null>(null);
  const [showSampleScanner, setShowSampleScanner] = useState(false);
  const [sampleChildren, setSampleChildren] = useState<SampleChildBoxRow[]>([]);
  // All checked by default — unchecking anything triggers a scoped (partial) dispatch.
  const [selectedBoxIds, setSelectedBoxIds] = useState<Set<string>>(new Set());

  // Ecommerce state (single)
  const [selectedEc, setSelectedEc] = useState<EcommerceRecord | null>(null);
  const [showEcScanner, setShowEcScanner] = useState(false);

  // Shared form
  const [customerId, setCustomerId] = useState('');
  const [formData, setFormData] = useState({
    destination: '',
    vehicle_number: '',
    transport_details: '',
    lr_number: '',
    notes: '',
  });

  // Fetches a page of matching customers for the searchable Customer dropdown,
  // instead of loading every active customer up front.
  const fetchCustomerOptions = useCallback(
    (search: string) =>
      customerService
        .getAll({ search: search || undefined, is_active: true, limit: 50 })
        .then((r) =>
          r.data.map((c) => ({
            value: c.id,
            label: `${c.firm_name}${c.delivery_location ? ` — ${c.delivery_location}` : ''}`,
          }))
        ),
    []
  );

  // Selecting a customer auto-fills the destination from their delivery_location
  // (if the destination field is still empty). The dropdown only hands back the
  // id, so look the customer up by id to get delivery_location.
  const handleCustomerChange = useCallback(
    (selectedId: string) => {
      setCustomerId(selectedId);
      if (!selectedId) return;
      customerService
        .getById(selectedId)
        .then((customer) => {
          const location = customer.delivery_location;
          if (!location) return;
          setFormData((prev) => (prev.destination ? prev : { ...prev, destination: location }));
        })
        .catch(() => {
          // Best-effort auto-fill only; selection itself already succeeded.
        });
    },
    []
  );

  // ── Master Carton helpers ──
  const addCarton = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      if (scannedCartons.find((c) => c.carton_barcode === trimmed)) {
        toast.error('Carton already added');
        return;
      }
      try {
        const carton = await masterCartonService.getByBarcode(trimmed);
        if (carton.status === 'DISPATCHED') {
          toast.error('This carton has already been dispatched');
          return;
        }
        if (carton.status === 'CREATED') {
          toast.error('This carton is empty (CREATED status). Pack boxes first.');
          return;
        }
        setScannedCartons((prev) => [...prev, carton]);
        toast.success(`Added carton: ${carton.carton_barcode}`);
      } catch {
        toast.error('Master carton not found');
      }
    },
    [scannedCartons]
  );

  const removeCarton = (id: string) => {
    setScannedCartons((prev) => prev.filter((c) => c.id !== id));
  };

  // ── Sample helpers ──
  const lookupSample = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const record = await sampleService.getByBarcode(trimmed);
      if (record.status === 'DISPATCHED') {
        toast.error('This sample has already been dispatched');
        return;
      }
      if (record.status === 'CREATED') {
        toast.error('This sample is empty — add boxes first.');
        return;
      }
      const children = await sampleService.getChildren(record.id);
      setSelectedSample(record);
      setSampleChildren(children);
      setSelectedBoxIds(new Set(children.map((c) => c.child_box_id)));
      toast.success(`Sample found: ${record.name}`);
    } catch {
      toast.error('Sample not found');
    }
  }, []);

  const toggleSampleBox = (childBoxId: string) => {
    setSelectedBoxIds((prev) => {
      const next = new Set(prev);
      if (next.has(childBoxId)) next.delete(childBoxId);
      else next.add(childBoxId);
      return next;
    });
  };

  const sampleScopeIsPartial = selectedSample !== null && selectedBoxIds.size < sampleChildren.length;

  // ── Ecommerce helpers ──
  const lookupEc = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const record = await ecommerceService.getByBarcode(trimmed);
      if (record.status === 'DISPATCHED') {
        toast.error('This e-commerce record has already been dispatched');
        return;
      }
      if (record.status === 'CREATED') {
        toast.error('E-commerce record has no boxes (CREATED status)');
        return;
      }
      setSelectedEc(record);
      toast.success(`E-commerce record found: ${record.name}`);
    } catch {
      toast.error('E-commerce record not found');
    }
  }, []);

  // ── Submit ──
  const canSubmit =
    sourceType === 'master_carton'
      ? scannedCartons.length > 0 && !!customerId
      : sourceType === 'sample'
      ? selectedSample !== null && selectedBoxIds.size > 0
      : selectedEc !== null;

  const buildPayload = () => {
    const base = {
      customer_id: customerId || undefined,
      destination: formData.destination || undefined,
      vehicle_number: formData.vehicle_number || undefined,
      transport_details: formData.transport_details || undefined,
      lr_number: formData.lr_number || undefined,
      notes: formData.notes || undefined,
    };
    if (sourceType === 'master_carton') {
      return { ...base, master_carton_ids: scannedCartons.map((c) => c.id) };
    }
    if (sourceType === 'sample') {
      return {
        ...base,
        sample_record_id: selectedSample!.id,
        // Omitted entirely (not just "all checked") when nothing was
        // unchecked, so an untouched review list is byte-identical to the
        // pre-scoping behavior.
        ...(sampleScopeIsPartial
          ? { sample_scope: { child_box_ids: Array.from(selectedBoxIds), release_remainder: true as const } }
          : {}),
      };
    }
    return { ...base, ecommerce_record_id: selectedEc!.id };
  };

  const { mutate: createDispatch, isPending } = useApiMutation(
    () => dispatchService.create(buildPayload()),
    {
      successMessage: 'Dispatch created successfully',
      invalidateKeys: [['master-cartons'], ['samples'], ['ecommerce'], ['dashboard-stats'], ['dispatches']],
      onSuccess: () => {
        setScannedCartons([]);
        setSelectedSample(null);
        setSampleChildren([]);
        setSelectedBoxIds(new Set());
        setSelectedEc(null);
        setCustomerId('');
        setFormData({ destination: '', vehicle_number: '', transport_details: '', lr_number: '', notes: '' });
        router.push(ROUTES.DISPATCHES);
      },
    }
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (sourceType === 'master_carton' && !customerId) {
      toast.error('Select a customer before dispatching');
      return;
    }
    if (!canSubmit) {
      toast.error(
        sourceType === 'master_carton'
          ? 'Add at least one master carton'
          : sourceType === 'sample'
          ? 'Scan or enter a sample barcode'
          : 'Scan or enter an e-commerce barcode'
      );
      return;
    }
    createDispatch(undefined as void);
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const submitLabel =
    sourceType === 'master_carton'
      ? `Create Dispatch (${scannedCartons.length} carton${scannedCartons.length !== 1 ? 's' : ''})`
      : sourceType === 'sample'
      ? sampleScopeIsPartial
        ? `Dispatch ${selectedBoxIds.size} of ${sampleChildren.length} items`
        : `Create Dispatch${selectedSample ? ` — ${selectedSample.name}` : ''}`
      : `Create Dispatch${selectedEc ? ` — ${selectedEc.name}` : ''}`;

  return (
    <div>
      <PageHeader title="Dispatch" description="Create a new dispatch" />

      {/* Source-type tabs */}
      <div className="flex border-b border-brand-border mb-6 overflow-x-auto">
        {SOURCE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSourceType(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
              sourceType === tab.id
                ? 'border-binny-navy text-binny-navy'
                : 'border-transparent text-brand-text-muted hover:text-brand-text-dark'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: dispatch details form */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg bg-binny-navy-50" style={{ backgroundColor: '#F5F4FF' }}>
                <Truck className="h-4 w-4 text-binny-navy" style={{ color: '#2D2A6E' }} />
              </div>
              <h3 className="font-semibold text-brand-text-dark">Dispatch Details</h3>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-brand-text-dark mb-1.5">
                  {sourceType === 'master_carton' ? 'Customer *' : 'Customer (Optional)'}
                </label>
                <SearchableSelect
                  value={customerId}
                  onChange={handleCustomerChange}
                  fetchOptions={fetchCustomerOptions}
                  placeholder="Select a customer..."
                />
              </div>
              <Input
                label="Destination (Optional)"
                placeholder="e.g., Mumbai Warehouse"
                value={formData.destination}
                onChange={(e) => updateField('destination', e.target.value)}
                helperText={customerId ? 'Auto-filled from customer. You can override.' : undefined}
              />
              <Input
                label="Vehicle Number (Optional)"
                placeholder="e.g., MH-01-AB-1234"
                value={formData.vehicle_number}
                onChange={(e) => updateField('vehicle_number', e.target.value)}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Transport Details (Optional)"
                  placeholder="Transporter name, etc."
                  value={formData.transport_details}
                  onChange={(e) => updateField('transport_details', e.target.value)}
                />
                <Input
                  label="LR / Bilty Number (Optional)"
                  placeholder="LR number"
                  value={formData.lr_number}
                  onChange={(e) => updateField('lr_number', e.target.value)}
                />
              </div>
              <Input
                label="Notes (Optional)"
                placeholder="Additional dispatch notes..."
                value={formData.notes}
                onChange={(e) => updateField('notes', e.target.value)}
              />

              {canCreate && (
                <div className="pt-4 border-t border-brand-border">
                  <Button
                    type="submit"
                    fullWidth
                    size="lg"
                    isLoading={isPending}
                    disabled={!canSubmit}
                    leftIcon={<Truck className="h-4 w-4" />}
                  >
                    {submitLabel}
                  </Button>
                </div>
              )}
            </form>
          </Card>
        </div>

        {/* Right: source picker */}
        <div className="space-y-6">
          {/* ── Master Carton panel ── */}
          {sourceType === 'master_carton' && (
            <>
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
                    <ScanLine className="h-4 w-4" style={{ color: '#2D2A6E' }} />
                  </div>
                  <h3 className="font-semibold text-brand-text-dark">Scan Master Cartons</h3>
                </div>
                <HIDScannerInput
                  onScan={(code) => addCarton(code)}
                  placeholder="Scan or enter carton barcode..."
                  autoFocus={sourceType === 'master_carton'}
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
                      onScanSuccess={(code) => addCarton(code)}
                      autoStart
                      fullScreen={fullScreenScan}
                      onToggleFullScreen={() => setFullScreenScan(!fullScreenScan)}
                    />
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
                    <Package className="h-4 w-4" style={{ color: '#2D2A6E' }} />
                  </div>
                  <h3 className="font-semibold text-brand-text-dark">
                    Cartons to Dispatch ({scannedCartons.length})
                  </h3>
                </div>
                {scannedCartons.length === 0 ? (
                  <div className="text-center py-8">
                    <Truck className="h-12 w-12 mx-auto mb-3 text-brand-text-muted/30" />
                    <p className="text-sm text-brand-text-muted">
                      Scan or enter master carton barcodes to add them to this dispatch
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-hide">
                    {scannedCartons.map((carton) => {
                      const boxes = carton.child_boxes ?? [];
                      const articles = Array.from(new Set(boxes.map((b: ChildBoxWithProduct) => b.article_name))).join(', ');
                      const colours = Array.from(new Set(boxes.map((b: ChildBoxWithProduct) => b.colour))).join(', ');
                      const sizes = Array.from(new Set(boxes.map((b: ChildBoxWithProduct) => b.size))).sort().join(', ');
                      const mrps = Array.from(new Set(boxes.map((b: ChildBoxWithProduct) => b.mrp)));
                      return (
                        <div
                          key={carton.id}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="min-w-0">
                            {articles && (
                              <p className="text-sm font-medium text-brand-text-dark">{articles}</p>
                            )}
                            {(colours || sizes) && (
                              <p className="text-xs text-brand-text-muted">
                                {[colours, sizes].filter(Boolean).join(' | ')}
                                {mrps.length > 0 ? ` | ${formatCurrency(mrps[0])}` : ''}
                              </p>
                            )}
                            <p className="text-xs font-mono text-brand-text-muted mt-0.5">
                              {carton.carton_barcode}
                            </p>
                            <p className="text-xs text-brand-text-muted">
                              {carton.child_count} boxes &middot; {carton.status}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCarton(carton.id)}
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
            </>
          )}

          {/* ── Sample panel ── */}
          {sourceType === 'sample' && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#FFF1F1' }}>
                  <FlaskConical className="h-4 w-4 text-red-600" />
                </div>
                <h3 className="font-semibold text-brand-text-dark">Scan Sample</h3>
              </div>

              <HIDScannerInput
                onScan={(code) => lookupSample(code)}
                placeholder="Scan or enter sample barcode..."
                autoFocus={sourceType === 'sample'}
              />

              <div className="mt-4 pt-4 border-t border-brand-border">
                <Button
                  variant={showSampleScanner ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setShowSampleScanner(!showSampleScanner)}
                  leftIcon={<ScanLine className="h-4 w-4" />}
                >
                  {showSampleScanner ? 'Hide Camera' : 'Use Camera Instead'}
                </Button>
              </div>

              {showSampleScanner && (
                <div className="mt-4">
                  <QRScanner
                    onScanSuccess={(code) => { lookupSample(code); setShowSampleScanner(false); }}
                    autoStart
                  />
                </div>
              )}

              {selectedSample ? (
                <>
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-brand-text-dark">{selectedSample.name}</p>
                        <p className="text-xs font-mono text-brand-text-muted">{selectedSample.sample_barcode}</p>
                        {(selectedSample.customer_firm_name || selectedSample.recipient_name) && (
                          <p className="text-xs text-brand-text-muted mt-0.5">
                            Recipient: {selectedSample.customer_firm_name ?? selectedSample.recipient_name}
                          </p>
                        )}
                        {selectedSample.purpose && (
                          <p className="text-xs text-brand-text-muted">Purpose: {selectedSample.purpose}</p>
                        )}
                        <p className="text-xs text-brand-text-muted">
                          {selectedSample.child_count} boxes &middot; {selectedSample.status}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSample(null);
                          setSampleChildren([]);
                          setSelectedBoxIds(new Set());
                        }}
                        className="p-1 rounded text-brand-text-muted hover:text-brand-error hover:bg-red-100 transition-colors shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {sampleChildren.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-brand-text-muted mb-2">
                        Confirm what&apos;s actually shipping — uncheck anything staying behind.
                      </p>
                      <div className="max-h-[240px] overflow-y-auto space-y-1 border border-brand-border rounded-lg p-2">
                        {sampleChildren.map((box) => (
                          <label key={box.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={selectedBoxIds.has(box.child_box_id)}
                              onChange={() => toggleSampleBox(box.child_box_id)}
                              className="h-4 w-4"
                            />
                            <span className="font-mono text-xs text-brand-text-muted">{box.barcode}</span>
                            <span className="text-xs text-brand-text-dark truncate">
                              {box.article_name} · {box.colour} · {box.size}
                              {box.foot !== 'PAIR' ? ` · ${box.foot === 'LEFT' ? 'Left' : 'Right'} shoe` : ''}
                            </span>
                            {box.source === 'carton' && (
                              <span className="text-[10px] text-brand-text-muted ml-auto shrink-0">[{box.carton_barcode}]</span>
                            )}
                          </label>
                        ))}
                      </div>

                      {sampleScopeIsPartial && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-xs text-amber-800">
                            <strong>{sampleChildren.length - selectedBoxIds.size} item(s) will be removed from this sample and returned to stock.</strong>{' '}
                            Only the {selectedBoxIds.size} checked item(s) are recorded as dispatched. Any carton with unchecked
                            boxes goes back to stock too (its checked boxes come out individually first).
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-4 text-center py-6">
                  <FlaskConical className="h-10 w-10 mx-auto mb-2 text-brand-text-muted/30" />
                  <p className="text-sm text-brand-text-muted">Scan or enter a sample barcode</p>
                </div>
              )}
            </Card>
          )}

          {/* ── E-commerce panel ── */}
          {sourceType === 'ecommerce' && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="p-2 rounded-lg" style={{ backgroundColor: '#F3F0FF' }}>
                  <ShoppingCart className="h-4 w-4 text-purple-600" />
                </div>
                <h3 className="font-semibold text-brand-text-dark">Scan E-commerce Record</h3>
              </div>

              <HIDScannerInput
                onScan={(code) => lookupEc(code)}
                placeholder="Scan or enter e-commerce barcode..."
                autoFocus={sourceType === 'ecommerce'}
              />

              <div className="mt-4 pt-4 border-t border-brand-border">
                <Button
                  variant={showEcScanner ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setShowEcScanner(!showEcScanner)}
                  leftIcon={<ScanLine className="h-4 w-4" />}
                >
                  {showEcScanner ? 'Hide Camera' : 'Use Camera Instead'}
                </Button>
              </div>

              {showEcScanner && (
                <div className="mt-4">
                  <QRScanner
                    onScanSuccess={(code) => { lookupEc(code); setShowEcScanner(false); }}
                    autoStart
                  />
                </div>
              )}

              {selectedEc ? (
                <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-text-dark">{selectedEc.name}</p>
                      <p className="text-xs font-mono text-brand-text-muted">{selectedEc.ecommerce_barcode}</p>
                      {selectedEc.marketplace && (
                        <p className="text-xs text-brand-text-muted mt-0.5">
                          Marketplace: {selectedEc.marketplace}
                        </p>
                      )}
                      {selectedEc.order_reference && (
                        <p className="text-xs text-brand-text-muted">Order: {selectedEc.order_reference}</p>
                      )}
                      {selectedEc.listing_sku && (
                        <p className="text-xs text-brand-text-muted">SKU: {selectedEc.listing_sku}</p>
                      )}
                      <p className="text-xs text-brand-text-muted">
                        {selectedEc.child_count} boxes &middot; {selectedEc.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedEc(null)}
                      className="p-1 rounded text-brand-text-muted hover:text-brand-error hover:bg-purple-100 transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-center py-6">
                  <ShoppingCart className="h-10 w-10 mx-auto mb-2 text-brand-text-muted/30" />
                  <p className="text-sm text-brand-text-muted">Scan or enter an e-commerce barcode</p>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
