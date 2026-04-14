'use client';

import { useState } from 'react';
import { PackageOpen, Search, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import PageHeader from '@/components/layout/PageHeader';
import Modal from '@/components/ui/Modal';
import { masterCartonService } from '@/services/masterCarton.service';
import { useApiMutation } from '@/hooks/useApi';
import type { MasterCarton } from '@/types';
import toast from 'react-hot-toast';

export default function UnpackPage() {
  const [selectedCarton, setSelectedCarton] = useState<MasterCarton | null>(null);
  const [cartonQR, setCartonQR] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const lookupCarton = async (code: string) => {
    if (!code.trim()) return;
    setIsSearching(true);
    try {
      const carton = await masterCartonService.getByBarcode(code.trim());
      if (carton.status === 'DISPATCHED') {
        toast.error('Cannot unpack a dispatched carton');
        return;
      }
      if (carton.status === 'CREATED') {
        toast.error('This carton has no packed boxes');
        return;
      }
      setSelectedCarton(carton);
      toast.success(`Found carton: ${carton.carton_barcode}`);
    } catch {
      toast.error('Master carton not found');
    } finally {
      setIsSearching(false);
    }
  };

  const { mutate: fullUnpack, isPending } = useApiMutation(
    () => masterCartonService.fullUnpack(selectedCarton!.id),
    {
      successMessage: 'All boxes unpacked successfully',
      invalidateKeys: [['master-cartons'], ['child-boxes'], ['dashboard-stats']],
      onSuccess: () => {
        setSelectedCarton(null);
        setCartonQR('');
        setShowConfirm(false);
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
        title="Unpack"
        description="Unpack removes ALL child boxes from a master carton. All boxes return to FREE status and the carton becomes empty."
      />

      <div className="max-w-2xl mx-auto space-y-6">
        {/* Step 1: Find carton */}
        <Card className="p-6">
          <h3 className="font-semibold text-brand-text-dark mb-4">
            Step 1: Scan or Enter Master Carton Barcode
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

        {/* Carton info + unpack button */}
        {selectedCarton && (
          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">
              Carton Details
            </h3>
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

            {/* Child boxes list */}
            {selectedCarton.child_boxes && selectedCarton.child_boxes.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium text-brand-text-muted mb-2">
                  Child Boxes in this Carton
                </h4>
                <div className="space-y-1 max-h-[250px] overflow-y-auto">
                  {selectedCarton.child_boxes.map((box) => (
                    <div
                      key={box.id}
                      className="flex items-center justify-between p-2 bg-orange-50 rounded text-sm"
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

            {/* Full Unpack button */}
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" onClick={handleReset} className="flex-1">
                Cancel
              </Button>
              <Button
                variant="danger"
                size="lg"
                className="flex-1"
                onClick={() => setShowConfirm(true)}
                leftIcon={<PackageOpen className="h-5 w-5" />}
              >
                Full Unpack
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirm Full Unpack"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isPending}
              onClick={() => fullUnpack(undefined as void)}
              leftIcon={<PackageOpen className="h-4 w-4" />}
            >
              Yes, Unpack All
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-brand-text-dark">
              Are you sure you want to fully unpack carton{' '}
              <strong className="font-mono">{selectedCarton?.carton_barcode}</strong>?
            </p>
            <p className="mt-2 text-sm text-brand-text-muted">
              This will unpack all{' '}
              <strong>{selectedCarton?.child_count}</strong> child boxes from this
              carton. They will become free and available for repacking.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
