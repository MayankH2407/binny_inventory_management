exports.up = (pgm) => {
  pgm.createTable('dispatch_records', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    master_carton_id: {
      type: 'uuid',
      notNull: true,
      references: '"master_cartons"',
      onDelete: 'RESTRICT',
    },
    dispatched_by: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },
    destination: {
      type: 'varchar(255)',
    },
    transport_details: {
      type: 'text',
    },
    lr_number: {
      type: 'varchar(100)',
    },
    vehicle_number: {
      type: 'varchar(50)',
    },
    dispatch_date: {
      type: 'date',
      notNull: true,
      default: pgm.func('CURRENT_DATE'),
    },
    notes: {
      type: 'text',
    },
    metadata: {
      type: 'jsonb',
      default: '{}',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('dispatch_records');
};
