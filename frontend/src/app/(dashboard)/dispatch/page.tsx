'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { Truck, ScanLine, X, Search, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import QRScanner from '@/components/scanning/QRScanner';
import PageHeader from '@/components/layout/PageHeader';
import { dispatchService } from '@/services/dispatch.service';
import { masterCartonService } from '@/services/masterCarton.service';
import { customerService } from '@/services/customer.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import type { MasterCarton } from '@/types';
import toast from 'react-hot-toast';
import { ROUTES } from '@/constants';
import { useRouter } from 'next/navigation';

export default function DispatchPage() {
  const router = useRouter();
  const [showScanner, setShowScanner] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scannedCartons, setScannedCartons] = useState<MasterCarton[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [formData, setFormData] = useState({
    destination: '',
    vehicle_number: '',
    transport_details: '',
    lr_number: '',
    notes: '',
  });

  const { data: customersData } = useApiQuery(
    ['customers-for-dispatch'],
    () => customerService.getAll({ limit: 200, is_active: true }),
  );
  const customers = customersData?.data ?? [];

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
        // Accept ACTIVE and CLOSED cartons
        setScannedCartons((prev) => [...prev, carton]);
        toast.success(`Added carton: ${carton.carton_barcode}`);
      } catch {
        toast.error('Master carton not found');
      }
    },
    [scannedCartons]
  );

  const handleScanCarton = useCallback(
    (code: string) => {
      addCarton(code);
    },
    [addCarton]
  );

  const handleAddManual = () => {
    addCarton(manualBarcode);
    setManualBarcode('');
  };

  const removeCarton = (id: string) => {
    setScannedCartons((prev) => prev.filter((c) => c.id !== id));
  };

  const { mutate: createDispatch, isPending } = useApiMutation(
    () =>
      dispatchService.create({
        customer_id: customerId || undefined,
        destination: formData.destination || undefined,
        vehicle_number: formData.vehicle_number || undefined,
        transport_details: formData.transport_details || undefined,
        lr_number: formData.lr_number || undefined,
        notes: formData.notes || undefined,
        master_carton_ids: scannedCartons.map((c) => c.id),
      }),
    {
      successMessage: 'Dispatch created successfully',
      invalidateKeys: [['master-cartons'], ['dashboard-stats'], ['dispatches']],
      onSuccess: () => {
        setScannedCartons([]);
        setCustomerId('');
        setFormData({ destination: '', vehicle_number: '', transport_details: '', lr_number: '', notes: '' });
        router.push(ROUTES.DISPATCHES);
      },
    }
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (scannedCartons.length === 0) {
      toast.error('Add at least one master carton');
      return;
    }
    createDispatch(undefined as void);
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <PageHeader
        title="Dispatch"
        description="Create a new dispatch with master cartons"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">Dispatch Details</h3>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Select
                label="Customer (Optional)"
                placeholder="Select a customer..."
                options={customers.map((c) => ({
                  value: c.id,
                  label: `${c.firm_name}${c.delivery_location ? ` — ${c.delivery_location}` : ''}`,
                }))}
                value={customerId}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  setCustomerId(selectedId);
                  if (selectedId) {
                    const selectedCustomer = customers.find((c) => c.id === selectedId);
                    if (selectedCustomer?.delivery_location && !formData.destination) {
                      updateField('destination', selectedCustomer.delivery_location);
                    }
                  }
                }}
              />
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

              <div className="pt-4 border-t border-brand-border">
                <Button
                  type="submit"
                  fullWidth
                  size="lg"
                  isLoading={isPending}
                  disabled={scannedCartons.length === 0}
                  leftIcon={<Truck className="h-4 w-4" />}
                >
                  Create Dispatch ({scannedCartons.length} carton{scannedCartons.length !== 1 ? 's' : ''})
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-brand-text-dark">Scan Master Cartons</h3>
              <Button
                variant={showScanner ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => setShowScanner(!showScanner)}
                leftIcon={<ScanLine className="h-4 w-4" />}
              >
                {showScanner ? 'Hide Scanner' : 'Open Scanner'}
              </Button>
            </div>
            {showScanner && <QRScanner onScanSuccess={handleScanCarton} autoStart />}

            {/* Manual barcode input */}
            <div className="mt-4">
              <label className="text-sm font-medium text-brand-text-dark mb-1.5 block">
                Or enter barcode manually
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="Enter carton barcode..."
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddManual();
                      }
                    }}
                    leftIcon={<Search className="h-4 w-4" />}
                  />
                </div>
                <Button onClick={handleAddManual} leftIcon={<Plus className="h-4 w-4" />}>
                  Add
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">
              Cartons to Dispatch ({scannedCartons.length})
            </h3>

            {scannedCartons.length === 0 ? (
              <div className="text-center py-8">
                <Truck className="h-12 w-12 mx-auto mb-3 text-brand-text-muted/30" />
                <p className="text-sm text-brand-text-muted">
                  Scan or enter master carton barcodes to add them to this dispatch
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-hide">
                {scannedCartons.map((carton) => (
                  <div
                    key={carton.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-mono text-brand-text-dark">
                        {carton.carton_barcode}
                      </p>
                      <p className="text-xs text-brand-text-muted">
                        {carton.child_count} boxes &middot; {carton.status}
                      </p>
                    </div>
                    <button
                      onClick={() => removeCarton(carton.id)}
                      className="p-1 rounded text-brand-text-muted hover:text-brand-error hover:bg-red-50 transition-colors shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
