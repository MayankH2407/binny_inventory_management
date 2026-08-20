import bcrypt from 'bcryptjs';
import { getClient } from '../config/database';
import { logger } from './logger';

const SALT_ROUNDS = 12;

const DEFAULT_ROLES = [
  { name: 'Admin', permissions: ['users:create','users:read','users:update','users:delete','roles:manage','products:create','products:read','products:update','products:delete','child_boxes:create','child_boxes:read','child_boxes:update','child_boxes:delete','cartons:create','cartons:read','cartons:update','cartons:close','cartons:reopen','cartons:delete','packing:pack','packing:unpack','dispatch:create','dispatch:read','dispatch:update','reports:view_all','reports:export','audit:read','settings:manage'] },
  { name: 'Supervisor', permissions: ['users:create','users:read','users:update','products:read','products:create','products:update','child_boxes:create','child_boxes:read','child_boxes:update','cartons:create','cartons:read','cartons:update','cartons:close','cartons:reopen','packing:pack','packing:unpack','dispatch:read','reports:view_all','reports:export'] },
  { name: 'Warehouse Operator', permissions: ['products:read','child_boxes:create','child_boxes:read','cartons:create','cartons:read','cartons:close','packing:pack','packing:unpack','reports:view_own'] },
  { name: 'Dispatch Operator', permissions: ['products:read','child_boxes:read','cartons:read','dispatch:create','dispatch:read','dispatch:update','reports:view_dispatch'] },
];

const ADMIN_EMAIL = 'admin@binny.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'System Administrator';

/**
 * Auto-seeds roles and admin user on every startup.
 * - Ensures all default roles exist.
 * - Creates admin user if missing.
 * Never touches an existing admin user's password — a real deployed instance
 * may have had its admin password rotated deliberately (e.g. by the client),
 * and this must not silently revert that to the public default on restart.
 * Safe to call repeatedly (idempotent).
 */
export async function autoSeed(): Promise<void> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Ensure roles exist
    for (const role of DEFAULT_ROLES) {
      const existing = await client.query('SELECT id FROM roles WHERE name = $1', [role.name]);
      if (existing.rows.length === 0) {
        await client.query('INSERT INTO roles (name, permissions) VALUES ($1, $2)', [
          role.name,
          JSON.stringify(role.permissions),
        ]);
        logger.info(`  Created role: ${role.name}`);
      }
    }

    const roleResult = await client.query("SELECT id FROM roles WHERE name = 'Admin'");
    if (roleResult.rows.length === 0) {
      throw new Error('Admin role not found after seeding roles');
    }

    // Check if admin user exists
    const adminResult = await client.query(
      'SELECT id, password_hash FROM users WHERE email = $1',
      [ADMIN_EMAIL]
    );

    if (adminResult.rows.length === 0) {
      // Create admin user
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
      await client.query(
        'INSERT INTO users (email, password_hash, name, role_id, is_active) VALUES ($1, $2, $3, $4, true)',
        [ADMIN_EMAIL, passwordHash, ADMIN_NAME, roleResult.rows[0].id]
      );
      logger.info(`Auto-seed: admin user created (${ADMIN_EMAIL})`);
    } else {
      // Admin user already exists — leave its password exactly as-is. It may
      // have been rotated deliberately (e.g. by the client), and re-checking
      // it against the known public default here would let this function
      // silently overwrite a real, rotated credential on every restart.
      logger.debug('Auto-seed: admin user already exists, leaving password untouched');
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Auto-seed failed', error as Error);
  } finally {
    client.release();
  }
}
