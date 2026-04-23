export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://srv1409601.hstgr.cloud/binny/api/v1';

if (__DEV__) {
  console.log('[binny] API_BASE_URL =', API_BASE_URL);
}

export const COLORS = {
  primary: '#2D2A6E',
  primaryDark: '#1E1A5F',
  primaryLight: '#4A47A3',
  accent: '#E31E24',
  background: '#F5F6FA',
  surface: '#FFFFFF',
  text: '#1F2937',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  error: '#DC2626',
  success: '#16A34A',
  warning: '#F59E0B',
  info: '#3B82F6',
  statusFree: '#16A34A',
  statusPacked: '#3B82F6',
  statusDispatched: '#6B7280',
  statusActive: '#F59E0B',
  statusClosed: '#8B5CF6',
};

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'binny_auth_token',
  USER_DATA: 'binny_user_data',
};

export const CHILD_BOX_STATUS_COLORS: Record<string, string> = {
  FREE: COLORS.statusFree,
  PACKED: COLORS.statusPacked,
  DISPATCHED: COLORS.statusDispatched,
};

export const CARTON_STATUS_COLORS: Record<string, string> = {
  CREATED: COLORS.textSecondary,
  ACTIVE: COLORS.statusActive,
  CLOSED: COLORS.statusClosed,
  DISPATCHED: COLORS.statusDispatched,
};
