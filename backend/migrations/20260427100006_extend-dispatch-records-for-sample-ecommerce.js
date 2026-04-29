exports.up = (pgm) => {
  pgm.addColumns('dispatch_records', {
    sample_record_id: { type: 'uuid', references: '"sample_records"', onDelete: 'RESTRICT' },
    ecommerce_record_id: { type: 'uuid', references: '"ecommerce_records"', onDelete: 'RESTRICT' },
  });

  // Existing FK on master_carton_id is currently NOT NULL — relax to allow null when sample/ecom is the source
  pgm.alterColumn('dispatch_records', 'master_carton_id', { notNull: false });

  // CHECK: exactly one of the three FKs must be non-null
  pgm.addConstraint('dispatch_records', 'chk_dispatch_source_exactly_one', {
    check: '(CASE WHEN master_carton_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN sample_record_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN ecommerce_record_id IS NULL THEN 0 ELSE 1 END) = 1',
  });

  pgm.createIndex('dispatch_records', 'sample_record_id');
  pgm.createIndex('dispatch_records', 'ecommerce_record_id');
};

exports.down = (pgm) => {
  pgm.dropIndex('dispatch_records', 'ecommerce_record_id');
  pgm.dropIndex('dispatch_records', 'sample_record_id');
  pgm.dropConstraint('dispatch_records', 'chk_dispatch_source_exactly_one');
  pgm.alterColumn('dispatch_records', 'master_carton_id', { notNull: true });
  pgm.dropColumns('dispatch_records', ['sample_record_id', 'ecommerce_record_id']);
};
