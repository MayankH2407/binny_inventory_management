'use client';

import { useState, useCallback } from 'react';
import { ArrowLeftRight, Search, PackageOpen, Check } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import PageHeader from '@/components/layout/PageHeader';
import { masterCartonService } from '@/services/masterCarton.service';
import type { MasterCarton, ChildBoxWithProduct } from '@/types';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function RepackPage() {
  const [sourceCarton, setSourceCarton] = useState<MasterCarton | null>(null);
  const [destCarton, setDestCarton] = useState<MasterCarton | null>(null);
  const [sourceQR, setSourceQR] = useState('');
  const [destQR, setDestQR] = useState('');
  const [isSearchingSource, setIsSearchingSource] = useState(false);
  const [isSearchingDest, setIsSearchingDest] = useState(false);
  const [selectedBoxIds, setSelectedBoxIds] = useState<Set<string>>(new Set());
  const [isRepacking, setIsRepacking] = useState(false);

  const lookupSource = async (code: string) => {
    if (!code.trim()) return;
    setIsSearchingSource(true);
    try {
      const carton = await masterCartonService.getByBarcode(code.trim());
      if (carton.status === 'DISPATCHED') {
        toast.error('Cannot repack from a dispatched carton');
        return;
      }
      if (!carton.child_boxes || carton.child_boxes.length === 0) {
        toast.error('This carton has no child boxes');
        return;
      }
      setSourceCarton(carton);
      setSelectedBoxIds(new Set());
      toast.success(`Source carton found: ${carton.carton_barcode}`);
    } catch {
      toast.error('Source carton not found');
    } finally {
      setIsSearchingSource(false);
    }
  };

  const lookupDest = async (code: string) => {
    if (!code.trim()) return;
    if (sourceCarton && code.trim() === sourceCarton.carton_barcode) {
      toast.error('Destination cannot be the same as source');
      return;
    }
    setIsSearchingDest(true);
    try {
      const carton = await masterCartonService.getByBarcode(code.trim());
      if (carton.status === 'DISPATCHED') {
        toast.error('Cannot repack into a dispatched carton');
        return;
      }
      if (carton.status === 'CLOSED') {
        toast.error('Cannot repack into a closed carton');
        return;
      }
      setDestCarton(carton);
      toast.success(`Destination carton found: ${carton.carton_barcode}`);
    } catch {
      toast.error('Destination carton not found');
    } finally {
      setIsSearchingDest(false);
    }
  };

  const toggleBox = useCallback((boxId: string) => {
    setSelectedBoxIds((prev) => {
      const next = new Set(prev);
      if (next.has(boxId)) {
        next.delete(boxId);
      } else {
        next.add(boxId);
      }
      return next;
    });
  }, []);

  const selectAll = () => {
    if (!sourceCarton?.child_boxes) return;
    setSelectedBoxIds(new Set(sourceCarton.child_boxes.map((b) => b.id)));
  };

  const deselectAll = () => {
    setSelectedBoxIds(new Set());
  };

  const handleRepack = async () => {
    if (!sourceCarton || !destCarton || selectedBoxIds.size === 0) return;
    setIsRepacking(true);
    let successCount = 0;
    let failCount = 0;

    const boxIdArray = Array.from(selectedBoxIds);
    for (const boxId of boxIdArray) {
      try {
        await masterCartonService.repack({
          child_box_id: boxId,
          source_carton_id: sourceCarton.id,
          destination_carton_id: destCarton.id,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }

    setIsRepacking(false);

    if (successCount > 0) {
      toast.success(`Repacked ${successCount} box${successCount > 1 ? 'es' : ''} successfully`);
    }
    if (failCount > 0) {
      toast.error(`Failed to repack ${failCount} box${failCount > 1 ? 'es' : ''}`);
    }

    // Reset
    setSourceCarton(null);
    setDestCarton(null);
    setSourceQR('');
    setDestQR('');
    setSelectedBoxIds(new Set());
  };

  const renderCartonInfo = (carton: MasterCarton) => (
    <div className="p-4 bg-gray-50 rounded-lg border border-brand-border space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-brand-text-muted">Barcode</span>
        <span className="font-mono text-sm text-brand-text-dark">{carton.carton_barcode}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-brand-text-muted">Status</span>
        <StatusBadge status={carton.status} size="sm" />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-brand-text-muted">Child Boxes</span>
        <span className="text-sm font-semibold">{carton.child_count}</span>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Repack"
        description="Repack moves SPECIFIC child boxes from one master carton to another. Selected boxes stay PACKED but transfer to the destination carton."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column - Source */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">
              Step 1: Source Carton
            </h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Scan or enter source carton barcode..."
                  value={sourceQR}
                  onChange={(e) => setSourceQR(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && lookupSource(sourceQR)}
                  leftIcon={<Search className="h-4 w-4" />}
                />
              </div>
              <Button onClick={() => lookupSource(sourceQR)} isLoading={isSearchingSource}>
                Find
              </Button>
            </div>
            {sourceCarton && (
              <div className="mt-4">{renderCartonInfo(sourceCarton)}</div>
            )}
          </Card>

          {/* Step 2: Select boxes */}
          {sourceCarton && sourceCarton.child_boxes && sourceCarton.child_boxes.length > 0 && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-brand-text-dark">
                  Step 2: Select Boxes ({selectedBoxIds.size}/{sourceCarton.child_boxes.length})
                </h3>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={deselectAll}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="space-y-1 max-h-[350px] overflow-y-auto">
                {sourceCarton.child_boxes.map((box: ChildBoxWithProduct) => (
                  <label
                    key={box.id}
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                      selectedBoxIds.has(box.id) ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBoxIds.has(box.id)}
                      onChange={() => toggleBox(box.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-brand-text-dark">
                        {box.article_name} - {box.colour} - {box.size}
                      </p>
                      <p className="text-xs text-brand-text-muted">
                        {formatCurrency(box.mrp)} &middot; <span className="font-mono">{box.barcode}</span>
                      </p>
                    </div>
                    {selectedBoxIds.has(box.id) && (
                      <Check className="h-4 w-4 text-blue-600 shrink-0" />
                    )}
                  </label>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Right column - Destination + Action */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">
              Step 3: Destination Carton
            </h3>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  placeholder="Scan or enter destination carton barcode..."
                  value={destQR}
                  onChange={(e) => setDestQR(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && lookupDest(destQR)}
                  leftIcon={<Search className="h-4 w-4" />}
                  disabled={!sourceCarton}
                />
              </div>
              <Button
                onClick={() => lookupDest(destQR)}
                isLoading={isSearchingDest}
                disabled={!sourceCarton}
              >
                Find
              </Button>
            </div>
            {destCarton && (
              <div className="mt-4">{renderCartonInfo(destCarton)}</div>
            )}
          </Card>

          {/* Step 4: Repack button */}
          <Card className="p-6">
            <h3 className="font-semibold text-brand-text-dark mb-4">
              Step 4: Repack
            </h3>

            {!sourceCarton ? (
              <div className="text-center py-8">
                <PackageOpen className="h-12 w-12 mx-auto mb-3 text-brand-text-muted/30" />
                <p className="text-sm text-brand-text-muted">
                  Scan a source carton to get started
                </p>
              </div>
            ) : !destCarton ? (
              <div className="text-center py-8">
                <ArrowLeftRight className="h-12 w-12 mx-auto mb-3 text-brand-text-muted/30" />
                <p className="text-sm text-brand-text-muted">
                  Select boxes and scan a destination carton
                </p>
              </div>
            ) : selectedBoxIds.size === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-brand-text-muted">
                  Select at least one child box to move
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
                  Moving <strong>{selectedBoxIds.size}</strong> box
                  {selectedBoxIds.size > 1 ? 'es' : ''} from{' '}
                  <strong className="font-mono">{sourceCarton.carton_barcode}</strong> to{' '}
                  <strong className="font-mono">{destCarton.carton_barcode}</strong>
                </div>
                <Button
                  fullWidth
                  size="lg"
                  isLoading={isRepacking}
                  onClick={handleRepack}
                  leftIcon={<ArrowLeftRight className="h-5 w-5" />}
                >
                  Repack {selectedBoxIds.size} Box{selectedBoxIds.size > 1 ? 'es' : ''}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
