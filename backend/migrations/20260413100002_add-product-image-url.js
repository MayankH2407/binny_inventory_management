exports.up = (pgm) => {
  pgm.addColumns('products', {
    image_url: {
      type: 'varchar(500)',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('products', ['image_url']);
};
