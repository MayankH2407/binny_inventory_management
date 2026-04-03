'use client';

import { Menu, LogOut, Bell } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import Badge from '@/components/ui/Badge';
import { ROLE_LABELS, ROLE_COLORS } from '@/constants';
import { getInitials } from '@/lib/utils';

interface HeaderProps {
  title?: string;
  onMenuToggle: () => void;
}

export default function Header({ title, onMenuToggle }: HeaderProps) {
  const { user, logout } = useAuthStore();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white/80 backdrop-blur-md border-b border-brand-border shadow-card">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg text-brand-text-muted hover:text-brand-text-dark hover:bg-gray-100 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        {title && (
          <h1 className="text-lg sm:text-xl font-semibold text-brand-text-dark pl-3 border-l-2" style={{ borderColor: '#2D2A6E' }}>
            {title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button className="relative p-2 rounded-lg text-brand-text-muted hover:text-brand-text-dark hover:bg-gray-100 transition-colors">
          <Bell className="h-5 w-5" />
          <span
            className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full animate-pulse-dot"
            style={{ backgroundColor: '#E31E24' }}
          />
        </button>

        {user && (
          <div className="flex items-center gap-2 ml-1 pl-3 border-l border-brand-border">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-medium text-brand-text-dark">{user.name}</span>
              <Badge
                variant={
                  user.role === 'Admin'
                    ? 'red'
                    : user.role === 'Supervisor'
                    ? 'blue'
                    : 'gray'
                }
                size="sm"
              >
                {ROLE_LABELS[user.role] || user.role}
              </Badge>
            </div>

            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm"
              style={{ background: 'linear-gradient(135deg, #2D2A6E 0%, #4845A0 100%)' }}
            >
              {getInitials(user.name)}
            </div>

            <button
              onClick={logout}
              className="p-2 rounded-lg text-brand-text-muted hover:text-brand-error hover:bg-red-50 transition-colors"
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
