/**
 * Emitted when a whole master carton sitting in the E-commerce Area is broken
 * into individually-dispatchable loose boxes. Distinct from CARTON_UNECOMMERCED
 * (which means the carton LEFT e-commerce back to main stock) because the stock
 * outcome is the opposite: here the stock stays committed to e-commerce.
 */
exports.up = (pgm) => {
  pgm.sql(`ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'CARTON_UNPACKED_TO_ECOM_POOL'`);
};

exports.down = () => {
  // PostgreSQL cannot remove an enum value; irreversible no-op.
};
