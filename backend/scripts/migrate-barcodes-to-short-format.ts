/**
 * migrate-barcodes-to-short-format.ts
 *
 * One-shot migration: replaces legacy BINNY-{TYPE}-{uuid} barcodes with the
 * new 8-char short format (e.g. CBA3K7P9) using generateUniqueBarcode().
 *
 * Idempotent: rows whose barcode does NOT match 'BINNY-%' are left untouched.
 */

import * as path from 'path';
import * as fs from 'fs';
import dotenv from 'dotenv';

// Load env from backend/.env (script lives in backend/scripts/)
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { getClient, pool } from '../src/config/database';
import { generateUniqueBarcode, BarcodeType } from '../src/utils/barcodeGenerator';

interface TableDef {
  type: BarcodeType;
  table: string;
  column: string;
  label: string;
}

const TABLES: TableDef[] = [
  { type: 'CB', table: 'child_boxes',       column: 'barcode',            label: 'Child Boxes'    },
  { type: 'MC', table: 'master_cartons',    column: 'carton_barcode',     label: 'Master Cartons' },
  { type: 'SR', table: 'sample_records',    column: 'sample_barcode',     label: 'Samples'        },
  { type: 'EC', table: 'ecommerce_records', column: 'ecommerce_barcode',  label: 'Ecommerce'      },
];

interface Mapping {
  table: string;
  id: string | number;
  oldBarcode: string;
  newBarcode: string;
}

async function main(): Promise<void> {
  const allMappings: Mapping[] = [];
  const counts: Record<string, number> = {};

  for (const { type, table, column, label } of TABLES) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<{ id: string; old_barcode: string }>(
        `SELECT id, ${column} AS old_barcode FROM ${table} WHERE ${column} LIKE 'BINNY-%'`
      );

      for (const row of rows) {
        const newBarcode = await generateUniqueBarcode(type, client);
        await client.query(
          `UPDATE ${table} SET ${column} = $1 WHERE id = $2`,
          [newBarcode, row.id]
        );
        allMappings.push({
          table,
          id: row.id,
          oldBarcode: row.old_barcode,
          newBarcode,
        });
      }

      await client.query('COMMIT');
      counts[table] = rows.length;
      console.log(`Migrated ${label} (${table}): ${rows.length} rows`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Write CSV
  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '');
  const csvFile = path.resolve(__dirname, `barcode-migration-${ts}.csv`);

  const csvLines = [
    'table,id,old_barcode,new_barcode',
    ...allMappings.map(
      (m) => `${m.table},${m.id},${m.oldBarcode},${m.newBarcode}`
    ),
  ];
  fs.writeFileSync(csvFile, csvLines.join('\n') + '\n', 'utf8');

  console.log(`CSV written to: ${csvFile}`);

  // Close pool and exit
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  pool.end().finally(() => process.exit(1));
});
