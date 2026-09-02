'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  FlaskConical,
  BarChart3,
  Plus,
  Package,
  PackageOpen,
  Truck,
  ScanLine,
} from 'lucide-react';
import { StatCard } from '@/components/inventory/InventorySummaryCards';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonTable } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import QRScanner from '@/components/scanning/QRScanner';
import { ROUTES, PAGE_SIZE } from '@/constants';
import { sampleService } from '@/services/sample.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { keepPreviousData } from '@tanstack/react-query';
import { formatDateTime } from '@/lib/utils';
import { sampleStatusLabel, sampleStatusVariant } from '@/lib/sampleStatus';

type TabId = 'area' | 'sent';

export default function SamplesPage() {
  const [activeTab, setActiveTab] = useState<TabId>('area');

  return (
    <div>
      <PageHeader
        title="Samples"
        description="Scan stock into a sample bag, then dispatch it — per shoe if needed"
        action={
          <Link href={ROUTES.SAMPLES_INVENTORY}>
            <Button variant="outline" leftIcon={<BarChart3 className="h-4 w-4" />}>
              Stock View
            </Button>
          </Link>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-brand-border mb-6 overflow-x-auto">
        {(
          [
            { id: 'area', label: 'Samples Area' },
            { id: 'sent', label: 'Sent' },
          ] as Array<{ id: TabId; label: string }>
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
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

      {activeTab === 'area' ? <SamplesAreaTab /> : <SentTab />}
    </div>
  );
}

/* ─────────────────────────── Samples Area tab ─────────────────────────── */

function SamplesAreaTab() {
  const router = useRouter();
  const canCreate = useCan('samples:create');

  const [showScanner, setShowScanner] = useState(false);
  const [fullScreenScan, setFullScreenScan] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data: summary } = useApiQuery(['samples-summary'], () => sampleService.getSummary());

  const { data, isLoading } = useApiQuery(
    ['samples', 'OPEN', String(page), search],
    () => sampleService.getAll({ page, limit: PAGE_SIZE, search: search || undefined, state: 'OPEN' }),
    { placeholderData: keepPreviousData }
  );

  // Finds an existing sample and navigates to it — a warehouse holds many
  // concurrent sample bags, so this scanner doesn't "add" anything (unlike
  // the E-commerce Area's single global pool).
  const { mutate: findSample, isPending: isFinding } = useApiMutation(
    (barcode: string) => sampleService.getByBarcode(barcode),
    {
      onSuccess: (sample) => router.push(ROUTES.SAMPLE_DETAIL(sample.id)),
      errorMessage: 'No sample found with that barcode',
    }
  );

  const { mutate: createSample, isPending: isCreating } = useApiMutation(
    () => sampleService.create(),
    {
      invalidateKeys: [['samples'], ['samples-summary']],
      onSuccess: (sample) => router.push(ROUTES.SAMPLE_DETAIL(sample.id)),
    }
  );

  return (
    <div>
      {/* Find / New card */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg" style={{ backgroundColor: '#F3F0FF' }}>
              <ScanLine className="h-4 w-4 text-purple-600" />
            </div>
            <h3 className="font-semibold text-brand-text-dark">Find a Sample</h3>
          </div>
          {canCreate && (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              isLoading={isCreating}
              onClick={() => createSample()}
            >
              New Sample
            </Button>
          )}
        </div>

        <HIDScannerInput
          onScan={(code) => findSample(code)}
          placeholder="Scan a sample barcode to open it..."
          autoFocus
          disabled={isFinding}
        />
        <div className="mt-4 pt-4 border-t border-brand-border">
          <Button
            variant={showScanner ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowScanner(!showScanner)}
            leftIcon={<ScanLine className="h-4 w-4" />}
          >
            {showScanner ? 'Hide Camera' : 'Use Camera Instead'}
          </Button>
        </div>
        {showScanner && (
          <div className="mt-4">
            <QRScanner
              onScanSuccess={(code) => findSample(code)}
              autoStart
              fullScreen={fullScreenScan}
              onToggleFullScreen={() => setFullScreenScan(!fullScreenScan)}
            />
          </div>
        )}
      </Card>

      {/* Stat cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Open Samples" value={summary.open_records} icon={FlaskConical} accent="#2D2A6E" iconColor="text-binny-navy" />
          <StatCard label="Empty" value={summary.empty_records} icon={Package} accent="#6B7280" iconColor="text-gray-500" />
          <StatCard label="Sent" value={summary.dispatched_records} icon={Truck} accent="#2563EB" iconColor="text-blue-600" />
          <StatCard label="Open Boxes" value={summary.open_boxes} icon={PackageOpen} accent="#16A34A" iconColor="text-green-600" />
        </div>
      )}

      {/* List */}
      <Card padding={false}>
        <div className="p-4 border-b border-brand-border bg-binny-navy-50/50">
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

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : !data?.data?.length ? (
          <div className="p-12 text-center">
            <FlaskConical className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">
              No samples in progress. Click New Sample above to start one.
            </p>
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
                    <span className="text-sm font-medium text-brand-text-dark">
                      {sample.name || sample.sample_barcode}
                    </span>
                    <StatusBadge
                      status={sample.state ?? 'EMPTY'}
                      label={sampleStatusLabel(sample.state ?? 'EMPTY')}
                      variant={sampleStatusVariant(sample.state ?? 'EMPTY')}
                      size="sm"
                    />
                  </div>
                  {sample.article_summary && (
                    <p className="text-xs text-brand-text-muted mb-1">{sample.article_summary}</p>
                  )}
                  <p className="font-mono text-xs text-brand-text-muted mb-1">{sample.sample_barcode}</p>
                  <div className="flex items-center gap-3 text-xs text-brand-text-muted">
                    <span className="font-semibold text-brand-text-dark">
                      {sample.open_box_count ?? 0} box{(sample.open_box_count ?? 0) === 1 ? '' : 'es'}
                    </span>
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
                    <TableHeader>Sample</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Product</TableHeader>
                    <TableHeader className="text-right">Boxes</TableHeader>
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
                          <p className="text-sm font-medium text-brand-text-dark">
                            {sample.name || '(unnamed)'}
                          </p>
                          <span className="font-mono text-xs text-brand-text-muted">
                            {sample.sample_barcode}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={sample.state ?? 'EMPTY'}
                          label={sampleStatusLabel(sample.state ?? 'EMPTY')}
                          variant={sampleStatusVariant(sample.state ?? 'EMPTY')}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell>
                        {sample.article_summary && (
                          <p className="text-sm font-medium text-brand-text-dark">{sample.article_summary}</p>
                        )}
                        {(sample.colour_summary || sample.size_summary) && (
                          <p className="text-xs text-brand-text-muted">
                            {[sample.colour_summary, sample.size_summary].filter(Boolean).join(' | ')}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold">{sample.open_box_count ?? 0}</span>
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
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
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

/* ─────────────────────────── Sent tab ─────────────────────────── */

function SentTab() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useApiQuery(
    ['samples', 'DISPATCHED', String(page), search],
    () => sampleService.getAll({ page, limit: PAGE_SIZE, search: search || undefined, state: 'DISPATCHED' }),
    { placeholderData: keepPreviousData }
  );

  return (
    <div>
      <Card padding={false}>
        <div className="p-4 border-b border-brand-border bg-binny-navy-50/50">
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

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : !data?.data?.length ? (
          <div className="p-12 text-center">
            <Truck className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">No fully-sent samples yet.</p>
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
                    <span className="text-sm font-medium text-brand-text-dark">
                      {sample.name || sample.sample_barcode}
                    </span>
                    <StatusBadge status="DISPATCHED" label="Sent" variant="blue" size="sm" />
                  </div>
                  <p className="font-mono text-xs text-brand-text-muted mb-1">{sample.sample_barcode}</p>
                  <div className="flex items-center gap-3 text-xs text-brand-text-muted">
                    <span className="font-semibold text-brand-text-dark">
                      {sample.shipped_box_count ?? 0} box{(sample.shipped_box_count ?? 0) === 1 ? '' : 'es'} sent
                    </span>
                    {sample.last_dispatch_date && <span>{formatDateTime(sample.last_dispatch_date)}</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Sample</TableHeader>
                    <TableHeader className="text-right">Boxes Sent</TableHeader>
                    <TableHeader>Last Dispatch</TableHeader>
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
                          <p className="text-sm font-medium text-brand-text-dark">
                            {sample.name || '(unnamed)'}
                          </p>
                          <span className="font-mono text-xs text-brand-text-muted">
                            {sample.sample_barcode}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold">{sample.shipped_box_count ?? 0}</span>
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs">
                        {sample.last_dispatch_date ? formatDateTime(sample.last_dispatch_date) : '-'}
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
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
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
