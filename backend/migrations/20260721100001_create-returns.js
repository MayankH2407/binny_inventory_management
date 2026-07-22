exports.up = (pgm) => {
  // New transaction types for returns (see return.service.ts)
  pgm.addTypeValue('transaction_type', 'CHILD_RETURNED', { ifNotExists: true });
  pgm.addTypeValue('transaction_type', 'CARTON_RETURNED', { ifNotExists: true });

  pgm.createTable('return_records', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    dispatch_record_id: { type: 'uuid', references: '"dispatch_records"', onDelete: 'SET NULL' },
    customer_id: { type: 'uuid', references: '"customers"', onDelete: 'SET NULL' },
    returned_by: { type: 'uuid', notNull: true, references: '"users"', onDelete: 'RESTRICT' },
    return_date: { type: 'date', notNull: true, default: pgm.func('CURRENT_DATE') },
    reason: { type: 'text' },
    notes: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.createTable('return_items', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    return_record_id: { type: 'uuid', notNull: true, references: '"return_records"', onDelete: 'CASCADE' },
    child_box_id: { type: 'uuid', references: '"child_boxes"', onDelete: 'SET NULL' },
    master_carton_id: { type: 'uuid', references: '"master_cartons"', onDelete: 'SET NULL' },
    // Origin dispatch this item was returned from — resolved server-side even for
    // blind scan-in (where return_records.dispatch_record_id is null because a
    // single return can span items from different dispatches).
    dispatch_record_id: { type: 'uuid', references: '"dispatch_records"', onDelete: 'SET NULL' },
    item_type: { type: 'varchar(10)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.addConstraint('return_items', 'chk_return_item_type', {
    check: "item_type IN ('BOX', 'CARTON')",
  });

  pgm.createIndex('return_records', 'return_date');
  pgm.createIndex('return_records', 'customer_id', {
    name: 'idx_return_records_customer_id',
    where: 'customer_id IS NOT NULL',
  });
  pgm.createIndex('return_records', 'dispatch_record_id', {
    name: 'idx_return_records_dispatch_record_id',
    where: 'dispatch_record_id IS NOT NULL',
  });
  pgm.createIndex('return_items', 'return_record_id');
  pgm.createIndex('return_items', 'child_box_id');
  pgm.createIndex('return_items', 'dispatch_record_id', {
    name: 'idx_return_items_dispatch_record_id',
    where: 'dispatch_record_id IS NOT NULL',
  });

  pgm.sql(`
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON return_records
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS set_updated_at ON return_records');
  pgm.dropTable('return_items');
  pgm.dropTable('return_records');
  // NOTE: transaction_type enum values (CHILD_RETURNED / CARTON_RETURNED) are not
  // removed on down — Postgres does not support dropping enum values.
};
