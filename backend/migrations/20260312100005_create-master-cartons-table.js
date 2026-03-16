exports.up = (pgm) => {
  pgm.createType('master_carton_status', ['CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED']);

  pgm.createTable('master_cartons', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    carton_barcode: {
      type: 'varchar(100)',
      notNull: true,
      unique: true,
    },
    status: {
      type: 'master_carton_status',
      notNull: true,
      default: 'CREATED',
    },
    child_count: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    max_capacity: {
      type: 'integer',
      notNull: true,
      default: 50,
    },
    closed_at: {
      type: 'timestamptz',
    },
    dispatched_at: {
      type: 'timestamptz',
    },
    created_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
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
  pgm.dropTable('master_cartons');
  pgm.dropType('master_carton_status');
};
