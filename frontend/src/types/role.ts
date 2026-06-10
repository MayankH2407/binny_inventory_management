export interface RolePermission {
  permission: string;
  max_stage: string | null;
}

export interface Role {
  id: string;
  name: string;
  permissions: RolePermission[];
  user_count: number;
  created_at: string;
  updated_at: string;
}

export interface PermissionAction {
  key: string;
  label: string;
  stage_aware: boolean;
  stages?: string[];
}

export interface PermissionModule {
  key: string;
  label: string;
  actions: PermissionAction[];
}
