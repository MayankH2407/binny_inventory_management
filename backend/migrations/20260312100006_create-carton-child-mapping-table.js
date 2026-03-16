exports.up = (pgm) => {
  pgm.createTable('carton_child_mapping', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    master_carton_id: {
      type: 'uuid',
      notNull: true,
      references: '"master_cartons"',
      onDelete: 'CASCADE',
    },
    child_box_id: {
      type: 'uuid',
      notNull: true,
      references: '"child_boxes"',
      onDelete: 'CASCADE',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    packed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    unpacked_at: {
      type: 'timestamptz',
    },
    packed_by: {
      type: 'uuid',
      references: '"users"',
      onDelete: 'SET NULL',
    },
    unpacked_by: {
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

  // A child box can only be actively mapped to one master carton at a time
  pgm.createIndex('carton_child_mapping', 'child_box_id', {
    unique: true,
    where: 'is_active = true',
    name: 'idx_unique_active_child_box',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('carton_child_mapping', 'child_box_id', {
    name: 'idx_unique_active_child_box',
  });
  pgm.dropTable('carton_child_mapping');
};
