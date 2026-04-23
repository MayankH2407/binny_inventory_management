import type { ReactNode } from 'react';
import { useAuthStore } from '../stores/authStore';

export type Role = 'Admin' | 'Supervisor' | 'Warehouse Operator' | 'Dispatch Operator';

interface RoleGateProps {
  allow: Role[];
  children: ReactNode;
  fallback?: ReactNode;
}

export default function RoleGate({ allow, children, fallback = null }: RoleGateProps) {
  const user = useAuthStore((s) => s.user);
  if (!user || !allow.includes(user.role as Role)) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
}

export function useHasRole(roles: Role[]): boolean {
  const user = useAuthStore((s) => s.user);
  return !!user && roles.includes(user.role as Role);
}
