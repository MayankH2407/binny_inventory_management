'use client';

import { useState, type FormEvent } from 'react';
import { Lock, User, Bell, Smartphone } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import PageHeader from '@/components/layout/PageHeader';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/auth.service';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setIsChangingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      toast.error('Failed to change password. Check your current password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account and application settings"
      />

      <div className="max-w-2xl space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-blue-50">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-brand-text-dark">Profile</h3>
              <p className="text-sm text-brand-text-muted">Your account information</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-brand-text-muted">Name</span>
              <span className="text-sm font-medium text-brand-text-dark">{user?.name}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-brand-text-muted">Email</span>
              <span className="text-sm font-medium text-brand-text-dark">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-brand-text-muted">Role</span>
              <span className="text-sm font-medium text-brand-text-dark">{user?.role}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-orange-50">
              <Lock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-brand-text-dark">Change Password</h3>
              <p className="text-sm text-brand-text-muted">Update your account password</p>
            </div>
          </div>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <Input
              label="Current Password"
              type="password"
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Input
              label="New Password"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              helperText="Minimum 6 characters"
            />
            <Input
              label="Confirm New Password"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button type="submit" isLoading={isChangingPassword}>
              Update Password
            </Button>
          </form>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-green-50">
              <Smartphone className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-brand-text-dark">App Settings</h3>
              <p className="text-sm text-brand-text-muted">Configure application behavior</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-brand-text-dark">Camera Preference</p>
                <p className="text-xs text-brand-text-muted">
                  Default camera for QR scanning
                </p>
              </div>
              <span className="text-sm text-brand-text-muted">Back Camera</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-brand-text-dark">Auto-scan</p>
                <p className="text-xs text-brand-text-muted">
                  Automatically start scanner when opening scan pages
                </p>
              </div>
              <span className="text-sm text-brand-text-muted">Enabled</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-brand-text-dark">App Version</p>
                <p className="text-xs text-brand-text-muted">Current application version</p>
              </div>
              <span className="text-sm font-mono text-brand-text-muted">1.0.0</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
