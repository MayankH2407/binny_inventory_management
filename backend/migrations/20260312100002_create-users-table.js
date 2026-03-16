exports.up = (pgm) => {
  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'varchar(255)',
      notNull: true,
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
    },
    role_id: {
      type: 'uuid',
      notNull: true,
      references: '"roles"',
      onDelete: 'RESTRICT',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    last_login_at: {
      type: 'timestamptz',
    },
    refresh_token: {
      type: 'varchar(500)',
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
  pgm.dropTable('users');
};
