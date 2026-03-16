import { query } from '../config/database';
import { UserSafe } from '../types';
import { ConflictError, NotFoundError } from '../utils/errors';
import { hashPassword } from './auth.service';
import { createAuditLog } from './auditLog.service';
import { CreateUserInput, UpdateUserInput } from '../models/schemas/user.schema';
import { logger } from '../utils/logger';

const USER_SELECT = `u.id, u.email, u.name, r.name as role, u.is_active, u.last_login_at, u.created_at, u.updated_at`;

export async function createUser(
  input: CreateUserInput,
  createdBy: string
): Promise<UserSafe> {
  const existing = await query(
    'SELECT id FROM users WHERE email = $1',
    [input.email]
  );

  if (existing.rows.length > 0) {
    throw new ConflictError('Email already exists');
  }

  // Lookup role_id from role name
  const roleResult = await query('SELECT id FROM roles WHERE name = $1', [input.role]);
  if (roleResult.rows.length === 0) {
    throw new NotFoundError(`Role "${input.role}" not found`);
  }
  const roleId = roleResult.rows[0].id;

  const passwordHash = await hashPassword(input.password);

  const result = await query(
    `INSERT INTO users (email, password_hash, name, role_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, name, role_id, is_active, last_login_at, created_at, updated_at`,
    [input.email, passwordHash, input.name, roleId]
  );

  const user = result.rows[0];

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_USER',
    entityType: 'user',
    entityId: user.id,
    newValues: { email: input.email, role: input.role },
  });

  logger.info(`User created: ${input.email} by ${createdBy}`);

  return { ...user, role: input.role };
}

export async function getUserById(id: string): Promise<UserSafe> {
  const result = await query(
    `SELECT ${USER_SELECT}
     FROM users u JOIN roles r ON u.role_id = r.id
     WHERE u.id = $1`,
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('User not found');
  }

  return result.rows[0];
}

export async function getUsers(
  filters: {
    role?: string;
    search?: string;
    is_active?: boolean;
  },
  page: number = 1,
  limit: number = 25
): Promise<{ data: UserSafe[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.role) {
    conditions.push(`r.name = $${paramIndex++}`);
    values.push(filters.role);
  }
  if (filters.is_active !== undefined) {
    conditions.push(`u.is_active = $${paramIndex++}`);
    values.push(filters.is_active);
  }
  if (filters.search) {
    conditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*) FROM users u JOIN roles r ON u.role_id = r.id ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT ${USER_SELECT}
     FROM users u JOIN roles r ON u.role_id = r.id ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  updatedBy: string
): Promise<UserSafe> {
  const existing = await query(
    `SELECT u.*, r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
    [id]
  );
  if (existing.rows.length === 0) {
    throw new NotFoundError('User not found');
  }

  const oldUser = existing.rows[0];

  if (input.email && input.email !== oldUser.email) {
    const emailCheck = await query('SELECT id FROM users WHERE email = $1 AND id != $2', [
      input.email,
      id,
    ]);
    if (emailCheck.rows.length > 0) {
      throw new ConflictError('Email already in use');
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.email !== undefined) {
    fields.push(`email = $${paramIndex++}`);
    values.push(input.email);
  }
  if (input.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.role !== undefined) {
    const roleResult = await query('SELECT id FROM roles WHERE name = $1', [input.role]);
    if (roleResult.rows.length === 0) {
      throw new NotFoundError(`Role "${input.role}" not found`);
    }
    fields.push(`role_id = $${paramIndex++}`);
    values.push(roleResult.rows[0].id);
  }
  if (input.is_active !== undefined) {
    fields.push(`is_active = $${paramIndex++}`);
    values.push(input.is_active);
  }

  if (fields.length === 0) {
    return getUserById(id);
  }

  values.push(id);

  await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
    values
  );

  await createAuditLog({
    userId: updatedBy,
    action: 'UPDATE_USER',
    entityType: 'user',
    entityId: id,
    oldValues: { email: oldUser.email, name: oldUser.name, role: oldUser.role },
    newValues: input as Record<string, unknown>,
  });

  // Re-fetch with role name
  return getUserById(id);
}

export async function deleteUser(id: string, deletedBy: string): Promise<void> {
  const existing = await query('SELECT id, email FROM users WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new NotFoundError('User not found');
  }

  await query('UPDATE users SET is_active = false WHERE id = $1', [id]);

  await createAuditLog({
    userId: deletedBy,
    action: 'DELETE_USER',
    entityType: 'user',
    entityId: id,
  });

  logger.info(`User deactivated: ${existing.rows[0].email} by ${deletedBy}`);
}
