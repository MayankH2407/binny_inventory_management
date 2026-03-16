require('dotenv').config({ path: '../.env' });

module.exports = {
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgresql://binny_admin:binny_secure_2026@localhost:5432/binny_inventory',
  dir: 'migrations',
  direction: 'up',
  migrationsTable: 'pgmigrations',
  schema: 'public',
  createSchema: false,
  createMigrationsSchema: false,
  checkOrder: true,
  verbose: true,
};
