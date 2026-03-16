'use client';

import { useState } from 'react';
import { Search, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import { PageSpinner } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { PAGE_SIZE } from '@/constants';
import { dispatchService } from '@/services/dispatch.service';
import { useApiQuery } from '@/hooks/useApi';
import { keepPreviousData } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/utils';
import type { DispatchRecord } from '@/types';

export default function DispatchesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useApiQuery(
    ['dispatches', String(page), search, fromDate, toDate],
    () =>
      dispatchService.getAll({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      }),
    { placeholderData: keepPreviousData }
  );

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const renderDetailRow = (record: DispatchRecord) => (
    <div className="p-3 bg-gray-50 rounded space-y-1 text-sm">
      {record.destination && (
        <div className="flex justify-between">
          <span className="text-brand-text-muted">Destination</span>
          <span>{record.destination}</span>
        </div>
      )}
      {record.transport_details && (
        <div className="flex justify-between">
          <span className="text-brand-text-muted">Transport</span>
          <span>{record.transport_details}</span>
        </div>
      )}
      {record.lr_number && (
        <div className="flex justify-between">
          <span className="text-brand-text-muted">LR Number</span>
          <span className="font-mono">{record.lr_number}</span>
        </div>
      )}
      {record.vehicle_number && (
        <div className="flex justify-between">
          <span className="text-brand-text-muted">Vehicle</span>
          <span>{record.vehicle_number}</span>
        </div>
      )}
      {record.notes && (
        <div className="flex justify-between">
          <span className="text-brand-text-muted">Notes</span>
          <span>{record.notes}</span>
        </div>
      )}
      {record.child_count != null && (
        <div className="flex justify-between">
          <span className="text-brand-text-muted">Child Boxes</span>
          <span>{record.child_count}</span>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Dispatches"
        description="View all dispatch records"
      />

      <Card padding={false}>
        <div className="p-4 border-b border-brand-border">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by destination, LR number, vehicle, barcode..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>
            <div className="flex gap-2">
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
          <div className="p-12">
            <PageSpinner />
          </div>
        ) : !data?.data?.length ? (
          <div className="p-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">No dispatch records found.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {data.data.map((record: DispatchRecord) => (
                <div key={record.id} className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleExpand(record.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs text-brand-text-dark">
                        {record.carton_barcode || record.master_carton_id.slice(0, 8) + '...'}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-brand-text-muted">
                        {record.destination && <span>{record.destination}</span>}
                        {record.vehicle_number && (
                          <>
                            <span>&middot;</span>
                            <span>{record.vehicle_number}</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-brand-text-muted mt-1">
                        {formatDateTime(record.dispatch_date)}
                      </p>
                    </div>
                    {expandedId === record.id ? (
                      <ChevronUp className="h-4 w-4 text-brand-text-muted shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-brand-text-muted shrink-0" />
                    )}
                  </div>
                  {expandedId === record.id && (
                    <div className="mt-3">{renderDetailRow(record)}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Carton Barcode</TableHeader>
                    <TableHeader>Destination</TableHeader>
                    <TableHeader>Vehicle</TableHeader>
                    <TableHeader>LR Number</TableHeader>
                    <TableHeader>Dispatch Date</TableHeader>
                    <TableHeader>Notes</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.data.map((record: DispatchRecord) => (
                    <TableRow key={record.id} clickable onClick={() => toggleExpand(record.id)}>
                      <TableCell>
                        <span className="font-mono text-xs">
                          {record.carton_barcode || record.master_carton_id.slice(0, 8) + '...'}
                        </span>
                      </TableCell>
                      <TableCell>{record.destination || '-'}</TableCell>
                      <TableCell>{record.vehicle_number || '-'}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{record.lr_number || '-'}</span>
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs">
                        {formatDateTime(record.dispatch_date)}
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs max-w-[200px] truncate">
                        {record.notes || '-'}
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
