/**
 * The `products` table has size_from/size_to (not size_group — that column
 * was dropped in migration 20260414100001, replaced by a from/to range).
 * Everywhere a "size group" label like "6-10" is needed, reconstruct it from
 * those two columns with this exact expression — duplicated as a literal
 * string (not a bind param) in every call site since it goes inside GROUP BY/
 * SELECT, not a WHERE value.
 *
 * `column` lets each call site use its own table alias for products
 * (typically 'p'), matching however that query aliased the join.
 */
export function sizeGroupExpr(column: string = 'p'): string {
  return `COALESCE(${column}.size_from, '') || CASE WHEN ${column}.size_to IS NOT NULL AND ${column}.size_to != ${column}.size_from THEN '-' || ${column}.size_to ELSE '' END`;
}
