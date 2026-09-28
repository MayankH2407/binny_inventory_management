/**
 * Adds MISSING to child_box_status, for the physical stock reconciliation
 * feature (see stockReconciliation.service.ts). A box is set to MISSING only
 * when a reconciliation session is POSTED and the box was expected but never
 * scanned — reversible by scanning it in a later session (restores to FREE).
 *
 * Every existing child-box status predicate in the codebase is a POSITIVE
 * enumeration (= 'FREE', IN (...)) — see the PARTIAL status migration for the
 * same reasoning — so this new value drops out of packing, dispatch, sample,
 * e-commerce and every stock query with no other code changes.
 *
 * Split into its own file: node-pg-migrate runs all pending migrations in a
 * single transaction, and PostgreSQL forbids using a new enum value in the
 * transaction that added it.
 */
exports.up = (pgm) => {
  pgm.addTypeValue('child_box_status', 'MISSING', { ifNotExists: true });
};

exports.down = () => {
  // PostgreSQL does not support removing values from an enum type.
  // Down migration is intentionally a no-op; the unused value is harmless.
};
