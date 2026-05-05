import * as crypto from 'crypto';
import { PoolClient } from 'pg';
import { query } from '../config/database';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RANDOM_LENGTH = 6;
const MAX_ATTEMPTS = 10;

export type BarcodeType = 'CB' | 'MC' | 'SR' | 'EC';

const TABLE_BY_TYPE: Record<BarcodeType, { table: string; column: string }> = {
  CB: { table: 'child_boxes', column: 'barcode' },
  MC: { table: 'master_cartons', column: 'carton_barcode' },
  SR: { table: 'sample_records', column: 'sample_barcode' },
  EC: { table: 'ecommerce_records', column: 'ecommerce_barcode' },
};

function generateRandom(length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return result;
}

export async function generateUniqueBarcode(
  type: BarcodeType,
  client?: PoolClient
): Promise<string> {
  const { table, column } = TABLE_BY_TYPE[type];
  const exec = client ? client.query.bind(client) : query;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = type + generateRandom(RANDOM_LENGTH);
    const result = await exec(`SELECT 1 FROM ${table} WHERE ${column} = $1 LIMIT 1`, [candidate]);
    if (result.rows.length === 0) return candidate;
  }
  throw new Error(`Failed to generate unique ${type} barcode after ${MAX_ATTEMPTS} attempts`);
}
