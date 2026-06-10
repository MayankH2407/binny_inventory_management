'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, Lock } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import api from '@/services/api';
import type { Role, RolePermission, PermissionModule } from '@/types/role';
import PermissionMatrix from './PermissionMatrix';
import { AxiosError } from 'axios';

/** Names that come from the DB seed — cannot be renamed */
const DEFAULT_ROLE_NAMES = new Set([
  'Admin',
  'Supervisor',
  'Warehouse Operator',
  'Dispatch Operator',
]);

interface RoleEditModalProps {
  /** null → create mode; Role object → edit/view mode */
  role: Role | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function RoleEditModal({
  role,
  isOpen,
  onClose,
  onSaved,
}: RoleEditModalProps) {
  const isCreate = role === null;
  const isAdminRole = role?.name === 'Admin';
  const isDefaultRole = role ? DEFAULT_ROLE_NAMES.has(role.name) : false;
  const readOnly = isAdminRole;

  // Local form state
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);

  // Seed form when role prop changes
  useEffect(() => {
    if (isOpen) {
      setName(role?.name ?? '');
      setPermissions(role?.permissions ?? []);
      setInlineError(null);
    }
  }, [isOpen, role]);

  // Fetch permission catalog (admin-only endpoint)
  const { data: catalogData, isLoading: catalogLoading } = useApiQuery(
    ['permissions-catalog'],
    async () => {
      const res = await api.get<{ catalog: PermissionModule[] }>('/permissions');
      return res.data;
    },
    { staleTime: 5 * 60 * 1000 }
  );

  const catalog: PermissionModule[] = catalogData?.catalog ?? [];

  // --- Save mutation (create or update) ---
  const { mutate: saveRole, isPending: isSaving } = useApiMutation(
    async () => {
      if (isCreate) {
        const res = await api.post<Role>('/roles', { name, permissions });
        return res.data;
      } else {
        // PATCH: send name only if it changed AND role is not a default (server will 400 anyway)
        const body: { name?: string; permissions: RolePermission[] } = { permissions };
        if (!isDefaultRole && name !== role!.name) {
          body.name = name;
        }
        const res = await api.patch<Role>(`/roles/${role!.id}`, body);
        return res.data;
      }
    },
    {
      successMessage: isCreate ? 'Role created successfully' : 'Role updated successfully',
      onSuccess: () => {
        onSaved();
        onClose();
      },
      onError: (error) => {
        if (error instanceof AxiosError) {
          const status = error.response?.status;
          const msg = (error.response?.data as { message?: string })?.message;
          if (status === 409) {
            setInlineError(msg ?? 'A role with that name already exists.');
          } else if (status === 400) {
            setInlineError(msg ?? 'Invalid request. Check the role name and permissions.');
          } else if (status === 403) {
            setInlineError(msg ?? 'This role is protected and cannot be modified.');
          } else {
            setInlineError(msg ?? 'An unexpected error occurred.');
          }
        }
      },
    }
  );

  const modalTitle = isCreate
    ? 'New Role'
    : readOnly
    ? `View Role: ${role!.name}`
    : `Edit Role: ${role!.name}`;

  const modalDescription = isCreate
    ? 'Create a custom role and assign permissions.'
    : isDefaultRole
    ? 'This is a default system role. You can edit permissions but cannot rename it.'
    : undefined;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      description={modalDescription}
      size="full"
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setInlineError(null);
                saveRole(undefined as void);
              }}
              isLoading={isSaving}
              disabled={!name.trim()}
            >
              {isCreate ? 'Create Role' : 'Save Changes'}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        {/* Admin protected banner */}
        {isAdminRole && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              The Admin role is protected and cannot be modified. All permissions are granted
              implicitly.
            </p>
          </div>
        )}

        {/* Inline error */}
        {inlineError && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{inlineError}</p>
          </div>
        )}

        {/* Name field */}
        <Input
          label="Role Name"
          placeholder="e.g. Store Manager"
          value={name}
          disabled={readOnly || isDefaultRole}
          onChange={(e) => setName(e.target.value)}
          helperText={
            isDefaultRole && !isAdminRole
              ? 'Default role names cannot be changed.'
              : undefined
          }
        />

        {/* Permissions matrix */}
        <div>
          <p className="text-sm font-medium text-brand-text-dark mb-3">Permissions</p>
          {catalogLoading ? (
            <p className="text-sm text-brand-text-muted py-4 text-center">
              Loading permission catalog…
            </p>
          ) : (
            <PermissionMatrix
              catalog={catalog}
              permissions={permissions}
              onChange={setPermissions}
              readOnly={readOnly}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}
