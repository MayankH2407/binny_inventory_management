'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, Package, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle, Printer } from 'lucide-react';
import { printChildBoxLabels } from '@/lib/childBoxLabel';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';
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
import { childBoxService, BulkUploadResult, BulkRowError } from '@/services/childBox.service';
import { productService } from '@/services/product.service';
import { useApiQuery } from '@/hooks/useApi';
import { useCan } from '@/hooks/useCan';
import { keepPreviousData } from '@tanstack/react-query';
import { formatDateTime, formatCurrency } from '@/lib/utils';
import type { ChildBoxWithProduct } from '@/types';
import toast from 'react-hot-toast';

type AgingState = 'yellow' | 'red' | null;

function getAgingState(status: string, createdAt: string): AgingState {
  if (status !== 'FREE') return null;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (ageDays >= 180) return 'red';
  if (ageDays >= 90) return 'yellow';
  return null;
}

function getAgeDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
}

const REPRINT_WARN_STATUSES = ['PACKED', 'DISPATCHED'];

export default function ChildBoxesPage() {
  const canCreate = useCan('child_boxes:create');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Track the full selected box objects (keyed by id), NOT just ids, so
  // "Print Selected" can print boxes chosen on ANY page — the previous
  // Set<id> approach only had access to the current page's rows, silently
  // dropping selections from other pages/searches at print time.
  const [selectedBoxes, setSelectedBoxes] = useState<Map<string, ChildBoxWithProduct>>(new Map());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const [reprintWarn, setReprintWarn] = useState<ChildBoxWithProduct[] | null>(null);

  // Bulk upload state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const bulkFileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = useApiQuery(
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
    // Load all active products so the Product filter lists every article, not
    // just the first 200 variant rows (catalog is thousands of rows / dozens of
    // articles — see generate page for the same fix).
    () => productService.getAll({ limit: 100000, is_active: true }),
  );

  const products = productsData?.data ?? [];

  // Indeterminate state for header checkbox (reflects the CURRENT page only)
  useEffect(() => {
    if (!headerCheckboxRef.current || !data?.data?.length) return;
    const allSelected = data.data.every((b: ChildBoxWithProduct) => selectedBoxes.has(b.id));
    const someSelected = data.data.some((b: ChildBoxWithProduct) => selectedBoxes.has(b.id));
    headerCheckboxRef.current.indeterminate = someSelected && !allSelected;
  }, [selectedBoxes, data]);

  // Select-all toggles only the CURRENT page; selections on other pages are
  // preserved so the user can accumulate boxes across pages/searches.
  const toggleSelectAll = () => {
    if (!data?.data?.length) return;
    const pageBoxes = data.data as ChildBoxWithProduct[];
    const allSelected = pageBoxes.every((b) => selectedBoxes.has(b.id));
    setSelectedBoxes((prev) => {
      const next = new Map(prev);
      if (allSelected) pageBoxes.forEach((b) => next.delete(b.id));
      else pageBoxes.forEach((b) => next.set(b.id, b));
      return next;
    });
  };

  const toggleSelectOne = (box: ChildBoxWithProduct) => {
    setSelectedBoxes((prev) => {
      const next = new Map(prev);
      if (next.has(box.id)) next.delete(box.id);
      else next.set(box.id, box);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) return;
    setBulkUploading(true);
    try {
      const result = await childBoxService.bulkUpload(bulkFile);
      setBulkResult(result);
      if (result.created > 0) {
        toast.success(`${result.created} child boxes created`);
        refetch();
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} rows had errors — see details below`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
    } finally {
      setBulkUploading(false);
    }
  };

  const handleDownloadSample = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('binny_token') : null;
    const url = childBoxService.getSampleCsvUrl();
    const a = document.createElement('a');
    fetch(url, { headers: { Authorization: `Bearer ${token || ''}` } })
      .then((r) => r.blob())
      .then((blob) => {
        a.href = URL.createObjectURL(blob);
        a.download = 'child-boxes-bulk-upload-sample.csv';
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error('Failed to download sample file'));
  };

  const handleDownloadCreatedBarcodes = () => {
    if (!bulkResult || bulkResult.createdBarcodes.length === 0) return;
    const csv = ['barcode', ...bulkResult.createdBarcodes].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `child-boxes-created-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doPrintAndLog = (boxes: ChildBoxWithProduct[]) => {
    printChildBoxLabels(boxes);
    void childBoxService.logReprint(boxes.map((b) => b.barcode));
  };

  const requestPrint = (boxes: ChildBoxWithProduct[]) => {
    if (boxes.some((b) => REPRINT_WARN_STATUSES.includes(b.status))) {
      setReprintWarn(boxes);      // show warning, let the user confirm
    } else {
      doPrintAndLog(boxes); // nothing packed/dispatched -> print directly
    }
  };

  const closeBulkModal = () => {
    setShowBulkModal(false);
    setBulkFile(null);
    setBulkResult(null);
    if (bulkFileRef.current) bulkFileRef.current.value = '';
  };

  return (
    <div>
      <PageHeader
        title="Child Boxes"
        description="Manage and track all child boxes in the system"
        action={
          <div className="flex gap-2">
            {selectedBoxes.size > 0 && (
              <>
                <Button
                  variant="secondary"
                  leftIcon={<Printer className="h-4 w-4" />}
                  onClick={() => requestPrint(Array.from(selectedBoxes.values()))}
                >
                  Print Selected ({selectedBoxes.size})
                </Button>
                <Button variant="outline" onClick={() => setSelectedBoxes(new Map())}>
                  Clear
                </Button>
              </>
            )}
            {canCreate && (
              <Button variant="outline" leftIcon={<Upload className="h-4 w-4" />} onClick={() => setShowBulkModal(true)}>
                Bulk Import
              </Button>
            )}
            {canCreate && (
              <Link href={ROUTES.CHILD_BOXES_GENERATE}>
                <Button leftIcon={<Plus className="h-4 w-4" />}>Generate Labels</Button>
              </Link>
            )}
          </div>
        }
      />

      <Card padding={false}>
        <div className="px-4 pt-3 pb-0 flex items-center gap-3 text-xs text-brand-text-muted">
          <span className="font-medium">FREE box aging (Generated boxes excluded):</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-yellow-200 border border-yellow-400" />
            90–179 days
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-200 border border-red-400" />
            180+ days
          </span>
        </div>
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
                { value: 'GENERATED', label: 'Generated' },
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
              {data.data.map((box: ChildBoxWithProduct) => {
                const aging = getAgingState(box.status, box.created_at);
                const ageDays = aging ? getAgeDays(box.created_at) : null;
                return (
                <div
                  key={box.id}
                  className={`p-4 cursor-pointer transition-colors ${
                    aging === 'red' ? 'bg-red-50 hover:bg-red-100'
                      : aging === 'yellow' ? 'bg-yellow-50 hover:bg-yellow-100'
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => toggleExpand(box.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-brand-border text-binny-navy focus:ring-binny-navy/30 flex-shrink-0"
                        checked={selectedBoxes.has(box.id)}
                        onChange={() => toggleSelectOne(box)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="font-mono text-xs text-brand-text-dark">
                        {box.barcode}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusBadge status={box.status} size="sm" />
                      {aging && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          aging === 'red' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {ageDays}d
                        </span>
                      )}
                    </div>
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
                  <div className="flex justify-end mt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={<Printer className="h-4 w-4" />}
                      onClick={(e) => {
                        e.stopPropagation();
                        requestPrint([box]);
                      }}
                    >
                      Print Label
                    </Button>
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
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader className="w-10">
                      <input
                        ref={headerCheckboxRef}
                        type="checkbox"
                        className="h-4 w-4 rounded border-brand-border text-binny-navy focus:ring-binny-navy/30"
                        checked={!!data?.data?.length && data.data.every((b: ChildBoxWithProduct) => selectedBoxes.has(b.id))}
                        onChange={toggleSelectAll}
                      />
                    </TableHeader>
                    <TableHeader>Barcode</TableHeader>
                    <TableHeader>Product</TableHeader>
                    <TableHeader>SKU</TableHeader>
                    <TableHeader>Colour</TableHeader>
                    <TableHeader>Size</TableHeader>
                    <TableHeader>MRP</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Created</TableHeader>
                    <TableHeader>Actions</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.data.map((box: ChildBoxWithProduct) => {
                    const aging = getAgingState(box.status, box.created_at);
                    const ageDays = aging ? getAgeDays(box.created_at) : null;
                    return (
                    <TableRow
                      key={box.id}
                      clickable
                      onClick={() => toggleExpand(box.id)}
                      className={aging === 'red' ? 'bg-red-50 hover:bg-red-100' : aging === 'yellow' ? 'bg-yellow-50 hover:bg-yellow-100' : ''}
                    >
                      <TableCell className="w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-brand-border text-binny-navy focus:ring-binny-navy/30"
                          checked={selectedBoxes.has(box.id)}
                          onChange={() => toggleSelectOne(box)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{box.barcode}</span>
                      </TableCell>
                      <TableCell className="font-medium">{box.article_name}</TableCell>
                      <TableCell>{box.sku}</TableCell>
                      <TableCell>{box.colour}</TableCell>
                      <TableCell>{box.size}</TableCell>
                      <TableCell>{formatCurrency(box.mrp)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={box.status} size="sm" />
                          {aging && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              aging === 'red' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {ageDays}d
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-brand-text-muted text-xs">
                        {formatDateTime(box.created_at)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<Printer className="h-4 w-4" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            requestPrint([box]);
                          }}
                        >
                          Print
                        </Button>
                      </TableCell>
                    </TableRow>
                    );
                  })}
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

      {/* Reprint Warning Modal */}
      <Modal isOpen={!!reprintWarn} onClose={() => setReprintWarn(null)} title="Reprinting packed/dispatched labels">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">
                {(reprintWarn || []).filter((b) => REPRINT_WARN_STATUSES.includes(b.status)).length} of {reprintWarn?.length} label(s) belong to boxes that are already packed or dispatched.
              </p>
              <p className="mt-1">
                Only reprint to replace a <strong>damaged label on the same physical box</strong>. Do not put a reprinted label on a new box &mdash; it will be rejected as &ldquo;already packed&rdquo; when scanned.
              </p>
            </div>
          </div>
          <ul className="max-h-40 overflow-y-auto border border-brand-border rounded-md divide-y divide-gray-100 text-xs">
            {(reprintWarn || []).filter((b) => REPRINT_WARN_STATUSES.includes(b.status)).map((b) => (
              <li key={b.id} className="px-3 py-1.5 flex justify-between">
                <span className="font-mono text-brand-text-dark">{b.barcode}</span>
                <span className="text-brand-text-muted">{b.status}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setReprintWarn(null)}>Cancel</Button>
            <Button
              leftIcon={<Printer className="h-4 w-4" />}
              onClick={() => { if (reprintWarn) doPrintAndLog(reprintWarn); setReprintWarn(null); }}
            >
              Print Anyway
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal isOpen={showBulkModal} onClose={closeBulkModal} title="Bulk Import Child Boxes">
        <div className="space-y-4">
          <p className="text-sm text-brand-text-muted">
            Upload a CSV file listing existing stock — each row creates N child boxes for the given SKU, all in FREE status. Use this for one-time go-live stock import or large stock additions.
          </p>

          {/* Sample download */}
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <FileSpreadsheet className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900">Download sample CSV</p>
              <p className="text-xs text-blue-700">Use this template — list one row per SKU with the count of boxes to generate.</p>
            </div>
            <button
              onClick={handleDownloadSample}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-white border border-blue-200 rounded-md hover:bg-blue-50"
            >
              <Download className="h-3 w-3" /> Download
            </button>
          </div>

          {/* Required columns info */}
          <div className="text-xs text-brand-text-muted">
            <p className="font-medium mb-1">Required columns: sku, count</p>
            <p>Optional column: quantity (pairs per box, default 1)</p>
            <p className="mt-1">Maximum 1000 rows and 5000 total boxes per upload. Boxes are created in FREE status.</p>
          </div>

          {/* File input */}
          {!bulkResult && (
            <>
              <div className="border-2 border-dashed border-brand-border rounded-lg p-6 text-center">
                <Upload className="h-8 w-8 text-brand-text-muted mx-auto mb-2" />
                <input
                  ref={bulkFileRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-brand-text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-binny-navy file:text-white hover:file:bg-binny-navy/90 mx-auto"
                />
                {bulkFile && (
                  <p className="mt-2 text-sm text-brand-text-dark font-medium">{bulkFile.name}</p>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={closeBulkModal}>Cancel</Button>
                <Button
                  onClick={handleBulkUpload}
                  isLoading={bulkUploading}
                  disabled={!bulkFile || bulkUploading}
                  leftIcon={<Upload className="h-4 w-4" />}
                >
                  Upload &amp; Create Boxes
                </Button>
              </div>
            </>
          )}

          {/* Results */}
          {bulkResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <p className="text-sm font-medium text-green-900">
                  {bulkResult.created} child boxes created from {bulkResult.totalRows} rows
                </p>
              </div>

              {bulkResult.errors.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm font-medium">{bulkResult.errors.length} rows failed</p>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-red-200 rounded-lg divide-y divide-red-100">
                    {bulkResult.errors.map((err: BulkRowError, i: number) => (
                      <div key={i} className="px-3 py-2 text-xs">
                        <span className="font-medium text-red-800">Row {err.row}</span>
                        {err.sku && <span className="text-red-600"> ({err.sku})</span>}
                        <span className="text-red-600">: {err.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={closeBulkModal}>Close</Button>
                {bulkResult.createdBarcodes.length > 0 && (
                  <Button
                    variant="outline"
                    onClick={handleDownloadCreatedBarcodes}
                    leftIcon={<Download className="h-4 w-4" />}
                  >
                    Download Created Barcodes
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setBulkResult(null);
                    setBulkFile(null);
                    if (bulkFileRef.current) bulkFileRef.current.value = '';
                  }}
                  leftIcon={<Upload className="h-4 w-4" />}
                >
                  Upload Another File
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
