exports.up = (pgm) => {
  // Create the trigger function
  pgm.sql(`
    CREATE OR REPLACE FUNCTION trigger_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Apply the trigger to all tables that have an updated_at column
  const tables = [
    'roles',
    'users',
    'products',
    'child_boxes',
    'master_cartons',
    'carton_child_mapping',
    'dispatch_records',
  ];

  tables.forEach((table) => {
    pgm.sql(`
      CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON ${table}
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_updated_at();
    `);
  });
};

exports.down = (pgm) => {
  const tables = [
    'roles',
    'users',
    'products',
    'child_boxes',
    'master_cartons',
    'carton_child_mapping',
    'dispatch_records',
  ];

  tables.forEach((table) => {
    pgm.sql(`DROP TRIGGER IF EXISTS set_updated_at ON ${table};`);
  });

  pgm.sql('DROP FUNCTION IF EXISTS trigger_set_updated_at();');
};
