/**
 * Adds MISSING to master_carton_status — the legacy-carton counterpart of
 * MISSING on child_box_status (see 20260925100001). A legacy carton has no
 * individual box rows behind it, so it can only be reconciled as one opaque
 * unit: present or missing. Also used when a normal (non-legacy) carton's
 * last box is marked missing during a reconciliation post, so an empty,
 * unaccounted-for carton doesn't linger as CREATED/ACTIVE forever.
 *
 * Split into its own file for the same reason as 20260925100001: PostgreSQL
 * forbids using a new enum value inside the transaction that added it, and
 * node-pg-migrate runs all pending migrations in one transaction.
 */
exports.up = (pgm) => {
  pgm.addTypeValue('master_carton_status', 'MISSING', { ifNotExists: true });
};

exports.down = () => {
  // PostgreSQL does not support removing values from an enum type.
};
