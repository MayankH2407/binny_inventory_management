import { Pool } from 'pg';
import { seedRoles } from './001_roles';
import { seedAdminUser } from './002_admin_user';
import { seedProducts } from './003_products';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://binny_admin:binny_secure_2026@localhost:5432/binny_inventory';

async function runSeeds(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log('Starting database seeding...\n');

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await seedRoles(client);
      await seedAdminUser(client);
      await seedProducts(client);

      await client.query('COMMIT');
      console.log('\nAll seeds completed successfully.');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('\nSeed failed, transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

runSeeds()
  .then(() => {
    console.log('Seeding process finished.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seeding process failed:', error);
    process.exit(1);
  });
