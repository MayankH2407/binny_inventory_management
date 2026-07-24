'use client';

import { useState } from 'react';
import { Plus, Search, Shield, UserCheck, UserX, Pencil } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/layout/PageHeader';
import { ROLE_LABELS } from '@/constants';
import api from '@/services/api';
import { useCan } from '@/hooks/useCan';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import type { User } from '@/types';
import type { Role } from '@/types/role';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function UsersPage() {
  const canCreate = useCan('users:create');
  const canRead = useCan('users:read');
  const canUpdate = useCan('users:update');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Warehouse Operator',
  });
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    role: '',
    password: '',
  });

  // All roles (built-in + custom, created via Role Manager) for the role pickers below.
  const { data: rolesData } = useApiQuery(['roles'], async () => {
    const response = await api.get<{ roles: Role[] }>('/roles');
    return response.data;
  });
  const roleOptions = (rolesData?.roles ?? []).map((r) => ({ value: r.name, label: r.name }));

  const { data, isLoading, refetch } = useApiQuery(
    ['users', search],
    async () => {
      const response = await api.get<{ data: User[]; total: number; page: number; limit: number; totalPages: number }>('/users', {
        params: { search: search || undefined },
      });
      return response.data;
    }
  );

  const { mutate: createUser, isPending: isCreating } = useApiMutation(
    async () => {
      const response = await api.post<User>('/users', newUser);
      return response.data;
    },
    {
      successMessage: 'User created successfully',
      invalidateKeys: [['users']],
      onSuccess: () => {
        setShowCreateModal(false);
        setNewUser({ name: '', email: '', password: '', role: 'Warehouse Operator' });
        refetch();
      },
    }
  );

  function openEdit(user: User) {
    setEditForm({ name: user.name, email: user.email, role: user.role, password: '' });
    setEditingUser(user);
  }

  const { mutate: saveEdit, isPending: isSaving } = useApiMutation(
    async () => {
      if (!editingUser) return;
      const body: { name: string; email: string; role: string; password?: string } = {
        name: editForm.name,
        email: editForm.email,
        role: editForm.role,
      };
      if (editForm.password.trim()) {
        body.password = editForm.password;
      }
      const response = await api.put<User>(`/users/${editingUser.id}`, body);
      return response.data;
    },
    {
      successMessage: 'User updated successfully',
      invalidateKeys: [['users']],
      onSuccess: () => {
        setEditingUser(null);
        refetch();
      },
    }
  );

  const toggleUserStatus = async (userId: string, isActive: boolean) => {
    try {
      await api.put(`/users/${userId}`, { is_active: !isActive });
      toast.success(`User ${isActive ? 'deactivated' : 'activated'} successfully`);
      refetch();
    } catch {
      toast.error('Failed to update user status');
    }
  };

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield className="h-16 w-16 text-brand-text-muted/20 mb-4" />
        <h2 className="text-lg font-semibold text-brand-text-dark mb-2">Access Denied</h2>
        <p className="text-brand-text-muted">
          You do not have permission to view users.
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="User Management"
        description="Manage system users and their roles"
        action={
          canCreate ? (
            <Button
              leftIcon={<Plus className="h-4 w-4" />}
              onClick={() => setShowCreateModal(true)}
            >
              Add User
            </Button>
          ) : undefined
        }
      />

      <Card padding={false}>
        <div className="p-4 border-b border-brand-border">
          <Input
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>

        {isLoading ? (
          <div className="p-12 text-center">
            <p className="text-brand-text-muted">Loading users...</p>
          </div>
        ) : !data?.data.length ? (
          <div className="p-12 text-center">
            <p className="text-brand-text-muted">No users found.</p>
          </div>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Name</TableHeader>
                <TableHeader>Email</TableHeader>
                <TableHeader>Role</TableHeader>
                <TableHeader>Status</TableHeader>
                <TableHeader>Created</TableHeader>
                <TableHeader>Actions</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.data.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-brand-text-muted">{user.email}</TableCell>
                  <TableCell>
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
                      {ROLE_LABELS[user.role] ?? user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? 'green' : 'gray'} size="sm" dot>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-brand-text-muted text-xs">
                    {formatDateTime(user.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {canUpdate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(user)}
                          leftIcon={<Pencil className="h-3.5 w-3.5" />}
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleUserStatus(user.id, user.is_active)}
                        leftIcon={
                          user.is_active ? (
                            <UserX className="h-3.5 w-3.5" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5" />
                          )
                        }
                      >
                        {user.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        isOpen={showCreateModal && canCreate}
        onClose={() => setShowCreateModal(false)}
        title="Add New User"
        description="Create a new user account for the inventory system"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            {canCreate && (
              <Button onClick={() => createUser(undefined as void)} isLoading={isCreating}>
                Create User
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            placeholder="Enter full name"
            value={newUser.name}
            onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            placeholder="Enter email address"
            value={newUser.email}
            onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
          />
          <Input
            label="Password"
            type="password"
            placeholder="Enter initial password"
            value={newUser.password}
            onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
          />
          <Select
            label="Role"
            options={roleOptions}
            value={newUser.role}
            onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value }))}
          />
        </div>
      </Modal>

      <Modal
        isOpen={editingUser !== null && canUpdate}
        onClose={() => setEditingUser(null)}
        title="Edit User"
        description="Update this user's details, role, or login credentials"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button onClick={() => saveEdit(undefined as void)} isLoading={isSaving}>
              Save Changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            placeholder="Enter full name"
            value={editForm.name}
            onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            placeholder="Enter email address"
            value={editForm.email}
            onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
          />
          <Select
            label="Role"
            options={roleOptions}
            value={editForm.role}
            onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
          />
          <Input
            label="New Password"
            type="password"
            placeholder="Leave blank to keep current password"
            value={editForm.password}
            onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))}
            helperText="Only fill this in to reset the user's login password."
          />
        </div>
      </Modal>
    </div>
  );
}
