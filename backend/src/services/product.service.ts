import { query } from '../config/database';
import { Product } from '../types';
import { ConflictError, NotFoundError } from '../utils/errors';
import { createAuditLog } from './auditLog.service';
import { CreateProductInput, UpdateProductInput } from '../models/schemas/product.schema';
import { logger } from '../utils/logger';

export async function createProduct(
  input: CreateProductInput,
  createdBy: string
): Promise<Product> {
  const existing = await query('SELECT id FROM products WHERE sku = $1', [input.sku]);
  if (existing.rows.length > 0) {
    throw new ConflictError(`Product with SKU ${input.sku} already exists`);
  }

  const result = await query(
    `INSERT INTO products (article_name, sku, article_code, colour, size, mrp, description, category, section, location, article_group, hsn_code, size_group)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      input.article_name, input.sku, input.article_code, input.colour, input.size, input.mrp, input.description || null,
      input.category || null, input.section || null, input.location || null,
      input.article_group || null, input.hsn_code || null, input.size_group || null,
    ]
  );

  const product: Product = result.rows[0];

  await createAuditLog({
    userId: createdBy,
    action: 'CREATE_PRODUCT',
    entityType: 'product',
    entityId: product.id,
    newValues: input as Record<string, unknown>,
  });

  logger.info(`Product created: ${input.article_name} (${input.sku})`);
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
  // First get the product to find its article_name and colour
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
