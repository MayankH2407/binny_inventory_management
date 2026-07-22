'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Undo2, Truck } from 'lucide-react';
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
import Badge from '@/components/ui/Badge';
import { PageSpinner } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES } from '@/constants';
import { returnsService } from '@/services/returns.service';
import { useApiQuery } from '@/hooks/useApi';
import { formatDateTime, formatCurrency } from '@/lib/utils';

export default function ReturnDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: returnRecord, isLoading } = useApiQuery(['return', id], () =>
    returnsService.getById(id)
  );

  if (isLoading) return <PageSpinner />;

  if (!returnRecord) {
    return (
      <div className="text-center py-12">
        <p className="text-brand-text-muted">Return record not found.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Return Details"
        description={formatDateTime(returnRecord.return_date)}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={ROUTES.RETURNS}>
              <Button variant="secondary" size="sm" leftIcon={<ArrowLeft className="h-4 w-4" />}>
                Back
              </Button>
            </Link>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Source</p>
          {returnRecord.dispatch_record_id ? (
            <>
              <Badge variant="blue" size="sm">Against Dispatch</Badge>
              {returnRecord.source_label && (
                <p className="text-xs font-mono text-brand-text-muted mt-1.5">
                  {returnRecord.source_label}
                </p>
              )}
              <Link
                href={ROUTES.DISPATCHES}
                className="inline-flex items-center gap-1 text-xs text-binny-navy mt-1.5 hover:underline"
              >
                <Truck className="h-3 w-3" />
                View dispatches
              </Link>
            </>
          ) : (
            <Badge variant="gray" size="sm">Blind Scan-in</Badge>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Customer</p>
          <p className="text-sm font-semibold text-brand-text-dark">
            {returnRecord.customer_firm_name || 'Blind / No Customer'}
          </p>
          {returnRecord.returned_by_name && (
            <p className="text-xs text-brand-text-muted mt-1">
              Returned by: {returnRecord.returned_by_name}
            </p>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-sm text-brand-text-muted mb-1">Items</p>
          <p className="text-sm font-bold text-brand-text-dark">
            {returnRecord.item_count ?? returnRecord.items?.length ?? 0} item(s)
            {returnRecord.box_count != null ? ` · ${returnRecord.box_count} boxes` : ''}
          </p>
          {(returnRecord.article_summary || returnRecord.colour_summary || returnRecord.size_summary) && (
            <p className="text-xs text-brand-text-muted mt-1">
              {[returnRecord.article_summary, returnRecord.colour_summary, returnRecord.size_summary]
                .filter(Boolean)
                .join(' | ')}
            </p>
          )}
          {returnRecord.pairs != null && (
            <p className="text-xs text-brand-text-muted">{returnRecord.pairs} pairs</p>
          )}
        </Card>
      </div>

      {returnRecord.notes && (
        <Card className="p-6 mb-6">
          <p className="text-sm text-brand-text-muted mb-1">Notes</p>
          <p className="text-sm text-brand-text-dark">{returnRecord.notes}</p>
        </Card>
      )}

      {/* Items table */}
      <Card padding={false}>
        <div className="p-4 border-b border-brand-border">
          <h3 className="font-semibold text-brand-text-dark flex items-center gap-2">
            <Undo2 className="h-4 w-4" />
            Returned Items ({returnRecord.items?.length ?? 0})
          </h3>
        </div>
        {!returnRecord.items?.length ? (
          <div className="p-12 text-center">
            <p className="text-brand-text-muted">No item details available for this return.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {returnRecord.items.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant={item.item_type === 'CARTON' ? 'blue' : 'gray'} size="sm">
                      {item.item_type === 'CARTON' ? 'Carton' : 'Box'}
                    </Badge>
                  </div>
                  <p className="font-mono text-xs mb-1">{item.barcode}</p>
                  {item.article_name && <p className="text-sm font-medium">{item.article_name}</p>}
                  <div className="flex gap-3 text-xs text-brand-text-muted mt-1">
                    {item.colour && <span>{item.colour}</span>}
                    {item.size && <span>Size {item.size}</span>}
                    {item.mrp != null && <span>{formatCurrency(item.mrp)}</span>}
                  </div>
                  {item.carton_barcode && (
                    <p className="text-xs text-brand-text-muted mt-1">
                      Carton: <span className="font-mono">{item.carton_barcode}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Barcode</TableHeader>
                    <TableHeader>Article</TableHeader>
                    <TableHeader>Colour</TableHeader>
                    <TableHeader>Size</TableHeader>
                    <TableHeader>MRP</TableHeader>
                    <TableHeader>Carton</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {returnRecord.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant={item.item_type === 'CARTON' ? 'blue' : 'gray'} size="sm">
                          {item.item_type === 'CARTON' ? 'Carton' : 'Box'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{item.barcode}</span>
                      </TableCell>
                      <TableCell className="font-medium">{item.article_name || '—'}</TableCell>
                      <TableCell>{item.colour || '—'}</TableCell>
                      <TableCell>{item.size || '—'}</TableCell>
                      <TableCell>{item.mrp != null ? formatCurrency(item.mrp) : '—'}</TableCell>
                      <TableCell>
                        {item.carton_barcode ? (
                          <span className="font-mono text-xs">{item.carton_barcode}</span>
                        ) : (
                          '—'
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
    </div>
  );
}
