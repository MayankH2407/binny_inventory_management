'use client';

import { useState, useMemo } from 'react';
import {
  Warehouse, ChevronRight, Package, Boxes, ArrowLeft,
  TrendingUp, TrendingDown, BarChart3, Layers, Palette, Ruler,
  RefreshCw,
} from 'lucide-react';
import { useApiQuery } from '@/hooks/useApi';
import api from '@/services/api';
import PageHeader from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Spinner';

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
  level: 'root' | 'section' | 'article_name' | 'colour' | 'product';
  label: string;
  filters: Record<string, string>;
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

// ─── Level Config ───────────────────────────────────────────────────────────

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
  article_name: 'colour',
  colour: 'product',
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
              {!isLeaf && node.children > 0 && (
                <p className="text-xs text-brand-text-muted">
                  {node.children} {config?.childLabel || 'items'}
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

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { level: 'root', label: 'All Sections', filters: {} },
  ]);

  const currentBreadcrumb = breadcrumbs[breadcrumbs.length - 1];
  const currentLevel = NEXT_LEVEL[currentBreadcrumb.level] || 'section';

  const { data: summary, isLoading: summaryLoading } = useApiQuery<StockSummary>(
    ['stock-summary'],
    fetchSummary
  );

  const { data: nodes, isLoading: nodesLoading, refetch } = useApiQuery<StockNode[]>(
    ['stock-hierarchy', currentLevel, JSON.stringify(currentBreadcrumb.filters)],
    () => fetchHierarchy(currentLevel, currentBreadcrumb.filters)
  );

  const handleDrillDown = (node: StockNode) => {
    const nextLevel = currentLevel as 'section' | 'article_name' | 'colour';
    const newFilters = { ...currentBreadcrumb.filters, [nextLevel]: node.key };
    const config = LEVEL_CONFIG[nextLevel];

    setBreadcrumbs((prev) => [
      ...prev,
      {
        level: nextLevel,
        label: node.name,
        filters: newFilters,
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
    <div>
      <PageHeader
        title="Inventory"
        description="Real-time stock levels with drill-down view"
      />

      <SummaryCards summary={summary} isLoading={summaryLoading} />

      <Card className="p-4 lg:p-6">
        {/* Breadcrumbs + Back */}
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
            <h2 className="text-lg font-semibold text-brand-text-dark">
              Stock Levels
            </h2>
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

        {/* Current level info */}
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

        {/* Grid of cards */}
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
    </div>
  );
}
