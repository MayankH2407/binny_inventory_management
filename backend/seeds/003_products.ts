import { PoolClient } from 'pg';

interface ProductDefinition {
  articleName: string;
  articleCode: string;
  colour: string;
  colourCode: string;
  size: string;
  mrp: number;
  description: string;
}

// Generate a curated list of 20 products with realistic combinations
function generateProducts(): ProductDefinition[] {
  const products: ProductDefinition[] = [
    // Leather Sandal variants
    { articleName: 'Leather Sandal', articleCode: 'LS01', colour: 'Black', colourCode: 'BLK', size: '8', mrp: 1499, description: 'Premium leather sandal for daily wear' },
    { articleName: 'Leather Sandal', articleCode: 'LS01', colour: 'Brown', colourCode: 'BRN', size: '9', mrp: 1499, description: 'Premium leather sandal for daily wear' },
    { articleName: 'Leather Sandal', articleCode: 'LS01', colour: 'Tan', colourCode: 'TAN', size: '10', mrp: 1499, description: 'Premium leather sandal for daily wear' },
    // Sports Shoe variants
    { articleName: 'Sports Shoe', articleCode: 'SS01', colour: 'Black', colourCode: 'BLK', size: '7', mrp: 2499, description: 'Lightweight sports shoe with cushioned sole' },
    { articleName: 'Sports Shoe', articleCode: 'SS01', colour: 'White', colourCode: 'WHT', size: '8', mrp: 2499, description: 'Lightweight sports shoe with cushioned sole' },
    { articleName: 'Sports Shoe', articleCode: 'SS01', colour: 'Blue', colourCode: 'BLU', size: '9', mrp: 2499, description: 'Lightweight sports shoe with cushioned sole' },
    // Formal Shoe variants
    { articleName: 'Formal Shoe', articleCode: 'FS01', colour: 'Black', colourCode: 'BLK', size: '8', mrp: 2999, description: 'Classic formal shoe for office and events' },
    { articleName: 'Formal Shoe', articleCode: 'FS01', colour: 'Brown', colourCode: 'BRN', size: '9', mrp: 2999, description: 'Classic formal shoe for office and events' },
    { articleName: 'Formal Shoe', articleCode: 'FS01', colour: 'Tan', colourCode: 'TAN', size: '10', mrp: 2999, description: 'Classic formal shoe for office and events' },
    // Casual Slipper variants
    { articleName: 'Casual Slipper', articleCode: 'CS01', colour: 'Black', colourCode: 'BLK', size: '7', mrp: 499, description: 'Comfortable casual slipper for home and outdoor' },
    { articleName: 'Casual Slipper', articleCode: 'CS01', colour: 'Brown', colourCode: 'BRN', size: '8', mrp: 499, description: 'Comfortable casual slipper for home and outdoor' },
    { articleName: 'Casual Slipper', articleCode: 'CS01', colour: 'Blue', colourCode: 'BLU', size: '9', mrp: 499, description: 'Comfortable casual slipper for home and outdoor' },
    // Floater Sandal variants
    { articleName: 'Floater Sandal', articleCode: 'FL01', colour: 'Black', colourCode: 'BLK', size: '8', mrp: 899, description: 'Durable floater sandal for rough use' },
    { articleName: 'Floater Sandal', articleCode: 'FL01', colour: 'Brown', colourCode: 'BRN', size: '10', mrp: 899, description: 'Durable floater sandal for rough use' },
    // Loafer variants
    { articleName: 'Loafer', articleCode: 'LF01', colour: 'Black', colourCode: 'BLK', size: '9', mrp: 1999, description: 'Stylish loafer for semi-formal occasions' },
    { articleName: 'Loafer', articleCode: 'LF01', colour: 'Tan', colourCode: 'TAN', size: '8', mrp: 1999, description: 'Stylish loafer for semi-formal occasions' },
    // Canvas Shoe variants
    { articleName: 'Canvas Shoe', articleCode: 'CV01', colour: 'White', colourCode: 'WHT', size: '7', mrp: 1299, description: 'Trendy canvas shoe for casual outings' },
    { articleName: 'Canvas Shoe', articleCode: 'CV01', colour: 'Blue', colourCode: 'BLU', size: '8', mrp: 1299, description: 'Trendy canvas shoe for casual outings' },
    { articleName: 'Canvas Shoe', articleCode: 'CV01', colour: 'Red', colourCode: 'RED', size: '9', mrp: 1299, description: 'Trendy canvas shoe for casual outings' },
    // Flip Flop variant
    { articleName: 'Flip Flop', articleCode: 'FF01', colour: 'Black', colourCode: 'BLK', size: '8', mrp: 299, description: 'Lightweight flip flop for everyday comfort' },
  ];

  return products;
}

function buildSku(articleCode: string, colourCode: string, size: string): string {
  const paddedSize = size.padStart(2, '0');
  return `BF-${articleCode}-${colourCode}-${paddedSize}`;
}

export async function seedProducts(client: PoolClient): Promise<void> {
  console.log('Seeding products...');

  const products = generateProducts();
  let created = 0;
  let skipped = 0;

  for (const product of products) {
    const sku = buildSku(product.articleCode, product.colourCode, product.size);

    const existing = await client.query('SELECT id FROM products WHERE sku = $1', [sku]);

    if (existing.rows.length > 0) {
      skipped++;
      continue;
    }

    await client.query(
      `INSERT INTO products (sku, article_name, article_code, colour, size, mrp, description, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        sku,
        product.articleName,
        product.articleCode,
        product.colour,
        product.size,
        product.mrp,
        product.description,
        true,
      ]
    );
    created++;
    console.log(`  Created product: ${sku} - ${product.articleName} (${product.colour}, Size ${product.size})`);
  }

  console.log(`Products seeded: ${created} created, ${skipped} already existed.`);
}
