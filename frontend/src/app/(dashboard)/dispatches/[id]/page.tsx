'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Package,
  FlaskConical,
  ShoppingCart,
  Undo2,
  CheckSquare,
  Square,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES } from '@/constants';
import { dispatchService } from '@/services/dispatch.service';
import { returnsService } from '@/services/returns.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import type { DispatchSourceType, ReturnableItem } from '@/types';

function SourceTypeBadge({
  sourceType,
  sourceLabel,
}: {
  sourceType?: DispatchSourceType;
  sourceLabel?: string | null;
}) {
  if (!sourceType || sourceType === 'master_carton') {
    return (
      <div>
        <Badge variant="gray" size="sm">Master Carton</Badge>
        {sourceLabel && <p className="text-xs font-mono text-brand-text-muted mt-0.5">{sourceLabel}</p>}
      </div>
    );
  }
  if (sourceType === 'sample') {
    return (
      <div>
        <Badge variant="red" size="sm">Sample</Badge>
        {sourceLabel && <p className="text-xs font-mono text-brand-text-muted mt-0.5">{sourceLabel}</p>}
      </div>
    );
  }
  return (
    <div>
      <Badge variant="purple" size="sm">E-commerce</Badge>
      {sourceLabel && <p className="text-xs font-mono text-brand-text-muted mt-0.5">{sourceLabel}</p>}
    </div>
  );
}

function sourceIcon(sourceType?: DispatchSourceType) {
  if (sourceType === 'sample') return <FlaskConical className="h-4 w-4 text-brand-text-muted shrink-0" />;
  if (sourceType === 'ecommerce') return <ShoppingCart className="h-4 w-4 text-brand-text-muted shrink-0" />;
  return <Package className="h-4 w-4 text-brand-text-muted shrink-0" />;
}

function ReturnStatusBadge({ returnStatus }: { returnStatus?: 'none' | 'partial' | 'full' }) {
  if (returnStatus === 'full') {
    return <Badge variant="red" size="sm">Fully Returned</Badge>;
  }
  if (returnStatus === 'partial') {
    return <Badge variant="orange" size="sm">Partially Returned</Badge>;
  }
  return null;
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

export default function DispatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canCreateReturn = useCan('returns:create');

  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastSignatureRef = useRef<string | null>(null);

  const { data: dispatch, isLoading: loadingDispatch } = useApiQuery(['dispatch', id], () =>
    dispatchService.getById(id)
  );

  const {
    data: returnableData,
    isLoading: loadingReturnable,
    isError: returnableIsError,
    error: returnableError,
  } = useApiQuery(['dispatch-returnable', id], () => returnsService.getDispatchItems(id), {
    enabled: !!id,
    retry: false,
  });

  // Default: check every currently-returnable item. Re-derive whenever the
  // set of returnable barcodes actually changes (initial load, or after a
  // return removes some items from the returnable pool) — but don't clobber
  // the user's own unchecking within the same set.
  useEffect(() => {
    if (!returnableData) return;
    const returnableBarcodes = returnableData.items.filter((i) => i.returnable).map((i) => i.barcode);
    const signature = [...returnableBarcodes].sort().join(',');
    if (lastSignatureRef.current === signature) return;
    lastSignatureRef.current = signature;
    setSelected(new Set(returnableBarcodes));
  }, [returnableData]);

  const toggleItem = (item: ReturnableItem) => {
    if (!item.returnable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.barcode)) {
        next.delete(item.barcode);
      } else {
        next.add(item.barcode);
      }
      return next;
    });
  };

  const selectAll = () => {
    const returnable = returnableData?.items.filter((i) => i.returnable) ?? [];
    setSelected(new Set(returnable.map((i) => i.barcode)));
  };

  const selectNone = () => setSelected(new Set());

  const selectedItems = useMemo(
    () => returnableData?.items.filter((i) => selected.has(i.barcode)) ?? [],
    [returnableData, selected]
  );

  const { mutate: submitReturn, isPending } = useApiMutation(
    () =>
      returnsService.create({
        dispatch_record_id: id,
        reason: reason || undefined,
        items: selectedItems.map((i) => ({ barcode: i.barcode, item_type: i.item_type })),
      }),
    {
      successMessage: 'Return recorded',
      invalidateKeys: [
        ['returns'],
        ['inventory'],
        ['dispatches'],
        ['dispatch', id],
        ['dispatch-returnable', id],
        ['master-cartons'],
        ['ecommerce'],
        ['dashboard-stats'],
      ],
      onSuccess: () => setReason(''),
    }
  );

  const handleSubmit = () => {
    if (selectedItems.length === 0) {
      toast.error('Select at least one item to return');
      return;
    }
    submitReturn(undefined as void);
  };

  if (loadingDispatch) return <PageSpinner />;

  if (!dispatch) {
    return (
      <div className="text-center py-12">
        <p className="text-brand-text-muted">Dispatch record not found.</p>
      </div>
    );
  }

  const notSupported =
    returnableIsError && (returnableError as AxiosError)?.response?.status === 400;
  const notSupportedMessage =
    ((returnableError as AxiosError<{ message?: string }>)?.response?.data?.message) ||
    'Returns are not supported for sample dispatches';

  const returnableItems = returnableData?.items ?? [];
  const anyReturnable = returnableItems.some((i) => i.returnable);

  return (
    <div>
      <PageHeader
        title={`Dispatch: ${dispatch.source_label || dispatch.carton_barcode || dispatch.id.slice(0, 8)}`}
        description={formatDateTime(dispatch.dispatch_date)}
        action={
          <Link href={ROUTES.DISPATCHES}>
            <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
              Back
            </Button>
          </Link>
        }
      />

      {dispatch.return_status && dispatch.return_status !== 'none' && (
        <div className="flex items-center gap-2 mb-6 -mt-2">
          <ReturnStatusBadge returnStatus={dispatch.return_status} />
          <span className="text-xs text-amber-600 font-medium">
            {dispatch.returned_box_count} of {dispatch.total_box_count} boxes returned
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Source</p>
          <div className="flex items-center gap-2">
            {sourceIcon(dispatch.source_type)}
            <SourceTypeBadge
              sourceType={dispatch.source_type}
              sourceLabel={dispatch.source_label ?? dispatch.carton_barcode}
            />
          </div>
          {dispatch.child_count != null && (
            <p className="text-sm font-bold text-brand-text-dark mt-2">{dispatch.child_count} boxes</p>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Customer &amp; Destination</p>
          <p className="text-sm font-semibold text-brand-text-dark">
            {dispatch.customer_firm_name || 'Walk-in / No Customer'}
          </p>
          {dispatch.destination && (
            <p className="text-xs text-brand-text-muted mt-1">Destination: {dispatch.destination}</p>
          )}
          {dispatch.vehicle_number && (
            <p className="text-xs text-brand-text-muted">Vehicle: {dispatch.vehicle_number}</p>
          )}
          {dispatch.lr_number && (
            <p className="text-xs text-brand-text-muted">
              LR: <span className="font-mono">{dispatch.lr_number}</span>
            </p>
          )}
          {dispatch.transport_details && (
            <p className="text-xs text-brand-text-muted">Transport: {dispatch.transport_details}</p>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Product</p>
          {dispatch.article_summary && (
            <p className="text-sm font-medium text-brand-text-dark">{dispatch.article_summary}</p>
          )}
          {(dispatch.colour_summary || dispatch.size_summary) && (
            <p className="text-xs text-brand-text-muted">
              {[dispatch.colour_summary, dispatch.size_summary].filter(Boolean).join(' | ')}
              {dispatch.mrp_summary != null ? ` | ${formatCurrency(dispatch.mrp_summary)}` : ''}
            </p>
          )}
          {dispatch.notes && (
            <p className="text-xs text-brand-text-muted mt-1 italic">{dispatch.notes}</p>
          )}
          {!dispatch.article_summary && !dispatch.colour_summary && !dispatch.notes && (
            <p className="text-sm text-brand-text-muted">No additional details.</p>
          )}
        </Card>
      </div>

      {/* Return section */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg" style={{ backgroundColor: '#F5F4FF' }}>
            <Undo2 className="h-4 w-4" style={{ color: '#2D2A6E' }} />
          </div>
          <h3 className="font-semibold text-brand-text-dark">Return Items From This Dispatch</h3>
        </div>

        {loadingReturnable ? (
          <p className="text-sm text-brand-text-muted">Loading items...</p>
        ) : notSupported ? (
          <p className="text-sm text-brand-text-muted">{notSupportedMessage}</p>
        ) : returnableItems.length === 0 ? (
          <p className="text-sm text-brand-text-muted">No items found on this dispatch.</p>
        ) : !anyReturnable ? (
          <div className="text-center py-8">
            <Undo2 className="h-12 w-12 mx-auto mb-3 text-brand-text-muted/30" />
            <p className="text-sm font-medium text-brand-text-dark">All items returned</p>
            <p className="text-xs text-brand-text-muted mt-1">
              Every item on this dispatch has already been returned.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-brand-text-muted">
                {selectedItems.length} of {returnableItems.filter((i) => i.returnable).length} returnable
                item{returnableItems.filter((i) => i.returnable).length !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={selectAll}
                  leftIcon={<CheckSquare className="h-3.5 w-3.5" />}
                >
                  All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={selectNone}
                  leftIcon={<Square className="h-3.5 w-3.5" />}
                >
                  None
                </Button>
              </div>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto scrollbar-hide mb-4">
              {returnableItems.map((item) => {
                const checked = selected.has(item.barcode);
                return (
                  <label
                    key={item.barcode}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      item.returnable
                        ? 'bg-gray-50 border-transparent cursor-pointer'
                        : 'bg-gray-50/50 border-transparent opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      checked={checked}
                      disabled={!item.returnable}
                      onChange={() => toggleItem(item)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={item.item_type === 'CARTON' ? 'blue' : 'gray'} size="sm">
                          {item.item_type === 'CARTON' ? 'Carton' : 'Box'}
                        </Badge>
                        <span className="text-xs font-mono text-brand-text-muted">{item.barcode}</span>
                        {item.returned && (
                          <Badge variant="green" size="sm">Returned</Badge>
                        )}
                      </div>
                      <ItemProductLine item={item} />
                      {item.returned && item.returned_at && (
                        <p className="text-xs text-green-700 mt-0.5">
                          Returned on {formatDateTime(item.returned_at)}
                        </p>
                      )}
                      {!item.returnable && !item.returned && item.reason && (
                        <p className="text-xs text-brand-error mt-0.5">{item.reason}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-text-dark mb-1.5">
                Reason for return (Optional)
              </label>
              <textarea
                className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm text-brand-text-dark placeholder:text-brand-text-muted focus:outline-none focus:ring-2 focus:ring-binny-navy/30 focus:border-binny-navy mb-4"
                rows={3}
                maxLength={1000}
                placeholder="Why is this stock being returned?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {canCreateReturn && (
              <Button
                fullWidth
                size="lg"
                isLoading={isPending}
                disabled={selectedItems.length === 0}
                leftIcon={<Undo2 className="h-4 w-4" />}
                onClick={handleSubmit}
              >
                Return Selected ({selectedItems.length} item{selectedItems.length !== 1 ? 's' : ''})
              </Button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
