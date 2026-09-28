/**
 * New transaction types for stock reconciliation posts (see
 * stockReconciliation.service.ts): STOCK_RECON_MISSING when a box/carton is
 * marked MISSING, STOCK_RECON_FOUND when a previously-MISSING item is scanned
 * again and restored to stock.
 *
 * Split into its own file: node-pg-migrate runs all pending migrations in one
 * transaction, and PostgreSQL forbids using a new enum value in the
 * transaction that added it. The table-creation migration that references
 * these values is written to come after this one.
 */
exports.up = (pgm) => {
  pgm.addTypeValue('transaction_type', 'STOCK_RECON_MISSING', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'STOCK_RECON_FOUND', { ifNotExists: true });
};

exports.down = () => {
  // PostgreSQL does not support removing values from an enum type.
};
