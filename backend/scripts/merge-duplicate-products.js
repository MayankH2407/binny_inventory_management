/**
 * One-off data-cleanup script: merges duplicate `products` rows created by
 * the (now-fixed) bulkCreateProductsBySizeRange bug — re-running that tool
 * for a colour/size that already existed silently inserted a second full
 * row per size instead of erroring, splitting real stock across two product
 * IDs for the same article_name+colour+size.
 *
 * Identity for "same product": article_name + colour + size (normalized the
 * same way createProduct's own duplicate guard does), among is_active=true
 * rows. A group is ONLY auto-merged if every row in it agrees on mrp, hsn_code,
 * AND article_code — if those differ, the group is a genuine data mismatch
 * (possibly two intentionally-different catalog items), not a mechanical
 * duplicate, and is skipped/reported for manual review instead.
 *
 * For each safe group: the OLDEST row (by created_at) is canonical. Every
 * other row's child_boxes are re-pointed to the canonical product_id, then
 * the other row is soft-deactivated (is_active = false) — never deleted, so
 * the merge is reversible and the audit trail (CREATE_PRODUCT logs, etc.)
 * stays intact.
 *
 * Usage:
 *   node merge-duplicate-products.js            # dry run (default) — no writes
 *   node merge-duplicate-products.js --execute  # real run, wrapped in one
 *                                                  transaction (all-or-nothing)
 */
const { Pool } = require('pg');

const DRY_RUN = !process.argv.includes('--execute');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const groupsResult = await client.query(`
      SELECT article_name, colour, size
      FROM products
      WHERE is_active = true
      GROUP BY article_name, colour, size
      HAVING COUNT(*) > 1
      ORDER BY article_name, colour, size
    `);

    console.log(`Found ${groupsResult.rows.length} duplicate (article_name, colour, size) groups.\n`);

    const summary = { merged_groups: 0, boxes_moved: 0, rows_deactivated: 0, skipped_mismatch: 0 };
    const mismatchLog = [];
    const mergeLog = [];

    for (const g of groupsResult.rows) {
      const rowsResult = await client.query(
        `SELECT id, mrp, hsn_code, article_code, created_at,
                (SELECT COUNT(*) FROM child_boxes cb WHERE cb.product_id = products.id) AS box_count
         FROM products
         WHERE article_name = $1 AND colour = $2 AND size = $3 AND is_active = true
         ORDER BY created_at ASC`,
        [g.article_name, g.colour, g.size]
      );
      const rows = rowsResult.rows;

      const distinctMrp = new Set(rows.map(r => r.mrp)).size;
      const distinctHsn = new Set(rows.map(r => r.hsn_code || '')).size;
      const distinctCode = new Set(rows.map(r => r.article_code)).size;

      if (distinctMrp > 1 || distinctHsn > 1 || distinctCode > 1) {
        summary.skipped_mismatch++;
        mismatchLog.push({
          article_name: g.article_name, colour: g.colour, size: g.size,
          rows: rows.map(r => ({ id: r.id, mrp: r.mrp, hsn_code: r.hsn_code, article_code: r.article_code, box_count: Number(r.box_count) })),
        });
        continue;
      }

      const canonical = rows[0]; // oldest
      const others = rows.slice(1);
      let boxesMovedThisGroup = 0;

      for (const other of others) {
        const boxCount = Number(other.box_count);
        if (boxCount > 0) {
          if (!DRY_RUN) {
            await client.query(`UPDATE child_boxes SET product_id = $1 WHERE product_id = $2`, [canonical.id, other.id]);
          }
          boxesMovedThisGroup += boxCount;
        }
        if (!DRY_RUN) {
          await client.query(`UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1`, [other.id]);
        }
        summary.rows_deactivated++;
      }

      summary.boxes_moved += boxesMovedThisGroup;
      summary.merged_groups++;
      mergeLog.push({
        article_name: g.article_name, colour: g.colour, size: g.size,
        canonical_id: canonical.id, canonical_created_at: canonical.created_at,
        retired_ids: others.map(o => o.id),
        boxes_moved: boxesMovedThisGroup,
      });
    }

    console.log('=== MERGE LOG (safe groups) ===');
    for (const m of mergeLog) {
      console.log(`${m.article_name} / ${m.colour} / size ${m.size} — canonical ${m.canonical_id} (created ${m.canonical_created_at}), retiring ${m.retired_ids.length} row(s), moved ${m.boxes_moved} box(es)`);
    }

    console.log('\n=== SKIPPED — ATTRIBUTE MISMATCH, NEEDS MANUAL REVIEW ===');
    for (const m of mismatchLog) {
      console.log(`${m.article_name} / ${m.colour} / size ${m.size}:`);
      for (const r of m.rows) {
        console.log(`    id=${r.id} mrp=${r.mrp} hsn=${r.hsn_code} code=${r.article_code} boxes=${r.box_count}`);
      }
    }

    console.log('\n=== SUMMARY ===');
    console.log(summary);
    console.log(DRY_RUN ? '\nDRY RUN — no changes written. Re-run with --execute to apply.' : '\nEXECUTED — committing transaction.');

    if (DRY_RUN) {
      await client.query('ROLLBACK');
    } else {
      await client.query('COMMIT');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('FATAL — rolled back, nothing was changed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
