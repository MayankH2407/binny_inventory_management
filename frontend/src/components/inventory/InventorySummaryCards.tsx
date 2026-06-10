'use client';

import { Package, Boxes, ShoppingBag, Truck, LayoutGrid, PackageOpen } from 'lucide-react';
import { useApiQuery } from '@/hooks/useApi';
import api from '@/services/api';
import type { InventoryBreakdownItem } from './InventoryCardGrid';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockSummary {
  totalProducts: number;
  totalPairsInStock: number;
  totalPairsDispatched: number;
  totalChildBoxes: number;
  totalCartons: number;
  sections: number;
  articles: number;
}

interface LeafData {
  master_cartons: Array<{ pieces: number }>;
  loose_stock: Array<{ pieces: number }>;
}

interface InventorySummaryCardsProps {
  /** 0 = root, 1-5 = mid-level, 6 = leaf */
  depth: number;
  /** Non-leaf items (depths 1-5) */
  items?: InventoryBreakdownItem[];
  /** Leaf data (depth 6) */
  leafData?: LeafData;
}

// ─── Stat card sub-component ──────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  accent: string;
  iconColor: string;
  subtitle?: string;
}

function StatCard({ label, value, icon: Icon, accent, iconColor, subtitle }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-card p-4 flex items-start gap-3">
      <div
        className="p-2.5 rounded-lg shrink-0"
        style={{ background: `linear-gradient(135deg, ${accent}22, ${accent}0a)` }}
      >
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-brand-text-muted font-medium truncate">{label}</p>
        <p
          className="text-2xl font-bold text-brand-text-dark mt-0.5 tabular-nums"
          style={{ fontFeatureSettings: "'tnum'" }}
        >
          {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
        </p>
        {subtitle && (
          <p className="text-xs text-brand-text-muted mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// ─── Root-level (depth 0): fetch from /inventory/stock/summary ────────────────

function RootSummaryCards() {
  const { data, isLoading } = useApiQuery<StockSummary>(
    ['inventory-stock-summary'],
    async () => {
      const res = await api.get<StockSummary>('/inventory/stock/summary');
      return res.data;
    }
  );

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-card p-4 h-[88px] animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-2/3 mb-3" />
            <div className="h-7 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  const cards: StatCardProps[] = [
    {
      label: 'Total Products',
      value: data.totalProducts,
      icon: LayoutGrid,
      accent: '#2D2A6E',
      iconColor: 'text-binny-navy',
    },
    {
      label: 'Pairs In Stock',
      value: data.totalPairsInStock,
      icon: ShoppingBag,
      accent: '#16A34A',
      iconColor: 'text-green-600',
    },
    {
      label: 'Pairs Dispatched',
      value: data.totalPairsDispatched,
      icon: Truck,
      accent: '#6B7280',
      iconColor: 'text-gray-500',
    },
    {
      label: 'Master Cartons',
      value: data.totalCartons,
      icon: Boxes,
      accent: '#2563EB',
      iconColor: 'text-blue-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}

// ─── Mid-level (depths 1-5): computed from items ──────────────────────────────

function MidSummaryCards({ items }: { items: InventoryBreakdownItem[] }) {
  const totalPieces = items.reduce((s, it) => s + it.pieces, 0);
  const totalBoxes = items.reduce((s, it) => s + it.child_box_count, 0);
  const totalCartons = items.reduce((s, it) => s + it.master_carton_count, 0);
  const totalLoose = items.reduce((s, it) => s + it.loose_child_box_count, 0);

  const cards: StatCardProps[] = [
    {
      label: 'Total Pieces',
      value: totalPieces,
      icon: ShoppingBag,
      accent: '#2D2A6E',
      iconColor: 'text-binny-navy',
    },
    {
      label: 'Total Boxes',
      value: totalBoxes,
      icon: Package,
      accent: '#2563EB',
      iconColor: 'text-blue-600',
    },
    {
      label: 'Total Cartons',
      value: totalCartons,
      icon: Boxes,
      accent: '#16A34A',
      iconColor: 'text-green-600',
    },
    {
      label: 'Loose Boxes',
      value: totalLoose,
      icon: PackageOpen,
      accent: '#D97706',
      iconColor: 'text-amber-600',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}

// ─── Leaf-level (depth 6): computed from leaf data ────────────────────────────

function LeafSummaryCards({ leafData }: { leafData: LeafData }) {
  const mcPieces = leafData.master_cartons.reduce((s, mc) => s + mc.pieces, 0);
  const loosePieces = leafData.loose_stock.reduce((s, ls) => s + ls.pieces, 0);
  const totalPieces = mcPieces + loosePieces;

  const cards: StatCardProps[] = [
    {
      label: 'Total Pieces',
      value: totalPieces,
      icon: ShoppingBag,
      accent: '#2D2A6E',
      iconColor: 'text-binny-navy',
    },
    {
      label: 'Master Cartons',
      value: leafData.master_cartons.length,
      icon: Boxes,
      accent: '#2563EB',
      iconColor: 'text-blue-600',
      subtitle: `${mcPieces.toLocaleString('en-IN')} pcs`,
    },
    {
      label: 'Loose Boxes',
      value: leafData.loose_stock.length,
      icon: PackageOpen,
      accent: '#D97706',
      iconColor: 'text-amber-600',
      subtitle: `${loosePieces.toLocaleString('en-IN')} pcs`,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function InventorySummaryCards({
  depth,
  items,
  leafData,
}: InventorySummaryCardsProps) {
  if (depth === 0) {
    return <RootSummaryCards />;
  }
  if (depth >= 6 && leafData) {
    return <LeafSummaryCards leafData={leafData} />;
  }
  if (items) {
    return <MidSummaryCards items={items} />;
  }
  return null;
}
