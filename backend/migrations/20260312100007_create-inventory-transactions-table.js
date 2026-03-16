exports.up = (pgm) => {
  pgm.createType('transaction_type', [
    'CHILD_CREATED',
    'CHILD_PACKED',
    'CHILD_UNPACKED',
    'CHILD_REPACKED',
    'CARTON_CREATED',
    'CARTON_CLOSED',
    'CARTON_REOPENED',
    'CARTON_DISPATCHED',
    'CHILD_DISPATCHED',
  ]);

  pgm.createTable('inventory_transactions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    transaction_type: {
      type: 'transaction_type',
      notNull: true,
    },
    child_box_id: {
      type: 'uuid',
      references: '"child_boxes"',
      onDelete: 'SET NULL',
    },
    master_carton_id: {
      type: 'uuid',
      references: '"master_cartons"',
      onDelete: 'SET NULL',
    },
    performed_by: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },
    metadata: {
      type: 'jsonb',
      default: '{}',
    },
    notes: {
      type: 'text',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('inventory_transactions');
  pgm.dropType('transaction_type');
};
