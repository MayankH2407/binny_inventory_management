'use client';

import Link from 'next/link';
import {
  Package,
  Boxes,
  Truck,
  ScanLine,
  PlusCircle,
  QrCode,
  ArrowRight,
  ShoppingBag,
  PackagePlus,
  PackageOpen,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { PageSpinner } from '@/components/ui/Spinner';
import PageHeader from '@/components/layout/PageHeader';
import { ROUTES } from '@/constants';
import { inventoryService } from '@/services/inventory.service';
import { useApiQuery } from '@/hooks/useApi';

const TRANSACTION_TYPE_MAP: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  CHILD_CREATED: { label: 'Child Box Created', icon: Package, color: 'text-green-600 bg-green-50' },
  CHILD_PACKED: { label: 'Child Box Packed', icon: PackagePlus, color: 'text-blue-600 bg-blue-50' },
  CHILD_UNPACKED: { label: 'Child Box Unpacked', icon: PackageOpen, color: 'text-orange-600 bg-orange-50' },
  CHILD_DISPATCHED: { label: 'Child Box Dispatched', icon: Truck, color: 'text-gray-600 bg-gray-50' },
  CARTON_CREATED: { label: 'Carton Created', icon: Boxes, color: 'text-purple-600 bg-purple-50' },
  CARTON_CLOSED: { label: 'Carton Closed', icon: Lock, color: 'text-amber-600 bg-amber-50' },
  CARTON_DISPATCHED: { label: 'Carton Dispatched', icon: Truck, color: 'text-gray-600 bg-gray-50' },
};

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useApiQuery(
    ['dashboard-stats'],
    () => inventoryService.getDashboardStats(),
    { refetchInterval: 30000 }
  );

  if (isLoading) return <PageSpinner />;

  const statCards = [
    {
      title: 'Total Child Boxes',
      value: stats?.totalChildBoxes ?? 0,
      icon: Package,
      color: 'text-binny-red',
      bg: 'bg-binny-red-light',
      breakdown: [
        { label: 'Free', value: stats?.freeChildBoxes ?? 0, color: 'text-brand-success' },
        { label: 'Packed', value: stats?.packedChildBoxes ?? 0, color: 'text-blue-600' },
        { label: 'Dispatched', value: stats?.dispatchedChildBoxes ?? 0, color: 'text-gray-500' },
      ],
    },
    {
      title: 'Active Master Cartons',
      value: stats?.activeMasterCartons ?? 0,
      icon: Boxes,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      subtitle: `${stats?.totalMasterCartons ?? 0} total`,
    },
    {
      title: "Today's Dispatches",
      value: stats?.todayDispatches ?? 0,
      icon: Truck,
      color: 'text-brand-success',
      bg: 'bg-green-50',
      subtitle: `${stats?.totalDispatches ?? 0} total`,
    },
    {
      title: 'Pairs in Stock',
      value: stats?.totalPairsInStock ?? 0,
      icon: ShoppingBag,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      subtitle: `${stats?.totalPairsDispatched ?? 0} dispatched`,
    },
  ];

  const quickActions = [
    {
      label: 'Generate QR Labels',
      href: ROUTES.CHILD_BOXES_GENERATE,
      icon: QrCode,
      description: 'Bulk generate child box labels',
      color: 'bg-binny-red',
    },
    {
      label: 'Create Carton',
      href: ROUTES.MASTER_CARTONS_CREATE,
      icon: PlusCircle,
      description: 'Pack child boxes into a master carton',
      color: 'bg-blue-600',
    },
    {
      label: 'Scan QR Code',
      href: ROUTES.SCAN,
      icon: ScanLine,
      description: 'Scan child box or master carton',
      color: 'bg-amber-600',
    },
    {
      label: 'New Dispatch',
      href: ROUTES.DISPATCH,
      icon: Truck,
      description: 'Dispatch master cartons',
      color: 'bg-green-600',
    },
  ];

  const recentTransactions = stats?.recentTransactions?.slice(0, 10) ?? [];

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your inventory operations" />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
        {statCards.map((stat) => (
          <Card key={stat.title} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-sm font-medium text-brand-text-muted">{stat.title}</p>
                <p className="text-3xl font-bold text-brand-text-dark mt-1">
                  {stat.value.toLocaleString('en-IN')}
                </p>
                {stat.subtitle && (
                  <p className="text-xs text-brand-text-muted mt-1">{stat.subtitle}</p>
                )}
              </div>
              <div className={`p-3 rounded-xl ${stat.bg}`}>
                <stat.icon className={`h-6 w-6 ${stat.color}`} />
              </div>
            </div>

            {stat.breakdown && (
              <div className="flex items-center gap-4 pt-3 border-t border-brand-border">
                {stat.breakdown.map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5">
                    <span className={`text-sm font-semibold ${item.color}`}>{item.value}</span>
                    <span className="text-xs text-brand-text-muted">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-brand-text-dark mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer group h-full">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl ${action.color} text-white shrink-0`}>
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-brand-text-dark group-hover:text-binny-red transition-colors">
                      {action.label}
                    </p>
                    <p className="text-xs text-brand-text-muted mt-0.5">{action.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-brand-text-muted group-hover:text-binny-red transition-colors shrink-0" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Summary panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-brand-text-dark">Inventory Summary</h3>
            <Link
              href={ROUTES.CHILD_BOXES}
              className="text-sm text-binny-red hover:text-binny-red-dark font-medium"
            >
              View Details
            </Link>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-sm font-medium text-green-700">Free Boxes</span>
              <span className="text-sm font-bold text-green-700">
                {stats?.freeChildBoxes ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
              <span className="text-sm font-medium text-blue-700">Packed in Cartons</span>
              <span className="text-sm font-bold text-blue-700">
                {stats?.packedChildBoxes ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-600">Dispatched</span>
              <span className="text-sm font-bold text-gray-600">
                {stats?.dispatchedChildBoxes ?? 0}
              </span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-brand-text-dark">Master Cartons</h3>
            <Link
              href={ROUTES.MASTER_CARTONS}
              className="text-sm text-binny-red hover:text-binny-red-dark font-medium"
            >
              View All
            </Link>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
              <span className="text-sm font-medium text-green-700">Active Cartons</span>
              <span className="text-sm font-bold text-green-700">
                {stats?.activeMasterCartons ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
              <span className="text-sm font-medium text-orange-700">Closed Cartons</span>
              <span className="text-sm font-bold text-orange-700">
                {stats?.closedMasterCartons ?? 0}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-600">Total Cartons</span>
              <span className="text-sm font-bold text-gray-600">
                {stats?.totalMasterCartons ?? 0}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      {recentTransactions.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-brand-text-dark mb-4">Recent Activity</h3>
          <div className="space-y-1">
            {recentTransactions.map((tx) => {
              const meta = TRANSACTION_TYPE_MAP[tx.transaction_type] ?? {
                label: tx.transaction_type,
                icon: Package,
                color: 'text-gray-600 bg-gray-50',
              };
              const IconComp = meta.icon;
              const [iconText, iconBg] = meta.color.split(' ');

              return (
                <div
                  key={tx.id}
                  className="flex items-start gap-3 py-3 border-b border-brand-border last:border-b-0"
                >
                  <div className={`p-2 rounded-lg ${iconBg} shrink-0 mt-0.5`}>
                    <IconComp className={`h-4 w-4 ${iconText}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-text-dark">{meta.label}</p>
                    {tx.notes && (
                      <p className="text-xs text-brand-text-muted mt-0.5 truncate">{tx.notes}</p>
                    )}
                    <p className="text-xs text-brand-text-muted mt-0.5">
                      by {tx.performed_by}
                    </p>
                  </div>
                  <span className="text-xs text-brand-text-muted whitespace-nowrap shrink-0">
                    {formatRelativeTime(tx.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
