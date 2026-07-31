'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, FlaskConical, BarChart3, Activity, Truck, Package } from 'lucide-react';
import { StatCard } from '@/components/inventory/InventorySummaryCards';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonTable } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES, PAGE_SIZE } from '@/constants';
import { sampleService } from '@/services/sample.service';
import { useApiQuery } from '@/hooks/useApi';
import { keepPreviousData } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { useCan } from '@/hooks/useCan';
import { sampleStatusLabel, sampleStatusVariant } from '@/lib/sampleStatus';

export default function SamplesPage() {
  const router = useRouter();
  const canCreate = useCan('samples:create');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useApiQuery(
    ['samples', String(page), search, statusFilter],
    () =>
      sampleService.getAll({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter || undefined,
      }),
    { placeholderData: keepPreviousData }
  );

  const { data: summary } = useApiQuery(['samples-summary'], () => sampleService.getSummary());

  return (
    <div>
      <PageHeader
        title="Samples"
        description="Manage sample batches sent to dealers, exhibitions, and internal QC"
        action={
          <div className="flex gap-2">
            <Link href={ROUTES.SAMPLES_INVENTORY}>
              <Button variant="outline" leftIcon={<BarChart3 className="h-4 w-4" />}>Stock View</Button>
            </Link>
            {canCreate && (
              <Link href={ROUTES.SAMPLES_CREATE}>
                <Button leftIcon={<Plus className="h-4 w-4" />}>Create Sample</Button>
              </Link>
            )}
          </div>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Samples" value={summary.total} icon={FlaskConical} accent="#2D2A6E" iconColor="text-binny-navy" />
          <StatCard label="Active" value={summary.active} icon={Activity} accent="#16A34A" iconColor="text-green-600" />
          <StatCard label="Dispatched" value={summary.dispatched} icon={Truck} accent="#6B7280" iconColor="text-gray-500" />
          <StatCard label="Boxes Allocated" value={summary.totalBoxes} icon={Package} accent="#2563EB" iconColor="text-blue-600" />
        </div>
      )}

      <Card padding={false}>
        <div className="p-4 border-b border-brand-border bg-binny-navy-50/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by sample barcode or name..."
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
                { value: 'CREATED', label: 'Empty' },
                { value: 'ACTIVE', label: 'Open' },
                { value: 'CLOSED', label: 'Ready to dispatch' },
                { value: 'DISPATCHED', label: 'Sent' },
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
            <FlaskConical className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">No samples found.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {data.data.map((sample) => (
                <div
                  key={sample.id}
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => router.push(ROUTES.SAMPLE_DETAIL(sample.id))}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-brand-text-dark">{sample.name}</span>
                    <StatusBadge
                      status={sample.status}
                      label={sampleStatusLabel(sample.status)}
                      variant={sampleStatusVariant(sample.status)}
                      size="sm"
                    />
                  </div>
                  {(sample.customer_firm_name || sample.recipient_name) && (
                    <p className="text-xs text-brand-text-muted mb-1">
                      {sample.customer_firm_name || sample.recipient_name}
                    </p>
                  )}
                  <p className="font-mono text-xs text-brand-text-muted mb-1">{sample.sample_barcode}</p>
                  <div className="flex items-center gap-3 text-xs text-brand-text-muted">
                    <span className="font-semibold text-brand-text-dark">
                      {sample.child_count} boxes
                    </span>
                    {sample.sample_date && <span>{formatDateTime(sample.sample_date)}</span>}
                    <span>{formatDateTime(sample.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Sample / Recipient</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Boxes</TableHeader>
                    <TableHeader>Sample Date</TableHeader>
                    <TableHeader>Created</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.data.map((sample) => (
                    <TableRow
                      key={sample.id}
                      clickable
                      onClick={() => router.push(ROUTES.SAMPLE_DETAIL(sample.id))}
                    >
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-brand-text-dark">{sample.name}</p>
                          {(sample.customer_firm_name || sample.recipient_name) && (
                            <p className="text-xs text-brand-text-muted">
                              {sample.customer_firm_name || sample.recipient_name}
                            </p>
                          )}
                          <span className="font-mono text-xs text-brand-text-muted">
                            {sample.sample_barcode}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={sample.status}
                          label={sampleStatusLabel(sample.status)}
                          variant={sampleStatusVariant(sample.status)}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{sample.child_count}</span>
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs">
                        {sample.sample_date ? formatDateTime(sample.sample_date) : '-'}
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs">
                        {formatDateTime(sample.created_at)}
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
