'use client';

import { useState } from 'react';
import { Plus, Search, Shield, UserCheck, UserX } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/layout/PageHeader';
import { ROLE_LABELS } from '@/constants';
import { useAuth } from '@/hooks/useAuth';
import api from '@/services/api';
import { useApiQuery, useApiMutation } from '@/hooks/useApi';
import type { User } from '@/types';
import { formatDateTime } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function UsersPage() {
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Warehouse Operator',
  });

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

  const toggleUserStatus = async (userId: string, isActive: boolean) => {
    try {
      await api.patch(`/users/${userId}`, { is_active: !isActive });
      toast.success(`User ${isActive ? 'deactivated' : 'activated'} successfully`);
      refetch();
    } catch {
      toast.error('Failed to update user status');
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield className="h-16 w-16 text-brand-text-muted/20 mb-4" />
        <h2 className="text-lg font-semibold text-brand-text-dark mb-2">Access Denied</h2>
        <p className="text-brand-text-muted">
          Only administrators can manage users.
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
          <Button
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            Add User
          </Button>
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
                      {ROLE_LABELS[user.role]}
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add New User"
        description="Create a new user account for the inventory system"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => createUser(undefined as void)} isLoading={isCreating}>
              Create User
            </Button>
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
            options={[
              { value: 'Warehouse Operator', label: 'Warehouse Operator' },
              { value: 'Dispatch Operator', label: 'Dispatch Operator' },
              { value: 'Supervisor', label: 'Supervisor' },
              { value: 'Admin', label: 'Admin' },
            ]}
            value={newUser.role}
            onChange={(e) => setNewUser((prev) => ({ ...prev, role: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
