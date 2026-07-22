'use client';

import { useState } from 'react';
import { Search, Undo2, Download, PackageOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SkeletonTable } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { PAGE_SIZE, ROUTES } from '@/constants';
import { returnsService } from '@/services/returns.service';
import { useApiQuery } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { keepPreviousData } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/utils';

export default function ReturnsPage() {
  const canCreate = useCan('returns:create');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const { data, isLoading } = useApiQuery(
    ['returns', String(page), search, fromDate, toDate],
    () =>
      returnsService.getAll({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      }),
    { placeholderData: keepPreviousData }
  );

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const blob = await returnsService.exportCsv({
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      });
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const a = document.createElement('a');
      const today = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `returns-report-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Returns report exported');
    } catch {
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Returns"
        description="Returned stock brought back to inventory"
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
            {canCreate && (
              <Link href={ROUTES.RETURNS_CREATE}>
                <Button leftIcon={<Undo2 className="h-4 w-4" />}>New Return</Button>
              </Link>
            )}
          </div>
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-brand-border bg-binny-navy-50/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by customer, notes, barcode..."
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
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : !data?.data?.length ? (
          <div className="p-12 text-center">
            <PackageOpen className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">No return records found.</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-brand-border">
              {data.data.map((record) => (
                <Link
                  key={record.id}
                  href={ROUTES.RETURN_DETAIL(record.id)}
                  className="block p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge variant={record.dispatch_record_id ? 'blue' : 'gray'} size="sm">
                          {record.dispatch_record_id ? 'Against Dispatch' : 'Blind Scan-in'}
                        </Badge>
                        {record.source_label && (
                          <span className="text-xs font-mono text-brand-text-muted">
                            {record.source_label}
                          </span>
                        )}
                        {record.item_count != null && (
                          <span className="text-xs text-brand-text-muted">
                            {record.item_count} item{record.item_count !== 1 ? 's' : ''}
                            {record.box_count != null ? ` (${record.box_count} boxes)` : ''}
                          </span>
                        )}
                      </div>

                      <p className="text-sm font-semibold text-brand-text-dark">
                        {record.customer_firm_name || 'Blind / No Customer'}
                      </p>

                      {record.article_summary && (
                        <p className="text-sm text-brand-text-dark mt-0.5">
                          {record.article_summary}
                        </p>
                      )}
                      {(record.colour_summary || record.size_summary || record.pairs != null) && (
                        <p className="text-xs text-brand-text-muted">
                          {[record.colour_summary, record.size_summary].filter(Boolean).join(' | ')}
                          {record.pairs != null ? ` | ${record.pairs} pairs` : ''}
                        </p>
                      )}

                      {record.notes && (
                        <p className="text-xs text-brand-text-muted mt-1 italic">{record.notes}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-brand-text-muted">
                        {formatDateTime(record.return_date)}
                      </p>
                      {record.returned_by_name && (
                        <p className="text-xs text-brand-text-muted mt-0.5">
                          by {record.returned_by_name}
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
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
