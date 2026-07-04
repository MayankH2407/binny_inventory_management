import { query } from '../config/database';

/**
 * Generate SKU in format: {Section}-{ArticleName}-{Category}-{Serial}-{Colour}
 * e.g., HAWAII-BUSKER-GENTS-01-WHITE
 * Serial auto-increments per section+article+category+colour combo.
 *
 * The serial is derived from the HIGHEST existing serial in the combo (+1), NOT
 * COUNT(*). Serials become non-contiguous whenever a product in the combo is
 * deleted (e.g. dedup merges / go-live cleanup), so COUNT+1 could land on a
 * serial that is still in use and collide with an existing SKU. Deriving from
 * the max (with a probe fallback) guarantees a free, monotonically-increasing
 * serial regardless of gaps.
 */
export async function generateSku(
  section: string,
  articleName: string,
  category: string,
  colour: string
): Promise<string> {
  const normSection = section.trim().toUpperCase().replace(/\s+/g, '-');
  const normArticle = articleName.trim().toUpperCase().replace(/\s+/g, '-');
  const normCategory = category.trim().toUpperCase().replace(/\s+/g, '-');
  const normColour = colour.trim().toUpperCase().replace(/\s+/g, '-');

  const prefix = `${normSection}-${normArticle}-${normCategory}-`;
  const suffix = `-${normColour}`;

  // Fetch existing SKUs for this exact combo. The serial is the segment between
  // the (section-article-category-) prefix and the (-colour) suffix; parsing by
  // strip is reliable even though article/colour may contain hyphens, because
  // all four components are known for this combo.
  const skusResult = await query(
    `SELECT sku FROM products
     WHERE UPPER(REPLACE(section, ' ', '-')) = $1
       AND UPPER(REPLACE(article_name, ' ', '-')) = $2
       AND UPPER(REPLACE(category, ' ', '-')) = $3
       AND UPPER(REPLACE(colour, ' ', '-')) = $4`,
    [normSection, normArticle, normCategory, normColour]
  );

  const taken = new Set<string>(skusResult.rows.map((r) => r.sku as string));
  let maxSerial = 0;
  for (const s of taken) {
    if (s.startsWith(prefix) && s.endsWith(suffix)) {
      const n = parseInt(s.slice(prefix.length, s.length - suffix.length), 10);
      if (!isNaN(n) && n > maxSerial) maxSerial = n;
    }
  }

  // max+1, then probe upward for the first free SKU (belt-and-braces).
  let serial = maxSerial + 1;
  let sku = `${prefix}${String(serial).padStart(2, '0')}${suffix}`;
  while (taken.has(sku)) {
    serial += 1;
    sku = `${prefix}${String(serial).padStart(2, '0')}${suffix}`;
  }
  return sku;
}
