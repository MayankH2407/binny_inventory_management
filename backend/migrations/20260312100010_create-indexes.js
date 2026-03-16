exports.up = (pgm) => {
  // --- users ---
  pgm.createIndex('users', 'email', { name: 'idx_users_email' });
  pgm.createIndex('users', 'role_id', { name: 'idx_users_role_id' });
  pgm.createIndex('users', 'is_active', { name: 'idx_users_is_active' });

  // --- products ---
  pgm.createIndex('products', 'sku', { name: 'idx_products_sku' });
  pgm.createIndex('products', 'article_code', { name: 'idx_products_article_code' });
  pgm.createIndex('products', 'is_active', { name: 'idx_products_is_active' });
  // Trigram index for fuzzy search on article_name
  pgm.createIndex('products', 'article_name', {
    name: 'idx_products_article_name_trgm',
    method: 'gin',
    opclass: 'gin_trgm_ops',
  });

  // --- child_boxes ---
  pgm.createIndex('child_boxes', 'barcode', { name: 'idx_child_boxes_barcode' });
  pgm.createIndex('child_boxes', 'product_id', { name: 'idx_child_boxes_product_id' });
  pgm.createIndex('child_boxes', 'status', { name: 'idx_child_boxes_status' });
  pgm.createIndex('child_boxes', 'created_by', { name: 'idx_child_boxes_created_by' });

  // --- master_cartons ---
  pgm.createIndex('master_cartons', 'carton_barcode', { name: 'idx_master_cartons_barcode' });
  pgm.createIndex('master_cartons', 'status', { name: 'idx_master_cartons_status' });
  pgm.createIndex('master_cartons', 'created_by', { name: 'idx_master_cartons_created_by' });

  // --- carton_child_mapping ---
  pgm.createIndex('carton_child_mapping', 'master_carton_id', {
    name: 'idx_ccm_master_carton_id',
  });
  pgm.createIndex('carton_child_mapping', 'child_box_id', {
    name: 'idx_ccm_child_box_id',
  });
  pgm.createIndex('carton_child_mapping', 'is_active', {
    name: 'idx_ccm_is_active',
  });
  // Composite index for common query: find active mappings for a carton
  pgm.createIndex('carton_child_mapping', ['master_carton_id', 'is_active'], {
    name: 'idx_ccm_carton_active',
    where: 'is_active = true',
  });

  // --- inventory_transactions ---
  pgm.createIndex('inventory_transactions', 'transaction_type', {
    name: 'idx_inv_tx_type',
  });
  pgm.createIndex('inventory_transactions', 'child_box_id', {
    name: 'idx_inv_tx_child_box_id',
  });
  pgm.createIndex('inventory_transactions', 'master_carton_id', {
    name: 'idx_inv_tx_master_carton_id',
  });
  pgm.createIndex('inventory_transactions', 'performed_by', {
    name: 'idx_inv_tx_performed_by',
  });
  pgm.createIndex('inventory_transactions', 'created_at', {
    name: 'idx_inv_tx_created_at',
  });

  // --- dispatch_records ---
  pgm.createIndex('dispatch_records', 'master_carton_id', {
    name: 'idx_dispatch_master_carton_id',
  });
  pgm.createIndex('dispatch_records', 'dispatched_by', {
    name: 'idx_dispatch_dispatched_by',
  });
  pgm.createIndex('dispatch_records', 'dispatch_date', {
    name: 'idx_dispatch_date',
  });
  pgm.createIndex('dispatch_records', 'lr_number', {
    name: 'idx_dispatch_lr_number',
  });

  // --- audit_logs ---
  pgm.createIndex('audit_logs', 'user_id', { name: 'idx_audit_user_id' });
  pgm.createIndex('audit_logs', 'action', { name: 'idx_audit_action' });
  pgm.createIndex('audit_logs', 'entity_type', { name: 'idx_audit_entity_type' });
  pgm.createIndex('audit_logs', 'entity_id', { name: 'idx_audit_entity_id' });
  pgm.createIndex('audit_logs', 'created_at', { name: 'idx_audit_created_at' });
  // Composite index for querying logs by entity
  pgm.createIndex('audit_logs', ['entity_type', 'entity_id'], {
    name: 'idx_audit_entity',
  });
};

exports.down = (pgm) => {
  // --- audit_logs ---
  pgm.dropIndex('audit_logs', [], { name: 'idx_audit_entity' });
  pgm.dropIndex('audit_logs', [], { name: 'idx_audit_created_at' });
  pgm.dropIndex('audit_logs', [], { name: 'idx_audit_entity_id' });
  pgm.dropIndex('audit_logs', [], { name: 'idx_audit_entity_type' });
  pgm.dropIndex('audit_logs', [], { name: 'idx_audit_action' });
  pgm.dropIndex('audit_logs', [], { name: 'idx_audit_user_id' });

  // --- dispatch_records ---
  pgm.dropIndex('dispatch_records', [], { name: 'idx_dispatch_lr_number' });
  pgm.dropIndex('dispatch_records', [], { name: 'idx_dispatch_date' });
  pgm.dropIndex('dispatch_records', [], { name: 'idx_dispatch_dispatched_by' });
  pgm.dropIndex('dispatch_records', [], { name: 'idx_dispatch_master_carton_id' });

  // --- inventory_transactions ---
  pgm.dropIndex('inventory_transactions', [], { name: 'idx_inv_tx_created_at' });
  pgm.dropIndex('inventory_transactions', [], { name: 'idx_inv_tx_performed_by' });
  pgm.dropIndex('inventory_transactions', [], { name: 'idx_inv_tx_master_carton_id' });
  pgm.dropIndex('inventory_transactions', [], { name: 'idx_inv_tx_child_box_id' });
  pgm.dropIndex('inventory_transactions', [], { name: 'idx_inv_tx_type' });

  // --- carton_child_mapping ---
  pgm.dropIndex('carton_child_mapping', [], { name: 'idx_ccm_carton_active' });
  pgm.dropIndex('carton_child_mapping', [], { name: 'idx_ccm_is_active' });
  pgm.dropIndex('carton_child_mapping', [], { name: 'idx_ccm_child_box_id' });
  pgm.dropIndex('carton_child_mapping', [], { name: 'idx_ccm_master_carton_id' });

  // --- master_cartons ---
  pgm.dropIndex('master_cartons', [], { name: 'idx_master_cartons_created_by' });
  pgm.dropIndex('master_cartons', [], { name: 'idx_master_cartons_status' });
  pgm.dropIndex('master_cartons', [], { name: 'idx_master_cartons_barcode' });

  // --- child_boxes ---
  pgm.dropIndex('child_boxes', [], { name: 'idx_child_boxes_created_by' });
  pgm.dropIndex('child_boxes', [], { name: 'idx_child_boxes_status' });
  pgm.dropIndex('child_boxes', [], { name: 'idx_child_boxes_product_id' });
  pgm.dropIndex('child_boxes', [], { name: 'idx_child_boxes_barcode' });

  // --- products ---
  pgm.dropIndex('products', [], { name: 'idx_products_article_name_trgm' });
  pgm.dropIndex('products', [], { name: 'idx_products_is_active' });
  pgm.dropIndex('products', [], { name: 'idx_products_article_code' });
  pgm.dropIndex('products', [], { name: 'idx_products_sku' });

  // --- users ---
  pgm.dropIndex('users', [], { name: 'idx_users_is_active' });
  pgm.dropIndex('users', [], { name: 'idx_users_role_id' });
  pgm.dropIndex('users', [], { name: 'idx_users_email' });
};
