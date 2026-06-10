exports.up = (pgm) => {
  pgm.addColumns('master_cartons', {
    is_legacy: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    section: {
      type: 'varchar(100)',
    },
    category: {
      type: 'varchar(100)',
    },
    article_group: {
      type: 'varchar(200)',
    },
    size_group: {
      type: 'varchar(100)',
    },
  });

  pgm.createIndex('master_cartons', 'is_legacy', {
    name: 'idx_master_cartons_is_legacy',
    where: 'is_legacy = true',
  });

  pgm.createIndex('master_cartons', ['section', 'category', 'article_group', 'size_group'], {
    name: 'idx_master_cartons_legacy_path',
    where: 'is_legacy = true',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('master_cartons', ['section', 'category', 'article_group', 'size_group'], {
    name: 'idx_master_cartons_legacy_path',
  });

  pgm.dropIndex('master_cartons', 'is_legacy', {
    name: 'idx_master_cartons_is_legacy',
  });

  pgm.dropColumns('master_cartons', [
    'is_legacy',
    'section',
    'category',
    'article_group',
    'size_group',
  ]);
};
