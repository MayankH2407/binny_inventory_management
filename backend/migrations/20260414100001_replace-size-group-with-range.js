/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Migration: Replace size_group with size_from and size_to columns
 *
 * Converts single "size_group" text field (e.g., "6-10") into two separate
 * columns: size_from and size_to, representing the product size range.
 */

exports.up = (pgm) => {
  // Add new columns
  pgm.addColumns('products', {
    size_from: { type: 'varchar(10)', notNull: false },
    size_to: { type: 'varchar(10)', notNull: false },
  });

  // Attempt to migrate existing data: parse "X-Y" format
  pgm.sql(`
    UPDATE products
    SET size_from = split_part(size_group, '-', 1),
        size_to = split_part(size_group, '-', 2)
    WHERE size_group IS NOT NULL
      AND size_group LIKE '%-%'
  `);

  // For single-value size_group (no dash), put it in both
  pgm.sql(`
    UPDATE products
    SET size_from = size_group,
        size_to = size_group
    WHERE size_group IS NOT NULL
      AND size_group NOT LIKE '%-%'
      AND size_group != ''
  `);

  // Drop old column
  pgm.dropColumns('products', ['size_group']);
};

exports.down = (pgm) => {
  // Re-add size_group
  pgm.addColumns('products', {
    size_group: { type: 'varchar(50)', notNull: false },
  });

  // Reconstruct from range
  pgm.sql(`
    UPDATE products
    SET size_group = CASE
      WHEN size_from IS NOT NULL AND size_to IS NOT NULL AND size_from != size_to
        THEN size_from || '-' || size_to
      WHEN size_from IS NOT NULL
        THEN size_from
      ELSE NULL
    END
  `);

  // Drop new columns
  pgm.dropColumns('products', ['size_from', 'size_to']);
};
