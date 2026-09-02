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
import type { MasterCarton, ChildBoxWithProduct, SampleRecord, SampleItem, Foot, EcommercePoolLookupHit } from '@/types';
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

  // Sample state (single) — scans the sample's own barcode, then everything
  // downstream is partial-by-construction like the E-commerce tab: items
  // pre-checked, operator unchecks to exclude (unchecked items just stay in
  // the sample for a later dispatch — nothing is released back to stock).
  const [selectedSample, setSelectedSample] = useState<SampleRecord | null>(null);
  const [showSampleScanner, setShowSampleScanner] = useState(false);
  const [selectedMappingIds, setSelectedMappingIds] = useState<Set<string>>(new Set());
  // Last-second foot override per BOX mapping_id, seeded from the item's
  // current foot only when changed — ignored for CARTON items.
  const [itemFootOverrides, setItemFootOverrides] = useState<Record<string, Foot>>({});
  // Recipient/purpose/reference date are captured here at dispatch time —
  // the sample record itself no longer stores them (see the redesign).
  const [sampleFields, setSampleFields] = useState({ recipient_name: '', purpose: '', reference_date: '' });

  // Ecommerce state (multi — scanned straight out of the E-commerce Area pool)
  const [scannedEcItems, setScannedEcItems] = useState<EcommercePoolLookupHit[]>([]);
  const [showEcScanner, setShowEcScanner] = useState(false);
  const [ecFields, setEcFields] = useState({
    reference_name: '',
    marketplace: '',
    order_reference: '',
    listing_sku: '',
    order_date: '',
  });

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
  const sampleItems: SampleItem[] = selectedSample?.items ?? [];

  const lookupSample = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const record = await sampleService.getByBarcode(trimmed);
      const items = record.items ?? [];
      if (items.length === 0) {
        toast.error('This sample is empty — add boxes to it first.');
        return;
      }
      setSelectedSample(record);
      setSelectedMappingIds(new Set(items.map((i) => i.mapping_id)));
      setItemFootOverrides({});
      toast.success(`Sample found: ${record.name || record.sample_barcode}`);
    } catch {
      toast.error('Sample not found');
    }
  }, []);

  const toggleSampleItem = (mappingId: string) => {
    setSelectedMappingIds((prev) => {
      const next = new Set(prev);
      if (next.has(mappingId)) next.delete(mappingId);
      else next.add(mappingId);
      return next;
    });
  };

  const setItemFoot = (mappingId: string, foot: Foot) => {
    setItemFootOverrides((prev) => ({ ...prev, [mappingId]: foot }));
  };

  const clearSampleSelection = () => {
    setSelectedSample(null);
    setSelectedMappingIds(new Set());
    setItemFootOverrides({});
    setSampleFields({ recipient_name: '', purpose: '', reference_date: '' });
  };

  const sampleScopeIsPartial = selectedSample !== null && selectedMappingIds.size < sampleItems.length;

  // ── Ecommerce helpers ──
  // Scans a barcode straight against the E-commerce Area pool (see
  // ecommerceService.lookupPoolItem) and, if eligible, adds it to the list of
  // items this dispatch will ship. Keyed by "TYPE:BARCODE" for dedup since a
  // box and a carton could theoretically share the same raw barcode text.
  const ecItemKey = (item: { item_type: 'BOX' | 'CARTON'; barcode: string }) =>
    `${item.item_type}:${item.barcode}`;

  const addEcItem = useCallback(
    async (code: string) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) return;
      try {
        const result = await ecommerceService.lookupPoolItem(trimmed);
        if (!result.in_pool) {
          toast.error(result.reason || `${result.barcode} is not available in the E-commerce Area`);
          return;
        }
        const key = ecItemKey(result);
        if (scannedEcItems.some((i) => ecItemKey(i) === key)) {
          toast.error('Item already added');
          return;
        }
        setScannedEcItems((prev) => [...prev, result]);
        toast.success(
          result.item_type === 'CARTON'
            ? `Added carton ${result.barcode} (${result.box_count} boxes)`
            : `Added box ${result.barcode}`
        );
      } catch {
        toast.error('No master carton or child box found for that barcode');
      }
    },
    [scannedEcItems]
  );

  const removeEcItem = (key: string) => {
    setScannedEcItems((prev) => prev.filter((i) => ecItemKey(i) !== key));
  };

  const updateEcField = (field: keyof typeof ecFields, value: string) => {
    setEcFields((prev) => ({ ...prev, [field]: value }));
  };

  // ── Submit ──
  const canSubmit =
    sourceType === 'master_carton'
      ? scannedCartons.length > 0 && !!customerId
      : sourceType === 'sample'
      ? selectedSample !== null && selectedMappingIds.size > 0
      : scannedEcItems.length > 0;

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
      const checkedItems = sampleItems.filter((i) => selectedMappingIds.has(i.mapping_id));
      return {
        ...base,
        sample_dispatch: {
          sample_record_id: selectedSample!.id,
          items: checkedItems.map((i) => {
            const footOverride = itemFootOverrides[i.mapping_id];
            return {
              item_type: i.item_type,
              mapping_id: i.mapping_id,
              ...(i.item_type === 'BOX' && footOverride && footOverride !== i.foot ? { foot: footOverride } : {}),
            };
          }),
        },
        sample_recipient_name: sampleFields.recipient_name || undefined,
        sample_purpose: sampleFields.purpose || undefined,
        sample_reference_date: sampleFields.reference_date || undefined,
      };
    }
    return {
      ...base,
      ecommerce_pool: {
        items: scannedEcItems.map((i) => ({ item_type: i.item_type, barcode: i.barcode })),
      },
      reference_name: ecFields.reference_name || undefined,
      marketplace: ecFields.marketplace || undefined,
      order_reference: ecFields.order_reference || undefined,
      listing_sku: ecFields.listing_sku || undefined,
      order_date: ecFields.order_date || undefined,
    };
  };

  const { mutate: createDispatch, isPending } = useApiMutation(
    () => dispatchService.create(buildPayload()),
    {
      successMessage: 'Dispatch created successfully',
      invalidateKeys: [
        ['master-cartons'],
        ['samples'],
        ['samples-summary'],
        ['ecommerce'],
        ['ecommerce-pool'],
        ['ecommerce-pool-summary'],
        ['inventory-breakdown'],
        ['inventory-leaf'],
        ['inventory-stock-summary'],
        ['dashboard-stats'],
        ['dispatches'],
      ],
      onSuccess: () => {
        setScannedCartons([]);
        clearSampleSelection();
        setScannedEcItems([]);
        setEcFields({ reference_name: '', marketplace: '', order_reference: '', listing_sku: '', order_date: '' });
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
          : 'Scan at least one e-commerce item'
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
        ? `Dispatch ${selectedMappingIds.size} of ${sampleItems.length} items`
        : `Create Dispatch${selectedSample ? ` — ${selectedSample.sample_barcode}` : ''}`
      : `Create Dispatch (${scannedEcItems.length} item${scannedEcItems.length !== 1 ? 's' : ''})`;

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

              {sourceType === 'sample' && selectedSample && (
                <div className="pt-4 border-t border-brand-border space-y-4">
                  <h4 className="text-sm font-semibold text-brand-text-dark">
                    Sample Details (Optional)
                  </h4>
                  <Input
                    label="Recipient"
                    placeholder="Who is this going to?"
                    value={sampleFields.recipient_name}
                    onChange={(e) => setSampleFields((prev) => ({ ...prev, recipient_name: e.target.value }))}
                  />
                  <Input
                    label="Purpose"
                    placeholder="e.g., dealer feedback, exhibition, internal QC..."
                    value={sampleFields.purpose}
                    onChange={(e) => setSampleFields((prev) => ({ ...prev, purpose: e.target.value }))}
                  />
                  <Input
                    label="Reference Date"
                    type="date"
                    value={sampleFields.reference_date}
                    onChange={(e) => setSampleFields((prev) => ({ ...prev, reference_date: e.target.value }))}
                  />
                </div>
              )}

              {sourceType === 'ecommerce' && (
                <div className="pt-4 border-t border-brand-border space-y-4">
                  <h4 className="text-sm font-semibold text-brand-text-dark">
                    E-commerce Details (Optional)
                  </h4>
                  <Input
                    label="Reference Name"
                    placeholder="e.g., internal batch/reference name"
                    value={ecFields.reference_name}
                    onChange={(e) => updateEcField('reference_name', e.target.value)}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Marketplace"
                      placeholder="e.g., Amazon, Flipkart..."
                      value={ecFields.marketplace}
                      onChange={(e) => updateEcField('marketplace', e.target.value)}
                    />
                    <Input
                      label="Order Reference"
                      placeholder="Order / invoice reference"
                      value={ecFields.order_reference}
                      onChange={(e) => updateEcField('order_reference', e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Listing SKU"
                      placeholder="Marketplace listing SKU"
                      value={ecFields.listing_sku}
                      onChange={(e) => updateEcField('listing_sku', e.target.value)}
                    />
                    <Input
                      label="Order Date"
                      type="date"
                      value={ecFields.order_date}
                      onChange={(e) => updateEcField('order_date', e.target.value)}
                    />
                  </div>
                </div>
              )}

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
                        <p className="text-sm font-semibold text-brand-text-dark">
                          {selectedSample.name || '(unnamed)'}
                        </p>
                        <p className="text-xs font-mono text-brand-text-muted">{selectedSample.sample_barcode}</p>
                        <p className="text-xs text-brand-text-muted">
                          {sampleItems.length} item{sampleItems.length !== 1 ? 's' : ''} currently in this sample
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearSampleSelection}
                        className="p-1 rounded text-brand-text-muted hover:text-brand-error hover:bg-red-100 transition-colors shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {sampleItems.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-brand-text-muted mb-2">
                        Confirm what&apos;s actually shipping — uncheck anything staying behind (it just stays in
                        this sample for a later dispatch).
                      </p>
                      <div className="max-h-[280px] overflow-y-auto space-y-1 border border-brand-border rounded-lg p-2">
                        {sampleItems.map((item) => {
                          const currentFoot = item.item_type === 'BOX' ? (itemFootOverrides[item.mapping_id] ?? item.foot) : 'PAIR';
                          return (
                            <div key={item.mapping_id} className="p-1.5 rounded hover:bg-gray-50 text-sm">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedMappingIds.has(item.mapping_id)}
                                  onChange={() => toggleSampleItem(item.mapping_id)}
                                  className="h-4 w-4 shrink-0"
                                />
                                {item.item_type === 'CARTON' && (
                                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 shrink-0">
                                    Carton
                                  </span>
                                )}
                                <span className="font-mono text-xs text-brand-text-muted">{item.barcode}</span>
                                <span className="text-xs text-brand-text-dark truncate">
                                  {[item.article_summary, item.colour_summary, item.size_summary].filter(Boolean).join(' · ')}
                                </span>
                                {item.item_type === 'CARTON' && (
                                  <span className="text-[10px] text-brand-text-muted ml-auto shrink-0">
                                    {item.box_count} box{item.box_count !== 1 ? 'es' : ''}
                                  </span>
                                )}
                                {item.source_carton_barcode && (
                                  <span className="text-[10px] text-brand-text-muted ml-auto shrink-0">[from {item.source_carton_barcode}]</span>
                                )}
                              </label>
                              {item.item_type === 'BOX' && (
                                <div className="flex items-center gap-1 mt-1 ml-6">
                                  {(['PAIR', 'LEFT', 'RIGHT'] as Foot[]).map((f) => (
                                    <button
                                      key={f}
                                      type="button"
                                      onClick={() => setItemFoot(item.mapping_id, f)}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                        currentFoot === f
                                          ? 'border-binny-navy bg-binny-navy-50 text-binny-navy'
                                          : 'border-brand-border bg-white text-brand-text-muted hover:bg-gray-100'
                                      }`}
                                    >
                                      {f === 'PAIR' ? 'Pair' : f === 'LEFT' ? 'Left' : 'Right'}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {sampleScopeIsPartial && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs text-blue-800">
                            {sampleItems.length - selectedMappingIds.size} item(s) stay in this sample — only the{' '}
                            {selectedMappingIds.size} checked item(s) are dispatched now.
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
            <>
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: '#F3F0FF' }}>
                    <ScanLine className="h-4 w-4 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-brand-text-dark">Scan E-commerce Items</h3>
                </div>

                <HIDScannerInput
                  onScan={(code) => addEcItem(code)}
                  placeholder="Scan or enter master carton / child box barcode..."
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
                    <QRScanner onScanSuccess={(code) => addEcItem(code)} autoStart />
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: '#F3F0FF' }}>
                    <ShoppingCart className="h-4 w-4 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-brand-text-dark">
                    Items to Dispatch ({scannedEcItems.length})
                  </h3>
                </div>
                {scannedEcItems.length === 0 ? (
                  <div className="text-center py-8">
                    <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-brand-text-muted/30" />
                    <p className="text-sm text-brand-text-muted">
                      Scan a master carton or child box from the E-commerce Area to add it here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-hide">
                    {scannedEcItems.map((item) => {
                      const key = ecItemKey(item);
                      return (
                        <div
                          key={key}
                          className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span
                                className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                                  item.item_type === 'CARTON'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-gray-200 text-gray-700'
                                }`}
                              >
                                {item.item_type === 'CARTON' ? 'Carton' : 'Box'}
                              </span>
                              <span className="text-xs font-mono text-brand-text-muted">
                                {item.barcode}
                              </span>
                            </div>
                            {item.article_summary && (
                              <p className="text-sm font-medium text-brand-text-dark">
                                {item.article_summary}
                              </p>
                            )}
                            {(item.colour_summary || item.size_summary) && (
                              <p className="text-xs text-brand-text-muted">
                                {[item.colour_summary, item.size_summary].filter(Boolean).join(' | ')}
                                {item.mrp != null ? ` | ${formatCurrency(item.mrp)}` : ''}
                              </p>
                            )}
                            <p className="text-xs text-brand-text-muted mt-0.5">
                              {item.box_count} box{item.box_count !== 1 ? 'es' : ''} &middot; {item.pairs} pairs
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeEcItem(key)}
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
        </div>
      </div>
    </div>
  );
}
