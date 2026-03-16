exports.up = (pgm) => {
  pgm.createTable('customers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    firm_name: {
      type: 'varchar(255)',
      notNull: true,
    },
    address: {
      type: 'text',
    },
    delivery_location: {
      type: 'varchar(255)',
    },
    gstin: {
      type: 'varchar(15)',
    },
    private_marka: {
      type: 'varchar(255)',
    },
    gr: {
      type: 'varchar(100)',
    },
    contact_person_name: {
      type: 'varchar(150)',
    },
    contact_person_mobile: {
      type: 'varchar(15)',
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

  pgm.createIndex('customers', 'firm_name', { name: 'idx_customers_firm_name' });
  pgm.createIndex('customers', 'gstin', {
    name: 'idx_customers_gstin',
    where: 'gstin IS NOT NULL',
  });
  pgm.createIndex('customers', 'is_active', {
    name: 'idx_customers_active',
    where: 'is_active = true',
  });

  // Add updated_at trigger (same function used by other tables)
  pgm.sql(`
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON customers
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS set_updated_at ON customers');
  pgm.dropTable('customers');
};
