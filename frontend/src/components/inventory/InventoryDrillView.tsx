'use client';

import { useApiQuery } from '@/hooks/useApi';
import api from '@/services/api';
import { SkeletonCard } from '@/components/ui/Spinner';
import InventoryCardGrid, {
  type InventoryBreakdownItem,
  type DrillLevel,
} from '@/components/inventory/InventoryCardGrid';
import InventoryBreadcrumb from '@/components/inventory/InventoryBreadcrumb';
import InventorySummaryCards from '@/components/inventory/InventorySummaryCards';
import InventorySearchBar from '@/components/inventory/InventorySearchBar';
import InventoryFilters from '@/components/inventory/InventoryFilters';
import InventoryLeafTable from '@/components/inventory/InventoryLeafTable';
import { AlertCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BreakdownResponse {
  items: InventoryBreakdownItem[];
}

// ─── Level mapping ────────────────────────────────────────────────────────────

/** Path length → API level name */
export const LEVEL_BY_DEPTH: DrillLevel[] = [
  'section',    // 0 segments → show sections
  'category',   // 1 segment  → section chosen, show categories
  'group',      // 2 segments → category chosen, show groups
  'article',    // 3 segments → group chosen, show articles
  'colour',     // 4 segments → article chosen, show colours
  'size_group', // 5 segments → colour chosen, show size groups
];

/** Path keys added progressively as depth increases */
const PATH_KEYS = ['section', 'category', 'group', 'article', 'colour'] as const;

// ─── API helper ───────────────────────────────────────────────────────────────

async function fetchBreakdown(
  level: DrillLevel,
  pathValues: string[]
): Promise<BreakdownResponse> {
  const params = new URLSearchParams();
  params.set('level', level);
  pathValues.forEach((val, idx) => {
    params.set(`path[${PATH_KEYS[idx]}]`, val);
  });

  const res = await api.get<BreakdownResponse>('/inventory/breakdown', { params });
  return res.data;
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-brand-text-muted">
      <AlertCircle className="h-10 w-10 text-red-400" />
      <p className="text-lg font-medium text-brand-text-dark">Failed to load inventory</p>
      <p className="text-sm max-w-sm text-center">{message}</p>
    </div>
  );
}

// ─── Leaf view (level 6) ──────────────────────────────────────────────────────

export function LeafPlaceholder({ rawSegments }: { rawSegments: string[] }) {
  // Note: kept as LeafPlaceholder for backward-compat with the page.tsx import,
  // but now renders the real leaf table.
  return <InventoryLeafTable rawSegments={rawSegments} />;
}

// ─── Drill-down view (levels 0–5) ─────────────────────────────────────────────

interface DrillDownViewProps {
  /** URL-encoded path segments as they appear in the URL */
  rawSegments: string[];
}

export default function DrillDownView({ rawSegments }: DrillDownViewProps) {
  // Decode URL-encoded segments to raw values for the API
  const decodedValues = rawSegments.map(decodeURIComponent);

  const depth = rawSegments.length; // 0..5
  const level = LEVEL_BY_DEPTH[depth];

  const { data, isLoading, error } = useApiQuery<BreakdownResponse>(
    ['inventory-breakdown', level, ...decodedValues],
    () => fetchBreakdown(level, decodedValues)
  );

  // Build the path prefix for card hrefs (all segments are already URL-encoded)
  const pathPrefix =
    rawSegments.length === 0
      ? '/inventory'
      : `/inventory/${rawSegments.join('/')}`;

  return (
    <>
      <InventoryBreadcrumb pathSegments={rawSegments} />

      {/* Summary cards — always shown (root fetches global, mid-levels compute from items) */}
      <InventorySummaryCards
        depth={depth}
        items={data?.items}
      />

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <InventorySearchBar />
        <div className="sm:ml-auto">
          <InventoryFilters />
        </div>
      </div>

      {/* Count line */}
      {!isLoading && data && (
        <p className="text-sm text-brand-text-muted mb-4 px-1">
          {data.items.length} item{data.items.length !== 1 ? 's' : ''} &bull;{' '}
          {data.items
            .reduce((sum, it) => sum + it.pieces, 0)
            .toLocaleString('en-IN')}{' '}
          pieces total
          {(() => {
            const legacyTotal = data.items.reduce(
              (sum, it) => sum + (it.legacy_carton_count ?? 0),
              0
            );
            return legacyTotal > 0 ? (
              <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-xs font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                {legacyTotal.toLocaleString('en-IN')} legacy carton{legacyTotal !== 1 ? 's' : ''}
              </span>
            ) : null;
          })()}
        </p>
      )}

      {isLoading && <LoadingSkeleton />}

      {!isLoading && error && (
        <ErrorState
          message={
            (error as Error).message ||
            'An unexpected error occurred. Please try again.'
          }
        />
      )}

      {!isLoading && data && (
        <InventoryCardGrid
          items={data.items}
          pathPrefix={pathPrefix}
          level={level}
        />
      )}
    </>
  );
}
