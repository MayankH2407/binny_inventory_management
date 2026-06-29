/**
 * Widen customers.contact_person_mobile from varchar(15) to varchar(255).
 * Real dealer masters store multiple phone numbers in one field
 * (e.g. "8652144448 , 9982559181"), which overflowed varchar(15).
 * The bulk uploader now preserves the full multi-number string.
 */
exports.up = (pgm) => {
  pgm.alterColumn('customers', 'contact_person_mobile', { type: 'varchar(255)' });
};

exports.down = (pgm) => {
  // Note: rolling back will fail if any value exceeds 15 chars.
  pgm.alterColumn('customers', 'contact_person_mobile', { type: 'varchar(15)' });
};
