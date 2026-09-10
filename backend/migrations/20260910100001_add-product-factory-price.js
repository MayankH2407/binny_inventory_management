/**
 * Client ask (31-Aug observations note, item 6): "Add factory price section
 * also in products bulk import." No cost-price concept exists anywhere in the
 * schema today (mrp is the only price column) — this is net-new.
 *
 * Nullable numeric(10,2), same precision as mrp. No backfill for the
 * existing ~100k+ product rows — same no-backfill-for-existing-rows
 * precedent as size_from/size_to (20260414100001) and size_from/size_to's
 * own bug fix (119354e): this is internal/cost data the client will fill in
 * going forward, not something derivable from existing data.
 *
 * Deliberately NEVER surfaced on the customer-facing child-box label
 * (childBoxLabel.ts) — see product.service.ts / products/page.tsx for where
 * it's threaded through instead (create/update/bulk-import/CSV export).
 */
exports.up = (pgm) => {
  pgm.addColumns('products', {
    factory_price: { type: 'numeric(10,2)' },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('products', ['factory_price']);
};
