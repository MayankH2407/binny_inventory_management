'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
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
  Warehouse,
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
  Warehouse,
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
        'hidden lg:flex flex-col h-screen sticky top-0 transition-all duration-300',
        collapsed ? 'w-[72px]' : 'w-64'
      )}
      style={{ background: 'linear-gradient(180deg, #2D2A6E 0%, #1E1A5F 100%)' }}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 h-16 shrink-0 border-b border-white/10',
          collapsed && 'justify-center px-2'
        )}
      >
        <img
          src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/monogram.png`}
          alt="Binny"
          width={36}
          height={36}
          className="shrink-0 brightness-0 invert"
        />
        {!collapsed && (
          <span className="font-bold text-white text-lg truncate">
            Binny Inventory
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5 scrollbar-hide">
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
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative',
                isActive
                  ? 'bg-white text-binny-navy shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white',
                collapsed && 'justify-center px-2'
              )}
              style={isActive ? { color: '#2D2A6E' } : undefined}
            >
              {/* Red active indicator */}
              {isActive && !collapsed && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r"
                  style={{ backgroundColor: '#E31E24' }}
                />
              )}
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-white/10 shrink-0">
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
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
