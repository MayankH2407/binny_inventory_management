'use client';

import Link from 'next/link';
import { Download, Package, Boxes, ArrowRight, AlertCircle } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApi';
import api from '@/services/api';
import StatusBadge from '@/components/ui/StatusBadge';
import InventoryBreadcrumb from '@/components/inventory/InventoryBreadcrumb';
import InventorySummaryCards from '@/components/inventory/InventorySummaryCards';
import { SkeletonCard } from '@/components/ui/Spinner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SizeBreakdownEntry {
  size: string;
  pairs: number;
  box_count: number;
}

interface MasterCartonRow {
  master_carton_id: string;
  carton_barcode: string;
  child_box_count: number;
  pieces: number;
  mrp: number;
  status: string;
  size_breakdown: SizeBreakdownEntry[];
}

interface LooseStockRow {
  child_box_id: string;
  barcode: string;
  pieces: number;
  mrp: number;
  size: string;
}

interface LeafResponse {
  master_cartons: MasterCartonRow[];
  loose_stock: LooseStockRow[];
}

// ─── API helper ───────────────────────────────────────────────────────────────

const PATH_KEYS = ['section', 'category', 'group', 'article', 'colour', 'size_group'] as const;

async function fetchLeaf(decodedValues: string[]): Promise<LeafResponse> {
  const params = new URLSearchParams();
  params.set('level', 'leaf');
  decodedValues.forEach((val, idx) => {
    params.set(`path[${PATH_KEYS[idx]}]`, val);
  });
  const res = await api.get<LeafResponse>('/inventory/breakdown', { params });
  return res.data;
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatSizeBreakdown(sb: SizeBreakdownEntry[]): string {
  return sb.map((e) => `${e.size}×${e.pairs}`).join(', ');
}

function exportCsv(decodedValues: string[], data: LeafResponse) {
  const rows: string[] = [
    ['Type', 'Barcode/ID', 'Size(s)', 'Child Boxes', 'Pieces', 'MRP', 'Status']
      .map(csvCell)
      .join(','),
  ];

  for (const mc of data.master_cartons) {
    rows.push(
      [
        'Master Carton',
        mc.carton_barcode,
        formatSizeBreakdown(mc.size_breakdown),
        mc.child_box_count,
        mc.pieces,
        mc.mrp.toFixed(2),
        mc.status,
      ]
        .map(csvCell)
        .join(',')
    );
  }

  for (const ls of data.loose_stock) {
    rows.push(
      [
        'Loose Box',
        ls.barcode,
        ls.size || '',
        1,
        ls.pieces,
        ls.mrp.toFixed(2),
        'FREE',
      ]
        .map(csvCell)
        .join(',')
    );
  }

  const csvContent = rows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const sluggedParts = decodedValues.map((v) => slugify(v || 'ungrouped'));
  a.href = url;
  a.download = `inventory-${sluggedParts.join('-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Table components ─────────────────────────────────────────────────────────

function MasterCartonsTable({ rows }: { rows: MasterCartonRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-brand-text-muted py-4 px-1">
        No master cartons at this combination.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              Carton Barcode
            </th>
            <th className="text-right py-2.5 px-3 text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              Boxes
            </th>
            <th className="text-right py-2.5 px-3 text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              Pieces
            </th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              Sizes (pairs)
            </th>
            <th className="text-right py-2.5 px-3 text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              MRP
            </th>
            <th className="text-center py-2.5 px-3 text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              Status
            </th>
            <th className="py-2.5 px-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((mc) => (
            <tr
              key={mc.master_carton_id}
              className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors"
            >
              <td className="py-3 px-3 font-mono text-xs text-brand-text-dark">
                {mc.carton_barcode}
              </td>
              <td className="py-3 px-3 text-right tabular-nums text-brand-text-dark">
                {mc.child_box_count}
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-semibold text-brand-text-dark">
                {mc.pieces.toLocaleString('en-IN')}
              </td>
              <td className="py-3 px-3">
                {mc.size_breakdown.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {mc.size_breakdown.map((sb) => (
                      <span
                        key={sb.size}
                        title={`Size ${sb.size}: ${sb.pairs} pair${sb.pairs !== 1 ? 's' : ''} across ${sb.box_count} box${sb.box_count !== 1 ? 'es' : ''}`}
                        className="inline-flex items-baseline gap-1 px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700 rounded font-medium border border-blue-100 tabular-nums"
                      >
                        <span className="font-mono">{sb.size}</span>
                        <span className="text-blue-400">&times;</span>
                        <span>{sb.pairs}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-brand-text-muted">&mdash;</span>
                )}
              </td>
              <td className="py-3 px-3 text-right tabular-nums text-brand-text-dark">
                &#8377;{mc.mrp % 1 === 0 ? mc.mrp.toFixed(0) : mc.mrp.toFixed(2)}
              </td>
              <td className="py-3 px-3 text-center">
                <StatusBadge status={mc.status} size="sm" />
              </td>
              <td className="py-3 px-3 text-right">
                <Link
                  href={`/master-cartons/${mc.master_carton_id}`}
                  className="inline-flex items-center gap-1 text-xs text-binny-navy hover:underline font-medium"
                >
                  View <ArrowRight className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LooseStockTable({ rows }: { rows: LooseStockRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-brand-text-muted py-4 px-1">
        No loose stock.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full min-w-[540px] text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              Barcode
            </th>
            <th className="text-center py-2.5 px-3 text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              Size
            </th>
            <th className="text-right py-2.5 px-3 text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              Pieces
            </th>
            <th className="text-right py-2.5 px-3 text-xs font-semibold text-brand-text-muted uppercase tracking-wide">
              MRP
            </th>
            <th className="py-2.5 px-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((ls) => (
            <tr
              key={ls.child_box_id}
              className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors"
            >
              <td className="py-3 px-3 font-mono text-xs text-brand-text-dark">
                {ls.barcode}
              </td>
              <td className="py-3 px-3 text-center">
                {ls.size ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 text-xs bg-amber-50 text-amber-700 rounded font-medium border border-amber-100 font-mono tabular-nums">
                    {ls.size}
                  </span>
                ) : (
                  <span className="text-xs text-brand-text-muted">&mdash;</span>
                )}
              </td>
              <td className="py-3 px-3 text-right tabular-nums font-semibold text-brand-text-dark">
                {ls.pieces.toLocaleString('en-IN')}
              </td>
              <td className="py-3 px-3 text-right tabular-nums text-brand-text-dark">
                &#8377;{ls.mrp % 1 === 0 ? ls.mrp.toFixed(0) : ls.mrp.toFixed(2)}
              </td>
              <td className="py-3 px-3 text-right">
                <Link
                  href={`/child-boxes?id=${ls.child_box_id}`}
                  className="inline-flex items-center gap-1 text-xs text-binny-navy hover:underline font-medium"
                >
                  View <ArrowRight className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface InventoryLeafTableProps {
  /** URL-encoded path segments (length must be >= 6) */
  rawSegments: string[];
}

export default function InventoryLeafTable({ rawSegments }: InventoryLeafTableProps) {
  const decodedValues = rawSegments.map(decodeURIComponent);

  const { data, isLoading, error } = useApiQuery<LeafResponse>(
    ['inventory-leaf', ...decodedValues],
    () => fetchLeaf(decodedValues)
  );

  if (isLoading) {
    return (
      <>
        <InventoryBreadcrumb pathSegments={rawSegments} />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
        <div className="space-y-3 mt-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <InventoryBreadcrumb pathSegments={rawSegments} />
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-brand-text-muted">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-lg font-medium text-brand-text-dark">Failed to load leaf data</p>
          <p className="text-sm">{(error as Error)?.message || 'An unexpected error occurred.'}</p>
        </div>
      </>
    );
  }

  const bothEmpty =
    data.master_cartons.length === 0 && data.loose_stock.length === 0;

  return (
    <>
      <InventoryBreadcrumb pathSegments={rawSegments} />

      {/* Summary cards */}
      <InventorySummaryCards depth={6} leafData={data} />

      {/* Header row with export button */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-brand-text-muted">
          {data.master_cartons.length} carton{data.master_cartons.length !== 1 ? 's' : ''} &bull;{' '}
          {data.loose_stock.length} loose box{data.loose_stock.length !== 1 ? 'es' : ''}
        </p>
        {!bothEmpty && (
          <button
            onClick={() => exportCsv(decodedValues, data)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 bg-white text-brand-text-dark hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        )}
      </div>

      {/* Both empty */}
      {bothEmpty && (
        <div className="text-center py-16 text-brand-text-muted">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No inventory at this combination.</p>
          <p className="text-sm mt-1 max-w-sm mx-auto">
            There are no master cartons or loose boxes for this section/category/group/article/colour/size combination.
          </p>
        </div>
      )}

      {/* Master Cartons section */}
      {!bothEmpty && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-card mb-6">
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-gray-100">
            <Boxes className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-brand-text-dark">Master Cartons</h2>
            <span className="ml-auto text-xs text-brand-text-muted">
              {data.master_cartons.length}
            </span>
          </div>
          <div className="p-4">
            <MasterCartonsTable rows={data.master_cartons} />
          </div>
        </div>
      )}

      {/* Loose Stock section */}
      {!bothEmpty && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-card">
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-gray-100">
            <Package className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-brand-text-dark">Loose Stock</h2>
            <span className="ml-auto text-xs text-brand-text-muted">
              {data.loose_stock.length}
            </span>
          </div>
          <div className="p-4">
            <LooseStockTable rows={data.loose_stock} />
          </div>
        </div>
      )}
    </>
  );
}
