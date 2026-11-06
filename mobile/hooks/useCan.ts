import { useAuthStore } from '../stores/authStore';

type PermissionGrant = { permission: string; max_stage?: string | null };

// Roles that hold each permission by default (mirrors backend autoSeed). Used only when the
// stored session predates permissions being kept on the user (until the next login).
const ROLE_FALLBACK: Record<string, string[]> = {
  'child_boxes:create': ['Admin', 'Supervisor', 'Warehouse Operator'],
};

/** True when the signed-in user holds `permission` (same source of truth as the web portal). */
export function useCan(permission: string): boolean {
  const user = useAuthStore((s) => s.user);
  if (!user) return false;
  const perms = (user as { permissions?: PermissionGrant[] }).permissions;
  if (Array.isArray(perms)) return perms.some((p) => p.permission === permission);
  return (ROLE_FALLBACK[permission] ?? []).includes(user.role);
}
