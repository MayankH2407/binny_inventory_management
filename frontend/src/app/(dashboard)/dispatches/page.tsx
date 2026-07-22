'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, ClipboardList, ChevronDown, ChevronUp, ChevronRight, Truck, User, Package, FlaskConical, ShoppingCart, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SkeletonTable } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { PAGE_SIZE, ROUTES } from '@/constants';
import { dispatchService } from '@/services/dispatch.service';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import { useApiQuery } from '@/hooks/useApi';
import { keepPreviousData } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/utils';
import type { DispatchRecord, DispatchSourceType } from '@/types';

interface CustomerGroup {
  customerName: string;
  customerId: string | null;
  records: DispatchRecord[];
  latestDate: string;
  totalCartons: number;
  totalChildBoxes: number;
  destinations: string[];
  fullyReturned: number;
  partiallyReturned: number;
}

function SourceTypeBadge({ sourceType, sourceLabel }: { sourceType?: DispatchSourceType; sourceLabel?: string | null }) {
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

export default function DispatchesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>('');
  const [returnStatusFilter, setReturnStatusFilter] = useState<string>('');
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  const { data, isLoading } = useApiQuery(
    ['dispatches', String(page), search, fromDate, toDate, returnStatusFilter],
    () =>
      dispatchService.getAll({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
        return_status: (returnStatusFilter || undefined) as 'none' | 'partial' | 'full' | undefined,
      }),
    { placeholderData: keepPreviousData }
  );

  // Group dispatch records by customer, after client-side source_type filter
  const customerGroups = useMemo(() => {
    if (!data?.data?.length) return [];
    const records = (data.data as DispatchRecord[]).filter((r) => {
      if (!sourceTypeFilter) return true;
      const st = r.source_type ?? 'master_carton';
      return st === sourceTypeFilter;
    });

    const groupMap = new Map<string, CustomerGroup>();
    for (const record of records) {
      const key = record.customer_id || 'no-customer';
      const existing = groupMap.get(key);
      if (existing) {
        existing.records.push(record);
        existing.totalCartons += 1;
        existing.totalChildBoxes += record.child_count ?? 0;
        if (record.dispatch_date > existing.latestDate) {
          existing.latestDate = record.dispatch_date;
        }
        if (record.destination && !existing.destinations.includes(record.destination)) {
          existing.destinations.push(record.destination);
        }
        if (record.return_status === 'full') existing.fullyReturned += 1;
        if (record.return_status === 'partial') existing.partiallyReturned += 1;
      } else {
        groupMap.set(key, {
          customerName: record.customer_firm_name || 'Walk-in / No Customer',
          customerId: record.customer_id,
          records: [record],
          latestDate: record.dispatch_date,
          totalCartons: 1,
          totalChildBoxes: record.child_count ?? 0,
          destinations: record.destination ? [record.destination] : [],
          fullyReturned: record.return_status === 'full' ? 1 : 0,
          partiallyReturned: record.return_status === 'partial' ? 1 : 0,
        });
      }
    }

    return Array.from(groupMap.values()).sort(
      (a, b) => new Date(b.latestDate).getTime() - new Date(a.latestDate).getTime()
    );
  }, [data, sourceTypeFilter]);

  const toggleCustomer = (key: string) => {
    setExpandedCustomer((prev) => (prev === key ? null : key));
  };

  const [isExporting, setIsExporting] = useState(false);

  // Download the itemized dispatch-details CSV honouring the current From/To
  // date filters (leaving them blank exports all dispatches).
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await dispatchService.exportCsv({
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `dispatch-report-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Dispatch report exported');
    } catch {
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Dispatches"
        description="View dispatch records grouped by customer"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={handleExport}
              isLoading={isExporting}
            >
              Export CSV
            </Button>
            <Link href={ROUTES.DISPATCH}>
              <Button leftIcon={<Truck className="h-4 w-4" />}>Dispatch Carton</Button>
            </Link>
          </div>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-brand-border bg-binny-navy-50/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by customer, destination, LR number, vehicle, barcode..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Input
                type="date"
                placeholder="From"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setPage(1);
                }}
                className="w-36"
              />
              <Input
                type="date"
                placeholder="To"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setPage(1);
                }}
                className="w-36"
              />
              <div className="w-44">
                <Select
                  placeholder="All source types"
                  options={[
                    { value: '', label: 'All Source Types' },
                    { value: 'master_carton', label: 'Master Carton' },
                    { value: 'sample', label: 'Sample' },
                    { value: 'ecommerce', label: 'E-commerce' },
                  ]}
                  value={sourceTypeFilter}
                  onChange={(e) => {
                    setSourceTypeFilter(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <div className="w-44">
                <Select
                  placeholder="All Returns"
                  options={[
                    { value: '', label: 'All Returns' },
                    { value: 'none', label: 'Not Returned' },
                    { value: 'partial', label: 'Partially Returned' },
                    { value: 'full', label: 'Fully Returned' },
                  ]}
                  value={returnStatusFilter}
                  onChange={(e) => {
                    setReturnStatusFilter(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : customerGroups.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">No dispatch records found.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-brand-border">
              {customerGroups.map((group) => {
                const groupKey = group.customerId || 'no-customer';
                const isExpanded = expandedCustomer === groupKey;

                return (
                  <div key={groupKey}>
                    {/* Customer header row */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => toggleCustomer(groupKey)}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: '#EEEDF7' }}
                        >
                          <User className="h-5 w-5" style={{ color: '#2D2A6E' }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-brand-text-dark">
                            {group.customerName}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            <span className="text-xs text-brand-text-muted">
                              {group.totalCartons} dispatch{group.totalCartons !== 1 ? 'es' : ''}
                            </span>
                            <span className="text-xs text-brand-text-muted">
                              {group.totalChildBoxes} boxes
                            </span>
                            {group.destinations.length > 0 && (
                              <span className="text-xs text-brand-text-muted">
                                {group.destinations.join(', ')}
                              </span>
                            )}
                            <span className="text-xs text-brand-text-muted">
                              Latest: {formatDateTime(group.latestDate)}
                            </span>
                            {(group.fullyReturned > 0 || group.partiallyReturned > 0) && (
                              <span className="text-xs font-medium text-amber-600">
                                {[
                                  group.fullyReturned > 0
                                    ? `${group.fullyReturned} fully returned`
                                    : null,
                                  group.partiallyReturned > 0
                                    ? `${group.partiallyReturned} partial`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-brand-text-muted shrink-0 ml-2" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-brand-text-muted shrink-0 ml-2" />
                      )}
                    </div>

                    {/* Expanded: individual dispatch records */}
                    {isExpanded && (
                      <div className="bg-gray-50 px-4 pb-4">
                        <div className="space-y-3">
                          {group.records.map((record) => (
                            <div
                              key={record.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => router.push(ROUTES.DISPATCH_DETAIL(record.id))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  router.push(ROUTES.DISPATCH_DETAIL(record.id));
                                }
                              }}
                              className="bg-white rounded-lg border border-brand-border p-4 cursor-pointer hover:border-binny-navy/40 hover:shadow-sm transition-all"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  {/* Source info */}
                                  <div className="flex items-center gap-2 mb-1.5">
                                    {sourceIcon(record.source_type)}
                                    <SourceTypeBadge
                                      sourceType={record.source_type}
                                      sourceLabel={record.source_label ?? record.carton_barcode ?? (record.master_carton_id ? record.master_carton_id.slice(0, 8) + '...' : undefined)}
                                    />
                                    {record.child_count != null && (
                                      <span className="text-xs text-brand-text-muted">
                                        ({record.child_count} boxes)
                                      </span>
                                    )}
                                    <ReturnStatusBadge returnStatus={record.return_status} />
                                  </div>
                                  {record.return_status && record.return_status !== 'none' && (
                                    <p className="text-xs text-amber-600 font-medium mb-1.5">
                                      {record.returned_box_count} of {record.total_box_count} boxes returned
                                    </p>
                                  )}

                                  {/* Product details */}
                                  {record.article_summary && (
                                    <p className="text-sm font-medium text-brand-text-dark">
                                      {record.article_summary}
                                    </p>
                                  )}
                                  {(record.colour_summary || record.size_summary) && (
                                    <p className="text-xs text-brand-text-muted">
                                      {[record.colour_summary, record.size_summary].filter(Boolean).join(' | ')}
                                      {record.mrp_summary != null ? ` | ${formatCurrency(record.mrp_summary)}` : ''}
                                    </p>
                                  )}

                                  {/* Dispatch details */}
                                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-brand-text-muted">
                                    {record.destination && (
                                      <span>Destination: {record.destination}</span>
                                    )}
                                    {record.vehicle_number && (
                                      <span>Vehicle: {record.vehicle_number}</span>
                                    )}
                                    {record.lr_number && (
                                      <span>LR: <span className="font-mono">{record.lr_number}</span></span>
                                    )}
                                    {record.transport_details && (
                                      <span>Transport: {record.transport_details}</span>
                                    )}
                                  </div>
                                  {record.notes && (
                                    <p className="text-xs text-brand-text-muted mt-1 italic">
                                      {record.notes}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0 flex items-center gap-1">
                                  <p className="text-xs text-brand-text-muted">
                                    {formatDateTime(record.dispatch_date)}
                                  </p>
                                  <ChevronRight className="h-4 w-4 text-brand-text-muted" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {data && data.totalPages > 1 && (
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
