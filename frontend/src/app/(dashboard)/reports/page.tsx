'use client';

import { useState, useMemo } from 'react';
import { Download, Calendar } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import StatusBadge from '@/components/ui/StatusBadge';
import PageHeader from '@/components/layout/PageHeader';
import { PageSpinner } from '@/components/ui/Spinner';
import { reportService } from '@/services/report.service';
import { useApiQuery } from '@/hooks/useApi';
import { keepPreviousData } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { formatDateTime } from '@/lib/utils';

type TabId = 'stock' | 'cartons' | 'dispatch' | 'daily';

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'stock', label: 'Stock Report' },
  { id: 'cartons', label: 'Carton Inventory' },
  { id: 'dispatch', label: 'Dispatch Report' },
  { id: 'daily', label: 'Daily Activity' },
];

interface ProductWiseRow {
  sku: string;
  article_name: string;
  colour: string;
  size: string;
  total_boxes: number;
  free_boxes: number;
  packed_boxes: number;
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

interface DispatchSummary {
  total_dispatches: number;
  total_cartons: number;
  by_destination: Array<{ destination: string; count: number }>;
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
        dispatched_boxes: acc.dispatched_boxes + row.dispatched_boxes,
        pairs_in_stock: acc.pairs_in_stock + row.pairs_in_stock,
        pairs_dispatched: acc.pairs_dispatched + row.pairs_dispatched,
      }),
      { total_boxes: 0, free_boxes: 0, packed_boxes: 0, dispatched_boxes: 0, pairs_in_stock: 0, pairs_dispatched: 0 }
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
                ? 'border-binny-red text-binny-red'
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
  totals: { total_boxes: number; free_boxes: number; packed_boxes: number; dispatched_boxes: number; pairs_in_stock: number; pairs_dispatched: number } | null;
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
                <TableCell className="text-right font-bold">{totals.dispatched_boxes}</TableCell>
                <TableCell className="text-right font-bold text-purple-600">{totals.pairs_in_stock}</TableCell>
                <TableCell className="text-right font-bold">{totals.pairs_dispatched}</TableCell>
              </TableRow>
            )}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-brand-text-muted py-8">
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
              <p className="text-3xl font-bold text-brand-text-dark">{data.total_cartons}</p>
            </Card>
          </div>

          {data.by_destination && data.by_destination.length > 0 && (
            <Card className="p-6">
              <h3 className="font-semibold text-brand-text-dark mb-4">By Destination</h3>
              <div className="space-y-2">
                {data.by_destination.map((dest, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-brand-text-dark">
                      {dest.destination || 'Unknown'}
                    </span>
                    <span className="text-sm font-bold text-brand-text-dark">{dest.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {(!data.by_destination || data.by_destination.length === 0) && data.total_dispatches === 0 && (
            <p className="text-center text-brand-text-muted py-8">No dispatch data for the selected period</p>
          )}
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
