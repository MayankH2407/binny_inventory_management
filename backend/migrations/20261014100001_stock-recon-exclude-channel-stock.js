/**
 * Stock verification now treats E-commerce and Sample stock as separate
 * inventories (like a warehouse transfer). Sessions opened before that change
 * snapshotted ECOMMERCE-status boxes (and boxes inside cartons allocated intact
 * to a sample/e-commerce record) as "expected", so they showed up as missing —
 * the "500 child boxes missing" report. Drop those rows from the frozen
 * snapshots of sessions that have NOT been posted yet. Posted/cancelled
 * sessions are history and are left untouched. Idempotent.
 */
exports.up = (pgm) => {
  pgm.sql(`
    DELETE FROM stock_reconciliation_expected e
    USING stock_reconciliation_sessions s
    WHERE s.id = e.session_id
      AND s.status IN ('COUNTING', 'SUBMITTED', 'APPROVED')
      AND (
        e.status_at_snapshot IN ('ECOMMERCE', 'SAMPLE')
        OR (e.master_carton_id IS NOT NULL AND (
          EXISTS (SELECT 1 FROM sample_carton_mapping scm
                   WHERE scm.master_carton_id = e.master_carton_id AND scm.is_active = true AND scm.dispatch_record_id IS NULL)
          OR EXISTS (SELECT 1 FROM ecommerce_carton_mapping ecm
                      WHERE ecm.master_carton_id = e.master_carton_id AND ecm.is_active = true AND ecm.dispatch_record_id IS NULL)
        ))
      );
  `);
};

exports.down = () => {};
