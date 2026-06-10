exports.up = (pgm) => {
  // New transaction type emitted when a legacy (pre-go-live) master carton is
  // opened for repacking — i.e. converted from an opaque count-only carton into
  // a normal, empty, trackable carton (is_legacy -> false, status -> CREATED).
  pgm.sql(`ALTER TYPE "transaction_type" ADD VALUE IF NOT EXISTS 'LEGACY_CARTON_OPENED'`);
};

exports.down = () => {
  // PostgreSQL does not support removing a value from an enum type, so this
  // migration is irreversible. Down is intentionally a no-op.
};
