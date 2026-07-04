/**
 * Normalize products.article_name to UPPERCASE (client requirement, 2026-07-03).
 *
 * The June-5 Title-Case normalization was applied "going-forward only, no
 * backfill", so the catalog ended up split across casings (e.g. "MOGLI PLUS 01"
 * vs "Mogli Plus 01"). Because the QR-create dropdown and the colour/size
 * lookups key off the exact article_name string, such an article showed up
 * twice (once per casing that still had active rows). This backfill collapses
 * every article to a single UPPERCASE form; new writes are uppercased in code
 * (product.service.ts toUpperName).
 *
 * Idempotent (WHERE guard). SKUs are unaffected — SKU generation already
 * uppercase-normalizes its tokens, so no SKU changes. Scope: article_name only
 * (colour/section/article_group intentionally unchanged).
 */
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE products
    SET article_name = UPPER(article_name), updated_at = NOW()
    WHERE article_name <> UPPER(article_name);
  `);
};

exports.down = () => {
  // Irreversible data normalization (original mixed casing is not recoverable
  // from the uppercased value). Restore from the pre-migration DB backup if a
  // revert is required: backup-pre-article-name-uppercase-20260703.sql.gz.
};
