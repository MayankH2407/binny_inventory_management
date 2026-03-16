import { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';

const ADMIN_EMAIL = 'admin@binny.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'System Administrator';
const SALT_ROUNDS = 12;

export async function seedAdminUser(client: PoolClient): Promise<void> {
  console.log('Seeding admin user...');

  // Check if admin already exists
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);

  if (existing.rows.length > 0) {
    console.log('  Admin user already exists, skipping.');
    return;
  }

  // Get Admin role ID
  const roleResult = await client.query('SELECT id FROM roles WHERE name = $1', ['Admin']);

  if (roleResult.rows.length === 0) {
    throw new Error('Admin role not found. Please seed roles first.');
  }

  const roleId = roleResult.rows[0].id;
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

  await client.query(
    `INSERT INTO users (email, password_hash, name, role_id, is_active)
     VALUES ($1, $2, $3, $4, $5)`,
    [ADMIN_EMAIL, passwordHash, ADMIN_NAME, roleId, true]
  );

  console.log(`  Created admin user: ${ADMIN_EMAIL}`);
  console.log('Admin user seeded successfully.');
}
