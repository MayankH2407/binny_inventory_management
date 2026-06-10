'use client';

import { type PermissionModule, type RolePermission } from '@/types/role';
import { cn } from '@/lib/utils';

interface PermissionMatrixProps {
  catalog: PermissionModule[];
  /** Current permission set being edited */
  permissions: RolePermission[];
  onChange: (permissions: RolePermission[]) => void;
  readOnly?: boolean;
}

/**
 * Renders a flex-wrap row of checkboxes per module, one row per module.
 * Stage-aware actions get an inline max_stage dropdown when checked.
 */
export default function PermissionMatrix({
  catalog,
  permissions,
  onChange,
  readOnly = false,
}: PermissionMatrixProps) {
  /** Look up a specific permission entry */
  function findPerm(moduleKey: string, actionKey: string): RolePermission | undefined {
    const key = `${moduleKey}:${actionKey}`;
    return permissions.find((p) => p.permission === key);
  }

  function isChecked(moduleKey: string, actionKey: string): boolean {
    return !!findPerm(moduleKey, actionKey);
  }

  function getMaxStage(moduleKey: string, actionKey: string): string {
    return findPerm(moduleKey, actionKey)?.max_stage ?? '';
  }

  function handleCheck(moduleKey: string, actionKey: string, checked: boolean) {
    const key = `${moduleKey}:${actionKey}`;
    if (checked) {
      onChange([...permissions, { permission: key, max_stage: null }]);
    } else {
      onChange(permissions.filter((p) => p.permission !== key));
    }
  }

  function handleStageChange(moduleKey: string, actionKey: string, stage: string) {
    const key = `${moduleKey}:${actionKey}`;
    onChange(
      permissions.map((p) =>
        p.permission === key ? { ...p, max_stage: stage || null } : p
      )
    );
  }

  return (
    <div className="space-y-1">
      {catalog.map((mod) => (
        <div
          key={mod.key}
          className="rounded-lg border border-brand-border bg-gray-50/40 px-4 py-3"
        >
          {/* Module label */}
          <p className="text-xs font-semibold text-brand-text-muted uppercase tracking-wide mb-2">
            {mod.label}
          </p>

          {/* Action checkboxes — flex-wrap so any number of actions fits */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {mod.actions.map((action) => {
              const checked = isChecked(mod.key, action.key);
              const currentStage = getMaxStage(mod.key, action.key);

              return (
                <div key={action.key} className="flex items-center gap-2 flex-wrap">
                  {/* Checkbox + label */}
                  <label
                    className={cn(
                      'flex items-center gap-1.5 text-sm select-none',
                      readOnly
                        ? 'text-brand-text-muted cursor-default'
                        : 'text-brand-text-dark cursor-pointer'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={readOnly}
                      onChange={(e) => handleCheck(mod.key, action.key, e.target.checked)}
                      className={cn(
                        'h-4 w-4 rounded border-brand-border text-binny-navy',
                        'focus:ring-binny-navy/20 focus:ring-2',
                        readOnly && 'opacity-60 cursor-default'
                      )}
                      style={{ accentColor: '#2D2A6E' }}
                    />
                    {action.label}
                  </label>

                  {/* Inline max_stage dropdown — only when stage_aware AND checked */}
                  {action.stage_aware && checked && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-brand-text-muted whitespace-nowrap">
                        up&nbsp;to:
                      </span>
                      <select
                        value={currentStage}
                        disabled={readOnly}
                        onChange={(e) =>
                          handleStageChange(mod.key, action.key, e.target.value)
                        }
                        className={cn(
                          'text-xs rounded border border-brand-border bg-white px-2 py-1',
                          'focus:outline-none focus:ring-1 focus:ring-binny-navy/30',
                          readOnly && 'opacity-60 cursor-default'
                        )}
                      >
                        <option value="">No limit</option>
                        {(action.stages ?? []).map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
