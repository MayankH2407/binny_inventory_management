exports.up = (pgm) => {
  // Create the role_permissions normalized table
  pgm.createTable('role_permissions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    role_id: {
      type: 'uuid',
      notNull: true,
      references: '"roles"',
      onDelete: 'CASCADE',
    },
    permission: {
      type: 'varchar(100)',
      notNull: true,
    },
    max_stage: {
      type: 'varchar(50)',
      notNull: false,
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

  // Unique constraint: one row per (role, permission)
  pgm.addConstraint('role_permissions', 'uq_role_permissions_role_perm', {
    unique: ['role_id', 'permission'],
  });

  // Indexes for join performance
  pgm.createIndex('role_permissions', 'role_id', { name: 'idx_role_permissions_role' });
  pgm.createIndex('role_permissions', 'permission', { name: 'idx_role_permissions_permission' });

  // updated_at trigger (reuse the existing trigger function from migration 11)
  pgm.sql(`
    CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON role_permissions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_updated_at();
  `);

  // Backfill from existing roles.permissions jsonb column
  pgm.sql(`
    INSERT INTO role_permissions (role_id, permission)
    SELECT id, jsonb_array_elements_text(permissions)
    FROM roles
    WHERE jsonb_array_length(permissions) > 0
    ON CONFLICT (role_id, permission) DO NOTHING;
  `);

  // Log the backfill count
  pgm.sql(`
    DO $$
    DECLARE
      inserted_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO inserted_count FROM role_permissions;
      RAISE NOTICE 'role_permissions backfill complete: % rows inserted', inserted_count;
    END;
    $$;
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('role_permissions');
};
