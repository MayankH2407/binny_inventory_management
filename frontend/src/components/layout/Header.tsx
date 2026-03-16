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

  const roleColor = user
    ? ROLE_COLORS[user.role] || { bg: 'bg-gray-100', text: 'text-gray-700' }
    : null;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white border-b border-brand-border">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg text-brand-text-muted hover:text-brand-text-dark hover:bg-gray-100 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        {title && (
          <h1 className="text-lg sm:text-xl font-semibold text-brand-text-dark">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg text-brand-text-muted hover:text-brand-text-dark hover:bg-gray-100 transition-colors">
          <Bell className="h-5 w-5" />
        </button>

        {user && (
          <div className="flex items-center gap-3">
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

            <div className="h-9 w-9 rounded-full bg-binny-red flex items-center justify-center text-white text-sm font-semibold">
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
