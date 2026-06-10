'use client';

import { useAuthStore } from '@/store/authStore';

type StageAware = {
  /** Current stage of the resource being acted upon (e.g. master_carton.status, child_box.status) */
  stage?: string;
  /** Canonical stage order for the module — if absent, just checks the permission exists */
  stageOrder?: string[];
};

export function useCan(permission: string, opts?: StageAware): boolean {
  const perms = useAuthStore((s) => s.user?.permissions ?? []);

  const match = perms.find((p) => p.permission === permission);
  if (!match) return false;

  // No stage check requested OR no max_stage on this permission → grant
  if (!opts?.stage || !opts.stageOrder || !match.max_stage) return true;

  const stageIdx = opts.stageOrder.indexOf(opts.stage);
  const maxIdx = opts.stageOrder.indexOf(match.max_stage);
  if (stageIdx === -1 || maxIdx === -1) return true; // unknown stage → permissive (backend will catch)
  return stageIdx <= maxIdx;
}
