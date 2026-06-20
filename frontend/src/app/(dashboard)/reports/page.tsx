'use client';

import { useState, useMemo } from 'react';
import { Download, Calendar } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import StatusBadge from '@/components/ui/StatusBadge';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/layout/PageHeader';
import { PageSpinner } from '@/components/ui/Spinner';
import { reportService } from '@/services/report.service';
import { customerService } from '@/services/customer.service';
import { useApiQuery } from '@/hooks/useApi';
import { keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import type { SampleReportResponse, EcommerceReportResponse } from '@/types';

type TabId = 'stock' | 'cartons' | 'dispatch' | 'daily' | 'samples' | 'ecommerce';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'stock', label: 'Stock Report' },
  { id: 'cartons', label: 'Carton Inventory' },
  { id: 'dispatch', label: 'Dispatch Report' },
  { id: 'daily', label: 'Daily Activity' },
  { id: 'samples', label: 'Samples' },
  { id: 'ecommerce', label: 'E-commerce' },
];

interface ProductWiseRow {
  sku: string;
  article_name: string;
  colour: string;
  size: string;
  total_boxes: number;
  free_boxes: number;
  packed_boxes: number;
  sample_boxes: number;
  ecommerce_boxes: number;
  dispatched_boxes: number;
  pairs_in_stock: number;
  pairs_dispatched: number;
}

interface CartonRow {
  carton_barcode: string;
  status: string;
  child_count: number;
  created_at: string;
  closed_at: string | null;
  dispatched_at: string | null;
  destination: string | null;
}

interface DispatchItemDetail {
  article_name: string;
  colour: string;
  sizes: string;
  mrp: number;
  carton_count: number;
  box_count: number;
}

interface CustomerDispatchGroup {
  customer_id: string | null;
  customer_name: string;
  total_cartons: number;
  total_dispatches: number;
  dispatch_dates: string[];
  destinations: string[];
  items: DispatchItemDetail[];
}

interface DispatchSummary {
  total_dispatches: number;
  total_cartons_dispatched: number;
  by_customer: CustomerDispatchGroup[];
}

interface DailyActivityRow {
  date: string;
  boxes_created: number;
  boxes_packed: number;
  boxes_unpacked: number;
  boxes_dispatched: number;
  cartons_created: number;
  cartons_closed: number;
  cartons_dispatched: number;
}

function getDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  return { today, weekAgo };
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('stock');
  const [cartonStatusFilter, setCartonStatusFilter] = useState('');
  const { today, weekAgo } = useMemo(() => getDefaultDates(), []);
  const [dispatchFromDate, setDispatchFromDate] = useState(weekAgo);
  const [dispatchToDate, setDispatchToDate] = useState(today);
  const [dailyFromDate, setDailyFromDate] = useState(weekAgo);
  const [dailyToDate, setDailyToDate] = useState(today);

  // Sample report filters
  const [sampleFromDate, setSampleFromDate] = useState(weekAgo);
  const [sampleToDate, setSampleToDate] = useState(today);
  const [sampleStatus, setSampleStatus] = useState('');
  const [sampleCustomerId, setSampleCustomerId] = useState('');

  // Ecommerce report filters
  const [ecFromDate, setEcFromDate] = useState(weekAgo);
  const [ecToDate, setEcToDate] = useState(today);
  const [ecStatus, setEcStatus] = useState('');
  const [ecMarketplace, setEcMarketplace] = useState('');

  // Stock Report
  const { data: stockData, isLoading: stockLoading } = useApiQuery<ProductWiseRow[]>(
    ['reports', 'product-wise'],
    () => reportService.getProductWiseReport(),
    { enabled: activeTab === 'stock', placeholderData: keepPreviousData }
  );

  // Carton Inventory
  const { data: cartonData, isLoading: cartonLoading } = useApiQuery<CartonRow[]>(
    ['reports', 'carton-inventory'],
    () => reportService.getCartonInventory(),
    { enabled: activeTab === 'cartons', placeholderData: keepPreviousData }
  );

  // Dispatch Summary
  const { data: dispatchData, isLoading: dispatchLoading } = useApiQuery<DispatchSummary>(
    ['reports', 'dispatch-summary', dispatchFromDate, dispatchToDate],
    () => reportService.getDispatchSummary({ from_date: dispatchFromDate, to_date: dispatchToDate }),
    { enabled: activeTab === 'dispatch', placeholderData: keepPreviousData }
  );

  // Daily Activity
  const { data: dailyData, isLoading: dailyLoading } = useApiQuery<DailyActivityRow[]>(
    ['reports', 'daily-activity', dailyFromDate, dailyToDate],
    () => reportService.getDailyActivity({ from_date: dailyFromDate, to_date: dailyToDate }),
    { enabled: activeTab === 'daily', placeholderData: keepPreviousData }
  );

  // Sample Report
  const { data: sampleData, isLoading: sampleLoading } = useApiQuery<SampleReportResponse>(
    ['reports', 'samples', sampleFromDate, sampleToDate, sampleStatus, sampleCustomerId],
    () => reportService.getSampleReport({
      from: sampleFromDate || undefined,
      to: sampleToDate || undefined,
      status: sampleStatus || undefined,
      customer_id: sampleCustomerId || undefined,
    }),
    { enabled: activeTab === 'samples', placeholderData: keepPreviousData }
  );

  // Ecommerce Report
  const { data: ecData, isLoading: ecLoading } = useApiQuery<EcommerceReportResponse>(
    ['reports', 'ecommerce', ecFromDate, ecToDate, ecStatus, ecMarketplace],
    () => reportService.getEcommerceReport({
      from: ecFromDate || undefined,
      to: ecToDate || undefined,
      status: ecStatus || undefined,
      marketplace: ecMarketplace || undefined,
    }),
    { enabled: activeTab === 'ecommerce', placeholderData: keepPreviousData }
  );

  // Customers for sample report filter
  const { data: customersData } = useApiQuery(
    ['customers-for-reports'],
    // Load all active customers (not just the first 200) so none are hidden.
    () => customerService.getAll({ limit: 100000, is_active: true }),
    { enabled: activeTab === 'samples' }
  );
  const customers = customersData?.data ?? [];

  const handleExport = async (endpoint: string, filename: string, params?: Record<string, string>) => {
    try {
      const blob = await reportService.exportCSV(endpoint, params);
      const blobObj = new Blob([blob], { type: 'text/csv' });
      const downloadUrl = window.URL.createObjectURL(blobObj);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
      toast.success('Report exported');
    } catch {
      toast.error('Export failed');
    }
  };

  const filteredCartons = useMemo(() => {
    if (!cartonData) return [];
    if (!cartonStatusFilter) return cartonData;
    return cartonData.filter((c) => c.status === cartonStatusFilter);
  }, [cartonData, cartonStatusFilter]);

  const stockTotals = useMemo(() => {
    if (!stockData) return null;
    return stockData.reduce(
      (acc, row) => ({
        total_boxes: acc.total_boxes + row.total_boxes,
        free_boxes: acc.free_boxes + row.free_boxes,
        packed_boxes: acc.packed_boxes + row.packed_boxes,
        sample_boxes: acc.sample_boxes + row.sample_boxes,
        ecommerce_boxes: acc.ecommerce_boxes + row.ecommerce_boxes,
        dispatched_boxes: acc.dispatched_boxes + row.dispatched_boxes,
        pairs_in_stock: acc.pairs_in_stock + row.pairs_in_stock,
        pairs_dispatched: acc.pairs_dispatched + row.pairs_dispatched,
      }),
      { total_boxes: 0, free_boxes: 0, packed_boxes: 0, sample_boxes: 0, ecommerce_boxes: 0, dispatched_boxes: 0, pairs_in_stock: 0, pairs_dispatched: 0 }
    );
  }, [stockData]);

  const dailyTotals = useMemo(() => {
    if (!dailyData) return null;
    return dailyData.reduce(
      (acc, row) => ({
        boxes_created: acc.boxes_created + row.boxes_created,
        boxes_packed: acc.boxes_packed + row.boxes_packed,
        boxes_unpacked: acc.boxes_unpacked + row.boxes_unpacked,
        boxes_dispatched: acc.boxes_dispatched + row.boxes_dispatched,
        cartons_created: acc.cartons_created + row.cartons_created,
        cartons_closed: acc.cartons_closed + row.cartons_closed,
        cartons_dispatched: acc.cartons_dispatched + row.cartons_dispatched,
      }),
      { boxes_created: 0, boxes_packed: 0, boxes_unpacked: 0, boxes_dispatched: 0, cartons_created: 0, cartons_closed: 0, cartons_dispatched: 0 }
    );
  }, [dailyData]);

  const renderExportButton = () => {
    switch (activeTab) {
      case 'stock':
        return (
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() => handleExport('/reports/inventory-summary/export', `stock-report-${today}.csv`)}
          >
            Export CSV
          </Button>
        );
      case 'cartons':
        return (
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() =>
              handleExport(
                '/reports/carton-inventory/export',
                `carton-inventory-${today}.csv`,
                cartonStatusFilter ? { status: cartonStatusFilter } : undefined
              )
            }
          >
            Export CSV
          </Button>
        );
      case 'dispatch':
        return (
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() =>
              handleExport('/reports/dispatch-summary/export', `dispatch-report-${today}.csv`, {
                from_date: dispatchFromDate,
                to_date: dispatchToDate,
              })
            }
          >
            Export CSV
          </Button>
        );
      case 'daily':
        return (
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={() =>
              handleExport('/reports/daily-activity/export', `daily-activity-${today}.csv`, {
                from_date: dailyFromDate,
                to_date: dailyToDate,
              })
            }
          >
            Export CSV
          </Button>
        );
      case 'samples':
        return (
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={async () => {
              try {
                const blob = await reportService.exportSampleReportCsv({
                  from: sampleFromDate || undefined,
                  to: sampleToDate || undefined,
                  status: sampleStatus || undefined,
                  customer_id: sampleCustomerId || undefined,
                });
                const blobObj = new Blob([blob], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blobObj);
                const a = document.createElement('a');
                a.href = url;
                a.download = `samples-report-${today}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                toast.success('Report exported');
              } catch {
                toast.error('Export failed');
              }
            }}
          >
            Export CSV
          </Button>
        );
      case 'ecommerce':
        return (
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={async () => {
              try {
                const blob = await reportService.exportEcommerceReportCsv({
                  from: ecFromDate || undefined,
                  to: ecToDate || undefined,
                  status: ecStatus || undefined,
                  marketplace: ecMarketplace || undefined,
                });
                const blobObj = new Blob([blob], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blobObj);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ecommerce-report-${today}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                toast.success('Report exported');
              } catch {
                toast.error('Export failed');
              }
            }}
          >
            Export CSV
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        title="Reports"
        description="View inventory reports and export data"
        action={renderExportButton()}
      />

      {/* Tabs */}
      <div className="flex border-b border-brand-border mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-binny-navy text-binny-navy'
                : 'border-transparent text-brand-text-muted hover:text-brand-text-dark'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'stock' && (
        <StockTab data={stockData ?? []} isLoading={stockLoading} totals={stockTotals} />
      )}
      {activeTab === 'cartons' && (
        <CartonTab
          data={filteredCartons}
          isLoading={cartonLoading}
          statusFilter={cartonStatusFilter}
          onStatusFilterChange={setCartonStatusFilter}
        />
      )}
      {activeTab === 'dispatch' && (
        <DispatchTab
          data={dispatchData ?? null}
          isLoading={dispatchLoading}
          fromDate={dispatchFromDate}
          toDate={dispatchToDate}
          onFromDateChange={setDispatchFromDate}
          onToDateChange={setDispatchToDate}
        />
      )}
      {activeTab === 'daily' && (
        <DailyTab
          data={dailyData ?? []}
          isLoading={dailyLoading}
          totals={dailyTotals}
          fromDate={dailyFromDate}
          toDate={dailyToDate}
          onFromDateChange={setDailyFromDate}
          onToDateChange={setDailyToDate}
        />
      )}
      {activeTab === 'samples' && (
        <SamplesTab
          data={sampleData ?? null}
          isLoading={sampleLoading}
          fromDate={sampleFromDate}
          toDate={sampleToDate}
          status={sampleStatus}
          customerId={sampleCustomerId}
          customers={customers}
          onFromDateChange={setSampleFromDate}
          onToDateChange={setSampleToDate}
          onStatusChange={setSampleStatus}
          onCustomerChange={setSampleCustomerId}
        />
      )}
      {activeTab === 'ecommerce' && (
        <EcommerceTab
          data={ecData ?? null}
          isLoading={ecLoading}
          fromDate={ecFromDate}
          toDate={ecToDate}
          status={ecStatus}
          marketplace={ecMarketplace}
          onFromDateChange={setEcFromDate}
          onToDateChange={setEcToDate}
          onStatusChange={setEcStatus}
          onMarketplaceChange={setEcMarketplace}
        />
      )}
    </div>
  );
}

/* ─── Stock Tab ─── */
function StockTab({
  data,
  isLoading,
  totals,
}: {
  data: ProductWiseRow[];
  isLoading: boolean;
  totals: { total_boxes: number; free_boxes: number; packed_boxes: number; sample_boxes: number; ecommerce_boxes: number; dispatched_boxes: number; pairs_in_stock: number; pairs_dispatched: number } | null;
}) {
  if (isLoading) return <PageSpinner />;

  return (
    <>
      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {data.map((row, idx) => (
          <Card key={idx} className="p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="font-semibold text-brand-text-dark text-sm">{row.sku}</p>
                <p className="text-xs text-brand-text-muted">{row.article_name} - {row.colour} - {row.size}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-brand-text-muted">Total:</span> <span className="font-semibold">{row.total_boxes}</span></div>
              <div><span className="text-brand-text-muted">Free:</span> <span className="font-semibold text-green-600">{row.free_boxes}</span></div>
              <div><span className="text-brand-text-muted">Packed:</span> <span className="font-semibold text-blue-600">{row.packed_boxes}</span></div>
              <div><span className="text-brand-text-muted">Dispatched:</span> <span className="font-semibold">{row.dispatched_boxes}</span></div>
              <div><span className="text-brand-text-muted">Pairs (Stock):</span> <span className="font-semibold text-purple-600">{row.pairs_in_stock}</span></div>
              <div><span className="text-brand-text-muted">Pairs (Sent):</span> <span className="font-semibold">{row.pairs_dispatched}</span></div>
            </div>
          </Card>
        ))}
        {data.length === 0 && (
          <p className="text-center text-brand-text-muted py-8">No stock data available</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>SKU</TableHeader>
              <TableHeader>Article</TableHeader>
              <TableHeader>Colour</TableHeader>
              <TableHeader>Size</TableHeader>
              <TableHeader className="text-right">Total Boxes</TableHeader>
              <TableHeader className="text-right">Free</TableHeader>
              <TableHeader className="text-right">Packed</TableHeader>
              <TableHeader className="text-right">Sample</TableHeader>
              <TableHeader className="text-right">E-commerce</TableHeader>
              <TableHeader className="text-right">Dispatched</TableHeader>
              <TableHeader className="text-right">Pairs in Stock</TableHeader>
              <TableHeader className="text-right">Pairs Dispatched</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-medium">{row.sku}</TableCell>
                <TableCell>{row.article_name}</TableCell>
                <TableCell>{row.colour}</TableCell>
                <TableCell>{row.size}</TableCell>
                <TableCell className="text-right">{row.total_boxes}</TableCell>
                <TableCell className="text-right text-green-600 font-medium">{row.free_boxes}</TableCell>
                <TableCell className="text-right text-blue-600 font-medium">{row.packed_boxes}</TableCell>
                <TableCell className="text-right text-orange-600 font-medium">{row.sample_boxes}</TableCell>
                <TableCell className="text-right text-violet-600 font-medium">{row.ecommerce_boxes}</TableCell>
                <TableCell className="text-right">{row.dispatched_boxes}</TableCell>
                <TableCell className="text-right text-purple-600 font-medium">{row.pairs_in_stock}</TableCell>
                <TableCell className="text-right">{row.pairs_dispatched}</TableCell>
              </TableRow>
            ))}
            {totals && data.length > 0 && (
              <TableRow>
                <TableCell className="font-bold" colSpan={4}>Totals</TableCell>
                <TableCell className="text-right font-bold">{totals.total_boxes}</TableCell>
                <TableCell className="text-right font-bold text-green-600">{totals.free_boxes}</TableCell>
                <TableCell className="text-right font-bold text-blue-600">{totals.packed_boxes}</TableCell>
                <TableCell className="text-right font-bold text-orange-600">{totals.sample_boxes}</TableCell>
                <TableCell className="text-right font-bold text-violet-600">{totals.ecommerce_boxes}</TableCell>
                <TableCell className="text-right font-bold">{totals.dispatched_boxes}</TableCell>
                <TableCell className="text-right font-bold text-purple-600">{totals.pairs_in_stock}</TableCell>
                <TableCell className="text-right font-bold">{totals.pairs_dispatched}</TableCell>
              </TableRow>
            )}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-brand-text-muted py-8">
                  No stock data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/* ─── Carton Tab ─── */
function CartonTab({
  data,
  isLoading,
  statusFilter,
  onStatusFilterChange,
}: {
  data: CartonRow[];
  isLoading: boolean;
  statusFilter: string;
  onStatusFilterChange: (val: string) => void;
}) {
  if (isLoading) return <PageSpinner />;

  return (
    <>
      <div className="mb-4 max-w-xs">
        <Select
          label="Filter by Status"
          placeholder="All statuses"
          options={[
            { value: '', label: 'All Statuses' },
            { value: 'CREATED', label: 'Created' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'CLOSED', label: 'Closed' },
            { value: 'DISPATCHED', label: 'Dispatched' },
          ]}
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
        />
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {data.map((row, idx) => (
          <Card key={idx} className="p-4">
            <div className="flex justify-between items-start mb-2">
              <p className="font-mono font-semibold text-brand-text-dark text-sm">{row.carton_barcode}</p>
              <StatusBadge status={row.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-brand-text-muted">Boxes:</span> <span className="font-semibold">{row.child_count}</span></div>
              <div><span className="text-brand-text-muted">Created:</span> <span className="font-semibold">{formatDateTime(row.created_at)}</span></div>
              {row.closed_at && <div><span className="text-brand-text-muted">Closed:</span> <span className="font-semibold">{formatDateTime(row.closed_at)}</span></div>}
              {row.dispatched_at && <div><span className="text-brand-text-muted">Dispatched:</span> <span className="font-semibold">{formatDateTime(row.dispatched_at)}</span></div>}
              {row.destination && <div className="col-span-2"><span className="text-brand-text-muted">Destination:</span> <span className="font-semibold">{row.destination}</span></div>}
            </div>
          </Card>
        ))}
        {data.length === 0 && (
          <p className="text-center text-brand-text-muted py-8">No carton data available</p>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Carton Barcode</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader className="text-right">Boxes</TableHeader>
              <TableHeader>Created</TableHeader>
              <TableHeader>Closed</TableHeader>
              <TableHeader>Dispatched</TableHeader>
              <TableHeader>Destination</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-mono font-medium">{row.carton_barcode}</TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell className="text-right">{row.child_count}</TableCell>
                <TableCell>{formatDateTime(row.created_at)}</TableCell>
                <TableCell>{row.closed_at ? formatDateTime(row.closed_at) : '-'}</TableCell>
                <TableCell>{row.dispatched_at ? formatDateTime(row.dispatched_at) : '-'}</TableCell>
                <TableCell>{row.destination ?? '-'}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-brand-text-muted py-8">
                  No carton data available
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

/* ─── Dispatch Tab ─── */
function DispatchTab({
  data,
  isLoading,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
}: {
  data: DispatchSummary | null;
  isLoading: boolean;
  fromDate: string;
  toDate: string;
  onFromDateChange: (val: string) => void;
  onToDateChange: (val: string) => void;
}) {
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  return (
    <>
      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            label="From Date"
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            leftIcon={<Calendar className="h-4 w-4" />}
          />
          <Input
            label="To Date"
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            leftIcon={<Calendar className="h-4 w-4" />}
          />
        </div>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <Card className="p-5">
              <p className="text-sm text-brand-text-muted mb-1">Total Dispatches</p>
              <p className="text-3xl font-bold text-brand-text-dark">{data.total_dispatches}</p>
            </Card>
            <Card className="p-5">
              <p className="text-sm text-brand-text-muted mb-1">Total Cartons Dispatched</p>
              <p className="text-3xl font-bold text-brand-text-dark">{data.total_cartons_dispatched}</p>
            </Card>
          </div>

          {data.by_customer && data.by_customer.length > 0 ? (
            <div className="space-y-4">
              <h3 className="font-semibold text-brand-text-dark">By Customer</h3>
              {data.by_customer.map((group, idx) => {
                const key = group.customer_id ?? `walk-in-${idx}`;
                const isExpanded = expandedCustomer === key;
                return (
                  <Card key={key} className="overflow-hidden">
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedCustomer(isExpanded ? null : key)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-brand-text-dark">{group.customer_name}</p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-brand-text-muted">
                          <span>{group.total_cartons} carton{group.total_cartons !== 1 ? 's' : ''}</span>
                          {group.destinations.length > 0 && (
                            <span>to {group.destinations.join(', ')}</span>
                          )}
                          <span>
                            {group.dispatch_dates.length === 1
                              ? group.dispatch_dates[0]
                              : `${group.dispatch_dates[0]} — ${group.dispatch_dates[group.dispatch_dates.length - 1]}`}
                          </span>
                        </div>
                      </div>
                      <span className="text-2xl font-bold text-brand-text-dark shrink-0 ml-4">
                        {group.total_cartons}
                      </span>
                    </div>

                    {isExpanded && group.items.length > 0 && (
                      <div className="border-t border-brand-border">
                        {/* Mobile view */}
                        <div className="lg:hidden divide-y divide-brand-border">
                          {group.items.map((item, iIdx) => (
                            <div key={iIdx} className="p-3 text-sm">
                              <p className="font-medium text-brand-text-dark">{item.article_name}</p>
                              <div className="grid grid-cols-2 gap-1 mt-1 text-xs text-brand-text-muted">
                                <span>Colour: {item.colour}</span>
                                <span>Sizes: {item.sizes}</span>
                                <span>MRP: {formatCurrency(item.mrp)}</span>
                                <span>{item.carton_count} carton{item.carton_count !== 1 ? 's' : ''} / {item.box_count} box{item.box_count !== 1 ? 'es' : ''}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {/* Desktop view */}
                        <div className="hidden lg:block">
                          <Table>
                            <TableHead>
                              <TableRow>
                                <TableHeader>Article</TableHeader>
                                <TableHeader>Colour</TableHeader>
                                <TableHeader>Sizes</TableHeader>
                                <TableHeader className="text-right">MRP</TableHeader>
                                <TableHeader className="text-right">Cartons</TableHeader>
                                <TableHeader className="text-right">Boxes</TableHeader>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {group.items.map((item, iIdx) => (
                                <TableRow key={iIdx}>
                                  <TableCell className="font-medium">{item.article_name}</TableCell>
                                  <TableCell>{item.colour}</TableCell>
                                  <TableCell>{item.sizes}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(item.mrp)}</TableCell>
                                  <TableCell className="text-right">{item.carton_count}</TableCell>
                                  <TableCell className="text-right">{item.box_count}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : data.total_dispatches === 0 ? (
            <p className="text-center text-brand-text-muted py-8">No dispatch data for the selected period</p>
          ) : null}
        </>
      ) : (
        <p className="text-center text-brand-text-muted py-8">No dispatch data available</p>
      )}
    </>
  );
}

/* ─── Daily Activity Tab ─── */
function DailyTab({
  data,
  isLoading,
  totals,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
}: {
  data: DailyActivityRow[];
  isLoading: boolean;
  totals: {
    boxes_created: number;
    boxes_packed: number;
    boxes_unpacked: number;
    boxes_dispatched: number;
    cartons_created: number;
    cartons_closed: number;
    cartons_dispatched: number;
  } | null;
  fromDate: string;
  toDate: string;
  onFromDateChange: (val: string) => void;
  onToDateChange: (val: string) => void;
}) {
  return (
    <>
      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <Input
            label="From Date"
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            leftIcon={<Calendar className="h-4 w-4" />}
          />
          <Input
            label="To Date"
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            leftIcon={<Calendar className="h-4 w-4" />}
          />
        </div>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {data.map((row, idx) => (
              <Card key={idx} className="p-4">
                <p className="font-semibold text-brand-text-dark text-sm mb-2">{row.date}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-brand-text-muted">Boxes Created:</span> <span className="font-semibold">{row.boxes_created}</span></div>
                  <div><span className="text-brand-text-muted">Packed:</span> <span className="font-semibold">{row.boxes_packed}</span></div>
                  <div><span className="text-brand-text-muted">Unpacked:</span> <span className="font-semibold">{row.boxes_unpacked}</span></div>
                  <div><span className="text-brand-text-muted">Dispatched:</span> <span className="font-semibold">{row.boxes_dispatched}</span></div>
                  <div><span className="text-brand-text-muted">Cartons Created:</span> <span className="font-semibold">{row.cartons_created}</span></div>
                  <div><span className="text-brand-text-muted">Closed:</span> <span className="font-semibold">{row.cartons_closed}</span></div>
                  <div><span className="text-brand-text-muted">Cartons Dispatched:</span> <span className="font-semibold">{row.cartons_dispatched}</span></div>
                </div>
              </Card>
            ))}
            {data.length === 0 && (
              <p className="text-center text-brand-text-muted py-8">No activity data for the selected period</p>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Date</TableHeader>
                  <TableHeader className="text-right">Boxes Created</TableHeader>
                  <TableHeader className="text-right">Packed</TableHeader>
                  <TableHeader className="text-right">Unpacked</TableHeader>
                  <TableHeader className="text-right">Dispatched</TableHeader>
                  <TableHeader className="text-right">Cartons Created</TableHeader>
                  <TableHeader className="text-right">Closed</TableHeader>
                  <TableHeader className="text-right">Cartons Dispatched</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{row.date}</TableCell>
                    <TableCell className="text-right">{row.boxes_created}</TableCell>
                    <TableCell className="text-right">{row.boxes_packed}</TableCell>
                    <TableCell className="text-right">{row.boxes_unpacked}</TableCell>
                    <TableCell className="text-right">{row.boxes_dispatched}</TableCell>
                    <TableCell className="text-right">{row.cartons_created}</TableCell>
                    <TableCell className="text-right">{row.cartons_closed}</TableCell>
                    <TableCell className="text-right">{row.cartons_dispatched}</TableCell>
                  </TableRow>
                ))}
                {totals && data.length > 0 && (
                  <TableRow>
                    <TableCell className="font-bold">Totals</TableCell>
                    <TableCell className="text-right font-bold">{totals.boxes_created}</TableCell>
                    <TableCell className="text-right font-bold">{totals.boxes_packed}</TableCell>
                    <TableCell className="text-right font-bold">{totals.boxes_unpacked}</TableCell>
                    <TableCell className="text-right font-bold">{totals.boxes_dispatched}</TableCell>
                    <TableCell className="text-right font-bold">{totals.cartons_created}</TableCell>
                    <TableCell className="text-right font-bold">{totals.cartons_closed}</TableCell>
                    <TableCell className="text-right font-bold">{totals.cartons_dispatched}</TableCell>
                  </TableRow>
                )}
                {data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-brand-text-muted py-8">
                      No activity data for the selected period
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}

/* ─── Samples Tab ─── */
function SamplesTab({
  data,
  isLoading,
  fromDate,
  toDate,
  status,
  customerId,
  customers,
  onFromDateChange,
  onToDateChange,
  onStatusChange,
  onCustomerChange,
}: {
  data: SampleReportResponse | null;
  isLoading: boolean;
  fromDate: string;
  toDate: string;
  status: string;
  customerId: string;
  customers: Array<{ id: string; firm_name: string }>;
  onFromDateChange: (v: string) => void;
  onToDateChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onCustomerChange: (v: string) => void;
}) {
  return (
    <>
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <Input
            label="From Date"
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            leftIcon={<Calendar className="h-4 w-4" />}
          />
          <Input
            label="To Date"
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            leftIcon={<Calendar className="h-4 w-4" />}
          />
          <Select
            label="Status"
            placeholder="All statuses"
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'CREATED', label: 'Created' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'CLOSED', label: 'Closed' },
              { value: 'DISPATCHED', label: 'Dispatched' },
            ]}
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
          />
          <Select
            label="Customer"
            placeholder="All customers"
            options={[
              { value: '', label: 'All Customers' },
              ...customers.map((c) => ({ value: c.id, label: c.firm_name })),
            ]}
            value={customerId}
            onChange={(e) => onCustomerChange(e.target.value)}
          />
        </div>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <Card className="p-4">
              <p className="text-xs text-brand-text-muted mb-1">Total</p>
              <p className="text-2xl font-bold text-brand-text-dark">{data.summary.total}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-brand-text-muted mb-1">Total Pairs</p>
              <p className="text-2xl font-bold text-brand-text-dark">{data.summary.total_pairs}</p>
            </Card>
            {Object.entries(data.summary.by_status).map(([s, count]) => (
              <Card key={s} className="p-4">
                <p className="text-xs text-brand-text-muted mb-1">{s}</p>
                <p className="text-2xl font-bold text-brand-text-dark">{count}</p>
              </Card>
            ))}
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {data.rows.map((row) => (
              <Card key={row.id} className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-brand-text-dark text-sm">{row.name}</p>
                    <p className="text-xs font-mono text-brand-text-muted">{row.sample_barcode}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {row.recipient && <div className="col-span-2"><span className="text-brand-text-muted">Recipient:</span> {row.recipient}</div>}
                  <div><span className="text-brand-text-muted">Boxes:</span> {row.child_count}</div>
                  {row.sample_date && <div><span className="text-brand-text-muted">Date:</span> {row.sample_date}</div>}
                  {row.dispatched_at && <div className="col-span-2"><span className="text-brand-text-muted">Dispatched:</span> {formatDateTime(row.dispatched_at)}</div>}
                </div>
              </Card>
            ))}
            {data.rows.length === 0 && (
              <p className="text-center text-brand-text-muted py-8">No samples data for the selected filters</p>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Barcode</TableHeader>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Recipient</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="text-right">Boxes</TableHeader>
                  <TableHeader>Sample Date</TableHeader>
                  <TableHeader>Created</TableHeader>
                  <TableHeader>Dispatched</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.sample_barcode}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.recipient ?? '-'}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="text-right">{row.child_count}</TableCell>
                    <TableCell>{row.sample_date ?? '-'}</TableCell>
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>{row.dispatched_at ? formatDateTime(row.dispatched_at) : '-'}</TableCell>
                  </TableRow>
                ))}
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-brand-text-muted py-8">
                      No samples data for the selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <p className="text-center text-brand-text-muted py-8">No samples data available</p>
      )}
    </>
  );
}

/* ─── E-commerce Tab ─── */
function EcommerceTab({
  data,
  isLoading,
  fromDate,
  toDate,
  status,
  marketplace,
  onFromDateChange,
  onToDateChange,
  onStatusChange,
  onMarketplaceChange,
}: {
  data: EcommerceReportResponse | null;
  isLoading: boolean;
  fromDate: string;
  toDate: string;
  status: string;
  marketplace: string;
  onFromDateChange: (v: string) => void;
  onToDateChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onMarketplaceChange: (v: string) => void;
}) {
  return (
    <>
      <Card className="p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <Input
            label="From Date"
            type="date"
            value={fromDate}
            onChange={(e) => onFromDateChange(e.target.value)}
            leftIcon={<Calendar className="h-4 w-4" />}
          />
          <Input
            label="To Date"
            type="date"
            value={toDate}
            onChange={(e) => onToDateChange(e.target.value)}
            leftIcon={<Calendar className="h-4 w-4" />}
          />
          <Select
            label="Status"
            placeholder="All statuses"
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'CREATED', label: 'Created' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'CLOSED', label: 'Closed' },
              { value: 'DISPATCHED', label: 'Dispatched' },
            ]}
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
          />
          <Input
            label="Marketplace"
            placeholder="e.g., Amazon, Flipkart..."
            value={marketplace}
            onChange={(e) => onMarketplaceChange(e.target.value)}
          />
        </div>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <Card className="p-4">
              <p className="text-xs text-brand-text-muted mb-1">Total</p>
              <p className="text-2xl font-bold text-brand-text-dark">{data.summary.total}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-brand-text-muted mb-1">Total Pairs</p>
              <p className="text-2xl font-bold text-brand-text-dark">{data.summary.total_pairs}</p>
            </Card>
            {Object.entries(data.summary.by_status).map(([s, count]) => (
              <Card key={s} className="p-4">
                <p className="text-xs text-brand-text-muted mb-1">{s}</p>
                <p className="text-2xl font-bold text-brand-text-dark">{count}</p>
              </Card>
            ))}
          </div>

          {/* By marketplace */}
          {data.summary.by_marketplace.length > 0 && (
            <Card className="p-4 mb-6">
              <p className="text-sm font-semibold text-brand-text-dark mb-3">By Marketplace</p>
              <div className="flex flex-wrap gap-2">
                {data.summary.by_marketplace.map((mp) => (
                  <div key={mp.marketplace} className="flex items-center gap-2">
                    <Badge variant="purple" size="sm">{mp.marketplace}</Badge>
                    <span className="text-xs text-brand-text-muted">{mp.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Mobile cards */}
          <div className="space-y-3 lg:hidden">
            {data.rows.map((row) => (
              <Card key={row.id} className="p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-brand-text-dark text-sm">{row.name}</p>
                    <p className="text-xs font-mono text-brand-text-muted">{row.ecommerce_barcode}</p>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="grid grid-cols-2 gap-1 text-xs">
                  {row.marketplace && <div><span className="text-brand-text-muted">Marketplace:</span> {row.marketplace}</div>}
                  {row.order_reference && <div><span className="text-brand-text-muted">Order:</span> {row.order_reference}</div>}
                  {row.listing_sku && <div><span className="text-brand-text-muted">SKU:</span> {row.listing_sku}</div>}
                  <div><span className="text-brand-text-muted">Boxes:</span> {row.child_count}</div>
                  {row.mapped_date && <div><span className="text-brand-text-muted">Mapped:</span> {row.mapped_date}</div>}
                  {row.dispatched_at && <div className="col-span-2"><span className="text-brand-text-muted">Dispatched:</span> {formatDateTime(row.dispatched_at)}</div>}
                </div>
              </Card>
            ))}
            {data.rows.length === 0 && (
              <p className="text-center text-brand-text-muted py-8">No e-commerce data for the selected filters</p>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden lg:block">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Barcode</TableHeader>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Marketplace</TableHeader>
                  <TableHeader>Order Ref</TableHeader>
                  <TableHeader>Listing SKU</TableHeader>
                  <TableHeader>Status</TableHeader>
                  <TableHeader className="text-right">Boxes</TableHeader>
                  <TableHeader>Mapped Date</TableHeader>
                  <TableHeader>Created</TableHeader>
                  <TableHeader>Dispatched</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.ecommerce_barcode}</TableCell>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.marketplace ?? '-'}</TableCell>
                    <TableCell>{row.order_reference ?? '-'}</TableCell>
                    <TableCell>{row.listing_sku ?? '-'}</TableCell>
                    <TableCell><StatusBadge status={row.status} /></TableCell>
                    <TableCell className="text-right">{row.child_count}</TableCell>
                    <TableCell>{row.mapped_date ?? '-'}</TableCell>
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>{row.dispatched_at ? formatDateTime(row.dispatched_at) : '-'}</TableCell>
                  </TableRow>
                ))}
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-brand-text-muted py-8">
                      No e-commerce data for the selected filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      ) : (
        <p className="text-center text-brand-text-muted py-8">No e-commerce data available</p>
      )}
    </>
  );
}
