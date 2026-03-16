import { PoolClient } from 'pg';

interface RoleDefinition {
  name: string;
  permissions: string[];
}

const roles: RoleDefinition[] = [
  {
    name: 'Admin',
    permissions: [
      'users:create',
      'users:read',
      'users:update',
      'users:delete',
      'roles:manage',
      'products:create',
      'products:read',
      'products:update',
      'products:delete',
      'child_boxes:create',
      'child_boxes:read',
      'child_boxes:update',
      'child_boxes:delete',
      'cartons:create',
      'cartons:read',
      'cartons:update',
      'cartons:close',
      'cartons:reopen',
      'cartons:delete',
      'packing:pack',
      'packing:unpack',
      'packing:repack',
      'dispatch:create',
      'dispatch:read',
      'dispatch:update',
      'reports:view_all',
      'reports:export',
      'audit:read',
      'settings:manage',
    ],
  },
  {
    name: 'Supervisor',
    permissions: [
      'users:create',
      'users:read',
      'users:update',
      'products:read',
      'products:create',
      'products:update',
      'child_boxes:create',
      'child_boxes:read',
      'child_boxes:update',
      'cartons:create',
      'cartons:read',
      'cartons:update',
      'cartons:close',
      'cartons:reopen',
      'packing:pack',
      'packing:unpack',
      'packing:repack',
      'dispatch:read',
      'reports:view_all',
      'reports:export',
    ],
  },
  {
    name: 'Warehouse Operator',
    permissions: [
      'products:read',
      'child_boxes:create',
      'child_boxes:read',
      'cartons:create',
      'cartons:read',
      'cartons:close',
      'packing:pack',
      'packing:unpack',
      'packing:repack',
      'reports:view_own',
    ],
  },
  {
    name: 'Dispatch Operator',
    permissions: [
      'products:read',
      'child_boxes:read',
      'cartons:read',
      'dispatch:create',
      'dispatch:read',
      'dispatch:update',
      'reports:view_dispatch',
    ],
  },
];

export async function seedRoles(client: PoolClient): Promise<void> {
  console.log('Seeding roles...');

  for (const role of roles) {
    const existing = await client.query('SELECT id FROM roles WHERE name = $1', [role.name]);

    if (existing.rows.length === 0) {
      await client.query('INSERT INTO roles (name, permissions) VALUES ($1, $2)', [
        role.name,
        JSON.stringify(role.permissions),
      ]);
      console.log(`  Created role: ${role.name}`);
    } else {
      // Update permissions if role already exists
      await client.query('UPDATE roles SET permissions = $1, updated_at = NOW() WHERE name = $2', [
        JSON.stringify(role.permissions),
        role.name,
      ]);
      console.log(`  Role already exists, updated permissions: ${role.name}`);
    }
  }

  console.log('Roles seeded successfully.');
}
