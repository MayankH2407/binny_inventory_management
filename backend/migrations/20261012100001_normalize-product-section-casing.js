/**
 * Repairs products whose `section` was saved Title-Cased by the bulk import
 * ("PU" -> "Pu", "EVA" -> "Eva", "PVC" -> "Pvc"). Such rows matched neither
 * the Products section tabs / edit dropdown nor the inventory section grouping.
 * Rewrites any product.section that case-insensitively equals a
 * product_sections.name but differs in casing. Idempotent; SKUs are unaffected
 * (they already use the upper-cased section).
 */
exports.up = (pgm) => {
  pgm.sql(`
    UPDATE products p
       SET section = s.name, updated_at = NOW()
      FROM product_sections s
     WHERE LOWER(TRIM(p.section)) = LOWER(s.name)
       AND p.section <> s.name;
  `);
};

exports.down = () => {};
