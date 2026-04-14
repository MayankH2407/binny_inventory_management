exports.up = (pgm) => {
  pgm.alterColumn('products', 'sku', { type: 'varchar(100)' });
};

exports.down = (pgm) => {
  pgm.alterColumn('products', 'sku', { type: 'varchar(50)' });
};
