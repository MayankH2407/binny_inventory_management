exports.up = (pgm) => {
  // Create configurable product_sections table
  pgm.createTable('product_sections', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      unique: true,
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    display_order: {
      type: 'integer',
      notNull: true,
      default: 0,
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

  // Seed existing sections
  pgm.sql(`
    INSERT INTO product_sections (name, display_order) VALUES
      ('Hawaii', 1),
      ('PU', 2),
      ('EVA', 3),
      ('Fabrication', 4),
      ('Canvas', 5),
      ('PVC', 6),
      ('Sports Shoes', 7)
  `);

  // Add updated_at trigger
  pgm.sql(`
    CREATE TRIGGER set_updated_at_product_sections
    BEFORE UPDATE ON product_sections
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()
  `);

  // Drop the hardcoded CHECK constraint on products.section
  pgm.dropConstraint('products', 'chk_products_section');

  // Backfill NULL sections and make NOT NULL
  pgm.sql("UPDATE products SET section = 'Hawaii' WHERE section IS NULL");
  pgm.alterColumn('products', 'section', { notNull: true });

  // Backfill NULL categories and make NOT NULL
  pgm.sql("UPDATE products SET category = 'Gents' WHERE category IS NULL");
  pgm.alterColumn('products', 'category', { notNull: true });

  // Recreate section index without the WHERE clause (all rows have section now)
  pgm.dropIndex('products', 'section', { name: 'idx_products_section' });
  pgm.createIndex('products', 'section', { name: 'idx_products_section' });

  // Recreate category index without the WHERE clause
  pgm.dropIndex('products', 'category', { name: 'idx_products_category' });
  pgm.createIndex('products', 'category', { name: 'idx_products_category' });
};

exports.down = (pgm) => {
  // Restore partial indexes
  pgm.dropIndex('products', 'category', { name: 'idx_products_category' });
  pgm.createIndex('products', 'category', {
    name: 'idx_products_category',
    where: 'category IS NOT NULL',
  });

  pgm.dropIndex('products', 'section', { name: 'idx_products_section' });
  pgm.createIndex('products', 'section', {
    name: 'idx_products_section',
    where: 'section IS NOT NULL',
  });

  // Make columns nullable again
  pgm.alterColumn('products', 'section', { notNull: false });
  pgm.alterColumn('products', 'category', { notNull: false });

  // Restore CHECK constraint
  pgm.addConstraint('products', 'chk_products_section', {
    check: "section IS NULL OR section IN ('Hawaii', 'PU', 'EVA', 'Fabrication', 'Canvas', 'PVC', 'Sports Shoes')",
  });

  // Drop trigger and table
  pgm.sql('DROP TRIGGER IF EXISTS set_updated_at_product_sections ON product_sections');
  pgm.dropTable('product_sections');
};
