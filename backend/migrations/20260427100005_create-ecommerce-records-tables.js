exports.up = (pgm) => {
  // Extend transaction_type enum with ecommerce transaction types (CHILD_ACTIVATED already added by sample migration)
  pgm.addTypeValue('transaction_type', 'CHILD_ECOMMERCED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'CHILD_UNECOMMERCED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'ECOMMERCE_CREATED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'ECOMMERCE_CLOSED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'ECOMMERCE_REOPENED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'ECOMMERCE_DISPATCHED', { ifNotExists: true });

  pgm.createType('ecommerce_status', ['CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED']);

  pgm.createTable('ecommerce_records', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    ecommerce_barcode: { type: 'varchar(100)', notNull: true, unique: true },
    name: { type: 'varchar(200)', notNull: true },
    marketplace: { type: 'varchar(100)' },
    order_reference: { type: 'varchar(200)' },
    listing_sku: { type: 'varchar(100)' },
    mapped_date: { type: 'date' },
    notes: { type: 'text' },
    status: { type: 'ecommerce_status', notNull: true, default: 'CREATED' },
    child_count: { type: 'integer', notNull: true, default: 0 },
    closed_at: { type: 'timestamptz' },
    dispatched_at: { type: 'timestamptz' },
    created_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('ecommerce_box_mapping', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    ecommerce_record_id: { type: 'uuid', notNull: true, references: '"ecommerce_records"', onDelete: 'CASCADE' },
    child_box_id: { type: 'uuid', notNull: true, references: '"child_boxes"', onDelete: 'CASCADE' },
    is_active: { type: 'boolean', notNull: true, default: true },
    mapped_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    unmapped_at: { type: 'timestamptz' },
    mapped_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    unmapped_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createIndex('ecommerce_box_mapping', 'child_box_id', {
    name: 'idx_unique_active_ecommerce_mapping',
    unique: true,
    where: 'is_active = true',
  });

  pgm.createIndex('ecommerce_records', 'status');
  pgm.createIndex('ecommerce_records', 'created_by');
  pgm.createIndex('ecommerce_records', 'marketplace');
  pgm.createIndex('ecommerce_records', 'mapped_date');
};

exports.down = (pgm) => {
  pgm.dropTable('ecommerce_box_mapping');
  pgm.dropTable('ecommerce_records');
  pgm.dropType('ecommerce_status');
};
