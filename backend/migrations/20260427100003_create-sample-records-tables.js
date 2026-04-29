exports.up = (pgm) => {
  // Extend transaction_type enum with sample (and activation) transaction types
  pgm.addTypeValue('transaction_type', 'CHILD_ACTIVATED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'CHILD_SAMPLED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'CHILD_UNSAMPLED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'SAMPLE_CREATED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'SAMPLE_CLOSED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'SAMPLE_REOPENED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'SAMPLE_DISPATCHED', { ifNotExists: true });

  pgm.createType('sample_status', ['CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED']);

  pgm.createTable('sample_records', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    sample_barcode: { type: 'varchar(100)', notNull: true, unique: true },
    name: { type: 'varchar(200)', notNull: true },
    customer_id: { type: 'uuid', references: '"customers"', onDelete: 'SET NULL' },
    recipient_name: { type: 'varchar(200)' },
    purpose: { type: 'text' },
    sample_date: { type: 'date' },
    notes: { type: 'text' },
    status: { type: 'sample_status', notNull: true, default: 'CREATED' },
    child_count: { type: 'integer', notNull: true, default: 0 },
    closed_at: { type: 'timestamptz' },
    dispatched_at: { type: 'timestamptz' },
    created_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('sample_box_mapping', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    sample_record_id: { type: 'uuid', notNull: true, references: '"sample_records"', onDelete: 'CASCADE' },
    child_box_id: { type: 'uuid', notNull: true, references: '"child_boxes"', onDelete: 'CASCADE' },
    is_active: { type: 'boolean', notNull: true, default: true },
    mapped_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    unmapped_at: { type: 'timestamptz' },
    mapped_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    unmapped_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  // Only one active mapping per child box across all samples
  pgm.createIndex('sample_box_mapping', 'child_box_id', {
    name: 'idx_unique_active_sample_mapping',
    unique: true,
    where: 'is_active = true',
  });

  pgm.createIndex('sample_records', 'status');
  pgm.createIndex('sample_records', 'created_by');
  pgm.createIndex('sample_records', 'sample_date');
};

exports.down = (pgm) => {
  pgm.dropTable('sample_box_mapping');
  pgm.dropTable('sample_records');
  pgm.dropType('sample_status');
};
