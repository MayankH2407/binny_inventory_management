'use client';

import { useState, useCallback, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Undo2, ScanLine, PackageOpen, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import QRScanner from '@/components/scanning/QRScanner';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import PageHeader from '@/components/layout/PageHeader';
import { returnsService } from '@/services/returns.service';
import { useApiMutation } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { ROUTES } from '@/constants';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { ReturnableItem } from '@/types';

interface PickedItem {
  barcode: string;
  item_type: 'BOX' | 'CARTON';
  display: ReturnableItem;
}

// Renders the product line (article / colour / size / pairs / mrp) for a
// returnable item, whether it carries its own fields (BOX) or a rolled-up
// product_summary (CARTON).
function ItemProductLine({ item }: { item: ReturnableItem }) {
  const summary = item.product_summary;
  const article = item.article_name || summary?.article_summary;
  const colour = item.colour || summary?.colour_summary;
  const size = item.size || summary?.size_summary;
  const mrp = item.mrp ?? summary?.mrp;
  const pairs = summary?.pairs ?? (item.item_type === 'CARTON' ? item.child_count : undefined);

  if (!article && !colour && !size) return null;

  return (
    <>
      {article && <p className="text-sm font-medium text-brand-text-dark">{article}</p>}
      {(colour || size || mrp != null) && (
        <p className="text-xs text-brand-text-muted">
          {[colour, size].filter(Boolean).join(' | ')}
          {mrp != null ? ` | ${formatCurrency(mrp)}` : ''}
          {pairs != null ? ` | ${pairs} prs` : ''}
        </p>
      )}
    </>
  );
}

export default function CreateReturnPage() {
  const router = useRouter();
  const canCreate = useCan('returns:create');

  // Shared return details
  const [returnDate, setReturnDate] = useState('');
  const [reason, setReason] = useState('');

  // Picked items
  const [returnItems, setReturnItems] = useState<PickedItem[]>([]);

  const [showScanner, setShowScanner] = useState(false);

  const lookupItem = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    try {
      const result = await returnsService.lookup(trimmed);
      if (!result.returnable) {
        toast.error(result.reason || 'Item is not returnable');
        return;
      }
      setReturnItems((prev) => {
        if (prev.some((ri) => ri.barcode === result.barcode)) {
          toast.error('Already added');
          return prev;
        }
        toast.success(`Added: ${result.barcode}`);
        return [...prev, { barcode: result.barcode, item_type: result.item_type, display: result }];
      });
    } catch {
      toast.error('Barcode not found');
    }
  }, []);

  const removeItem = (barcode: string) => {
    setReturnItems((prev) => prev.filter((ri) => ri.barcode !== barcode));
  };

  // ── Submit ──
  const { mutate: createReturn, isPending } = useApiMutation(
    () =>
      returnsService.create({
        reason: reason || undefined,
        return_date: returnDate ? new Date(returnDate).toISOString() : undefined,
        items: returnItems.map((i) => ({ barcode: i.barcode, item_type: i.item_type })),
      }),
    {
      successMessage: 'Return recorded',
      invalidateKeys: [
        ['returns'],
        ['inventory'],
        ['master-cartons'],
        ['ecommerce'],
        ['dashboard-stats'],
        ['dispatches'],
      ],
      onSuccess: () => router.push(ROUTES.RETURNS),
    }
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (returnItems.length === 0) {
      toast.error('Add at least one item to return');
      return;
    }
    createReturn(undefined as void);
  };

  return (
    <div>
      <PageHeader title="New Return" description="Scan already-dispatched items to record them back into inventory" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: return details form */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
                <Undo2 className="h-4 w-4" style={{ color: '#2D2A6E' }} />
              </div>
              <h3 className="font-semibold text-brand-text-dark">Return Details</h3>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <Input
                type="date"
                label="Return Date (Optional)"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-brand-text-dark mb-1.5">
                  Reason for return (Optional)
                </label>
                <textarea
                  className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm text-brand-text-dark placeholder:text-brand-text-muted focus:outline-none focus:ring-2 focus:ring-binny-navy/30 focus:border-binny-navy"
                  rows={3}
                  maxLength={1000}
                  placeholder="Why is this stock being returned?"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              {canCreate && (
                <div className="pt-4 border-t border-brand-border">
                  <Button
                    type="submit"
                    fullWidth
                    size="lg"
                    isLoading={isPending}
                    disabled={returnItems.length === 0}
                    leftIcon={<Undo2 className="h-4 w-4" />}
                  >
                    Record Return ({returnItems.length} item{returnItems.length !== 1 ? 's' : ''})
                  </Button>
                </div>
              )}
            </form>
          </Card>
        </div>

        {/* Right: scanner + picked items */}
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
                <ScanLine className="h-4 w-4" style={{ color: '#2D2A6E' }} />
              </div>
              <h3 className="font-semibold text-brand-text-dark">Scan Items to Return</h3>
            </div>
            <HIDScannerInput
              onScan={lookupItem}
              placeholder="Scan or enter box/carton barcode..."
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
                <QRScanner onScanSuccess={lookupItem} autoStart />
              </div>
            )}
          </Card>

          {/* Picked items list */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
                <PackageOpen className="h-4 w-4" style={{ color: '#2D2A6E' }} />
              </div>
              <h3 className="font-semibold text-brand-text-dark">
                Items to Return ({returnItems.length})
              </h3>
            </div>
            {returnItems.length === 0 ? (
              <div className="text-center py-8">
                <Undo2 className="h-12 w-12 mx-auto mb-3 text-brand-text-muted/30" />
                <p className="text-sm text-brand-text-muted">
                  Scan or enter barcodes to add them to this return
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-hide">
                {returnItems.map((ri) => (
                  <div
                    key={ri.barcode}
                    className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={ri.item_type === 'CARTON' ? 'blue' : 'gray'} size="sm">
                          {ri.item_type === 'CARTON' ? 'Carton' : 'Box'}
                        </Badge>
                        <span className="text-xs font-mono text-brand-text-muted">{ri.barcode}</span>
                      </div>
                      <ItemProductLine item={ri.display} />
                      {ri.display.origin_dispatch && (
                        <p className="text-xs text-brand-text-muted mt-0.5">
                          From: {ri.display.origin_dispatch.customer_firm_name || 'Walk-in'} —{' '}
                          {ri.display.origin_dispatch.source_label} (
                          {formatDate(ri.display.origin_dispatch.dispatch_date)})
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(ri.barcode)}
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
