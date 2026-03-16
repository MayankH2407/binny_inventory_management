'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  Package,
  Boxes,
  ScanLine,
  PackageOpen,
  Truck,
  BarChart3,
  Search,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Archive,
  ArrowLeftRight,
  ClipboardList,
  Building2,
  Tag,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from '@/constants';
import { useAuthStore } from '@/store/authStore';

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  Package,
  Boxes,
  ScanLine,
  PackageOpen,
  Truck,
  BarChart3,
  Search,
  Users,
  Settings,
  Archive,
  ArrowLeftRight,
  ClipboardList,
  Building2,
  Tag,
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'Admin';
  const isSupervisor = user?.role === 'Supervisor';
  const isManagement = isAdmin || isSupervisor;

  const filteredNavItems = NAV_ITEMS.filter(
    (item) => !('adminOnly' in item && item.adminOnly) || isManagement
  );

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col bg-white border-r border-brand-border h-screen sticky top-0 transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-64'
      )}
    >
      <div className="flex items-center gap-3 px-4 h-16 border-b border-brand-border shrink-0">
        <Image
          src="/BinnyLogo.png"
          alt="Binny"
          width={36}
          height={36}
          className="shrink-0"
        />
        {!collapsed && (
          <span className="font-bold text-brand-text-dark text-lg truncate">
            Binny Inventory
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-hide">
        {filteredNavItems.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200',
                isActive
                  ? 'text-binny-red bg-binny-red-light'
                  : 'text-brand-text-muted hover:text-brand-text-dark hover:bg-gray-100',
                collapsed && 'justify-center px-2'
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-binny-red')} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-brand-border shrink-0">
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full p-2 rounded-lg text-brand-text-muted hover:text-brand-text-dark hover:bg-gray-100 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>
    </aside>
  );
}
