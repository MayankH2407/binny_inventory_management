/**
 * Samples module redesign: mirrors the E-commerce pool pattern
 * (20260812100002) while keeping the two things Samples genuinely needs and
 * e-commerce does not — a LIGHTWEIGHT parent record (so staff can look up
 * "what's in this sample" before it ships) and PER-FOOT (single-shoe)
 * allocation + dispatch.
 *
 * All recipient/customer/purpose/date capture moves OUT of create time and
 * into DISPATCH time (new dispatch_records.sample_* columns), exactly like the
 * e-commerce marketplace/order-reference fields did.
 *
 * Safe as a destructive re-shape rather than a careful ALTER-and-backfill:
 * LIVE has ZERO sample_records rows (verified 2026-09-01), so there is nothing
 * to preserve. `down` is best-effort structural only — it cannot restore data.
 */
exports.up = (pgm) => {
  // ── A. sample_records becomes a lightweight container ────────────────────
  pgm.dropColumns('sample_records', [
    'customer_id',
    'recipient_name',
    'purpose',
    'sample_date',
    'notes',
    'status',
    'child_count',
    'closed_at',
    'dispatched_at',
  ]);
  // Name is now an optional free-text label; there is no create-time metadata
  // left to derive a default from.
  pgm.alterColumn('sample_records', 'name', { notNull: false });
  // The status column was its only user.
  pgm.dropType('sample_status', { ifExists: true });

  // ── B. Mapping rows link to the dispatch that ships them ─────────────────
  // "Currently in a sample" becomes (is_active = true AND dispatch_record_id
  // IS NULL). Shipped rows stay is_active = true — kept for history, the same
  // convention ecommerce_box_mapping / ecommerce_carton_mapping use.
  pgm.addColumns('sample_box_mapping', {
    dispatch_record_id: { type: 'uuid', references: '"dispatch_records"', onDelete: 'SET NULL' },
  });
  pgm.addColumns('sample_carton_mapping', {
    dispatch_record_id: { type: 'uuid', references: '"dispatch_records"', onDelete: 'SET NULL' },
  });

  pgm.createIndex('sample_box_mapping', 'dispatch_record_id', {
    name: 'idx_sample_box_mapping_dispatch', where: 'dispatch_record_id IS NOT NULL',
  });
  pgm.createIndex('sample_carton_mapping', 'dispatch_record_id', {
    name: 'idx_sample_carton_mapping_dispatch', where: 'dispatch_record_id IS NOT NULL',
  });

  // Uniqueness guards must stop counting shipped rows, or a box's LEFT foot
  // would be occupied forever by the sample that already shipped it.
  pgm.dropIndex('sample_box_mapping', ['child_box_id', 'foot'], {
    name: 'idx_unique_active_sample_foot', ifExists: true,
  });
  pgm.createIndex('sample_box_mapping', ['child_box_id', 'foot'], {
    name: 'idx_unique_active_sample_foot',
    unique: true,
    where: 'is_active = true AND dispatch_record_id IS NULL',
  });

  pgm.dropIndex('sample_carton_mapping', 'master_carton_id', {
    name: 'uq_sample_carton_active', ifExists: true,
  });
  pgm.createIndex('sample_carton_mapping', 'master_carton_id', {
    name: 'uq_sample_carton_active',
    unique: true,
    where: 'is_active = true AND dispatch_record_id IS NULL',
  });

  // Per-record "open contents" lookups (the list/detail/lookup hot path).
  pgm.createIndex('sample_box_mapping', 'sample_record_id', {
    name: 'idx_sample_box_open', where: 'is_active = true AND dispatch_record_id IS NULL',
  });
  pgm.dropIndex('sample_carton_mapping', 'sample_record_id', {
    name: 'idx_sample_carton_mapping_record_active', ifExists: true,
  });
  pgm.createIndex('sample_carton_mapping', 'sample_record_id', {
    name: 'idx_sample_carton_mapping_record_active',
    where: 'is_active = true AND dispatch_record_id IS NULL',
  });

  // ── C. dispatch_records: sample metadata captured at DISPATCH time ───────
  // Analogous to the five e-commerce columns added by 20260812100002.
  // customer_id / destination / notes reuse the existing generic columns.
  pgm.addColumns('dispatch_records', {
    sample_recipient_name: { type: 'varchar(200)' },
    sample_purpose: { type: 'text' },
    sample_reference_date: { type: 'date' },
  });

  // chk_dispatch_source is intentionally UNCHANGED: a SAMPLE dispatch still
  // carries exactly one sample_record_id. Samples keep their parent record;
  // e-commerce did not, which is why that redesign had to rewrite the CHECK.
};

exports.down = (pgm) => {
  pgm.dropColumns('dispatch_records', [
    'sample_recipient_name', 'sample_purpose', 'sample_reference_date',
  ]);

  pgm.dropIndex('sample_carton_mapping', 'sample_record_id', {
    name: 'idx_sample_carton_mapping_record_active', ifExists: true,
  });
  pgm.createIndex('sample_carton_mapping', 'sample_record_id', {
    name: 'idx_sample_carton_mapping_record_active', where: 'is_active = true',
  });
  pgm.dropIndex('sample_box_mapping', 'sample_record_id', { name: 'idx_sample_box_open', ifExists: true });

  pgm.dropIndex('sample_carton_mapping', 'master_carton_id', { name: 'uq_sample_carton_active', ifExists: true });
  pgm.createIndex('sample_carton_mapping', 'master_carton_id', {
    name: 'uq_sample_carton_active', unique: true, where: 'is_active = true',
  });
  pgm.dropIndex('sample_box_mapping', ['child_box_id', 'foot'], { name: 'idx_unique_active_sample_foot', ifExists: true });
  pgm.createIndex('sample_box_mapping', ['child_box_id', 'foot'], {
    name: 'idx_unique_active_sample_foot', unique: true, where: 'is_active = true',
  });

  pgm.dropIndex('sample_carton_mapping', 'dispatch_record_id', { name: 'idx_sample_carton_mapping_dispatch', ifExists: true });
  pgm.dropIndex('sample_box_mapping', 'dispatch_record_id', { name: 'idx_sample_box_mapping_dispatch', ifExists: true });
  pgm.dropColumns('sample_carton_mapping', ['dispatch_record_id']);
  pgm.dropColumns('sample_box_mapping', ['dispatch_record_id']);

  pgm.createType('sample_status', ['CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED']);
  pgm.addColumns('sample_records', {
    customer_id:    { type: 'uuid', references: '"customers"', onDelete: 'SET NULL' },
    recipient_name: { type: 'varchar(200)' },
    purpose:        { type: 'text' },
    sample_date:    { type: 'date' },
    notes:          { type: 'text' },
    status:         { type: 'sample_status', notNull: true, default: 'CREATED' },
    child_count:    { type: 'integer', notNull: true, default: 0 },
    closed_at:      { type: 'timestamptz' },
    dispatched_at:  { type: 'timestamptz' },
  });
  pgm.createIndex('sample_records', 'status');
  pgm.createIndex('sample_records', 'sample_date');
  // sample_records.name is left NULLABLE on down — irreversible, like the enum addition.
};
