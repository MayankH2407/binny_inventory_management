/**
 * E-commerce module redesign: replaces the "ecommerce_records" grouping
 * concept with a single, unordered pool of loose boxes / whole cartons
 * sitting in the E-commerce Area. Pool mapping rows (ecommerce_box_mapping /
 * ecommerce_carton_mapping) no longer require a parent ecommerce_record —
 * they are linked directly to the dispatch_records row that eventually ships
 * them (dispatch_record_id), and stay in the pool (unallocated) until then.
 *
 * dispatch_records also gains an explicit source_type discriminator plus a
 * handful of e-commerce-specific fields (marketplace/order reference/etc.)
 * that used to live on ecommerce_records.
 */
exports.up = (pgm) => {
  // A. Pool rows: mappings no longer need a parent ecommerce_record
  pgm.alterColumn('ecommerce_box_mapping', 'ecommerce_record_id', { notNull: false });
  pgm.alterColumn('ecommerce_carton_mapping', 'ecommerce_record_id', { notNull: false });

  pgm.addColumns('ecommerce_box_mapping', {
    dispatch_record_id: { type: 'uuid', references: '"dispatch_records"', onDelete: 'SET NULL' },
    source_master_carton_id: { type: 'uuid', references: '"master_cartons"', onDelete: 'SET NULL' },
  });
  pgm.addColumns('ecommerce_carton_mapping', {
    dispatch_record_id: { type: 'uuid', references: '"dispatch_records"', onDelete: 'SET NULL' },
  });

  pgm.createIndex('ecommerce_box_mapping', 'dispatch_record_id', {
    name: 'idx_ecom_box_mapping_dispatch', where: 'dispatch_record_id IS NOT NULL',
  });
  pgm.createIndex('ecommerce_carton_mapping', 'dispatch_record_id', {
    name: 'idx_ecom_carton_mapping_dispatch', where: 'dispatch_record_id IS NOT NULL',
  });
  pgm.createIndex('ecommerce_box_mapping', 'child_box_id', {
    name: 'idx_ecom_box_pool', where: 'is_active = true AND dispatch_record_id IS NULL',
  });
  pgm.createIndex('ecommerce_carton_mapping', 'master_carton_id', {
    name: 'idx_ecom_carton_pool', where: 'is_active = true AND dispatch_record_id IS NULL',
  });

  // B. dispatch_records: explicit discriminator + e-commerce fields
  pgm.addColumns('dispatch_records', {
    source_type: { type: 'varchar(20)' },
    reference_name: { type: 'varchar(200)' },
    marketplace: { type: 'varchar(100)' },
    order_reference: { type: 'varchar(200)' },
    listing_sku: { type: 'varchar(100)' },
    order_date: { type: 'date' },
  });

  pgm.sql(`
    UPDATE dispatch_records SET source_type = CASE
      WHEN sample_record_id    IS NOT NULL THEN 'SAMPLE'
      WHEN ecommerce_record_id IS NOT NULL THEN 'ECOMMERCE'
      ELSE 'MASTER_CARTON' END`);
  pgm.alterColumn('dispatch_records', 'source_type', { notNull: true });

  pgm.addConstraint('dispatch_records', 'chk_dispatch_source_type', {
    check: "source_type IN ('MASTER_CARTON','SAMPLE','ECOMMERCE')",
  });

  pgm.dropConstraint('dispatch_records', 'chk_dispatch_source_exactly_one');
  pgm.addConstraint('dispatch_records', 'chk_dispatch_source', {
    check: `
      (source_type = 'MASTER_CARTON' AND master_carton_id IS NOT NULL AND sample_record_id IS NULL AND ecommerce_record_id IS NULL)
   OR (source_type = 'SAMPLE'        AND sample_record_id IS NOT NULL AND master_carton_id IS NULL AND ecommerce_record_id IS NULL)
   OR (source_type = 'ECOMMERCE'     AND master_carton_id IS NULL     AND sample_record_id IS NULL)`,
  });
  pgm.createIndex('dispatch_records', 'source_type');

  // C. Backfill: link historical record-based e-commerce dispatches to the
  //    mapping rows that shipped on them.
  pgm.sql(`
    UPDATE ecommerce_box_mapping ebm
       SET dispatch_record_id = d.id
      FROM (SELECT DISTINCT ON (ecommerce_record_id) id, ecommerce_record_id, created_at
              FROM dispatch_records WHERE ecommerce_record_id IS NOT NULL
             ORDER BY ecommerce_record_id, dispatch_date DESC, created_at DESC) d
     WHERE ebm.ecommerce_record_id = d.ecommerce_record_id
       AND ebm.dispatch_record_id IS NULL
       AND (ebm.is_active = true OR (ebm.unmapped_at IS NOT NULL AND ebm.unmapped_at >= d.created_at))`);

  pgm.sql(`
    UPDATE ecommerce_carton_mapping ecm
       SET dispatch_record_id = d.id
      FROM (SELECT DISTINCT ON (ecommerce_record_id) id, ecommerce_record_id, created_at
              FROM dispatch_records WHERE ecommerce_record_id IS NOT NULL
             ORDER BY ecommerce_record_id, dispatch_date DESC, created_at DESC) d
     WHERE ecm.ecommerce_record_id = d.ecommerce_record_id
       AND ecm.dispatch_record_id IS NULL
       AND (ecm.is_active = true OR (ecm.unmapped_at IS NOT NULL AND ecm.unmapped_at >= d.created_at))`);
};

exports.down = (pgm) => {
  pgm.dropIndex('dispatch_records', 'source_type');
  pgm.dropConstraint('dispatch_records', 'chk_dispatch_source');
  pgm.dropConstraint('dispatch_records', 'chk_dispatch_source_type');
  pgm.addConstraint('dispatch_records', 'chk_dispatch_source_exactly_one', {
    check: '(CASE WHEN master_carton_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN sample_record_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN ecommerce_record_id IS NULL THEN 0 ELSE 1 END) = 1',
  });
  pgm.dropColumns('dispatch_records', ['source_type', 'reference_name', 'marketplace', 'order_reference', 'listing_sku', 'order_date']);
  pgm.dropIndex('ecommerce_carton_mapping', 'master_carton_id', { name: 'idx_ecom_carton_pool' });
  pgm.dropIndex('ecommerce_box_mapping', 'child_box_id', { name: 'idx_ecom_box_pool' });
  pgm.dropIndex('ecommerce_carton_mapping', 'dispatch_record_id', { name: 'idx_ecom_carton_mapping_dispatch' });
  pgm.dropIndex('ecommerce_box_mapping', 'dispatch_record_id', { name: 'idx_ecom_box_mapping_dispatch' });
  pgm.dropColumns('ecommerce_carton_mapping', ['dispatch_record_id']);
  pgm.dropColumns('ecommerce_box_mapping', ['dispatch_record_id', 'source_master_carton_id']);
  // ecommerce_record_id intentionally left NULLABLE on down — irreversible, like the enum addition.
};
