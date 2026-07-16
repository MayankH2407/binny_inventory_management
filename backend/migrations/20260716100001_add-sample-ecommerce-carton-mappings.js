exports.up = (pgm) => {
  // New transaction types for whole-carton scan-in (carton stays intact — see
  // sample.service.ts#scanCartonToSample / ecommerce.service.ts#scanCartonToEcommerce)
  pgm.addTypeValue('transaction_type', 'CARTON_SAMPLED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'CARTON_ECOMMERCED', { ifNotExists: true });

  pgm.createTable('sample_carton_mapping', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    sample_record_id: { type: 'uuid', notNull: true, references: '"sample_records"', onDelete: 'CASCADE' },
    master_carton_id: { type: 'uuid', notNull: true, references: '"master_cartons"' },
    is_active: { type: 'boolean', notNull: true, default: true },
    mapped_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    mapped_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    unmapped_at: { type: 'timestamptz' },
    unmapped_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  // A master carton can only be actively allocated to one sample at a time
  pgm.createIndex('sample_carton_mapping', 'master_carton_id', {
    name: 'uq_sample_carton_active',
    unique: true,
    where: 'is_active = true',
  });
  pgm.createIndex('sample_carton_mapping', 'sample_record_id', {
    name: 'idx_sample_carton_mapping_record_active',
    where: 'is_active = true',
  });

  pgm.createTable('ecommerce_carton_mapping', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    ecommerce_record_id: { type: 'uuid', notNull: true, references: '"ecommerce_records"', onDelete: 'CASCADE' },
    master_carton_id: { type: 'uuid', notNull: true, references: '"master_cartons"' },
    is_active: { type: 'boolean', notNull: true, default: true },
    mapped_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    mapped_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    unmapped_at: { type: 'timestamptz' },
    unmapped_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  // A master carton can only be actively allocated to one e-commerce record at a time
  pgm.createIndex('ecommerce_carton_mapping', 'master_carton_id', {
    name: 'uq_ecommerce_carton_active',
    unique: true,
    where: 'is_active = true',
  });
  pgm.createIndex('ecommerce_carton_mapping', 'ecommerce_record_id', {
    name: 'idx_ecommerce_carton_mapping_record_active',
    where: 'is_active = true',
  });
};

exports.down = (pgm) => {
  pgm.dropTable('ecommerce_carton_mapping');
  pgm.dropTable('sample_carton_mapping');
  // NOTE: transaction_type enum values (CARTON_SAMPLED / CARTON_ECOMMERCED) are not
  // removed on down — Postgres does not support dropping enum values.
};
