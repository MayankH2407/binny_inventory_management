exports.up = (pgm) => {
  pgm.addTypeValue('child_box_status', 'ECOMMERCE', { ifNotExists: true, after: 'PACKED' });
};
exports.down = () => {
  // PostgreSQL does not support removing values from an enum type.
};
