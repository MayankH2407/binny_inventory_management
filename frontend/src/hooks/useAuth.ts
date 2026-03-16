'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export function useAuth(requireAuth: boolean = true) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isLoading) return;

    if (requireAuth && !isAuthenticated) {
      router.replace('/login');
    }

    if (!requireAuth && isAuthenticated && pathname === '/login') {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, requireAuth, router, pathname]);

  return {
    user,
    isAuthenticated,
    isLoading,
    isAdmin: user?.role === 'Admin',
    isSupervisor: user?.role === 'Supervisor',
    isManager: user?.role === 'Supervisor' || user?.role === 'Admin',
  };
}
