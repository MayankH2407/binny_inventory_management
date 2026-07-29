/**
 * dispatch_records.dispatch_date was DATE-only (no time-of-day), so every
 * dispatch displayed a constant, meaningless time in the UI (midnight UTC
 * shifted to local time). Widen to timestamptz so the real dispatch instant
 * is captured going forward. Existing rows keep their date value at
 * midnight — there was never a real time to recover for them.
 */
exports.up = (pgm) => {
  pgm.alterColumn('dispatch_records', 'dispatch_date', {
    type: 'timestamptz',
    default: pgm.func('NOW()'),
  });
};

exports.down = (pgm) => {
  pgm.alterColumn('dispatch_records', 'dispatch_date', {
    type: 'date',
    default: pgm.func('CURRENT_DATE'),
  });
};
