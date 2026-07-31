/**
 * Supports taking specific boxes out of a whole-carton sample allocation
 * (Samples module simplification, 2026-07-31) — a carton scanned into a
 * sample can now have individual boxes pulled out as loose, foot-splittable
 * items while the rest of the carton stays reserved.
 *
 * source_master_carton_id is provenance only (which carton a loose sample
 * item was taken out of, for UI messaging like "2 of 24 taken out
 * individually") — nothing reads it to decide behavior.
 */
exports.up = (pgm) => {
  pgm.addColumns('sample_box_mapping', {
    source_master_carton_id: {
      type: 'uuid',
      references: '"master_cartons"',
      onDelete: 'SET NULL',
    },
  });
  pgm.createIndex('sample_box_mapping', 'source_master_carton_id', {
    where: '"source_master_carton_id" IS NOT NULL',
  });

  pgm.sql(`ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'CARTON_UNSAMPLED'`);
  pgm.sql(`ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'CARTON_UNECOMMERCED'`);
};

exports.down = (pgm) => {
  pgm.dropIndex('sample_box_mapping', 'source_master_carton_id');
  pgm.dropColumns('sample_box_mapping', ['source_master_carton_id']);
  // PostgreSQL cannot remove an enum value; irreversible no-op for the transaction_type additions.
};
