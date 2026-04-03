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
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-lg border-t border-brand-border safe-bottom shadow-nav">
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
                isActive ? 'text-binny-navy' : 'text-brand-text-muted'
              )}
              style={isActive ? { color: '#2D2A6E' } : undefined}
            >
              <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5px]')} />
              <span className={cn('text-[10px]', isActive ? 'font-bold' : 'font-medium')}>{item.label}</span>
              {isActive && (
                <span
                  className="h-1 w-1 rounded-full -mt-0.5"
                  style={{ backgroundColor: '#E31E24' }}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
