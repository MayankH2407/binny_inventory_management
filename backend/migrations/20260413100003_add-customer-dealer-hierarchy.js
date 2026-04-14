exports.up = (pgm) => {
  // Create customer_type enum
  pgm.createType('customer_type', ['Primary Dealer', 'Sub Dealer']);

  // Add new columns
  pgm.addColumns('customers', {
    customer_type: {
      type: 'customer_type',
      notNull: true,
      default: pgm.func("'Primary Dealer'"),
    },
    primary_dealer_id: {
      type: 'uuid',
      references: '"customers"',
      onDelete: 'SET NULL',
    },
  });

  // Sub Dealer must have a primary_dealer_id
  pgm.addConstraint('customers', 'chk_sub_dealer_has_primary', {
    check: "customer_type = 'Primary Dealer' OR primary_dealer_id IS NOT NULL",
  });

  // Indexes
  pgm.createIndex('customers', 'primary_dealer_id', {
    name: 'idx_customers_primary_dealer',
    where: 'primary_dealer_id IS NOT NULL',
  });

  pgm.createIndex('customers', 'customer_type', {
    name: 'idx_customers_type',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('customers', 'customer_type', { name: 'idx_customers_type' });
  pgm.dropIndex('customers', 'primary_dealer_id', { name: 'idx_customers_primary_dealer' });
  pgm.dropConstraint('customers', 'chk_sub_dealer_has_primary');
  pgm.dropColumns('customers', ['customer_type', 'primary_dealer_id']);
  pgm.dropType('customer_type');
};
