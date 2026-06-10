exports.up = (pgm) => {
  pgm.addConstraint('child_boxes', 'chk_child_boxes_barcode_upper', {
    check: 'barcode = UPPER(barcode)',
  });

  pgm.addConstraint('master_cartons', 'chk_master_cartons_carton_barcode_upper', {
    check: 'carton_barcode = UPPER(carton_barcode)',
  });

  pgm.addConstraint('sample_records', 'chk_sample_records_sample_barcode_upper', {
    check: 'sample_barcode = UPPER(sample_barcode)',
  });

  pgm.addConstraint('ecommerce_records', 'chk_ecommerce_records_ecommerce_barcode_upper', {
    check: 'ecommerce_barcode = UPPER(ecommerce_barcode)',
  });
};

exports.down = (pgm) => {
  pgm.dropConstraint('ecommerce_records', 'chk_ecommerce_records_ecommerce_barcode_upper');
  pgm.dropConstraint('sample_records', 'chk_sample_records_sample_barcode_upper');
  pgm.dropConstraint('master_cartons', 'chk_master_cartons_carton_barcode_upper');
  pgm.dropConstraint('child_boxes', 'chk_child_boxes_barcode_upper');
};
