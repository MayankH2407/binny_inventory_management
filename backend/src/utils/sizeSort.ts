/**
 * Size-sort utilities for footwear sizes — backend mirror of
 * frontend/src/lib/sizeSort.ts. Kept identical on purpose (both sides must
 * agree on size ordering wherever a size-range label is computed).
 *
 * Ordering rules:
 *   1. Kids sizes (trailing "K"/"k") sort BEFORE adult sizes.
 *   2. Within each group, ascending by numeric value.
 *   3. Non-numeric sizes fall back to localeCompare.
 */
export function compareSizes(a: string, b: string): number {
  const trimA = a.trim();
  const trimB = b.trim();

  const isKidA = /k$/i.test(trimA);
  const isKidB = /k$/i.test(trimB);

  if (isKidA !== isKidB) return isKidA ? -1 : 1;

  const numA = parseFloat(trimA);
  const numB = parseFloat(trimB);

  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;

  return trimA.localeCompare(trimB);
}

export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort(compareSizes);
}

/**
 * Given the distinct sizes actually packed together (e.g. in one master
 * carton), returns the assortment range label: "6-10" for a span, or just
 * "8" when only one size is present. Empty input returns ''.
 */
export function assortmentRangeLabel(sizes: string[]): string {
  if (sizes.length === 0) return '';
  const sorted = sortSizes(sizes);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return min === max ? min : `${min}-${max}`;
}
