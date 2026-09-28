/**
 * Physical stock verification & reconciliation (QR-based).
 * See STOCK_RECONCILIATION_HANDOVER.md for the full feature spec.
 *
 * State machine: COUNTING -> SUBMITTED -> APPROVED -> POSTED
 *                          -> REJECTED (terminal; use recountSession to open
 *                             a fresh session rather than editing counts)
 *                COUNTING -> CANCELLED
 *
 * stock_reconciliation_expected is the frozen "what should be here" snapshot
 * taken when the session opens, so the expected set never moves under the
 * counting staff's feet. stock_reconciliation_scans is the append-only scan
 * log (unique on session_id + client_scan_id so an offline batch re-sync is
 * idempotent). Variance is computed on read from these two tables, not
 * stored — same approach as the Alstone reconciliation this is adapted from.
 * stock_reconciliation_adjustments is the audit trail written only at POST
 * time, one row per child box / legacy carton actually changed.
 */
exports.up = (pgm) => {
  pgm.createTable('stock_reconciliation_sessions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    session_code: { type: 'varchar(10)', notNull: true, unique: true },
    status: { type: 'varchar(20)', notNull: true, default: 'COUNTING' },
    scope: { type: 'jsonb', notNull: true, default: '{}' },
    notes: { type: 'text' },
    snapshot_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    recount_of_session_id: {
      type: 'uuid',
      references: '"stock_reconciliation_sessions"',
      onDelete: 'SET NULL',
    },
    created_by: { type: 'uuid', notNull: true, references: '"users"', onDelete: 'RESTRICT' },
    submitted_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    submitted_at: { type: 'timestamptz' },
    approved_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    approved_at: { type: 'timestamptz' },
    rejected_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    rejected_at: { type: 'timestamptz' },
    rejection_reason: { type: 'text' },
    posted_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    posted_at: { type: 'timestamptz' },
    cancelled_by: { type: 'uuid', references: '"users"', onDelete: 'SET NULL' },
    cancelled_at: { type: 'timestamptz' },
    summary: { type: 'jsonb' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.addConstraint('stock_reconciliation_sessions', 'chk_stock_recon_session_status', {
    check: "status IN ('COUNTING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'POSTED', 'CANCELLED')",
  });

  pgm.createIndex('stock_reconciliation_sessions', 'status');
  pgm.createIndex('stock_reconciliation_sessions', 'created_at');

  pgm.sql(`
    CREATE TRIGGER set_updated_at
      BEFORE UPDATE ON stock_reconciliation_sessions
      FOR EACH ROW
      EXECUTE FUNCTION trigger_set_updated_at();
  `);

  pgm.createTable('stock_reconciliation_expected', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    session_id: {
      type: 'uuid',
      notNull: true,
      references: '"stock_reconciliation_sessions"',
      onDelete: 'CASCADE',
    },
    item_type: { type: 'varchar(20)', notNull: true },
    // BOX rows: child_box_id set, master_carton_id = the box's active carton
    // at snapshot time (null if it was loose). LEGACY_CARTON rows:
    // master_carton_id = the legacy carton itself, child_box_id null.
    child_box_id: { type: 'uuid', references: '"child_boxes"', onDelete: 'SET NULL' },
    master_carton_id: { type: 'uuid', references: '"master_cartons"', onDelete: 'SET NULL' },
    product_id: { type: 'uuid', references: '"products"', onDelete: 'SET NULL' },
    status_at_snapshot: { type: 'varchar(20)', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.addConstraint('stock_reconciliation_expected', 'chk_stock_recon_expected_item_type', {
    check: "item_type IN ('BOX', 'LEGACY_CARTON')",
  });

  pgm.createIndex('stock_reconciliation_expected', 'session_id');
  pgm.createIndex('stock_reconciliation_expected', 'master_carton_id', {
    name: 'idx_stock_recon_expected_carton',
    where: 'master_carton_id IS NOT NULL',
  });
  pgm.createIndex('stock_reconciliation_expected', ['session_id', 'child_box_id'], {
    name: 'idx_unique_stock_recon_expected_box',
    unique: true,
    where: 'child_box_id IS NOT NULL',
  });
  pgm.createIndex('stock_reconciliation_expected', ['session_id', 'master_carton_id'], {
    name: 'idx_unique_stock_recon_expected_legacy_carton',
    unique: true,
    where: "item_type = 'LEGACY_CARTON'",
  });

  pgm.createTable('stock_reconciliation_scans', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    session_id: {
      type: 'uuid',
      notNull: true,
      references: '"stock_reconciliation_sessions"',
      onDelete: 'CASCADE',
    },
    client_scan_id: { type: 'varchar(100)', notNull: true },
    raw_payload: { type: 'varchar(200)', notNull: true },
    scan_type: { type: 'varchar(10)', notNull: true },
    child_box_id: { type: 'uuid', references: '"child_boxes"', onDelete: 'SET NULL' },
    master_carton_id: { type: 'uuid', references: '"master_cartons"', onDelete: 'SET NULL' },
    result: { type: 'varchar(20)', notNull: true },
    contents_mismatch: { type: 'boolean', notNull: true, default: false },
    is_manual: { type: 'boolean', notNull: true, default: false },
    scanned_by: { type: 'uuid', notNull: true, references: '"users"', onDelete: 'RESTRICT' },
    scanned_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.addConstraint('stock_reconciliation_scans', 'chk_stock_recon_scan_type', {
    check: "scan_type IN ('BOX', 'CARTON', 'UNKNOWN')",
  });
  pgm.addConstraint('stock_reconciliation_scans', 'chk_stock_recon_scan_result', {
    check: "result IN ('OK', 'DUPLICATE', 'NOT_EXPECTED', 'OUT_OF_SCOPE', 'STATUS_CONFLICT', 'UNKNOWN')",
  });
  pgm.addConstraint('stock_reconciliation_scans', 'uq_stock_recon_scan_client_id', {
    unique: ['session_id', 'client_scan_id'],
  });

  pgm.createIndex('stock_reconciliation_scans', 'session_id');
  pgm.createIndex('stock_reconciliation_scans', ['session_id', 'child_box_id'], {
    name: 'idx_stock_recon_scans_box',
    where: 'child_box_id IS NOT NULL',
  });
  pgm.createIndex('stock_reconciliation_scans', ['session_id', 'master_carton_id'], {
    name: 'idx_stock_recon_scans_carton',
    where: 'master_carton_id IS NOT NULL',
  });

  pgm.createTable('stock_reconciliation_adjustments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('uuid_generate_v4()') },
    session_id: {
      type: 'uuid',
      notNull: true,
      references: '"stock_reconciliation_sessions"',
      onDelete: 'CASCADE',
    },
    child_box_id: { type: 'uuid', references: '"child_boxes"', onDelete: 'SET NULL' },
    master_carton_id: { type: 'uuid', references: '"master_cartons"', onDelete: 'SET NULL' },
    action: { type: 'varchar(20)', notNull: true },
    old_status: { type: 'varchar(20)' },
    new_status: { type: 'varchar(20)' },
    old_master_carton_id: { type: 'uuid', references: '"master_cartons"', onDelete: 'SET NULL' },
    posted_by: { type: 'uuid', notNull: true, references: '"users"', onDelete: 'RESTRICT' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('NOW()') },
  });

  pgm.addConstraint('stock_reconciliation_adjustments', 'chk_stock_recon_adjustment_action', {
    check: "action IN ('MARKED_MISSING', 'RESTORED_FOUND', 'SKIPPED_MOVED')",
  });

  pgm.createIndex('stock_reconciliation_adjustments', 'session_id');
};

exports.down = (pgm) => {
  pgm.sql('DROP TRIGGER IF EXISTS set_updated_at ON stock_reconciliation_sessions');
  pgm.dropTable('stock_reconciliation_adjustments');
  pgm.dropTable('stock_reconciliation_scans');
  pgm.dropTable('stock_reconciliation_expected');
  pgm.dropTable('stock_reconciliation_sessions');
};
