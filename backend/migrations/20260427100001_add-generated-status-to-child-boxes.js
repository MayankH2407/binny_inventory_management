exports.up = (pgm) => {
  pgm.addTypeValue('child_box_status', 'GENERATED', { ifNotExists: true, before: 'FREE' });
};

exports.down = () => {
  // PostgreSQL does not support removing values from an enum type.
  // Down migration is intentionally a no-op; the unused value is harmless.
};
