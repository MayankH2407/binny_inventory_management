/**
 * Legacy cartons now carry the data needed to print a real master-carton label
 * (article, colour(s), MRP(s), size range). article_group/size_group already
 * exist (reused as article name / size range); this adds colour + MRP, stored
 * as free text so the warehouse can list multiple comma-separated values in one
 * cell (e.g. "black, red" / "100, 150") exactly as the label prints them.
 */
exports.up = (pgm) => {
  pgm.addColumns('master_cartons', {
    legacy_colour: {
      type: 'varchar(200)',
    },
    legacy_mrp: {
      type: 'varchar(100)',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('master_cartons', ['legacy_colour', 'legacy_mrp']);
};
