/**
 * Jest global setup — runs after the test framework is installed in the
 * environment but before any test file.
 *
 * Loads .env from backend/ (the CWD when running `npm test` from backend/)
 * so that DATABASE_URL and JWT_SECRET are available before env.ts is
 * imported by the production modules.
 */
import path from 'path';
import dotenv from 'dotenv';

// Load backend/.env (relative to this file's directory = backend/tests/)
const envPath = path.resolve(__dirname, '..', '.env');
const result = dotenv.config({ path: envPath });

if (result.error) {
  // Fall back to hardcoded dev defaults so tests can still run without a .env
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://binny_admin:binny_secure_2026@localhost:5432/binny_inventory';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET ?? 'binny_jwt_secret_change_in_production';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'binny_refresh_secret_change_in_production';
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
} else {
  // Ensure NODE_ENV is 'test' so env.ts accepts it
  process.env.NODE_ENV = 'test';
}
