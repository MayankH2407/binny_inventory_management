import { query, getClient } from '../config/database';
import { ConflictError, ForbiddenError, NotFoundError } from '../utils/errors';
import { ALL_PERMISSIONS } from '../config/permissions';
import { BadRequestError } from '../utils/errors';
import type { CreateRoleInput, UpdateRoleInput, PermissionEntry } from '../models/schemas/role.schema';

// Default roles that cannot be renamed or deleted (but permissions can be edited)
const DEFAULT_ROLE_NAMES = ['Admin', 'Supervisor', 'Warehouse Operator', 'Dispatch Operator'];
// Super-admin role — cannot be edited at all via API
const SUPER_ADMIN_ROLE = 'Admin';

export interface RolePermissionRow {
  permission: string;
  max_stage: string | null;
}

export interface RoleDetail {
  id: string;
  name: string;
  permissions: RolePermissionRow[];
  user_count: number;
  created_at: string;
  updated_at: string;
}

function validatePermissions(permissions: PermissionEntry[]): void {
  const invalid = permissions.filter((p) => !ALL_PERMISSIONS.has(p.permission));
  if (invalid.length > 0) {
    throw new BadRequestError(
      `Invalid permission(s): ${invalid.map((p) => p.permission).join(', ')}. ` +
        'Check GET /api/v1/permissions for the full catalog.'
    );
  }
}

export async function listRoles(): Promise<RoleDetail[]> {
  const rolesResult = await query(
    `SELECT r.id, r.name, r.created_at, r.updated_at,
            COUNT(u.id)::int AS user_count
     FROM roles r
     LEFT JOIN users u ON u.role_id = r.id
     GROUP BY r.id, r.name, r.created_at, r.updated_at
     ORDER BY r.name`
  );

  if (rolesResult.rows.length === 0) {
    return [];
  }

  const roleIds = rolesResult.rows.map((r: { id: string }) => r.id);

  const permsResult = await query(
    `SELECT role_id, permission, max_stage
     FROM role_permissions
     WHERE role_id = ANY($1::uuid[])
     ORDER BY permission`,
    [roleIds]
  );

  // Group permissions by role_id
  const permsByRole: Record<string, RolePermissionRow[]> = {};
  for (const row of permsResult.rows) {
    if (!permsByRole[row.role_id]) {
      permsByRole[row.role_id] = [];
    }
    permsByRole[row.role_id].push({ permission: row.permission, max_stage: row.max_stage });
  }

  return rolesResult.rows.map((r: { id: string; name: string; created_at: string; updated_at: string; user_count: number }) => ({
    id: r.id,
    name: r.name,
    permissions: permsByRole[r.id] || [],
    user_count: r.user_count,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function getRoleById(id: string): Promise<RoleDetail> {
  const roleResult = await query(
    `SELECT r.id, r.name, r.created_at, r.updated_at,
            COUNT(u.id)::int AS user_count
     FROM roles r
     LEFT JOIN users u ON u.role_id = r.id
     WHERE r.id = $1
     GROUP BY r.id, r.name, r.created_at, r.updated_at`,
    [id]
  );

  if (roleResult.rows.length === 0) {
    throw new NotFoundError('Role not found');
  }

  const role = roleResult.rows[0];

  const permsResult = await query(
    `SELECT permission, max_stage FROM role_permissions WHERE role_id = $1 ORDER BY permission`,
    [id]
  );

  return {
    id: role.id,
    name: role.name,
    permissions: permsResult.rows.map((p: { permission: string; max_stage: string | null }) => ({
      permission: p.permission,
      max_stage: p.max_stage,
    })),
    user_count: role.user_count,
    created_at: role.created_at,
    updated_at: role.updated_at,
  };
}

export async function createRole(input: CreateRoleInput): Promise<RoleDetail> {
  // Validate permission keys against catalog
  if (input.permissions.length > 0) {
    validatePermissions(input.permissions);
  }

  // Check name uniqueness
  const existing = await query('SELECT id FROM roles WHERE name = $1', [input.name]);
  if (existing.rows.length > 0) {
    throw new ConflictError(`Role name "${input.name}" already exists`);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Insert into roles (keep jsonb column in sync)
    const permStrings = input.permissions.map((p) => p.permission);
    const roleResult = await client.query(
      `INSERT INTO roles (name, permissions)
       VALUES ($1, $2)
       RETURNING id, name, created_at, updated_at`,
      [input.name, JSON.stringify(permStrings)]
    );
    const role = roleResult.rows[0];

    // Insert into role_permissions
    if (input.permissions.length > 0) {
      for (const perm of input.permissions) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission, max_stage)
           VALUES ($1, $2, $3)
           ON CONFLICT (role_id, permission) DO NOTHING`,
          [role.id, perm.permission, perm.max_stage ?? null]
        );
      }
    }

    await client.query('COMMIT');

    return {
      id: role.id,
      name: role.name,
      permissions: input.permissions.map((p) => ({
        permission: p.permission,
        max_stage: p.max_stage ?? null,
      })),
      user_count: 0,
      created_at: role.created_at,
      updated_at: role.updated_at,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateRole(id: string, input: UpdateRoleInput): Promise<RoleDetail> {
  // Fetch current role
  const roleResult = await query('SELECT id, name FROM roles WHERE id = $1', [id]);
  if (roleResult.rows.length === 0) {
    throw new NotFoundError('Role not found');
  }
  const currentRole = roleResult.rows[0];

  // Admin role cannot be edited at all
  if (currentRole.name === SUPER_ADMIN_ROLE) {
    throw new ForbiddenError('The Admin role is protected and cannot be modified via the API');
  }

  // Default roles cannot be renamed
  if (DEFAULT_ROLE_NAMES.includes(currentRole.name)) {
    if (input.name !== undefined && input.name !== currentRole.name) {
      throw new ForbiddenError(`Default role "${currentRole.name}" cannot be renamed`);
    }
  }

  // Validate permission keys if provided
  if (input.permissions && input.permissions.length > 0) {
    validatePermissions(input.permissions);
  }

  // Check new name uniqueness if renaming
  if (input.name && input.name !== currentRole.name) {
    const nameCheck = await query('SELECT id FROM roles WHERE name = $1 AND id != $2', [
      input.name,
      id,
    ]);
    if (nameCheck.rows.length > 0) {
      throw new ConflictError(`Role name "${input.name}" already exists`);
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Update roles table
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }

    if (input.permissions !== undefined) {
      const permStrings = input.permissions.map((p) => p.permission);
      updates.push(`permissions = $${paramIndex++}`);
      values.push(JSON.stringify(permStrings));
    }

    if (updates.length > 0) {
      values.push(id);
      await client.query(
        `UPDATE roles SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex}`,
        values
      );
    }

    // Replace role_permissions if permissions were provided
    if (input.permissions !== undefined) {
      // Delete existing permissions for this role
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [id]);

      // Insert new permissions
      for (const perm of input.permissions) {
        await client.query(
          `INSERT INTO role_permissions (role_id, permission, max_stage)
           VALUES ($1, $2, $3)`,
          [id, perm.permission, perm.max_stage ?? null]
        );
      }
    }

    await client.query('COMMIT');

    return getRoleById(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteRole(id: string): Promise<void> {
  const roleResult = await query('SELECT id, name FROM roles WHERE id = $1', [id]);
  if (roleResult.rows.length === 0) {
    throw new NotFoundError('Role not found');
  }
  const role = roleResult.rows[0];

  // Cannot delete any default role (including Admin)
  if (DEFAULT_ROLE_NAMES.includes(role.name)) {
    throw new ForbiddenError(`Default role "${role.name}" cannot be deleted`);
  }

  // Cannot delete if users are assigned to this role
  const userCheck = await query('SELECT COUNT(*) as count FROM users WHERE role_id = $1', [id]);
  const userCount = parseInt(userCheck.rows[0].count, 10);
  if (userCount > 0) {
    throw new ConflictError(
      `Cannot delete role "${role.name}": ${userCount} user(s) are currently assigned to it. ` +
        'Reassign them to a different role first.'
    );
  }

  // role_permissions rows will cascade-delete
  await query('DELETE FROM roles WHERE id = $1', [id]);
}
