'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ScanLine, PlusCircle, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_NAV_ITEMS } from '@/constants';

const iconMap: Record<string, React.ElementType> = {
  Home,
  ScanLine,
  PlusCircle,
  Truck,
};

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-brand-border safe-bottom">
      <div className="flex items-center justify-around h-16">
        {MOBILE_NAV_ITEMS.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px] transition-colors',
                isActive ? 'text-binny-red' : 'text-brand-text-muted'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive && (
                <span className="absolute top-0 w-8 h-0.5 bg-binny-red rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
