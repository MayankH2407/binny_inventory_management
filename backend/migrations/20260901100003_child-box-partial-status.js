/**
 * Adds the PARTIAL value to child_box_status.
 *
 * PARTIAL = "this box has shipped exactly one shoe as a sample; the other shoe
 * is physically on hand and unallocated". It is deliberately a distinct status
 * rather than a variant of FREE because every child-box status predicate in the
 * codebase is a POSITIVE enumeration (`= 'FREE'`, `IN ($1,$2)`, ...) — there is
 * not one `status <> ...` / `NOT IN (...)` on this table. A new value therefore
 * excludes a half box from packing, e-commerce pooling, pairs-in-stock, the
 * inventory breakdown, the product-wise report and the stock summary with no
 * query changes at all. Fail-safe by construction.
 *
 * Which foot is gone is NOT encoded here — that lives in the
 * left_dispatched_at / right_dispatched_at columns added by the next migration,
 * so the fact is stored exactly once.
 *
 * Split into its own file because node-pg-migrate runs all pending migrations in
 * a SINGLE transaction by default, and PostgreSQL forbids using a new enum
 * value in the transaction that added it. The next migration is written to
 * reference only pre-existing enum values, so both can also safely run in one
 * `migrate:up`.
 */
exports.up = (pgm) => {
  pgm.addTypeValue('child_box_status', 'PARTIAL', {
    ifNotExists: true,
    before: 'DISPATCHED',
  });
};

exports.down = () => {
  // PostgreSQL does not support removing values from an enum type.
  // Down migration is intentionally a no-op; the unused value is harmless.
};
