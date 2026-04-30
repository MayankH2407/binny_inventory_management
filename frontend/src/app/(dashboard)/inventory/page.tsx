'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  Warehouse, ChevronRight, Package, Boxes, ArrowLeft,
  TrendingUp, BarChart3, Layers, Palette, Ruler,
  RefreshCw, IndianRupee, ListChecks, Box, Download,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useApiQuery } from '@/hooks/useApi';
import { useAuth } from '@/hooks/useAuth';
import api from '@/services/api';
import { inventoryService } from '@/services/inventory.service';
import PageHeader from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Spinner';
import StatusBadge from '@/components/ui/StatusBadge';
import type { CartonStockNode, CartonHierarchyLevel } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────────────

interface StockNode {
  name: string;
  key: string;
  totalPairs: number;
  inStock: number;
  packed: number;
  dispatched: number;
  childBoxCount: number;
  cartonCount: number;
  children: number;
  distinctMrpCount: number;
}

interface StockSummary {
  totalProducts: number;
  totalPairsInStock: number;
  totalPairsDispatched: number;
  totalChildBoxes: number;
  totalCartons: number;
  sections: number;
  articles: number;
}

interface BreadcrumbItem {
  level: 'root' | 'section' | 'article_name' | 'mrp' | 'colour' | 'product';
  label: string;
  filters: Record<string, string>;
  /** Set when the breadcrumb level is 'article_name'. If 1, the MRP grouping level is skipped (children render as colours directly). */
  distinctMrpCount?: number;
}

interface CartonBreadcrumbItem {
  level: 'root' | CartonHierarchyLevel;
  label: string;
  filters: {
    status?: string;
    section?: string;
    article_name?: string;
    search?: string;
  };
}

// ─── API helpers ────────────────────────────────────────────────────────────

async function fetchSummary(): Promise<StockSummary> {
  const res = await api.get('/inventory/stock/summary');
  return res.data;
}

async function fetchHierarchy(
  level: string,
  filters: Record<string, string>
): Promise<StockNode[]> {
  const res = await api.get('/inventory/stock/hierarchy', {
    params: { level, ...filters },
  });
  return res.data;
}

async function fetchCartonHierarchy(
  level: CartonHierarchyLevel,
  filters: { status?: string; section?: string; article_name?: string; search?: string; page?: number }
): Promise<{ data: CartonStockNode[]; meta?: { page: number; limit: number; total: number; totalPages: number } }> {
  return inventoryService.getCartonHierarchy(level, filters);
}

// ─── Child Box Level Config ──────────────────────────────────────────────────

const LEVEL_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  childLabel: string;
  gradient: string;
  accent: string;
}> = {
  section: {
    label: 'Section',
    icon: Layers,
    childLabel: 'Articles',
    gradient: 'from-indigo-500 to-purple-600',
    accent: 'border-indigo-400',
  },
  article_name: {
    label: 'Article',
    icon: BarChart3,
    childLabel: 'Colours',
    gradient: 'from-blue-500 to-cyan-600',
    accent: 'border-blue-400',
  },
  mrp: {
    label: 'MRP',
    icon: IndianRupee,
    childLabel: 'Colours',
    gradient: 'from-rose-500 to-pink-600',
    accent: 'border-rose-400',
  },
  colour: {
    label: 'Colour',
    icon: Palette,
    childLabel: 'Sizes',
    gradient: 'from-emerald-500 to-teal-600',
    accent: 'border-emerald-400',
  },
  product: {
    label: 'Size',
    icon: Ruler,
    childLabel: '',
    gradient: 'from-amber-500 to-orange-600',
    accent: 'border-amber-400',
  },
};

const NEXT_LEVEL: Record<string, string> = {
  root: 'section',
  section: 'article_name',
  article_name: 'mrp',
  mrp: 'colour',
  colour: 'product',
};

function getChildLevel(crumb: BreadcrumbItem): string {
  // Conditional skip: when an article has only one distinct MRP, jump straight to colour.
  if (crumb.level === 'article_name' && crumb.distinctMrpCount === 1) return 'colour';
  return NEXT_LEVEL[crumb.level] || 'section';
}

// ─── Carton Level Config ─────────────────────────────────────────────────────

const CARTON_LEVEL_CONFIG: Record<string, {
  label: string;
  icon: React.ElementType;
  childLabel: string | null;
  gradient: string;
}> = {
  status: {
    label: 'Status',
    icon: ListChecks,
    childLabel: 'Sections',
    gradient: 'from-slate-500 to-slate-600',
  },
  section: {
    label: 'Section',
    icon: Layers,
    childLabel: 'Articles',
    gradient: 'from-blue-500 to-blue-600',
  },
  article_name: {
    label: 'Article',
    icon: Package,
    childLabel: 'Cartons',
    gradient: 'from-emerald-500 to-emerald-600',
  },
  carton: {
    label: 'Carton',
    icon: Box,
    childLabel: null,
    gradient: 'from-amber-500 to-amber-600',
  },
};

const CARTON_NEXT_LEVEL: Record<string, CartonHierarchyLevel | null> = {
  status: 'section',
  section: 'article_name',
  article_name: 'carton',
  carton: null,
};

// ─── Components ─────────────────────────────────────────────────────────────

function SummaryCards({ summary, isLoading }: { summary?: StockSummary; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }
  if (!summary) return null;

  const cards = [
    {
      label: 'Pairs in Stock',
      value: summary.totalPairsInStock,
      icon: Package,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      border: 'border-l-emerald-500',
    },
    {
      label: 'Pairs Dispatched',
      value: summary.totalPairsDispatched,
      icon: TrendingUp,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-l-blue-500',
    },
    {
      label: 'Child Boxes',
      value: summary.totalChildBoxes,
      icon: Boxes,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      border: 'border-l-purple-500',
    },
    {
      label: 'Active Cartons',
      value: summary.totalCartons,
      icon: Warehouse,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-l-amber-500',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={`bg-white rounded-xl p-4 shadow-card border-l-4 ${card.border}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className={`p-2 rounded-lg ${card.bg}`}>
                <Icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-brand-text-dark">
              {card.value.toLocaleString('en-IN')}
            </p>
            <p className="text-xs text-brand-text-muted mt-0.5">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function StockBar({ inStock, packed, dispatched, total }: {
  inStock: number; packed: number; dispatched: number; total: number;
}) {
  if (total === 0) return <div className="h-2 bg-gray-100 rounded-full" />;
  const pctIn = (inStock / total) * 100;
  const pctPk = (packed / total) * 100;
  const pctDs = (dispatched / total) * 100;

  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
      {pctIn > 0 && (
        <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${pctIn}%` }} />
      )}
      {pctPk > 0 && (
        <div className="bg-blue-500 transition-all duration-500" style={{ width: `${pctPk}%` }} />
      )}
      {pctDs > 0 && (
        <div className="bg-gray-400 transition-all duration-500" style={{ width: `${pctDs}%` }} />
      )}
    </div>
  );
}

function NodeCard({
  node,
  levelKey,
  onDrillDown,
}: {
  node: StockNode;
  levelKey: string;
  onDrillDown?: () => void;
}) {
  const config = LEVEL_CONFIG[levelKey];
  const Icon = config?.icon || Layers;
  const isLeaf = levelKey === 'product';
  // At the article level, articles with multiple MRPs route to an MRP bucket level (not directly to colours).
  const showsMrpBuckets = levelKey === 'article_name' && node.distinctMrpCount > 1;
  const childCount = showsMrpBuckets ? node.distinctMrpCount : node.children;
  const childLabel = showsMrpBuckets ? 'MRPs' : (config?.childLabel || 'items');

  return (
    <div
      onClick={!isLeaf ? onDrillDown : undefined}
      className={`bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden transition-all duration-200
        ${!isLeaf ? 'cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 active:scale-[0.99]' : ''}`}
    >
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-lg bg-gradient-to-br ${config?.gradient || 'from-gray-400 to-gray-500'} text-white shrink-0`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-brand-text-dark truncate">{node.name}</h3>
              {!isLeaf && childCount > 0 && (
                <p className="text-xs text-brand-text-muted">
                  {childCount} {childLabel}
                </p>
              )}
            </div>
          </div>
          {!isLeaf && (
            <ChevronRight className="h-4 w-4 text-brand-text-muted shrink-0" />
          )}
        </div>

        {/* Stock bar */}
        <StockBar
          inStock={node.inStock}
          packed={node.packed}
          dispatched={node.dispatched}
          total={node.totalPairs}
        />
      </div>

      {/* Stats */}
      <div className="px-4 pb-4 pt-2 grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-lg font-bold text-emerald-600">{node.inStock}</p>
          <p className="text-[10px] text-brand-text-muted uppercase tracking-wide">Free</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-blue-600">{node.packed}</p>
          <p className="text-[10px] text-brand-text-muted uppercase tracking-wide">Packed</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-gray-500">{node.dispatched}</p>
          <p className="text-[10px] text-brand-text-muted uppercase tracking-wide">Dispatched</p>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between text-xs text-brand-text-muted">
        <span>{node.childBoxCount} boxes</span>
        <span className="font-semibold text-brand-text-dark">
          {node.totalPairs} pairs total
        </span>
        {node.cartonCount > 0 && <span>{node.cartonCount} cartons</span>}
      </div>
    </div>
  );
}

// ─── Carton Node Card ────────────────────────────────────────────────────────

function StatusBreakdownChips({ node }: { node: CartonStockNode }) {
  const chips = [
    { label: 'Created', count: node.createdCount ?? 0, color: 'bg-yellow-100 text-yellow-700' },
    { label: 'Active', count: node.activeCount ?? 0, color: 'bg-green-100 text-green-700' },
    { label: 'Closed', count: node.closedCount ?? 0, color: 'bg-orange-100 text-orange-700' },
    { label: 'Dispatched', count: node.dispatchedCount ?? 0, color: 'bg-gray-100 text-gray-600' },
  ].filter(c => c.count > 0);

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map(chip => (
        <span key={chip.label} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${chip.color}`}>
          {chip.label}: {chip.count}
        </span>
      ))}
    </div>
  );
}

function UtilizationBar({ childCount, maxCapacity }: { childCount: number; maxCapacity: number }) {
  const pct = maxCapacity > 0 ? Math.min(Math.round((childCount / maxCapacity) * 100), 100) : 0;
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-brand-text-muted shrink-0">{pct}%</span>
    </div>
  );
}

function CartonNodeCard({
  node,
  levelKey,
  onDrillDown,
  onNavigateCarton,
}: {
  node: CartonStockNode;
  levelKey: CartonHierarchyLevel;
  onDrillDown?: () => void;
  onNavigateCarton?: (id: string) => void;
}) {
  const config = CARTON_LEVEL_CONFIG[levelKey];
  const Icon = config?.icon || Box;
  const isLeaf = levelKey === 'carton';

  const handleClick = () => {
    if (isLeaf && node.id) {
      onNavigateCarton?.(node.id);
    } else if (!isLeaf) {
      onDrillDown?.();
    }
  };

  if (isLeaf) {
    // Leaf carton card
    return (
      <div
        onClick={handleClick}
        className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.99]"
      >
        {/* Header */}
        <div className="p-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <StatusBadge status={node.status ?? 'CREATED'} size="sm" />
            <ChevronRight className="h-4 w-4 text-brand-text-muted shrink-0" />
          </div>
          <p className="font-mono text-sm font-semibold text-brand-text-dark truncate">{node.carton_barcode}</p>
          {(node.primary_section || node.primary_article) && (
            <p className="text-xs text-brand-text-muted mt-0.5 truncate">
              {[node.primary_section, node.primary_article].filter(Boolean).join(' / ')}
            </p>
          )}
        </div>

        {/* Utilization bar */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-brand-text-muted">Utilization</span>
            <span className="text-xs text-brand-text-muted">{node.child_count ?? 0}/{node.max_capacity ?? 0} boxes</span>
          </div>
          <UtilizationBar childCount={node.child_count ?? 0} maxCapacity={node.max_capacity ?? 0} />
        </div>

        {/* Dates */}
        <div className="px-4 py-2.5 bg-gray-50/80 border-t border-gray-100 text-[10px] text-brand-text-muted">
          <div className="flex items-center gap-3 flex-wrap">
            {node.created_at && (
              <span>Created: {new Date(node.created_at).toLocaleDateString('en-IN')}</span>
            )}
            {node.closed_at && (
              <span>Closed: {new Date(node.closed_at).toLocaleDateString('en-IN')}</span>
            )}
            {node.dispatched_at && (
              <span>Dispatched: {new Date(node.dispatched_at).toLocaleDateString('en-IN')}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Non-leaf card
  return (
    <div
      onClick={handleClick}
      className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden cursor-pointer hover:shadow-card-hover hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.99]"
    >
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2 rounded-lg bg-gradient-to-br ${config?.gradient || 'from-gray-400 to-gray-500'} text-white shrink-0`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-brand-text-dark truncate">{node.name}</h3>
              <p className="text-xs text-brand-text-muted">
                {node.cartonCount} carton{node.cartonCount !== 1 ? 's' : ''}
              </p>
              <StatusBreakdownChips node={node} />
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-brand-text-muted shrink-0" />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between text-xs text-brand-text-muted">
        <span>{node.childBoxCount} boxes</span>
        {node.avgUtilization !== undefined && (
          <span>{node.avgUtilization}% avg utilization</span>
        )}
        {node.totalPairs > 0 && (
          <span className="font-semibold text-brand-text-dark">{node.totalPairs} pairs</span>
        )}
      </div>
    </div>
  );
}

function Breadcrumbs({
  items,
  onNavigate,
}: {
  items: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-4">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={index} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-brand-text-muted" />}
            <button
              onClick={() => onNavigate(index)}
              className={`px-2.5 py-1 rounded-md text-sm transition-colors ${
                isLast
                  ? 'bg-binny-navy text-white font-medium'
                  : 'text-brand-text-muted hover:text-brand-text-dark hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CartonBreadcrumbs({
  items,
  onNavigate,
}: {
  items: CartonBreadcrumbItem[];
  onNavigate: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mb-4">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={index} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-brand-text-muted" />}
            <button
              onClick={() => onNavigate(index)}
              className={`px-2.5 py-1 rounded-md text-sm transition-colors ${
                isLast
                  ? 'bg-binny-navy text-white font-medium'
                  : 'text-brand-text-muted hover:text-brand-text-dark hover:bg-gray-100'
              }`}
            >
              {item.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-brand-text-muted mb-4">
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
        <span>Free (in stock)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
        <span>Packed (in carton)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
        <span>Dispatched</span>
      </div>
    </div>
  );
}

// ─── Tab Switcher ────────────────────────────────────────────────────────────

function ViewTabSwitcher({
  activeView,
  onChange,
}: {
  activeView: 'child' | 'carton';
  onChange: (v: 'child' | 'carton') => void;
}) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-4 w-fit">
      <button
        onClick={() => onChange('child')}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
          activeView === 'child'
            ? 'bg-white text-brand-text-dark shadow-sm'
            : 'text-brand-text-muted hover:text-brand-text-dark'
        }`}
      >
        By Child Box
      </button>
      <button
        onClick={() => onChange('carton')}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
          activeView === 'carton'
            ? 'bg-white text-brand-text-dark shadow-sm'
            : 'text-brand-text-muted hover:text-brand-text-dark'
        }`}
      >
        By Master Carton
      </button>
    </div>
  );
}

// ─── Child Box View ──────────────────────────────────────────────────────────

function ChildBoxView() {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { level: 'root', label: 'All Sections', filters: {} },
  ]);

  const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
  const currentLevel = getChildLevel(currentBreadcrumb);

  const { data: nodes, isLoading: nodesLoading, refetch } = useApiQuery<StockNode[]>(
    ['stock-hierarchy', currentLevel, JSON.stringify(currentBreadcrumb.filters)],
    () => fetchHierarchy(currentLevel, currentBreadcrumb.filters)
  );

  const handleDrillDown = (node: StockNode) => {
    const nextLevel = currentLevel as 'section' | 'article_name' | 'mrp' | 'colour';
    const newFilters = { ...currentBreadcrumb.filters, [nextLevel]: node.key };

    setBreadcrumbs((prev) => [
      ...prev,
      {
        level: nextLevel,
        label: node.name,
        filters: newFilters,
        distinctMrpCount: nextLevel === 'article_name' ? node.distinctMrpCount : undefined,
      },
    ]);
  };

  const handleNavigate = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
  };

  const handleBack = () => {
    if (breadcrumbs.length > 1) {
      setBreadcrumbs((prev) => prev.slice(0, -1));
    }
  };

  const totalInView = useMemo(() => {
    if (!nodes) return { pairs: 0, boxes: 0 };
    return {
      pairs: nodes.reduce((sum, n) => sum + n.totalPairs, 0),
      boxes: nodes.reduce((sum, n) => sum + n.childBoxCount, 0),
    };
  }, [nodes]);

  return (
    <Card className="p-4 lg:p-6">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {breadcrumbs.length > 1 && (
            <button
              onClick={handleBack}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-brand-text-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="text-lg font-semibold text-brand-text-dark">Stock Levels</h2>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-brand-text-muted"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${nodesLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <Breadcrumbs items={breadcrumbs} onNavigate={handleNavigate} />
      <Legend />

      {!nodesLoading && nodes && nodes.length > 0 && (
        <div className="flex items-center justify-between mb-4 px-1">
          <p className="text-sm text-brand-text-muted">
            {nodes.length} {LEVEL_CONFIG[currentLevel]?.label.toLowerCase() || 'item'}
            {nodes.length !== 1 ? 's' : ''}
          </p>
          <p className="text-sm font-medium text-brand-text-dark">
            {totalInView.pairs.toLocaleString('en-IN')} pairs &middot; {totalInView.boxes.toLocaleString('en-IN')} boxes
          </p>
        </div>
      )}

      {nodesLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : nodes && nodes.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {nodes.map((node) => (
            <NodeCard
              key={node.key}
              node={node}
              levelKey={currentLevel}
              onDrillDown={
                currentLevel !== 'product' ? () => handleDrillDown(node) : undefined
              }
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-brand-text-muted">
          <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No stock data</p>
          <p className="text-sm mt-1">
            Products will appear here once child boxes are generated.
          </p>
        </div>
      )}
    </Card>
  );
}

// ─── Master Carton View ──────────────────────────────────────────────────────

function MasterCartonView() {
  const router = useRouter();
  const { isAdmin, isSupervisor } = useAuth();
  const canExport = isAdmin || isSupervisor;

  const [cartonBreadcrumbs, setCartonBreadcrumbs] = useState<CartonBreadcrumbItem[]>([
    { level: 'root', label: 'All Statuses', filters: {} },
  ]);
  const [cartonPage, setCartonPage] = useState(1);
  const [cartonSearch, setCartonSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const currentCartonCrumb = cartonBreadcrumbs[cartonBreadcrumbs.length - 1];

  // Determine the level to fetch
  const cartonLevel: CartonHierarchyLevel = useMemo(() => {
    const lvl = currentCartonCrumb.level;
    if (lvl === 'root') return 'status';
    return lvl as CartonHierarchyLevel;
  }, [currentCartonCrumb]);

  const cartonFilters = useMemo(() => ({
    ...currentCartonCrumb.filters,
    search: cartonSearch || undefined,
    page: cartonLevel === 'carton' ? cartonPage : undefined,
  }), [currentCartonCrumb.filters, cartonSearch, cartonLevel, cartonPage]);

  const { data: cartonResult, isLoading: cartonLoading, refetch: cartonRefetch } = useApiQuery<
    { data: CartonStockNode[]; meta?: { page: number; limit: number; total: number; totalPages: number } }
  >(
    ['carton-hierarchy', cartonLevel, JSON.stringify(cartonFilters)],
    () => fetchCartonHierarchy(cartonLevel, cartonFilters)
  );

  const cartonNodes = cartonResult?.data ?? [];
  const cartonMeta = cartonResult?.meta;

  const handleCartonDrillDown = useCallback((node: CartonStockNode) => {
    const nextLevel = CARTON_NEXT_LEVEL[cartonLevel];
    if (!nextLevel) return;

    const newFilters: CartonBreadcrumbItem['filters'] = { ...currentCartonCrumb.filters };
    if (cartonLevel === 'status') newFilters.status = node.key;
    else if (cartonLevel === 'section') newFilters.section = node.key;
    else if (cartonLevel === 'article_name') newFilters.article_name = node.key;

    setCartonPage(1);
    setCartonSearch('');
    setCartonBreadcrumbs(prev => [
      ...prev,
      { level: nextLevel, label: node.name, filters: newFilters },
    ]);
  }, [cartonLevel, currentCartonCrumb.filters]);

  const handleCartonNavigate = useCallback((index: number) => {
    setCartonBreadcrumbs(prev => prev.slice(0, index + 1));
    setCartonPage(1);
    setCartonSearch('');
  }, []);

  const handleCartonBack = useCallback(() => {
    if (cartonBreadcrumbs.length > 1) {
      setCartonBreadcrumbs(prev => prev.slice(0, -1));
      setCartonPage(1);
      setCartonSearch('');
    }
  }, [cartonBreadcrumbs.length]);

  const handleNavigateCarton = useCallback((id: string) => {
    router.push(`/master-cartons/${id}`);
  }, [router]);

  const handleExport = useCallback(async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const blob = await inventoryService.exportCartonHierarchyCsv(cartonLevel, {
        ...currentCartonCrumb.filters,
        search: cartonSearch || undefined,
      });
      const blobObj = new Blob([blob], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blobObj);
      const a = document.createElement('a');
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `carton-hierarchy-${cartonLevel}-${today}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    } finally {
      setExporting(false);
    }
  }, [canExport, cartonLevel, currentCartonCrumb.filters, cartonSearch]);

  return (
    <Card className="p-4 lg:p-6">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {cartonBreadcrumbs.length > 1 && (
            <button
              onClick={handleCartonBack}
              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-brand-text-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <h2 className="text-lg font-semibold text-brand-text-dark">Master Cartons</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Search input */}
          <input
            type="text"
            value={cartonSearch}
            onChange={e => { setCartonSearch(e.target.value); setCartonPage(1); }}
            placeholder="Search barcode / article..."
            className="hidden sm:block text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-binny-navy/20 w-48"
          />
          {/* CSV export */}
          {canExport && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-medium transition-colors disabled:opacity-50"
              title="Export CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export'}</span>
            </button>
          )}
          <button
            onClick={() => cartonRefetch()}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-brand-text-muted"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${cartonLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <CartonBreadcrumbs items={cartonBreadcrumbs} onNavigate={handleCartonNavigate} />

      {/* Mobile search */}
      <div className="sm:hidden mb-3">
        <input
          type="text"
          value={cartonSearch}
          onChange={e => { setCartonSearch(e.target.value); setCartonPage(1); }}
          placeholder="Search barcode / article..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-binny-navy/20"
        />
      </div>

      {!cartonLoading && cartonNodes.length > 0 && (
        <div className="flex items-center justify-between mb-4 px-1">
          <p className="text-sm text-brand-text-muted">
            {cartonMeta ? cartonMeta.total : cartonNodes.length}{' '}
            {CARTON_LEVEL_CONFIG[cartonLevel]?.label.toLowerCase() || 'item'}
            {(cartonMeta ? cartonMeta.total : cartonNodes.length) !== 1 ? 's' : ''}
          </p>
        </div>
      )}

      {cartonLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : cartonNodes.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {cartonNodes.map((node) => (
              <CartonNodeCard
                key={node.key}
                node={node}
                levelKey={cartonLevel}
                onDrillDown={CARTON_NEXT_LEVEL[cartonLevel] ? () => handleCartonDrillDown(node) : undefined}
                onNavigateCarton={handleNavigateCarton}
              />
            ))}
          </div>

          {/* Pagination for carton leaf level */}
          {cartonMeta && cartonMeta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setCartonPage(p => Math.max(1, p - 1))}
                disabled={cartonPage <= 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-brand-text-muted">
                Page {cartonMeta.page} of {cartonMeta.totalPages}
              </span>
              <button
                onClick={() => setCartonPage(p => Math.min(cartonMeta.totalPages, p + 1))}
                disabled={cartonPage >= cartonMeta.totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12 text-brand-text-muted">
          <Warehouse className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No cartons found</p>
          <p className="text-sm mt-1">
            Master cartons will appear here once they are created.
          </p>
        </div>
      )}
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [activeView, setActiveView] = useState<'child' | 'carton'>('child');

  const { data: summary, isLoading: summaryLoading } = useApiQuery<StockSummary>(
    ['stock-summary'],
    fetchSummary
  );

  const handleViewChange = (v: 'child' | 'carton') => {
    setActiveView(v);
  };

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Real-time stock levels with drill-down view"
      />

      <SummaryCards summary={summary} isLoading={summaryLoading} />

      <ViewTabSwitcher activeView={activeView} onChange={handleViewChange} />

      {activeView === 'child' ? <ChildBoxView /> : <MasterCartonView />}
    </div>
  );
}
