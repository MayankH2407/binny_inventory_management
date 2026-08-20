'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ShoppingCart,
  Copy,
  BarChart3,
  Boxes,
  AlertTriangle,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableHeader,
  TableCell,
} from '@/components/ui/Table';
import StatusBadge from '@/components/ui/StatusBadge';
import Badge from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES } from '@/constants';
import { ecommerceService } from '@/services/ecommerce.service';
import { useApiQuery } from '@/hooks/useApi';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function EcommerceDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: record, isLoading } = useApiQuery(
    ['ecommerce', id],
    () => ecommerceService.getById(id)
  );

  const { data: assortment } = useApiQuery(
    ['ecommerce-assortment', id],
    () => ecommerceService.getAssortment(id),
    { enabled: !!record }
  );

  const { data: cartons } = useApiQuery(
    ['ecommerce-cartons', id],
    () => ecommerceService.getCartons(id),
    { enabled: !!record }
  );

  const handleCopyBarcode = () => {
    if (record?.ecommerce_barcode) {
      navigator.clipboard.writeText(record.ecommerce_barcode);
      toast.success('Barcode copied');
    }
  };

  if (isLoading) return <PageSpinner />;

  if (!record) {
    return (
      <div className="text-center py-12">
        <p className="text-brand-text-muted">E-commerce record not found.</p>
      </div>
    );
  }

  const totalAssortmentQty = assortment?.reduce((sum, item) => sum + item.count, 0) || 0;

  return (
    <div>
      <PageHeader
        title={`E-commerce: ${record.ecommerce_barcode}`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopyBarcode}
              leftIcon={<Copy className="h-4 w-4" />}
            >
              Copy Barcode
            </Button>
            <Link href={ROUTES.ECOMMERCE}>
              <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Back
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex items-start gap-3 p-4 mb-6 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          Read-only history of the previous e-commerce record workflow. New activity lives in the
          E-commerce Area tab.
        </p>
      </div>

      {/* Status / Info / Timeline cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Status</p>
          <StatusBadge status={record.status} />
          <p className="mt-2 text-sm font-medium text-brand-text-dark">{record.name}</p>
          {record.marketplace && (
            <p className="text-xs text-brand-text-muted mt-0.5">{record.marketplace}</p>
          )}
          {record.order_reference && (
            <p className="text-xs text-brand-text-muted font-mono mt-0.5">{record.order_reference}</p>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Details</p>
          {record.listing_sku && (
            <p className="text-xs text-brand-text-muted mb-1">
              <span className="font-medium text-brand-text-dark">Listing SKU:</span>{' '}
              {record.listing_sku}
            </p>
          )}
          {record.mapped_date && (
            <p className="text-xs text-brand-text-muted mb-1">
              <span className="font-medium text-brand-text-dark">Mapped Date:</span>{' '}
              {formatDateTime(record.mapped_date)}
            </p>
          )}
          {record.notes && (
            <p className="text-xs text-brand-text-muted">
              <span className="font-medium text-brand-text-dark">Notes:</span> {record.notes}
            </p>
          )}
          {!record.listing_sku && !record.mapped_date && !record.notes && (
            <p className="text-sm text-brand-text-muted">No additional details.</p>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Timeline</p>
          <p className="text-xs text-brand-text-muted">
            <span className="font-medium text-brand-text-dark">Created:</span>{' '}
            {formatDateTime(record.created_at)}
            {record.creator?.name ? ` by ${record.creator.name}` : ''}
          </p>
          {record.closed_at && (
            <p className="text-xs text-brand-text-muted mt-1">
              <span className="font-medium text-brand-text-dark">Closed:</span>{' '}
              {formatDateTime(record.closed_at)}
            </p>
          )}
          {record.dispatched_at && (
            <p className="text-xs text-brand-text-muted mt-1">
              <span className="font-medium text-brand-text-dark">Dispatched:</span>{' '}
              {formatDateTime(record.dispatched_at)}
            </p>
          )}
          <p className="text-sm font-bold text-brand-text-dark mt-2">{record.child_count} boxes</p>
        </Card>
      </div>

      {/* Assortment Summary */}
      {assortment && assortment.length > 0 && (
        <Card padding={false} className="mb-6">
          <div className="p-4 border-b border-brand-border">
            <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Assortment Summary
            </h3>
          </div>

          {/* Mobile cards */}
          <div className="block md:hidden divide-y divide-brand-border">
            {assortment.map((item) => (
              <div key={`${item.article_name}-${item.colour}-${item.size}`} className="p-4">
                <p className="text-sm font-medium">{item.article_name}</p>
                <div className="flex gap-3 text-xs text-brand-text-muted mt-1">
                  <span>{item.colour}</span>
                  <span>Size {item.size}</span>
                  <span>{formatCurrency(item.mrp)}</span>
                </div>
                <p className="text-sm font-bold mt-1">Qty: {item.count}</p>
              </div>
            ))}
            <div className="p-4 bg-gray-50">
              <p className="text-sm font-bold text-brand-text-dark">
                Total: {totalAssortmentQty} Prs
              </p>
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Article</TableHeader>
                  <TableHeader>Colour</TableHeader>
                  <TableHeader>Size</TableHeader>
                  <TableHeader>MRP</TableHeader>
                  <TableHeader className="text-right">Qty</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {assortment.map((item) => (
                  <TableRow key={`${item.article_name}-${item.colour}-${item.size}`}>
                    <TableCell className="font-medium">{item.article_name}</TableCell>
                    <TableCell>{item.colour}</TableCell>
                    <TableCell>{item.size}</TableCell>
                    <TableCell>{formatCurrency(item.mrp)}</TableCell>
                    <TableCell className="text-right font-bold">{item.count}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} className="font-bold text-brand-text-dark">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold text-brand-text-dark">
                    {totalAssortmentQty}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Child Boxes */}
      <Card padding={false}>
        <div className="p-4 border-b border-brand-border">
          <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" />
            Child Boxes ({record.child_boxes?.length || 0})
          </h3>
        </div>
        {!record.child_boxes?.length ? (
          <div className="p-12 text-center">
            <p className="text-brand-text-muted">No child boxes in this e-commerce record.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {record.child_boxes.map((box, index) => (
                <div key={box.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-brand-text-muted">#{index + 1}</span>
                    <StatusBadge status={box.status} size="sm" />
                  </div>
                  <p className="font-mono text-xs mb-1">{box.barcode}</p>
                  <p className="text-sm font-medium">{box.article_name}</p>
                  <div className="flex gap-3 text-xs text-brand-text-muted mt-1">
                    <span>{box.sku}</span>
                    <span>{box.colour}</span>
                    <span>Size {box.size}</span>
                    <span>{formatCurrency(box.mrp)}</span>
                  </div>
                  {box.source === 'carton' && (
                    <div className="mt-1.5">
                      <Badge variant="blue" size="sm">
                        Carton {box.carton_barcode}
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>#</TableHeader>
                    <TableHeader>Barcode</TableHeader>
                    <TableHeader>SKU</TableHeader>
                    <TableHeader>Product</TableHeader>
                    <TableHeader>Colour</TableHeader>
                    <TableHeader>Size</TableHeader>
                    <TableHeader>MRP</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Source</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {record.child_boxes.map((box, index) => (
                    <TableRow key={box.id}>
                      <TableCell className="text-brand-text-muted">{index + 1}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{box.barcode}</span>
                      </TableCell>
                      <TableCell>{box.sku}</TableCell>
                      <TableCell className="font-medium">{box.article_name}</TableCell>
                      <TableCell>{box.colour}</TableCell>
                      <TableCell>{box.size}</TableCell>
                      <TableCell>{formatCurrency(box.mrp)}</TableCell>
                      <TableCell>
                        <StatusBadge status={box.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        {box.source === 'carton' ? (
                          <Badge variant="blue" size="sm">
                            Carton {box.carton_barcode}
                          </Badge>
                        ) : (
                          <span className="text-brand-text-muted text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      {/* Cartons in this record — secondary section (boxes are primary for the
          e-commerce channel; whole cartons allocated intact list below). */}
      {cartons && cartons.length > 0 && (
        <Card padding={false} className="mt-6">
          <div className="p-4 border-b border-brand-border">
            <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Cartons in this Record ({cartons.length})
            </h3>
          </div>

          {/* Mobile cards */}
          <div className="block md:hidden divide-y divide-brand-border">
            {cartons.map((c) => (
              <div key={c.mapping_id} className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs">{c.carton_barcode}</span>
                  <StatusBadge status={c.status} size="sm" />
                </div>
                {c.article_summary && <p className="text-sm font-medium">{c.article_summary}</p>}
                <div className="flex gap-3 text-xs text-brand-text-muted mt-1">
                  {c.colour_summary && <span>{c.colour_summary}</span>}
                  {c.size_summary && <span>{c.size_summary}</span>}
                  {c.mrp_summary != null && <span>{formatCurrency(c.mrp_summary)}</span>}
                </div>
                <p className="text-sm font-bold mt-1">{c.child_count} boxes</p>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Carton Barcode</TableHeader>
                  <TableHeader>Boxes</TableHeader>
                  <TableHeader>Article</TableHeader>
                  <TableHeader>Colour</TableHeader>
                  <TableHeader>Size</TableHeader>
                  <TableHeader>MRP</TableHeader>
                  <TableHeader>Status</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {cartons.map((c) => (
                  <TableRow key={c.mapping_id}>
                    <TableCell>
                      <span className="font-mono text-xs">{c.carton_barcode}</span>
                    </TableCell>
                    <TableCell className="font-semibold">{c.child_count}</TableCell>
                    <TableCell className="font-medium">{c.article_summary || '—'}</TableCell>
                    <TableCell>{c.colour_summary || '—'}</TableCell>
                    <TableCell>{c.size_summary || '—'}</TableCell>
                    <TableCell>{c.mrp_summary != null ? formatCurrency(c.mrp_summary) : '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} size="sm" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
