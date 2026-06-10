'use client';

import Link from 'next/link';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { SkeletonTable } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES } from '@/constants';
import { ecommerceService } from '@/services/ecommerce.service';
import { useApiQuery } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { formatCurrency } from '@/lib/utils';

export default function EcommerceStockPage() {
  const canRead = useCan('ecommerce:read');

  const { data, isLoading } = useApiQuery(
    ['ecommerce-stock-summary'],
    () => ecommerceService.getStockSummary(),
    { enabled: canRead }
  );

  const rows = data ?? [];
  const totalAllocated = rows.reduce((s, r) => s + r.allocated_pairs, 0);
  const totalAvailable = rows.reduce((s, r) => s + r.available_pairs, 0);

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <ShoppingCart className="h-16 w-16 text-brand-text-muted/20 mb-4" />
        <h2 className="text-lg font-semibold text-brand-text-dark mb-2">Access Denied</h2>
        <p className="text-brand-text-muted">You do not have permission to view e-commerce stock.</p>
      </div>
    );
  }

  return (
    <div>
      <Link href={ROUTES.ECOMMERCE} className="inline-flex items-center gap-1 text-sm text-brand-text-muted hover:text-brand-text-dark mb-3">
        <ArrowLeft className="h-4 w-4" /> Back to E-commerce
      </Link>

      <PageHeader
        title="E-commerce Stock"
        description="Per-product stock allocated to e-commerce vs available to assign (in pairs)"
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-sm text-brand-text-muted">Allocated to e-commerce</p>
          <p className="text-2xl font-bold text-brand-text-dark">{totalAllocated} <span className="text-base font-normal text-brand-text-muted">Prs</span></p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-brand-text-muted">Available to assign</p>
          <p className="text-2xl font-bold text-brand-text-dark">{totalAvailable} <span className="text-base font-normal text-brand-text-muted">Prs</span></p>
        </Card>
      </div>

      <Card padding={false}>
        {isLoading ? (
          <div className="p-4"><SkeletonTable /></div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-brand-text-muted">No e-commerce or available stock to show yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Article</TableHeader>
                  <TableHeader>Colour</TableHeader>
                  <TableHeader>Size</TableHeader>
                  <TableHeader>SKU</TableHeader>
                  <TableHeader>MRP</TableHeader>
                  <TableHeader>Allocated (Prs / Boxes)</TableHeader>
                  <TableHeader>Available (Prs / Boxes)</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.product_id}>
                    <TableCell className="font-medium">{r.article_name}</TableCell>
                    <TableCell>{r.colour}</TableCell>
                    <TableCell>{r.size}</TableCell>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell>{formatCurrency(r.mrp)}</TableCell>
                    <TableCell>
                      <span className="font-semibold text-brand-text-dark">{r.allocated_pairs}</span>
                      <span className="text-brand-text-muted text-xs"> / {r.allocated_boxes}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-brand-text-dark">{r.available_pairs}</span>
                      <span className="text-brand-text-muted text-xs"> / {r.available_boxes}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
