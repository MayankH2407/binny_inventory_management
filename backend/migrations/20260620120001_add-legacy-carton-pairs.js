/**
 * Stores the number of pairs packed inside each legacy master carton.
 * Legacy cartons are count-only records (child_count = 0, no tracked child boxes).
 * This field fills the gap on the master-carton label so the warehouse knows
 * how many pairs are in a sealed pre-go-live carton without unpacking it.
 */
exports.up = (pgm) => {
  pgm.addColumns('master_cartons', { legacy_pairs: { type: 'integer' } });
};
exports.down = (pgm) => {
  pgm.dropColumns('master_cartons', ['legacy_pairs']);
};
