exports.up = (pgm) => {
  pgm.sql(`ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'CHILD_LABEL_REPRINTED'`);
};

exports.down = () => {
  // PostgreSQL cannot remove an enum value; irreversible no-op.
};
