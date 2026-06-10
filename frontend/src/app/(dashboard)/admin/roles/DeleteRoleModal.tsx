'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useApiMutation } from '@/hooks/useApi';
import api from '@/services/api';
import type { Role } from '@/types/role';
import { AxiosError } from 'axios';

interface DeleteRoleModalProps {
  role: Role | null;
  isOpen: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

export default function DeleteRoleModal({
  role,
  isOpen,
  onClose,
  onDeleted,
}: DeleteRoleModalProps) {
  const [inlineError, setInlineError] = useState<string | null>(null);

  const { mutate: deleteRole, isPending } = useApiMutation(
    async () => {
      await api.delete(`/roles/${role!.id}`);
    },
    {
      successMessage: `Role "${role?.name}" deleted`,
      onSuccess: () => {
        onDeleted();
        onClose();
      },
      onError: (error) => {
        if (error instanceof AxiosError) {
          const status = error.response?.status;
          const msg = (error.response?.data as { message?: string })?.message;
          if (status === 409) {
            setInlineError(
              msg ??
                `Cannot delete role — ${role?.user_count ?? 'some'} user(s) still assigned. Reassign them first.`
            );
          } else if (status === 403) {
            setInlineError(msg ?? 'This role is protected and cannot be deleted.');
          } else {
            setInlineError(msg ?? 'An unexpected error occurred.');
          }
        }
      },
    }
  );

  function handleClose() {
    setInlineError(null);
    onClose();
  }

  if (!role) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Delete Role"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setInlineError(null);
              deleteRole(undefined as void);
            }}
            isLoading={isPending}
          >
            Delete
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {inlineError ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{inlineError}</p>
          </div>
        ) : (
          <p className="text-sm text-brand-text-dark">
            Are you sure you want to delete the role{' '}
            <span className="font-semibold">{role.name}</span>?
            {role.user_count > 0 && (
              <>
                {' '}
                <span className="text-amber-700 font-medium">
                  {role.user_count} user{role.user_count !== 1 ? 's are' : ' is'} currently
                  assigned to this role.
                </span>{' '}
                You must reassign them before deleting.
              </>
            )}
          </p>
        )}
      </div>
    </Modal>
  );
}
