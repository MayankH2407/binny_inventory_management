/**
 * Size-sort utilities for footwear sizes.
 *
 * Ordering rules:
 *   1. Kids sizes (trailing "K" / "k") sort BEFORE adult sizes.
 *   2. Within each group, ascending by numeric value.
 *   3. Non-numeric sizes fall back to localeCompare.
 *
 * Examples:
 *   sortSizes(['1','13K','5K','2','9','6K'])
 *   => ['5K', '6K', '13K', '1', '2', '9']
 */

export function compareSizes(a: string, b: string): number {
  const trimA = a.trim();
  const trimB = b.trim();

  const isKidA = /k$/i.test(trimA);
  const isKidB = /k$/i.test(trimB);

  // Kids before adults
  if (isKidA !== isKidB) return isKidA ? -1 : 1;

  // Same group: compare numerically
  const numA = parseFloat(trimA);
  const numB = parseFloat(trimB);

  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;

  // Fallback for non-numeric
  return trimA.localeCompare(trimB);
}

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort(compareSizes);
}
