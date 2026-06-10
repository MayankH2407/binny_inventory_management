/**
 * Samples can be dispatched as a single foot rather than a pair. Each box mapped
 * into a sample carries a `foot` marker: LEFT, RIGHT, or PAIR (default).
 */
exports.up = (pgm) => {
  pgm.addColumns('sample_box_mapping', {
    foot: {
      type: 'varchar(10)',
      notNull: true,
      default: 'PAIR',
      check: "foot IN ('LEFT', 'RIGHT', 'PAIR')",
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('sample_box_mapping', ['foot']);
};
