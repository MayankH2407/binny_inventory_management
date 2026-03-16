import { Pool, PoolConfig } from 'pg';
import { env } from './env';
import { logger } from '../utils/logger';

const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  allowExitOnIdle: false,
};

if (env.NODE_ENV === 'production') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(poolConfig);

pool.on('error', (err: Error) => {
  logger.error('Unexpected error on idle database client', err);
});

pool.on('connect', () => {
  logger.debug('New client connected to PostgreSQL pool');
});

export async function testConnection(): Promise<void> {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    logger.info(`Database connected successfully at ${result.rows[0].current_time}`);
  } catch (error) {
    logger.error('Failed to connect to database', error as Error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

export async function closePool(): Promise<void> {
  try {
    await pool.end();
    logger.info('Database pool closed');
  } catch (error) {
    logger.error('Error closing database pool', error as Error);
  }
}

export function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export function getClient() {
  return pool.connect();
}
