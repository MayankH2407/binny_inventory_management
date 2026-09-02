/**
 * Emitted when a whole master carton allocated to a sample is broken into
 * individually-dispatchable (and foot-splittable) loose boxes. Distinct from
 * CARTON_UNSAMPLED (which means the carton LEFT the sample back to main stock)
 * because the stock outcome is the opposite: here the stock stays committed to
 * the sample. Mirrors CARTON_UNPACKED_TO_ECOM_POOL.
 *
 * Split into its own file because node-pg-migrate runs all pending migrations
 * in a single transaction by default, and PostgreSQL forbids using a new enum
 * value in the transaction that added it — the next migration (the samples
 * pool re-shape) is written to reference only pre-existing enum values, so
 * both can safely run in one `migrate:up`.
 */
exports.up = (pgm) => {
  pgm.sql(`ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'CARTON_UNPACKED_TO_SAMPLE'`);
};

exports.down = () => {
  // PostgreSQL cannot remove an enum value; irreversible no-op.
};
