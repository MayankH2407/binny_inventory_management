'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Search,
  ShoppingCart,
  BarChart3,
  Activity,
  Truck,
  Package,
  Boxes,
  PackageOpen,
  Trash2,
  ScanLine,
  AlertTriangle,
} from 'lucide-react';
import { StatCard } from '@/components/inventory/InventorySummaryCards';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import StatusBadge from '@/components/ui/StatusBadge';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { SkeletonTable } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import HIDScannerInput from '@/components/scanning/HIDScannerInput';
import QRScanner from '@/components/scanning/QRScanner';
import { ROUTES, PAGE_SIZE } from '@/constants';
import { ecommerceService } from '@/services/ecommerce.service';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { keepPreviousData } from '@tanstack/react-query';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { EcommercePoolItem } from '@/types';

type TabId = 'area' | 'history';

const INVALIDATE_KEYS_ON_POOL_CHANGE = [
  ['ecommerce-pool'],
  ['ecommerce-pool-summary'],
  ['ecommerce-stock'],
  ['inventory'],
  ['dashboard-stats'],
  ['master-cartons'],
  ['child-boxes'],
];

export default function EcommercePage() {
  const [activeTab, setActiveTab] = useState<TabId>('area');

  return (
    <div>
      <PageHeader
        title="E-commerce"
        description="Scan stock into the E-commerce Area, then dispatch it from there"
        action={
          <Link href={ROUTES.ECOMMERCE_STOCK}>
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
            { id: 'area', label: 'E-commerce Area' },
            { id: 'history', label: 'History' },
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

      {activeTab === 'area' ? <EcommerceAreaTab /> : <HistoryTab />}
    </div>
  );
}

/* ─────────────────────────── E-commerce Area tab ─────────────────────────── */

function EcommerceAreaTab() {
  const canUpdate = useCan('ecommerce:update');
  const canDelete = useCan('ecommerce:delete');

  const [showScanner, setShowScanner] = useState(false);
  const [fullScreenScan, setFullScreenScan] = useState(false);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<'' | 'BOX' | 'CARTON'>('');

  const [unpackTarget, setUnpackTarget] = useState<EcommercePoolItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EcommercePoolItem | null>(null);

  const { data: summary } = useApiQuery(['ecommerce-pool-summary'], () =>
    ecommerceService.getPoolSummary()
  );

  const { data, isLoading } = useApiQuery(
    ['ecommerce-pool', String(page), search, itemTypeFilter],
    () =>
      ecommerceService.getPool({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        item_type: itemTypeFilter || undefined,
      }),
    { placeholderData: keepPreviousData }
  );

  const { mutate: scanItem, isPending: isScanning } = useApiMutation(
    (barcode: string) => ecommerceService.addToPool(barcode),
    {
      invalidateKeys: INVALIDATE_KEYS_ON_POOL_CHANGE,
      onSuccess: (result) => {
        const message =
          result.item_type === 'CARTON'
            ? `Added carton ${result.barcode} (${result.boxes_added} box${result.boxes_added === 1 ? '' : 'es'}) to the E-commerce Area`
            : `Added box ${result.barcode} to the E-commerce Area`;
        toast.success(message);
      },
    }
  );

  const { mutate: unpackCarton, isPending: isUnpacking } = useApiMutation(
    (mappingId: string) => ecommerceService.unpackPoolCarton(mappingId),
    {
      invalidateKeys: INVALIDATE_KEYS_ON_POOL_CHANGE,
      onSuccess: (result) => {
        toast.success(
          `Carton ${result.carton_barcode} unpacked into ${result.boxes_unpacked} loose box${result.boxes_unpacked === 1 ? '' : 'es'}`
        );
        setUnpackTarget(null);
      },
    }
  );

  const { mutate: removeItem, isPending: isRemoving } = useApiMutation(
    (vars: { item_type: 'BOX' | 'CARTON'; mapping_id: string }) => ecommerceService.removeFromPool(vars),
    {
      invalidateKeys: INVALIDATE_KEYS_ON_POOL_CHANGE,
      onSuccess: (result) => {
        toast.success(
          `${result.item_type === 'CARTON' ? 'Carton' : 'Box'} ${result.barcode} removed from the E-commerce Area`
        );
        setRemoveTarget(null);
      },
    }
  );

  return (
    <div>
      {/* Scan card */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 rounded-lg" style={{ backgroundColor: '#F3F0FF' }}>
            <ScanLine className="h-4 w-4 text-purple-600" />
          </div>
          <h3 className="font-semibold text-brand-text-dark">Scan Into the E-commerce Area</h3>
        </div>

        {canUpdate ? (
          <>
            <HIDScannerInput
              onScan={(code) => scanItem(code)}
              placeholder="Scan a master carton or child box barcode..."
              autoFocus
              disabled={isScanning}
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
                  onScanSuccess={(code) => scanItem(code)}
                  autoStart
                  fullScreen={fullScreenScan}
                  onToggleFullScreen={() => setFullScreenScan(!fullScreenScan)}
                />
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-brand-text-muted">
            You don&apos;t have permission to add items to the E-commerce Area.
          </p>
        )}
      </Card>

      {/* Stat cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Items in Area"
            value={summary.total_items}
            icon={ShoppingCart}
            accent="#2D2A6E"
            iconColor="text-binny-navy"
          />
          <StatCard
            label="Cartons"
            value={summary.carton_items}
            icon={Boxes}
            accent="#7C3AED"
            iconColor="text-purple-600"
          />
          <StatCard
            label="Loose Boxes"
            value={summary.box_items}
            icon={Package}
            accent="#2563EB"
            iconColor="text-blue-600"
          />
          <StatCard
            label="Total Boxes"
            value={summary.total_boxes}
            subtitle={`${summary.total_pairs.toLocaleString('en-IN')} pairs`}
            icon={PackageOpen}
            accent="#16A34A"
            iconColor="text-green-600"
          />
        </div>
      )}

      {/* Pool table */}
      <Card padding={false}>
        <div className="p-4 border-b border-brand-border bg-binny-navy-50/50">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Search by barcode, article, colour..."
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
                { value: '', label: 'All Types' },
                { value: 'BOX', label: 'Loose Boxes' },
                { value: 'CARTON', label: 'Cartons' },
              ]}
              value={itemTypeFilter}
              onChange={(e) => {
                setItemTypeFilter(e.target.value as '' | 'BOX' | 'CARTON');
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
            <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">
              Nothing in the E-commerce Area. Scan a master carton or child box above to move it
              here.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {data.data.map((item) => (
                <PoolMobileCard
                  key={item.mapping_id}
                  item={item}
                  canUpdate={canUpdate}
                  canDelete={canDelete}
                  onUnpack={() => setUnpackTarget(item)}
                  onRemove={() => setRemoveTarget(item)}
                />
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Type</TableHeader>
                    <TableHeader>Barcode</TableHeader>
                    <TableHeader>Product</TableHeader>
                    <TableHeader className="text-right">Boxes</TableHeader>
                    <TableHeader className="text-right">Pairs</TableHeader>
                    <TableHeader>Added</TableHeader>
                    <TableHeader>{''}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.data.map((item) => (
                    <TableRow key={item.mapping_id}>
                      <TableCell>
                        <Badge variant={item.item_type === 'CARTON' ? 'purple' : 'gray'} size="sm">
                          {item.item_type === 'CARTON' ? 'Carton' : 'Box'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{item.barcode}</span>
                        {item.source_carton_barcode && (
                          <p className="text-xs text-brand-text-muted mt-0.5">
                            from {item.source_carton_barcode}
                          </p>
                        )}
                        {!item.source_carton_barcode && item.legacy_record_barcode && (
                          <p className="text-xs text-brand-text-muted mt-0.5">
                            Legacy {item.legacy_record_barcode}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.article_summary && (
                          <p className="text-sm font-medium text-brand-text-dark">
                            {item.article_summary}
                          </p>
                        )}
                        {(item.colour_summary || item.size_summary) && (
                          <p className="text-xs text-brand-text-muted">
                            {[item.colour_summary, item.size_summary].filter(Boolean).join(' | ')}
                            {item.mrp != null ? ` | ${formatCurrency(item.mrp)}` : ''}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{item.box_count}</TableCell>
                      <TableCell className="text-right">{item.pairs}</TableCell>
                      <TableCell className="text-xs text-brand-text-muted">
                        {formatDateTime(item.added_at)}
                        {item.added_by_name && <p>by {item.added_by_name}</p>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-end">
                          {item.item_type === 'CARTON' && canUpdate && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setUnpackTarget(item)}
                              leftIcon={<PackageOpen className="h-3.5 w-3.5" />}
                            >
                              Unpack
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRemoveTarget(item)}
                              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
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

      <p className="text-xs text-brand-text-muted mt-4 text-center">
        To ship these items, go to Dispatch → E-commerce.
      </p>

      {/* Unpack confirmation */}
      <Modal
        isOpen={unpackTarget !== null}
        onClose={() => setUnpackTarget(null)}
        title="Unpack Carton"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnpackTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isUnpacking}
              leftIcon={<PackageOpen className="h-4 w-4" />}
              onClick={() => unpackTarget && unpackCarton(unpackTarget.mapping_id)}
            >
              Confirm Unpack
            </Button>
          </>
        }
      >
        {unpackTarget && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-800">
              Unpack carton <strong className="font-mono">{unpackTarget.barcode}</strong>? Its{' '}
              <strong>{unpackTarget.box_count}</strong> boxes will become {unpackTarget.box_count}{' '}
              separate items in the E-commerce Area, each individually dispatchable. The stock
              stays in e-commerce — nothing returns to main inventory. The carton itself becomes
              empty and available for repacking. This cannot be undone in one step — to reverse it
              you&apos;d have to Remove each box and re-pack them manually.
            </p>
          </div>
        )}
      </Modal>

      {/* Remove confirmation */}
      <Modal
        isOpen={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title="Remove From E-commerce Area"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isRemoving}
              leftIcon={<Trash2 className="h-4 w-4" />}
              onClick={() =>
                removeTarget &&
                removeItem({ item_type: removeTarget.item_type, mapping_id: removeTarget.mapping_id })
              }
            >
              Confirm Remove
            </Button>
          </>
        }
      >
        {removeTarget && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">
              {removeTarget.item_type === 'CARTON' ? (
                <>
                  Remove <strong className="font-mono">{removeTarget.barcode}</strong> from the
                  E-commerce Area? Its <strong>{removeTarget.box_count}</strong> boxes go back to
                  main inventory as available stock.
                </>
              ) : (
                <>
                  Remove <strong className="font-mono">{removeTarget.barcode}</strong> from the
                  E-commerce Area? It goes back to main inventory as a FREE box.
                </>
              )}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function PoolMobileCard({
  item,
  canUpdate,
  canDelete,
  onUnpack,
  onRemove,
}: {
  item: EcommercePoolItem;
  canUpdate: boolean;
  canDelete: boolean;
  onUnpack: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-1">
        <Badge variant={item.item_type === 'CARTON' ? 'purple' : 'gray'} size="sm">
          {item.item_type === 'CARTON' ? 'Carton' : 'Box'}
        </Badge>
        <span className="text-xs text-brand-text-muted">{formatDateTime(item.added_at)}</span>
      </div>
      <p className="font-mono text-xs mb-1">{item.barcode}</p>
      {item.source_carton_barcode && (
        <p className="text-xs text-brand-text-muted mb-1">from {item.source_carton_barcode}</p>
      )}
      {!item.source_carton_barcode && item.legacy_record_barcode && (
        <p className="text-xs text-brand-text-muted mb-1">Legacy {item.legacy_record_barcode}</p>
      )}
      {item.article_summary && <p className="text-sm font-medium">{item.article_summary}</p>}
      <div className="flex gap-3 text-xs text-brand-text-muted mt-1">
        {item.colour_summary && <span>{item.colour_summary}</span>}
        {item.size_summary && <span>{item.size_summary}</span>}
        {item.mrp != null && <span>{formatCurrency(item.mrp)}</span>}
      </div>
      <div className="flex items-center gap-3 mt-2 text-xs text-brand-text-muted">
        <span className="font-semibold text-brand-text-dark">{item.box_count} boxes</span>
        <span>{item.pairs} pairs</span>
      </div>
      {(item.item_type === 'CARTON' && canUpdate) || canDelete ? (
        <div className="flex items-center gap-2 mt-3">
          {item.item_type === 'CARTON' && canUpdate && (
            <Button
              variant="outline"
              size="sm"
              onClick={onUnpack}
              leftIcon={<PackageOpen className="h-3.5 w-3.5" />}
            >
              Unpack
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="sm" onClick={onRemove} leftIcon={<Trash2 className="h-3.5 w-3.5" />}>
              Remove
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────── History tab ─────────────────────────── */

function HistoryTab() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState('');

  const { data, isLoading } = useApiQuery(
    ['ecommerce', String(page), search, statusFilter, marketplaceFilter],
    () =>
      ecommerceService.getAll({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: statusFilter || undefined,
        marketplace: marketplaceFilter || undefined,
      }),
    { placeholderData: keepPreviousData }
  );

  const { data: summary } = useApiQuery(['ecommerce-summary'], () => ecommerceService.getSummary());

  return (
    <div>
      <div className="flex items-start gap-3 p-4 mb-6 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          Read-only history of the previous e-commerce record workflow. New activity lives in the
          E-commerce Area tab.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Records" value={summary.total} icon={ShoppingCart} accent="#2D2A6E" iconColor="text-binny-navy" />
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
                placeholder="Search by barcode, name, or order reference..."
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
            <Input
              placeholder="Marketplace..."
              value={marketplaceFilter}
              onChange={(e) => {
                setMarketplaceFilter(e.target.value);
                setPage(1);
              }}
              className="w-full sm:w-40"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable />
          </div>
        ) : !data?.data?.length ? (
          <div className="p-12 text-center">
            <ShoppingCart className="h-12 w-12 mx-auto mb-3 text-brand-text-muted opacity-40" />
            <p className="text-brand-text-muted">No e-commerce records found.</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="block md:hidden divide-y divide-brand-border">
              {data.data.map((record) => (
                <div
                  key={record.id}
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => router.push(ROUTES.ECOMMERCE_DETAIL(record.id))}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-brand-text-dark truncate pr-2">
                      {record.name}
                    </span>
                    <StatusBadge status={record.status} size="sm" />
                  </div>
                  {record.marketplace && (
                    <p className="text-xs text-brand-text-muted mb-1">{record.marketplace}</p>
                  )}
                  {record.order_reference && (
                    <p className="text-xs text-brand-text-muted mb-1 font-mono truncate">
                      {record.order_reference}
                    </p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-brand-text-muted">
                    <span className="font-semibold text-brand-text-dark">
                      {record.child_count} boxes
                    </span>
                    <span>{formatDateTime(record.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>Record / Marketplace</TableHeader>
                    <TableHeader>Order Ref</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Boxes</TableHeader>
                    <TableHeader>Mapped Date</TableHeader>
                    <TableHeader>Created</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.data.map((record) => (
                    <TableRow
                      key={record.id}
                      clickable
                      onClick={() => router.push(ROUTES.ECOMMERCE_DETAIL(record.id))}
                    >
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-brand-text-dark">{record.name}</p>
                          {record.marketplace && (
                            <p className="text-xs text-brand-text-muted">{record.marketplace}</p>
                          )}
                          <span className="font-mono text-xs text-brand-text-muted">
                            {record.ecommerce_barcode}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {record.order_reference ? (
                          <span className="font-mono text-xs text-brand-text-muted truncate max-w-[140px] block">
                            {record.order_reference}
                          </span>
                        ) : (
                          <span className="text-brand-text-muted">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={record.status} size="sm" />
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold">{record.child_count}</span>
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs">
                        {record.mapped_date ? formatDateTime(record.mapped_date) : '-'}
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs">
                        {formatDateTime(record.created_at)}
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
