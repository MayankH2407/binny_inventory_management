'use client';

import { useState } from 'react';
import { Plus, Shield, Lock, Users, Pencil, Trash2, Eye } from 'lucide-react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import PageHeader from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useApiQuery } from '@/hooks/useApi';
import api from '@/services/api';
import type { Role } from '@/types/role';
import RoleEditModal from './RoleEditModal';
import DeleteRoleModal from './DeleteRoleModal';

/** Names that cannot be deleted (server 403 anyway, but we disable the button too) */
const PROTECTED_ROLE_NAMES = new Set(['Admin', 'Supervisor', 'Warehouse Operator', 'Dispatch Operator']);

type ModalMode =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'edit'; role: Role }
  | { type: 'view'; role: Role }
  | { type: 'delete'; role: Role };

export default function RoleManagerPage() {
  const { isAdmin } = useAuth();
  const [modal, setModal] = useState<ModalMode>({ type: 'closed' });

  const {
    data,
    isLoading,
    refetch,
  } = useApiQuery(
    ['roles'],
    async () => {
      const res = await api.get<{ roles: Role[] }>('/roles');
      return res.data;
    }
  );

  const roles: Role[] = data?.roles ?? [];

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield className="h-16 w-16 text-brand-text-muted/20 mb-4" />
        <h2 className="text-lg font-semibold text-brand-text-dark mb-2">Access Denied</h2>
        <p className="text-brand-text-muted">Only administrators can manage roles.</p>
      </div>
    );
  }

  function openEdit(role: Role) {
    if (role.name === 'Admin') {
      setModal({ type: 'view', role });
    } else {
      setModal({ type: 'edit', role });
    }
  }

  function handleSaved() {
    refetch();
  }

  function handleDeleted() {
    refetch();
  }

  // --- Derive modal props ---
  const editModalRole =
    modal.type === 'edit' || modal.type === 'view'
      ? modal.role
      : modal.type === 'create'
      ? null
      : undefined;

  const editModalOpen =
    modal.type === 'create' || modal.type === 'edit' || modal.type === 'view';

  const deleteModalRole = modal.type === 'delete' ? modal.role : null;

  return (
    <div>
      <PageHeader
        title="Role Manager"
        description="Define roles and their permissions across the system"
        action={
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setModal({ type: 'create' })}
          >
            New Role
          </Button>
        }
      />

      {isLoading ? (
        <div className="py-16 text-center">
          <p className="text-brand-text-muted">Loading roles…</p>
        </div>
      ) : roles.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-brand-text-muted">No roles found.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => {
            const isAdminRole = role.name === 'Admin';
            const isDefault = PROTECTED_ROLE_NAMES.has(role.name);
            const canDelete = !isDefault;

            return (
              <Card key={role.id} className="flex flex-col gap-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* Gradient icon badge */}
                    <span
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: isAdminRole
                          ? 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)'
                          : 'linear-gradient(135deg, #2D2A6E 0%, #3D3A8E 100%)',
                      }}
                    >
                      {isAdminRole ? (
                        <Lock className="h-4 w-4 text-white" />
                      ) : (
                        <Shield className="h-4 w-4 text-white" />
                      )}
                    </span>
                    <h3 className="font-semibold text-brand-text-dark text-sm truncate">
                      {role.name}
                    </h3>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isAdminRole && (
                      <Badge variant="red" size="sm">
                        Protected
                      </Badge>
                    )}
                    {isDefault && !isAdminRole && (
                      <Badge variant="blue" size="sm">
                        Default
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 text-xs text-brand-text-muted">
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {role.user_count} user{role.user_count !== 1 ? 's' : ''}
                  </span>
                  <span>
                    {role.permissions.length} permission{role.permissions.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2 pt-1 border-t border-brand-border mt-auto">
                  {isAdminRole ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Eye className="h-3.5 w-3.5" />}
                      onClick={() => setModal({ type: 'view', role })}
                    >
                      View permissions
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Pencil className="h-3.5 w-3.5" />}
                      onClick={() => openEdit(role)}
                    >
                      Edit permissions
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                    disabled={!canDelete}
                    title={
                      !canDelete
                        ? 'Default and protected roles cannot be deleted'
                        : undefined
                    }
                    onClick={() => {
                      if (canDelete) setModal({ type: 'delete', role });
                    }}
                    className={
                      canDelete
                        ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
                        : 'opacity-40'
                    }
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit / Create modal */}
      {editModalRole !== undefined && (
        <RoleEditModal
          role={editModalRole}
          isOpen={editModalOpen}
          onClose={() => setModal({ type: 'closed' })}
          onSaved={handleSaved}
        />
      )}

      {/* Delete confirmation modal */}
      <DeleteRoleModal
        role={deleteModalRole}
        isOpen={modal.type === 'delete'}
        onClose={() => setModal({ type: 'closed' })}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
