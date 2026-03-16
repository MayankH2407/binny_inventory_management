exports.up = (pgm) => {
  pgm.createTable('products', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    sku: {
      type: 'varchar(50)',
      notNull: true,
      unique: true,
    },
    article_name: {
      type: 'varchar(150)',
      notNull: true,
    },
    article_code: {
      type: 'varchar(20)',
      notNull: true,
    },
    colour: {
      type: 'varchar(50)',
      notNull: true,
    },
    size: {
      type: 'varchar(10)',
      notNull: true,
    },
    mrp: {
      type: 'numeric(10,2)',
      notNull: true,
    },
    description: {
      type: 'text',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
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
  pgm.dropTable('products');
};
