exports.up = (pgm) => {
  pgm.addColumns('products', {
    category: {
      type: 'varchar(50)',
    },
    section: {
      type: 'varchar(50)',
    },
    location: {
      type: 'varchar(50)',
    },
    article_group: {
      type: 'varchar(100)',
    },
    hsn_code: {
      type: 'varchar(20)',
    },
    size_group: {
      type: 'varchar(50)',
    },
  });

  pgm.addConstraint('products', 'chk_products_category', {
    check: "category IS NULL OR category IN ('Gents', 'Ladies', 'Boys', 'Girls')",
  });

  pgm.addConstraint('products', 'chk_products_section', {
    check: "section IS NULL OR section IN ('Hawaii', 'PU', 'EVA', 'Fabrication', 'Canvas', 'PVC', 'Sports Shoes')",
  });

  pgm.addConstraint('products', 'chk_products_location', {
    check: "location IS NULL OR location IN ('VKIA', 'MIA', 'F540')",
  });

  pgm.createIndex('products', 'category', {
    name: 'idx_products_category',
    where: 'category IS NOT NULL',
  });

  pgm.createIndex('products', 'section', {
    name: 'idx_products_section',
    where: 'section IS NOT NULL',
  });

  pgm.createIndex('products', 'location', {
    name: 'idx_products_location',
    where: 'location IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('products', 'location', { name: 'idx_products_location' });
  pgm.dropIndex('products', 'section', { name: 'idx_products_section' });
  pgm.dropIndex('products', 'category', { name: 'idx_products_category' });

  pgm.dropConstraint('products', 'chk_products_location');
  pgm.dropConstraint('products', 'chk_products_section');
  pgm.dropConstraint('products', 'chk_products_category');

  pgm.dropColumns('products', [
    'category',
    'section',
    'location',
    'article_group',
    'hsn_code',
    'size_group',
  ]);
};
