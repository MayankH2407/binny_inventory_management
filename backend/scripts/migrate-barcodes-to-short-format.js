/**
 * migrate-barcodes-to-short-format.js
 *
 * Compiled JS counterpart of migrate-barcodes-to-short-format.ts for running
 * inside the production container (no ts-node available).
 *
 * Idempotent: rows whose barcode does NOT match 'BINNY-%' are left untouched.
 */
const path = require('path');
const fs = require('fs');

const { getClient, pool } = require('../dist/config/database');
const { generateUniqueBarcode } = require('../dist/utils/barcodeGenerator');

const TABLES = [
  { type: 'CB', table: 'child_boxes',       column: 'barcode',           label: 'Child Boxes'    },
  { type: 'MC', table: 'master_cartons',    column: 'carton_barcode',    label: 'Master Cartons' },
  { type: 'SR', table: 'sample_records',    column: 'sample_barcode',    label: 'Samples'        },
  { type: 'EC', table: 'ecommerce_records', column: 'ecommerce_barcode', label: 'Ecommerce'      },
];

async function main() {
  const allMappings = [];
  const counts = {};

  for (const { type, table, column, label } of TABLES) {
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
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

  const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+$/, '');
  const csvFile = path.resolve(__dirname, `barcode-migration-${ts}.csv`);
  const csvLines = [
    'table,id,old_barcode,new_barcode',
    ...allMappings.map((m) => `${m.table},${m.id},${m.oldBarcode},${m.newBarcode}`),
  ];
  fs.writeFileSync(csvFile, csvLines.join('\n') + '\n', 'utf8');
  console.log(`CSV written to: ${csvFile}`);

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  pool.end().finally(() => process.exit(1));
});
