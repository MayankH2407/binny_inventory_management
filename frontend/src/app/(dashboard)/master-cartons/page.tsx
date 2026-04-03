'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Boxes } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonTable } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES, PAGE_SIZE } from '@/constants';
import { masterCartonService } from '@/services/masterCarton.service';
import { useApiQuery } from '@/hooks/useApi';
import { keepPreviousData } from '@tanstack/react-query';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';

export default function MasterCartonsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useApiQuery(
    ['master-cartons', String(page), search, statusFilter],
    () =>
      masterCartonService.getAll({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter || undefined,
      }),
    { placeholderData: keepPreviousData }
  );

  return (
    <div>
      <PageHeader
        title="Master Cartons"
        description="Manage master cartons and their child box contents"
        action={
          <Link href={ROUTES.MASTER_CARTONS_CREATE}>
            <Button leftIcon={<Plus className="h-4 w-4" />}>Create Carton</Button>
          </Link>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-brand-border bg-binny-navy-50/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by carton barcode..."
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
                { value: 'CREATED', label: 'Created' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'CLOSED', label: 'Closed' },
                { value: 'DISPATCHED', label: 'Dispatched' },
              ]}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-44"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : !data?.data?.length ? (
          <div className="p-12 text-center">
            <Boxes className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">No master cartons found.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {data.data.map((carton) => (
                <div
                  key={carton.id}
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => router.push(ROUTES.MASTER_CARTON_DETAIL(carton.id))}
                >
                  <div className="flex items-center justify-between mb-1">
                    {carton.article_summary ? (
                      <span className="text-sm font-medium text-brand-text-dark">{carton.article_summary}</span>
                    ) : (
                      <span className="font-mono text-xs text-brand-text-dark">{carton.carton_barcode}</span>
                    )}
                    <StatusBadge status={carton.status} size="sm" />
                  </div>
                  {carton.article_summary && (
                    <p className="text-xs text-brand-text-muted mb-1">
                      {[carton.colour_summary, carton.size_summary].filter(Boolean).join(' | ')}
                      {carton.mrp_summary != null ? ` | ${formatCurrency(carton.mrp_summary)}` : ''}
                    </p>
                  )}
                  {carton.article_summary && (
                    <p className="font-mono text-xs text-brand-text-muted mb-1">{carton.carton_barcode}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-brand-text-muted">
                    <span className="font-semibold text-brand-text-dark">
                      {carton.child_count} / {carton.max_capacity} boxes
                    </span>
                    <span>{formatDateTime(carton.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Carton / Product</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Boxes</TableHeader>
                    <TableHeader>Created</TableHeader>
                    <TableHeader>Closed</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.data.map((carton) => (
                    <TableRow
                      key={carton.id}
                      clickable
                      onClick={() => router.push(ROUTES.MASTER_CARTON_DETAIL(carton.id))}
                    >
                      <TableCell>
                        <div>
                          {carton.article_summary && (
                            <p className="text-sm font-medium text-brand-text-dark">{carton.article_summary}</p>
                          )}
                          {(carton.colour_summary || carton.size_summary) && (
                            <p className="text-xs text-brand-text-muted">
                              {[carton.colour_summary, carton.size_summary].filter(Boolean).join(' | ')}
                              {carton.mrp_summary != null ? ` | ${formatCurrency(carton.mrp_summary)}` : ''}
                            </p>
                          )}
                          <span className="font-mono text-xs text-brand-text-muted">{carton.carton_barcode}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={carton.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{carton.child_count}</span>
                        <span className="text-brand-text-muted"> / {carton.max_capacity}</span>
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs">
                        {formatDateTime(carton.created_at)}
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs">
                        {carton.closed_at ? formatDateTime(carton.closed_at) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

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
