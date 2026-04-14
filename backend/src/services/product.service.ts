import { query } from '../config/database';
import { Product } from '../types';
import { ConflictError, NotFoundError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateProductInput, UpdateProductInput } from '../models/schemas/product.schema';
import { logger } from '../utils/logger';
import { generateSku } from '../utils/skuGenerator';
import { parse } from 'csv-parse/sync';

export async function createProduct(
  input: CreateProductInput,
  createdBy: string
): Promise<Product> {
  const sku = await generateSku(input.section, input.article_name, input.category, input.colour);

  const existing = await query('SELECT id FROM products WHERE sku = $1', [sku]);
  if (existing.rows.length > 0) {
    throw new ConflictError(`Product with SKU ${sku} already exists`);
  }

  const result = await query(
    `INSERT INTO products (article_name, sku, article_code, colour, size, mrp, description, category, section, location, article_group, hsn_code, size_group)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      input.article_name, sku, input.article_code, input.colour, input.size, input.mrp, input.description || null,
      input.category, input.section, input.location || null,
      input.article_group || null, input.hsn_code || null, input.size_group || null,
    ]
  );

  const product: Product = result.rows[0];

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_PRODUCT',
    entityType: 'product',
    entityId: product.id,
    newValues: { ...input, sku } as Record<string, unknown>,
  });

  logger.info(`Product created: ${input.article_name} (${sku})`);
  return product;
}

export async function getProductById(id: string): Promise<Product> {
  const result = await query('SELECT * FROM products WHERE id = $1', [id]);
  if (result.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }
  return result.rows[0];
}

export async function getProducts(
  filters: {
    article_code?: string;
    search?: string;
    is_active?: boolean;
    category?: string;
    section?: string;
    location?: string;
    colour?: string;
    size?: string;
    article_name?: string;
    article_group?: string;
  },
  page: number = 1,
  limit: number = 25
): Promise<{ data: Product[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.article_code) {
    conditions.push(`article_code = $${paramIndex++}`);
    values.push(filters.article_code);
  }
  if (filters.is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex++}`);
    values.push(filters.is_active);
  }
  if (filters.category) {
    conditions.push(`category = $${paramIndex++}`);
    values.push(filters.category);
  }
  if (filters.section) {
    conditions.push(`section = $${paramIndex++}`);
    values.push(filters.section);
  }
  if (filters.location) {
    conditions.push(`location = $${paramIndex++}`);
    values.push(filters.location);
  }
  if (filters.colour) {
    conditions.push(`colour ILIKE $${paramIndex++}`);
    values.push(`%${filters.colour}%`);
  }
  if (filters.size) {
    conditions.push(`size = $${paramIndex++}`);
    values.push(filters.size);
  }
  if (filters.article_name) {
    conditions.push(`article_name ILIKE $${paramIndex++}`);
    values.push(`%${filters.article_name}%`);
  }
  if (filters.article_group) {
    conditions.push(`article_group ILIKE $${paramIndex++}`);
    values.push(`%${filters.article_group}%`);
  }
  if (filters.search) {
    conditions.push(`(article_name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR article_code ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM products ${whereClause}`, values);
  const total = parseInt(countResult.rows[0].count, 10);

  const offset = (page - 1) * limit;
  values.push(limit, offset);

  const result = await query(
    `SELECT * FROM products ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    values
  );

  return { data: result.rows, total };
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
  updatedBy: string
): Promise<Product> {
  const existing = await query('SELECT * FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }

  const oldProduct: Product = existing.rows[0];

  if (input.sku && input.sku !== oldProduct.sku) {
    const skuCheck = await query('SELECT id FROM products WHERE sku = $1 AND id != $2', [input.sku, id]);
    if (skuCheck.rows.length > 0) {
      throw new ConflictError(`Product with SKU ${input.sku} already exists`);
    }
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const updateableFields: (keyof UpdateProductInput)[] = [
    'article_name', 'sku', 'article_code', 'colour', 'size', 'mrp', 'description', 'is_active',
    'category', 'section', 'location', 'article_group', 'hsn_code', 'size_group',
  ];

  for (const field of updateableFields) {
    if (input[field] !== undefined) {
      fields.push(`${field} = $${paramIndex++}`);
      values.push(input[field]);
    }
  }

  if (fields.length === 0) {
    return oldProduct;
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  await createAuditLog({
    userId: updatedBy,
    action: 'UPDATE_PRODUCT',
    entityType: 'product',
    entityId: id,
    oldValues: oldProduct as unknown as Record<string, unknown>,
    newValues: input as Record<string, unknown>,
  });

  return result.rows[0];
}

export async function deleteProduct(id: string, deletedBy: string): Promise<void> {
  const existing = await query('SELECT id, article_name FROM products WHERE id = $1', [id]);
  if (existing.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }

  await query('UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);

  await createAuditLog({
    userId: deletedBy,
    action: 'DELETE_PRODUCT',
    entityType: 'product',
    entityId: id,
  });

  logger.info(`Product deactivated: ${existing.rows[0].article_name}`);
}

export async function getSiblingProducts(productId: string): Promise<Product[]> {
  const productResult = await query('SELECT article_name, colour FROM products WHERE id = $1 AND is_active = true', [productId]);
  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }
  const { article_name, colour } = productResult.rows[0];

  const result = await query(
    `SELECT * FROM products WHERE article_name = $1 AND colour = $2 AND is_active = true ORDER BY size`,
    [article_name, colour]
  );
  return result.rows;
}

export async function getColoursByProduct(productId: string): Promise<{ colour: string; product_id: string }[]> {
  const productResult = await query('SELECT article_name FROM products WHERE id = $1 AND is_active = true', [productId]);
  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }
  const { article_name } = productResult.rows[0];

  const result = await query(
    `SELECT DISTINCT ON (colour) colour, id as product_id
     FROM products
     WHERE article_name = $1 AND is_active = true
     ORDER BY colour`,
    [article_name]
  );
  return result.rows;
}

export async function updateProductImage(
  productId: string,
  imageUrl: string,
  updatedBy: string
): Promise<void> {
  const productResult = await query('SELECT article_code, colour FROM products WHERE id = $1', [productId]);
  if (productResult.rows.length === 0) {
    throw new NotFoundError('Product not found');
  }
  const { article_code, colour } = productResult.rows[0];

  await query(
    'UPDATE products SET image_url = $1, updated_at = NOW() WHERE article_code = $2 AND colour = $3',
    [imageUrl, article_code, colour]
  );

  await createAuditLog({
    userId: updatedBy,
    action: 'UPDATE_PRODUCT_IMAGE',
    entityType: 'product',
    entityId: productId,
    newValues: { image_url: imageUrl, article_code, colour },
  });

  logger.info(`Product image updated for article ${article_code} / ${colour}`);
}

const VALID_CATEGORIES = ['Gents', 'Ladies', 'Boys', 'Girls'];
const VALID_LOCATIONS = ['VKIA', 'MIA', 'F540'];

interface BulkRowResult {
  row: number;
  status: 'success' | 'error';
  sku?: string;
  article_name?: string;
  error?: string;
}

export async function bulkCreateProducts(
  csvBuffer: Buffer,
  createdBy: string
): Promise<{ created: number; errors: BulkRowResult[] }> {
  let records: Record<string, string>[];
  try {
    records = parse(csvBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch {
    throw new ConflictError('Invalid CSV format. Please ensure the file is a valid CSV with headers.');
  }

  if (records.length === 0) {
    throw new ConflictError('CSV file is empty. Please add product rows below the header.');
  }

  if (records.length > 500) {
    throw new ConflictError(`CSV contains ${records.length} rows. Maximum allowed is 500 per upload.`);
  }

  const requiredCols = ['article_code', 'article_name', 'colour', 'size', 'mrp', 'section', 'category'];
  const headerKeys = Object.keys(records[0]).map((h) => h.toLowerCase().trim());
  const missingCols = requiredCols.filter((c) => !headerKeys.includes(c));
  if (missingCols.length > 0) {
    throw new ConflictError(`Missing required columns: ${missingCols.join(', ')}. Download the sample file for reference.`);
  }

  const results: BulkRowResult[] = [];
  let created = 0;

  for (let i = 0; i < records.length; i++) {
    const raw = records[i];
    const rowNum = i + 2; // +2 because row 1 is header, data starts at 2

    // Normalize keys to lowercase
    const row: Record<string, string> = {};
    for (const [key, val] of Object.entries(raw)) {
      row[key.toLowerCase().trim()] = val;
    }

    // Validate required fields
    const errors: string[] = [];
    if (!row.article_code?.trim()) errors.push('article_code is empty');
    if (!row.article_name?.trim()) errors.push('article_name is empty');
    if (!row.colour?.trim()) errors.push('colour is empty');
    if (!row.size?.trim()) errors.push('size is empty');
    if (!row.section?.trim()) errors.push('section is empty');
    if (!row.category?.trim()) errors.push('category is empty');

    const mrp = parseFloat(row.mrp);
    if (!row.mrp?.trim() || isNaN(mrp) || mrp <= 0) {
      errors.push('mrp must be a positive number');
    }

    if (row.article_code && row.article_code.trim().length > 20) {
      errors.push('article_code exceeds 20 characters');
    }

    if (row.category?.trim() && !VALID_CATEGORIES.includes(row.category.trim())) {
      errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }

    if (row.location?.trim() && !VALID_LOCATIONS.includes(row.location.trim())) {
      errors.push(`location must be one of: ${VALID_LOCATIONS.join(', ')}`);
    }

    if (errors.length > 0) {
      results.push({ row: rowNum, status: 'error', article_name: row.article_name, error: errors.join('; ') });
      continue;
    }

    try {
      const sku = await generateSku(row.section.trim(), row.article_name.trim(), row.category.trim(), row.colour.trim());

      const existing = await query('SELECT id FROM products WHERE sku = $1', [sku]);
      if (existing.rows.length > 0) {
        results.push({ row: rowNum, status: 'error', sku, article_name: row.article_name.trim(), error: `Duplicate SKU: ${sku} already exists` });
        continue;
      }

      await query(
        `INSERT INTO products (article_name, sku, article_code, colour, size, mrp, description, category, section, location, article_group, hsn_code, size_group)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          row.article_name.trim(), sku, row.article_code.trim(), row.colour.trim(),
          row.size.trim(), mrp, row.description?.trim() || null,
          row.category.trim(), row.section.trim(), row.location?.trim() || null,
          row.article_group?.trim() || null, row.hsn_code?.trim() || null,
          row.size_group?.trim() || null,
        ]
      );

      await createAuditLog({
        userId: createdBy,
        action: 'CREATE_PRODUCT',
        entityType: 'product',
        entityId: sku,
        newValues: { sku, article_name: row.article_name.trim(), source: 'csv_bulk_upload' },
      });

      results.push({ row: rowNum, status: 'success', sku, article_name: row.article_name.trim() });
      created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      results.push({ row: rowNum, status: 'error', article_name: row.article_name?.trim(), error: message });
    }
  }

  logger.info(`Bulk product upload: ${created} created, ${results.filter((r) => r.status === 'error').length} errors`);
  return { created, errors: results.filter((r) => r.status === 'error') };
}
