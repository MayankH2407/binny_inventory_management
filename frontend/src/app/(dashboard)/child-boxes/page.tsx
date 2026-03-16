'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Package } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
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
import { PageSpinner } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES, PAGE_SIZE } from '@/constants';
import { childBoxService } from '@/services/childBox.service';
import { productService } from '@/services/product.service';
import { useApiQuery } from '@/hooks/useApi';
import { keepPreviousData } from '@tanstack/react-query';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import type { ChildBoxWithProduct } from '@/types';

export default function ChildBoxesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useApiQuery(
    ['child-boxes', String(page), search, statusFilter, productFilter],
    () =>
      childBoxService.getAll({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter || undefined,
        product_id: productFilter || undefined,
      }),
    { placeholderData: keepPreviousData }
  );

  const { data: productsData } = useApiQuery(
    ['products-list'],
    () => productService.getAll({ limit: 200, is_active: true }),
  );

  const products = productsData?.data ?? [];

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div>
      <PageHeader
        title="Child Boxes"
        description="Manage and track all child boxes in the system"
        action={
          <Link href={ROUTES.CHILD_BOXES_GENERATE}>
            <Button leftIcon={<Plus className="h-4 w-4" />}>Generate Labels</Button>
          </Link>
        }
      />

      <Card padding={false}>
        {/* Filters */}
        <div className="p-4 border-b border-brand-border">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by barcode, article name, or SKU..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <Select
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'FREE', label: 'Free' },
                { value: 'PACKED', label: 'Packed' },
                { value: 'DISPATCHED', label: 'Dispatched' },
              ]}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-44"
            />
            <Select
              options={[
                { value: '', label: 'All Products' },
                ...products.map((p) => ({
                  value: p.id,
                  label: `${p.article_name} (${p.sku})`,
                })),
              ]}
              value={productFilter}
              onChange={(e) => {
                setProductFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-56"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-12">
            <PageSpinner />
          </div>
        ) : !data?.data?.length ? (
          <div className="p-12 text-center">
            <Package className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">No child boxes found.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {data.data.map((box: ChildBoxWithProduct) => (
                <div
                  key={box.id}
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleExpand(box.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-brand-text-dark">
                      {box.barcode}
                    </span>
                    <StatusBadge status={box.status} size="sm" />
                  </div>
                  <p className="font-medium text-sm text-brand-text-dark">
                    {box.article_name}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-brand-text-muted">
                    <span>{box.sku}</span>
                    <span>{box.colour}</span>
                    <span>Size {box.size}</span>
                    <span>{formatCurrency(box.mrp)}</span>
                  </div>
                  {expandedId === box.id && (
                    <div className="mt-3 pt-3 border-t border-brand-border text-xs text-brand-text-muted space-y-1">
                      <p>
                        <span className="font-medium text-brand-text-dark">Article Code:</span>{' '}
                        {box.article_code}
                      </p>
                      <p>
                        <span className="font-medium text-brand-text-dark">Quantity:</span>{' '}
                        {box.quantity}
                      </p>
                      <p>
                        <span className="font-medium text-brand-text-dark">Created:</span>{' '}
                        {formatDateTime(box.created_at)}
                      </p>
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
                    <TableHeader>Barcode</TableHeader>
                    <TableHeader>Product</TableHeader>
                    <TableHeader>SKU</TableHeader>
                    <TableHeader>Colour</TableHeader>
                    <TableHeader>Size</TableHeader>
                    <TableHeader>MRP</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Created</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.data.map((box: ChildBoxWithProduct) => (
                    <TableRow
                      key={box.id}
                      clickable
                      onClick={() => toggleExpand(box.id)}
                    >
                      <TableCell>
                        <span className="font-mono text-xs">{box.barcode}</span>
                      </TableCell>
                      <TableCell className="font-medium">{box.article_name}</TableCell>
                      <TableCell>{box.sku}</TableCell>
                      <TableCell>{box.colour}</TableCell>
                      <TableCell>{box.size}</TableCell>
                      <TableCell>{formatCurrency(box.mrp)}</TableCell>
                      <TableCell>
                        <StatusBadge status={box.status} size="sm" />
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs">
                        {formatDateTime(box.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-brand-border gap-3">
                <p className="text-sm text-brand-text-muted">
                  Showing {(page - 1) * PAGE_SIZE + 1} to{' '}
                  {Math.min(page * PAGE_SIZE, data.total)} of {data.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-brand-text-muted px-2">
                    Page {page} of {data.totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page === data.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
