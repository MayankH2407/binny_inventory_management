'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { TrendingUp, AlertTriangle, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StockFilter = 'positive' | 'low' | null;

interface FilterChipProps {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
  colorClass: string;
}

// ─── Filter chip ──────────────────────────────────────────────────────────────

function FilterChip({ label, icon: Icon, active, onClick, colorClass }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        border transition-all duration-150 select-none
        ${active
          ? `${colorClass} border-transparent shadow-sm`
          : 'bg-white text-brand-text-muted border-gray-200 hover:border-gray-300 hover:text-brand-text-dark'
        }
      `}
      aria-pressed={active}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {active && <X className="h-3 w-3 opacity-60" />}
    </button>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * InventoryFilters — URL-state-backed chip row.
 * Reads/writes `?stock_filter=positive|low` in the URL.
 */
export default function InventoryFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const current = (searchParams.get('stock_filter') || null) as StockFilter;

  function toggle(value: 'positive' | 'low') {
    const params = new URLSearchParams(searchParams.toString());
    if (current === value) {
      params.delete('stock_filter');
    } else {
      params.set('stock_filter', value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <FilterChip
        label="Stock > 0"
        icon={TrendingUp}
        active={current === 'positive'}
        onClick={() => toggle('positive')}
        colorClass="bg-blue-500 text-white"
      />
      <FilterChip
        label="Low stock"
        icon={AlertTriangle}
        active={current === 'low'}
        onClick={() => toggle('low')}
        colorClass="bg-amber-500 text-white"
      />
    </div>
  );
}

// ─── Re-export filter logic for use in InventoryCardGrid ─────────────────────

export const LOW_STOCK_THRESHOLD = 10;

export function applyStockFilter<T extends { pieces: number }>(
  items: T[],
  stockFilter: StockFilter
): T[] {
  if (stockFilter === 'positive') {
    return items.filter((it) => it.pieces > 0);
  }
  if (stockFilter === 'low') {
    return items.filter((it) => it.pieces > 0 && it.pieces <= LOW_STOCK_THRESHOLD);
  }
  return items;
}
