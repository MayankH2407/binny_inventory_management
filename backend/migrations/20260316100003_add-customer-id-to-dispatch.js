exports.up = (pgm) => {
  pgm.addColumns('dispatch_records', {
    customer_id: {
      type: 'uuid',
      references: '"customers"',
      onDelete: 'SET NULL',
    },
  });

  pgm.createIndex('dispatch_records', 'customer_id', {
    name: 'idx_dr_customer_id',
    where: 'customer_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('dispatch_records', 'customer_id', { name: 'idx_dr_customer_id' });
  pgm.dropColumns('dispatch_records', ['customer_id']);
};
