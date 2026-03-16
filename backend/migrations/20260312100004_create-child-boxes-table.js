exports.up = (pgm) => {
  pgm.createType('child_box_status', ['FREE', 'PACKED', 'DISPATCHED']);

  pgm.createTable('child_boxes', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    barcode: {
      type: 'varchar(100)',
      notNull: true,
      unique: true,
    },
    product_id: {
      type: 'uuid',
      notNull: true,
      references: '"products"',
      onDelete: 'RESTRICT',
    },
    status: {
      type: 'child_box_status',
      notNull: true,
      default: 'FREE',
    },
    quantity: {
      type: 'integer',
      notNull: true,
      default: 1,
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
  pgm.dropTable('child_boxes');
  pgm.dropType('child_box_status');
};
