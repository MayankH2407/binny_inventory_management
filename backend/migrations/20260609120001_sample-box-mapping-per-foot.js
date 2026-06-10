/*
 * Foot-split samples: allow a single child box (a pair) to have its LEFT foot in one
 * sample and its RIGHT foot in another, independently.
 *
 * The old unique index allowed only ONE active sample mapping per child box. Replace it
 * with a per-foot unique index so a box can hold at most one active LEFT and one active
 * RIGHT mapping (or a single PAIR). The "no PAIR coexisting with a single foot" rule is
 * enforced in the service layer (it can't be expressed as a single partial unique index).
 */
exports.up = (pgm) => {
  pgm.dropIndex('sample_box_mapping', 'child_box_id', {
    name: 'idx_unique_active_sample_mapping',
    ifExists: true,
  });

  pgm.createIndex('sample_box_mapping', ['child_box_id', 'foot'], {
    name: 'idx_unique_active_sample_foot',
    unique: true,
    where: 'is_active = true',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('sample_box_mapping', ['child_box_id', 'foot'], {
    name: 'idx_unique_active_sample_foot',
    ifExists: true,
  });

  pgm.createIndex('sample_box_mapping', 'child_box_id', {
    name: 'idx_unique_active_sample_mapping',
    unique: true,
    where: 'is_active = true',
  });
};
