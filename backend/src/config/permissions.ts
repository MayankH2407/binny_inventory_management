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

const MASTER_CARTON_STAGES = ['CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED'];
const CHILD_BOX_STAGES = ['GENERATED', 'FREE', 'PACKED', 'SAMPLE', 'ECOMMERCE', 'DISPATCHED'];

export const PERMISSION_CATALOG: PermissionModule[] = [
  {
    key: 'users',
    label: 'Users',
    actions: [
      { key: 'create', label: 'Create', stage_aware: false },
      { key: 'read',   label: 'View',   stage_aware: false },
      { key: 'update', label: 'Edit',   stage_aware: false },
      { key: 'delete', label: 'Delete', stage_aware: false },
    ],
  },
  {
    key: 'roles',
    label: 'Roles',
    actions: [
      { key: 'manage', label: 'Manage', stage_aware: false },
    ],
  },
  {
    key: 'products',
    label: 'Products',
    actions: [
      { key: 'create', label: 'Create', stage_aware: false },
      { key: 'read',   label: 'View',   stage_aware: false },
      { key: 'update', label: 'Edit',   stage_aware: false },
      { key: 'delete', label: 'Delete', stage_aware: false },
    ],
  },
  {
    key: 'child_boxes',
    label: 'Child Boxes',
    actions: [
      { key: 'create', label: 'Create', stage_aware: false },
      { key: 'read',   label: 'View',   stage_aware: false },
      {
        key: 'update',
        label: 'Edit',
        stage_aware: true,
        stages: CHILD_BOX_STAGES,
      },
      {
        key: 'delete',
        label: 'Delete',
        stage_aware: true,
        stages: CHILD_BOX_STAGES,
      },
    ],
  },
  {
    key: 'cartons',
    label: 'Master Cartons',
    actions: [
      { key: 'create', label: 'Create', stage_aware: false },
      { key: 'read',   label: 'View',   stage_aware: false },
      {
        key: 'update',
        label: 'Edit',
        stage_aware: true,
        stages: MASTER_CARTON_STAGES,
      },
      { key: 'close',  label: 'Close',  stage_aware: false },
      { key: 'reopen', label: 'Reopen', stage_aware: false },
      {
        key: 'delete',
        label: 'Delete',
        stage_aware: true,
        stages: MASTER_CARTON_STAGES,
      },
    ],
  },
  {
    key: 'packing',
    label: 'Packing',
    actions: [
      { key: 'pack',   label: 'Pack',   stage_aware: false },
      { key: 'unpack', label: 'Unpack', stage_aware: false },
    ],
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    actions: [
      { key: 'create', label: 'Create', stage_aware: false },
      { key: 'read',   label: 'View',   stage_aware: false },
      { key: 'update', label: 'Edit',   stage_aware: false },
    ],
  },
  {
    key: 'samples',
    label: 'Samples',
    actions: [
      { key: 'create', label: 'Create', stage_aware: false },
      { key: 'read',   label: 'View',   stage_aware: false },
      { key: 'update', label: 'Edit',   stage_aware: false },
      { key: 'delete', label: 'Delete', stage_aware: false },
    ],
  },
  {
    key: 'ecommerce',
    label: 'E-Commerce',
    actions: [
      { key: 'create', label: 'Create', stage_aware: false },
      { key: 'read',   label: 'View',   stage_aware: false },
      { key: 'update', label: 'Edit',   stage_aware: false },
      { key: 'delete', label: 'Delete', stage_aware: false },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    actions: [
      { key: 'create', label: 'Create', stage_aware: false },
      { key: 'read',   label: 'View',   stage_aware: false },
      { key: 'update', label: 'Edit',   stage_aware: false },
      { key: 'delete', label: 'Delete', stage_aware: false },
    ],
  },
  {
    key: 'sections',
    label: 'Sections',
    actions: [
      { key: 'create', label: 'Create', stage_aware: false },
      { key: 'read',   label: 'View',   stage_aware: false },
      { key: 'update', label: 'Edit',   stage_aware: false },
      { key: 'delete', label: 'Delete', stage_aware: false },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    actions: [
      { key: 'read', label: 'View', stage_aware: false },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    actions: [
      { key: 'view_all',      label: 'View All',      stage_aware: false },
      { key: 'view_own',      label: 'View Own',      stage_aware: false },
      { key: 'view_dispatch', label: 'View Dispatch', stage_aware: false },
      { key: 'export',        label: 'Export',        stage_aware: false },
    ],
  },
  {
    key: 'audit',
    label: 'Audit Logs',
    actions: [
      { key: 'read', label: 'View', stage_aware: false },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    actions: [
      { key: 'manage', label: 'Manage', stage_aware: false },
    ],
  },
];

/**
 * Flat set of all valid permission keys (e.g. "cartons:update").
 * Used for validation in role CRUD.
 */
export const ALL_PERMISSIONS: Set<string> = new Set(
  PERMISSION_CATALOG.flatMap((mod) =>
    mod.actions.map((action) => `${mod.key}:${action.key}`)
  )
);
