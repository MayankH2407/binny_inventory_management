/**
 * Per-foot dispatch tracking on child_boxes — the physical fact behind the
 * PARTIAL status added in 20260901100003.
 *
 * Semantics (both columns nullable; all pre-existing rows are NULL/NULL, i.e.
 * "never foot-split", which is correct for every one of the ~573k live rows):
 *
 *   NULL  / NULL   -> never foot-split. status governs as it always did.
 *                     A box dispatched whole (carton / e-commerce / PAIR sample)
 *                     stays NULL/NULL with status DISPATCHED — "shipped as a unit".
 *   set   / NULL   -> left shoe gone, right shoe physically on hand.
 *   NULL  / set    -> mirror image.
 *   set   / set    -> both shoes shipped, separately. status must be DISPATCHED.
 *
 * Two timestamps rather than one `dispatched_foot` varchar: a varchar cannot
 * honestly represent "left shipped in March, right shipped in August" without
 * overwriting and losing the first date. It also gives the audit timestamp free.
 *
 * Deliberately NOT added: left/right dispatch_record_id. That provenance already
 * lives in sample_box_mapping (foot, dispatch_record_id) — storing it twice
 * invites divergence. These two columns record only the physical fact, which
 * belongs on the physical box and must not be derived from an allocation table
 * whose is_active flag other flows can flip.
 *
 * NOTE: nothing below references the 'PARTIAL' enum literal, on purpose — see
 * the header of 20260901100003 for why. The "a half box must not sit at FREE"
 * invariant is enforced in the service layer instead, exactly as the
 * "no PAIR coexisting with a single foot" rule already is (see the header of
 * 20260609120001_sample-box-mapping-per-foot.js).
 *
 * Purely additive against ~573,000 live child_boxes rows — no backfill, no
 * table rewrite (nullable ADD COLUMN with no default is metadata-only in
 * PG 16). Verified directly against LIVE 2026-09-01: zero rows have ever had
 * a foot-split, so the single-pair-only CHECK below validates cleanly.
 */
exports.up = (pgm) => {
  pgm.addColumns('child_boxes', {
    left_dispatched_at:  { type: 'timestamptz' },
    right_dispatched_at: { type: 'timestamptz' },
  });

  // Both shoes gone => the box is fully consumed. Uses only the pre-existing
  // DISPATCHED enum value, so it is safe in the same transaction as the
  // ADD VALUE in the prior migration.
  pgm.addConstraint('child_boxes', 'chk_child_boxes_both_feet_dispatched', {
    check: `NOT (left_dispatched_at IS NOT NULL
                 AND right_dispatched_at IS NOT NULL
                 AND status <> 'DISPATCHED')`,
  });

  // Foot-splitting only makes sense for a single-pair box; the service layer
  // enforces this on allocation, this is the backstop.
  pgm.addConstraint('child_boxes', 'chk_child_boxes_foot_split_single_pair', {
    check: `(left_dispatched_at IS NULL AND right_dispatched_at IS NULL)
            OR quantity = 1`,
  });

  // Tiny partial index for the "loose shoes on hand" report / list.
  pgm.createIndex('child_boxes', ['product_id'], {
    name: 'idx_child_boxes_foot_split',
    where: 'left_dispatched_at IS NOT NULL OR right_dispatched_at IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('child_boxes', ['product_id'], { name: 'idx_child_boxes_foot_split', ifExists: true });
  pgm.dropConstraint('child_boxes', 'chk_child_boxes_foot_split_single_pair', { ifExists: true });
  pgm.dropConstraint('child_boxes', 'chk_child_boxes_both_feet_dispatched', { ifExists: true });
  pgm.dropColumns('child_boxes', ['left_dispatched_at', 'right_dispatched_at']);
  // The PARTIAL enum value is intentionally NOT removed (PostgreSQL cannot).
  // Any rows left at status='PARTIAL' by a down-migration would be orphaned;
  // this down() is structural-only, same precedent as the e-commerce redesign.
};
