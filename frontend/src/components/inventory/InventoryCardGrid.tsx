'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronRight, Layers, Tag, Group, Package, Palette, Ruler, LayoutGrid } from 'lucide-react';
import InventoryStockBar from '@/components/inventory/InventoryStockBar';
import { applyStockFilter, type StockFilter } from '@/components/inventory/InventoryFilters';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InventoryBreakdownItem {
  value: string;
  pieces: number;
  child_box_count: number;
  master_carton_count: number;
  loose_child_box_count: number;
  /** Legacy (pre-go-live) sealed cartons — counted in CARTONS, never pieces */
  legacy_carton_count: number;
  /** Size-group breakdown for legacy cartons; present only at the 'group' (article-group) level */
  legacy_size_groups?: { size_group: string; carton_count: number }[];
}

interface InventoryCardGridProps {
  items: InventoryBreakdownItem[];
  /** URL prefix to prepend when building drill-down hrefs, e.g. "/inventory/PU" */
  pathPrefix: string;
  /** The current drill level — used to choose the icon */
  level: DrillLevel;
  /** When true, highlight master carton count as the primary headline number (warehouse channel only) */
  highlightCartons?: boolean;
}

// ─── Level config ─────────────────────────────────────────────────────────────

export type DrillLevel =
  | 'section'
  | 'category'
  | 'group'
  | 'article'
  | 'colour'
  | 'size_group';

const LEVEL_META: Record<
  DrillLevel,
  { label: string; gradient: string; Icon: React.ElementType }
> = {
  section: {
    label: 'Section',
    gradient: 'from-indigo-500 to-purple-600',
    Icon: Layers,
  },
  category: {
    label: 'Category',
    gradient: 'from-sky-500 to-blue-600',
    Icon: LayoutGrid,
  },
  group: {
    label: 'Article Group',
    gradient: 'from-teal-500 to-cyan-600',
    Icon: Group,
  },
  article: {
    label: 'Article',
    gradient: 'from-blue-500 to-cyan-600',
    Icon: Tag,
  },
  colour: {
    label: 'Colour',
    gradient: 'from-emerald-500 to-teal-600',
    Icon: Palette,
  },
  size_group: {
    label: 'Size Group',
    gradient: 'from-amber-500 to-orange-600',
    Icon: Ruler,
  },
};

// ─── Single card ─────────────────────────────────────────────────────────────

interface CardProps {
  item: InventoryBreakdownItem;
  href: string;
  level: DrillLevel;
  highlightCartons?: boolean;
}

function InventoryCard({ item, href, level, highlightCartons }: CardProps) {
  const meta = LEVEL_META[level];
  const { Icon, gradient } = meta;
  const displayName = item.value === '' ? '(Ungrouped)' : item.value;
  const isZero = item.pieces === 0;

  const stats: Array<{ label: string; value: number }> = [
    { label: 'boxes', value: item.child_box_count },
    { label: 'cartons', value: item.master_carton_count },
    { label: 'loose', value: item.loose_child_box_count },
  ].filter((s) => s.value > 0 && !(highlightCartons && s.label === 'cartons'));

  return (
    <Link
      href={href}
      className={`
        group block bg-white rounded-xl shadow-card border border-gray-100
        overflow-hidden transition-all duration-200
        hover:shadow-card-hover hover:-translate-y-0.5 active:scale-[0.99]
        ${isZero ? 'opacity-50' : ''}
      `}
    >
      {/* Card header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`p-2 rounded-lg bg-gradient-to-br ${gradient} text-white shrink-0`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <h3
              className={`font-semibold truncate ${
                isZero ? 'text-brand-text-muted' : 'text-brand-text-dark'
              }`}
            >
              {displayName}
            </h3>
          </div>
          <ChevronRight className="h-4 w-4 text-brand-text-muted shrink-0 mt-0.5 group-hover:text-brand-text-dark transition-colors" />
        </div>
      </div>

      {/* Piece count */}
      <div className="px-4 pb-3">
        {highlightCartons ? (
          <>
            <p
              className={`text-3xl font-bold tabular-nums ${
                isZero ? 'text-gray-400' : 'text-brand-text-dark'
              }`}
            >
              {item.master_carton_count.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-brand-text-muted mt-0.5">
              carton{item.master_carton_count !== 1 ? 's' : ''}
            </p>
            <p className="text-sm font-semibold text-brand-text-muted mt-1 tabular-nums">
              {item.pieces.toLocaleString('en-IN')} pairs
            </p>
          </>
        ) : (
          <>
            <p
              className={`text-3xl font-bold tabular-nums ${
                isZero ? 'text-gray-400' : 'text-brand-text-dark'
              }`}
            >
              {item.pieces.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-brand-text-muted mt-0.5">pieces</p>
          </>
        )}
      </div>

      {/* Legacy carton pill */}
      {item.legacy_carton_count > 0 && (
        <div className="px-4 pb-3">
          <div className="inline-flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-800 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              {item.legacy_carton_count.toLocaleString('en-IN')} legacy carton{item.legacy_carton_count !== 1 ? 's' : ''}
            </span>
            {item.legacy_size_groups && item.legacy_size_groups.length > 0 && (
              <span className="text-xs text-amber-700 pl-1">
                {item.legacy_size_groups
                  .map((sg) => `${sg.size_group}: ${sg.carton_count.toLocaleString('en-IN')}`)
                  .join(' · ')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Stock bar */}
      <InventoryStockBar
        childBoxCount={item.child_box_count}
        looseChildBoxCount={item.loose_child_box_count}
      />

      {/* Footer stats */}
      {stats.length > 0 && (
        <div className="px-4 py-2.5 bg-gray-50/80 border-t border-gray-100 text-xs text-brand-text-muted flex items-center gap-3 flex-wrap">
          {stats.map((s) => (
            <span key={s.label}>
              {s.value.toLocaleString('en-IN')} {s.label}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

export default function InventoryCardGrid({
  items,
  pathPrefix,
  level,
  highlightCartons = false,
}: InventoryCardGridProps) {
  const searchParams = useSearchParams();
  const stockFilter = (searchParams.get('stock_filter') || null) as StockFilter;

  // Apply stock filter, then sort: non-zero pieces first (descending), then zero-stock items
  const filtered = applyStockFilter(items, stockFilter);
  const sorted = [...filtered].sort((a, b) =>
    highlightCartons
      ? b.master_carton_count - a.master_carton_count || b.pieces - a.pieces
      : b.pieces - a.pieces
  );

  if (sorted.length === 0) {
    const isFiltered = stockFilter !== null && items.length > 0;
    return (
      <div className="text-center py-16 text-brand-text-muted">
        <LayoutGrid className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-lg font-medium">
          {isFiltered ? 'No items match the filter' : 'No data found'}
        </p>
        <p className="text-sm mt-1">
          {isFiltered
            ? 'Try removing the stock filter to see all items.'
            : 'No items exist at this level yet.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {sorted.map((item) => {
        const segment = encodeURIComponent(item.value);
        const href = `${pathPrefix}/${segment}`;
        return (
          <InventoryCard
            key={item.value === '' ? '__ungrouped__' : item.value}
            item={item}
            href={href}
            level={level}
            highlightCartons={highlightCartons}
          />
        );
      })}
    </div>
  );
}
