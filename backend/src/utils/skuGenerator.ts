import { query } from '../config/database';

/**
 * Generate SKU in format: {Section}-{ArticleName}-{Category}-{Serial}-{Colour}
 * e.g., HAWAII-BUSKER-GENTS-01-WHITE
 * Serial auto-increments per section+article+category+colour combo.
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

  // Count existing products with same section+article+category+colour to determine next serial
  const countResult = await query(
    `SELECT COUNT(*) FROM products
     WHERE UPPER(REPLACE(section, ' ', '-')) = $1
       AND UPPER(REPLACE(article_name, ' ', '-')) = $2
       AND UPPER(REPLACE(category, ' ', '-')) = $3
       AND UPPER(REPLACE(colour, ' ', '-')) = $4`,
    [normSection, normArticle, normCategory, normColour]
  );

  const serial = parseInt(countResult.rows[0].count, 10) + 1;
  const serialStr = String(serial).padStart(2, '0');

  return `${normSection}-${normArticle}-${normCategory}-${serialStr}-${normColour}`;
}
