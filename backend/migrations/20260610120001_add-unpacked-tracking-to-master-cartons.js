exports.up = (pgm) => {
  pgm.addColumns('master_cartons', {
    unpacked_at: {
      type: 'timestamptz',
    },
    unpacked_by: {
      type: 'uuid',
      references: '"users"(id)',
      onDelete: 'SET NULL',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('master_cartons', ['unpacked_at', 'unpacked_by']);
};
